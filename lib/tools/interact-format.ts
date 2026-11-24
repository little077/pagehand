import type {
  InteractAction,
  InteractErrorCode,
  InteractPageResult,
  InteractTargetState,
  InteractTargetSummary,
  InteractWaitState,
} from '@/lib/page/interact';

export type InteractToolErrorCode =
  | InteractErrorCode
  | 'no_tab'
  | 'unsupported_page'
  | 'inject_failed'
  | 'page_busy'
  | 'blocked_policy'
  | 'aborted'
  | 'navigation_timeout'
  | 'permission_target_missing';

export type InteractNavigation = 'none' | 'started' | 'completed' | 'timeout' | 'closed';

export interface InteractNewTab {
  id: number;
  url: string;
  title: string;
}

export interface InteractOutcome {
  page: InteractPageResult;
  frame_id: number;
  navigation: InteractNavigation;
  new_tab: InteractNewTab | null;
}

export type InteractDetails =
  | {
      action: InteractAction;
      target: InteractTargetSummary | null;
      changed: boolean;
      already: boolean;
      url_before: string;
      url_after: string;
      title_after: string;
      frame_id: number;
      navigation: InteractNavigation;
      new_tab: InteractNewTab | null;
      warnings: string[];
      duration_ms: number;
      state: InteractTargetState | null;
      mutated: number;
      by_coords: boolean;
      /** scroll 才有：滚到最底/最顶时带上进度，模型据此判断是否继续。 */
      to?: 'bottom' | 'top';
      at_bottom?: boolean;
      rounds?: number;
      scroll_top?: number;
      scroll_height?: number;
      client_height?: number;
      distance_bottom?: number;
      /** 滚到底的结论：到底 / 加载停滞 / 没进展 / 预算用尽。 */
      outcome?: 'reached_end' | 'stalled' | 'budget_exhausted' | 'no_progress';
      loading?: boolean;
      loading_label?: string | null;
      end_marker?: string | null;
      last_text?: string | null;
      no_growth_ms?: number;
      container?: string | null;
      container_selector?: string | null;
      container_from?: string;
    }
  | { error: string; code: InteractToolErrorCode };

export const ACTION_LABEL: Record<InteractAction, string> = {
  click: '点击',
  fill: '填写',
  type: '输入',
  press: '按键',
  select: '选择',
  check: '勾选',
  uncheck: '取消勾选',
  hover: '悬停',
  scroll: '滚动',
  wait_for: '等待',
};

export const WAIT_STATE_LABEL: Record<InteractWaitState, string> = {
  visible: '元素出现',
  hidden: '元素消失',
  text: '文字出现',
  value: '值相等',
  url: 'URL 变化',
};

const NEXT_STEP: Partial<Record<InteractToolErrorCode, string>> = {
  no_tab: '先打开一个网页再试。',
  unsupported_page: '切到 http/https 网页；浏览器内部页和扩展商店不能操作。',
  inject_failed: '让用户点开这个标签页，等页面加载完再试。',
  page_busy: '页面可能弹出了浏览器对话框或正在执行长任务，请用户手动处理后重试。',
  ref_missing: '先 inspect 获取 ref；如果元素在子框架里，带上对应的 frame_id。',
  ref_stale: '页面已经变化，重新 inspect 获取新的 ref。',
  selector_invalid: '检查选择器语法，或改用 inspect 返回的 ref。',
  not_found: '用 inspect 重新定位目标。',
  ambiguous: '选择器匹配到多个元素，改用 inspect 返回的 ref。',
  not_visible: '先展开、滚动或等页面渲染完成。',
  not_stable: '页面还在动画或布局变化中，稍后再试。',
  covered: '先关闭弹窗、遮罩或 Cookie 提示，再操作目标。',
  disabled: '目标当前不可用，不要绕过；告诉用户原因。',
  inert: '目标在 inert 区域里，先让页面解除禁用。',
  pointer_events_none: '目标鼠标穿透，换一个实际可点击的元素。',
  not_editable: '换一个可编辑的输入框或文本域。',
  unsupported_input: '这类字段必须由用户手动完成，不要代填或绕过。',
  unsupported_control: '换一个动作：日期用 fill，原生下拉用 select，多选/原生控件请用户手动完成。',
  not_select: '这是自定义下拉：先 click 展开，再 click 选项。',
  option_not_found: '从返回的可选列表里选一个存在的选项。',
  not_checkable: '目标不是复选框/单选框/开关，换目标。',
  state_unchanged: 'inspect 确认页面是否响应；不要连续重复点击。',
  value_mismatch: '页面改写了输入值，检查格式、掩码或长度限制。',
  value_not_set: '页面没有接受输入，换一种输入方式或告诉用户站点限制。',
  timeout: '条件没有在等待时间内满足；可以稍后重试，或先 inspect 看页面状态。',
  cancelled: '等待已取消，不要继续等待。',
  blocked_policy: '这是安全限制，不要尝试绕过；请用户手动完成。',
  aborted: '用户已停止，不要再继续操作。',
  navigation_timeout: '动作已发出，但页面还没加载完；稍后 inspect 确认。',
  permission_target_missing: '这次调用没有绑定已授权页面，请重新发起任务。',
  permission_target_mismatch: '授权后的网站或目标元素已变化，请重新检查并确认。',
  unsupported_action: '检查参数；输入文字用 fill/type，提交表单用 click。',
  unknown: '重新 inspect 后再试；如果仍然失败，把错误告诉用户。',
};

