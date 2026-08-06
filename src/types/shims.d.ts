/**
 * 第三方包类型补充（无官方/社区类型声明）
 */

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}
