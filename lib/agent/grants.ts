import { browser } from 'wxt/browser';

export interface GrantKey {
  origin: string;
  toolName: string;
}

export const GRANTS_STORAGE_KEY = 'pagehand.grants.v1';

export function grantKeyOf(key: GrantKey): string {
  return `${key.origin}::${key.toolName}`;
}

export function isGranted(grants: string[], key: GrantKey | null): boolean {
  if (!key) return false;
  return grants.includes(grantKeyOf(key));
}

export function withGrant(grants: string[], key: GrantKey): string[] {
  const next = grantKeyOf(key);
  return grants.includes(next) ? grants : [...grants, next];
}

/** 只有普通网页的 origin 能被授权；chrome:// 之类的地址每次都要问。 */
export function originOfUrl(url: string | null | undefined): string | null {
  if (!url || !/^https?:/i.test(url)) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

let cache: string[] | null = null;

export async function loadGrants(): Promise<string[]> {
  if (cache) return cache;
  const stored = await browser.storage.local.get(GRANTS_STORAGE_KEY);
  const value = stored[GRANTS_STORAGE_KEY];
  cache = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  return cache;
}

export async function addGrant(key: GrantKey): Promise<string[]> {
  const grants = withGrant(await loadGrants(), key);
  cache = grants;
  await browser.storage.local.set({ [GRANTS_STORAGE_KEY]: grants });
  return grants;
}
