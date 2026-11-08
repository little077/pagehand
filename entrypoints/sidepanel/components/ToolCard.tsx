import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Loader2, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { ChatItem } from '@/lib/ipc/protocol';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const TOOL_LABELS: Record<string, string> = {
  read_page: '读取当前页面',
};

const TOOL_ICONS: Record<string, typeof FileText> = {
  read_page: FileText,
};

export function ToolCard({ item }: { item: ToolItem }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[item.name] ?? item.name;
  const Icon = TOOL_ICONS[item.name] ?? Wrench;
  const running = item.status === 'running';
  const failed = item.status === 'error';
  const hasDetails = item.details !== undefined && item.details !== null;

  return (
    <div
      className={`ph-rise rounded-xl border px-3 py-2 ${
        failed
          ? 'border-danger/25 bg-danger/[0.04]'
          : running
            ? 'border-brand/25 bg-brand/[0.04]'
            : 'border-line bg-surface-soft/60'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex size-6 flex-shrink-0 items-center justify-center rounded-lg ${
            failed ? 'bg-danger/10 text-danger' : 'bg-brand/10 text-brand'
          }`}
        >
          <Icon size={13} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-ink">{label}</span>
            <span className="flex items-center gap-1 text-[9.5px] text-ink-soft">
              {running && <Loader2 size={11} className="animate-spin" />}
              {item.status === 'ok' && <CheckCircle2 size={11} className="text-success" />}
              {failed && <AlertTriangle size={11} className="text-danger" />}
              {running ? '执行中' : failed ? '失败' : '完成'}
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-soft">{item.summary}</p>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 flex items-center gap-0.5 text-[9.5px] font-medium text-brand transition hover:text-brand-strong"
            >
              查看详情
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
    </div>
  );
}
