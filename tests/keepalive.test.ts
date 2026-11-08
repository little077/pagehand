import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEEPALIVE_INTERVAL_MS, RuntimeKeepAlive } from '@/lib/agent/keepalive';

describe('RuntimeKeepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings once per interval while active', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const keepAlive = new RuntimeKeepAlive(ping);

    expect(keepAlive.active).toBe(false);
    keepAlive.setActive(true);
    expect(keepAlive.active).toBe(true);
    expect(ping).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 3);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('does not stack timers when activated repeatedly', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const keepAlive = new RuntimeKeepAlive(ping);

    keepAlive.setActive(true);
    keepAlive.setActive(true);
    keepAlive.setActive(true);

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('stops pinging once released and can start again', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const keepAlive = new RuntimeKeepAlive(ping);

    keepAlive.setActive(true);
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    keepAlive.setActive(false);
    expect(keepAlive.active).toBe(false);

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 4);
    expect(ping).toHaveBeenCalledTimes(1);

    keepAlive.setActive(false);
    keepAlive.setActive(true);
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('keeps ticking when a ping fails', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('extension api unavailable'));
    const keepAlive = new RuntimeKeepAlive(ping);

    keepAlive.setActive(true);
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);

    expect(ping).toHaveBeenCalledTimes(2);
    expect(keepAlive.active).toBe(true);
  });

  it('stays under the 30 second idle window', () => {
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThan(30_000);
  });
});
