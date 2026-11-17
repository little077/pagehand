import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatItem } from '@/lib/ipc/protocol';
import { cn } from '@/lib/utils';

type AssistantItem = Extract<ChatItem, { kind: 'assistant' }>;

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.24s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.12s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-ink-faint" />
    </span>
  );
}

export function AssistantBubble({ item }: { item: AssistantItem }) {
  const empty = item.text.trim().length === 0;

  return (
    <div className="ph-rise flex items-start gap-2.5">
      <img
        src="/pagehand-avatar.png"
        alt=""
        aria-hidden="true"
        className="mt-0.5 size-6 flex-shrink-0 rounded-lg border border-line-strong bg-surface object-cover"
      />
      <div
        className={cn(
          'min-w-0 flex-1 rounded-2xl rounded-tl-md border px-3.5 py-3 shadow-[0_1px_0_rgb(29_55_76_/_3%)]',
          item.status === 'error' ? 'border-danger/25 bg-danger/[0.04]' : 'border-line bg-surface',
        )}
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
