import type { ChatItem } from '@/lib/ipc/protocol';

/** 默认标题取首条用户消息的前多少个字符（按码点切，emoji 不会被切坏）。 */
export const PROMPT_TITLE_MAX_CHARS = 20;

/** 既没有用户改名也没有 AI 总结、且首条消息为空时列表显示的占位标题。 */
export const UNTITLED_SESSION_LABEL = '新会话';

export type TitleSource = 'prompt' | 'ai' | 'user';

/**
 * 标题的三个来源分开放，展示时按优先级取，回退就不需要重新猜。
 * `custom` 一旦有值永久优先，后期接入模型总结标题时也不会覆盖用户手改的名字。
 */
export interface SessionTitle {
  /** 用户在会话列表里手动改名的结果；null 表示没改过。 */
  custom: string | null;
  /** 模型总结出来的标题；当前只在设置里接入总结能力后才会写入。 */
  ai: string | null;
  /** 首条用户消息的前 20 个字符，兜底标题。 */
  fromPrompt: string;
}

/** 会话落盘的一条记录。`messages` 是模型上下文，`items` 是给 UI 看的视图模型。 */
export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: SessionTitle;
  /** 只记是哪个模型，绝不存 API Key。 */
  model: { presetId: string; baseUrl: string; modelId: string } | null;
  items: ChatItem[];
  /** pi 的 AgentMessage 原样序列化，不含开头的 system 消息。 */
  messages: unknown[];
}

export interface SessionSummary {
  id: string;
  title: string;
  titleSource: TitleSource;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export function promptTitleOf(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return Array.from(collapsed).slice(0, PROMPT_TITLE_MAX_CHARS).join('');
}

export function createSessionTitle(firstPrompt = ''): SessionTitle {
  return { custom: null, ai: null, fromPrompt: promptTitleOf(firstPrompt) };
}

export function resolveTitle(title: SessionTitle): { text: string; source: TitleSource } {
  if (title.custom) return { text: title.custom, source: 'user' };
  if (title.ai) return { text: title.ai, source: 'ai' };
  return { text: title.fromPrompt, source: 'prompt' };
}

/** 改名：空串等于取消自定义，自动回退到 AI 标题或默认标题。 */
export function renameTitle(title: SessionTitle, value: string): SessionTitle {
  const custom = value.replace(/\s+/g, ' ').trim();
  return { ...title, custom: custom || null };
}

/** 写入模型总结的标题；用户改过名时保持用户的选择。 */
export function applyAiTitle(title: SessionTitle, value: string): SessionTitle {
  const ai = value.replace(/\s+/g, ' ').trim();
  return { ...title, ai: ai || null };
}

export function displayTitle(title: SessionTitle): string {
  const resolved = resolveTitle(title);
  return resolved.text || UNTITLED_SESSION_LABEL;
}

export function toSessionSummary(record: SessionRecord): SessionSummary {
  const resolved = resolveTitle(record.title);
  return {
    id: record.id,
    title: resolved.text || UNTITLED_SESSION_LABEL,
    titleSource: resolved.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.items.length,
  };
}

/** 存储是用户可改的文件，读回来先校验再用时，坏记录直接跳过。 */
export function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id) return false;
  if (typeof record.createdAt !== 'number' || typeof record.updatedAt !== 'number') return false;
  if (!Array.isArray(record.items) || !Array.isArray(record.messages)) return false;

  const title = record.title as Record<string, unknown> | null | undefined;
  if (!title || typeof title !== 'object') return false;
  if (typeof title.fromPrompt !== 'string') return false;
  if (title.custom !== null && typeof title.custom !== 'string') return false;
  if (title.ai !== null && typeof title.ai !== 'string') return false;
  return true;
}

/**
 * 恢复历史后继续追加消息时，UI 消息 id 不能和已有 id 撞车（id 形如 u-3 / a-4 / t-5）。
 */
export function resumeSequence(items: ChatItem[]): number {
  let max = 0;
  for (const item of items) {
    const suffix = Number(item.id.slice(2));
    if (Number.isFinite(suffix) && suffix > max) max = suffix;
  }
  return max;
}

/** 列表用的相对时间：当天只看时刻，跨天看日期。 */
export function formatRelativeTime(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const date = new Date(at);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
