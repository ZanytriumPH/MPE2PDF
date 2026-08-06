/**
 * server.ts — 本地静态 HTTP 服务（导出页面与资源）
 *
 * 路由：
 *   /__mpe2pdf__.html  → 组装好的导出页面（内存）
 *   /__mpe2pdf__/*     → 扩展 resources/ 目录（print.css/hljs/vendor）
 *   /__mpe2pdf__/override.css → 用户 cssOverride 文件内容（未设置时 404）
 *   其他路径           → 优先 rootDir（mpe2pdf.rootDir，博客根路径 /assets/... 场景），
 *                        其次 md 所在目录（图片相对路径）
 *
 * 随机端口，用后即关。返回 baseUri 供渲染环境与页面引用。
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

export interface StaticServerOptions {
  /** md 文件所在目录（图片相对路径的根） */
  mdDir: string;
  /** 扩展 resources 目录 */
  resourcesDir: string;
  /** mpe2pdf.rootDir：根路径（/assets/...）优先映射到该目录，缺省用 mdDir */
  rootDir?: string;
  /** 用户 cssOverride 文件绝对路径（可选） */
  cssOverridePath?: string;
  /** 导出页面 HTML（挂在 /__mpe2pdf__.html） */
  pageHtml: string;
}

export interface StaticServer {
  port: number;
  baseUri: string;
  close(): Promise<void>;
}

export function createStaticServer(opts: StaticServerOptions): Promise<StaticServer> {
  const cssOverrideUrl = opts.cssOverridePath && fs.existsSync(opts.cssOverridePath)
    ? '/__mpe2pdf__/override.css'
    : '';

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    let body: string | undefined;
    let file: string | undefined;

    if (urlPath === '/__mpe2pdf__.html') {
      body = opts.pageHtml;
    } else if (urlPath.startsWith('/__mpe2pdf__/')) {
      const rel = urlPath.slice('/__mpe2pdf__/'.length);
      if (rel === 'override.css' && cssOverrideUrl) {
        file = opts.cssOverridePath;
      } else {
        file = path.join(opts.resourcesDir, rel);
      }
    } else {
      // 根路径优先 rootDir（博客惯例 /assets/...），否则 md 目录
      const rel = urlPath.replace(/^\/+/, '');
      file = opts.rootDir && fs.existsSync(path.join(opts.rootDir, rel))
        ? path.join(opts.rootDir, rel)
        : path.join(opts.mdDir, rel);
    }

    if (body !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(body);
    }
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        baseUri: `http://127.0.0.1:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
