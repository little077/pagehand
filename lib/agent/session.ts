import { Agent, type AgentEvent } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, TextContent } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type {
  BgToUi,
  ChatItem,
  ProviderConfig,
  SessionSnapshot,
  TraceEntry,
  TraceKind,
} from '@/lib/ipc/protocol';
import { ALLOWED_TOOL_NAMES, PAGEHAND_TOOLS } from '@/lib/tools';
import { toPiModel } from './model';
import { SYSTEM_PROMPT } from './prompt';

const MAX_TURNS = 4;
const MAX_TRACE = 100;
const openAICompatibleStreams = openAICompletionsApi();

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function firstContentText(result: unknown): string {
  const content = (result as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block && typeof block === 'object' && 'type' in block) {
      const typed = block as { type: unknown; text?: unknown };
      if (typed.type === 'text' && typeof typed.text === 'string') return typed.text;
    }
  }
  return '';
}

export class AgentSession {
  config: ProviderConfig | null = null;
  items: ChatItem[] = [];
  trace: TraceEntry[] = [];
  busy = false;

  private agent: Agent | null = null;
  private turnCount = 0;
  private seq = 0;
  private streamingId: string | null = null;
  private readonly emit: (message: BgToUi) => void;

  constructor(emit: (message: BgToUi) => void) {
    this.emit = emit;
  }

  snapshot(): SessionSnapshot {
    return {
      config: this.config,
      items: this.items,
      trace: this.trace,
      busy: this.busy,
    };
  }

  applyConfig(config: ProviderConfig): void {
    const changed = JSON.stringify(this.config) !== JSON.stringify(config);
    this.config = config;
    if (changed) {
      this.agent = null;
    }
    this.emit({ type: 'config', config });
  }

  async send(input: string): Promise<void> {
    const text = input.trim();
    if (!text) return;

    if (this.busy) {
      this.emit({ type: 'error', message: '上一轮还在处理，请稍候或先点停止。' });
      return;
    }
    if (!this.config) {
      this.emit({ type: 'error', message: '还没有配置模型。请打开设置，填入 API Key 和模型。' });
      return;
    }

    const userId = `u-${++this.seq}`;
    this.items.push({ kind: 'user', id: userId, text });
    this.emit({ type: 'user_message', id: userId, text });
    this.pushTrace('run', '收到任务', text.slice(0, 160));

    this.busy = true;
    this.turnCount = 0;
    this.emit({ type: 'busy', value: true });

    try {
      await this.ensureAgent().prompt(text);
    } catch (error) {
      const message = errorMessage(error);
      this.emit({ type: 'error', message });
      this.pushTrace('error', '运行失败', message);
    } finally {
      this.busy = false;
      this.emit({ type: 'busy', value: false });
    }
  }

  abort(): void {
    this.agent?.abort();
    this.pushTrace('run', '已请求停止');
  }

  reset(): void {
    this.agent?.abort();
    this.agent = null;
    this.items = [];
    this.trace = [];
    this.busy = false;
    this.turnCount = 0;
    this.streamingId = null;
    this.emit({ type: 'cleared' });
  }

