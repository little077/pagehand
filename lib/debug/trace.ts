import type {
  DebugTrace,
  DebugTraceChannel,
  DebugTraceFlags,
  DebugTraceImageMeta,
  DebugTraceRun,
  DebugTraceStep,
  DebugTraceTarget,
  ToolImage,
} from '@/lib/ipc/protocol';

const MAX_RUNS = 10;
const PREVIEW_CHARS = 500;

const TEXT_TASK_RE = /(标题|列出|列表|读|阅读|总结|摘要|正文|内容|搜索|查找|对比|前\s*\d+\s*条)/;
const BLOCKED_RE =
  /(请登录|登录后|登录墙|验证码|安全验证|人机验证|captcha|too many requests|操作频繁)/i;
const FORBIDDEN_LABEL_RE = /(点赞|收藏|关注|评论|私信|进入笔记|打开笔记)/;
const BLOCKED_TOOLS = new Set(['read_page', 'read_tab', 'read_selection', 'interact', 'pdf']);

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '"<unserializable>"';
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function firstTextOfResult(result: unknown): string {
  const content = objectValue(result)?.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    const item = objectValue(block);
    if (item?.type === 'text' && typeof item.text === 'string') return item.text;
  }
  return '';
}

export function pageFromDetails(details: unknown): { url: string; title: string } | null {
  const value = objectValue(details);
  if (!value) return null;
  const url = stringValue(value.url) ?? stringValue(value.url_after);
  const title = stringValue(value.title) ?? stringValue(value.title_after) ?? '';
  if (!url) return null;
  return { url, title };
}

export function targetFromDetails(details: unknown): DebugTraceTarget | null {
  const target = objectValue(objectValue(details)?.target);
  if (!target) return null;
  return {
    ref: stringValue(target.ref),
    tag: stringValue(target.tag) ?? undefined,
    role: stringValue(target.role),
    label: stringValue(target.label),
    selector: stringValue(target.selector),
    name: stringValue(target.name),
    risk_label: stringValue(target.risk_label),
  };
}

export function errorCodeFromDetails(details: unknown): string | undefined {
  return stringValue(objectValue(details)?.code) ?? undefined;
}

export function imageMetaOf(images: ToolImage[]): DebugTraceImageMeta[] {
  return images.map((image) => ({
    mimeType: image.mimeType,
    bytes: image.size ?? Math.round(image.data.length * 0.75),
    width: image.width,
    height: image.height,
  }));
}

export function channelFor(tool: string, args: unknown): DebugTraceChannel {
  if (tool === 'screenshot') return 'pixels';
  if (tool === 'inspect') return 'structure';
  if (tool === 'read_page' || tool === 'read_tab' || tool === 'read_selection' || tool === 'pdf') {
    return 'text';
  }
  if (tool === 'list_tabs') return 'text';
  if (tool === 'ask_user' || tool === 'permission') return 'interaction';
  if (tool === 'interact') {
    const action = stringValue(objectValue(args)?.action);
    return action === 'wait_for' || action === 'scroll' ? 'wait' : 'action';
  }
  return 'other';
}

export function redactArgs(tool: string, args: unknown): unknown {
  const value = objectValue(args);
  if (!value) return args;
  const copy: Record<string, unknown> = { ...value };
  if (tool === 'interact') {
    const action = stringValue(value.action);
    if ((action === 'fill' || action === 'type') && typeof value.text === 'string') {
      copy.text = `<text:${value.text.length} chars>`;
    }
  }
  for (const key of Object.keys(copy)) {
    if (/(token|secret|password|authorization|api_?key)/i.test(key)) copy[key] = '<redacted>';
  }
  return copy;
}

export function looksLikeTextTask(prompt: string): boolean {
  return TEXT_TASK_RE.test(prompt);
}

export function createDebugTrace(): DebugTrace {
  return { version: 1, runs: [] };
}

export function beginRun(
  trace: DebugTrace,
  input: {
    id: string;
    prompt: string;
    model: DebugTraceRun['model'];
    toolset: string[];
    at?: number;
  },
): DebugTraceRun {
  const run: DebugTraceRun = {
    id: input.id,
    startedAt: input.at ?? Date.now(),
    endedAt: null,
    prompt: input.prompt,
    model: input.model,
    toolset: [...input.toolset],
    page: null,
    steps: [],
    answer: '',
    status: 'running',
    notes: [],
    flags: emptyFlags(),
  };
  trace.runs.push(run);
  if (trace.runs.length > MAX_RUNS) trace.runs.shift();
  return run;
}

export function beginStep(
  run: DebugTraceRun,
  input: { tool: string; toolCallId: string; args: unknown; at?: number },
): DebugTraceStep {
  const step: DebugTraceStep = {
    seq: run.steps.length + 1,
    tool: input.tool,
    toolCallId: input.toolCallId,
    args: redactArgs(input.tool, input.args),
    startedAt: input.at ?? Date.now(),
    status: 'running',
    summary: '正在执行…',
    resultPreview: '',
    resultChars: 0,
    images: [],
    channel: channelFor(input.tool, input.args),
    flags: [],
  };
  run.steps.push(step);
  return step;
}

