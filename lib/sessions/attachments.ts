import type { ChatItem } from '@/lib/ipc/protocol';
import { isSessionRecord, type SessionRecord } from './record';

export interface StoredAttachment {
  id: string;
  sessionId: string;
  mimeType: string;
  size: number;
  data: string;
  createdAt: number;
}

interface ImageRef {
  type: 'imageRef';
  attachmentId: string;
  mimeType: string;
}

interface StoredImageMeta {
  attachmentId: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  name?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isImageBlock(value: unknown): value is { data: string; mimeType: string } {
  return (
    isRecord(value) &&
    value.type === 'image' &&
    typeof value.data === 'string' &&
    typeof value.mimeType === 'string'
  );
}

function isImageRef(value: unknown): value is ImageRef {
  return (
    isRecord(value) &&
    value.type === 'imageRef' &&
    typeof value.attachmentId === 'string' &&
    typeof value.mimeType === 'string'
  );
}

/** 内容哈希作为附件 id：同一张图只存一份。mimeType 也参与哈希，避免同字节不同格式撞 id。 */
export async function attachmentIdFor(mimeType: string, data: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${mimeType}\n${data}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sizeOfBase64(data: string): number {
  return Math.round(data.length * 0.75);
}

function mapImages(value: unknown, mapper: (block: unknown) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => mapImages(item, mapper));
  if (!isRecord(value)) return value;
  if (isImageBlock(value)) return mapper(value);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = mapImages(item, mapper);
  }
  return out;
}

export interface DehydratedSession {
  record: Record<string, unknown>;
  attachments: StoredAttachment[];
}

/** 把 items/messages 里的 base64 图片抽到 attachments，记录里只留引用。 */
export async function dehydrateSession(record: SessionRecord): Promise<DehydratedSession> {
  const attachments = new Map<string, StoredAttachment>();

  async function collect(
    mimeType: string,
    data: string,
    meta: { size?: number; width?: number; height?: number; name?: string } = {},
  ): Promise<StoredImageMeta> {
    const id = await attachmentIdFor(mimeType, data);
    const size = meta.size ?? sizeOfBase64(data);
    if (!attachments.has(id)) {
      attachments.set(id, {
        id,
        sessionId: record.id,
        mimeType,
        size,
        data,
        createdAt: Date.now(),
      });
    }
    return {
      attachmentId: id,
      mimeType,
      size,
      ...(meta.width ? { width: meta.width } : {}),
      ...(meta.height ? { height: meta.height } : {}),
      ...(meta.name ? { name: meta.name } : {}),
    };
  }

  const items: unknown[] = [];
  for (const item of record.items) {
    if (item.kind === 'user' && item.attachments && item.attachments.length > 0) {
      const refs: StoredImageMeta[] = [];
      for (const attachment of item.attachments) {
        refs.push(
          await collect(attachment.mimeType, attachment.data, {
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
            name: attachment.name,
          }),
        );
      }
      items.push({ ...item, attachments: refs });
      continue;
    }
    if (item.kind === 'tool' && item.images && item.images.length > 0) {
      const refs: StoredImageMeta[] = [];
      for (const image of item.images) {
        refs.push(
          await collect(image.mimeType, image.data, {
            size: image.size,
            width: image.width,
            height: image.height,
          }),
        );
      }
      items.push({ ...item, images: refs });
      continue;
    }
    items.push(item);
  }

  const messages = mapImages(record.messages, (block) => {
    const image = block as { data: string; mimeType: string };
    // 图片引用是异步收集的，先占位，下面统一替换。
    return { type: 'imageRef', attachmentId: '', mimeType: image.mimeType, __data: image.data };
  }) as unknown[];

  async function replacePlaceholders(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => replacePlaceholders(item)));
    }
    if (!isRecord(value)) return value;
    if (value.type === 'imageRef' && typeof value.__data === 'string') {
      const ref = await collect(String(value.mimeType), value.__data);
      return { type: 'imageRef', attachmentId: ref.attachmentId, mimeType: ref.mimeType };
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = await replacePlaceholders(item);
    }
    return out;
  }

  const hydratedMessages = await replacePlaceholders(messages);

  return {
    record: {
      ...record,
      items,
      messages: hydratedMessages as unknown[],
    },
    attachments: [...attachments.values()],
  };
}

function hydrateItems(items: unknown[], byId: Map<string, StoredAttachment>): ChatItem[] {
  return items.map((item) => {
    if (!isRecord(item)) return item as ChatItem;
    if (item.kind === 'user' && Array.isArray(item.attachments)) {
      const attachments = item.attachments.flatMap((attachment) => {
        if (!isRecord(attachment)) return [];
        if (typeof attachment.data === 'string') return [attachment];
        if (typeof attachment.attachmentId !== 'string') return [];
        const stored = byId.get(attachment.attachmentId);
        if (!stored) return [];
        return [
          {
            id: stored.id,
            data: stored.data,
            mimeType: stored.mimeType,
            width: typeof attachment.width === 'number' ? attachment.width : 0,
            height: typeof attachment.height === 'number' ? attachment.height : 0,
            size: stored.size,
            ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
          },
        ];
      });
      return { ...item, attachments } as unknown as ChatItem;
    }
    if (item.kind === 'tool' && Array.isArray(item.images)) {
      const images = item.images.flatMap((image) => {
        if (!isRecord(image)) return [];
        if (typeof image.data === 'string' && typeof image.mimeType === 'string') return [image];
        if (typeof image.attachmentId !== 'string') return [];
        const stored = byId.get(image.attachmentId);
        if (!stored) return [];
        return [
          {
            data: stored.data,
            mimeType: stored.mimeType,
            ...(typeof image.width === 'number' ? { width: image.width } : {}),
            ...(typeof image.height === 'number' ? { height: image.height } : {}),
            size: stored.size,
          },
        ];
      });
      return { ...item, images } as unknown as ChatItem;
    }
    return item as ChatItem;
  });
}

function hydrateMessages(value: unknown, byId: Map<string, StoredAttachment>): unknown {
  if (Array.isArray(value)) return value.map((item) => hydrateMessages(item, byId));
  if (!isRecord(value)) return value;
  if (isImageRef(value)) {
    const stored = byId.get(value.attachmentId);
    return stored
      ? { type: 'image', data: stored.data, mimeType: stored.mimeType }
      : { type: 'text', text: '[图片已丢失]' };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = hydrateMessages(item, byId);
  }
  return out;
}

/** 把只读记录和附件表还原成内存里的 SessionRecord。 */
export function hydrateSession(
  stored: unknown,
  attachments: StoredAttachment[],
): SessionRecord | null {
  if (!isRecord(stored) || !isSessionRecord(stored)) return null;
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return {
    ...(stored as SessionRecord),
    items: hydrateItems(stored.items as unknown[], byId),
    messages: hydrateMessages(stored.messages, byId) as unknown[],
  };
}

export function isStoredAttachment(value: unknown): value is StoredAttachment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.size === 'number' &&
    typeof value.data === 'string' &&
    typeof value.createdAt === 'number'
  );
}
