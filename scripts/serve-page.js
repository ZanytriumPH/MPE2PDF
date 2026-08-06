/** serve-page.js — 仅启动页面服务（verify-page.js 的纯服务部分，调试用） */
const http = require('http');
const path = require('path');
const fs = require('fs');
const matter = require('gray-matter');
const { createMd } = require('../dist/markdown/renderer.js');
const { buildToc } = require('../dist/markdown/toc.js');
const { PlantUMLRenderer } = require('../dist/plantuml.js');
const { renderPage, parseFrontMatter, extractFirstH1 } = require('../dist/page/template.js');

const BLOG = path.resolve(process.argv[2] || 'C:\\Users\\36076\\Desktop\\myBlog');
const FILE = process.argv[3] || 'test.md';
const RESOURCES = path.resolve(__dirname, '..', 'resources');
const DIST = path.join(BLOG, 'dist');
const PORT = Number(process.env.PORT || 18765);
const BASE = `http://127.0.0.1:${PORT}/`;

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
  dateText: fm.dateText,
  tags: fm.tags,
  html,
  toc: buildToc(html),
  theme: process.env.MPE2PDF_THEME === 'dark' ? 'dark' : 'light',
  includeToc: true,
  assetsPrefix: '/__mpe2pdf__/',
});

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
server.listen(PORT, '127.0.0.1', () => console.log(`SERVING ${BASE}__mpe2pdf__.html`));
