export interface DebugRoute {
  id: string;
  title: string;
  description: string;
}

const OVERVIEW: DebugRoute = {
  id: 'overview',
  title: '调试面板',
  description: '开发环境专用调试页。后续模块按路由接入这里。',
};

export const DEBUG_ROUTES: DebugRoute[] = [];
export const DEBUG_DEFAULT_ROUTE = OVERVIEW;

export function debugHash(id: string): string {
  return `#/debug/${id}`;
}

export function parseDebugHash(hash: string): { open: boolean; route: DebugRoute } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const segments = raw.split('/').filter(Boolean);
  if (segments[0] !== 'debug') {
    return { open: false, route: OVERVIEW };
  }
  return {
    open: true,
    route: DEBUG_ROUTES.find((route) => route.id === segments[1]) ?? OVERVIEW,
  };
}
