import { strToU8, zipSync } from 'fflate';
import { traceSummaryMarkdown } from '@/lib/debug/trace';
import type { ChatItem, DebugTrace } from '@/lib/ipc/protocol';

export interface TraceArchive {
  name: string;
  bytes: Uint8Array;
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionOf(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
}

/** 只导出当前 trace 覆盖到的工具截图，避免把整段历史都塞进压缩包。 */
function screenshotsOf(trace: DebugTrace, items: ChatItem[]): Record<string, Uint8Array> {
  const steps = new Map(
    trace.runs.flatMap((run) => run.steps).map((step) => [step.toolCallId, step]),
  );
  const files: Record<string, Uint8Array> = {};
  for (const item of items) {
    if (item.kind !== 'tool' || !item.images?.length) continue;
    const step = steps.get(item.toolCallId);
    if (!step) continue;
    item.images.forEach((image, index) => {
      const name = `screenshots/step-${String(step.seq).padStart(2, '0')}-${safePart(item.name)}-${index + 1}.${extensionOf(image.mimeType)}`;
      files[name] = base64ToBytes(image.data);
    });
  }
  return files;
}

export function buildTraceArchive(trace: DebugTrace, items: ChatItem[]): TraceArchive {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const files: Record<string, Uint8Array> = {
    'trace.json': strToU8(JSON.stringify(trace, null, 2)),
    'summary.md': strToU8(traceSummaryMarkdown(trace)),
    ...screenshotsOf(trace, items),
  };
  return {
    name: `pagehand-trace-${stamp}.zip`,
    bytes: zipSync(files, { level: 6 }),
  };
}

export function downloadTraceArchive(archive: TraceArchive): void {
  const buffer = archive.bytes.buffer.slice(
    archive.bytes.byteOffset,
    archive.bytes.byteOffset + archive.bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = archive.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
