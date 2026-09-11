import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showActionMenu, hideActionMenu } from '../../src/ui/action-menu';

/** 极简 DOM 桩（同 prep.test 口径）：捕获事件监听以驱动点击 */
class FakeElement {
  tagName = 'DIV';
  className = '';
  listeners: Record<string, Array<() => void>> = {};
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  remove(): void {}
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  click(): void {
    for (const fn of this.listeners.click ?? []) fn();
  }
}

const wrap = new FakeElement();
const originalDocument = globalThis.document;

describe('R5-1 行动菜单灰显（资源不足不可选）', () => {
  beforeEach(() => {
    (globalThis as { document: unknown }).document = {
      createElement: () => new FakeElement(),
      getElementById: (id: string) => (id === 'map-wrap' ? wrap : null)
    };
  });
  afterEach(() => {
    hideActionMenu();
    (globalThis as { document: unknown }).document = originalDocument;
  });

  it('disabled 项带 disabled 类且点击不触发回调；普通项点击触发', () => {
    const picked: string[] = [];
    showActionMenu(0, 0, [
      { label: '攻击·刺击（怒40）', value: 'skill:stab', disabled: true },
      { label: '攻击·普攻', value: 'skill:basic' }
    ], v => picked.push(v));

    const menu = wrap.children[wrap.children.length - 1];
    const [disabledItem, normalItem] = menu.children;
    expect(disabledItem.className).toContain('disabled');
    expect(normalItem.className).not.toContain('disabled');

    disabledItem.click();
    expect(picked).toEqual([]);       // 灰显项不触发
    normalItem.click();
    expect(picked).toEqual(['skill:basic']);
  });
});