const ROLE_LABEL: Record<string, string> = {
  button: '按钮',
  link: '链接',
  textbox: '输入框',
  searchbox: '搜索框',
  combobox: '下拉框',
  checkbox: '复选框',
  radio: '单选框',
  switch: '开关',
  tab: '标签页',
  option: '选项',
  menuitem: '菜单项',
};

function targetText(target: InteractTargetSummary | null): string {
  if (!target) return '目标元素';
  const labelText = target.label || target.risk_label;
  const label = labelText ? `「${labelText}」` : '';
  const role = target.role ? (ROLE_LABEL[target.role] ?? target.role) : target.tag;
  return `${role}${label}`;
}

function numberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summaryOf(outcome: InteractOutcome): string {
  const { page } = outcome;
  if (page.details.already === true) return page.message;
  const target = targetText(page.target);
  const actionLabel = ACTION_LABEL[page.action];

  switch (page.action) {
    case 'fill':
      return `已填写${target}${page.state?.value ? `：${page.state.value}` : ''}`;
    case 'type':
      return `已输入${target}`;
    case 'press':
      return `已在${target}上按键`;
    case 'select':
      return `已选择${target}`;
    case 'check':
      return `已勾选${target}`;
    case 'uncheck':
      return `已取消勾选${target}`;
    case 'hover':
      return `已悬停${target}`;
    case 'scroll': {
      const rounds = numberDetail(page.details, 'rounds') ?? 1;
      if (page.details.to === 'bottom') {
        const outcome = page.details.outcome;
        if (outcome === 'stalled') return '已到当前加载末尾，但页面仍在加载';
        if (outcome === 'no_progress') return '滚动没有引起内容变化';
        if (outcome === 'reached_end') return rounds > 1 ? `已滚到底（${rounds} 轮）` : '已滚到底';
        return `滚动了 ${rounds} 轮，还没确认到底`;
      }
      if (page.details.to === 'top') return page.changed ? '已回到顶部' : '已经在顶部';
      return page.changed
        ? page.target
          ? `已滚动${target}`
          : '已滚动页面'
        : '页面已经到边界，没有继续滚动';
    }
    case 'wait_for':
      return '等待条件已满足';
    default:
      return `已${actionLabel}${target}`;
  }
}

function navigationText(outcome: InteractOutcome): string {
  if (outcome.new_tab) {
    return ` · 打开了新标签页：${outcome.new_tab.title || outcome.new_tab.url || `#${outcome.new_tab.id}`}`;
  }
  if (outcome.navigation === 'completed') {
    return ` · 页面已跳转：${outcome.page.title_after || outcome.page.url_after}`;
  }
  if (outcome.navigation === 'started' || outcome.navigation === 'timeout') {
    return ' · 页面开始跳转，可能还在加载';
  }
  if (outcome.navigation === 'closed') return ' · 页面已关闭';
  return '';
}

