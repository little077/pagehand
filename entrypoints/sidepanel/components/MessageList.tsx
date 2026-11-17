import { useEffect, useMemo, useRef } from 'react';
import type { ChatItem } from '@/lib/ipc/protocol';
import { groupConversation, type UserItem } from '../lib/runs';
import { AgentRun } from './AgentRun';
import { AssistantBubble } from './AssistantBubble';

interface MessageListProps {
  items: ChatItem[];
  busy: boolean;
}

function UserBubble({ item }: { item: UserItem }) {
  const images = item.attachments ?? [];
  return (
    <div className="ph-rise flex flex-col items-end gap-2.5">
      {images.length > 0 ? (
        <div className="flex max-w-[86%] flex-wrap justify-end gap-1.5">
          {images.map((image) => (
            <img
              key={image.id}
              src={`data:${image.mimeType};base64,${image.data}`}
              alt="截图附件"
              className="max-h-44 max-w-full rounded-xl border border-line bg-surface object-contain shadow-sm"
            />
          ))}
        </div>
      ) : null}
      {item.text ? (
        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white shadow-sm">
          <p className="m-0 whitespace-pre-wrap">{item.text}</p>
        </div>
      ) : null}
    </div>
  );
}

export function MessageList({ items, busy }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => groupConversation(items, { busy }), [items, busy]);

  useEffect(() => {
    if (items.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  return (
    <div className="space-y-3 px-3.5 py-4">
      {blocks.map((block) => {
        if (block.kind === 'user') {
          return <UserBubble key={block.item.id} item={block.item} />;
        }

        const { run } = block;

        // 没有工具调用的纯问答不套运行块，保持简单对话的阅读节奏。
        if (run.tools.length === 0) {
          const waiting = run.status === 'running' && !run.answer && run.notes.length === 0;
          if (waiting) {
            return <AgentRun key={run.id} run={run} />;
          }
          return (
            <div key={run.id} className="space-y-3">
              {run.notes.map((note) => (
                <AssistantBubble key={note.id} item={note} />
              ))}
              {run.answer && <AssistantBubble item={run.answer} />}
            </div>
          );
        }

        return (
          <div key={run.id} className="space-y-3">
            <AgentRun run={run} />
            {run.answer && <AssistantBubble item={run.answer} />}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
