import { Agent, type AgentEvent, type AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, TextContent } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type {
  BgToUi,
  ChatItem,
  InteractionItem,
  ProviderConfig,
  SessionSnapshot,
  TraceEntry,
  TraceKind,
} from '@/lib/ipc/protocol';
import {
  createSessionTitle,
  renameTitle,
  resumeSequence,
  type SessionRecord,
  type SessionTitle,
} from '@/lib/sessions/record';
import { repairRecord } from '@/lib/sessions/repair';
import {
  listSessions,
  loadCurrentSessionId,
  readSession,
  removeSession,
  saveCurrentSessionId,
  writeSession,
} from '@/lib/sessions/store';
import { ALLOWED_TOOL_NAMES, PAGEHAND_TOOLS } from '@/lib/tools';
import { bindInteractionBridge } from '@/lib/tools/bridge';
import { setImageSupport } from '@/lib/tools/runtime';
import { extractToolImages } from '@/lib/tools/tool-images';
import { InteractionBridge, type InteractionRequest, type InteractionStatus } from './interactions';
import { RuntimeKeepAlive } from './keepalive';
import { toPiModel } from './model';
import { evaluateToolGate } from './permission-gate';
import { SYSTEM_PROMPT } from './prompt';

const MAX_TURNS = 8;
const MAX_TRACE = 100;
const openAICompatibleStreams = openAICompletionsApi();