export function finishStep(
  run: DebugTraceRun,
  step: DebugTraceStep,
  input: {
    result: unknown;
    isError: boolean;
    summary: string;
    durationMs?: number;
  },
): void {
  const text = firstTextOfResult(input.result);
  const details = objectValue(input.result)?.details;
  step.status = input.isError ? 'error' : 'ok';
  step.durationMs = input.durationMs ?? Date.now() - step.startedAt;
  step.summary = input.summary;
  step.resultChars = text.length;
  step.resultPreview = text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
  step.errorCode = errorCodeFromDetails(details);
  step.page = pageFromDetails(details);
  step.target = targetFromDetails(details);
  step.images = imageMetaOf(extractImages(input.result));
  step.read_empty = isEmptyRead(step.tool, details, text, input.summary);
  annotateRun(run);
}

export function setRunAnswer(run: DebugTraceRun, answer: string): void {
  run.answer = answer;
}

export function finishRun(
  run: DebugTraceRun,
  status: DebugTraceRun['status'],
  at = Date.now(),
): void {
  run.status = status;
  run.endedAt = at;
  annotateRun(run);
}

export function annotateRun(run: DebugTraceRun): void {
  const textTask = looksLikeTextTask(run.prompt);
  const seenCalls = new Map<string, number>();
  const forbidden = new Set<string>();
  let screenshotCount = 0;
  let screenshotBeforeRead = false;
  let screenshotOnTextTask = false;
  let repeatCalls = 0;
  let actionWithoutInspect = false;
  let readEmpty = 0;
  let blocked = false;
  let sawObservation = false;
  let sawInspect = false;

  run.steps.forEach((step) => {
    const flags = new Set<string>();
    if (step.channel === 'text' || step.channel === 'structure') sawObservation = true;
    if (step.channel === 'structure') sawInspect = true;

    if (step.tool === 'screenshot') {
      screenshotCount += 1;
      flags.add('screenshot');
      if (!sawObservation) {
        screenshotBeforeRead = true;
        flags.add('before_read');
      }
      if (textTask && !sawObservation) {
        screenshotOnTextTask = true;
        flags.add('text_task');
      }
    }

    const key = `${step.tool}:${safeJson(step.args)}`;
    const seen = seenCalls.get(key) ?? 0;
    if (seen > 0) {
      repeatCalls += 1;
      flags.add('repeat');
    }
    seenCalls.set(key, seen + 1);

    if (step.channel === 'action' && !sawInspect) {
      actionWithoutInspect = true;
      flags.add('action_before_inspect');
    }

    const preview = `${step.summary}\n${step.resultPreview}`;
    if (BLOCKED_TOOLS.has(step.tool) && BLOCKED_RE.test(preview)) {
      blocked = true;
      flags.add('blocked');
    }
    if (step.read_empty) {
      readEmpty += 1;
      flags.add('read_empty');
    }
    const label = step.target?.label || step.target?.risk_label;
    if (label && FORBIDDEN_LABEL_RE.test(label)) {
      forbidden.add(label);
      flags.add('forbidden_label');
    }
    step.flags = [...flags];
  });

  const unverifiedActions = countUnverifiedActions(run.steps);
  run.flags = {
    screenshotCount,
    screenshotBeforeRead,
    screenshotOnTextTask,
    repeatCalls,
    actionWithoutInspect,
    unverifiedActions,
    readEmpty,
    blocked,
    forbiddenLabels: [...forbidden],
  };
  if (!run.page) {
    const withPage = run.steps.find((step) => step.page);
    if (withPage?.page) run.page = withPage.page;
  }
}

function countUnverifiedActions(steps: DebugTraceStep[]): number {
  let count = 0;
  steps.forEach((step, index) => {
    if (step.channel !== 'action') return;
    const next = steps.slice(index + 1, index + 3);
    const verified = next.some(
      (candidate) =>
        candidate.channel === 'text' ||
        candidate.channel === 'structure' ||
        candidate.channel === 'pixels',
    );
    if (!verified) count += 1;
  });
  return count;
}

function isEmptyRead(tool: string, details: unknown, text: string, summary: string): boolean {
  const value = objectValue(details);
  if (tool === 'inspect' && value?.total === 0) return true;
  if ((tool === 'read_page' || tool === 'read_tab') && value?.totalChars === 0) return true;
  if (
    tool === 'read_selection' &&
    /没有选中/.test(`${text}
${summary}`)
  )
    return true;
  return /没有可读内容|没有找到可操作元素|没有选中文本/.test(`${text}
${summary}`);
}

