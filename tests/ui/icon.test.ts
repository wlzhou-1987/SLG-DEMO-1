import { describe, it, expect } from 'vitest';
import { iconSpan } from '../../src/ui/icon';

describe('R16-3 UI 图标件（缺失/失败回落文字，§7.3/§7.0/§7.5）', () => {
  it('已登记键：img + 相对路径 + data-fb 供 onerror 回落', () => {
    const html = iconSpan('sword', '剑');
    expect(html).toContain('<img');
    expect(html).toContain('src="art/icon/icon-sword.png"');
    expect(html).toContain('data-fb="剑"');
    expect(html).toContain('icon-fb');   // onerror 加类由 CSS ::before 显文字
  });

  it('未登记键：直接回落文字（无 img）', () => {
    const html = iconSpan('not-a-key', '怒气');
    expect(html).not.toContain('<img');
    expect(html).toContain('icon-fb');
    expect(html).toContain('怒气');
  });

  it('未登记且无回落文字：返回空串（伤害线 magic 无图不显示）', () => {
    expect(iconSpan('magic')).toBe('');
  });
});
