import type { Editor } from '@tiptap/core';
import type { ImageAttachment } from '@/lib/ipc/protocol';
import type { ImageDraftAttrs } from './image-drafts';

export const PAGEHAND_IMAGE_TYPE = 'pagehandImage';

type Doc = Editor['state']['doc'];
type DocNode = Parameters<Parameters<Doc['descendants']>[0]>[0];

export interface ImageNodeSnapshot {
  pos: number;
  attrs: ImageDraftAttrs;
}

export interface ImageDocStats {
  count: number;
  preparing: number;
  error: number;
  bytes: number;
}

export interface ImageDraftInput {
  draftId: string;
  blobUrl: string;
  name: string | null;
  mimeType: string;
}

export interface InsertImageOptions {
  from?: number;
  to?: number;
  /** 粘贴时剪贴板里同时带文字：图片插完后再把文字补在它后面。 */
  text?: string;
}

export function readImageNodes(doc: Doc): ImageNodeSnapshot[] {
  const nodes: ImageNodeSnapshot[] = [];
  doc.descendants((node: DocNode, pos: number) => {
    if (node.type.name !== PAGEHAND_IMAGE_TYPE) return true;
    nodes.push({ pos, attrs: node.attrs as ImageDraftAttrs });
    return false;
  });
  return nodes;
}

export function collectImageStats(doc: Doc): ImageDocStats {
  const stats: ImageDocStats = { count: 0, preparing: 0, error: 0, bytes: 0 };
  for (const { attrs } of readImageNodes(doc)) {
    stats.count += 1;
    if (attrs.status === 'preparing') stats.preparing += 1;
    if (attrs.status === 'error') stats.error += 1;
    if (attrs.status === 'ready') stats.bytes += attrs.size;
  }
  return stats;
}

function base64Of(src: string): string | null {
  if (!src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0) return null;
  const data = src.slice(comma + 1);
  return data || null;
}

export function collectImageAttachments(doc: Doc): ImageAttachment[] {
  const attachments: ImageAttachment[] = [];
  for (const { attrs } of readImageNodes(doc)) {
    if (attrs.status !== 'ready') continue;
    const data = base64Of(attrs.src);
    if (!data) continue;
    attachments.push({
      id: attrs.attachmentId ?? attrs.draftId,
      data,
      mimeType: attrs.mimeType,
      width: attrs.width,
      height: attrs.height,
      size: attrs.size,
      ...(attrs.name ? { name: attrs.name } : {}),
    });
  }
  return attachments;
}

export function insertImageNodes(
  editor: Editor,
  drafts: ImageDraftInput[],
  options: InsertImageOptions = {},
): void {
  if (editor.isDestroyed || drafts.length === 0) return;
  const nodeType = editor.schema.nodes[PAGEHAND_IMAGE_TYPE];
  if (!nodeType) return;

  const nodes = drafts.map((draft) =>
    nodeType.create({
      draftId: draft.draftId,
      attachmentId: null,
      src: draft.blobUrl,
      mimeType: draft.mimeType,
      size: 0,
      width: 0,
      height: 0,
      name: draft.name,
      status: 'preparing',
      error: null,
    } satisfies ImageDraftAttrs),
  );

  const selection = editor.state.selection;
  const from = options.from ?? selection.from;
  const to = options.to ?? (options.from !== undefined ? options.from : selection.to);
  const tr = editor.state.tr.replaceWith(from, to, nodes);
  const insertedSize = nodes.reduce((sum, node) => sum + node.nodeSize, 0);
  if (options.text) tr.insertText(options.text, from + insertedSize);
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

export function insertReadyImage(editor: Editor, image: ImageAttachment): void {
  if (editor.isDestroyed) return;
  const nodeType = editor.schema.nodes[PAGEHAND_IMAGE_TYPE];
  if (!nodeType) return;

  const selection = editor.state.selection;
  const node = nodeType.create({
    draftId: image.id,
    attachmentId: image.id,
    src: `data:${image.mimeType};base64,${image.data}`,
    mimeType: image.mimeType,
    size: image.size,
    width: image.width,
    height: image.height,
    name: image.name ?? null,
    status: 'ready',
    error: null,
  } satisfies ImageDraftAttrs);

  const tr = editor.state.tr.replaceWith(selection.from, selection.to, node);
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

/** 用户可能已经删掉图片或撤销了插入：找不到就静默返回。 */
export function updateImageDraft(
  editor: Editor,
  draftId: string,
  patch: Partial<ImageDraftAttrs>,
): boolean {
  if (editor.isDestroyed) return false;
  const targets = readImageNodes(editor.state.doc).filter(
    (snapshot) => snapshot.attrs.draftId === draftId,
  );
  if (targets.length === 0) return false;

  const tr = editor.state.tr;
  for (const target of targets) {
    tr.setNodeMarkup(target.pos, undefined, { ...target.attrs, ...patch });
  }
  editor.view.dispatch(tr);
  return true;
}

/** 撤销可能把节点退回 preparing；有结果表就补一次，幂等。 */
export function applyResolvedDrafts(
  editor: Editor,
  resolved: ReadonlyMap<string, Partial<ImageDraftAttrs>>,
): boolean {
  if (editor.isDestroyed) return false;
  const pending = new Set(
    readImageNodes(editor.state.doc)
      .filter((snapshot) => snapshot.attrs.status === 'preparing')
      .map((snapshot) => snapshot.attrs.draftId),
  );
  let changed = false;
  for (const [draftId, patch] of resolved) {
    if (!pending.has(draftId)) continue;
    if (updateImageDraft(editor, draftId, patch)) changed = true;
  }
  return changed;
}
