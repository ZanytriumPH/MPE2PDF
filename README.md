# MPE2PDF — Markdown to PDF

**[中文说明文档](https://github.com/ZanytriumPH/MPE2PDF/blob/main/README.zh-CN.md)**

Convert the current Markdown file to PDF, with rendering styles borrowed from
[Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced) (MPE),
providing a familiar reading experience.

> Named MPE2PDF after its inspiration, Markdown Preview Enhanced (MPE).

## Features

- **MPE-style rendering** — typography, code highlighting (GitHub theme), `==highlight==` marker, and 13 MPE-style callouts
- **Full math support** — `$..$` inline and `$$..$$` display formulas (MathJax 3, bundled and fully offline; tolerant to spaces/newlines around delimiters)
- **Diagrams** — Mermaid (rendered client-side, follows light/dark theme) and PlantUML (rendered via Java, optional)
- **Chinese-friendly** — CJK heading anchors, automatic encoding of CJK/space file paths
- **Centered images** — standalone images (including link-wrapped ones) are centered, like Mermaid/PlantUML diagrams
- **Print-tuned layout** — code blocks, tables, callouts, formulas and figures never split across pages; headings never orphaned at the bottom of a page
- **Zero download** — drives the system Microsoft Edge / Chrome (Edge ships with Windows 11)
- **Non-intrusive** — relative/root image paths are mapped automatically; existing files are never overwritten

## Supported callout types

`> [!note]` `[!info]` `[!tip]` `[!success]` `[!question]` `[!warning]`
`[!example]` `[!quote]` `[!important]` `[!bug]` `[!fail]`

## Usage

- Right-click in the editor (Markdown file) or in the Explorer (`.md` file) → **MPE2PDF: Export to PDF**
- Command palette: `MPE2PDF: Export to PDF`
- Click **Open file** in the notification to view the PDF when the export finishes

## Settings

| Setting | Default | Description |
|---|---|---|
| `mpe2pdf.theme` | `light` | Light/dark theme |
| `mpe2pdf.pageSize` | `A4` | Page size (`A4` / `Letter`) |
| `mpe2pdf.fontSize` | `16` | Base font size (px); headings etc. scale proportionally (8–32) |
| `mpe2pdf.margin` | 20mm all sides | Page margins (mm) |
| `mpe2pdf.includeToc` | `false` | Generate a table of contents (h2/h3 headings) |
| `mpe2pdf.includePageNumbers` | `true` | Page numbers in the footer |
| `mpe2pdf.headingRule` | `true` | Horizontal rule under the main title and h2 headings |
| `mpe2pdf.cssOverride` | `""` | Extra CSS file path (workspace-relative or absolute) |
| `mpe2pdf.browserPath` | `""` | Edge/Chrome executable path (empty = auto-detect) |
| `mpe2pdf.javaPath` | `"java"` | Java command (for PlantUML) |
| `mpe2pdf.plantumlJarPath` | `""` | Absolute path of plantuml.jar (empty = PlantUML disabled, source shown instead) |
| `mpe2pdf.outputDir` | `""` | Output directory (empty = alongside the source file) |
| `mpe2pdf.rootDir` | `""` | Mapping directory for root paths like `/assets/...` (empty = source file directory) |

## Development Status

- [x] Phase 0: extension skeleton, command and settings declaration
- [x] Phase 1: rendering core (callouts / highlight / code highlighting / MathJax / Mermaid / PlantUML)
- [x] Phase 2: MPE-style page template and print styles
- [x] Phase 3: PDF export (puppeteer-core + system Edge)
- [x] Phase 4: settings polish and documentation
- [x] Phase 5: icon, packaging, edge-case regression, local install verification

## License

MIT
