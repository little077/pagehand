/**
 * 页面隔离世界里的元素 ref 注册表。
 *
 * inspect 和 interact 是两个独立注入的函数，不能共享模块变量；它们约定用同一个
 * 全局 key 读写这张表。元素到 ref 的映射放在 page 的 isolated world 里，页面导航
 * 后随上下文一起销毁，ref 自然失效。
 */

export const REF_STORE_KEY = '__pagehandRefStoreV1';

/** 单页最多记这么多 ref；超过后先清掉已经被回收的元素。 */
export const REF_STORE_MAX = 4000;

export interface PageRefMeta {
  ref: string;
  selector: string;
  tag: string;
  role: string | null;
  label: string | null;
}

export interface PageRefStore {
  seq: number;
  byElement: WeakMap<Element, string>;
  byRef: Map<string, WeakRef<Element>>;
  meta: Map<string, PageRefMeta>;
}

/** 只给测试用：每个用例之间清空注册表，保证 ref 从 e1 开始。 */
export function resetRefStore(): void {
  delete (globalThis as unknown as Record<string, unknown>)[REF_STORE_KEY];
}
