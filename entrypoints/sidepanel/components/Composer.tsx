// ─── Composer：基于 tiptap 的纯文本输入框 ───
// 图片是编辑器里的自定义原子节点；工具栏、状态提示和放大浮层留在 EditorContent 外面。

import type { Editor } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowUp, Camera, Eye, Loader2, Settings2, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CaptureResult, ImageAttachment } from '@/lib/ipc/protocol';
import { attachmentIdFor } from '@/lib/sessions/attachments';
import { cn } from '@/lib/utils';
import {
  applyResolvedDrafts,
  collectImageAttachments,
  collectImageStats,
  type ImageDocStats,
  insertImageNodes,
  insertReadyImage,
  readImageNodes,
  updateImageDraft,
} from '../editor/image-doc';
import {
  type ImageDraftAttrs,
  imageFilesFromClipboard,
  imageFilesFromDataTransfer,
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_BYTES,
  prepareImageFile,
  selectImageFiles,
} from '../editor/image-drafts';
import { PagehandImageNode } from '../editor/image-node';
import { ImagePreviewProvider } from '../editor/image-preview';

interface ComposerProps {
  busy: boolean;
  configured: boolean;
  supportsImages: boolean;
  onSend: (text: string, attachments: ImageAttachment[]) => void;
  onCapture: () => Promise<CaptureResult>;
  onStop: () => void;
  onOpenSettings: () => void;
}

