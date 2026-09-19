/**
 * template.ts — PDF 页面组装（移植自 myBlog scripts/templates.js 的 postPage）
 *
 * 结构对齐博客文章页：post-header（标题 + 日期 + 标签）→ 正文（markdown-body）
 * → 目录（toc，默认显示）。去掉了博客的导航/页脚/评论/上下篇等网页元素。
 *
 * 资源（print.css/hljs.css/mathjax/mermaid）经 assetsPrefix 前缀引用，
 * Phase 3 的本地 HTTP 服务将其映射到扩展 resources/ 目录。
 */

import matter from 'gray-matter';

/** HTML 转义 */
export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO 日期（YYYY-MM-DD）→ 中文日期文案（与博客 dateText 一致） */
export function dateText(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

export interface FrontMatter {
  title: string;
  /** ISO 日期（YYYY-MM-DD） */
  dateIso: string;
  /** 中文日期文案 */
  dateText: string;
  tags: string[];
  /** 去除 front matter 后的 Markdown 正文 */
  content: string;
}

/** 解析 front matter；无 date 时回退为文件修改时间（本地日期，避免时区跨天） */
export function parseFrontMatter(raw: string, mtimeMs?: number): FrontMatter {
  const { data, content } = matter(raw);
  let iso: string;
  if (data.date) {
    iso = new Date(data.date).toISOString().slice(0, 10);
  } else if (mtimeMs) {
    const d = new Date(mtimeMs);
    iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else {
    iso = '1970-01-01';
  }
  return {
    title: typeof data.title === 'string' ? data.title : '',
    dateIso: iso,
    dateText: dateText(iso),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
    content,
  };
}

/** 从渲染后的 HTML 提取首个 h1 文本（无 front matter 标题时的回退） */
export function extractFirstH1(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return '';
  return m[1].replace(/<[^>]*>/g, '').trim();
}

/** 移除渲染后 HTML 中的首个 h1 元素（该标题已被用作页面标题时避免重复出现） */
export function stripFirstH1(html: string): string {
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\n?/, '');
}

export interface PageOptions {
  title: string;
  /** 渲染后的正文 HTML */
  html: string;
  /** buildToc 输出；为空则不出目录 */
  toc: string;
  theme: 'light' | 'dark';
  /** 正文字号（px）；设置后覆盖根字号，标题等 rem 尺寸联动缩放 */
  fontSize?: number;
  /** 用户覆盖 CSS 的完整 URL（mpe2pdf.cssOverride 解析成功时传入） */
  cssOverrideHref?: string;
  includeToc: boolean;
  /** 标题下方分隔线；false 时 body 挂 no-heading-rule 由 CSS 去线 */
  headingRule: boolean;
  /** 资源 URL 前缀（Phase 3 为 http 服务的 /__mpe2pdf__/），以 / 结尾 */
  assetsPrefix: string;
}

/** 组装完整 PDF 页面 HTML */
export function renderPage(opts: PageOptions): string {
  const { title, html, toc, theme, fontSize, cssOverrideHref, includeToc, headingRule, assetsPrefix } = opts;
  const hljs = theme === 'dark' ? 'hljs-dark.css' : 'hljs.css';
  const bodyClass = headingRule ? '' : ' class="no-heading-rule"';
  // 根字号是全部 rem 尺寸（标题/正文/小字号文案）的基准，改 html 即整体等比缩放；
  // body 的 px 基准同步覆盖，保证 em 相对单位（如代码 0.9em）一致
  const fontCss = fontSize !== undefined && Number.isFinite(fontSize) && fontSize > 0
    ? `<style>html { font-size: ${fontSize}px; } body { font-size: ${fontSize}px; }</style>`
    : '';
  const overrideLink = cssOverrideHref
    ? `<link rel="stylesheet" href="${cssOverrideHref}">`
    : '';

  const tocNav = includeToc && toc
    ? `<nav class="toc">
      <div class="toc-title">目录</div>
      <div class="page-title">${esc(title)}</div>
      <ul>${toc}</ul>
    </nav>`
    : '';

  // 与博客一致的等待脚本：mermaid 逐图渲染（明暗主题对应 mermaid theme）、
  // MathJax 等排版完成，全部就绪后置 window.__renderReady 供导出流程等待。
  // 注意：页面无图片懒加载，图片由导出流程额外等待 complete。
  const readyScript = `
<script>
(async () => {
  const errors = [];
  try {
    if (window.mermaid) {
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
      let counter = 0;
      for (const pre of [...document.querySelectorAll('pre.mermaid')]) {
        try {
          const { svg } = await mermaid.render('mmd-' + (counter++), pre.textContent);
          const holder = document.createElement('div');
          holder.className = 'mermaid-svg';
          holder.innerHTML = svg;
          pre.replaceWith(holder);
        } catch (e) {
          const err = document.createElement('div');
          err.className = 'mermaid-error';
          err.textContent = '⚠️ Mermaid 渲染失败：' + e.message;
          pre.replaceWith(err);
          errors.push(e.message);
        }
      }
    }
    if (window.MathJax) {
      await MathJax.startup.promise;
      // 显式 typeset：配置已禁用自动 typeset（startup.typeset: false），
      // 避免与自动渲染并发触发 MathJax 3 的竞态（手动/自动并发会跳过渲染）
      await MathJax.typesetPromise();
    }
  } catch (e) {
    errors.push(e.message);
  }
  window.__renderReady = true;
  window.__renderErrors = errors;
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${assetsPrefix}print.css">
<link rel="stylesheet" href="${assetsPrefix}${hljs}">${fontCss}${overrideLink}
</head>
<body${bodyClass}>
<div class="post-wrap">
  <article class="post">
    <header class="post-header">
      <h1 class="post-title">${esc(title)}</h1>
    </header>
    <div class="post-body markdown-body">${html}</div>
  </article>
  ${tocNav}
</div>
<script>window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] }, startup: { typeset: false } };</script>
<script src="${assetsPrefix}vendor/mathjax/tex-svg.js"></script>
<script src="${assetsPrefix}vendor/mermaid/mermaid.min.js"></script>
${readyScript}
</body>
</html>`;
}
