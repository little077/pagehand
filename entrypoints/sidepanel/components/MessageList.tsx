import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatItem } from '@/lib/ipc/protocol';
import { ToolCard } from './ToolCard';

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.24s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.12s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint" />
    </span>
  );
}

function AssistantBubble({ item }: { item: Extract<ChatItem, { kind: 'assistant' }> }) {
  const empty = item.text.trim().length === 0;

  return (
    <div className="ph-rise flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 flex-shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-[9px] font-bold tracking-tight text-brand">
        PH
      </span>
      <div
        className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-3.5 py-3 shadow-[0_1px_0_rgb(29_55_76_/_3%)] ${
          item.status === 'error' ? 'border-danger/25 bg-danger/[0.04]' : 'border-line bg-surface'
        }`}
      >
        {empty && item.status === 'streaming' ? (
          <TypingDots />
        ) : (
          <div className="ph-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
            {item.status === 'streaming' && <span className="ph-caret" />}
          </div>
        )}
        {item.error && (
          <p className="mt-2 border-t border-danger/15 pt-2 text-[11px] leading-relaxed text-danger">
            {item.error}
          </p>
        )}
      </div>
    </div>
  );
}

export function MessageList({ items }: { items: ChatItem[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const visible = items.filter(
    (item) => item.kind !== 'assistant' || item.status !== 'done' || item.text.trim().length > 0,
  );
  let step = 0;

  useEffect(() => {
    if (items.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  return (
    <div className="space-y-3 px-3.5 py-4">
      {visible.map((item, index) => {
        if (item.kind === 'user') {
          step = 0;
          return (
            <div key={item.id} className="ph-rise flex justify-end">
              <div className="max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white shadow-sm">
                {item.text}
              </div>
            </div>
          );
        }
        if (item.kind === 'assistant') {
          return <AssistantBubble key={item.id} item={item} />;
        }
        step += 1;
        return (
          <ToolCard
            key={item.id}
            item={item}
            step={step}
            last={visible[index + 1]?.kind !== 'tool'}
          />
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
