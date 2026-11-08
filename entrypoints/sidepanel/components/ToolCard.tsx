import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Files,
  FileText,
  Loader2,
  TextSelect,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChatItem } from '@/lib/ipc/protocol';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const TOOL_LABELS: Record<string, string> = {
  read_page: '读取当前页面',
  list_tabs: '列出标签页',
  read_tab: '读取指定标签页',
  read_selection: '读取选中文本',
};

const TOOL_ICONS: Record<string, typeof FileText> = {
  read_page: FileText,
  list_tabs: Files,
  read_tab: FileText,
  read_selection: TextSelect,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCard({ item, step, last }: { item: ToolItem; step: number; last: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const running = item.status === 'running';
  const failed = item.status === 'error';
  const hasDetails = item.details !== undefined && item.details !== null;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  const label = TOOL_LABELS[item.name] ?? item.name;
  const Icon = TOOL_ICONS[item.name] ?? Wrench;
  const elapsedMs = item.durationMs ?? Math.max(0, now - item.startedAt);

  return (
    <div className="relative flex gap-2.5">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute -bottom-3 left-[11px] top-6 w-px bg-line-strong/70"
        />
      )}
      <span
        className={`z-10 flex size-6 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums ${
          failed
            ? 'border-danger/30 bg-danger/10 text-danger'
            : running
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line-strong bg-surface text-ink-soft'
        }`}
      >
        {step}
      </span>

      <div
        className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${
          failed
            ? 'border-danger/25 bg-danger/[0.04]'
            : running
              ? 'border-brand/25 bg-brand/[0.04]'
              : 'border-line bg-surface-soft/60'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Icon
            size={12}
            strokeWidth={1.9}
            className={failed ? 'flex-shrink-0 text-danger' : 'flex-shrink-0 text-brand'}
          />
          <span className="truncate text-[11px] font-semibold text-ink">{label}</span>
          <span className="ml-auto flex flex-shrink-0 items-center gap-1 text-[9.5px] text-ink-soft">
            {running && <Loader2 size={11} className="animate-spin" />}
            {item.status === 'ok' && <CheckCircle2 size={11} className="text-success" />}
            {failed && <AlertTriangle size={11} className="text-danger" />}
            <span>{running ? '执行中' : failed ? '失败' : '完成'}</span>
            <span className="text-ink-faint">·</span>
            <span className="tabular-nums text-ink-faint">{formatDuration(elapsedMs)}</span>
          </span>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-soft">{item.summary}</p>
        {hasDetails && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 flex items-center gap-0.5 text-[9.5px] font-medium text-brand transition hover:text-brand-strong"
          >
            {expanded ? '收起详情' : '查看详情'}
            <ChevronDown
              size={10}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
        {hasDetails && expanded && (
          <pre className="mt-1.5 max-h-44 overflow-auto rounded-lg bg-ink/[0.04] p-2 text-[9.5px] leading-relaxed text-ink-soft">
            {JSON.stringify(item.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