const EMPTY_STATS: ImageDocStats = { count: 0, preparing: 0, error: 0, bytes: 0 };

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
  const [stats, setStats] = useState<ImageDocStats>(EMPTY_STATS);
  const [capturing, setCapturing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  // editor 只创建一次，最新状态经 ref 提供给键盘/粘贴/拖拽回调与占位符函数。
  const submitRef = useRef<() => void>(() => {});
  const pasteRef = useRef<(files: File[], text: string) => void>(() => {});
  const dropRef = useRef<(files: File[], pos?: number) => void>(() => {});
  const placeholderRef = useRef('');
  const editorRef = useRef<Editor | null>(null);
  const draftsRef = useRef(new Map<string, { file: File; blobUrl: string }>());
  const resolvedRef = useRef(new Map<string, Partial<ImageDraftAttrs>>());
  const restoringRef = useRef(false);

  placeholderRef.current = busy
    ? '正在生成，可点击右侧停止…'
    : capturing
      ? '正在等你在页面上完成截图…'
      : configured
        ? '问问这一页，或让它整理成表…'
        : '先在设置里填入模型 API Key…';

  function releaseDraft(draftId: string) {
    const draft = draftsRef.current.get(draftId);
    if (!draft) return;
    URL.revokeObjectURL(draft.blobUrl);
    draftsRef.current.delete(draftId);
  }

  function releaseAllDrafts() {
    for (const draft of draftsRef.current.values()) URL.revokeObjectURL(draft.blobUrl);
    draftsRef.current.clear();
    resolvedRef.current.clear();
  }

  function pruneDrafts(instance: Editor) {
    const alive = new Set(readImageNodes(instance.state.doc).map((node) => node.attrs.draftId));
    for (const draftId of [...draftsRef.current.keys()]) {
      if (!alive.has(draftId)) releaseDraft(draftId);
    }
  }

  function restoreResolved(instance: Editor) {
    if (restoringRef.current || resolvedRef.current.size === 0) return;
    const pending = new Set(
      readImageNodes(instance.state.doc)
        .filter((node) => node.attrs.status === 'preparing')
        .map((node) => node.attrs.draftId),
    );
    if (![...resolvedRef.current.keys()].some((draftId) => pending.has(draftId))) return;

    restoringRef.current = true;
    applyResolvedDrafts(instance, resolvedRef.current);
    queueMicrotask(() => {
      restoringRef.current = false;
    });
  }

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
      PagehandImageNode,
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
      handlePaste: (_view, event) => {
        const files = imageFilesFromClipboard(event);
        if (files.length === 0) return false;
        event.preventDefault();
        pasteRef.current(files, event.clipboardData?.getData('text/plain') ?? '');
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFilesFromDataTransfer(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        dropRef.current(files, coords?.pos);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      setEmpty(instance.isEmpty);
      setStats(collectImageStats(instance.state.doc));
      pruneDrafts(instance);
      restoreResolved(instance);
    },
    onCreate: ({ editor: instance }) => {
      setEmpty(instance.isEmpty);
      setStats(collectImageStats(instance.state.doc));
    },
  });

  editorRef.current = editor;

  async function addImageFiles(files: File[], text = '', pos?: number) {
    const current = editorRef.current;
    if (!current || current.isDestroyed || busy || capturing) return;
    if (!supportsImages) {
      setImageError('当前模型不支持图片输入，请先在设置里切换到视觉模型。');
      return;
    }

    const selection = selectImageFiles(collectImageStats(current.state.doc).count, files);
    setImageError(selection.error);
    if (selection.accepted.length === 0) return;

    const drafts = selection.accepted.map((file) => {
      const draftId = crypto.randomUUID();
      const blobUrl = URL.createObjectURL(file);
      draftsRef.current.set(draftId, { file, blobUrl });
      return { draftId, blobUrl, name: file.name || null, mimeType: file.type };
    });

    insertImageNodes(current, drafts, {
      ...(pos !== undefined ? { from: pos, to: pos } : {}),
      ...(text.trim() ? { text } : {}),
    });

    for (const draft of drafts) {
      if (current.isDestroyed) return;
      const source = draftsRef.current.get(draft.draftId)?.file;
      if (!source) continue;
      try {
        const prepared = await prepareImageFile(source);
        const attachmentId = await attachmentIdFor(prepared.mimeType, prepared.data);
        // 哈希是异步的：这里必须重新读一次，否则两批并发粘贴会同时通过 4 MB 检查。
        const latest = collectImageStats(current.state.doc);
        if (prepared.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 2 MB。');
        if (latest.bytes + prepared.size > MAX_TOTAL_BYTES) {
          throw new Error('附件总大小不能超过 4 MB。');
        }
        const patch: Partial<ImageDraftAttrs> = {
          status: 'ready',
          attachmentId,
          src: `data:${prepared.mimeType};base64,${prepared.data}`,
          mimeType: prepared.mimeType,
          size: prepared.size,
          width: prepared.width,
          height: prepared.height,
          name: prepared.name,
          error: null,
        };
        resolvedRef.current.set(draft.draftId, patch);
        updateImageDraft(current, draft.draftId, patch);
        releaseDraft(draft.draftId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        resolvedRef.current.delete(draft.draftId);
        updateImageDraft(current, draft.draftId, { status: 'error', error: message });
      }
    }
  }

  pasteRef.current = (files, text) => {
    void addImageFiles(files, text);
  };
  dropRef.current = (files, pos) => {
    void addImageFiles(files, '', pos);
  };

  submitRef.current = () => {
    const current = editorRef.current;
    if (!current || current.isDestroyed || busy || capturing) return;

    const currentStats = collectImageStats(current.state.doc);
    if (currentStats.count > 0 && !supportsImages) {
      setImageError('当前模型是纯文本，图片不会发给模型。请先移除图片，或切换支持图片的模型。');
      return;
    }
    if (currentStats.preparing > 0) {
      setImageError('图片还在处理中，稍等一下再发送。');
      return;
    }
    if (currentStats.error > 0) {
      setImageError('有图片处理失败，先移除再发送。');
      return;
    }

    // Shift+Enter 产生的是 hardBreak，默认 getText 会把它序列化成空串，这里补回换行。
    const text = current
      .getText({ blockSeparator: '\n', textSerializers: { hardBreak: () => '\n' } })
      .trim();
    const images = collectImageAttachments(current.state.doc);
    if (!text && images.length === 0) return;

    onSend(text, images);
    current.commands.clearContent(true);
    setEmpty(true);
    setStats(EMPTY_STATS);
    setImageError(null);
    releaseAllDrafts();
  };

  // 生成中或截图时锁编辑，草稿保留，结束后恢复。
  useEffect(() => {
    editor?.setEditable(!busy && !capturing);
  }, [busy, capturing, editor]);

  const canSend =
    (!empty || stats.count > 0) &&
    !busy &&
    !capturing &&
    stats.preparing === 0 &&
    stats.error === 0 &&
    (stats.count === 0 || supportsImages);
  const imagesBlocked = stats.count > 0 && !supportsImages;

  const startCapture = async () => {
    const current = editorRef.current;
    if (!supportsImages || busy || capturing || !current || current.isDestroyed) return;
    const currentStats = collectImageStats(current.state.doc);
    if (currentStats.count >= MAX_ATTACHMENTS) {
      setImageError(`每条消息最多 ${MAX_ATTACHMENTS} 张图片。`);
      return;
    }
    setImageError(null);
    setCapturing(true);
    try {
      const result = await onCapture();
      if (!result.ok) {
        if (!result.cancelled || result.reason === 'too_small' || result.reason === 'timeout') {
          setImageError(result.error);
        }
        return;
      }
      const image = result.image;
      const latest = collectImageStats(current.state.doc);
      if (image.size > MAX_IMAGE_BYTES) {
        setImageError('单张截图不能超过 2 MB。');
        return;
      }
      if (latest.bytes + image.size > MAX_TOTAL_BYTES) {
        setImageError('附件总大小不能超过 4 MB。');
        return;
      }
      insertReadyImage(current, image);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <fieldset
      aria-label="消息输入与图片拖放区"
      className="m-0 min-w-0 flex-shrink-0 border-x-0 border-b-0 border-t border-line bg-surface/85 p-0 px-3 py-2.5 backdrop-blur"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        // 编辑器内的 drop 由 ProseMirror 处理并 preventDefault；这里兜住工具栏等非编辑区。
        if (event.defaultPrevented) return;
        const files = imageFilesFromDataTransfer(event.dataTransfer);
        if (files.length === 0) return;
        event.preventDefault();
        dropRef.current(files);
      }}
    >
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

        {imageError && <p className="px-2 pt-1 text-[9px] text-danger">{imageError}</p>}
        {stats.preparing > 0 && (
          <p className="px-2 pt-1 text-[9px] text-ink-faint">图片处理中，完成后可发送。</p>
        )}
        {imagesBlocked && (
          <p className="px-2 pt-1 text-[9px] text-warning">
            当前模型是纯文本，图片不会发给模型。请先移除图片，或在设置里切换支持图片的模型。
          </p>
        )}

        <ImagePreviewProvider>
          <EditorContent editor={editor} className="composer-editor" />
        </ImagePreviewProvider>

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
              {stats.count > 0 ? ` · ${stats.count}/${MAX_ATTACHMENTS} 张图片` : ''}
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
    </fieldset>
  );
}
