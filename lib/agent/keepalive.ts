import { browser } from 'wxt/browser';

/** MV3 后台空闲约 30 秒就会被回收，心跳必须比这个间隔短。 */
export const KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * 后台自持保活：有活在跑时定期调一次扩展 API，重置 Service Worker 的空闲计时。
 * 计时器活在后台，侧边栏关不关都不影响这一轮能不能跑完。
 */
export class RuntimeKeepAlive {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ping: () => Promise<unknown> = () => browser.runtime.getPlatformInfo(),
  ) {}

  get active(): boolean {
    return this.timer !== null;
  }

  /** 幂等：同一个状态重复调用不会叠出第二个定时器。 */
  setActive(active: boolean): void {
    if (active === this.active) return;
    if (!active) {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    this.timer = setInterval(() => {
      void this.ping().catch(() => {
        // 单次保活失败不致命，下一个 tick 再试；真被回收了由会话恢复兜底。
      });
    }, KEEPALIVE_INTERVAL_MS);
  }
}
