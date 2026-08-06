/**
 * browser.ts — 系统浏览器定位与启动
 *
 * 定位顺序：设置项 mpe2pdf.browserPath → 环境变量 MPE2PDF_BROWSER_PATH /
 * PUPPETEER_EXECUTABLE_PATH → 各平台常见安装路径。Windows 11 自带 Edge，
 * 无需额外下载浏览器。
 */

import * as fs from 'fs';
import * as puppeteer from 'puppeteer-core';

/** 各平台常见浏览器安装路径（优先 Edge，其次 Chrome） */
const KNOWN_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  linux: [
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

/** 查找可用的浏览器可执行文件路径；找不到返回 undefined */
export function findBrowserPath(configured?: string): string | undefined {
  if (configured && fs.existsSync(configured)) return configured;
  const env = process.env.MPE2PDF_BROWSER_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  for (const p of KNOWN_PATHS[process.platform] || []) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** 启动无头浏览器（返回 puppeteer Browser 实例） */
export async function launchBrowser(executablePath: string): Promise<puppeteer.Browser> {
  return puppeteer.launch({
    executablePath,
    headless: true, // 新无头模式（Edge 不支持 headless shell 二进制）
    args: ['--hide-scrollbars'],
  });
}
