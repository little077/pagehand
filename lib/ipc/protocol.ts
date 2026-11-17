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

export interface SessionSnapshot {
  config: ProviderConfig | null;
  items: ChatItem[];
  trace: TraceEntry[];
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
  | { type: 'busy'; value: boolean }
  | { type: 'interaction_open'; item: InteractionItem }
  | {
      type: 'interaction_settle';
      id: string;
      status: InteractionStatus;
      answers?: Record<string, string>;
    }
  | { type: 'session_switched'; sessionId: string | null; title: SessionTitle; items: ChatItem[] }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'models'; requestId: string; models: string[] }
  | { type: 'models_error'; requestId: string; message: string }
  | { type: 'error'; message: string };

export const PORT_NAME = 'pagehand.sidepanel';
