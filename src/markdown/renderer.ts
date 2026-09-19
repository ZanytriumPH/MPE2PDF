/**
 * renderer.ts — Markdown 渲染引擎（移植自 myBlog scripts/md.js）
 *
 * 在 markdown-it 基础上扩展自定义语法：
 *   1. `==文本==`          → <mark> 荧光笔高亮
 *   2. `> [!note] 标题`    → MPE 风格提示框 (callout)
 *   3. `$..$` / `$$..$$`   → MathJax 公式（输出 \(..\) / \[..\] 分隔符，运行时渲染）
 *   4. ```mermaid          → 原样输出，客户端 mermaid.js 渲染
 *   5. ```plantuml         → PlantUML 同步渲染为 SVG（data URI 内联）
 *
 * 与博客的两处差异（面向 PDF 导出）：
 *   - 图片不注入 loading="lazy"（导出需确定性加载）
 *   - 图片 src 按 env.baseUri 改写为可加载的绝对 URL（博客使用站点根路径）
 */

import MarkdownIt from 'markdown-it';
import markdownItMark from 'markdown-it-mark';
import hljs from 'highlight.js';
import { PlantUMLRendererLike, plantumlFallbackHtml } from '../plantuml';

/** 渲染环境：由导出流程注入（Phase 3 提供 HTTP 服务 baseUri） */
export interface RenderEnv {
  /** 资源根 URL（以 / 结尾，如 http://127.0.0.1:8080/）；图片相对/根路径据此解析 */
  baseUri?: string;
  /** 标题锚点去重集合（跨渲染调用保持唯一） */
  usedSlugs?: Set<string>;
  /** PlantUML 渲染器（未配置时 plantuml 块降级为源码+提示） */
  puml?: PlantUMLRendererLike;
}

/** 支持的提示框类型（与 MPE / GitHub alerts 兼容） */
export const CALLOUT_TYPES = [
  'note', 'info', 'tip', 'success',
  'question', 'warning', 'example', 'quote', 'important',
  'bug', 'fail',
] as const;

/** 各类型提示框的图标（内联 SVG，feather 风格，stroke 随标题色 currentColor 渲染） */
const CALLOUT_ICONS: Record<string, string> = {
  note: svgIcon('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>'), // 铅笔
  info: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  tip: svgIcon('<path d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>'), // 灯泡
  success: svgIcon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>'), // 对勾圆
  question: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  warning: svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'), // 三角叹号
  example: svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'), // 剪贴板
  quote: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'), // 对话气泡
  important: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'), // 圆形叹号
  bug: svgIcon('<path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'), // 虫子
  fail: svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'), // 叉
};

/** 组装 feather 风格的内联 SVG（24×24，stroke 随 currentColor） */
function svgIcon(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** 为标题生成带序号防重复的锚点 id（保留中文） */
export function slugify(text: string, used: Set<string>): string {
  let slug = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) slug = 'section';
  let unique = slug, n = 2;
  while (used.has(unique)) unique = `${slug}-${n++}`;
  used.add(unique);
  return unique;
}

/**
 * 图片 src 解析：外部/内嵌资源（http/https/data/file/blob）原样保留；
 * 相对路径与根路径（博客惯例 `/assets/...`）统一映射到 baseUri 下
 * （服务根 = md 所在目录）。路径段逐个编码，兼容中文/空格。
 *
 * 注意：markdown-it 对 `<...>` 包裹的目标已做过百分号编码（如 %E5%9B%BE），
 * 此处必须保留既有 %XX 序列，只编码剩余的不安全字符，避免双重编码。
 */
function encodePathSegment(seg: string): string {
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '%' && /^[0-9a-fA-F]{2}$/.test(seg.slice(i + 1, i + 3))) {
      out += seg.slice(i, i + 3); // 保留 markdown-it 已转义序列
      i += 2;
      continue;
    }
    out += encodeURIComponent(c);
  }
  return out;
}

export function resolveImageSrc(src: string, baseUri: string): string {
  if (/^(https?:|data:|file:|blob:)/i.test(src)) return src;
  const clean = src.replace(/^\/+/, '');
  const encoded = clean.split('/').map(encodePathSegment).join('/');
  return `${baseUri.replace(/\/?$/, '/')}${encoded}`;
}

/**
 * 创建 markdown-it 实例（默认 env 用于渲染器规则回退，渲染时再传入实际 env）
 */
