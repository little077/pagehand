import { type Browser, browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { AgentSession } from '@/lib/agent/session';
import { loadConfig, saveConfig } from '@/lib/config/storage';
import { type BgToUi, PORT_NAME, type UiToBg } from '@/lib/ipc/protocol';

export default defineBackground(() => {
  let port: Browser.runtime.Port | null = null;

  const session = new AgentSession((message: BgToUi) => {
    if (!port) return;
    try {
      port.postMessage(message);
    } catch {
      port = null;
    }
  });

  const configReady = loadConfig()
    .then((config) => {
      if (config) session.config = config;
    })
    .catch((error: unknown) => {
      console.error('[pagehand] failed to load config', error);
    });

  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('[pagehand] failed to set panel behavior', error));

  async function handleMessage(message: UiToBg): Promise<void> {
    switch (message.type) {
      // 收到即算一次长连接活动，用于重置 Service Worker 的 30 秒空闲计时。
      case 'ping': {
        return;
      }
      case 'hello': {
        await configReady;
        port?.postMessage({ type: 'ready', ...session.snapshot() } satisfies BgToUi);
        return;
      }
      case 'send': {
        await session.send(message.text);
        return;
      }
      case 'abort': {
        session.abort();
        return;
      }
      case 'new_thread': {
        session.reset();
        return;
      }
      case 'save_config': {
        try {
          const saved = await saveConfig(message.config);
          session.reset();
          session.applyConfig(saved);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          port?.postMessage({ type: 'error', message: `保存配置失败：${detail}` } satisfies BgToUi);
        }
        return;
      }
    }
  }

  browser.runtime.onConnect.addListener((incoming) => {
    if (incoming.name !== PORT_NAME) return;

    port = incoming;
    incoming.onMessage.addListener((raw: unknown) => {
      void handleMessage(raw as UiToBg);
    });
    incoming.onDisconnect.addListener(() => {
      if (port === incoming) port = null;
    });
  });
});
