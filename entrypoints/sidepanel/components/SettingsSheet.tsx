import { Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_PROVIDER_PRESET,
  findPreset,
  isLikelyApiKey,
  normalizeBaseUrl,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/lib/config/presets';
import type { ProviderConfig } from '@/lib/ipc/protocol';
import { cn } from '@/lib/utils';

interface SettingsSheetProps {
  open: boolean;
  config: ProviderConfig | null;
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
  onListModels: (baseUrl: string, apiKey: string) => Promise<string[]>;
}

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
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <span className="text-[9.5px] font-normal text-ink-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SettingsSheet({ open, config, onClose, onSave, onListModels }: SettingsSheetProps) {
  const [presetId, setPresetId] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const preset = findPreset(config?.presetId ?? 'deepseek') ?? DEFAULT_PROVIDER_PRESET;
    setPresetId(config?.presetId ?? preset.id);
    setBaseUrl(config?.baseUrl ?? preset.baseUrl);
    setModelId(config?.modelId ?? preset.modelId);
    setApiKey(config?.apiKey ?? '');
    setShowKey(false);
    setError(null);
    setModels([]);
    setFetchingModels(false);
    setModelsError(null);
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

  const modelOptions = modelId && !models.includes(modelId) ? [modelId, ...models] : models;

  function selectPreset(preset: ProviderPreset) {
    setPresetId(preset.id);
    if (preset.id !== 'custom') {
      setBaseUrl(preset.baseUrl);
      setModelId(preset.modelId);
    }
    setModels([]);
    setModelsError(null);
    setError(null);
  }

  async function handleFetchModels() {
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setError('Base URL 需要以 http:// 或 https:// 开头。');
      return;
    }
    if (!isLikelyApiKey(apiKey)) {
      setError('API Key 看起来太短，请检查是否粘贴完整。');
      return;
    }

    setError(null);
    setModelsError(null);
    setFetchingModels(true);
    try {
      const list = await onListModels(normalizeBaseUrl(baseUrl), apiKey.trim());
      setModels(list);
      setModelId((current) => (list.includes(current) ? current : (list[0] ?? '')));
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingModels(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setError('Base URL 需要以 http:// 或 https:// 开头。');
      return;
    }
    if (!modelId.trim()) {
      setError('请选择模型，没有可选项时先获取模型列表。');
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-7 rounded-lg"
            aria-label="关闭设置"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-3.5">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold text-ink">服务商</span>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDER_PRESETS.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={active ? 'secondary' : 'outline'}
                    onClick={() => selectPreset(preset)}
                    className={cn(
                      'h-auto min-w-0 flex-col items-start gap-0 whitespace-normal px-2.5 py-2 text-left',
                      active && 'border-brand/45 bg-brand/[0.07] text-ink',
                    )}
                  >
                    <span className="block w-full text-[11px] font-semibold">{preset.label}</span>
                    <span className="mt-0.5 block w-full truncate text-[9px] font-normal text-ink-faint">
                      {preset.id === 'custom' ? '任意兼容端点' : preset.modelId}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <Field label="Base URL" hint="OpenAI 兼容端点" htmlFor="ph-base-url">
            <Input
              id="ph-base-url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setModels([]);
                setModelsError(null);
              }}
              placeholder="https://api.deepseek.com/v1"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>

          <Field label="API Key" hint="只写本机" htmlFor="ph-api-key">
            <InputGroup>
              <InputGroupInput
                id="ph-api-key"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setModels([]);
                  setModelsError(null);
                }}
                type={showKey ? 'text' : 'password'}
                placeholder={findPreset(presetId)?.keyHint ?? 'sk-...'}
                spellCheck={false}
                autoComplete="off"
              />
              <InputGroupAddon className="pl-0 pr-1.5">
                <InputGroupButton
                  size="icon-sm"
                  className="px-0"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </InputGroupButton>
                <span className="h-4 w-px bg-line" />
                <InputGroupButton
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  aria-label="获取模型列表"
                >
                  <RefreshCw size={12} className={fetchingModels ? 'animate-spin' : undefined} />
                  {fetchingModels ? '获取中' : '获取模型'}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {modelsError && (
              <p className="mt-1.5 rounded-xl border border-danger/25 bg-danger/[0.05] px-3 py-2 text-[10.5px] text-danger">
                {modelsError}
              </p>
            )}
          </Field>

          <Field
            label="模型"
            hint={models.length > 0 ? `已获取 ${models.length} 个` : '先获取模型列表'}
            htmlFor="ph-model-id"
          >
            <Select value={modelId} onValueChange={setModelId} disabled={modelOptions.length === 0}>
              <SelectTrigger id="ph-model-id" aria-label="选择模型">
                <SelectValue placeholder="暂无模型可选" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <Button type="submit" className="w-full">
            <KeyRound size={14} />
            {config ? '保存并开始新会话' : '保存配置'}
          </Button>
        </div>
      </form>
    </div>
  );
}
