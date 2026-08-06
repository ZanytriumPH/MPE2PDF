/**
 * page.test.ts — 页面模板单元测试（front matter 解析、标题回退、页面组装）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, dateText, parseFrontMatter, extractFirstH1, renderPage,
} from '../src/page/template';

describe('front matter 解析', () => {
  it('解析 title/date/tags，正文去除 front matter', () => {
    const raw = '---\ntitle: 测试文章\ndate: 2026-08-05\ntags: [博客, 教程]\n---\n\n正文内容';
    const fm = parseFrontMatter(raw);
    assert.equal(fm.title, '测试文章');
    assert.equal(fm.dateIso, '2026-08-05');
    assert.equal(fm.dateText, '2026 年 8 月 5 日');
    assert.deepEqual(fm.tags, ['博客', '教程']);
    assert.equal(fm.content.trim(), '正文内容');
  });

  it('无 date 时回退为文件修改时间（本地日期）', () => {
    const raw = '---\ntitle: 无日期\n---\n正文';
    // 2026-08-06 12:30:00 本地时间
    const mtime = new Date(2026, 7, 6, 12, 30, 0).getTime();
    const fm = parseFrontMatter(raw, mtime);
    assert.equal(fm.dateIso, '2026-08-06');
  });

  it('无 front matter 时 title 为空、无 tags', () => {
    const fm = parseFrontMatter('纯文本正文');
    assert.equal(fm.title, '');
    assert.deepEqual(fm.tags, []);
  });
});

describe('标题回退', () => {
  it('提取首个 h1 文本（去除内联格式）', () => {
    assert.equal(extractFirstH1('<h2 id="a">H2</h2><h1 id="t">**主标题**</h1><p>x</p>'), '**主标题**');
  });

  it('无 h1 时返回空串', () => {
    assert.equal(extractFirstH1('<p>无标题</p>'), '');
  });
});

describe('页面组装', () => {
  const base = {
    title: '测试 & <文章>',
    html: '<p>正文</p>',
    toc: '<li class="toc-l2"><a href="#a">A</a></li>',
    theme: 'light' as const,
    includeToc: false,
    assetsPrefix: '/__mpe2pdf__/',
  };

  it('标题转义，正文结构完整，不渲染博客专有 meta', () => {
    const page = renderPage(base);
    assert.ok(page.includes('<title>测试 &amp; &lt;文章&gt;</title>'));
    assert.ok(page.includes('<h1 class="post-title">测试 &amp; &lt;文章&gt;</h1>'));
    assert.ok(page.includes('<div class="post-body markdown-body"><p>正文</p></div>'));
    assert.ok(!page.includes('post-meta'), '不渲染日期/标签等博客专有属性');
    assert.ok(!page.includes('tag-chip'));
  });

  it('浅色主题加载 hljs.css，深色加载 hljs-dark.css', () => {
    assert.ok(renderPage(base).includes('href="/__mpe2pdf__/hljs.css"'));
    assert.ok(renderPage({ ...base, theme: 'dark' }).includes('href="/__mpe2pdf__/hljs-dark.css"'));
  });

  it('includeToc 开启且有 toc 时才渲染目录（默认关闭）', () => {
    assert.ok(!renderPage(base).includes('class="toc"'), '默认不渲染目录');
    assert.ok(renderPage({ ...base, includeToc: true }).includes('class="toc"'));
    assert.ok(!renderPage({ ...base, includeToc: true, toc: '' }).includes('class="toc"'));
  });

  it('等待脚本就绪钩子与 MathJax 配置', () => {
    const page = renderPage(base);
    assert.ok(page.includes('window.__renderReady = true'));
    assert.ok(page.includes("window.MathJax = { tex: { inlineMath: [['\\\\('"));
    assert.ok(page.includes('vendor/mathjax/tex-svg.js'));
    assert.ok(page.includes('vendor/mermaid/mermaid.min.js'));
    assert.ok(page.includes("mermaid.initialize({ startOnLoad: false"));
  });

  it('html 属性携带主题', () => {
    assert.ok(renderPage(base).startsWith('<!DOCTYPE html>\n<html lang="zh-CN" data-theme="light">'));
  });
});

describe('工具函数', () => {
  it('esc 转义 HTML 特殊字符', () => {
    assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  });

  it('dateText 中文格式', () => {
    assert.equal(dateText('2026-08-05T00:00:00Z'), '2026 年 8 月 5 日');
  });
});
