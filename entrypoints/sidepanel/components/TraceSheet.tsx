import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { TraceEntry } from '@/lib/ipc/protocol';

interface TraceSheetProps {
  open: boolean;
  entries: TraceEntry[];
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

export function TraceSheet({ open, entries, onClose }: TraceSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const ordered = [...entries].reverse();

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
        className="max-h-[80%] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface px-4 pb-5 pt-2.5 shadow-[0_-12px_40px_rgb(22_35_49_/_14%)]"
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
            aria-label="关闭运行记录"
          >
            <X size={16} />
          </button>
        </div>

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
      </div>
    </div>
  );
}
