export interface ProviderConfig {
  presetId: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
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
      name: string;
      args?: unknown;
      status: 'running' | 'ok' | 'error';
      summary: string;
      details?: unknown;
    };

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
}

export type UiToBg =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'send'; text: string }
  | { type: 'abort' }
  | { type: 'new_thread' }
  | { type: 'save_config'; config: ProviderConfig };

export type BgToUi =
  | ({ type: 'ready' } & SessionSnapshot)
  | { type: 'config'; config: ProviderConfig | null }
  | { type: 'user_message'; id: string; text: string }
  | { type: 'assistant_start'; id: string }
  | { type: 'assistant_delta'; id: string; text: string }
  | { type: 'assistant_end'; id: string; text: string; error?: string }
  | { type: 'tool_start'; id: string; name: string; args?: unknown }
  | { type: 'tool_end'; id: string; name: string; ok: boolean; summary: string; details?: unknown }
  | { type: 'trace'; entry: TraceEntry }
  | { type: 'busy'; value: boolean }
  | { type: 'cleared' }
  | { type: 'error'; message: string };

export const PORT_NAME = 'pagehand.sidepanel';
