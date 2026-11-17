import type { ToolImage } from '@/lib/ipc/protocol';

/** 从工具结果 content 里提取图片块，供步骤卡展示；模型侧仍使用原始 content。 */
export function extractToolImages(result: unknown): ToolImage[] | undefined {
  const content = (result as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return undefined;

  const images: ToolImage[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const value = block as { type?: unknown; data?: unknown; mimeType?: unknown };
    if (
      value.type !== 'image' ||
      typeof value.data !== 'string' ||
      typeof value.mimeType !== 'string'
    ) {
      continue;
    }
    images.push({ data: value.data, mimeType: value.mimeType });
    if (images.length >= 2) break;
  }
  return images.length > 0 ? images : undefined;
}
