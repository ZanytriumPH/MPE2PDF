/**
 * extension.ts — MPE2PDF 扩展入口
 *
 * 导出管线（按开发阶段逐步落地）：
 *   md 文件 → gray-matter 解析 → markdown-it 渲染（移植 myBlog md.js）
 *   → 博客同款页面模板 → 本地 HTTP 服务 → puppeteer-core + 系统 Edge → PDF
 */

import * as vscode from 'vscode';

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
 * 命令可从编辑器右键（resourceLangId == markdown）或资源管理器右键（.md）触发，
 * 两种入口分别以 uri 参数传入目标文件。
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

  // TODO(Phase 1~3): 渲染并导出 PDF
  vscode.window.showInformationMessage(`MPE2PDF: 导出功能开发中（目标：${target.fsPath}）`);
}
