import { Activity, Hand, History, RotateCcw, Settings2 } from 'lucide-react';

interface HeaderProps {
  connection: 'connecting' | 'ready' | 'lost';
  hasThread: boolean;
  onNewThread: () => void;
  onOpenTrace: () => void;
  onOpenSessions: () => void;
  onOpenSettings: () => void;
}

const CONNECTION_LABEL: Record<HeaderProps['connection'], string> = {
  connecting: '连接中',
  ready: '只读模式',
  lost: '已断开',
};

const CONNECTION_COLOR: Record<HeaderProps['connection'], string> = {
  connecting: 'bg-warning',
  ready: 'bg-success',
  lost: 'bg-danger',
};

export function Header({
  connection,
  hasThread,
  onNewThread,
  onOpenTrace,
  onOpenSessions,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface/90 px-3.5 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-[10px] border border-line-strong bg-surface-soft text-brand">
          <Hand size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-serif text-[16px] font-semibold leading-none tracking-tight text-ink">
              Pagehand
            </h1>
            <span className="rounded-full border border-line bg-app px-1.5 py-px text-[9px] font-medium tracking-wide text-ink-soft">
              页工
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] leading-none text-ink-soft">
            <span className={`size-1.5 rounded-full ${CONNECTION_COLOR[connection]}`} />
            {CONNECTION_LABEL[connection]}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        {hasThread && (
          <button
            type="button"
            onClick={onNewThread}
            className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
            title="开始新会话"
            aria-label="开始新会话"
          >
            <RotateCcw size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSessions}
          className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
          title="历史会话"
          aria-label="历史会话"
        >
          <History size={15} />
        </button>
        <button
          type="button"
          onClick={onOpenTrace}
          className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
          title="运行记录"
          aria-label="运行记录"
        >
          <Activity size={15} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
          title="模型设置"
          aria-label="模型设置"
        >
          <Settings2 size={15} />
        </button>
      </div>
    </header>
  );
}
