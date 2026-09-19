/**
 * export.ts — Markdown → PDF 导出主流程
 *
 *  启动本地 HTTP 服务（拿到真实 baseUri）→ 渲染（图片路径随端口）
 *  → 组装页面挂载到服务 → puppeteer 驱动系统 Edge → 等待 __renderReady
 *  与图片加载 → page.pdf() → 输出文件
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Browser } from 'puppeteer-core';
import type { Mpe2PdfSettings } from '../config';
import { createMd, RenderEnv } from '../markdown/renderer';
import { buildToc } from '../markdown/toc';
import { PlantUMLRenderer } from '../plantuml';
import { parseFrontMatter, extractFirstH1, stripFirstH1, renderPage } from '../page/template';
import { findBrowserPath, launchBrowser } from './browser';
import { createStaticServer, StaticServerOptions } from './server';

export interface ExportOptions {
  /** 源 .md 文件绝对路径 */
  mdPath: string;
  /** 扩展 resources 目录 */
  resourcesDir: string;
  settings: Mpe2PdfSettings;
  /** 进度回调（消息文本） */
  onProgress?: (msg: string) => void;
}

export interface ExportResult {
  outputPath: string;
  warnings: string[];
}

const RENDER_TIMEOUT_MS = 30_000;

/**
 * 计算输出路径：outputDir 设置优先，否则与源文件同目录；
 * 同名文件已存在时自动追加 -2/-3…（不覆盖）
 */
export function resolveOutputPath(mdPath: string, outputDir: string): string {
  const base = outputDir || path.dirname(mdPath);
  const name = path.basename(mdPath, path.extname(mdPath));
  let candidate = path.join(base, `${name}.pdf`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(base, `${name}-${n}.pdf`);
    n++;
  }
  return candidate;
}

/** 导出主流程；返回输出文件路径与警告列表 */
export async function exportToPdf(opts: ExportOptions): Promise<ExportResult> {
  const { mdPath, resourcesDir, settings } = opts;
  const progress = opts.onProgress || (() => {});

  // --- 1. 本地 HTTP 服务（先启动拿到真实 baseUri，供图片路径解析） ---
  progress('准备本地服务…');
  const serverOpts: StaticServerOptions = {
    mdDir: path.dirname(mdPath),
    resourcesDir,
    rootDir: settings.rootDir || undefined,
    cssOverridePath: settings.cssOverride || undefined,
    pageHtml: '',
  };
  const server = await createStaticServer(serverOpts);

  // --- 2. 渲染并组装页面（服务闭包持有 serverOpts 引用，后续直接填充页面） ---
  progress('渲染 Markdown…');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const fm = parseFrontMatter(raw, fs.statSync(mdPath).mtimeMs);
  const puml = settings.plantumlJarPath
    ? new PlantUMLRenderer(settings.javaPath, settings.plantumlJarPath)
    : undefined;
  const env: RenderEnv = { baseUri: server.baseUri, usedSlugs: new Set(), puml };
  const rawHtml = createMd(env).render(fm.content, env);
  const firstH1 = extractFirstH1(rawHtml);
  const title = fm.title || firstH1 || path.basename(mdPath, path.extname(mdPath));
  // 正文首个 h1 与页面标题相同（无 front matter 的常规 Markdown 常见）时，
  // 从正文中移除，避免标题在 post-header 与正文中重复出现
  const html = firstH1 && firstH1 === title ? stripFirstH1(rawHtml) : rawHtml;
  serverOpts.pageHtml = renderPage({
    title,
    html,
    toc: buildToc(html),
    theme: settings.theme,
    fontSize: settings.fontSize,
    cssOverrideHref: settings.cssOverride && fs.existsSync(settings.cssOverride)
      ? `${server.baseUri}__mpe2pdf__/override.css`
      : undefined,
    includeToc: settings.includeToc,
    headingRule: settings.headingRule,
    assetsPrefix: `${server.baseUri}__mpe2pdf__/`,
  });

  // --- 3. 启动浏览器并加载页面 ---
  const exe = findBrowserPath(settings.browserPath);
  if (!exe) {
    await server.close().catch(() => {});
    throw new Error(
      '未找到系统浏览器（Edge/Chrome）。请安装 Microsoft Edge，' +
      '或在设置 mpe2pdf.browserPath 中指定浏览器可执行文件路径。'
    );
  }
  progress('启动浏览器…');
  const browser: Browser = await launchBrowser(exe);

  try {
    progress('浏览器渲染页面…');
    const page = await browser.newPage();
    await page.goto(`${server.baseUri}__mpe2pdf__.html`, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    });
    await page.waitForFunction('window.__renderReady === true', { timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
      ));
    });

    const warnings: string[] = await page.evaluate(
      () => (window as { __renderErrors?: string[] }).__renderErrors || []
    );

    // --- 4. 打印 PDF ---
    progress('生成 PDF…');
    const m = settings.margin;
    if (settings.outputDir) {
      fs.mkdirSync(settings.outputDir, { recursive: true }); // 输出目录不存在时自动创建
    }
    const outputPath = resolveOutputPath(mdPath, settings.outputDir);
    const footer = settings.includePageNumbers
      ? '<div style="width:100%;text-align:center;font-size:9px;color:#8c959f;'
        + 'padding:0 20mm;font-family:Segoe UI,Arial,sans-serif;">'
        + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      : '';
    await page.pdf({
      path: outputPath,
      format: settings.pageSize,
      printBackground: true,
      margin: {
        top: `${m.top}mm`, bottom: `${m.bottom}mm`,
        left: `${m.left}mm`, right: `${m.right}mm`,
      },
      displayHeaderFooter: settings.includePageNumbers,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
    });

    return { outputPath, warnings };
  } finally {
    progress('清理…');
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
