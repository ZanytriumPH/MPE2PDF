/**
 * toc.ts — 目录提取（移植自 myBlog scripts/build.js 的 buildToc）
 *
 * 从渲染后的 HTML 提取 h2/h3 标题生成目录列表，层级样式类与博客一致
 * （.toc-l2 / .toc-l3，配合 print.css 的点线缩进）。
 */
export function buildToc(html: string): string {
  const lines: string[] = [];
  const re = /<h([23]) id="([^"]+)">(.*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, level, id, title] = m;
    lines.push(`<li class="toc-l${level}"><a href="#${id}">${title}</a></li>`);
  }
  return lines.join('');
}
