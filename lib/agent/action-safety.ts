import type { InteractAction, InteractTargetSummary } from '@/lib/page/interact';

export interface HighRiskMatch {
  risky: boolean;
  term: string | null;
}

/** 命中这些词的点击/选择/勾选，每次都要用户确认，即使已授权站点。 */
const HIGH_RISK_TERMS = [
  '支付',
  '付款',
  '购买',
  '下单',
  '提交订单',
  '提交',
  '立即支付',
  '确认支付',
  '转账',
  '汇款',
  '删除',
  '移除',
  '注销',
  '退出登录',
  '退出账号',
  '解绑',
  '发布',
  '发送',
  '授权',
  '永久',
  '清空',
  '重置',
  '解除',
  'pay',
  'payment',
  'purchase',
  'buy now',
  'place order',
  'submit',
  'checkout',
  'transfer',
  'delete',
  'remove',
  'deactivate',
  'publish',
  'send',
  'authorize',
  'reset',
  'clear',
  'unlink',
  'confirm',
] as const;

/** 这些动作会改变页面或业务状态，需要站点授权；scroll / wait_for 不算。 */
export function isMutatingAction(action: InteractAction): boolean {
  return action !== 'scroll' && action !== 'wait_for';
}

/** 只有能表达意图的控件才做高风险判断，避免把页面正文里的词误当成按钮。 */
export function isActionableTarget(target: InteractTargetSummary): boolean {
  return (
    target.role === 'button' ||
    target.role === 'link' ||
    target.role === 'menuitem' ||
    target.role === 'menuitemcheckbox' ||
    target.role === 'menuitemradio' ||
    target.role === 'tab' ||
    target.role === 'option' ||
    target.role === 'combobox' ||
    target.role === 'checkbox' ||
    target.role === 'radio' ||
    target.role === 'switch' ||
    target.tag === 'button' ||
    target.tag === 'a' ||
    target.tag === 'input'
  );
}

/**
 * 高风险判断只看目标自身的 role/label，不把整页文字当上下文。
 * 误判的代价是多一次确认；漏判的代价是不可逆操作，所以宁可保守。
 */
export function highRiskOf(target: InteractTargetSummary | null): HighRiskMatch {
  const labelText = target?.risk_label || target?.label;
  if (!target || !labelText || (!isActionableTarget(target) && !target.risk_label)) {
    return { risky: false, term: null };
  }
  const label = labelText.toLowerCase();
  for (const term of HIGH_RISK_TERMS) {
    if (label.includes(term)) return { risky: true, term };
  }
  return { risky: false, term: null };
}

/** 搜索框回车是低风险操作；其他输入框/编辑器回车可能提交或发送，需要确认。 */
export function isSearchTarget(target: InteractTargetSummary | null): boolean {
  if (!target) return false;
  if (target.role === 'searchbox') return true;
  if (target.name && /search/i.test(target.name)) return true;
  if (target.label && /(搜索|search)/i.test(target.label)) return true;
  return false;
}

export interface ConfirmationDecision {
  required: boolean;
  detail: string;
}

/** 高风险确认策略：只在这里判断，工具层不再重复拼规则。 */
export function confirmationFor(
  action: InteractAction,
  target: InteractTargetSummary | null,
  input: { key?: string; option?: string } = {},
): ConfirmationDecision {
  if (action === 'press') {
    if (input.key !== 'Enter') return { required: false, detail: '' };
    if (isSearchTarget(target)) return { required: false, detail: '' };
    return { required: true, detail: '回车可能提交表单或发送消息' };
  }
  if (action === 'click') {
    const risk = highRiskOf(target);
    if (risk.risky) return { required: true, detail: `命中「${risk.term}」` };
    if ((target?.submits_form || target?.risk_submits_form) && !isSearchTarget(target)) {
      return { required: true, detail: '点击会提交表单' };
    }
    return { required: false, detail: '' };
  }
  if (action === 'select') {
    const option = input.option;
    const risk = highRiskOf(
      target && option ? { ...target, label: option, risk_label: option } : target,
    );
    return risk.risky
      ? { required: true, detail: `命中「${risk.term}」` }
      : { required: false, detail: '' };
  }
  if (action === 'check' || action === 'uncheck') {
    const risk = highRiskOf(target);
    return risk.risky
      ? { required: true, detail: `命中「${risk.term}」` }
      : { required: false, detail: '' };
  }
  return { required: false, detail: '' };
}
