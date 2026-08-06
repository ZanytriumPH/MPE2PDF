/**
 * renderer.test.ts — 渲染核心单元测试（node:test，零额外依赖）
 *
 * 覆盖：callout 九类型、math 行内/块级、mermaid 原样输出、plantuml 降级与内联、
 * 中文锚点去重、图片路径改写、代码高亮、html:false、TOC 提取。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMd, resolveImageSrc, slugify, RenderEnv, CALLOUT_TYPES } from '../src/markdown/renderer';
import { buildToc } from '../src/markdown/toc';
import { PlantUMLRenderer, plantumlFallbackHtml } from '../src/plantuml';

/** 便捷渲染：env 同时作为默认 env 与渲染 env（与导出流程一致） */
function render(src: string, env?: RenderEnv): string {
  return createMd(env).render(src, env);
}

describe('callout 提示框', () => {
  for (const type of CALLOUT_TYPES) {
    it(`渲染 [!${type}]`, () => {
      const html = render(`> [!${type}] ${type} 标题\n> 正文内容`);
      assert.ok(html.includes(`<div class="callout callout-${type}">`), '容器 class');
      assert.ok(html.includes('callout-title'), '标题行');
      assert.ok(html.includes('<svg'), '图标');
      assert.ok(html.includes(`${type} 标题`), '标题文本');
      assert.ok(html.includes('<p>正文内容</p>'), '正文保留');
    });
  }

  it('类型大小写不敏感', () => {
    const html = render('> [!NOTE] 大写标题\n> 内容');
    assert.ok(html.includes('callout callout-note'));
  });

  it('无标题时只渲染正文，不产生 callout-title', () => {
    const html = render('> [!info]\n> 只有正文');
    assert.ok(html.includes('<div class="callout callout-info">'));
    assert.ok(!html.includes('callout-title'), '无标题行');
    assert.ok(html.includes('<p>只有正文</p>'));
  });

  it('只有标题没有正文时删除空段落', () => {
    const html = render('> [!tip] 仅标题');
    assert.ok(html.includes('callout-title'));
    assert.ok(!html.includes('<p>'), '不残留空段落');
  });

  it('标题支持 Markdown 格式', () => {
    const html = render('> [!warning] **加粗**标题');
    assert.ok(html.includes('<strong>加粗</strong>标题'));
  });

  it('正文多行合并为一个段落（softbreak）', () => {
    const html = render('> [!note] 标题\n> 第一行\n> 第二行');
    assert.ok(html.includes('<p>第一行\n第二行</p>'));
  });

  it('多个 callout 依次渲染', () => {
    const html = render('> [!note] 甲\n> 内容一\n\n> [!tip] 乙\n> 内容二');
    assert.equal((html.match(/class="callout callout-/g) || []).length, 2);
  });

  it('普通引用块不受影响', () => {
    const html = render('> 普通引用');
    assert.ok(html.startsWith('<blockquote>'), '仍是 blockquote');
    assert.ok(!html.includes('callout'));
  });
});

describe('MathJax 公式', () => {
  it('行内公式 $..$ → \\(..\\)', () => {
    const html = render('公式 $x^2 + y^2$ 结束');
    assert.ok(html.includes('\\(x^2 + y^2\\)'));
  });

  it('公式内下划线不被误判为强调', () => {
    const html = render('$a_b$');
    assert.ok(html.includes('\\(a_b\\)'));
    assert.ok(!html.includes('<em>'), '不产生 em');
  });

  it('块级公式 $$..$$ → math-block', () => {
    const html = render('$$\nE = mc^2\n$$');
    assert.ok(html.includes('<div class="math-block">'));
    assert.ok(html.includes('E = mc^2'));
  });

  it('转义 \\$ 视为普通美元符号', () => {
    const html = render('价格 \\$5 元');
    assert.ok(html.includes('$5 元'));
    assert.ok(!html.includes('\\('), '不触发公式');
  });

  it('$ 后跟空格不视为公式', () => {
    const html = render('$ 5 dollars');
    assert.ok(html.includes('$ 5 dollars'));
    assert.ok(!html.includes('\\('));
  });

  it('行内公式不跨行', () => {
    const html = render('a $\nb');
    assert.ok(!html.includes('\\('));
  });

  it('段落后 $$...$$（无空行）渲染为块级，不残留美元符（回归 #1）', () => {
    const html = render('段落文字\n$$E = mc^2$$');
    assert.ok(html.includes('<div class="math-block">\\[E = mc^2\\]</div>'), html);
    assert.ok(!html.includes('$\\('), '不残留行内公式+美元符');
  });

  it('段内嵌 $$...$$ 渲染为块级（回归 #1）', () => {
    const html = render('这是 $$E = mc^2$$ 公式');
    assert.ok(html.includes('<div class="math-block">\\[E = mc^2\\]</div>'), html);
    assert.ok(!html.includes('$\\('));
  });

  it('$$ 后跟空格/文本（货币）不误判为公式', () => {
    const html = render('价格 $$5 元');
    assert.ok(html.includes('$$5 元'));
    assert.ok(!html.includes('math-block'));
  });

  it('跨行 $$...$$ 在段落后仍为块级', () => {
    const html = render('段落文字\n$$\nE = mc^2\n$$');
    assert.ok(html.includes('<div class="math-block">\\[\nE = mc^2\n\\]</div>'), html);
    assert.ok(!html.includes('$\\('));
  });
});

describe('==荧光笔高亮==', () => {
  it('渲染为 <mark>', () => {
    const html = render('这是 ==重点内容== 文本');
    assert.ok(html.includes('<mark>重点内容</mark>'));
  });
});

describe('Mermaid 围栏', () => {
  it('原样输出为 pre.mermaid（不转义，含围栏内容尾随换行）', () => {
    const html = render('```mermaid\nflowchart TD\n    A --> B\n```');
    assert.equal(html.trim(), '<pre class="mermaid">flowchart TD\n    A --> B\n</pre>');
  });
});

describe('PlantUML 围栏', () => {
  it('未配置渲染器时降级为源码 + 提示', () => {
    const html = render('```plantuml\nAlice -> Bob: hello\n```');
    assert.ok(html.includes('plantuml-fallback'));
    assert.ok(html.includes('plantuml-fallback-hint'));
    assert.ok(html.includes('Alice -&gt; Bob'), '源码转义保留');
  });

  it('配置渲染器后内联 data URI 图片', () => {
    const stub = {
      available: () => true,
      renderSync: () => '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>',
    };
    const html = render('```plantuml\nAlice -> Bob\n```', { puml: stub });
    assert.ok(html.includes('<figure class="plantuml-figure">'));
    assert.ok(html.includes('src="data:image/svg+xml;base64,'));
    assert.ok(html.includes('alt="PlantUML 图"'));
    assert.ok(!html.includes('plantuml-fallback'), '不降级');
  });

  it('渲染失败时降级', () => {
    const stub = {
      available: () => true,
      renderSync: () => { throw new Error('boom'); },
    };
    const html = render('```plantuml\nAlice -> Bob\n```', { puml: stub });
    assert.ok(html.includes('plantuml-fallback'));
  });

  it('fallbackHtml 转义源码', () => {
    const html = plantumlFallbackHtml('a < b && c > d');
    assert.ok(html.includes('a &lt; b &amp;&amp; c &gt; d'));
  });
});

describe('标题锚点', () => {
  it('保留中文生成 id', () => {
    const html = render('## 一、标题');
    assert.ok(html.includes('<h2 id="一-标题">'), html);
  });

  it('重复标题自动加序号', () => {
    const html = render('## 相同\n\n## 相同');
    assert.ok(html.includes('id="相同"'));
    assert.ok(html.includes('id="相同-2"'));
  });

  it('无有效字符时回退为 section', () => {
    assert.equal(slugify('!!!', new Set()), 'section');
  });

  it('slugify 英文转小写连字符', () => {
    assert.equal(slugify('Hello World', new Set()), 'hello-world');
  });
});

describe('图片路径改写', () => {
  const BASE = 'http://127.0.0.1:1/';

  it('相对路径 → baseUri 前缀', () => {
    const html = render('![alt](images/a.png)', { baseUri: BASE });
    assert.ok(html.includes('src="http://127.0.0.1:1/images/a.png"'));
    assert.ok(html.includes('alt="alt"'));
  });

  it('根路径（博客惯例 /assets/...）→ baseUri 相对', () => {
    const html = render('![x](/assets/img/posts/a.webp)', { baseUri: BASE });
    assert.ok(html.includes('src="http://127.0.0.1:1/assets/img/posts/a.webp"'));
  });

  it('绝对 URL 与 data URI 原样保留', () => {
    const html = render('![外](https://example.com/a.png) ![内](data:image/png;base64,AAA)', { baseUri: BASE });
    assert.ok(html.includes('src="https://example.com/a.png"'));
    assert.ok(html.includes('src="data:image/png;base64,AAA"'));
  });

  it('中文与空格路径编码（空格需 <...> 包裹，Markdown 规范）', () => {
    const html = render('![x](<图片 文件.png>)', { baseUri: BASE });
    assert.ok(html.includes('src="http://127.0.0.1:1/%E5%9B%BE%E7%89%87%20%E6%96%87%E4%BB%B6.png"'));
  });

  it('不注入 loading 懒加载属性', () => {
    const html = render('![x](a.png)', { baseUri: BASE });
    assert.ok(!html.includes('loading'));
  });

  it('resolveImageSrc 单元测试', () => {
    assert.equal(resolveImageSrc('a/b.png', BASE), 'http://127.0.0.1:1/a/b.png');
    assert.equal(resolveImageSrc('/a/b.png', BASE), 'http://127.0.0.1:1/a/b.png');
    assert.equal(resolveImageSrc('a.png', 'file:///C:/x'), 'file:///C:/x/a.png');
    assert.equal(resolveImageSrc('https://x.com/a.png', BASE), 'https://x.com/a.png');
  });
});

describe('代码高亮', () => {
  it('已知语言 → hljs 高亮类', () => {
    const html = render('```js\nconst a = 1;\n```');
    assert.ok(html.includes('language-js'));
    assert.ok(html.includes('<span class="hljs-keyword">'));
  });

  it('未知语言 → 无高亮类', () => {
    const html = render('```foobar\nplain\n```');
    assert.ok(!html.includes('hljs'));
    assert.ok(html.includes('plain'));
  });

  it('无语言代码块正常输出', () => {
    const html = render('```\nplain\n```');
    assert.ok(html.includes('<pre><code>'));
  });
});

describe('html: false（与博客一致）', () => {
  it('原始 HTML 被转义', () => {
    const html = render('<div>raw</div>');
    assert.ok(html.includes('&lt;div&gt;raw&lt;/div&gt;'));
    assert.ok(!html.includes('<div>raw</div>'));
  });
});

describe('TOC 提取', () => {
  it('h2/h3 → toc-l2/toc-l3 列表', () => {
    const toc = buildToc('<h2 id="a">标题A</h2><h3 id="b">标题B</h3><h2 id="c">标题C</h2>');
    assert.ok(toc.includes('<li class="toc-l2"><a href="#a">标题A</a></li>'));
    assert.ok(toc.includes('<li class="toc-l3"><a href="#b">标题B</a></li>'));
    assert.equal((toc.match(/toc-l\d/g) || []).length, 3);
  });
});

describe('PlantUML 真实渲染（集成）', () => {
  it(
    'java + jar 渲染出 SVG（需设置 MPE2PDF_TEST_PUML_JAR 环境变量指向 plantuml.jar）',
    { skip: !process.env.MPE2PDF_TEST_PUML_JAR && '未设置 MPE2PDF_TEST_PUML_JAR' },
    () => {
      const r = new PlantUMLRenderer('java', process.env.MPE2PDF_TEST_PUML_JAR!);
      assert.equal(r.available(), true);
      const svg = r.renderSync('Alice -> Bob: hello');
      assert.match(svg, /<svg/);
      assert.match(svg, /Alice/);
      // 缓存：相同源码再次渲染命中内存缓存
      assert.equal(r.renderSync('Alice -> Bob: hello'), svg);
    }
  );
});
