import { beforeEach, describe, expect, it } from 'vitest';
import { captureOverlay } from '@/lib/page/capture-overlay';

function overlayRoot(): ShadowRoot {
  const host = document.getElementById('pagehand-capture-overlay');
  if (!host?.shadowRoot) throw new Error('overlay not mounted');
  return host.shadowRoot;
}

function overlay(): HTMLElement {
  const node = overlayRoot().querySelector('.overlay');
  if (!(node instanceof HTMLElement)) throw new Error('overlay missing');
  return node;
}

beforeEach(() => {
  document.documentElement.innerHTML = '<body></body>';
});

describe('截屏提示层', () => {
  it('显示拖动提示，拖动后返回矩形并移除提示层', async () => {
    const pending = captureOverlay();
    expect(overlayRoot().textContent).toContain('拖动选择区域');

    overlay().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 }),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 110, clientY: 70 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 110, clientY: 70 }));

    const result = await pending;

    expect(result).toMatchObject({
      cancelled: false,
      rect: { x: 10, y: 20, width: 100, height: 50 },
    });
    if (!result.cancelled) {
      expect(result.viewport.width).toBeGreaterThan(0);
      expect(result.viewport.height).toBeGreaterThan(0);
      expect(result.viewport.dpr).toBeGreaterThan(0);
    }
    expect(document.getElementById('pagehand-capture-overlay')).toBeNull();
  });

  it('只点击不拖动视为太小，退出并给出原因', async () => {
    const pending = captureOverlay();
    overlay().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 }),
    );
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 15, clientY: 25 }));

    await expect(pending).resolves.toMatchObject({ cancelled: true, reason: 'too_small' });
    expect(document.getElementById('pagehand-capture-overlay')).toBeNull();
  });

  it('Esc 和取消按钮都能退出', async () => {
    const first = captureOverlay();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(first).resolves.toMatchObject({ cancelled: true, reason: 'escape' });

    const second = captureOverlay();
    const cancel = overlayRoot().querySelector('.cancel');
    if (!(cancel instanceof HTMLButtonElement)) throw new Error('cancel missing');
    cancel.click();
    await expect(second).resolves.toMatchObject({ cancelled: true, reason: 'cancel' });
  });
});
