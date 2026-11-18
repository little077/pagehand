import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Pagehand',
    description: '把浏览器里重复、规则清楚的体力活交给 Agent。',
    version: '0.1.0',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'offscreen'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 Pagehand',
    },
  },
  vite: (env) => {
    const debug = env.mode === 'debug' && env.command === 'serve';
    const loaded = debug ? loadEnv(env.mode, process.cwd(), '') : {};
    return {
      plugins: [tailwindcss()],
      define: {
        __PAGEHAND_DEBUG_ENV__: JSON.stringify(
          debug
            ? {
                baseUrl: loaded.VITE_DEBUG_MODEL_BASE_URL ?? '',
                apiKey: loaded.VITE_DEBUG_MODEL_API_KEY ?? '',
                modelId: loaded.VITE_DEBUG_MODEL_ID ?? '',
                supportsImages: loaded.VITE_DEBUG_MODEL_SUPPORTS_IMAGES ?? '',
              }
            : null,
        ),
      },
    };
  },
});
