import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type { AskQuestion, InteractionStatus } from '@/lib/agent/interactions';
import { requireInteractionBridge } from './bridge';

const AskOption = Type.Object({
  label: Type.String({ description: '选项文字，用户点它就填这个。' }),
  description: Type.Optional(
    Type.String({ description: '选项的补充说明，显示在选项旁边或提示里。' }),
  ),
  recommended: Type.Optional(Type.Boolean({ description: '是否是推荐项。' })),
});

const AskQuestionSchema = Type.Object({
  id: Type.String({
    description: '答案的机器键，不展示给用户，同一次调用内必须唯一。',
  }),
  question: Type.String({
    description: '展示给用户的问题，纯文本，换行用 \\n。',
  }),
  message: Type.Optional(Type.String({ description: '问题下面的补充说明，纯文本。' })),
  options: Type.Optional(
    Type.Array(AskOption, {
      minItems: 1,
      maxItems: 4,
      description: '预设选项。省略时用户只能自由输入。',
    }),
  ),
  multiple: Type.Optional(
    Type.Boolean({ description: '是否允许多选，默认 false。有选项时才生效。' }),
  ),
});

const parameters = Type.Object({
  title: Type.Optional(Type.String({ description: '卡片顶部标题，省略时用「需要你补充信息」。' })),
  questions: Type.Array(AskQuestionSchema, {
    minItems: 1,
    maxItems: 3,
    description: '一次最多 3 个问题，只问真正需要用户决定的。',
  }),
});

type AskUserDetails = { answers: Record<string, string> } | { status: InteractionStatus };

const UNANSWERED_TEXT: Record<Exclude<InteractionStatus, 'answered'>, string> = {
  denied: '用户拒绝回答这个问题。',
  dismissed: '用户没有回答这个问题，直接发了新消息。',
  cancelled: '用户停止了这一轮或切换了会话，问题没有回答。',
};

export const askUserTool: AgentTool<typeof parameters, AskUserDetails> = {
  name: 'ask_user',
  label: '向你提问',
  description:
    '缺少只有用户能决定的信息时调用，例如要处理哪几个标签页、按哪个口径筛选、做到哪一步为止。一次最多 3 个问题，可以给选项也可以让用户自由输入。不要用它的场景：写操作前的确认（那由权限门禁负责）、能从当前页面读出来的信息、以及用户已经说清楚的细节。',
  parameters,
  replay: 'never',
  async execute(toolCallId, params, signal) {
    const bridge = requireInteractionBridge();
    const questions = params.questions as AskQuestion[];

    const answer = await bridge.request(
      {
        kind: 'ask',
        toolCallId,
        title: params.title?.trim() || '需要你补充信息',
        questions,
      },
      signal,
    );

    if (answer.status !== 'answered' || !answer.values) {
      const status = answer.status === 'answered' ? 'cancelled' : answer.status;
      return {
        isError: true,
        content: [{ type: 'text', text: UNANSWERED_TEXT[status] }],
        details: { status },
      };
    }

    const lines = questions.map((question) => {
      const value = answer.values?.[question.id];
      return `${question.question}：${value?.trim() || '（未回答）'}`;
    });

    return {
      content: [{ type: 'text', text: ['用户的回答：', ...lines].join('\n') }],
      details: { answers: answer.values },
    };
  },
};
