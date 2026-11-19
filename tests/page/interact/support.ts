import { resetRefStore } from '@/lib/page/ref-store';

export function mount(html: string): void {
  document.body.innerHTML = html;
}

export function stubLayout(): void {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const element = this as HTMLElement;
    const width = Number(element.dataset.width ?? '120');
    const height = Number(element.dataset.height ?? '24');
    const x = Number(element.dataset.x ?? '0');
    const y = Number(element.dataset.y ?? '0');
    return {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

export function stubTopElement(element: Element | null): void {
  document.elementFromPoint = () => element;
}

export function resetPage(): void {
  document.body.innerHTML = '';
  resetRefStore();
  stubLayout();
  stubTopElement(null);
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(window, 'scrollBy', {
    value: () => undefined,
    configurable: true,
  });
  Object.defineProperty(window, 'scrollX', { value: 0, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
}
