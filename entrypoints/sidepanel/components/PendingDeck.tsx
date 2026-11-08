import { ChevronUp, MessageCircleQuestion } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { InteractionItem } from '@/lib/ipc/protocol';
import { InteractionCard, type InteractionCardProps } from './InteractionCard';

interface PendingDeckProps {
  /** 按调用顺序排好的待处理卡片。 */
  items: InteractionItem[];
  onRespond: InteractionCardProps['onRespond'];
}

/**
 * 待处理区贴在面板底部：展开时整块盖住输入框（同宽同内边距，不占对话流高度），
 * 收起时缩成一条 pill 悬在输入框上方，把输入框让出来。
 * 一次只露一张，处理完下一张才上来，免得用户把两张卡片的答案填串。
 */
export function PendingDeck({ items, onRespond }: PendingDeckProps) {
  const head = items[0];
  // 收起状态按卡片 id 记：换一张卡片自然回到展开，不需要 effect 同步。
  const [collapsedId, setCollapsedId] = useState<string | null>(null);

  if (!head) return null;

  const collapsed = collapsedId === head.toolCallId;
  const queue = items.length > 1 ? `1 / ${items.length}` : undefined;
  const summary = head.questions?.[0]?.question ?? head.title;

  if (collapsed) {
    return (
      <div className="absolute inset-x-0 bottom-full z-30 px-3 pb-2">
        <Button
          variant="ghost"
          onClick={() => setCollapsedId(null)}
          className="flex h-auto w-full items-center gap-1.5 rounded-xl border border-brand/35 bg-surface px-2.5 py-1.5 text-left text-[10.5px] font-medium text-brand shadow-[0_4px_14px_rgb(22_35_49_/_8%)] hover:border-brand/55 hover:bg-surface"
        >
          <MessageCircleQuestion size={11} className="flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          {queue && (
            <span className="flex-shrink-0 tabular-nums text-[9.5px] text-ink-faint">{queue}</span>
          )}
          <span className="flex flex-shrink-0 items-center gap-0.5 text-[9.5px]">
            展开
            <ChevronUp size={11} />
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-y-auto bg-app/95 px-3 pb-2.5 pt-3 backdrop-blur">
      <InteractionCard
        item={head}
        queue={queue}
        onRespond={onRespond}
        onCollapse={() => setCollapsedId(head.toolCallId)}
      />
    </div>
  );
}