const INTERACTION_STATUS_LABEL: Record<InteractionStatus, string> = {
  answered: '已收到回答',
  denied: '已被拒绝',
  dismissed: '未回应',
  cancelled: '已取消',
};

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
  private sessionId: string | null = null;
  private sessionCreatedAt = 0;
  private title: SessionTitle = createSessionTitle();
  /** 从 IndexedDB 恢复、但还没回填给 Agent 的上下文。 */
  private restoredMessages: unknown[] | null = null;
  /** 落盘串行执行，避免一次长任务里并发写同一条记录。 */
  private writeChain: Promise<void> = Promise.resolve();
  /** 正在跑的那一轮，用于发新消息时先把它收尾。 */
  private running: Promise<void> | null = null;
  /** 本次 Service Worker 生命周期里是否已经读过磁盘，重连时不能再读一次盖掉内存。 */
  private restored = false;
  private readonly keepAlive = new RuntimeKeepAlive();
  private readonly emit: (message: BgToUi) => void;
  private readonly bridge: InteractionBridge;

  constructor(emit: (message: BgToUi) => void) {
    this.emit = emit;
    this.bridge = new InteractionBridge({
      open: (request) => this.openInteraction(request),
      settle: (id, status, values) => this.settleInteraction(id, status, values),
    });
    bindInteractionBridge(this.bridge);
  }

  snapshot(): SessionSnapshot {
    return {
      config: this.config,
      items: this.items,
      trace: this.trace,
      busy: this.busy,
      sessionId: this.sessionId,
      title: this.title,
    };
  }

  applyConfig(config: ProviderConfig): void {
    const changed = JSON.stringify(this.config) !== JSON.stringify(config);
    this.config = config;
    setImageSupport(config.supportsImages === true);
    if (changed) {
      this.agent = null;
    }
    this.emit({ type: 'config', config });
  }

  /** Service Worker 重启后接着上次的会话看；记录已被删除时只清掉指针。 */
  async restore(): Promise<void> {
    // 侧边栏重连时后台可能还在跑：内存比磁盘新，读回来会把这一轮 abort 掉。
    if (this.restored) return;
    this.restored = true;
    const id = await loadCurrentSessionId();
    if (!id) return;
    const record = await readSession(id);
    if (!record) {
      await saveCurrentSessionId(null);
      return;
    }
    this.applyRecord(record);
  }

  async openSession(id: string): Promise<void> {
    // 卡片挂着时可以切：那一轮会被作废，卡片按「已取消」收尾。
    if (this.bridge.pendingCount > 0) {
      await this.interruptPendingTurn();
    } else if (this.busy) {
      this.emit({ type: 'error', message: '上一轮还在处理，先点停止再切换会话。' });
      return;
    }
    const record = await readSession(id);
    if (!record) {
      this.emit({ type: 'error', message: '这个会话已经不在了，可能刚被删除。' });
      return;
    }
    this.applyRecord(record);
    await saveCurrentSessionId(id);
    this.emitSessionSwitched();
  }

  /**
   * 新会话不落盘：等第一条用户消息到了再创建记录，避免列表里堆一串空会话。
   */
  async newSession(): Promise<void> {
    this.bridge.cancelAll();
    this.agent?.abort();
    this.agent = null;
    this.sessionId = null;
    this.sessionCreatedAt = 0;
    this.title = createSessionTitle();
    this.items = [];
    this.trace = [];
    this.turnCount = 0;
    this.seq = 0;
    this.streamingId = null;
    this.restoredMessages = null;
    this.syncKeepAlive();
    await saveCurrentSessionId(null);
    this.emitSessionSwitched();
  }

  async renameSession(id: string, value: string): Promise<void> {
    const record = await readSession(id);
    if (!record) return;
    record.title = renameTitle(record.title, value);
    // 改名不刷新 updatedAt：否则只是改个名字就把会话顶到列表最前。
    await writeSession(record);
    if (id === this.sessionId) this.title = record.title;
    await this.emitSessions();
  }

  async deleteSession(id: string): Promise<void> {
    await removeSession(id);
    if (id === this.sessionId) await this.newSession();
    await this.emitSessions();
  }

  async send(input: string): Promise<void> {
    const text = input.trim();
    if (!text) return;

    // 卡片还挂着就发新消息 = 用户选择跳过回答：卡片作废，那一轮先收尾。
    if (this.bridge.pendingCount > 0) await this.interruptPendingTurn();

    if (this.busy) {
      this.emit({ type: 'error', message: '上一轮还在处理，请稍候或先点停止。' });
      return;
    }
    if (!this.config) {
      this.emit({ type: 'error', message: '还没有配置模型。请打开设置，填入 API Key 和模型。' });
      return;
    }

    if (!this.sessionId) {
      this.sessionId = crypto.randomUUID();
      this.sessionCreatedAt = Date.now();
      this.title = createSessionTitle(text);
    } else if (!this.title.fromPrompt) {
      this.title = { ...this.title, fromPrompt: createSessionTitle(text).fromPrompt };
    }

    const userId = `u-${++this.seq}`;
    this.items.push({ kind: 'user', id: userId, text });
    this.emit({ type: 'user_message', id: userId, text });
    this.pushTrace('run', '收到任务', text.slice(0, 160));

    this.turnCount = 0;
    this.setBusy(true);

    const turn = this.runTurn(text);
    this.running = turn;
    await turn;
  }

  /** 用户对卡片做决定：仅本次 / 始终允许 / 拒绝，或提交提问的答案。 */
  respondInteraction(input: {
    toolCallId: string;
    status: 'answered' | 'denied';
    always?: boolean;
    values?: Record<string, string>;
  }): void {
    this.bridge.respond(input.toolCallId, {
      status: input.status,
      always: input.always,
      values: input.values,
    });
  }

  private async runTurn(text: string): Promise<void> {
    try {
      await this.ensureAgent().prompt(text);
    } catch (error) {
      const message = errorMessage(error);
      this.emit({ type: 'error', message });
      this.pushTrace('error', '运行失败', message);
    } finally {
      this.setBusy(false);
      this.schedulePersist();
      await this.writeChain;
      if (this.running) this.running = null;
    }
  }

  private setBusy(value: boolean): void {
    this.busy = value;
    this.syncKeepAlive();
    this.emit({ type: 'busy', value });
  }

  /** 只有循环真的在干活才保活；停下来等人回答时不占着 Service Worker。 */
  private syncKeepAlive(): void {
    this.keepAlive.setActive(this.busy && this.bridge.pendingCount === 0);
  }

  /** 把挂着的那一轮收尾：卡片记成「未回应」，然后等循环真的停下来。 */
  private async interruptPendingTurn(): Promise<void> {
    this.bridge.dismissAll();
    this.agent?.abort();
    await this.running;
  }

  abort(): void {
    this.bridge.cancelAll();
    this.agent?.abort();
    this.pushTrace('run', '已请求停止');
  }

  private applyRecord(record: SessionRecord): void {
    this.bridge.cancelAll();
    this.agent?.abort();
    this.agent = null;

    const repaired = repairRecord(record);
    this.sessionId = record.id;
    this.sessionCreatedAt = record.createdAt;
    this.title = record.title;
    this.items = repaired.items;
    this.restoredMessages = repaired.messages;
    this.trace = [];
    this.turnCount = 0;
    this.streamingId = null;
    this.setBusy(false);
    // 历史消息的 id 是 u-1 / a-2 这种自增形式，新消息必须接着编号，否则 UI 的 key 会撞车。
    this.seq = resumeSequence(repaired.items);

    if (repaired.interrupted > 0) {
      this.emit({
        type: 'error',
        message: `上次有 ${repaired.interrupted} 步在中断时没跑完，已按取消收尾。`,
      });
    }
  }

  private emitSessionSwitched(): void {
    this.emit({
      type: 'session_switched',
      sessionId: this.sessionId,
      title: this.title,
      items: this.items,
    });
  }

  private async emitSessions(): Promise<void> {
    this.emit({ type: 'sessions', sessions: await listSessions() });
  }

  private toRecord(): SessionRecord {
    const transcript = this.agent
      ? this.agent.state.messages.filter((message) => message.role !== 'system')
      : this.restoredMessages;
    return {
      id: this.sessionId ?? '',
      createdAt: this.sessionCreatedAt,
      updatedAt: Date.now(),
      title: this.title,
      // 只记模型标识，API Key 永远不进 IndexedDB。
      model: this.config
        ? {
            presetId: this.config.presetId,
            baseUrl: this.config.baseUrl,
            modelId: this.config.modelId,
          }
        : null,
      items: structuredClone(
        this.items.filter((item) => !(item.kind === 'assistant' && item.status === 'streaming')),
      ),
      messages: structuredClone(transcript ?? []),
    };
  }

  private schedulePersist(): void {
    if (!this.sessionId) return;
    const record = this.toRecord();
    this.writeChain = this.writeChain
      .then(() => writeSession(record))
      .catch((error: unknown) => {
        console.error('[pagehand] failed to persist session', error);
      });
  }

  private ensureAgent(): Agent {
    if (this.agent) return this.agent;
    if (!this.config) throw new Error('缺少模型配置');

    const config = this.config;
    setImageSupport(config.supportsImages === true);
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
      beforeToolCall: async ({ toolCall, args }, signal) => {
        if (!ALLOWED_TOOL_NAMES.has(toolCall.name)) {
          return { block: true, reason: `工具 ${toolCall.name} 当前未开放。` };
        }
        return evaluateToolGate(
          { toolName: toolCall.name, toolCallId: toolCall.id, args, signal },
          this.bridge,
        );
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

    if (this.restoredMessages) {
      // 系统提示和工具声明由新建的 Agent 现算，历史只回填它们之后的部分。
      const lead = agent.state.messages.filter((message) => message.role === 'system');
      agent.state.messages = [...lead, ...(this.restoredMessages as AgentMessage[])];
      this.restoredMessages = null;
    }

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
        let error = failed ? (message.errorMessage ?? '模型请求失败') : undefined;
        if (failed && this.lastToolWasScreenshot()) {
          error = `${error}\n\n如果当前端点不接受图片，请在设置里关闭「该模型支持图片输入」或换一个支持视觉的模型。`;
        }

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
        this.schedulePersist();
        return;
      }
      case 'tool_execution_start': {
        const id = `t-${++this.seq}`;
        const startedAt = Date.now();
        this.items.push({
          kind: 'tool',
          id,
          toolCallId: event.toolCallId,
          name: event.toolName,
          args: event.args,
          status: 'running',
          summary: '正在执行…',
          startedAt,
        });
        this.pushTrace('tool', `调用 ${event.toolName}`, JSON.stringify(event.args ?? {}));
        this.emit({
          type: 'tool_start',
          id,
          toolCallId: event.toolCallId,
          name: event.toolName,
          args: event.args,
          startedAt,
        });
        return;
      }
      case 'tool_execution_end': {
        const item = this.findTool(event.toolCallId);
        const summary = this.describeToolResult(event.toolName, event.result, event.isError);
        if (item) {
          const durationMs = event.durationMs ?? Date.now() - item.startedAt;
          item.status = event.isError ? 'error' : 'ok';
          item.summary = summary;
          item.details = (event.result as { details?: unknown } | null)?.details;
          item.images = extractToolImages(event.result);
          item.durationMs = durationMs;
          this.emit({
            type: 'tool_end',
            id: item.id,
            name: event.toolName,
            ok: !event.isError,
            summary,
            details: item.details,
            images: item.images,
            durationMs,
          });
        }
        this.pushTrace('tool', `${event.toolName} ${event.isError ? '失败' : '完成'}`, summary);
        this.schedulePersist();
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

  private openInteraction(request: InteractionRequest): string {
    const id = `i-${++this.seq}`;
    const base = {
      kind: 'interaction' as const,
      id,
      toolCallId: request.toolCallId,
      title: request.title,
      status: 'pending' as const,
      startedAt: Date.now(),
    };
    const item: InteractionItem =
      request.kind === 'ask'
        ? { ...base, mode: 'ask', questions: request.questions }
        : { ...base, mode: 'permission', reason: request.reason, grantOrigin: request.grantOrigin };

    this.items.push(item);
    this.pushTrace('run', request.kind === 'ask' ? '等你补充信息' : '等你授权', request.title);
    this.emit({ type: 'interaction_open', item });
    this.syncKeepAlive();
    this.schedulePersist();
    return id;
  }

  private settleInteraction(
    id: string,
    status: InteractionStatus,
    values?: Record<string, string>,
  ): void {
    const item = this.findItem(id);
    if (item?.kind !== 'interaction') return;
    item.status = status;
    if (values) item.answers = values;
    this.emit({ type: 'interaction_settle', id, status, answers: values });
    this.pushTrace('run', INTERACTION_STATUS_LABEL[status], item.title);
    this.syncKeepAlive();
    this.schedulePersist();
  }

  private findItem(id: string): ChatItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  private findTool(toolCallId: string): Extract<ChatItem, { kind: 'tool' }> | undefined {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (item?.kind === 'tool' && item.toolCallId === toolCallId) return item;
    }
    return undefined;
  }

  private lastToolWasScreenshot(): boolean {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (item?.kind === 'tool') {
        return item.name === 'screenshot' && item.status === 'ok';
      }
    }
    return false;
  }

  private describeToolResult(name: string, result: unknown, isError: boolean): string {
    if (isError) {
      return firstContentText(result).slice(0, 200) || `${name} 执行失败`;
    }
    const details = (result as { details?: Record<string, unknown> } | null)?.details;
    if ((name === 'read_page' || name === 'read_tab') && details) {
      const title = typeof details.title === 'string' ? details.title : '当前页面';
      const chars = typeof details.totalChars === 'number' ? details.totalChars : 0;
      const truncated = details.truncated === true;
      const modeLabel = typeof details.modeLabel === 'string' ? details.modeLabel : '';
      const frameId = typeof details.frameId === 'number' ? details.frameId : 0;
      const frameCount = typeof details.frameCount === 'number' ? details.frameCount : 0;
      const parts = [`已读取「${title}」`, `${chars} 字`];
      if (modeLabel) parts.push(modeLabel);
      if (frameId > 0) parts.push(`子框架 ${frameId}`);
      else if (frameCount > 0) parts.push(`发现 ${frameCount} 个子框架`);
      return `${parts.join(' · ')}${truncated ? '（已截断）' : ''}`;
    }
    if (name === 'list_tabs' && details) {
      const count = typeof details.count === 'number' ? details.count : 0;
      return count > 0 ? `找到 ${count} 个标签页` : '没有可读取的网页标签页';
    }
    if (name === 'read_selection' && details) {
      if (details.empty === true) return '没有选中文本';
      const chars = typeof details.chars === 'number' ? details.chars : 0;
      return `已读取选中文本 · ${chars} 字${details.truncated === true ? '（已截断）' : ''}`;
    }
    if (name === 'inspect' && details) {
      if (details.cached === true) return '与上次检查相同，页面没有变化';
      if (details.scope_miss === true) return '没有找到指定的区域';
      const total = typeof details.total === 'number' ? details.total : 0;
      if (total === 0) {
        const scopeTotal = typeof details.scope_total === 'number' ? details.scope_total : 0;
        return scopeTotal > 0 ? '当前筛选没有匹配到元素' : '没有找到可操作元素';
      }
      const parts = [`找到 ${total} 个可操作元素`];
      const hidden = typeof details.hidden_count === 'number' ? details.hidden_count : 0;
      const covered = typeof details.covered_count === 'number' ? details.covered_count : 0;
      if (hidden > 0) parts.push(`${hidden} 个不可见`);
      if (covered > 0) parts.push(`${covered} 个被遮挡`);
      return parts.join(' · ');
    }
    if (name === 'screenshot' && details) {
      const width = typeof details.image_width === 'number' ? details.image_width : 0;
      const height = typeof details.image_height === 'number' ? details.image_height : 0;
      const source = details.source === 'element' ? 'element' : 'viewport';
      const selector = typeof details.selector === 'string' ? details.selector : '';
      return source === 'element' && selector
        ? `已截图元素「${selector}」 · ${width}×${height}`
        : `已截图当前视口 · ${width}×${height}`;
    }
    if (name === 'ask_user' && details) {
      const answers = details.answers as Record<string, unknown> | undefined;
      const count = answers ? Object.keys(answers).length : 0;
      return count > 0 ? `已收到 ${count} 个回答` : '你没回答这个问题';
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
