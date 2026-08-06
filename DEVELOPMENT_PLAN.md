# MPE2PDF — VS Code Markdown → PDF 导出插件 · 开发计划

> 目标：开发一个 VS Code 插件，将当前 Markdown 文件导出为 PDF，
> 渲染样式复用 `C:\Users\36076\Desktop\myBlog` 博客（markdown-it + Redefine/MPE 风格）。

## 0. 需求确认（已与用户确认）

| 决策点 | 选择 |
|---|---|
| PDF 生成引擎 | **系统 Edge + puppeteer-core**（零下载，Windows 11 自带） |
| 样式/语法来源 | **复制进扩展**（`print.css` + md.js 逻辑），提供 CSS 覆盖配置项 |
| 渲染特性 | 提示框 callout + `==高亮==` + 代码高亮、MathJax、Mermaid、PlantUML（全支持） |
| 导出范围 | **单文件导出**（当前编辑文件 / 资源管理器右键） |

环境核查：Node v22.17.0 ✅ · Java 23 ✅（PlantUML 可用）· Edge 已装于
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` ✅

## 1. 总体架构

```
┌─────────────┐   gray-matter    ┌──────────────────┐
│ 当前 .md 文件 │ ──front matter──▶ │ 渲染核心 renderer.ts │
└─────────────┘                   │ (移植 myBlog md.js) │
                                  └────────┬─────────┘
                      plantuml.ts ──java -jar──▶ SVG（可配置，缺 Java 降级）
                                           │ HTML(正文)
                                  ┌────────▼─────────┐   resources/print.css
                                  │ 页面组装 template.ts │ + hljs.css + vendor/
                                  └────────┬─────────┘
                                           │ 完整 HTML + 内联等待脚本
                                  ┌────────▼─────────┐
                                  │ 本地 HTTP 静态服务 │  (127.0.0.1:随机端口)
                                  └────────┬─────────┘
                                  ┌────────▼─────────┐  page.pdf()
                                  │ puppeteer-core + Edge │ ──▶ .pdf
                                  └──────────────────┘
```

**关键选型理由**：
- **本地 HTTP 服务提供页面**而非 `file://`：避免 Chrome 对 file:// 页面加载本地
  脚本/字体的安全限制（MathJax 需加载字体、mermaid 需执行 JS），且图片相对路径
  天然映射，无需改写。约 30 行代码，最稳。
- **MathJax / Mermaid 客户端渲染**：与博客完全一致——HTML 里内联等待脚本，
  暴露 `window.__renderReady` Promise，puppeteer 等待其 resolve 后再 print。
- **PlantUML 服务端预渲染**：渲染 HTML 前先对 ```plantuml 块逐个调
  `java -jar plantuml.jar -tsvg`（复用 myBlog `plantuml.js` 的参数与 hash 缓存逻辑），
  把 SVG 内联进 HTML。

## 2. 目录结构

```
MPE2PDF/
├── package.json          # 扩展清单：命令/菜单/设置项
├── tsconfig.json
├── esbuild.mjs           # 构建（或 tsc 直编，二选一）
├── resources/
│   ├── print.css         # 移植 style.css 的正文部分 + @page 打印规则
│   ├── hljs.css          # 复制自 myBlog/dist/assets/css/hljs.css（GitHub 浅色）
│   └── vendor/           # 复制自 myBlog/assets/vendor/
│       ├── mathjax/tex-svg.js
│       └── mermaid/mermaid.min.js
├── src/
│   ├── extension.ts      # 激活、注册命令与菜单
│   ├── config.ts         # 读取 mpe2pdf.* 设置
│   ├── markdown/
│   │   ├── renderer.ts   # 移植 md.js（createMd）
│   │   └── toc.ts        # 移植 buildToc（h2/h3 → toc-l2/l3）
│   ├── page/template.ts  # 移植 templates.js postPage + 等待脚本
│   ├── plantuml.ts       # 移植 plantuml.js（改为同步渲染 + 内存缓存）
│   └── pdf/
│       ├── browser.ts    # Edge 定位 + puppeteer launch
│       └── export.ts     # 本地 HTTP 服务 + 加载等待 + page.pdf
└── test/
    ├── fixtures/         # 来自 myBlog source/_posts/ 的三篇文章
    └── *.test.ts         # node:test（内置，零额外依赖）
