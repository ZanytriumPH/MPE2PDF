# MPE2PDF — Markdown 导出 PDF

将当前 Markdown 文件导出为 PDF，渲染样式借鉴 [Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced)
（MPE）的排版风格，提供熟悉的阅读体验。

> 本项目受 MPE（Markdown Preview Enhanced）启发，故命名 MPE2PDF。

## 功能

- **MPE 风格渲染**：正文排版、代码高亮（GitHub 主题）、荧光笔 `==高亮==`、13 种 MPE 风格提示框
- **完整公式支持**：`$..$` 行内公式、`$$..$$` 块级公式（MathJax 3）
- **图表支持**：```mermaid 图（客户端渲染，跟随明暗主题）、```plantuml 图（Java 渲染，需配置）
- **中文友好**：标题锚点保留中文、中文/空格路径自动编码
- **打印排版**：块级元素（代码块/表格/提示框/公式/图）不跨页截断，标题不孤立页底
- **零下载**：直接驱动系统 Microsoft Edge / Chrome（Windows 11 自带 Edge）
- **不污染**：图片相对路径/根路径自动映射，同名文件自动改名不覆盖

## 支持的提示框类型

`> [!note]` `[!info]` `[!tip]` `[!success]` `[!question]` `[!warning]`
`[!example]` `[!quote]` `[!important]` `[!bug]` `[!fail]`

## 使用

- 编辑器右键（Markdown 文件）或资源管理器右键（.md 文件）→「MPE2PDF: 导出为 PDF」
- 命令面板：`MPE2PDF: 导出为 PDF`
- 导出完成后可点击「打开文件」直接查看 PDF

## 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| `mpe2pdf.theme` | `light` | PDF 明暗主题 |
| `mpe2pdf.pageSize` | `A4` | 纸张大小（`A4` / `Letter`） |
| `mpe2pdf.fontSize` | `16` | 正文字号（px），标题、代码块等按比例联动缩放（8–32） |
| `mpe2pdf.margin` | 20mm 四周 | 页边距（mm） |
| `mpe2pdf.includeToc` | `false` | 是否生成目录（h2/h3 标题） |
| `mpe2pdf.includePageNumbers` | `true` | 页脚页码 |
| `mpe2pdf.cssOverride` | `""` | 追加的 CSS 文件路径（相对工作区或绝对路径） |
| `mpe2pdf.browserPath` | `""` | Edge/Chrome 可执行文件路径（空 = 自动探测） |
| `mpe2pdf.javaPath` | `"java"` | Java 命令（PlantUML 用） |
| `mpe2pdf.plantumlJarPath` | `""` | plantuml.jar 绝对路径（空 = 不启用 PlantUML，降级显示源码） |
| `mpe2pdf.outputDir` | `""` | PDF 输出目录（空 = 与源文件同目录） |
| `mpe2pdf.rootDir` | `""` | 根路径图片（`/assets/...`）映射目录（空 = 源文件目录） |

**PlantUML 示例**：

```json
{
  "mpe2pdf.plantumlJarPath": "C:/path/to/plantuml.jar",
  "mpe2pdf.rootDir": "C:/path/to/notes"
}
```

## 开发状态

- [x] Phase 0：扩展骨架、命令与设置项声明
- [x] Phase 1：渲染核心（callout/高亮/代码高亮/MathJax/Mermaid/PlantUML）
- [x] Phase 2：MPE 风格页面模板与打印样式
- [x] Phase 3：PDF 导出（puppeteer-core + 系统 Edge）
- [x] Phase 4：设置项打磨与文档
- [x] Phase 5：图标、打包、边界回归、本地安装验证

## 许可证

MIT
