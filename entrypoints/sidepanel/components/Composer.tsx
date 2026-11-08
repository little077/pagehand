import { ArrowUp, Loader2, Settings2, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ComposerProps {
  busy: boolean;
  configured: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export function Composer({ busy, configured, onSend, onStop, onOpenSettings }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value 只作自动增高的触发器
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 148)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
  }

  return (
    <div className="flex-shrink-0 border-t border-line bg-surface/85 px-3 py-2.5 backdrop-blur">
      <div className="rounded-2xl border border-line-strong bg-surface p-1.5 shadow-[0_2px_10px_rgb(29_55_76_/_5%)] focus-within:border-brand/45 focus-within:ring-2 focus-within:ring-brand/10">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={configured ? '问问这一页，或让它整理成表…' : '先在设置里填入模型 API Key…'}
          className="max-h-[148px] min-h-[30px] w-full resize-none border-0 bg-transparent px-1.5 py-1 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="flex items-center justify-between gap-2 px-0.5 pt-0.5">
          {!configured ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium text-brand transition hover:text-brand-strong"
            >
              <Settings2 size={11} />
              配置模型
            </button>
          ) : (
            <span className="px-1 text-[9.5px] text-ink-faint">
              Enter 发送 · Shift + Enter 换行
            </span>
          )}

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-ink/85"
              aria-label="停止"
              title="停止"
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white transition enabled:hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-line-strong"
              aria-label="发送"
              title="发送"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
