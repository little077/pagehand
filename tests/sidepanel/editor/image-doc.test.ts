import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectImageAttachments,
  collectImageStats,
  insertImageNodes,
  insertReadyImage,
  PAGEHAND_IMAGE_TYPE,
  readImageNodes,
  updateImageDraft,
} from '@/entrypoints/sidepanel/editor/image-doc';
import { PagehandImageNode } from '@/entrypoints/sidepanel/editor/image-node';

let editor: Editor | null = null;

function createEditor(): Editor {
  editor = new Editor({
    extensions: [StarterKit, PagehandImageNode],
    content: '<p>你好</p>',
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('图片节点文档操作', () => {
  it('插入草稿节点并统计状态', () => {
    const instance = createEditor();
    insertImageNodes(instance, [
      { draftId: 'd1', blobUrl: 'blob:one', mimeType: 'image/png', name: 'a.png' },
      { draftId: 'd2', blobUrl: 'blob:two', mimeType: 'image/jpeg', name: null },
    ]);

    expect(readImageNodes(instance.state.doc).map((item) => item.attrs.draftId)).toEqual([
      'd1',
      'd2',
    ]);
    expect(collectImageStats(instance.state.doc)).toEqual({
      count: 2,
      preparing: 2,
      error: 0,
      bytes: 0,
    });
  });

  it('按 draftId 回填 ready，并能收集发送附件', () => {
    const instance = createEditor();
    insertImageNodes(instance, [
      { draftId: 'd1', blobUrl: 'blob:one', mimeType: 'image/png', name: 'a.png' },
    ]);

    const updated = updateImageDraft(instance, 'd1', {
      status: 'ready',
      attachmentId: 'hash-1',
      src: 'data:image/png;base64,AQID',
      size: 3,
      width: 120,
      height: 80,
    });

    expect(updated).toBe(true);
    expect(collectImageStats(instance.state.doc)).toMatchObject({ count: 1, preparing: 0 });
    expect(collectImageAttachments(instance.state.doc)).toEqual([
      {
        id: 'hash-1',
        data: 'AQID',
        mimeType: 'image/png',
        width: 120,
        height: 80,
        size: 3,
        name: 'a.png',
      },
    ]);
  });

  it('节点已删除时回填静默失败', () => {
    const instance = createEditor();
    insertImageNodes(instance, [
      { draftId: 'gone', blobUrl: 'blob:one', mimeType: 'image/png', name: null },
    ]);
    instance.commands.clearContent(true);

    expect(updateImageDraft(instance, 'gone', { status: 'ready' })).toBe(false);
  });

  it('截屏结果直接插入 ready 节点', () => {
    const instance = createEditor();
    insertReadyImage(instance, {
      id: 'shot-1',
      data: 'AQID',
      mimeType: 'image/jpeg',
      width: 640,
      height: 360,
      size: 3,
    });

    const [node] = readImageNodes(instance.state.doc);
    expect(node?.attrs).toMatchObject({
      draftId: 'shot-1',
      attachmentId: 'shot-1',
      status: 'ready',
      src: 'data:image/jpeg;base64,AQID',
    });
    expect(collectImageAttachments(instance.state.doc)).toHaveLength(1);
  });

  it('只统计 ready 图片的字节数', () => {
    const instance = createEditor();
    insertImageNodes(instance, [
      { draftId: 'd1', blobUrl: 'blob:one', mimeType: 'image/png', name: null },
      { draftId: 'd2', blobUrl: 'blob:two', mimeType: 'image/png', name: null },
    ]);
    updateImageDraft(instance, 'd1', { status: 'ready', size: 100 });
    updateImageDraft(instance, 'd2', { status: 'error', size: 200 });

    expect(collectImageStats(instance.state.doc)).toEqual({
      count: 2,
      preparing: 0,
      error: 1,
      bytes: 100,
    });
  });

  it('renderHTML 保留字段，并能在解析后还原', () => {
    const instance = createEditor();
    insertImageNodes(instance, [
      { draftId: 'd1', blobUrl: 'blob:one', mimeType: 'image/png', name: 'a.png' },
    ]);
    updateImageDraft(instance, 'd1', {
      status: 'ready',
      attachmentId: 'hash-1',
      src: 'data:image/png;base64,AQID',
      size: 3,
      width: 120,
      height: 80,
    });

    const html = instance.getHTML();
    expect(html).toContain('data-pagehand-image="true"');
    expect(html).toContain('data-status="ready"');
    expect(html).toContain('data-draft-id="d1"');

    instance.commands.setContent(html);
    expect(readImageNodes(instance.state.doc)[0]?.attrs).toMatchObject({
      draftId: 'd1',
      attachmentId: 'hash-1',
      status: 'ready',
      width: 120,
      height: 80,
      size: 3,
    });
  });

  it('自定义节点名固定', () => {
    expect(PAGEHAND_IMAGE_TYPE).toBe('pagehandImage');
  });
});
