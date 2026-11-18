import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from './ImageNodeView';
import { PAGEHAND_IMAGE_TYPE } from './image-doc';
import type { ImageDraftAttrs, ImageDraftStatus } from './image-drafts';

function readStatus(value: string | null): ImageDraftStatus {
  return value === 'ready' || value === 'error' ? value : 'preparing';
}

function numberAttr(element: Element, name: string): number {
  const value = Number(element.getAttribute(name) ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const PagehandImageNode = Node.create({
  name: PAGEHAND_IMAGE_TYPE,
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      draftId: { default: '' },
      attachmentId: { default: null },
      src: { default: '' },
      mimeType: { default: '' },
      size: { default: 0 },
      width: { default: 0 },
      height: { default: 0 },
      name: { default: null },
      status: { default: 'preparing' },
      error: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-pagehand-image]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          return {
            draftId: element.getAttribute('data-draft-id') ?? '',
            attachmentId: element.getAttribute('data-attachment-id') || null,
            src: element.getAttribute('src') ?? '',
            mimeType: element.getAttribute('data-mime-type') ?? '',
            size: numberAttr(element, 'data-size'),
            width: numberAttr(element, 'width') || numberAttr(element, 'data-width'),
            height: numberAttr(element, 'height') || numberAttr(element, 'data-height'),
            name: element.getAttribute('data-name') || null,
            status: readStatus(element.getAttribute('data-status')),
            error: element.getAttribute('data-error') || null,
          } satisfies ImageDraftAttrs;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as ImageDraftAttrs;
    return [
      'img',
      {
        src: attrs.src,
        alt: attrs.name ? `图片附件：${attrs.name}` : '图片附件',
        'data-pagehand-image': 'true',
        'data-draft-id': attrs.draftId,
        ...(attrs.attachmentId ? { 'data-attachment-id': attrs.attachmentId } : {}),
        'data-status': attrs.status,
        'data-mime-type': attrs.mimeType,
        ...(attrs.size ? { 'data-size': String(attrs.size) } : {}),
        ...(attrs.width ? { width: String(attrs.width) } : {}),
        ...(attrs.height ? { height: String(attrs.height) } : {}),
        ...(attrs.name ? { 'data-name': attrs.name } : {}),
        ...(attrs.error ? { 'data-error': attrs.error } : {}),
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
