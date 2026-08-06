/**
 * extension.ts — MPE2PDF 扩展入口
 *
 * 导出管线：
 *   md 文件 → gray-matter 解析 → markdown-it 渲染（移植 myBlog md.js）
 *   → 博客同款页面模板 → 本地 HTTP 服务 → puppeteer-core + 系统 Edge → PDF
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { readSettings, resolveSettingPath } from './config';
import { exportToPdf } from './pdf/export';

/** 扩展 resources 目录（dist/ 的上级） */
const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

let outputChannel: vscode.OutputChannel | undefined;

function log(msg: string): void {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel('MPE2PDF');
  outputChannel.appendLine(msg);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mpe2pdf.exportCurrent', async (uri?: vscode.Uri) => {
      await exportCurrent(uri);
    })
  );
}

export function deactivate(): void {}

/**
 * 导出当前 Markdown 文件为 PDF。
 * 可从编辑器右键（resourceLangId == markdown）或资源管理器右键（.md）触发，
 * 两种入口均以 uri 参数传入目标文件。
 */
async function exportCurrent(uri?: vscode.Uri): Promise<void> {
  // 解析目标文件：优先取菜单传入的 uri，其次取当前活动的编辑器
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target || target.scheme !== 'file') {
    vscode.window.showWarningMessage('MPE2PDF: 请打开或选中一个 Markdown 文件后再导出');
    return;
  }
  if (!target.fsPath.toLowerCase().endsWith('.md')) {
    vscode.window.showWarningMessage(`MPE2PDF: "${target.fsPath}" 不是 Markdown 文件`);
    return;
  }

  const settings = readSettings();
  // cssOverride 可能是相对工作区的路径
  const cssOverride = resolveSettingPath(settings.cssOverride, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  const rootDir = resolveSettingPath(settings.rootDir, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

  log(`导出开始: ${target.fsPath}`);
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MPE2PDF: 导出为 PDF',
        cancellable: false,
      },
      async (progress) => {
        return exportToPdf({
          mdPath: target.fsPath,
          resourcesDir: RESOURCES_DIR,
          settings: { ...settings, cssOverride, rootDir },
          onProgress: (msg) => progress.report({ message: msg }),
        });
      }
    );

    for (const w of result.warnings) {
      log(`⚠️  ${w}`);
      vscode.window.showWarningMessage(`MPE2PDF: ${w}`);
    }
    log(`导出完成: ${result.outputPath}`);

    const open = '打开文件';
    const pick = await vscode.window.showInformationMessage(
      `MPE2PDF: 导出完成 → ${result.outputPath}`,
      open
    );
    if (pick === open) {
      await vscode.env.openExternal(vscode.Uri.file(result.outputPath));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`导出失败: ${msg}`);
    vscode.window.showErrorMessage(`MPE2PDF: 导出失败 — ${msg}`);
  }
}
