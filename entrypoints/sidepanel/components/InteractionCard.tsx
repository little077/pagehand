import {
  ArrowLeft,
  Check,
  ChevronDown,
  CornerDownLeft,
  KeyRound,
  MessageCircleQuestion,
  Pencil,
  X,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AskQuestion } from '@/lib/agent/interactions';
import type { InteractionItem } from '@/lib/ipc/protocol';
import { cn } from '@/lib/utils';

export interface InteractionCardProps {
  item: InteractionItem;
  /** 队列位置，例如「1 / 2」；只有一张时不传。 */
  queue?: string;
  onRespond: (
    toolCallId: string,
    payload: { status: 'answered' | 'denied'; always?: boolean; values?: Record<string, string> },
  ) => void;
  /** 收起卡片、把输入框露出来；不传就不显示收起按钮。 */
  onCollapse?: () => void;
}

/** 选项行 + 末行自由输入，光标可以在这些行之间移动。 */
type CursorTarget = { kind: 'option'; index: number } | { kind: 'free' };

export function InteractionCard({ item, queue, onRespond, onCollapse }: InteractionCardProps) {
  const isPermission = item.mode === 'permission';
  const questions = item.questions ?? [];
  const Icon = isPermission ? KeyRound : MessageCircleQuestion;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [cursor, setCursor] = useState<CursorTarget>({ kind: 'option', index: 0 });
  const shellRef = useRef<HTMLDivElement>(null);
  const freeRef = useRef<HTMLInputElement>(null);

  const question: AskQuestion | undefined = questions[step];
  const options = question?.options ?? [];
  const questionKey = question?.id;
  // 没给选项的问题只剩自由输入，光标就固定在那一行。
  const rowCount = options.length > 0 ? options.length + 1 : 1;
  const cursorOnFree = cursor.kind === 'free' || cursor.index >= options.length;

  // 换题后把焦点收回卡片，方向键和数字键才继续可用。
  useEffect(() => {
    if (isPermission || !questionKey) return;
    shellRef.current?.focus();
  }, [isPermission, questionKey]);

  function submit(values: Record<string, string>) {
    onRespond(item.toolCallId, { status: 'answered', values });
  }

  function skip() {
    onRespond(item.toolCallId, { status: 'denied' });
  }

  function answerCurrent(value: string) {
    if (!question) return;
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    if (step + 1 < questions.length) {
      setStep(step + 1);
      setPicked([]);
      setDraft('');
      setCursor({ kind: 'option', index: 0 });
      return;
    }
    submit(next);
  }

  function toggleOption(label: string) {
    if (!question?.multiple) {
      answerCurrent(label);
      return;
    }
    setPicked((previous) =>
      previous.includes(label) ? previous.filter((value) => value !== label) : [...previous, label],
    );
  }

  function commitMultiple() {
    if (picked.length === 0 && !draft.trim()) return;
    answerCurrent(draft.trim() || picked.join('、'));
  }

  function commitFreeText() {
    const value = draft.trim();
    if (!value) return;
    answerCurrent(question?.multiple ? [...picked, value].join('、') : value);
  }

  function moveCursor(delta: number) {
    setCursor((previous) => {
      const max = rowCount - 1;
      const current = previous.kind === 'free' ? max : Math.min(previous.index, max);
      const next = Math.max(0, Math.min(max, current + delta));
      return next >= options.length ? { kind: 'free' } : { kind: 'option', index: next };
    });
  }

  function activateCursor() {
    if (cursorOnFree) {
      if (question?.multiple && picked.length > 0) {
        commitMultiple();
        return;
      }
      freeRef.current?.focus();
      return;
    }
    const option = options[cursor.index];
    if (option) toggleOption(option.label);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isPermission) return;
    // 正在自由输入时，键盘归输入框自己管。
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (event.nativeEvent.isComposing) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
      event.preventDefault();
      const option = options[digit - 1];
      if (option) toggleOption(option.label);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        moveCursor(event.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'Enter':
        event.preventDefault();
        if (question?.multiple) commitMultiple();
        else activateCursor();
        return;
      case 'Escape':
        event.preventDefault();
        if (onCollapse) onCollapse();
        else skip();
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={isPermission ? '操作授权' : '等你回答'}
      className="ph-rise rounded-2xl border border-brand/35 bg-surface p-3 shadow-[0_8px_24px_rgb(22_35_49_/_10%)] outline-none focus-visible:border-brand/55"
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} strokeWidth={1.9} className="flex-shrink-0 text-brand" />
        <span className="truncate text-[11px] font-medium text-ink-soft">{item.title}</span>
        <span className="ml-auto flex flex-shrink-0 items-center gap-1.5 text-[9.5px] text-ink-faint">
          {queue && <span className="tabular-nums">{queue}</span>}
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCollapse}
              aria-label="收起卡片，先回到输入框"
              className="size-5 rounded-md"
            >
              <ChevronDown size={12} />
            </Button>
          )}
        </span>
      </div>

      {isPermission ? (
        <>
          <p className="mt-2 text-[12px] font-semibold leading-relaxed text-ink">{item.reason}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={() => onRespond(item.toolCallId, { status: 'answered' })}>
              仅本次允许
            </Button>
            {item.grantOrigin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRespond(item.toolCallId, { status: 'answered', always: true })}
              >
                始终允许 {item.grantOrigin.replace(/^\w+:\/\//, '')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={skip}
            >
              <X size={11} />
              拒绝
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-2.5">
          {question && (
            <>
              <p className="whitespace-pre-line text-[12.5px] font-semibold leading-relaxed text-ink">
                {question.question}
              </p>
              {question.message && (
                <p className="mt-1 whitespace-pre-line text-[10.5px] leading-relaxed text-ink-soft">
                  {question.message}
                </p>
              )}
              {question.multiple && (
                <p className="mt-1 text-[9.5px] text-ink-faint">
                  可多选，选完按 Enter 或点「下一步」
                </p>
              )}
            </>
          )}

          {options.length > 0 && (
            <div role="listbox" aria-label="选项" className="mt-2 space-y-1">
              {options.map((option, index) => {
                const highlighted = !cursorOnFree && cursor.index === index;
                const chosen = question?.multiple
                  ? picked.includes(option.label)
                  : answers[question?.id ?? ''] === option.label;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onMouseEnter={() => setCursor({ kind: 'option', index })}
                    onClick={() => toggleOption(option.label)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition',
                      highlighted ? 'bg-surface-soft' : 'hover:bg-surface-soft/70',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition',
                        chosen
                          ? 'border-brand bg-brand text-white'
                          : highlighted
                            ? 'border-brand/45 bg-surface text-brand'
                            : 'border-line-strong bg-surface text-ink-soft',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11.5px] font-medium text-ink">
                          {option.label}
                        </span>
                        {option.recommended && (
                          <span className="flex-shrink-0 rounded-full border border-line bg-app px-1.5 py-px text-[9px] text-ink-soft">
                            推荐
                          </span>
                        )}
                      </span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-[10px] text-ink-soft">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {question?.multiple ? (
                      <Check
                        size={12}
                        className={cn(
                          'flex-shrink-0 text-brand transition',
                          chosen ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    ) : (
                      highlighted && (
                        <CornerDownLeft size={12} className="flex-shrink-0 text-ink-faint" />
                      )
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className={cn(
              'mt-1 flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition',
              cursorOnFree && 'bg-surface-soft',
            )}
          >
            <span
              className={cn(
                'flex size-6 flex-shrink-0 items-center justify-center rounded-full border',
                cursorOnFree ? 'border-brand/45 text-brand' : 'border-line-strong text-ink-faint',
              )}
            >
              <Pencil size={11} />
            </span>
            <Input
              ref={freeRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setCursor({ kind: 'free' })}
              onMouseEnter={() => setCursor({ kind: 'free' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (question?.multiple) commitMultiple();
                  else commitFreeText();
                }
              }}
              placeholder="输入其他答案"
              aria-label="输入其他答案"
              className="h-7 min-w-0 flex-1 rounded-none border-0 border-b border-dashed bg-transparent px-0 text-[11.5px] focus-visible:border-brand/60 focus-visible:ring-0"
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[10px]"
                  onClick={() => {
                    setStep(Math.max(0, step - 1));
                    setPicked([]);
                    setDraft('');
                    setCursor({ kind: 'option', index: 0 });
                  }}
                >
                  <ArrowLeft size={11} />
                  上一题
                </Button>
              )}
              {questions.length > 1 && (
                <span className="text-[9.5px] tabular-nums text-ink-faint">
                  第 {step + 1} / {questions.length} 题
                </span>
              )}
              {!isPermission && (
                <span className="text-[9.5px] text-ink-faint">
                  {options.length > 0 ? '↑↓ 选择 · Enter 提交 · 数字直接选' : '写完按 Enter'}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              {question?.multiple && (
                <Button
                  size="sm"
                  className="h-7"
                  onClick={commitMultiple}
                  disabled={!picked.length}
                >
                  {step + 1 < questions.length ? '下一步' : '完成'}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-[10px] text-ink-faint hover:text-ink"
                onClick={skip}
              >
                不想回答
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
