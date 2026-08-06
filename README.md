# MPE2PDF — Markdown 导出 PDF

将当前 Markdown 文件导出为 PDF，渲染样式复用 [myBlog](https://github.com/ZanytriumPH/ZanytriumPH.github.io) 博客
（markdown-it + Redefine/MPE 风格），与博客文章页视觉一致。

## 功能（开发中）

- [x] Phase 0：扩展骨架、命令与设置项声明
- [x] Phase 1：渲染核心（callout 提示框、`==高亮==`、代码高亮、MathJax、Mermaid、PlantUML）
- [x] Phase 2：博客同款页面模板与打印样式（`resources/print.css` + 等待脚本）
- [ ] Phase 3：PDF 导出（puppeteer-core + 系统 Edge）
- [ ] Phase 4：右键菜单、设置项打磨与文档
- [ ] Phase 5：打包发布

## 使用

安装后在编辑器中右键 Markdown 文件 →「MPE2PDF: 导出为 PDF」，或在命令面板执行
`MPE2PDF: 导出为 PDF`。详见 `DEVELOPMENT_PLAN.md`。
