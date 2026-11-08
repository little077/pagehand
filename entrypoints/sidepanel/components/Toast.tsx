import { AlertTriangle, X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-start gap-2 rounded-xl bg-ink px-3 py-2 text-[11px] leading-relaxed text-white shadow-xl">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-amber-300" />
        <span className="min-w-0 break-words">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 flex-shrink-0 rounded p-0.5 text-white/60 transition hover:text-white"
          aria-label="关闭提示"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