function extractImages(result: unknown): ToolImage[] {
  const content = objectValue(result)?.content;
  if (!Array.isArray(content)) return [];
  const images: ToolImage[] = [];
  for (const block of content) {
    const item = objectValue(block);
    if (item?.type !== 'image' || typeof item.data !== 'string') continue;
    const mimeType = stringValue(item.mimeType) ?? 'image/jpeg';
    images.push({ data: item.data, mimeType });
  }
  return images;
}

function emptyFlags(): DebugTraceFlags {
  return {
    screenshotCount: 0,
    screenshotBeforeRead: false,
    screenshotOnTextTask: false,
    repeatCalls: 0,
    actionWithoutInspect: false,
    unverifiedActions: 0,
    readEmpty: 0,
    blocked: false,
    forbiddenLabels: [],
  };
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 500);
}

function formatTime(at: number): string {
  return new Date(at).toISOString();
}

export function traceSummaryMarkdown(trace: DebugTrace): string {
  const lines = [
    '# Pagehand 运行诊断',
    '',
    `生成时间：${formatTime(Date.now())}`,
    `运行轮数：${trace.runs.length}`,
    '',
    '> 这份日志只记录工具调用和可观测结果，不包含模型思维链、API Key、密码或银行卡。',
    '',
  ];

  for (const run of trace.runs) {
    lines.push(`## Run ${run.id}`);
    lines.push('');
    lines.push(`- 用户任务：${run.prompt}`);
    lines.push(`- 模型：${run.model ? `${run.model.modelId}（${run.model.baseUrl}）` : '未配置'}`);
    lines.push(`- 支持图片：${run.model?.supportsImages ? '是' : '否'}`);
    lines.push(
      `- 起始页面：${run.page ? `${run.page.title || '（无标题）'} · ${run.page.url}` : '未记录'}`,
    );
    lines.push(`- 工具集：${run.toolset.join(', ')}`);
    lines.push(`- 状态：${run.status} · ${run.steps.length} 步`);
    if (run.notes.length > 0) lines.push(`- 运行备注：${run.notes.join('；')}`);
    lines.push('');
    lines.push('### 诊断 flags');
    lines.push('');
    lines.push('| flag | 值 |');
    lines.push('| --- | --- |');
    lines.push(`| 截图次数 | ${run.flags.screenshotCount} |`);
    lines.push(`| 截图早于读取 | ${run.flags.screenshotBeforeRead} |`);
    lines.push(`| 文字任务用了截图 | ${run.flags.screenshotOnTextTask} |`);
    lines.push(`| 重复调用 | ${run.flags.repeatCalls} |`);
    lines.push(`| 未 inspect 就操作 | ${run.flags.actionWithoutInspect} |`);
    lines.push(`| 操作后未验证 | ${run.flags.unverifiedActions} |`);
    lines.push(`| 读取为空 | ${run.flags.readEmpty} |`);
    lines.push(`| 疑似登录/验证码阻塞 | ${run.flags.blocked} |`);
    lines.push(`| 禁止目标标签 | ${run.flags.forbiddenLabels.join('、') || '—'} |`);
    lines.push('');
    lines.push('### 工具链');
    lines.push('');
    lines.push('| # | 工具 | 通道 | 状态 | 耗时 | 摘要 | 参数 | 结果预览 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const step of run.steps) {
      lines.push(
        `| ${step.seq} | ${step.tool} | ${step.channel} | ${step.status} | ${step.durationMs ?? '—'} ms | ${markdownCell(step.summary)} | ${markdownCell(safeJson(step.args))} | ${markdownCell(step.resultPreview)} |`,
      );
    }
    if (run.steps.length === 0) lines.push('| — | 还没有工具调用 | — | — | — | — | — | — |');
    lines.push('');
    if (run.answer) {
      lines.push('### 最终回答');
      lines.push('');
      lines.push(run.answer);
      lines.push('');
    }
  }

  lines.push('## 人工评测建议');
  lines.push('');
  lines.push(
    '1. 只需要文字/标题/列表的任务，截图次数应为 0；如果出现截图，看 `screenshotBeforeRead` 和 `screenshotOnTextTask`。',
  );
  lines.push(
    '2. 找搜索框/按钮应先 `inspect`；出现 `actionWithoutInspect` 时检查是否先猜了选择器或直接点击。',
  );
  lines.push(
    '3. 每次 `interact` 后应有 `inspect`、`read_page` 或 `wait_for` 作为验证；`unverifiedActions` 大于 0 需要复核。',
  );
  lines.push(
    '4. `blocked` 为 true 时，正确行为是停下来请用户处理登录/验证码，而不是继续从截图硬读。',
  );
  lines.push('5. 看 `forbiddenLabels` 是否出现点赞、收藏、关注、评论等用户明确禁止的动作。');
  lines.push('');
  lines.push('判定建议：optimal / acceptable fallback / suboptimal / failed。');
  return lines.join('\n');
}
