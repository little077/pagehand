import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { ImageDraftStatus } from './image-drafts';

interface PreviewTarget {
  id: string;
  src: string;
  width: number;
  height: number;
  status: ImageDraftStatus;
  anchor: HTMLElement;
}

interface ImagePreviewApi {
  show(target: PreviewTarget): void;
  hide(): void;
}

interface PreviewImage {
  id: string;
  src: string;
  width: number;
  height: number;
  status: ImageDraftStatus;
}

interface PreviewState {
  current: PreviewImage;
  previous: PreviewImage | null;
  anchor: HTMLElement;
  closing: boolean;
}

const NOOP: ImagePreviewApi = { show: () => {}, hide: () => {} };
const ImagePreviewContext = createContext<ImagePreviewApi | null>(null);

export function useImagePreview(): ImagePreviewApi {
  return useContext(ImagePreviewContext) ?? NOOP;
}

const PREVIEW_SIZE = 220;
const PREVIEW_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function PreviewCard({ state, rect }: { state: PreviewState; rect: DOMRect }) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const size = Math.min(PREVIEW_SIZE, Math.max(120, viewportWidth - 16));
  const left = clamp(rect.left + rect.width / 2 - size / 2, 8, viewportWidth - size - 8);
  const above = rect.top - size - PREVIEW_GAP;
  const top =
    above >= 8
      ? above
      : clamp(rect.bottom + PREVIEW_GAP, 8, Math.max(8, viewportHeight - size - 8));

  return (
    <div
      className={cn('ph-image-preview', state.closing && 'ph-image-preview-closing')}
      style={{ left, top, width: size, height: size }}
      aria-hidden="true"
    >
      {state.previous && (
        <div
          key={`out-${state.previous.id}`}
          className="ph-image-preview-layer ph-image-preview-out"
        >
          <img src={state.previous.src} alt="" draggable={false} />
        </div>
      )}
      <div key={`in-${state.current.id}`} className="ph-image-preview-layer ph-image-preview-in">
        <img src={state.current.src} alt="" draggable={false} />
      </div>
      <span className="pointer-events-none absolute bottom-1.5 right-2 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[8.5px] text-white/80">
        {state.current.status === 'preparing'
          ? '处理中…'
          : state.current.status === 'error'
            ? '处理失败'
            : `${state.current.width}×${state.current.height}`}
      </span>
    </div>
  );
}

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hideTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const show = useCallback(
    (target: PreviewTarget) => {
      clearTimers();
      setState((previous) => {
        const current: PreviewImage = {
          id: target.id,
          src: target.src,
          width: target.width,
          height: target.height,
          status: target.status,
        };
        if (previous && !previous.closing && previous.current.id === target.id) {
          return { ...previous, current, anchor: target.anchor };
        }
        return {
          current,
          previous: previous && !previous.closing ? previous.current : null,
          anchor: target.anchor,
          closing: false,
        };
      });
      setRect(target.anchor.getBoundingClientRect());
    },
    [clearTimers],
  );

  const hide = useCallback(() => {
    clearTimers();
    // 多张缩略图之间移动时，下一张的 show 会取消这次隐藏。
    hideTimer.current = window.setTimeout(() => {
      setState((previous) => (previous ? { ...previous, closing: true } : null));
      closeTimer.current = window.setTimeout(() => {
        setState(null);
        setRect(null);
      }, 160);
    }, 80);
  }, [clearTimers]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const openId = state && !state.closing ? state.current.id : null;
  const anchor = state?.anchor;

  useEffect(() => {
    if (!openId || !anchor) return;
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openId, anchor]);

  const api = useMemoPreviewApi(show, hide);
  const preview = state && rect ? <PreviewCard state={state} rect={rect} /> : null;

  return (
    <ImagePreviewContext.Provider value={api}>
      {children}
      {preview ? createPortal(preview, document.body) : null}
    </ImagePreviewContext.Provider>
  );
}

function useMemoPreviewApi(show: ImagePreviewApi['show'], hide: ImagePreviewApi['hide']) {
  const api = useRef<ImagePreviewApi>({ show, hide });
  api.current.show = show;
  api.current.hide = hide;
  return api.current;
}
