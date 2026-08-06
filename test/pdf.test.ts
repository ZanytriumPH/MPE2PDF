/**
 * pdf.test.ts — 导出层单元测试（浏览器定位、输出路径命名）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowserPath } from '../src/pdf/browser';
import { resolveOutputPath } from '../src/pdf/export';

describe('浏览器定位', () => {
  it('本机（Windows）应能探测到 Edge/Chrome', () => {
    if (process.platform !== 'win32') return; // 非 Windows 跳过
    const exe = findBrowserPath();
    assert.ok(exe, '应找到浏览器');
    assert.ok(fs.existsSync(exe!), '路径真实存在');
  });

  it('设置项配置的路径优先（存在时）', () => {
    const temp = path.join(os.tmpdir(), 'mpe2pdf-test-browser.txt');
    fs.writeFileSync(temp, 'x');
    assert.equal(findBrowserPath(temp), temp);
    fs.rmSync(temp);
  });

  it('配置的路径不存在时回退到自动探测', () => {
    const exe = findBrowserPath('C:\\nonexistent\\browser.exe');
    if (process.platform === 'win32') {
      assert.ok(exe, 'Windows 应回退探测到 Edge');
    }
  });
});

describe('输出路径命名', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe2pdf-test-'));

  it('默认输出到源文件同目录', () => {
    const p = resolveOutputPath(path.join(dir, '文章.md'), '');
    assert.equal(p, path.join(dir, '文章.pdf'));
  });

  it('outputDir 设置优先', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe2pdf-out-'));
    const p = resolveOutputPath(path.join(dir, 'a.md'), out);
    assert.equal(p, path.join(out, 'a.pdf'));
  });

  it('同名文件已存在时自动追加 -2/-3', () => {
    const f1 = path.join(dir, 'x.pdf');
    const f2 = path.join(dir, 'x-2.pdf');
    fs.writeFileSync(f1, 'a');
    fs.writeFileSync(f2, 'b');
    assert.equal(resolveOutputPath(path.join(dir, 'x.md'), ''), path.join(dir, 'x-3.pdf'));
    fs.rmSync(f1); fs.rmSync(f2);
  });

  it('不带扩展名的文件名正常处理', () => {
    assert.equal(resolveOutputPath(path.join(dir, 'noext'), ''), path.join(dir, 'noext.pdf'));
  });

  it('清理临时目录', () => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