export function formatInteractForModel(outcome: InteractOutcome): string {
  const { page } = outcome;
  if (!page.ok) {
    const next = page.code ? NEXT_STEP[page.code] : undefined;
    return `${page.message}${next ? `\n下一步：${next}` : ''}`;
  }

  const lines = [summaryOf(outcome) + navigationText(outcome)];
  if (
    !page.changed &&
    page.action !== 'wait_for' &&
    page.action !== 'scroll' &&
    page.details.already !== true &&
    !outcome.new_tab &&
    outcome.navigation === 'none'
  ) {
    lines.push('页面在 1.2 秒内没有可见变化。先 inspect 确认；不要直接重复点击。');
  }
  if (outcome.navigation === 'timeout') {
    lines.push('页面跳转等待超时；动作已经发出，稍后 inspect 确认结果。');
  }
  if (outcome.navigation === 'completed' || outcome.new_tab) {
    lines.push('之前的 ref 可能已经失效，继续操作前重新 inspect。');
  }
  if (page.action === 'scroll' && page.details.to === 'bottom') {
    const outcome = page.details.outcome;
    if (outcome === 'stalled') {
      const label =
        typeof page.details.loading_label === 'string' && page.details.loading_label
          ? page.details.loading_label
          : '加载中';
      const seconds = Math.max(
        1,
        Math.round((numberDetail(page.details, 'no_growth_ms') ?? 6000) / 1000),
      );
      lines.push(
        `页面仍在显示「${label}」，连续约 ${seconds} 秒没有新内容（可能是网络慢或站点限流）。不要重复滚动；等待或刷新后再试。`,
      );
    } else if (outcome === 'reached_end') {
      const endMarker =
        typeof page.details.end_marker === 'string' && page.details.end_marker
          ? `（末尾是「${page.details.end_marker}」）`
          : '';
      lines.push(`已经到内容最底部${endMarker}，不需要继续往下滚。`);
    } else if (outcome === 'no_progress') {
      lines.push(
        '滚动没有引起内容变化，可能这个元素不在真正的滚动区域里；先 inspect 确认，或换一个元素作为落点。',
      );
    } else {
      lines.push(
        '还没确认到底，可能仍在加载；可以再调用一次 scroll（to=bottom）继续，或停止等待。',
      );
    }
  }
  for (const warning of page.warnings) lines.push(`提示：${warning}`);
  return lines.join('\n');
}

export function toInteractDetails(outcome: InteractOutcome): InteractDetails {
  const { page } = outcome;
  if (!page.ok) {
    return { error: page.message, code: page.code ?? 'unknown' };
  }
  const scroll =
    page.action === 'scroll'
      ? {
          ...(page.details.to === 'bottom' || page.details.to === 'top'
            ? { to: page.details.to as 'bottom' | 'top' }
            : {}),
          ...(typeof page.details.at_bottom === 'boolean'
            ? { at_bottom: page.details.at_bottom }
            : {}),
          ...(typeof page.details.rounds === 'number' ? { rounds: page.details.rounds } : {}),
          ...(typeof page.details.scroll_top === 'number'
            ? { scroll_top: page.details.scroll_top }
            : {}),
          ...(typeof page.details.scroll_height === 'number'
            ? { scroll_height: page.details.scroll_height }
            : {}),
          ...(typeof page.details.client_height === 'number'
            ? { client_height: page.details.client_height }
            : {}),
          ...(typeof page.details.distance_bottom === 'number'
            ? { distance_bottom: page.details.distance_bottom }
            : {}),
          ...(typeof page.details.outcome === 'string'
            ? {
                outcome: page.details.outcome as
                  | 'reached_end'
                  | 'stalled'
                  | 'budget_exhausted'
                  | 'no_progress',
              }
            : {}),
          ...(typeof page.details.loading === 'boolean' ? { loading: page.details.loading } : {}),
          ...(typeof page.details.loading_label === 'string' || page.details.loading_label === null
            ? { loading_label: page.details.loading_label }
            : {}),
          ...(typeof page.details.end_marker === 'string' || page.details.end_marker === null
            ? { end_marker: page.details.end_marker }
            : {}),
          ...(typeof page.details.last_text === 'string' || page.details.last_text === null
            ? { last_text: page.details.last_text }
            : {}),
          ...(typeof page.details.no_growth_ms === 'number'
            ? { no_growth_ms: page.details.no_growth_ms }
            : {}),
          ...(typeof page.details.container === 'string'
            ? { container: page.details.container }
            : {}),
          ...(typeof page.details.container_selector === 'string' ||
          page.details.container_selector === null
            ? { container_selector: page.details.container_selector }
            : {}),
          ...(typeof page.details.container_from === 'string'
            ? { container_from: page.details.container_from }
            : {}),
        }
      : {};
  return {
    action: page.action,
    target: page.target,
    changed: page.changed,
    already: page.details.already === true,
    url_before: page.url_before,
    url_after: page.url_after,
    title_after: page.title_after,
    frame_id: outcome.frame_id,
    navigation: outcome.navigation,
    new_tab: outcome.new_tab,
    warnings: page.warnings,
    duration_ms: page.duration_ms,
    state: page.state,
    mutated: page.mutated,
    by_coords: page.by_coords,
    ...scroll,
  };
}
