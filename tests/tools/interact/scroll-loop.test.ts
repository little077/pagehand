import { describe, expect, it } from 'vitest';
import {
  applyScrollRound,
  createScrollLoopState,
  formatScrollLoopMessage,
  normalizeScrollRounds,
  shouldStopScroll,
} from '@/lib/tools/interact-scroll';

function round(
  overrides: Partial<Parameters<typeof applyScrollRound>[1]> = {},
): Parameters<typeof applyScrollRound>[1] {
  return {
    atBottom: false,
    grew: false,
    changed: false,
    loading: false,
    endMarker: null,
    at: 1_000,
    ...overrides,
  };
}

describe('scroll to bottom 循环状态', () => {
  it('内容持续变长时继续滚，到底且连续三轮没变化才结束', () => {
    let state = createScrollLoopState();
    state = applyScrollRound(state, round({ grew: true, changed: true }));
    expect(shouldStopScroll(state)).toBe(false);

    state = applyScrollRound(
      state,
      round({ atBottom: true, grew: true, changed: true, at: 2_000 }),
    );
    expect(state.stable).toBe(0);
    expect(shouldStopScroll(state)).toBe(false);

    state = applyScrollRound(state, round({ atBottom: true, at: 3_000 }));
    state = applyScrollRound(state, round({ atBottom: true, at: 4_000 }));
    expect(shouldStopScroll(state)).toBe(false);

    state = applyScrollRound(state, round({ atBottom: true, at: 5_000 }));
    expect(shouldStopScroll(state)).toBe(true);
    expect(state.outcome).toBe('reached_end');
  });

  it('到底但一直显示加载中，超过宽限时间判为加载停滞，而不是到底', () => {
    let state = createScrollLoopState();
    state = applyScrollRound(state, round({ atBottom: true, loading: true, at: 1_000 }));
    expect(state.outcome).toBeNull();
    state = applyScrollRound(state, round({ atBottom: true, loading: true, at: 4_000 }));
    expect(state.outcome).toBeNull();
    state = applyScrollRound(state, round({ atBottom: true, loading: true, at: 7_000 }));
    expect(state.outcome).toBe('stalled');
    expect(shouldStopScroll(state)).toBe(true);
  });

  it('页面出现“没有更多”时直接结束，不再等', () => {
    let state = createScrollLoopState();
    state = applyScrollRound(
      state,
      round({ atBottom: true, loading: true, endMarker: '没有更多评论', at: 1_000 }),
    );
    expect(state.outcome).toBe('reached_end');
  });

  it('没到底却连续滚不动，判为没选对容器', () => {
    let state = createScrollLoopState();
    for (let index = 0; index < 4; index += 1) {
      state = applyScrollRound(state, round({ at: 1_000 + index * 500 }));
    }
    expect(state.outcome).toBe('no_progress');
  });

  it('轮数默认 120，并夹在 1 到 200 之间', () => {
    expect(normalizeScrollRounds(undefined)).toBe(120);
    expect(normalizeScrollRounds(0)).toBe(1);
    expect(normalizeScrollRounds(9999)).toBe(200);
  });

  it('消息区分到底、停滞、没进展三种结局', () => {
    const reached = {
      ...createScrollLoopState(),
      rounds: 12,
      outcome: 'reached_end' as const,
    };
    expect(
      formatScrollLoopMessage(reached, {
        atBottom: true,
        distance: 0,
        gained: 400,
        endMarker: '没有更多评论',
      }),
    ).toContain('没有更多评论');

    const stalled = { ...createScrollLoopState(), rounds: 9, outcome: 'stalled' as const };
    const stalledText = formatScrollLoopMessage(stalled, {
      atBottom: true,
      distance: 0,
      gained: 0,
      loadingLabel: '加载中',
      noGrowthMs: 7_200,
    });
    expect(stalledText).toContain('加载中');
    expect(stalledText).toContain('7 秒');
    expect(stalledText).toContain('不要重复滚动');

    const stuck = { ...createScrollLoopState(), rounds: 3, outcome: 'no_progress' as const };
    expect(formatScrollLoopMessage(stuck, { atBottom: false, distance: 600, gained: 0 })).toContain(
      '没选对滚动容器',
    );
  });
});
