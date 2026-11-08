// ─── Composer：基于 tiptap 的纯文本输入框 ───
// 用 tiptap 而非 textarea：占位符文案能随连接/生成状态实时切换，
// 后续要做 / 技能、@ 页面元素时也不用推倒重来。
// 当前只开纯文本 + 换行，附件、语音、技能等能力尚未接入。

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
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
  const [empty, setEmpty] = useState(true);
  // editor 只创建一次，最新状态经 ref 提供给键盘回调与占位符函数。
  const submitRef = useRef<() => void>(() => {});
  const placeholderRef = useRef('');

  placeholderRef.current = busy
    ? '正在生成，可点击右侧停止…'
    : configured
      ? '问问这一页，或让它整理成表…'
      : '先在设置里填入模型 API Key…';

  const editor = useEditor({
    extensions: [
      // 聊天输入只要纯文本 + 换行，关闭所有富文本能力。
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        link: false,
        underline: false,
      }),
      // 默认只在可编辑时显示占位符；busy 锁编辑后仍要提示「正在生成…」。
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
        showOnlyWhenEditable: false,
      }),
    ],
    editorProps: {
      attributes: {
        'aria-label': '输入消息',
        'aria-multiline': 'true',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          // 中文输入法候选确认的回车不触发发送。
          if (event.isComposing || event.keyCode === 229) return false;
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => setEmpty(instance.isEmpty),
    onCreate: ({ editor: instance }) => setEmpty(instance.isEmpty),
  });

  submitRef.current = () => {
    if (!editor || busy) return;
    // Shift+Enter 产生的是 hardBreak，默认 getText 会把它序列化成空串，这里补回换行。
    const text = editor
      .getText({ blockSeparator: '\n', textSerializers: { hardBreak: () => '\n' } })
      .trim();
    if (!text) return;
    onSend(text);
    editor.commands.clearContent(true);
    setEmpty(true);
  };

  // 生成中锁编辑，草稿保留，结束后恢复。
  useEffect(() => {
    editor?.setEditable(!busy);
  }, [busy, editor]);

  const canSend = !empty && !busy;

  return (
    <div className="flex-shrink-0 border-t border-line bg-surface/85 px-3 py-2.5 backdrop-blur">
      <div className="rounded-2xl border border-line-strong bg-surface p-1.5 shadow-[0_2px_10px_rgb(29_55_76_/_5%)] focus-within:border-brand/45 focus-within:ring-2 focus-within:ring-brand/10">
        <EditorContent editor={editor} className="composer-editor" />
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
              onClick={() => submitRef.current()}
              disabled={!canSend}
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