  private ensureAgent(): Agent {
    if (this.agent) return this.agent;
    if (!this.config) throw new Error('缺少模型配置');

    const config = this.config;
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: toPiModel(config),
        tools: PAGEHAND_TOOLS,
        thinkingLevel: 'off',
      },
      streamFn: (model, context, options) =>
        openAICompatibleStreams.streamSimple(model, context, options),
      getApiKey: () => this.config?.apiKey,
      beforeToolCall: async ({ toolCall }) => {
        if (!ALLOWED_TOOL_NAMES.has(toolCall.name)) {
          return { block: true, reason: `工具 ${toolCall.name} 当前未开放。` };
        }
        return undefined;
      },
      finishTurn: () => {
        this.turnCount += 1;
        if (this.turnCount >= MAX_TURNS) {
          this.pushTrace('run', '达到单轮工具次数上限', `本轮最多 ${MAX_TURNS} 个回合`);
          return { action: 'end' };
        }
        return undefined;
      },
    });

    agent.subscribe((event) => this.handleEvent(event));
    this.agent = agent;
    return agent;
  }

  private handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'message_start': {
        if (event.message.role !== 'assistant') return;
        const id = `a-${++this.seq}`;
        this.streamingId = id;
        this.items.push({ kind: 'assistant', id, text: '', status: 'streaming' });
        this.emit({ type: 'assistant_start', id });
        return;
      }
      case 'message_update': {
        if (!this.streamingId) return;
        const update = event.assistantMessageEvent;
        if (update.type !== 'text_delta') return;
        const item = this.findItem(this.streamingId);
        if (item?.kind === 'assistant') {
          item.text += update.delta;
        }
        this.emit({ type: 'assistant_delta', id: this.streamingId, text: update.delta });
        return;
      }
      case 'message_end': {
        if (event.message.role !== 'assistant') return;
        const id = this.streamingId;
        this.streamingId = null;
        if (!id) return;
        const message = event.message;
        const text = assistantText(message);
        const failed = message.stopReason === 'error';
        const error = failed ? (message.errorMessage ?? '模型请求失败') : undefined;

        const item = this.findItem(id);
        if (item?.kind === 'assistant') {
          item.text = text;
          item.status = failed ? 'error' : 'done';
          item.error = error;
        }
        this.emit({ type: 'assistant_end', id, text, error });
        if (failed) {
          this.pushTrace('error', '模型请求失败', error ?? '未知错误');
        }
        return;
      }
      case 'tool_execution_start': {
        const id = `t-${++this.seq}`;
        this.items.push({
          kind: 'tool',
          id,
          name: event.toolName,
          args: event.args,
          status: 'running',
          summary: '正在执行…',
        });
        this.pushTrace('tool', `调用 ${event.toolName}`, JSON.stringify(event.args ?? {}));
        this.emit({ type: 'tool_start', id, name: event.toolName, args: event.args });
        return;
      }
      case 'tool_execution_end': {
        const item = this.findRunningTool();
        const summary = this.describeToolResult(event.toolName, event.result, event.isError);
        if (item) {
          item.status = event.isError ? 'error' : 'ok';
          item.summary = summary;
          item.details = (event.result as { details?: unknown } | null)?.details;
          this.emit({
            type: 'tool_end',
            id: item.id,
            name: event.toolName,
            ok: !event.isError,
            summary,
            details: item.details,
          });
        }
        this.pushTrace('tool', `${event.toolName} ${event.isError ? '失败' : '完成'}`, summary);
        return;
      }
      case 'agent_end': {
        this.pushTrace('run', '本轮结束');
        return;
      }
      default:
        return;
    }
  }

  private findItem(id: string): ChatItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  private findRunningTool(): Extract<ChatItem, { kind: 'tool' }> | undefined {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (item?.kind === 'tool' && item.status === 'running') return item;
    }
    return undefined;
  }

  private describeToolResult(name: string, result: unknown, isError: boolean): string {
    if (isError) {
      return firstContentText(result).slice(0, 200) || `${name} 执行失败`;
    }
    const details = (result as { details?: Record<string, unknown> } | null)?.details;
    if (name === 'read_page' && details) {
      const title = typeof details.title === 'string' ? details.title : '当前页面';
      const chars = typeof details.totalChars === 'number' ? details.totalChars : 0;
      const truncated = details.truncated === true;
      return `已读取「${title}」 · ${chars} 字${truncated ? '（正文已截断）' : ''}`;
    }
    return firstContentText(result).slice(0, 160) || `${name} 完成`;
  }

  private pushTrace(kind: TraceKind, title: string, detail?: string): void {
    const entry: TraceEntry = { id: `tr-${++this.seq}`, at: Date.now(), kind, title, detail };
    this.trace.push(entry);
    if (this.trace.length > MAX_TRACE) this.trace.shift();
    this.emit({ type: 'trace', entry });
  }
}
