/**
 * plantuml.ts — PlantUML 渲染器
 *
 * 与博客 plantuml.js 的差异：博客「收集全部 → 构建时统一渲染」，
 * 本扩展在渲染 HTML 时对每个 ```plantuml 块同步渲染（java -jar -pipe），
 * SVG 以 data URI 内联进页面，相同源码走 hash 内存缓存。
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';

/** 渲染器接口：便于测试用桩替换 */
export interface PlantUMLRendererLike {
  /** 是否可渲染（已指定 plantuml.jar 路径） */
  available(): boolean;
  /** 渲染 PlantUML 源码为 SVG 字符串；失败抛错 */
  renderSync(source: string): string;
}

export class PlantUMLRenderer implements PlantUMLRendererLike {
  private readonly cache = new Map<string, string>(); // 源码 hash → SVG

  constructor(
    private readonly javaCmd: string,
    private readonly jarPath: string
  ) {}

  available(): boolean {
    return this.jarPath !== '';
  }

  renderSync(source: string): string {
    const hash = createHash('sha1').update(source).digest('hex').slice(0, 12);
    const cached = this.cache.get(hash);
    if (cached !== undefined) return cached;

    // 与博客一致：缺 @startuml 标记时补全，防止 -pipe 模式解析歧义
    const pumlSource =
      '@startuml\n' + source.replace(/^\s*@startuml\s*$/i, '').trim() + '\n@enduml\n';

    try {
      const svg = execFileSync(
        this.javaCmd,
        ['-jar', this.jarPath, '-tsvg', '-charset', 'UTF-8', '-pipe'],
        {
          input: pumlSource,
          encoding: 'utf8',
          timeout: 60_000,
          maxBuffer: 64 * 1024 * 1024,
        }
      );
      this.cache.set(hash, svg);
      return svg;
    } catch (e) {
      throw new Error(`PlantUML 渲染失败：${(e as Error).message}`);
    }
  }
}

/** 未配置 Java/plantuml.jar 或渲染失败时的降级占位 HTML（样式类与博客一致） */
export function plantumlFallbackHtml(source: string): string {
  const esc = String(source)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div class="plantuml-fallback">
    <div class="plantuml-fallback-hint">⚠️ MPE2PDF：未配置 PlantUML（请在设置 mpe2pdf.plantumlJarPath 中指定 plantuml.jar 路径），以下显示源码</div>
    <pre><code class="language-plantuml">${esc}</code></pre>
  </div>`;
}
