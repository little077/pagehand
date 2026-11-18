import type { ChatItem, InteractionItem } from '@/lib/ipc/protocol';

export type FlowItem = Exclude<ChatItem, InteractionItem>;
export type UserItem = Extract<FlowItem, { kind: 'user' }>;
export type AssistantItem = Extract<FlowItem, { kind: 'assistant' }>;
export type ToolItem = Extract<FlowItem, { kind: 'tool' }>;

export type RunStatus = 'running' | 'done' | 'error' | 'stopped';

export interface RunView {
  id: string;
  userId: string | null;
  items: FlowItem[];
  tools: ToolItem[];
  notes: AssistantItem[];
  answer: AssistantItem | null;
  status: RunStatus;
  currentTool: ToolItem | null;
  stepCount: number;
  startedAt: number | null;
  endedAt: number | null;
  elapsedMs: number;
}

export type ConversationBlock = { kind: 'user'; item: UserItem } | { kind: 'run'; run: RunView };

export const TOOL_LABELS: Record<string, string> = {
  read_page: '读取当前页面',
  list_tabs: '列出标签页',
  read_tab: '读取指定标签页',
  read_selection: '读取选中文本',
  inspect: '检查页面元素',
  screenshot: '截图',
  pdf: '读取 PDF',
  ask_user: '向你提问',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return '不足 1 秒';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function isVisible(item: FlowItem): boolean {
  return item.kind !== 'assistant' || item.status !== 'done' || item.text.trim().length > 0;
}

function lastAssistant(items: FlowItem[], from: number): AssistantItem | null {
  for (let index = items.length - 1; index >= from; index -= 1) {
    const item = items[index];
    if (item?.kind === 'assistant') return item;
  }
  return null;
}

function lastToolIndex(items: FlowItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === 'tool') return index;
  }
  return -1;
}

function buildRun(
  id: string,
  userId: string | null,
  input: FlowItem[],
  options: { busy: boolean; isLast: boolean; now: number },
): RunView {
  const items = input.filter(isVisible);
  const tools = items.filter((item): item is ToolItem => item.kind === 'tool');
  const toolIndex = lastToolIndex(items);
  const answer = toolIndex >= 0 ? lastAssistant(items, toolIndex + 1) : lastAssistant(items, 0);
  const notes = items.filter(
    (item): item is AssistantItem => item.kind === 'assistant' && item.id !== answer?.id,
  );

  const runningTool = tools.findLast((tool) => tool.status === 'running') ?? null;
  const hasToolError = tools.some((tool) => tool.status === 'error');
  const hasAnswerError =
    answer?.status === 'error' || notes.some((note) => note.status === 'error');

  let status: RunStatus;
  if (runningTool) {
    status = options.isLast && options.busy ? 'running' : 'stopped';
  } else if (hasToolError || hasAnswerError) {
    status = 'error';
  } else if (answer?.status === 'streaming' || (options.isLast && options.busy)) {
    status = 'running';
  } else {
    status = 'done';
  }

  const finishedTools = tools.filter((tool) => tool.status !== 'running');
  const lastFinished = finishedTools[finishedTools.length - 1];
  const startedAt = tools.length > 0 ? Math.min(...tools.map((tool) => tool.startedAt)) : null;
  const endedAt =
    status === 'running'
      ? options.now
      : lastFinished
        ? lastFinished.startedAt + (lastFinished.durationMs ?? 0)
        : options.now;
  const elapsedMs = startedAt !== null ? Math.max(0, endedAt - startedAt) : 0;

  return {
    id,
    userId,
    items,
    tools,
    notes,
    answer,
    status,
    currentTool: runningTool,
    stepCount: tools.length,
    startedAt,
    endedAt: status === 'running' ? null : endedAt,
    elapsedMs,
  };
}

export function groupConversation(
  items: ChatItem[],
  options: { busy: boolean; now?: number },
): ConversationBlock[] {
  const now = options.now ?? Date.now();
  const flow = items.filter(
    (item): item is FlowItem =>
      item.kind !== 'interaction' &&
      (item.kind !== 'assistant' || item.status !== 'done' || item.text.trim().length > 0),
  );

  type RawBlock =
    | { kind: 'user'; item: UserItem }
    | { kind: 'run'; id: string; userId: string | null; items: FlowItem[] };

  const blocks: RawBlock[] = [];
  let current: { id: string; userId: string | null; items: FlowItem[] } | null = null;
  let lastUser: UserItem | null = null;

  for (const item of flow) {
    if (item.kind === 'user') {
      lastUser = item;
      current = null;
      blocks.push({ kind: 'user', item });
      continue;
    }
    if (!current) {
      current = {
        id: `run-${item.id}`,
        userId: lastUser?.id ?? null,
        items: [],
      };
      blocks.push({ kind: 'run', ...current });
    }
    current.items.push(item);
  }

  // 用户刚发出任务、模型还没吐出第一条消息时，也要有一个可折叠的「思考中」块。
  const lastBlock = blocks[blocks.length - 1];
  if (options.busy && lastBlock?.kind === 'user') {
    blocks.push({
      kind: 'run',
      id: `run-pending-${lastBlock.item.id}`,
      userId: lastBlock.item.id,
      items: [],
    });
  }

  const runBlocks = blocks.filter(
    (block): block is Extract<RawBlock, { kind: 'run' }> => block.kind === 'run',
  );
  let runIndex = 0;

  return blocks.map((block) => {
    if (block.kind === 'user') return block;
    const isLast = runIndex === runBlocks.length - 1;
    runIndex += 1;
    return {
      kind: 'run' as const,
      run: buildRun(block.id, block.userId, block.items, {
        busy: options.busy,
        isLast,
        now,
      }),
    };
  });
}

export function firstFailedStep(run: RunView): number | null {
  const index = run.tools.findIndex((tool) => tool.status === 'error');
  return index >= 0 ? index + 1 : null;
}

export function describeRun(run: RunView, elapsedMs = run.elapsedMs): string {
  if (run.status === 'running') {
    if (run.currentTool) {
      const position = run.tools.findIndex((tool) => tool.id === run.currentTool?.id) + 1;
      const index = position > 0 ? position : run.stepCount;
      return `正在执行工具（${index}/${run.stepCount}）：${toolLabel(run.currentTool.name)}…`;
    }
    if (run.stepCount > 0) {
      if (run.answer?.status === 'streaming') {
        return `已执行 ${run.stepCount} 个工具 · 正在整理回答…`;
      }
      return `已执行 ${run.stepCount} 个工具 · 等待下一步…`;
    }
    return '思考中…';
  }
  if (run.status === 'stopped') {
    return run.stepCount > 0 ? `工具执行已停止 · ${run.stepCount} 个` : '已停止';
  }
  if (run.status === 'error') {
    const failed = firstFailedStep(run);
    if (failed !== null) return `工具执行失败 · 第 ${failed} 步`;
    if (run.answer?.status === 'error') return '工具执行完成 · 回答生成失败';
    return '执行失败';
  }
  if (run.stepCount === 0) return '已完成';
  const parts = [`已执行 ${run.stepCount} 个工具`];
  if (elapsedMs >= 1000) parts.push(formatElapsed(elapsedMs));
  return parts.join(' · ');
}
