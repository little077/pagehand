import {
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  ChevronDown,
  Files,
  FileText,
  Loader2,
  MessageCircleQuestion,
  MousePointerClick,
  TextSelect,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ToolItem } from '../lib/runs';
import { describeRun, formatDuration, formatElapsed, type RunView, toolLabel } from '../lib/runs';

const TOOL_ICONS: Record<string, typeof FileText> = {
  read_page: FileText,
  list_tabs: Files,
  read_tab: FileText,
  read_selection: TextSelect,
  inspect: MousePointerClick,
  screenshot: Camera,
  pdf: FileText,
  ask_user: MessageCircleQuestion,
};

function pretty(value: unknown): string {
  if (value === undefined) return '无';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusMark({ run }: { run: RunView }) {
  if (run.status === 'running') {
    return <Loader2 size={13} className="flex-shrink-0 animate-spin text-brand" />;
  }
  if (run.status === 'error') {
    return <AlertTriangle size={13} className="flex-shrink-0 text-danger" />;
  }
  if (run.status === 'stopped') {
    return <Ban size={13} className="flex-shrink-0 text-ink-faint" />;
  }
  return <CheckCircle2 size={13} className="flex-shrink-0 text-success" />;
}

function StepRow({
  tool,
  step,
  now,
  expanded,
  onToggle,
}: {
  tool: ToolItem;
  step: number;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = TOOL_ICONS[tool.name] ?? Wrench;
  const running = tool.status === 'running';
  const failed = tool.status === 'error';
  const duration = tool.durationMs ?? (running ? Math.max(0, now - tool.startedAt) : 0);
  const detailId = `step-detail-${tool.id}`;

  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-auto w-full justify-start gap-2 rounded-lg px-1.5 py-1.5 text-left"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`第 ${step} 步详情：${toolLabel(tool.name)}`}
      >
        <span
          className={cn(
            'flex size-5 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold tabular-nums',
            failed
              ? 'border-danger/30 bg-danger/10 text-danger'
              : running
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-line-strong bg-surface text-ink-soft',
          )}
        >
          {step}
        </span>
        <Icon
          size={12}
          strokeWidth={1.9}
          className={failed ? 'flex-shrink-0 text-danger' : 'flex-shrink-0 text-brand'}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10.5px] font-semibold text-ink">
            {toolLabel(tool.name)}
          </span>
          <span className="block truncate text-[9.5px] leading-relaxed text-ink-soft">
            {tool.summary}
          </span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1 text-[9px] tabular-nums text-ink-faint">
          {running && <Loader2 size={10} className="animate-spin" />}
          {tool.status === 'ok' && <CheckCircle2 size={10} className="text-success" />}
          {failed && <AlertTriangle size={10} className="text-danger" />}
          {formatDuration(duration)}
        </span>
        <ChevronDown
          size={11}
          className={cn(
            'flex-shrink-0 text-ink-faint transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </Button>

      {expanded && (
        <div
          id={detailId}
          className="mb-1.5 ml-8 mr-1 space-y-2 rounded-lg border border-line bg-surface px-2.5 py-2"
        >
          <div>
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
              参数
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-app p-2 text-[9px] leading-relaxed text-ink-soft">
              {pretty(tool.args)}
            </pre>
          </div>
          <div>
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
              结果
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-app p-2 text-[9px] leading-relaxed text-ink-soft">
              {pretty(tool.details)}
            </pre>
            {tool.images?.map((image) => (
              <img
                key={`${tool.id}-${image.mimeType}-${image.data.slice(0, 16)}`}
                src={`data:${image.mimeType};base64,${image.data}`}
                alt="工具截图"
                className="mt-2 max-h-72 w-full rounded-md border border-line object-contain"
              />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function AgentRun({ run }: { run: RunView }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  useEffect(() => {
    if (run.status === 'error') setOpen(true);
  }, [run.status]);

  useEffect(() => {
    if (run.status !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [run.status]);

  const elapsedMs =
    run.startedAt === null
      ? 0
      : Math.max(0, (run.status === 'running' ? now : (run.endedAt ?? now)) - run.startedAt);
  const bodyId = `run-body-${run.id}`;
  const failed = run.status === 'error';

  return (
    <div
      className={cn(
        'rounded-xl border',
        failed
          ? 'border-danger/25 bg-danger/[0.04]'
          : run.status === 'running'
            ? 'border-brand/25 bg-brand/[0.04]'
            : 'border-line bg-surface-soft/60',
      )}
    >
      <div className="flex items-center gap-1 pr-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (open) setExpandedToolId(null);
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          aria-controls={bodyId}
          className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-lg px-2.5 py-2 text-left hover:bg-transparent"
        >
          <StatusMark run={run} />
          <span className="truncate text-[11px] font-semibold text-ink">
            {describeRun(run, elapsedMs)}
          </span>
          {run.status === 'running' && run.startedAt !== null && (
            <span className="flex-shrink-0 text-[9px] tabular-nums text-ink-faint">
              {formatElapsed(elapsedMs)}
            </span>
          )}
          <ChevronDown
            size={13}
            className={cn(
              'ml-auto flex-shrink-0 text-ink-soft transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </div>

      {open && (
        <div id={bodyId} className="border-t border-line/70 px-2.5 pb-2.5 pt-2">
          {run.notes.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {run.notes.map((note) => (
                <p
                  key={note.id}
                  className="line-clamp-4 whitespace-pre-wrap break-words rounded-lg bg-ink/[0.03] px-2 py-1.5 text-[10px] leading-relaxed text-ink-soft"
                >
                  {note.text}
                </p>
              ))}
            </div>
          )}
          <ol className="space-y-1">
            {run.tools.map((tool, index) => (
              <StepRow
                key={tool.id}
                tool={tool}
                step={index + 1}
                now={now}
                expanded={expandedToolId === tool.id}
                onToggle={() =>
                  setExpandedToolId((current) => (current === tool.id ? null : tool.id))
                }
              />
            ))}
          </ol>
          {run.tools.length === 0 && (
            <p className="px-2 py-1.5 text-[10px] text-ink-faint">正在等模型返回…</p>
          )}
        </div>
      )}
    </div>
  );
}
