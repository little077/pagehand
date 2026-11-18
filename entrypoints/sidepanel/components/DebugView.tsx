import { ArrowLeft, Bot, Bug } from 'lucide-react';
import { debugEnvConfig } from '@/lib/config/debug-env';
import { DEBUG_ROUTES, type DebugRoute, debugHash } from '@/lib/debug/routes';
import { cn } from '@/lib/utils';

interface DebugViewProps {
  route: DebugRoute;
  onClose: () => void;
  sessionId: string | null;
  itemCount: number;
}

export function DebugView({ route, onClose, sessionId, itemCount }: DebugViewProps) {
  const configSource = debugEnvConfig() ? 'ENV' : '页面';

  return (
    <div className="flex h-full min-h-0 flex-col bg-app text-ink">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-white/10 bg-black px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={13} />
          返回聊天
        </button>
        <span className="ml-1 flex items-center gap-1.5 font-mono text-[10px] font-bold text-red-500">
          <Bug size={13} />
          debug 模式
        </span>
        <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[8px] font-semibold tracking-wide text-white/55">
          DEV ONLY
        </span>
      </header>

      {DEBUG_ROUTES.length > 0 && (
        <nav
          className="flex flex-shrink-0 items-center gap-1 border-b border-line bg-surface/70 px-3 py-1.5"
          aria-label="调试模块"
        >
          {DEBUG_ROUTES.map((item) => {
            const active = item.id === route.id;
            return (
              <a
                key={item.id}
                href={debugHash(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-md border px-2 text-[9.5px] font-semibold transition',
                  active
                    ? 'border-brand/35 bg-brand/[0.06] text-brand-strong'
                    : 'border-transparent text-ink-soft hover:border-line hover:bg-surface hover:text-ink',
                )}
              >
                <Bot size={11} />
                {item.title}
              </a>
            );
          })}
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <section className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-[16px] font-semibold text-ink">{route.title}</h2>
            <span className="font-mono text-[8.5px] text-ink-faint">{debugHash(route.id)}</span>
          </div>
          <p className="text-[9.5px] leading-relaxed text-ink-soft">{route.description}</p>
          <p className="mt-1.5 font-mono text-[8.5px] text-ink-faint">
            当前会话：{sessionId ?? '新会话（未落盘）'} · {itemCount} 条消息 · 配置：{configSource}
          </p>
        </section>

        <section className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-10 text-center">
          <Bug size={20} className="mb-2 text-ink-faint" />
          <p className="text-[11px] font-semibold text-ink">还没有接入调试模块</p>
          <p className="mt-1 max-w-[220px] text-[9.5px] leading-relaxed text-ink-faint">
            在 `lib/debug/routes.ts` 注册路由，再在 `DebugView` 里按路由渲染面板。
          </p>
        </section>
      </div>
    </div>
  );
}
