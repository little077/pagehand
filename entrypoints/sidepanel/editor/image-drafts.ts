export type ImageDraftStatus = 'preparing' | 'ready' | 'error';

export interface ImageDraftAttrs {
  draftId: string;
  attachmentId: string | null;
  src: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  name: string | null;
  status: ImageDraftStatus;
  error: string | null;
}

export interface PreparedImage {
  data: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  name: string | null;
}

export const MAX_ATTACHMENTS = 3;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
/** 原图硬上限：超过就先拦下，避免解码超大图片把侧栏卡死。 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_TYPES.has(type);
}

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) return { width, height };
  const ratio = Math.min(maxEdge / width, maxEdge / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export interface FileSelection {
  accepted: File[];
  error: string | null;
}

/** 先按数量、类型、原图硬上限筛一遍；2 MB / 4 MB 要等压缩后再判。 */
export function selectImageFiles(existingCount: number, files: File[]): FileSelection {
  const room = MAX_ATTACHMENTS - existingCount;
  if (room <= 0) {
    return { accepted: [], error: `每条消息最多 ${MAX_ATTACHMENTS} 张图片。` };
  }

  const accepted: File[] = [];
  const errors: string[] = [];
  let rejectedType = false;
  let rejectedSize = false;
  let rejectedCount = false;

  for (const file of files) {
    if (!isSupportedImageType(file.type)) {
      rejectedType = true;
      continue;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      rejectedSize = true;
      continue;
    }
    if (accepted.length >= room) {
      rejectedCount = true;
      continue;
    }
    accepted.push(file);
  }

  if (rejectedType) errors.push('只支持 PNG / JPEG / WebP / GIF 图片。');
  if (rejectedSize) errors.push('单张原图不能超过 20 MB。');
  if (rejectedCount) errors.push(`最多还能添加 ${room} 张图片，多余文件已忽略。`);

  return { accepted, error: errors.length > 0 ? errors.join('') : null };
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter((file) => isSupportedImageType(file.type));
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !isSupportedImageType(item.type)) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return dedupeFiles(files);
}

export function imageFilesFromClipboard(event: ClipboardEvent): File[] {
  return filesFromDataTransfer(event.clipboardData);
}

export function imageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  return filesFromDataTransfer(data);
}

function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取这张图片。'));
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function downscale(
  bitmap: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('图片压缩失败：当前环境不支持 Canvas。');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片压缩失败，请换一张试试。'));
      },
      'image/jpeg',
      0.8,
    );
  });
}

/**
 * 读取文件、量尺寸；超过 2 MB 的静态图缩到最长边 1600 后重新编码。
 * GIF 不重编码（会丢动画），超限直接报错。
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (!isSupportedImageType(file.type)) {
    throw new Error('只支持 PNG / JPEG / WebP / GIF 图片。');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('单张原图不能超过 20 MB。');
  }

  const bitmap = await decodeImage(file);
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    if (!originalWidth || !originalHeight) throw new Error('无法读取这张图片的尺寸。');

    if (file.size <= MAX_IMAGE_BYTES) {
      return {
        data: await blobToBase64(file),
        mimeType: file.type,
        size: file.size,
        width: originalWidth,
        height: originalHeight,
        name: file.name || null,
      };
    }

    if (file.type === 'image/gif') {
      throw new Error('GIF 图片不能超过 2 MB。');
    }

    const target = scaleToMaxEdge(originalWidth, originalHeight, MAX_IMAGE_EDGE);
    const blob = await downscale(bitmap, target.width, target.height);
    return {
      data: await blobToBase64(blob),
      mimeType: 'image/jpeg',
      size: blob.size,
      width: target.width,
      height: target.height,
      name: file.name || null,
    };
  } finally {
    if ('close' in bitmap) bitmap.close();
  }
}
