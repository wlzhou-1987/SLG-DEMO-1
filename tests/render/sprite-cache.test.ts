import { describe, it, expect } from 'vitest';
import { SpriteCache } from '../../src/render/sprite-cache';

/** R15-4 棋子贴图资源管理器：注入式 loader，node 环境无 DOM 依赖 */
interface FakeImage {
  complete: boolean;
  naturalWidth: number;
  src: string;
}

function makeFactory(): { images: FakeImage[]; factory: () => FakeImage } {
  const images: FakeImage[] = [];
  return {
    images,
    factory: () => {
      const img: FakeImage = { complete: false, naturalWidth: 0, src: '' };
      images.push(img);
      return img;
    }
  };
}

describe('R15-4 SpriteCache（§5.3/§7.5）', () => {
  it('null url 直接返回 null，不触发加载', () => {
    const { images, factory } = makeFactory();
    const cache = new SpriteCache(factory);
    expect(cache.get(null)).toBeNull();
    expect(images).toHaveLength(0);
  });

  it('首次查询未就绪返回 null 并触发加载；就绪后命中且不重复创建', () => {
    const { images, factory } = makeFactory();
    const cache = new SpriteCache(factory);
    expect(cache.get('art/sprite/lord.png')).toBeNull();   // 加载中
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('art/sprite/lord.png');
    images[0].complete = true;
    images[0].naturalWidth = 256;
    const hit = cache.get('art/sprite/lord.png');
    expect(hit).not.toBeNull();
    expect(hit?.src).toBe('art/sprite/lord.png');
    expect(images).toHaveLength(1);                        // 缓存命中不新建
  });

  it('加载失败负缓存：complete 且 naturalWidth 0 恒返回 null（失败=缺失同回落）', () => {
    const { images, factory } = makeFactory();
    const cache = new SpriteCache(factory);
    cache.get('bad.png');
    images[0].complete = true;
    expect(images[0].naturalWidth).toBe(0);
    expect(cache.get('bad.png')).toBeNull();
    expect(cache.get('bad.png')).toBeNull();               // 不复活
  });

  it('clear 清空缓存，下次查询重新加载', () => {
    const { images, factory } = makeFactory();
    const cache = new SpriteCache(factory);
    cache.get('a.png');
    images[0].complete = true;
    images[0].naturalWidth = 64;
    expect(cache.get('a.png')).not.toBeNull();
    cache.clear();
    expect(cache.get('a.png')).toBeNull();                 // 重新加载
    expect(images).toHaveLength(2);
  });

  it('默认工厂在无 Image 全局的环境（node 测试）不抛错：返回 null 走剪影回落', () => {
    const cache = new SpriteCache();                        // 默认工厂
    expect(cache.get('art/sprite/lord.png')).toBeNull();
  });
});
