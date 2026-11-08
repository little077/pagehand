import { Eye, EyeOff, KeyRound, ShieldCheck, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  DEFAULT_PROVIDER_PRESET,
  findPreset,
  isLikelyApiKey,
  normalizeBaseUrl,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/lib/config/presets';
import type { ProviderConfig } from '@/lib/ipc/protocol';

interface SettingsSheetProps {
  open: boolean;
  config: ProviderConfig | null;
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
}

const inputClass =
  'w-full rounded-xl border border-line-strong bg-app px-3 py-2.5 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/50 focus:ring-2 focus:ring-brand/10';

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <label
        htmlFor={htmlFor}
        className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-semibold text-ink"
      >
        {label}
        {hint && <span className="font-normal text-[9.5px] text-ink-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function SettingsSheet({ open, config, onClose, onSave }: SettingsSheetProps) {
  const [presetId, setPresetId] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const preset = findPreset(config?.presetId ?? 'deepseek') ?? DEFAULT_PROVIDER_PRESET;
    setPresetId(config?.presetId ?? preset.id);
    setBaseUrl(config?.baseUrl ?? preset.baseUrl);
    setModelId(config?.modelId ?? preset.modelId);
    setApiKey(config?.apiKey ?? '');
    setShowKey(false);
    setError(null);
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function selectPreset(preset: ProviderPreset) {
    setPresetId(preset.id);
    if (preset.id !== 'custom') {
      setBaseUrl(preset.baseUrl);
      setModelId(preset.modelId);
    }
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setError('Base URL 需要以 http:// 或 https:// 开头。');
      return;
    }
    if (!modelId.trim()) {
      setError('请填写模型 ID，例如 deepseek-v4-flash。');
      return;
    }
    if (!isLikelyApiKey(apiKey)) {
      setError('API Key 看起来太短，请检查是否粘贴完整。');
      return;
    }
    onSave({
      presetId,
      baseUrl: normalizeBaseUrl(baseUrl),
      modelId: modelId.trim(),
      apiKey: apiKey.trim(),
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点击遮罩关闭只是鼠标增强，键盘路径是 Escape 和关闭按钮
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-ink/25 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="模型设置"
        className="max-h-[93%] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface px-4 pb-5 pt-2.5 shadow-[0_-12px_40px_rgb(22_35_49_/_14%)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[18px] font-semibold tracking-tight text-ink">
              模型设置
            </h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">
              Bring your own key。密钥只保存在这台电脑的浏览器里。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft transition hover:bg-surface-soft hover:text-ink"
            aria-label="关闭设置"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold text-ink">服务商</span>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDER_PRESETS.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className={`rounded-xl border px-2.5 py-2 text-left transition ${
                      active
                        ? 'border-brand/45 bg-brand/[0.07] text-ink'
                        : 'border-line bg-app text-ink-soft hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    <span className="block text-[11px] font-semibold">{preset.label}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-ink-faint">
                      {preset.id === 'custom' ? '任意兼容端点' : preset.modelId}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Base URL" hint="OpenAI 兼容端点" htmlFor="ph-base-url">
            <input
              id="ph-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.deepseek.com/v1"
              spellCheck={false}
              autoComplete="off"
              className={inputClass}
            />
          </Field>

          <Field label="模型 ID" hint="以服务商文档为准" htmlFor="ph-model-id">
            <input
              id="ph-model-id"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder="deepseek-v4-flash"
              spellCheck={false}
              autoComplete="off"
              className={inputClass}
            />
          </Field>

          <Field label="API Key" hint="只写本机" htmlFor="ph-api-key">
            <div className="relative">
              <input
                id="ph-api-key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type={showKey ? 'text' : 'password'}
                placeholder={findPreset(presetId)?.keyHint ?? 'sk-...'}
                spellCheck={false}
                autoComplete="off"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition hover:bg-surface-soft hover:text-ink"
                aria-label={showKey ? '隐藏密钥' : '显示密钥'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          <div className="flex items-start gap-2 rounded-xl bg-app px-3 py-2.5 text-[10px] leading-relaxed text-ink-soft">
            <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-success" />
            <span>Pagehand 不设服务器、不上报遥测。模型请求由扩展后台直接发往你填写的端点。</span>
          </div>

          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger/[0.05] px-3 py-2 text-[10.5px] text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-brand-strong"
          >
            <KeyRound size={14} />
            {config ? '保存并开始新会话' : '保存配置'}
          </button>
        </div>
      </form>
    </div>
  );
}
