/**
 * 棋子贴图资源管理器（R15-4，§5.3/§7.5）：按 URL 懒加载 + 缓存。
 * 未就绪/加载失败一律返回 null（失败 = 缺失同回落，渲染层回落矢量剪影）；
 * loader 可注入，node 测试环境无 DOM 依赖。
 */

export interface LoadedImage {
  complete: boolean;
  naturalWidth: number;
  src: string;
}

type ImageFactory = () => LoadedImage;

const defaultFactory: ImageFactory = () =>
  // 无 Image 全局的环境（node 测试）：给永不就绪的桩，等价加载失败 → 剪影回落
  typeof Image === 'undefined'
    ? ({ complete: true, naturalWidth: 0, src: '' } as LoadedImage)
    : (new Image() as unknown as LoadedImage);

export class SpriteCache {
  private cache = new Map<string, LoadedImage>();

  constructor(private createImage: ImageFactory = defaultFactory) {}

  /** 查询已就绪贴图；未登记（null）、加载中、失败均返回 null，未见过则触发加载 */
  get(url: string | null): LoadedImage | null {
    if (!url) return null;
    let img = this.cache.get(url);
    if (!img) {
      img = this.createImage();
      img.src = url;
      this.cache.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const spriteCache = new SpriteCache();
