import { useCallback, useEffect, useRef, useState } from 'react';
import { type Browser, browser } from 'wxt/browser';
import {
  type BgToUi,
  type ChatItem,
  PORT_NAME,
  type ProviderConfig,
  type TraceEntry,
  type UiToBg,
} from '@/lib/ipc/protocol';
import type { SessionSummary } from '@/lib/sessions/record';
import { Composer } from './components/Composer';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { MessageList } from './components/MessageList';
import { SessionsSheet } from './components/SessionsSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { Toast } from './components/Toast';
import { TraceSheet } from './components/TraceSheet';

type Connection = 'connecting' | 'ready' | 'lost';

interface PendingModelRequest {
  resolve: (models: string[]) => void;
  reject: (error: Error) => void;
  timer: number;
}

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;
const MODEL_LIST_TIMEOUT_MS = 20_000;

export default function App() {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [connectAttempt, setConnectAttempt] = useState(0);

  const portRef = useRef<Browser.runtime.Port | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const modelRequestsRef = useRef(new Map<string, PendingModelRequest>());

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptRef.current,
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      setConnectAttempt((attempt) => attempt + 1);
    }, delay);
  }, []);

  const failModelRequests = useCallback((reason: string) => {
    for (const [requestId, pending] of modelRequestsRef.current) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      modelRequestsRef.current.delete(requestId);
    }
  }, []);

  const requestModels = useCallback((baseUrl: string, apiKey: string) => {
    return new Promise<string[]>((resolve, reject) => {
      const port = portRef.current;
      if (!port) {
        reject(new Error('与后台的连接已断开，请稍后重试。'));
        return;
      }

      const requestId = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        modelRequestsRef.current.delete(requestId);
        reject(new Error('获取模型超时，请检查 Base URL 和网络。'));
      }, MODEL_LIST_TIMEOUT_MS);
      modelRequestsRef.current.set(requestId, { resolve, reject, timer });

      try {
        port.postMessage({
          type: 'list_models',
          requestId,
          baseUrl,
          apiKey,
        } satisfies UiToBg);
      } catch {
        window.clearTimeout(timer);
        modelRequestsRef.current.delete(requestId);
        reject(new Error('与后台的连接已断开，请稍后重试。'));
      }
    });
  }, []);

  const applyMessage = useCallback(
    (message: BgToUi) => {
      switch (message.type) {
        case 'ready':
          setConfig(message.config);
          setItems(message.items);
          setTrace(message.trace);
          setBusy(message.busy);
          setSessionId(message.sessionId);
          setConnection('ready');
          reconnectAttemptRef.current = 0;
          cancelReconnect();
          return;
        case 'config':
          setConfig(message.config);
          return;
        case 'user_message':
          setItems((previous) => [
            ...previous,
            { kind: 'user', id: message.id, text: message.text },
          ]);
          return;
        case 'assistant_start':
          setItems((previous) => [
            ...previous,
            { kind: 'assistant', id: message.id, text: '', status: 'streaming' },
          ]);
          return;
        case 'assistant_delta':
          setItems((previous) =>
            previous.map((item) =>
              item.kind === 'assistant' && item.id === message.id
                ? { ...item, text: item.text + message.text }
                : item,
            ),
          );
          return;
        case 'assistant_end':
          setItems((previous) =>
            previous.map((item) =>
              item.kind === 'assistant' && item.id === message.id
                ? {
                    ...item,
                    text: message.text,
                    status: message.error ? 'error' : 'done',
                    error: message.error,
                  }
                : item,
            ),
          );
          return;
        case 'tool_start':
          setItems((previous) => [
            ...previous,
            {
              kind: 'tool',
              id: message.id,
              toolCallId: message.toolCallId,
              name: message.name,
              args: message.args,
              status: 'running',
              summary: '正在执行…',
              startedAt: message.startedAt,
            },
          ]);
          return;
        case 'tool_end':
          setItems((previous) =>
            previous.map((item) =>
              item.kind === 'tool' && item.id === message.id
                ? {
                    ...item,
                    status: message.ok ? 'ok' : 'error',
                    summary: message.summary,
                    details: message.details,
                    durationMs: message.durationMs ?? Date.now() - item.startedAt,
                  }
                : item,
            ),
          );
          return;
        case 'trace':
          setTrace((previous) => [...previous, message.entry].slice(-100));
          return;
        case 'busy':
          setBusy(message.value);
          return;
        case 'session_switched':
          setItems(message.items);
          setTrace([]);
          setBusy(false);
          setSessionId(message.sessionId);
          return;
        case 'sessions':
          setSessions(message.sessions);
          setSessionsLoading(false);
          return;
        case 'models': {
          const pending = modelRequestsRef.current.get(message.requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          modelRequestsRef.current.delete(message.requestId);
          pending.resolve(message.models);
          return;
        }
        case 'models_error': {
          const pending = modelRequestsRef.current.get(message.requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          modelRequestsRef.current.delete(message.requestId);
          pending.reject(new Error(message.message));
          return;
        }
        case 'error':
          setToast(message.message);
          return;
      }
    },
    [cancelReconnect],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: connectAttempt 只作重连触发器，递增即重建 Port
  useEffect(() => {
    setConnection('connecting');
    const port = browser.runtime.connect({ name: PORT_NAME });
    portRef.current = port;

    const onMessage = (raw: unknown) => applyMessage(raw as BgToUi);
    const onDisconnect = () => {
      if (portRef.current === port) portRef.current = null;
      setConnection('lost');
      setBusy(false);
      failModelRequests('与后台的连接已断开，请重试。');
      scheduleReconnect();
    };

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage({ type: 'hello' } satisfies UiToBg);

    return () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      cancelReconnect();
      failModelRequests('与后台的连接已断开，请重试。');
      port.disconnect();
    };
  }, [applyMessage, cancelReconnect, connectAttempt, failModelRequests, scheduleReconnect]);

  useEffect(() => {
    if (!busy || connection !== 'ready') return;
    const timer = window.setInterval(() => {
      try {
        portRef.current?.postMessage({ type: 'ping' } satisfies UiToBg);
      } catch {
        // 端口已断开时由 onDisconnect 接管重连。
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, connection]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function send(text: string) {
    if (!config) {
      setSettingsOpen(true);
      return;
    }
    const port = portRef.current;
    if (!port) {
      setToast('后台连接已断开，正在自动重连。');
      return;
    }
    port.postMessage({ type: 'send', text } satisfies UiToBg);
  }

  function stop() {
    portRef.current?.postMessage({ type: 'abort' } satisfies UiToBg);
  }

  function newThread() {
    portRef.current?.postMessage({ type: 'new_thread' } satisfies UiToBg);
  }

  function openSessions() {
    setSessionsOpen(true);
    const port = portRef.current;
    if (!port) {
      setSessionsLoading(false);
      setToast('后台连接已断开，正在自动重连。');
      return;
    }
    setSessionsLoading(true);
    port.postMessage({ type: 'list_sessions' } satisfies UiToBg);
  }

  function openSession(id: string) {
    portRef.current?.postMessage({ type: 'open_session', id } satisfies UiToBg);
    setSessionsOpen(false);
  }

  function renameSession(id: string, title: string) {
    portRef.current?.postMessage({ type: 'rename_session', id, title } satisfies UiToBg);
  }

  function deleteSession(id: string) {
    setSessionsLoading(true);
    portRef.current?.postMessage({ type: 'delete_session', id } satisfies UiToBg);
  }

  function saveConfig(next: ProviderConfig) {
    portRef.current?.postMessage({ type: 'save_config', config: next } satisfies UiToBg);
    setSettingsOpen(false);
  }

  function reconnectNow() {
    cancelReconnect();
    reconnectAttemptRef.current = 0;
    setConnectAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-app text-ink">
      <Header
        connection={connection}
        hasThread={items.length > 0}
        onNewThread={newThread}
        onOpenTrace={() => setTraceOpen(true)}
        onOpenSessions={openSessions}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {connection === 'lost' && (
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-warning/25 bg-warning/[0.08] px-3.5 py-1.5 text-[10.5px] text-warning">
          与后台的连接已断开，正在自动重连…
          <button
            type="button"
            onClick={reconnectNow}
            className="font-semibold underline underline-offset-2"
          >
            立即重连
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <Home
            configured={Boolean(config)}
            onPick={send}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <MessageList items={items} />
        )}
      </main>

      <Composer
        busy={busy}
        configured={Boolean(config)}
        onSend={send}
        onStop={stop}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsSheet
        open={settingsOpen}
        config={config}
        onClose={() => setSettingsOpen(false)}
        onSave={saveConfig}
        onListModels={requestModels}
      />
      <TraceSheet open={traceOpen} entries={trace} onClose={() => setTraceOpen(false)} />
      <SessionsSheet
        open={sessionsOpen}
        sessions={sessions}
        currentId={sessionId}
        loading={sessionsLoading}
        onClose={() => setSessionsOpen(false)}
        onOpen={openSession}
        onRename={renameSession}
        onDelete={deleteSession}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
