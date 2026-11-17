// ─── Composer：基于 tiptap 的纯文本输入框 ───
// 工具栏和附件托盘放在 EditorContent 外面：编辑器只保留文字，截图作为消息级附件。

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowUp, Camera, Eye, Loader2, Settings2, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CaptureResult, ImageAttachment } from '@/lib/ipc/protocol';
import { cn } from '@/lib/utils';

interface ComposerProps {
  busy: boolean;
  configured: boolean;
  supportsImages: boolean;
  onSend: (text: string, attachments: ImageAttachment[]) => void;
  onCapture: () => Promise<CaptureResult>;
  onStop: () => void;
  onOpenSettings: () => void;
}

const MAX_ATTACHMENTS = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export function Composer({
  busy,
  configured,
  supportsImages,
  onSend,
  onCapture,
  onStop,
  onOpenSettings,
}: ComposerProps) {
  const [empty, setEmpty] = useState(true);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // editor 只创建一次，最新状态经 ref 提供给键盘回调与占位符函数。
  const submitRef = useRef<() => void>(() => {});
  const attachmentsRef = useRef<ImageAttachment[]>([]);
  const placeholderRef = useRef('');
  attachmentsRef.current = attachments;

  placeholderRef.current = busy
    ? '正在生成，可点击右侧停止…'
    : capturing
      ? '正在等你在页面上完成截图…'
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
    if (!editor || busy || capturing) return;
    if (attachmentsRef.current.length > 0 && !supportsImages) return;
    // Shift+Enter 产生的是 hardBreak，默认 getText 会把它序列化成空串，这里补回换行。
    const text = editor
      .getText({ blockSeparator: '\n', textSerializers: { hardBreak: () => '\n' } })
      .trim();
    const images = attachmentsRef.current;
    if (!text && images.length === 0) return;
    onSend(text, images);
    editor.commands.clearContent(true);
    setEmpty(true);
    setAttachments([]);
    setCaptureError(null);
  };

  // 生成中或截图时锁编辑，草稿保留，结束后恢复。
  useEffect(() => {
    editor?.setEditable(!busy && !capturing);
  }, [busy, capturing, editor]);

  const canSend =
    (!empty || attachments.length > 0) &&
    !busy &&
    !capturing &&
    (attachments.length === 0 || supportsImages);
  const attachmentsBlocked = attachments.length > 0 && !supportsImages;

  const startCapture = async () => {
    if (!supportsImages || busy || capturing) return;
    if (attachmentsRef.current.length >= MAX_ATTACHMENTS) {
      setCaptureError(`每条消息最多 ${MAX_ATTACHMENTS} 张截图`);
      return;
    }
    setCaptureError(null);
    setCapturing(true);
    try {
      const result = await onCapture();
      if (!result.ok) {
        if (!result.cancelled || result.reason === 'too_small' || result.reason === 'timeout') {
          setCaptureError(result.error);
        }
        return;
      }
      const image = result.image;
      const total = attachmentsRef.current.reduce((sum, item) => sum + item.size, 0) + image.size;
      if (image.size > MAX_IMAGE_BYTES) {
        setCaptureError('单张截图不能超过 2 MB');
        return;
      }
      if (total > MAX_TOTAL_BYTES) {
        setCaptureError('附件总大小不能超过 4 MB');
        return;
      }
      setAttachments((previous) => [...previous, image]);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-line bg-surface/85 px-3 py-2.5 backdrop-blur">
      <div
        className={cn(
          'rounded-2xl border border-line-strong bg-surface p-1.5 shadow-[0_2px_10px_rgb(29_55_76_/_5%)]',
          capturing
            ? 'border-success/45 ring-2 ring-success/10'
            : 'focus-within:border-brand/45 focus-within:ring-2 focus-within:ring-brand/10',
        )}
      >
        <div className="flex items-center gap-1 border-b border-line/70 px-0.5 pb-1">
          <button
            type="button"
            onClick={() => void startCapture()}
            disabled={!supportsImages || busy || capturing}
            title={supportsImages ? '拖动选择截图区域' : '当前模型不支持图片输入'}
            className={cn(
              'flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5 text-[9.5px] font-semibold text-ink-soft transition hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
              capturing && 'border-success/25 bg-success/10 text-success',
            )}
          >
            <Camera size={11} />
            截屏
          </button>
          <span
            className={cn(
              'ml-auto inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[8px] font-bold',
              supportsImages ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
            )}
          >
            <Eye size={9} />
            {supportsImages ? '视觉模型' : '纯文本模型'}
          </span>
        </div>

        {capturing && (
          <div className="flex items-center gap-1.5 border-b border-success/20 bg-success/[0.06] px-2 py-1 text-[9px] text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            <span className="min-w-0 flex-1 truncate">截屏：在页面上拖动选择区域，Esc 取消</span>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1.5">
            {attachments.map((image) => (
              <div
                key={image.id}
                className="relative w-[86px] overflow-hidden rounded-lg border border-line bg-surface"
              >
                <img
                  src={`data:${image.mimeType};base64,${image.data}`}
                  alt="截图附件"
                  className="h-12 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((previous) => previous.filter((item) => item.id !== image.id))
                  }
                  aria-label="移除截图"
                  className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-ink/60 text-white"
                >
                  <X size={9} />
                </button>
                <div className="px-1.5 py-1 text-[8px] text-ink-soft tabular-nums">
                  {image.width}×{image.height}
                </div>
              </div>
            ))}
          </div>
        )}

        {captureError && <p className="px-2 pt-1 text-[9px] text-danger">{captureError}</p>}
        {attachmentsBlocked && (
          <p className="px-2 pt-1 text-[9px] text-warning">
            当前模型是纯文本，截图不会发给模型。请先移除截图，或在设置里切换支持图片的模型。
          </p>
        )}

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
              {attachments.length > 0 ? ` · ${attachments.length}/${MAX_ATTACHMENTS} 张截图` : ''}
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
