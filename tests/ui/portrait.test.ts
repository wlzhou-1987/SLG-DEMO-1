import { describe, it, expect, afterEach } from 'vitest';
import { portraitMarkup } from '../../src/ui/portrait';
import { ART_ASSETS } from '../../src/config/art';

/** R15-2 头像窗三级回落（§7.5）：独立头像 → 立绘裁切 → 阵营色底首字窗 */
describe('R15-2 头像窗三级回落', () => {
  afterEach(() => {
    delete ART_ASSETS.__test;
  });

  it('独立头像优先：portrait 登记时 img 用 portrait 路径', () => {
    ART_ASSETS.__test = { portrait: 'p.png', standing: 's.png' };
    const html = portraitMarkup('__test', 'player', '测试兵', 32);
    expect(html).toContain('src="art/portrait/p.png"');
    expect(html).not.toContain('art/standing');
  });

  it('头像缺失回落立绘：img 用 standing 路径', () => {
    ART_ASSETS.__test = { standing: 's.png' };
    const html = portraitMarkup('__test', 'player', '测试兵', 32);
    expect(html).toContain('src="art/standing/s.png"');
  });

  it('立绘也缺失：阵营色底首字占位（无 img、无隐藏态）', () => {
    const html = portraitMarkup('__nonexistent', 'enemy', '敌剑士', 32);
    expect(html).not.toContain('<img');
    expect(html).toContain('art-fb-on');
    expect(html).toContain('background:#d94a4a');
    expect(html).toContain('>敌</i>');
  });

  it('加载失败兜底：有图时内嵌 onerror，占位置隐藏待命', () => {
    ART_ASSETS.__test = { standing: 's.png' };
    const html = portraitMarkup('__test', 'player', '测试兵', 48);
    expect(html).toContain('onerror=');
    expect(html).toContain('class="art-fb"');   // 非 art-fb-on：img 失败前不显示
  });
});
