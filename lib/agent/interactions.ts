/**
 * 交互桥：Agent 循环里需要「等人」的时候（提问、授权）在这里挂起，
 * 用户在侧边栏点完再回填。卡片本身是一条会话消息，所以刷新后还能看见结局。
 */

export type InteractionStatus = 'answered' | 'denied' | 'dismissed' | 'cancelled';

export interface AskOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface AskQuestion {
  id: string;
  question: string;
  message?: string;
  options?: AskOption[];
  multiple?: boolean;
}

export type InteractionRequest =
  | { kind: 'ask'; toolCallId: string; title: string; questions: AskQuestion[] }
  | {
      kind: 'permission';
      toolCallId: string;
      title: string;
      reason: string;
      /** 有值才允许「始终允许」，按站点 + 工具记授权。 */
      grantOrigin: string | null;
    };

export interface InteractionAnswer {
  status: InteractionStatus;
  /** 授权卡片里用户点了「始终允许」。 */
  always?: boolean;
  /** 提问卡片的答案：问题 id → 用户选的或输入的文本。 */
  values?: Record<string, string>;
}

export interface InteractionHost {
  /** 卡片入历史，返回它的 UI id。 */
  open(request: InteractionRequest): string;
  /** 卡片有结局后回写；不会重复触发。 */
  settle(id: string, status: InteractionStatus, values?: Record<string, string>): void;
}

export class InteractionBridge {
  private readonly pending = new Map<string, { finish(answer: InteractionAnswer): void }>();

  constructor(private readonly host: InteractionHost) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  request(request: InteractionRequest, signal?: AbortSignal): Promise<InteractionAnswer> {
    return new Promise<InteractionAnswer>((resolve) => {
      let cardId = '';
      const finish = (answer: InteractionAnswer) => {
        if (!this.pending.delete(request.toolCallId)) return;
        this.host.settle(cardId, answer.status, answer.values);
        resolve(answer);
      };

      // 先登记再开卡片：host.open 会按 pendingCount 判断这一轮是不是停下来等人了。
      this.pending.set(request.toolCallId, { finish });
      cardId = this.host.open(request);

      if (!signal) return;
      if (signal.aborted) {
        finish({ status: 'cancelled' });
        return;
      }
      signal.addEventListener('abort', () => finish({ status: 'cancelled' }), { once: true });
    });
  }

  respond(toolCallId: string, answer: InteractionAnswer): boolean {
    const pending = this.pending.get(toolCallId);
    if (!pending) return false;
    pending.finish(answer);
    return true;
  }

  /** 用户没理卡片直接发了新消息：隐式未授权 / 未回答。 */
  dismissAll(): void {
    for (const [, pending] of [...this.pending]) pending.finish({ status: 'dismissed' });
  }

  /** 点停止、切会话、开新会话：卡片作废。 */
  cancelAll(): void {
    for (const [, pending] of [...this.pending]) pending.finish({ status: 'cancelled' });
  }
}
