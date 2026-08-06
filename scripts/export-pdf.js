/**
 * export-pdf.js — 端到端导出验证（Node CLI 版，不依赖 VS Code）
 *
 * 用法: node scripts/export-pdf.js <md文件> [--out 输出目录] [--root 根路径映射目录]
 *       [--puml plantuml.jar路径] [--theme light|dark] [--toc]
 */
const path = require('path');
const { exportToPdf } = require('../dist/pdf/export.js');

const args = process.argv.slice(2);
const mdPath = path.resolve(args.find((a) => !a.startsWith('--')) || '');
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};

if (!mdPath || !require('fs').existsSync(mdPath)) {
  console.error('用法: node scripts/export-pdf.js <md文件> [--out dir] [--root dir] [--puml jar] [--theme light|dark] [--toc]');
  process.exit(1);
}

const settings = {
  theme: flag('--theme', 'light'),
  pageSize: 'A4',
  margin: { top: 20, bottom: 20, left: 20, right: 20 },
  includeToc: args.includes('--toc'),
  includePageNumbers: true,
  cssOverride: '',
  browserPath: '',
  javaPath: 'java',
  plantumlJarPath: flag('--puml', 'C:\\Users\\36076\\Desktop\\myBlog\\plantuml.jar'),
  outputDir: flag('--out', ''),
  rootDir: flag('--root', 'C:\\Users\\36076\\Desktop\\myBlog'),
};

(async () => {
  const t0 = Date.now();
  const result = await exportToPdf({
    mdPath,
    resourcesDir: path.resolve(__dirname, '..', 'resources'),
    settings,
    onProgress: (m) => console.log('  ' + m),
  });
  const size = require('fs').statSync(result.outputPath).size;
  console.log(`✅ 导出完成（${Date.now() - t0}ms，${(size / 1024).toFixed(1)} KB）: ${result.outputPath}`);
  for (const w of result.warnings) console.log(`⚠️  ${w}`);
})().catch((e) => {
  console.error('❌ 导出失败:', e.message);
  process.exit(1);
});
