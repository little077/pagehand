import { ArrowUpRight, FileText, KeyRound, Link2, ListTree, ShieldCheck } from 'lucide-react';

interface HomeProps {
  configured: boolean;
  onPick: (prompt: string) => void;
  onOpenSettings: () => void;
}

const SUGGESTIONS = [
  {
    icon: FileText,
    title: '总结这个页面',
    hint: '5 条要点 + 一句判断',
    prompt: '读取当前页面，用 5 条要点总结主要内容，最后用一句话给出你的总体判断。',
  },
  {
    icon: ListTree,
    title: '整理页面大纲',
    hint: '看清结构再读细节',
    prompt: '读取当前页面，把标题层级整理成大纲，并指出信息最密集的部分。',
  },
  {
    icon: Link2,
    title: '盘点页面链接',
    hint: '按用途分组列出',
    prompt: '读取当前页面，把页面上的链接按用途分组列出，并标出哪些看起来是外部站点。',
  },
];

export function Home({ configured, onPick, onOpenSettings }: HomeProps) {
  return (
    <div className="px-4 pb-6 pt-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
        页工 · 浏览器代办
      </p>
      <h2 className="mt-2 max-w-[300px] font-serif text-[25px] font-semibold leading-[1.28] tracking-tight text-ink">
        把这一页的体力活交出来。
      </h2>
      <p className="mt-2.5 max-w-[320px] text-[12px] leading-relaxed text-ink-soft">
        Pagehand 会读取你当前打开的页面，帮你总结、列大纲、找链接。它不会点击、填写或提交。
      </p>

      {!configured && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-5 flex w-full items-start gap-3 rounded-2xl border border-brand/25 bg-brand/[0.06] p-3.5 text-left transition hover:border-brand/40 hover:bg-brand/[0.09]"
        >
          <span className="mt-0.5 flex size-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <KeyRound size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-ink">
              先接上你的模型
              <ArrowUpRight size={13} className="flex-shrink-0 text-brand" />
            </span>
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-soft">
              填入任一 OpenAI 兼容服务的 API Key。密钥只保存在本机浏览器里。
            </span>
          </span>
        </button>
      )}

      <div className="mt-5 space-y-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => onPick(suggestion.prompt)}
            className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left shadow-[0_1px_0_rgb(29_55_76_/_4%)] transition hover:-translate-y-px hover:border-line-strong hover:shadow-[0_5px_16px_rgb(29_55_76_/_7%)]"
          >
            <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-xl bg-surface-soft text-brand transition group-hover:bg-brand/10">
              <suggestion.icon size={16} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-ink">{suggestion.title}</span>
              <span className="mt-0.5 block text-[10.5px] text-ink-soft">{suggestion.hint}</span>
            </span>
            <ArrowUpRight
              size={14}
              className="flex-shrink-0 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:text-brand"
            />
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-1.5 px-0.5 text-[10px] text-ink-faint">
        <ShieldCheck size={12} />
        第一版只有读取能力，所有操作都由你亲手完成
      </div>
    </div>
  );
}