```

依赖：`markdown-it@14` `markdown-it-mark` `highlight.js` `gray-matter`
`puppeteer-core`；devDeps：`typescript` `@types/vscode` `@types/node` `esbuild`（可选）。

## 3. 分阶段计划

### Phase 0 — 项目脚手架（约 0.5 天）

**任务**
1. 初始化扩展：package.json（publisher、activationEvents、`contributes.commands`）、
   tsconfig、esbuild/tsc 构建链、`.vscode/launch.json`（F5 调试扩展宿主）。
2. 声明命令骨架：`mpe2pdf.exportCurrent`，空实现 + `vscode.window.showInformationMessage`。
3. 声明设置项（`contributes.configuration`，见 §5 设置清单）。
4. `npm install` 依赖。

**验收**：F5 启动插件宿主，命令面板搜到命令并触发弹出提示；`vsce package` 能出 .vsix。

### Phase 1 — 渲染核心（移植 md.js，约 1~1.5 天）

**任务**
1. 移植 `createMd()` 全部规则：
   - markdown-it-mark（`==高亮==`）
   - callout 规则（core.ruler.after 'inline'，9 种类型 + 内联 SVG 图标）
   - `math_inline` / `math_block` 规则（输出 `\(...\)` / `\[...\]`）
   - fence 覆盖：`mermaid` 原样输出 `<pre class="mermaid">`；`plantuml` 交给 plantuml.ts
   - 标题锚点（slugify 保留中文 + 去重）
2. **与博客的差异点（重要）**：
   - 图片规则：博客注入 `loading="lazy"`（网页懒加载）→ 扩展**去掉**并改为把
     `src` 解析为可加载的 URL（`env.baseUri` 注入，相对路径 → `{baseUri}/{path}`）；
   - `html: false` 保持与博客一致（保真），后续可加设置放开；
   - plantuml 由"收集后统一渲染"改为"逐块同步渲染 + hash 内存缓存"。
3. 单元测试（node:test）：callout 九类型、math 行内/块级、mermaid 原样输出、
   plantuml 占位、中文标题锚点、图片路径改写。

**验收**：用 `source/_posts/test.md` 渲染，与博客 `dist/test.html` 的正文 HTML
逐块一致（锚点 id 允许差异）。

### Phase 2 — 页面生成与样式（约 1~1.5 天）

**任务**
1. 移植 `postPage` 模板：`post-header`（front matter 的 title/date/tags →
   `post-title`/`post-meta`）、`post-body markdown-body`、可选 TOC
   （`toc-title` + `page-title` + `toc-l2/l3` 列表，与博客完全一致）。
2. 无 front matter 时：title 取首个 `h1` 文本，date 取文件修改时间。
3. 从 style.css 提取正文相关部分（`--css 变量`、`.markdown-body*`、`mark`、
   `.callout*`、`pre/code`、`table`、`.math-block`、`pre.mermaid`/`.mermaid-svg`、
   `.plantuml-figure`、`.toc*`、hljs 相关），整理为 `resources/print.css`，
   去掉 navbar/hero/sidebar/footer 等无关部分；追加打印专用规则：
   - `@page { size: A4; margin: 20mm }`
   - `pre, table, blockquote, .callout, .mermaid-svg, .plantuml-figure`
     → `break-inside: avoid`；h1/h2 前 `break-after: avoid`；
   - `a { text-decoration: none; color: inherit }`（PDF 中链接默认可点但打印样式收敛）；
   - 主题：`html[data-theme="light"]`（默认，深色设置项切 `dark` 变量组）。
4. 复制 `hljs.css`、`tex-svg.js`、`mermaid.min.js` 进 `resources/`。
5. 内联等待脚本：MathJax `startup.promise` + mermaid `initialize({startOnLoad:false,
   theme})` + `render()` 遍历 `pre.mermaid`（对齐 main.js 写法），全部完成后
   resolve `window.__renderReady`。

**验收**：生成 HTML 手动在 Edge 打开，与博客文章页（浅色）视觉一致；
含 callout/math/mermaid/plantuml/代码块的测试页全部正常。

### Phase 3 — PDF 导出（约 1~2 天）

**任务**
1. `browser.ts`：Edge 定位顺序——设置项 `mpe2pdf.browserPath` →
   环境变量 → Windows 两个标准安装路径（`Program Files (x86)` / `Program Files`）→
   macOS Chrome → 报错提示。`puppeteer.launch({ headless: 'shell', executablePath })`。
2. `export.ts`：
   - 临时目录 + Node 原生 http 静态服务（md 所在目录为 root，`text/css`/
     `application/javascript` 等 mime），随机端口，用后即关；
   - `page.pdf()`：`format: A4`（设置项）、`printBackground: true`、
     `margin`、`displayHeaderFooter` + 页码模板（`<span class="pageNumber">`）；
   - 等待策略：`page.goto` → `waitForFunction('window.__renderReady')`
     → 额外 `waitForFunction` 图片全部 `complete`。
3. 输出：md 同目录同名 `.pdf`（`mpe2pdf.outputDir` 可改）；不覆盖时自动改名。
4. `withProgress` 进度通知（渲染中 → 打印中 → 完成）；PlantUML 缺 Java 时
   降级占位 + `showWarningMessage`。
5. 用 `source/_posts/人机交互.md`（含大量图片、中文标题）实测。

**验收**：三篇博客文章导出成功；callout/math/mermaid/plantuml/代码高亮在 PDF 中
与网页一致；中文渲染正常；图片清晰；分页不把代码块/表格腰斩。

### Phase 4 — 命令、菜单与配置打磨（约 0.5~1 天）

**任务**
1. 菜单接入：编辑器右键（`editor/context` + `resourceLangId == markdown`）
   与资源管理器右键（`explorer/context` + `resourceExtname == .md`），
   显示中文标题「MPE2PDF：导出为 PDF」。
2. 实现全部设置项（§5）。
3. 输出频道 `mpe2pdf`（`outputChannel`）记录渲染日志，方便排查。
4. README.md（功能、安装、设置说明）+ LICENSE。

**验收**：两条右键路径均可导出；每个设置项实际生效；README 覆盖配置。

### Phase 5 — 打包与回归（约 0.5 天）

**任务**
1. `vsce package` 产出 .vsix，本地安装验证（清掉 dev 依赖不影响运行）。
2. 边界用例：无 front matter、空文档、只有图片、超长代码块、中文/空格路径、
   图片缺失（显示 alt 文本）、无 Java 环境（PlantUML 降级）。
3. 与博客 dist 页面逐项视觉比对 checklist（见 §6）。

**验收**：.vsix 全新安装后全部功能可用；边界用例行为合理不报错。

> 总计约 **4.5~7 人日**，可按 Phase 顺序推进，每阶段独立可验收。

## 4. 与 myBlog 的同步机制（维护）

样式/语法全部"复制进扩展"，博客更新后需手动同步，**同步 checklist**：

- `assets/css/style.css` 变更 → 更新 `resources/print.css` 的正文部分；
- `scripts/md.js` 变更 → 更新 `src/markdown/renderer.ts`；
- `assets/vendor/` 下 mathjax/mermaid 升级 → 替换 `resources/vendor/`；
- `dist/assets/css/hljs*.css` 变更 → 替换 `resources/hljs.css`；
- 可选：`mpe2pdf.cssOverride` 设置项可直接指向博客的 style.css 做临时覆盖对比。

## 5. 设置项清单（mpe2pdf.*）

| 设置 | 默认 | 说明 |
|---|---|---|
| `theme` | `light` | PDF 明暗主题（`light`/`dark`） |
| `pageSize` | `A4` | `A4`/`Letter` |
| `margin` | `{top:20,bottom:20,left:20,right:20}` (mm) | 页边距 |
| `includeToc` | `true` | 是否生成右侧目录（h2/h3） |
| `includePageNumbers` | `true` | 页脚页码 |
| `cssOverride` | `""` | 追加的 CSS 文件路径（可指向博客 style.css 对比） |
| `browserPath` | `""` | Edge/Chrome 可执行文件路径（空 = 自动探测） |
| `javaPath` | `"java"` | Java 命令（PlantUML） |
| `plantumlJarPath` | `""` | plantuml.jar 路径（空 = 不启用，plantuml 块降级为源码+提示） |
| `outputDir` | `""` | 输出目录（空 = md 同目录） |

## 6. 视觉比对 checklist（验收用）

- [ ] 标题层级、字距、行高与博客一致（h2 下划线、h1 大标题）
- [ ] 9 种 callout 的底色/描边/图标/标题颜色一致
- [ ] `==高亮==` 荧光笔样式一致
- [ ] 行内代码、代码块（语言标签栏、圆角、hljs GitHub 配色）一致
- [ ] 表格边框、表头底色、隔行条纹一致
- [ ] 数学公式（行内/块级）正常、可读
- [ ] Mermaid 图居中、无拉伸、无白边
- [ ] PlantUML 图白底、有边框、居中
- [ ] 引用块、列表 marker、图片圆角一致
- [ ] TOC 结构与博客目录一致（层级、点线缩进）
- [ ] 分页合理：无块级元素被截断、标题不孤立在页底

## 7. 风险与应对

| 风险 | 应对 |
|---|---|
| MathJax tex-svg.js 在无头 Edge 中字体/加载异常 | 等 `MathJax.startup.promise`；异常时降级为源码文本并提示 |
| mermaid 渲染耗时/失败 | 等待脚本逐图 try/catch（对齐 main.js），失败显示错误提示条 |
| Edge 无头模式（headless shell）打印差异 | 先用 `headless: 'shell'` 验证，异常则换 `'new'` 模式 |
| 图片 URL 含中文/空格 | 统一 `encodeURI`；http server 直接映射原始文件名 |
| 首次启动 Edge 慢 | withProgress 说明「正在启动浏览器」，复用 launch 实例 |
| 博客样式大改导致扩展样式过时 | §4 同步 checklist + cssOverride 逃生通道 |

## 8. v2 候选（本期不做）

- 文件夹批量导出（整站文章出 PDF 合集）
- 自定义页眉页脚模板、封面页
- 导出 PNG/HTML 单文件
- 跟随博客自动同步样式（脚本化提取）
