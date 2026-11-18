import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImageDraftAttrs } from './image-drafts';
import { useImagePreview } from './image-preview';

export function ImageNodeView({ node, deleteNode, selected, ref }: ReactNodeViewProps) {
  const attrs = node.attrs as ImageDraftAttrs;
  const preview = useImagePreview();
  const hasImage = Boolean(attrs.src);
  const [hovered, setHovered] = useState(false);

  // 发送后会整段清空，节点直接卸载；不补这一下浮层会一直留在屏幕上。
  useEffect(() => () => preview.hide(), [preview]);

  // 图片从处理中变成 ready 时，鼠标可能一直停在上面：同步刷新浮层里的图和尺寸。
  useEffect(() => {
    const anchor = ref.current;
    if (!hovered || !anchor || !attrs.src) return;
    preview.show({
      id: attrs.draftId,
      src: attrs.src,
      width: attrs.width,
      height: attrs.height,
      status: attrs.status,
      anchor,
    });
  }, [hovered, preview, ref, attrs.draftId, attrs.src, attrs.width, attrs.height, attrs.status]);

  return (
    <NodeViewWrapper
      ref={ref}
      as="span"
      contentEditable={false}
      data-drag-handle
      className={cn('ph-composer-image', selected && 'ph-composer-image-selected')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        preview.hide();
      }}
    >
      <span
        className="ph-composer-image-card group"
        title={
          attrs.status === 'preparing'
            ? '图片处理中…'
            : attrs.status === 'error'
              ? (attrs.error ?? '图片处理失败')
              : `${attrs.width}×${attrs.height}`
        }
      >
        {hasImage ? (
          <img
            src={attrs.src}
            alt={attrs.name ? `图片附件：${attrs.name}` : '图片附件'}
            draggable={false}
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-surface-soft text-ink-faint">
            <AlertCircle size={12} />
          </span>
        )}

        {attrs.status === 'preparing' && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/55">
            <Loader2 size={12} className="animate-spin text-brand" />
          </span>
        )}
        {attrs.status === 'error' && (
          <span className="absolute inset-0 flex items-center justify-center bg-danger/10 text-danger">
            <AlertCircle size={12} />
          </span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="移除图片"
          title={attrs.status === 'error' ? (attrs.error ?? '移除这张图片') : '移除图片'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            preview.hide();
            deleteNode();
          }}
          className="absolute right-0.5 top-0.5 size-3 rounded-[3px] bg-ink/55 p-0 text-white opacity-0 transition-opacity hover:bg-ink/80 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X size={6} />
        </Button>
      </span>
    </NodeViewWrapper>
  );
}