export function createMd(env: RenderEnv = {}): MarkdownIt {
  const md = new MarkdownIt({
    html: false, // 与博客一致：不解析原始 HTML
    linkify: true,
    typographer: true,
    highlight: (code, lang) => {
      if (!lang || !hljs.getLanguage(lang)) return '';
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        return '';
      }
    },
  });

  // === 1. ==荧光笔高亮==：markdown-it-mark 官方插件 ===
  md.use(markdownItMark);

  // === 2. MPE 风格提示框：> [!note] ===
  // 拦截 blockquote，检测首行 `[!type]` 标记，转换为 callout 容器。
  // 必须挂在 'inline' 规则之后——此时段落 token 的 children 已生成
  md.core.ruler.after('inline', 'callout', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;

      // 找到配对关闭 token
      let depth = 0, close = -1;
      for (let j = i; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        else if (tokens[j].type === 'blockquote_close') {
          depth--;
          if (depth === 0) { close = j; break; }
        }
      }
      if (close === -1) continue;

      // 内容第一段（blockquote 多行会合并为一个段落，以 softbreak 分隔）
      // 用整段第一行做正则匹配——行内格式（如 **粗体**）会被拆成多个 token，不能只看首个 text
      const inner = i + 1;
      const para = tokens[inner];
      if (!para || para.type !== 'paragraph_open') continue;
      const inlineTok = tokens[inner + 1];
      if (!inlineTok || inlineTok.type !== 'inline' || !inlineTok.children) continue;

      const firstLine = inlineTok.content.split('\n')[0];
      const m = firstLine.match(/^\[!(note|info|tip|success|question|warning|example|quote|important|bug|fail)\](?:\s+(.*))?$/i);
      if (!m) continue;

      const type = m[1].toLowerCase();
      const title = (m[2] || '').trim();

      // 转换块级 token：blockquote → callout div
      tokens[i] = new state.Token('callout_open', 'div', 1);
      tokens[i].attrs = [['class', `callout callout-${type}`]];
      tokens[close] = new state.Token('callout_close', 'div', -1);

      // 重组正文段落：丢弃标题标记行及其后的 softbreak，保留剩余正文
      const sb = inlineTok.children.findIndex(t => t.type === 'softbreak');
      if (sb !== -1) {
        inlineTok.children = inlineTok.children.slice(sb + 1);
      } else {
        // 只有标题没有正文：删除空段落
        tokens.splice(inner, 3);
      }

      if (title) {
        // `> [!note] 标题`：在段落前插入标题行（标题内可含 Markdown 格式）
        const titleOpen = new state.Token('callout_title_open', 'div', 1);
        titleOpen.attrs = [['class', 'callout-title']];
        const titleInline = new state.Token('inline', '', 0);
        // 图标以 html_inline token 原样注入（SVG），标题本身正常走 Markdown 解析
        const parsedTitle = state.md.parseInline(title, state.env);
        const iconToken = new state.Token('html_inline', '', 0);
        iconToken.content = CALLOUT_ICONS[type] || CALLOUT_ICONS.note;
        parsedTitle[0].children!.unshift(iconToken);
        titleInline.children = parsedTitle[0].children;
        const titleClose = new state.Token('callout_title_close', 'div', -1);
        tokens.splice(inner, 0, titleOpen, titleInline, titleClose);
      }
    }
  });

  // === 2.5 独占段落的图片：标记 img-center 类（print.css 据此居中） ===
  // 仅当段落的有效内容恰为一个图片（可被链接包裹、可含空白文本）时标记；
  // 行文中的行内小图、表格单元格内的图片不受影响（:only-child 数不到文本节点，
  // 纯 CSS 无法区分"独占段落"与"行内图"，故在 token 层判断）
  md.core.ruler.after('inline', 'img_center', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'paragraph_open') continue;
      const inlineTok = tokens[i + 1];
      if (!inlineTok || inlineTok.type !== 'inline' || !inlineTok.children) continue;
      const children = inlineTok.children.filter(
        (t) => !(t.type === 'text' && !t.content.trim()) && t.type !== 'softbreak'
      );
      const isImgPara =
        (children.length === 1 && children[0].type === 'image') ||
        (children.length === 3 &&
          children[0].type === 'link_open' &&
          children[1].type === 'image' &&
          children[2].type === 'link_close');
      if (isImgPara) {
        const attrs = tokens[i].attrs || (tokens[i].attrs = []);
        attrs.push(['class', 'img-center']);
      }
    }
  });

  // === 3. MathJax 公式：$...$ 行内 / $$...$$ 块级 ===
  // 公式内容直接作为原文输出（不经过 Markdown 解析，避免 `_`/`*` 被误判），
  // 由运行时 MathJax 渲染成 SVG。挂在 escape 之前，`\$` 转义优先。
  //
  // 定界符与公式之间的空格/换行是容忍的（MPE 兼容），内容首尾空白去除：
  //   - "$ x $" / "$$ x $$" / "$ x$" 均按公式渲染；
  //   - 单 $ 紧凑形式（$x$）闭合不跨行（避免同行货币符号误配对）；
  //     宽松形式（$ 后是空格/换行）允许跨行寻找闭合 $（限同一段落内）；
  //   - 无闭合 $ 时视为普通文本（货币 "$ 100" 不受影响）。
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src[start] !== '$') return false;

    // === $$ 块级公式（段落/表格单元格中被 paragraph 吞并的情形） ===
    // 行首的 $$ 已由 block 规则处理；此处覆盖「段落文字\n$$E = mc^2$$」、
    // 表格单元格「$$ ... $$」等——否则 $$ 会被拆成 $ + 行内公式 + $ 残留。
    // 输出块级 div（html_inline 原样注入），浏览器解析时自动纠正为独立块。
    if (src[start + 1] === '$') {
      if (src[start + 2] === '$') return false; // $$$：非公式
      let j = start + 2;
      let closed = -1;
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; } // 跳过转义序列
        if (c === '$' && src[j + 1] === '$') { closed = j; break; }
        j++;
      }
      if (closed === -1) return false;
      const content = src.slice(start + 2, closed).trim();
      if (!content) return false;
      if (silent) return true;

      state.pos = start + 2;
      const token = state.push('html_inline', '', 0);
      token.content = `<div class="math-block">\\[${content}\\]</div>`;
      state.pos = closed + 2;
      return true;
    }

    // === $ 行内公式 ===
    const spaced = src[start + 1] === ' ' || src[start + 1] === '\n';
    let j = start + 1;
    let closed = -1;
    while (j < src.length) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; } // 跳过转义序列
      if (c === '$') { closed = j; break; }
      if (!spaced && c === '\n') return false; // 紧凑形式不跨行
      j++;
    }
    if (closed === -1) return false;
    const content = src.slice(start + 1, closed).trim();
    if (!content) return false;
    if (silent) return true;

    state.pos = start + 1;
    const token = state.push('math_inline', 'span', 0);
    token.content = content;
    state.pos = closed + 1;
    return true;
  });

  // === 3.5 <br> 标签：html:false 时 markdown-it 会转义成字面文本 ===
  // 笔记常在表格单元格/公式之间用 <br> 换行，统一转为硬换行（不区分大小写，兼容 <br/>）
  md.inline.ruler.before('escape', 'html_br', (state, silent) => {
    const m = state.src.slice(state.pos, state.pos + 8).match(/^<br\s*\/?>/i);
    if (!m) return false;
    if (silent) return true;
    state.pos += m[0].length;
    state.push('hardbreak', 'br', 0);
    return true;
  });

  md.block.ruler.before('paragraph', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(start, start + 2) !== '$$') return false;
    if (silent) return true;

    // 在 startLine..endLine 范围内查找闭合 $$
    let closePos = -1, closeLine = -1;
    for (let l = startLine; l < endLine && closePos === -1; l++) {
      const from = l === startLine ? start + 2 : state.bMarks[l] + state.tShift[l];
      const idx = state.src.indexOf('$$', from);
      if (idx !== -1 && idx < state.eMarks[l]) { closePos = idx; closeLine = l; }
    }
    if (closePos === -1) return false;

    const token = state.push('math_block', 'div', 0);
    token.content = state.src.slice(start + 2, closePos);
    state.line = closeLine + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => `\\(${tokens[idx].content}\\)`;
  md.renderer.rules.math_block = (tokens, idx) => `<div class="math-block">\\[${tokens[idx].content}\\]</div>\n`;

  // === 4. Mermaid 图：fence 块原样输出，由客户端 mermaid.js 渲染 ===
  // === 5. PlantUML：fence 块同步渲染为 SVG（data URI 内联），失败/未配置时降级 ===
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env2, self) => {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();
    if (info === 'mermaid') {
      // 原样输出（不转义），mermaid.js 按 pre.mermaid 渲染为 SVG
      return `<pre class="mermaid">${token.content}</pre>\n`;
    }
    if (info !== 'plantuml') {
      return defaultFence!(tokens, idx, options, env2, self);
    }
    const puml = env2.puml || env.puml;
    if (!puml || !puml.available()) return plantumlFallbackHtml(token.content);
    try {
      const svg = puml.renderSync(token.content);
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
      // 与博客构建产物的结构一致（figure + img，由 .plantuml-figure img 样式接管）
      return `<figure class="plantuml-figure"><img src="${dataUri}" alt="PlantUML 图"></figure>\n`;
    } catch {
      return plantumlFallbackHtml(token.content);
    }
  };

  // === 6. 图片：不注入懒加载，src 改写为 baseUri 下的可加载 URL ===
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env2, self) => {
    const token = tokens[idx];
    const srcAttr = token.attrIndex('src');
    const base = env2.baseUri ?? env.baseUri;
    if (srcAttr !== -1 && base) {
      token.attrs![srcAttr][1] = resolveImageSrc(token.attrs![srcAttr][1], base);
    }
    return defaultImage!(tokens, idx, options, env2, self);
  };

  // === 标题锚点：自动添加 id（用于 TOC 跳转） ===
  // 注意：heading_open 不在 markdown-it 默认 rules 表里，需回退到 renderToken（与博客一致）
  const headingOpen = md.renderer.rules.heading_open ||
    ((tokens, idx, options, env2, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.heading_open = (tokens, idx, options, env2, self) => {
    const token = tokens[idx];
    const inline = tokens[idx + 1];
    const text = inline ? inline.content : '';
    const usedSlugs = env2.usedSlugs || env.usedSlugs || (env.usedSlugs = new Set());
    const id = slugify(text, usedSlugs);
    token.attrs = token.attrs || [];
    token.attrs.push(['id', id]);
    return headingOpen!(tokens, idx, options, env2, self);
  };

  return md;
}
