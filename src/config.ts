/**
 * config.ts — mpe2pdf.* 设置读取
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface Mpe2PdfSettings {
  theme: 'light' | 'dark';
  pageSize: 'A4' | 'Letter';
  /** 正文字号（px）；作为页面根字号，标题等 rem 尺寸联动缩放 */
  fontSize: number;
  margin: { top: number; bottom: number; left: number; right: number };
  includeToc: boolean;
  includePageNumbers: boolean;
  /** 标题下方分隔线（页面主标题与正文 h1/h2 下的横线） */
  headingRule: boolean;
  /** 追加的 CSS 文件路径（相对工作区或绝对路径） */
  cssOverride: string;
  /** Edge/Chrome 可执行文件路径（空 = 自动探测） */
  browserPath: string;
  javaPath: string;
  plantumlJarPath: string;
  /** PDF 输出目录（空 = 与源文件同目录） */
  outputDir: string;
  /** 根路径（/assets/...）映射目录（空 = 源文件所在目录） */
  rootDir: string;
}

const DEFAULTS: Mpe2PdfSettings = {
  theme: 'light',
  pageSize: 'A4',
  fontSize: 16,
  margin: { top: 20, bottom: 20, left: 20, right: 20 },
  includeToc: false,
  includePageNumbers: true,
  headingRule: true,
  cssOverride: '',
  browserPath: '',
  javaPath: 'java',
  plantumlJarPath: '',
  outputDir: '',
  rootDir: '',
};

/** 读取设置（缺省值兜底） */
export function readSettings(): Mpe2PdfSettings {
  const cfg = vscode.workspace.getConfiguration('mpe2pdf');
  const get = <T,>(key: keyof Mpe2PdfSettings, fallback: T): T => {
    const v = cfg.get<T>(key as string);
    return v === undefined ? fallback : v;
  };
  return {
    theme: get('theme', DEFAULTS.theme),
    pageSize: get('pageSize', DEFAULTS.pageSize),
    fontSize: get('fontSize', DEFAULTS.fontSize),
    margin: { ...DEFAULTS.margin, ...get('margin', DEFAULTS.margin) },
    includeToc: get('includeToc', DEFAULTS.includeToc),
    includePageNumbers: get('includePageNumbers', DEFAULTS.includePageNumbers),
    headingRule: get('headingRule', DEFAULTS.headingRule),
    cssOverride: get('cssOverride', DEFAULTS.cssOverride),
    browserPath: get('browserPath', DEFAULTS.browserPath),
    javaPath: get('javaPath', DEFAULTS.javaPath),
    plantumlJarPath: get('plantumlJarPath', DEFAULTS.plantumlJarPath),
    outputDir: get('outputDir', DEFAULTS.outputDir),
    rootDir: get('rootDir', DEFAULTS.rootDir),
  };
}

/** 解析设置里的路径（可能相对工作区根） */
export function resolveSettingPath(p: string, workspaceRoot?: string): string {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
  return workspaceRoot ? path.join(workspaceRoot, p) : path.resolve(p);
}
