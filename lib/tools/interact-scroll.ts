export type ScrollOutcome = 'reached_end' | 'stalled' | 'budget_exhausted' | 'no_progress';

/** scroll + to=bottom 的工具内循环状态；一轮 = 跳到底 + 等一段页面动静。 */
export interface ScrollLoopState {
  rounds: number;
  stable: number;
  changed: boolean;
  /** 第一次出现“到底 + 没新内容 + 仍在加载”的时间，用来算加载宽限。 */
  loadingSince: number | null;
  outcome: ScrollOutcome | null;
}

export interface ScrollRoundMetrics {
  atBottom: boolean;
  grew: boolean;
  changed: boolean;
  loading: boolean;
  endMarker: string | null;
  at: number;
}

export const SCROLL_STABLE_ROUNDS = 3;
/** 到底后页面一直显示加载中时，最多等这么久才判定为停滞。 */
export const SCROLL_LOADING_GRACE_MS = 6_000;
export const SCROLL_DEFAULT_ROUNDS = 120;
export const SCROLL_MAX_ROUNDS = 200;

export function normalizeScrollRounds(value: number | undefined): number {
  return Math.min(SCROLL_MAX_ROUNDS, Math.max(1, Math.floor(value ?? SCROLL_DEFAULT_ROUNDS)));
}

export function createScrollLoopState(): ScrollLoopState {
  return { rounds: 0, stable: 0, changed: false, loadingSince: null, outcome: null };
}

export function applyScrollRound(
  state: ScrollLoopState,
  round: ScrollRoundMetrics,
): ScrollLoopState {
  const changed = state.changed || round.changed || round.grew;
  const base = { ...state, rounds: state.rounds + 1, changed };

  // 页面自己说出“没有更多”时最可信，直接收工。
  if (round.endMarker) {
    return { ...base, stable: 0, loadingSince: null, outcome: 'reached_end' };
  }
  if (round.grew) {
    return { ...base, stable: 0, loadingSince: null, outcome: null };
  }

  const stable = state.stable + 1;
  let loadingSince: number | null = null;
  let outcome: ScrollOutcome | null = null;

  if (round.atBottom && round.loading) {
    // 到底了但还在转圈：网络没回来，不能当成“没有更多”。
    loadingSince = state.loadingSince ?? round.at;
    if (round.at - loadingSince >= SCROLL_LOADING_GRACE_MS) outcome = 'stalled';
  } else if (round.atBottom) {
    if (stable >= SCROLL_STABLE_ROUNDS) outcome = 'reached_end';
  } else if (stable > SCROLL_STABLE_ROUNDS) {
    // 没到底却滚不动，通常是容器选错了。
    outcome = 'no_progress';
  }

  return { ...base, stable, loadingSince, outcome };
}

export function shouldStopScroll(state: ScrollLoopState): boolean {
  return state.outcome !== null;
}

export interface ScrollMessageInput {
  atBottom: boolean;
  distance: number;
  gained: number;
  loadingLabel?: string | null;
  noGrowthMs?: number;
  endMarker?: string | null;
}

export function formatScrollLoopMessage(state: ScrollLoopState, input: ScrollMessageInput): string {
  const heightNote = input.gained > 0 ? `，内容高度增加 ${input.gained}px` : '';
  switch (state.outcome) {
    case 'reached_end':
      return `已滚到底${input.endMarker ? `（末尾出现「${input.endMarker}」）` : ''}（${state.rounds} 轮${heightNote}）。`;
    case 'stalled': {
      const seconds = Math.max(1, Math.round((input.noGrowthMs ?? 0) / 1000));
      const label = input.loadingLabel || '加载中';
      return `已到当前加载末尾，但页面仍在显示「${label}」，连续约 ${seconds} 秒没有新内容；可能是网络慢或站点限流，不要重复滚动，等待或刷新后再试。`;
    }
    case 'no_progress':
      return `滚动了 ${state.rounds} 轮，内容没有任何变化，可能没选对滚动容器；请检查页面或换一个元素作为落点。`;
    default:
      return input.atBottom
        ? `已经到底但仍在加载（${state.rounds} 轮），可以再调用一次继续等待。`
        : `滚动了 ${state.rounds} 轮，还没到底，距底约 ${Math.round(input.distance)}px；可以再调用一次继续。`;
  }
}
