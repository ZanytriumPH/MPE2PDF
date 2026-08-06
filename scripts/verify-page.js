/**
 * verify-page.js — Phase 2 页面渲染验证（puppeteer + 系统 Edge，Phase 3 导出原型）
 *
 * 1. 启动本地 HTTP 服务：root = myBlog/dist（博客构建产物），
 *    /__mpe2pdf__/ → 本扩展 resources/ 目录
 * 2. 渲染指定博客文章 → 组装 PDF 页面 → 挂在 /__mpe2pdf__.html
 * 3. puppeteer 驱动系统 Edge：等待 window.__renderReady → 输出 DOM 指标
 *    （mermaid/mathjax/callout 数量）→ 全页截图两份：
 *    本扩展页面 vs 博客原页面（/posts/x.html）
 *
 * 用法: node scripts/verify-page.js [myBlog目录] [文章名.md] [输出目录]
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const matter = require('gray-matter');
const puppeteer = require('puppeteer-core');
const { createMd } = require('../dist/markdown/renderer.js');
const { buildToc } = require('../dist/markdown/toc.js');
const { PlantUMLRenderer } = require('../dist/plantuml.js');
const { renderPage, parseFrontMatter, extractFirstH1 } = require('../dist/page/template.js');

const BLOG = path.resolve(process.argv[2] || 'C:\\Users\\36076\\Desktop\\myBlog');
const FILE = process.argv[3] || 'test.md';
const OUT_DIR = path.resolve(process.argv[4] || 'out');
const RESOURCES = path.resolve(__dirname, '..', 'resources');
const DIST = path.join(BLOG, 'dist');
const PORT = 18765;
const BASE = `http://127.0.0.1:${PORT}/`;
const EDGE =
  process.env.MPE2PDF_EDGE ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// --- 渲染并组装页面 ---
const mdPath = path.join(BLOG, 'source', '_posts', FILE);
const raw = fs.readFileSync(mdPath, 'utf8');
const fm = parseFrontMatter(raw, fs.statSync(mdPath).mtimeMs);
const jar =
  process.env.PLANTUML_JAR ||
  [path.join(BLOG, 'plantuml.jar'), path.join(BLOG, 'scripts', 'plantuml.jar')]
    .find((p) => fs.existsSync(p));
const puml = jar ? new PlantUMLRenderer('java', jar) : undefined;
const env = { baseUri: BASE, usedSlugs: new Set(), puml };
const html = createMd(env).render(fm.content, env);
const page = renderPage({
  title: fm.title || extractFirstH1(html) || FILE.replace(/\.md$/, ''),
  html,
  toc: buildToc(html),
  theme: process.env.MPE2PDF_THEME === 'dark' ? 'dark' : 'light',
  includeToc: false,
  assetsPrefix: '/__mpe2pdf__/',
});

// --- HTTP 服务 ---
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (urlPath === '/__mpe2pdf__.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  let file, root;
  if (urlPath.startsWith('/__mpe2pdf__/')) {
    root = RESOURCES;
    file = path.join(RESOURCES, urlPath.slice('/__mpe2pdf__/'.length));
  } else {
    root = DIST;
    file = path.join(DIST, urlPath);
  }
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// --- puppeteer 截图 + DOM 指标 ---
fs.mkdirSync(OUT_DIR, { recursive: true });
const baseName = FILE.replace(/\.md$/, '');

async function check(url, out, { stats = false } = {}) {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--hide-scrollbars'],
  });
  const p = await browser.newPage();
  await p.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 本扩展页面等 __renderReady；博客原页面（无该钩子）等 pre.mermaid 全部被替换
  await p.waitForFunction(
    'window.__renderReady === true || document.querySelectorAll("pre.mermaid").length === 0',
    { timeout: 30000 }
  );
  // 等待所有图片加载完成
  await p.evaluate(async () => {
    await Promise.all([...document.images].map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
    ));
  });
  if (stats) {
    const s = await p.evaluate(() => ({
      mermaidSvg: document.querySelectorAll('.mermaid-svg').length,
      mermaidError: document.querySelectorAll('.mermaid-error').length,
      math: document.querySelectorAll('mjx-container').length,
      callouts: document.querySelectorAll('.callout').length,
      plantuml: document.querySelectorAll('.plantuml-figure img').length,
      imgBroken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      renderErrors: window.__renderErrors || [],
      // 抽样确认 print.css 已应用
      styles: {
        bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 40),
        bodyColor: getComputedStyle(document.body).color,
        calloutBg: (() => { const c = document.querySelector('.callout-note'); return c ? getComputedStyle(c).backgroundColor : null; })(),
        h2Border: (() => { const h = document.querySelector('.markdown-body h2'); return h ? getComputedStyle(h).borderBottomStyle : null; })(),
        tocDisplay: (() => { const t = document.querySelector('.toc'); return t ? getComputedStyle(t).display : null; })(),
      },
    }));
    console.log('DOM 指标：\n' + JSON.stringify(s, null, 2));
  }
  await p.screenshot({ path: path.join(OUT_DIR, out), fullPage: true });
  console.log(`截图完成: ${out}`);
  await browser.close();
}

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`HTTP 服务就绪: ${BASE}`);
  try {
    // 本扩展页面（等待脚本驱动 mermaid/mathjax 渲染完成）
    await check(`${BASE}__mpe2pdf__.html`, `mpe2pdf-${baseName}.png`, { stats: true });
    // 博客原页面（其自身脚本会处理 mermaid/mathjax，借 __renderReady 等待其 mermaid 完成）
    await check(`${BASE}posts/${baseName}.html`, `blog-${baseName}.png`);
  } catch (e) {
    console.error('验证失败：', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
