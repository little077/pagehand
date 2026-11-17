import { describe, expect, it } from 'vitest';
import { attachmentIdFor, dehydrateSession, hydrateSession } from '@/lib/sessions/attachments';
import type { SessionRecord } from '@/lib/sessions/record';

const IMAGE = 'aGVsbG8='; // "hello"

function record(): SessionRecord {
  return {
    id: 'session-1',
    createdAt: 1,
    updatedAt: 2,
    title: { custom: null, ai: null, fromPrompt: '测试' },
    model: null,
    items: [
      {
        kind: 'user',
        id: 'u-1',
        text: '看图',
        attachments: [
          {
            id: 'client-id',
            data: IMAGE,
            mimeType: 'image/jpeg',
            width: 10,
            height: 20,
            size: 5,
            name: '截图',
          },
        ],
      },
      {
        kind: 'tool',
        id: 't-1',
        toolCallId: 'call-1',
        name: 'screenshot',
        status: 'ok',
        summary: '截图',
        images: [{ data: IMAGE, mimeType: 'image/jpeg' }],
        startedAt: 1,
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'image', data: IMAGE, mimeType: 'image/jpeg' },
        ],
      },
    ],
  };
}

describe('会话附件编解码', () => {
  type StoredItem = {
    attachments?: Array<Record<string, unknown>>;
    images?: Array<Record<string, unknown>>;
  };
  type StoredMessage = { content: Array<Record<string, unknown>> };

  it('相同图片只存一份，items 和 messages 都转成引用', async () => {
    const { record: stored, attachments } = await dehydrateSession(record());

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.data).toBe(IMAGE);
    const items = stored.items as StoredItem[];
    expect(items[0]?.attachments?.[0]).toMatchObject({
      attachmentId: attachments[0]?.id,
      mimeType: 'image/jpeg',
      width: 10,
      height: 20,
    });
    expect(items[0]?.attachments?.[0]).not.toHaveProperty('data');
    expect(items[1]?.images?.[0]).toMatchObject({ attachmentId: attachments[0]?.id });
    const messages = stored.messages as StoredMessage[];
    expect(messages[0]?.content[1]).toMatchObject({
      type: 'imageRef',
      attachmentId: attachments[0]?.id,
    });
  });

  it('读取时还原成 UI 和模型都能用的图片', async () => {
    const { record: stored, attachments } = await dehydrateSession(record());
    const hydrated = hydrateSession(stored, attachments);
    if (!hydrated) throw new Error('hydrate failed');

    const user = hydrated.items[0];
    expect(user?.kind === 'user' ? user.attachments?.[0]?.data : null).toBe(IMAGE);
    const tool = hydrated.items[1];
    expect(tool?.kind === 'tool' ? tool.images?.[0]?.data : null).toBe(IMAGE);
    const content = (hydrated.messages[0] as StoredMessage).content;
    expect(content[1]).toEqual({ type: 'image', data: IMAGE, mimeType: 'image/jpeg' });
  });

  it('附件缺失时消息里给出明确占位，不产生非法图片块', async () => {
    const { record: stored } = await dehydrateSession(record());
    const hydrated = hydrateSession(stored, []);
    if (!hydrated) throw new Error('hydrate failed');
    const content = (hydrated.messages[0] as StoredMessage).content;
    expect(content[1]).toEqual({ type: 'text', text: '[图片已丢失]' });
  });

  it('附件 id 由内容决定', async () => {
    expect(await attachmentIdFor('image/jpeg', IMAGE)).toBe(
      await attachmentIdFor('image/jpeg', IMAGE),
    );
    expect(await attachmentIdFor('image/jpeg', IMAGE)).not.toBe(
      await attachmentIdFor('image/png', IMAGE),
    );
  });
});
