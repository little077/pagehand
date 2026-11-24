import type { AskQuestion, InteractionStatus } from '@/lib/agent/interactions';
import type { SessionSummary, SessionTitle } from '@/lib/sessions/record';

export interface ProviderConfig {
  presetId: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  /** 当前模型是否接受图片输入；旧配置没有这个字段时按 false 处理。 */
  supportsImages?: boolean;
}

export interface ToolImage {
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
}

/** 用户输入框附上的截图；data 是 base64，只在内存/Port 中使用，落盘时转成附件引用。 */
export interface ImageAttachment {
  id: string;
  data: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  name?: string;
}

export type CaptureResult =
  | { ok: true; image: ImageAttachment }
  | {
      ok: false;
      cancelled?: boolean;
      error: string;
      reason?: 'escape' | 'cancel' | 'timeout' | 'too_small';
    };

export type ChatItem =
  | { kind: 'user'; id: string; text: string; attachments?: ImageAttachment[] }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      status: 'streaming' | 'done' | 'error';
      error?: string;
    }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      name: string;
      args?: unknown;
      status: 'running' | 'ok' | 'error';
      summary: string;
      details?: unknown;
      images?: ToolImage[];
      startedAt: number;
      durationMs?: number;
    }
  | {
      kind: 'interaction';
      id: string;
      toolCallId: string;
      mode: 'ask' | 'permission';
      title: string;
      questions?: AskQuestion[];
      reason?: string;
      /** 有值才允许「始终允许」这个站点。 */
      grantOrigin?: string | null;
      status: 'pending' | InteractionStatus;
      answers?: Record<string, string>;
      startedAt: number;
    };

export type InteractionItem = Extract<ChatItem, { kind: 'interaction' }>;

export type TraceKind = 'run' | 'tool' | 'error';

export interface TraceEntry {
  id: string;
  at: number;
  kind: TraceKind;
  title: string;
  detail?: string;
}

export type DebugTraceChannel =
  | 'text'
  | 'structure'
  | 'pixels'
  | 'action'
  | 'wait'
  | 'interaction'
  | 'other';

export interface DebugTraceImageMeta {
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface DebugTraceTarget {
  ref?: string | null;
  tag?: string;
  role?: string | null;
  label?: string | null;
  selector?: string | null;
  name?: string | null;
  risk_label?: string | null;
}

export interface DebugTraceStep {
  seq: number;
  tool: string;
  toolCallId: string;
  args: unknown;
  startedAt: number;
  durationMs?: number;
  status: 'running' | 'ok' | 'error';
  errorCode?: string;
  summary: string;
  resultPreview: string;
  resultChars: number;
  images: DebugTraceImageMeta[];
  channel: DebugTraceChannel;
  page?: { url: string; title: string } | null;
  target?: DebugTraceTarget | null;
  read_empty?: boolean;
  flags: string[];
}

export interface DebugTraceFlags {
  screenshotCount: number;
  screenshotBeforeRead: boolean;
  screenshotOnTextTask: boolean;
  repeatCalls: number;
  actionWithoutInspect: boolean;
  unverifiedActions: number;
  readEmpty: number;
  blocked: boolean;
  forbiddenLabels: string[];
}

/** 一轮任务实际消耗的模型 token；按每次 assistant 响应累加。 */
export interface DebugTraceUsage {
  /** 模型调用次数（每次 message_end 算一次）。 */
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export interface DebugTraceRun {
  id: string;
  startedAt: number;
  endedAt: number | null;
  prompt: string;
  model: {
    presetId: string;
    baseUrl: string;
    modelId: string;
    supportsImages: boolean;
  } | null;
  toolset: string[];
  page: { url: string; title: string } | null;
  steps: DebugTraceStep[];
  answer: string;
  status: 'running' | 'done' | 'error' | 'stopped';
  notes: string[];
  flags: DebugTraceFlags;
  /** 旧诊断包没有这个字段，读取时要按 0 处理。 */
  usage?: DebugTraceUsage;
}

export interface DebugTrace {
  version: 1;
  runs: DebugTraceRun[];
}

export interface SessionSnapshot {
  config: ProviderConfig | null;
  items: ChatItem[];
  trace: TraceEntry[];
  debugTrace: DebugTrace | null;
  busy: boolean;
  sessionId: string | null;
  title: SessionTitle;
}

export type UiToBg =
  | { type: 'hello' }
  | { type: 'send'; text: string; images?: ImageAttachment[] }
  | { type: 'capture_screenshot'; requestId: string }
  | { type: 'abort' }
  | { type: 'new_thread' }
  | { type: 'save_config'; config: ProviderConfig }
  | { type: 'list_models'; requestId: string; baseUrl: string; apiKey: string }
  | { type: 'list_sessions' }
  | { type: 'open_session'; id: string }
  | { type: 'rename_session'; id: string; title: string }
  | { type: 'delete_session'; id: string }
  | {
      type: 'respond_interaction';
      toolCallId: string;
      status: 'answered' | 'denied';
      always?: boolean;
      values?: Record<string, string>;
    };

export type BgToUi =
  | ({ type: 'ready' } & SessionSnapshot)
  | { type: 'config'; config: ProviderConfig | null }
  | {
      type: 'user_message';
      id: string;
      text: string;
      attachments?: ImageAttachment[];
    }
  | {
      type: 'screenshot_captured';
      requestId: string;
      result: CaptureResult;
    }
  | { type: 'assistant_start'; id: string }
  | { type: 'assistant_delta'; id: string; text: string }
  | { type: 'assistant_end'; id: string; text: string; error?: string }
  | {
      type: 'tool_start';
      id: string;
      toolCallId: string;
      name: string;
      args?: unknown;
      startedAt: number;
    }
  | {
      type: 'tool_end';
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      details?: unknown;
      images?: ToolImage[];
      durationMs?: number;
    }
  | { type: 'trace'; entry: TraceEntry }
  | { type: 'debug_trace'; trace: DebugTrace }
  | { type: 'busy'; value: boolean }
  | { type: 'interaction_open'; item: InteractionItem }
  | {
      type: 'interaction_settle';
      id: string;
      status: InteractionStatus;
      answers?: Record<string, string>;
    }
  | {
      type: 'session_switched';
      sessionId: string | null;
      title: SessionTitle;
      items: ChatItem[];
      trace: TraceEntry[];
      debugTrace: DebugTrace | null;
    }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'models'; requestId: string; models: string[] }
  | { type: 'models_error'; requestId: string; message: string }
  | { type: 'error'; message: string };

export const PORT_NAME = 'pagehand.sidepanel';
