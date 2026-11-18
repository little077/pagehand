import { Bug } from 'lucide-react';

/**
 * Dev-only 刘海入口：模仿手机顶部刘海，黑底红字，点击进入侧边栏内的 debug 页面。
 * 只在 import.meta.env.DEV && import.meta.env.MODE === 'debug' 时渲染。
 */
export function DebugNotch({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="打开调试页面（仅开发环境）"
      aria-label="打开调试页面"
      className="fixed left-1/2 top-0 z-[70] flex h-[26px] -translate-x-1/2 items-end justify-center gap-1.5 rounded-b-[15px] bg-black px-5 pb-[4px] shadow-[0_6px_18px_rgb(0_0_0_/_0.28)] transition-[height] hover:h-[28px]"
    >
      <Bug size={11} className="mb-[3px] text-red-500" />
      <span className="font-mono text-[10.5px] font-bold tracking-[0.06em] text-red-500">
        debug 模式
      </span>
    </button>
  );
}
