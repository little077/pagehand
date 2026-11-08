import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Pagehand',
    description: '把浏览器里重复、规则清楚的体力活交给 Agent。',
    version: '0.1.0',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 Pagehand',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
