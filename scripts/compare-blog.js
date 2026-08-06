/**
 * compare-blog.js — 渲染保真对比（Phase 1 验收）
 *
 * 用本扩展渲染 myBlog 的 source/_posts 文章，与博客 dist/posts 构建产物
 * 的正文 HTML 逐块比对，确认移植的渲染规则与博客完全一致。
 *
 * 用法: node scripts/compare-blog.js [myBlog目录] [文章名.md]
 * 需要先 npm run compile（依赖 dist/ 下的编译产物）。
 *
 * 规范化规则（已知的合理差异，比对前抹平）：
 *   - 博客 img 带 loading="lazy"，本扩展不带 → 从博客侧移除
 *   - 博客 plantuml 为 <img src="/assets/puml/x.svg">，本扩展为 data URI → 统一为占位符
 *   - baseUri 传 '/'，博客根路径图片与我们的改写结果一致（不产生差异）
 */
const path = require('path');
const fs = require('fs');
const matter = require('gray-matter');
const { createMd } = require('../dist/markdown/renderer.js');
const { PlantUMLRenderer } = require('../dist/plantuml.js');

const BLOG = path.resolve(process.argv[2] || 'C:\\Users\\36076\\Desktop\\myBlog');
const FILE = process.argv[3] || 'test.md';

const mdPath = path.join(BLOG, 'source', '_posts', FILE);
const distPath = path.join(BLOG, 'dist', 'posts', FILE.replace(/\.md$/, '.html'));
if (!fs.existsSync(mdPath) || !fs.existsSync(distPath)) {
  console.error(`缺少文件：\n  md:   ${mdPath}\n  dist: ${distPath}`);
  process.exit(1);
}

// --- 博客侧：提取 markdown-body 正文 ---
const distHtml = fs.readFileSync(distPath, 'utf8');
const startMark = '<div class="post-body markdown-body">';
const start = distHtml.indexOf(startMark);
const end = distHtml.indexOf('<div class="post-copyright-sep">');
if (start === -1 || end === -1) {
  console.error('dist HTML 中未找到 markdown-body 正文或版权分隔符');
  process.exit(1);
}
let blogBody = distHtml
  .slice(start + startMark.length, end)
  // 剔除 markdown-body 容器的闭合 </div>（属于页面模板，不在渲染内容内）
  .replace(/<\/div>\s*$/, '')
  .trim();

// --- 本扩展侧：渲染 ---
const raw = fs.readFileSync(mdPath, 'utf8');
const { content } = matter(raw);

const jar =
  process.env.PLANTUML_JAR ||
  [path.join(BLOG, 'plantuml.jar'), path.join(BLOG, 'scripts', 'plantuml.jar')]
    .find((p) => fs.existsSync(p));
const puml = jar ? new PlantUMLRenderer('java', jar) : undefined;
const env = { baseUri: '/', usedSlugs: new Set(), puml };
let ours = createMd(env).render(content, env).trim();

// --- 规范化 ---
const normalize = (html) =>
  html
    // 博客 img 懒加载（本扩展不带）
    .replace(/ loading="lazy"/g, '')
    // plantuml 图片地址差异（博客文件路径 vs 本扩展 data URI）
    .replace(/<img src="[^"]*" alt="PlantUML 图">/g, '<img src="%PUML%" alt="PlantUML 图">')
    // 博客的 plantuml 替换产物会把 <figure> 与下一行内容粘在一起，本扩展保留换行 —— 统一抹平
    .replace(/<\/figure>\n/g, '</figure>')
    .replace(/\n{3,}/g, '\n\n'); // 多空行压平

blogBody = normalize(blogBody);
ours = normalize(ours);

// --- 逐块比对 ---
const blogLines = blogBody.split('\n');
const ourLines = ours.split('\n');
let diffCount = 0;
const SHOW = 15;
for (let i = 0; i < Math.max(blogLines.length, ourLines.length); i++) {
  if (blogLines[i] !== ourLines[i]) {
    diffCount++;
    if (diffCount <= SHOW) {
      console.log(`行 ${i + 1} 差异：`);
      console.log(`  博客: ${blogLines[i] ?? '<无>'}`);
      console.log(`  本扩展: ${ourLines[i] ?? '<无>'}`);
    }
  }
}
console.log(
  diffCount === 0
    ? `✅ ${FILE}：正文 HTML 与博客 dist 完全一致（共 ${blogLines.length} 行）`
    : `❌ ${FILE}：发现 ${diffCount} 处差异（最多展示 ${SHOW} 处）`
);
process.exit(diffCount === 0 ? 0 : 1);
