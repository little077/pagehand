export interface CaptureViewport {
  width: number;
  height: number;
  dpr: number;
}

export type CaptureOverlayResult =
  | { cancelled: true; reason: 'escape' | 'cancel' | 'timeout' | 'too_small' }
  | {
      cancelled: false;
      viewport: CaptureViewport;
      rect: { x: number; y: number; width: number; height: number };
    };

/**
 * 注入到页面里执行。只负责显示截图提示层并收集用户点击/拖拽；
 * 不读取页面元素、不生成选择器。函数会被序列化，不能引用模块级变量。
 */
export function captureOverlay(): Promise<CaptureOverlayResult> {
  return new Promise((resolve) => {
    // 上一次提示层如果还挂着，先移除，避免叠加。
    document.getElementById('pagehand-capture-overlay')?.remove();
    const host = document.createElement('div');
    host.id = 'pagehand-capture-overlay';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .overlay {
          position: fixed; inset: 0; cursor: crosshair;
          background: rgba(22, 35, 49, 0.08);
          font-family: "Aptos", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        }
        .banner {
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 7px; max-width: calc(100vw - 24px);
          padding: 6px 9px; border-radius: 9px; background: rgba(22, 35, 49, 0.92);
          color: #fff; font-size: 11px; line-height: 1.4; white-space: nowrap;
          box-shadow: 0 8px 24px rgba(22, 35, 49, 0.25);
        }
        .banner .dot { width: 6px; height: 6px; border-radius: 50%; background: #8ad6a8; }
        .banner .text { overflow: hidden; text-overflow: ellipsis; }
        .banner button {
          border: 0; background: transparent; color: #fff; font: inherit; font-weight: 700;
          text-decoration: underline; text-underline-offset: 2px; padding: 0; cursor: pointer;
        }
        .rect {
          position: fixed; display: none; pointer-events: none;
          border: 1.5px dashed #4a7666; background: rgba(74, 118, 102, 0.13);
        }
        .size {
          position: fixed; display: none; padding: 2px 5px; border-radius: 4px;
          background: rgba(22, 35, 49, 0.9); color: #fff; font-size: 10px; pointer-events: none;
        }
      </style>
      <div class="overlay">
        <div class="banner">
          <i class="dot"></i>
          <span class="text"></span>
          <button type="button" class="cancel">取消</button>
        </div>
        <div class="rect"></div>
        <div class="size"></div>
      </div>
    `;

    const overlay = shadow.querySelector('.overlay') as HTMLDivElement;
    const text = shadow.querySelector('.text') as HTMLSpanElement;
    const cancel = shadow.querySelector('.cancel') as HTMLButtonElement;
    const rectNode = shadow.querySelector('.rect') as HTMLDivElement;
    const sizeNode = shadow.querySelector('.size') as HTMLDivElement;
    text.textContent = '截屏 · 拖动选择区域';

    const viewport = (): CaptureViewport => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    });

    let settled = false;
    let start: { x: number; y: number } | null = null;
    let rect = { x: 0, y: 0, width: 0, height: 0 };

    const timer = window.setTimeout(() => {
      finish({ cancelled: true, reason: 'timeout' });
    }, 60_000);

    function cleanup(): void {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      overlay.removeEventListener('mousedown', onMouseDown, true);
      host.remove();
    }

    function finish(result: CaptureOverlayResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish({ cancelled: true, reason: 'escape' });
    }

    function onMouseDown(event: MouseEvent): void {
      if ((event.target as Element | null)?.closest('.banner')) return;
      event.preventDefault();
      event.stopPropagation();
      start = { x: event.clientX, y: event.clientY };
      rect = { x: start.x, y: start.y, width: 0, height: 0 };
      rectNode.style.display = 'block';
      rectNode.style.left = `${start.x}px`;
      rectNode.style.top = `${start.y}px`;
      rectNode.style.width = '0px';
      rectNode.style.height = '0px';
      sizeNode.style.display = 'block';
      sizeNode.textContent = '0 × 0';
      sizeNode.style.left = `${start.x + 8}px`;
      sizeNode.style.top = `${start.y + 8}px`;
    }

    function onMouseMove(event: MouseEvent): void {
      if (!start) return;
      const x = Math.min(Math.max(event.clientX, 0), window.innerWidth);
      const y = Math.min(Math.max(event.clientY, 0), window.innerHeight);
      rect = {
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      };
      rectNode.style.left = `${rect.x}px`;
      rectNode.style.top = `${rect.y}px`;
      rectNode.style.width = `${rect.width}px`;
      rectNode.style.height = `${rect.height}px`;
      sizeNode.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      sizeNode.style.left = `${rect.x + 8}px`;
      sizeNode.style.top = `${rect.y + 8}px`;
    }

    function onMouseUp(event: MouseEvent): void {
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      start = null;
      if (rect.width < 12 || rect.height < 12) {
        finish({ cancelled: true, reason: 'too_small' });
        return;
      }
      finish({ cancelled: false, viewport: viewport(), rect });
    }

    cancel.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish({ cancelled: true, reason: 'cancel' });
    });
    overlay.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    document.documentElement.appendChild(host);
  });
}
