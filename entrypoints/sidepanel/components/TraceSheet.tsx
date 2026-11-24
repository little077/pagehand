import { Download, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ChatItem, DebugTrace, DebugTraceRun, TraceEntry } from '@/lib/ipc/protocol';
import { cn } from '@/lib/utils';
import { buildTraceArchive, downloadTraceArchive } from '../lib/debug-export';

interface TraceSheetProps {
  open: boolean;
  entries: TraceEntry[];
  debugTrace: DebugTrace | null;
  items: ChatItem[];
  debugEnabled: boolean;
  onClose: () => void;
}

const DOT_COLOR: Record<TraceEntry['kind'], string> = {
  run: 'bg-brand',
  tool: 'bg-success',
  error: 'bg-danger',
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function pretty(value: unknown): string {
  if (value === undefined) return '无';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusLabel(status: DebugTraceRun['status']): string {
  if (status === 'running') return '运行中';
  if (status === 'error') return '失败';
  if (status === 'stopped') return '已停止';
  return '已完成';
}

function Flag({ label, value, bad }: { label: string; value: string | number; bad: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] tabular-nums',
        bad ? 'border-warning/35 bg-warning/[0.08] text-ink' : 'border-line bg-app text-ink-soft',
      )}
    >
      <span>{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

function RunSummary({ run }: { run: DebugTraceRun }) {
  const flags = run.flags;
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-line bg-app px-2.5 py-2">
        <p className="text-[10px] font-semibold leading-relaxed text-ink">{run.prompt}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-ink-soft">
          <span>模型：{run.model?.modelId ?? '未配置'}</span>
          <span>图片能力：{run.model?.supportsImages ? '开' : '关'}</span>
          <span>状态：{statusLabel(run.status)}</span>
          <span>步骤：{run.steps.length}</span>
          <span>耗时：{run.endedAt ? `${run.endedAt - run.startedAt} ms` : '进行中'}</span>
        </div>
        {run.page && (
          <p className="mt-1 truncate text-[9px] text-ink-faint" title={run.page.url}>
            页面：{run.page.title || '（无标题）'} · {run.page.url}
          </p>
        )}
        {run.usage && run.usage.calls > 0 && (
          <p className="mt-1 text-[9px] tabular-nums text-ink-soft">
            {run.usage.totalTokens > 0
              ? `Token：${run.usage.calls} 次调用 · 输入 ${run.usage.input} · 输出 ${run.usage.output} · 合计 ${run.usage.totalTokens}${
                  run.usage.cacheRead > 0 ? `（缓存命中 ${run.usage.cacheRead}）` : ''
                }`
              : `Token：${run.usage.calls} 次调用 · 供应商未返回用量`}
          </p>
        )}
        {run.notes.length > 0 && (
          <p className="mt-1 text-[9px] text-warning">备注：{run.notes.join('；')}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <Flag label="截图" value={flags.screenshotCount} bad={flags.screenshotCount > 0} />
        <Flag
          label="截图早于读取"
          value={flags.screenshotBeforeRead ? '是' : '否'}
          bad={flags.screenshotBeforeRead}
        />
        <Flag
          label="文字任务截图"
          value={flags.screenshotOnTextTask ? '是' : '否'}
          bad={flags.screenshotOnTextTask}
        />
        <Flag label="重复调用" value={flags.repeatCalls} bad={flags.repeatCalls > 0} />
        <Flag
          label="未 inspect 先操作"
          value={flags.actionWithoutInspect ? '是' : '否'}
          bad={flags.actionWithoutInspect}
        />
        <Flag
          label="操作未验证"
          value={flags.unverifiedActions}
          bad={flags.unverifiedActions > 0}
        />
        <Flag label="读取为空" value={flags.readEmpty} bad={flags.readEmpty > 0} />
        <Flag label="疑似阻塞" value={flags.blocked ? '是' : '否'} bad={flags.blocked} />
        {flags.forbiddenLabels.length > 0 && (
          <Flag label="敏感目标" value={flags.forbiddenLabels.join('、')} bad />
        )}
      </div>

      <ol className="space-y-1">
        {run.steps.map((step) => (
          <li key={`${run.id}-${step.seq}`}>
            <details className="group rounded-lg border border-line bg-app px-2 py-1.5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[9.5px]">
                <span className="w-4 flex-shrink-0 text-right tabular-nums text-ink-faint">
                  {step.seq}
                </span>
                <span className="font-semibold text-ink">{step.tool}</span>
                <span className="rounded bg-surface px-1 py-px text-[8.5px] text-ink-soft">
                  {step.channel}
                </span>
                <span
                  className={cn(
                    'rounded px-1 py-px text-[8.5px]',
                    step.status === 'error'
                      ? 'bg-danger/10 text-danger'
                      : step.status === 'ok'
                        ? 'bg-success/10 text-success'
                        : 'bg-brand/10 text-brand',
                  )}
                >
                  {step.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-soft">{step.summary}</span>
                <span className="flex-shrink-0 tabular-nums text-ink-faint">
                  {step.durationMs ?? 0} ms
                </span>
              </summary>
              <div className="mt-1.5 space-y-1.5 border-t border-line/70 pt-1.5">
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-1.5 text-[8.5px] leading-relaxed text-ink-soft">
                  参数：{pretty(step.args)}
                </pre>
                {step.resultPreview && (
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-1.5 text-[8.5px] leading-relaxed text-ink-soft">
                    结果：{step.resultPreview}
                  </pre>
                )}
                {step.errorCode && (
                  <p className="text-[8.5px] text-danger">错误码：{step.errorCode}</p>
                )}
                {step.target?.label && (
                  <p className="text-[8.5px] text-ink-faint">
                    目标：{step.target.role ?? step.target.tag}「{step.target.label}」
                  </p>
                )}
                {step.images.length > 0 && (
                  <p className="text-[8.5px] text-ink-faint">
                    图片：{step.images.length} 张 ·{' '}
                    {step.images.reduce((sum, image) => sum + image.bytes, 0)} 字节
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
        {run.steps.length === 0 && (
          <li className="rounded-lg border border-dashed border-line px-2 py-3 text-center text-[9px] text-ink-faint">
            还没有工具调用。
          </li>
        )}
      </ol>
    </div>
  );
}

export function TraceSheet({
  open,
  entries,
  debugTrace,
  items,
  debugEnabled,
  onClose,
}: TraceSheetProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const runs = debugTrace?.runs ?? [];
  const latestRunId = runs.at(-1)?.id ?? null;

  useEffect(() => {
    // 新一轮开始时自动跳到最新；用户手动选旧轮次时 latestRunId 不变，不会被抢回。
    setSelectedRunId(latestRunId);
  }, [latestRunId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs.at(-1) ?? null,
    [runs, selectedRunId],
  );

  if (!open) return null;

  const ordered = [...entries].reverse();
  const canExport = debugEnabled && debugTrace !== null && runs.length > 0;

  function exportTrace(): void {
    if (!debugTrace) return;
    setExporting(true);
    setExportError(null);
    try {
      downloadTraceArchive(buildTraceArchive(debugTrace, items));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点击遮罩关闭只是鼠标增强，键盘路径是 Escape 和关闭按钮
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-ink/25 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="运行记录"
        className="max-h-[86%] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface px-4 pb-5 pt-2.5 shadow-[0_-12px_40px_rgb(22_35_49_/_14%)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[18px] font-semibold tracking-tight text-ink">
              运行记录
            </h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">
              这一轮 Agent 收到的任务、调用的工具和错误，按时间倒序。
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {canExport && (
              <button
                type="button"
                onClick={exportTrace}
                disabled={exporting}
                className="flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[9.5px] font-semibold text-ink-soft transition hover:border-brand/40 hover:text-ink disabled:opacity-50"
                aria-label="导出开发者诊断包"
              >
                <Download size={12} />
                {exporting ? '打包中…' : '导出诊断包'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
              aria-label="关闭运行记录"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {canExport && selectedRun && (
          <section className="mb-4 rounded-xl border border-brand/25 bg-brand/[0.03] p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-semibold text-ink">开发者诊断</h3>
                <p className="mt-0.5 text-[9px] text-ink-faint">
                  仅 debug 模式可见，不会进入模型上下文；导出包含 trace.json、summary.md 和截图。
                </p>
              </div>
              {runs.length > 1 && (
                <Select value={selectedRun.id} onValueChange={(value) => setSelectedRunId(value)}>
                  <SelectTrigger className="h-7 w-32 text-[9px]" aria-label="选择运行轮次">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {runs
                      .slice()
                      .reverse()
                      .map((run, index) => (
                        <SelectItem key={run.id} value={run.id} className="text-[10px]">
                          {index === 0 ? '最新' : `第 ${runs.length - index} 轮`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <RunSummary run={selectedRun} />
            {exportError && <p className="mt-2 text-[9px] text-danger">导出失败：{exportError}</p>}
          </section>
        )}

        {debugEnabled && debugTrace && runs.length === 0 && (
          <p className="mb-4 rounded-xl border border-dashed border-line bg-app px-3 py-4 text-center text-[10px] text-ink-faint">
            还没有结构化诊断。发出第一条任务后，这里会出现工具链、flags 和导出按钮。
          </p>
        )}

        <details className="group" open>
          <summary className="mb-2 cursor-pointer list-none text-[10px] font-semibold text-ink-soft">
            事件时间线
          </summary>
          {ordered.length === 0 ? (
            <p className="rounded-xl bg-app px-3 py-8 text-center text-[11px] text-ink-faint">
              还没有运行记录。发出第一条任务后，这里会显示每一步。
            </p>
          ) : (
            <ol className="ml-1 border-l border-line pl-3">
              {ordered.map((entry) => (
                <li key={entry.id} className="relative pb-3 last:pb-0">
                  <span
                    className={`absolute -left-[17px] top-1 size-2 rounded-full border-2 border-surface ${DOT_COLOR[entry.kind]}`}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-ink">{entry.title}</span>
                    <time className="flex-shrink-0 text-[9px] tabular-nums text-ink-faint">
                      {formatTime(entry.at)}
                    </time>
                  </div>
                  {entry.detail && (
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink-soft">
                      {entry.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </details>
      </div>
    </div>
  );
}
