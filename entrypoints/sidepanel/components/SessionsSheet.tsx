import { Check, Pencil, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime, type SessionSummary, type TitleSource } from '@/lib/sessions/record';
import { cn } from '@/lib/utils';

interface SessionsSheetProps {
  open: boolean;
  sessions: SessionSummary[];
  currentId: string | null;
  loading: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

const SOURCE_BADGE: Partial<Record<TitleSource, string>> = {
  user: '已改名',
  ai: 'AI 标题',
};

export function SessionsSheet({
  open,
  sessions,
  currentId,
  loading,
  onClose,
  onOpen,
  onRename,
  onDelete,
}: SessionsSheetProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setConfirmId(null);
    }
  }, [open]);

  // 进入改名时聚焦并全选，方便直接覆盖旧标题；autoFocus 会抢走键盘焦点，所以放到 effect 里。
  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const now = Date.now();

  function startRename(session: SessionSummary) {
    setConfirmId(null);
    setEditingId(session.id);
    setDraft(session.title);
  }

  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    onRename(editingId, draft);
    setEditingId(null);
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
        aria-label="历史会话"
        className="max-h-[86%] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface px-4 pb-5 pt-2.5 shadow-[0_-12px_40px_rgb(22_35_49_/_14%)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[18px] font-semibold tracking-tight text-ink">
              历史会话
            </h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">
              存在这台电脑的浏览器里，只记模型名称，不记 API Key。
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭历史会话">
            <X size={16} />
          </Button>
        </div>

        {loading ? (
          <p className="rounded-xl bg-app px-3 py-8 text-center text-[11px] text-ink-faint">
            正在读取本机历史…
          </p>
        ) : sessions.length === 0 ? (
          <p className="rounded-xl bg-app px-3 py-8 text-center text-[11px] text-ink-faint">
            还没有历史会话。发出第一条任务后，这里会出现第一个会话。
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((entry) => {
              const isCurrent = entry.id === currentId;
              const badge = SOURCE_BADGE[entry.titleSource];
              const editing = editingId === entry.id;

              return (
                <li
                  key={entry.id}
                  className={cn(
                    'ph-rise rounded-xl border px-3 py-2.5',
                    isCurrent ? 'border-brand/35 bg-brand/[0.05]' : 'border-line bg-app',
                  )}
                >
                  {editing ? (
                    <form onSubmit={submitRename} className="flex items-center gap-1.5">
                      <Input
                        ref={inputRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label="会话名称"
                        className="h-8 min-w-0 flex-1 rounded-lg text-[11.5px]"
                      />
                      <Button type="submit" size="sm" className="h-8">
                        <Check size={11} />
                        保存
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onOpen(entry.id)}
                          className={cn(
                            'h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-0 py-0 text-left',
                            isCurrent ? 'text-ink' : 'text-ink hover:bg-transparent',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {isCurrent && (
                              <span className="size-1.5 flex-shrink-0 rounded-full bg-brand" />
                            )}
                            <span className="truncate text-[11.5px] font-semibold">
                              {entry.title}
                            </span>
                            {badge && (
                              <span className="flex-shrink-0 rounded-full border border-line bg-surface px-1.5 py-px text-[9px] text-ink-soft">
                                {badge}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[9.5px] text-ink-faint">
                            {formatRelativeTime(entry.updatedAt, now)} · {entry.messageCount} 条
                            {isCurrent ? ' · 当前会话' : ''}
                          </span>
                        </Button>

                        <div className="flex flex-shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startRename(entry)}
                            aria-label="重命名会话"
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setConfirmId(confirmId === entry.id ? null : entry.id)}
                            aria-label="删除会话"
                            className="hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>

                      {confirmId === entry.id && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-danger/25 bg-danger/[0.05] px-2.5 py-1.5">
                          <span className="text-[10px] text-danger">删除后无法恢复</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 rounded-md px-2 text-[10px]"
                              onClick={() => {
                                setConfirmId(null);
                                onDelete(entry.id);
                              }}
                            >
                              确认删除
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => setConfirmId(null)}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 px-0.5 text-[9.5px] leading-relaxed text-ink-faint">
          标题默认取第一条任务的前 20 个字；改名后一直用你写的名字。
        </p>
      </div>
    </div>
  );
}
