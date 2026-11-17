import type { InspectCollectOptions } from '@/lib/page/inspect';

export interface InspectCacheEntry {
  key: string;
  fingerprint: string;
  at: number;
}

export const INSPECT_CACHE_TTL_MS = 30_000;

export function inspectCacheKey(tabId: number, options: InspectCollectOptions): string {
  return JSON.stringify({
    tabId,
    selector: options.selector ?? null,
    text: options.text ?? null,
    role: options.role ?? null,
    kind: options.kind ?? null,
    inputType: options.inputType ?? null,
    includeHidden: options.includeHidden === true,
    limit: options.limit ?? null,
    frameId: options.frameId ?? 0,
  });
}

export function shouldReuseInspect(
  previous: InspectCacheEntry | undefined,
  key: string,
  fingerprint: string,
  now: number,
  ttl = INSPECT_CACHE_TTL_MS,
): boolean {
  if (!previous) return false;
  if (previous.key !== key) return false;
  if (previous.fingerprint !== fingerprint) return false;
  const age = now - previous.at;
  return age >= 0 && age <= ttl;
}
