import type {
  InspectElement,
  InspectHiddenReason,
  InspectRoleCount,
  InspectSnapshot,
  InspectState,
} from '@/lib/page/inspect';

export const HIDDEN_REASON_LABEL: Record<InspectHiddenReason, string> = {
  display_none: '被 display:none 隐藏',
  visibility_hidden: '被 visibility:hidden 隐藏',
  opacity_zero: '透明度为 0',
  near_transparent: '接近透明（可能正在动画中）',
  zero_size: '尺寸为 0',
  ancestor_hidden: '被祖先元素隐藏',
};

export type InspectErrorCode = 'no_tab' | 'unsupported_scheme' | 'inject_failed' | 'unknown';

export interface InspectElementSummary {
  ref: string;
  role: string | null;
  label: string | null;
  visible: boolean;
  covered: boolean;
}

export type InspectDetails =
  | {
      title: string;
      url: string;
      scope_total: number;
      total: number;
      returned: number;
      hidden_count: number;
      covered_count: number;
      truncated: boolean;
      selector: string | null;
      text_filter: string | null;
      frame_id: number;
      scope_miss: boolean;
      role_counts: InspectRoleCount[];
      cached: boolean;
      elements: InspectElementSummary[];
    }
  | { error: string; code: InspectErrorCode };

function stateText(state: InspectState | null): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.checked === true) parts.push('已勾选');
  if (state.selected === true) parts.push('已选中');
  if (state.disabled) parts.push('已禁用');
  if (state.readonly) parts.push('只读');
  if (state.expanded) parts.push('已展开');
  if (state.pressed) parts.push('已按下');
  if (state.focused) parts.push('当前焦点');
  return parts.join('、');
}

function elementLine(element: InspectElement): string {
  const name = element.role ?? element.tag;
  let line = `[${element.ref}] ${name}`;

  if (element.label && element.label_source !== 'placeholder') {
    line += `「${element.label}」`;
  }
  if (element.placeholder) line += ` · placeholder「${element.placeholder}」`;

  if (element.visible) {
    line += ' · 可见';
    if (!element.in_viewport) line += '（不在当前视口）';
  } else {
    const reason = element.hidden_reason ? HIDDEN_REASON_LABEL[element.hidden_reason] : '不可见';
    line += ` · 不可见（${reason}）`;
  }

  if (
    element.input_type &&
    element.input_type !== 'text' &&
    element.role !== 'checkbox' &&
    element.role !== 'radio' &&
    element.role !== 'slider'
  ) {
    line += ` · 类型：${element.input_type}`;
  }
  if (element.name) line += ` · name=${element.name}`;
  if (element.autocomplete) line += ` · autocomplete=${element.autocomplete}`;
  if (element.value !== null) line += ` · 当前值：${element.value}`;

  const state = stateText(element.state);
  if (state) line += ` · ${state}`;

  if (element.covered) {
    line += ` · 被遮挡${element.covered_by ? `（覆盖它的是 ${element.covered_by}）` : ''}`;
  }
  if (element.pointer_events_none) line += ' · 鼠标穿透';

  return line;
}

function scopeText(snapshot: InspectSnapshot): string {
  const parts: string[] = [];
  if (snapshot.scope.selector) parts.push(`选择器「${snapshot.scope.selector}」`);
  if (snapshot.scope.text) parts.push(`名称或文字包含「${snapshot.scope.text}」`);
  if (parts.length === 0) parts.push('整页');
  if (snapshot.scope.frame_id > 0) parts.push(`子框架 ${snapshot.scope.frame_id}`);
  return parts.join(' · ');
}

function emptyHint(snapshot: InspectSnapshot): string {
  if (snapshot.scope_error) {
    return `选择器语法无效（${snapshot.scope_error}）。请检查括号和引号后重试，或省略 selector 检查整页。`;
  }
  if (snapshot.scope_miss) {
    return `页面里找不到选择器「${snapshot.scope.selector ?? ''}」。请确认选择器，或省略 selector 检查整页。`;
  }
  if (snapshot.scope_total > 0) {
    return `这个范围里共有 ${snapshot.scope_total} 个可操作元素，但没有符合当前筛选条件的。可以去掉 role / kind / input_type，或换 text / selector 再试。`;
  }
  return '这个范围里没有可操作元素。页面可能还没加载完、内容在子框架里，或者这块区域确实没有按钮、链接和输入框。';
}

export function formatInspectForModel(snapshot: InspectSnapshot): string {
  const header = [
    `页面：${snapshot.title || '（无标题）'}`,
    `地址：${snapshot.url}`,
    `检查范围：${scopeText(snapshot)}`,
  ];

  if (snapshot.scope_error || snapshot.scope_miss || snapshot.total === 0) {
    return [...header, '', emptyHint(snapshot)].join('\n');
  }

  const scopePart =
    snapshot.scope_total > snapshot.total ? `（该范围共 ${snapshot.scope_total} 个）` : '';
  const counts = [`匹配到 ${snapshot.total} 个可操作元素${scopePart}`];
  if (snapshot.returned < snapshot.total) counts.push(`返回 ${snapshot.returned} 个`);
  if (snapshot.hidden_count > 0) counts.push(`${snapshot.hidden_count} 个不可见`);
  if (snapshot.covered_count > 0) counts.push(`${snapshot.covered_count} 个被遮挡`);

  const lines = [...header, counts.join(' · ')];
  if (snapshot.role_counts.length > 0) {
    const roleLine = snapshot.role_counts
      .map(
        (count) =>
          `${count.role} ${count.total}${count.visible < count.total ? `（可见 ${count.visible}）` : ''}`,
      )
      .join(' · ');
    lines.push(`按类型：${roleLine}`);
  }
  lines.push('');

  for (const element of snapshot.elements) lines.push(elementLine(element));

  if (snapshot.truncated) {
    lines.push(
      '',
      '结果已截断：本次只返回前一部分。用 role / kind / input_type / text / selector 缩小范围，或调大 limit 后重试。',
    );
  }

  lines.push(
    '',
    '说明：编号只在当前页面状态有效，页面跳转或内容变化后要重新 inspect。出于安全考虑，密码框不会出现在结果里。当前版本只能查看，不能点击或填写。',
  );
  return lines.join('\n');
}

export function toInspectDetails(snapshot: InspectSnapshot, cached = false): InspectDetails {
  return {
    title: snapshot.title,
    url: snapshot.url,
    scope_total: snapshot.scope_total,
    total: snapshot.total,
    returned: snapshot.returned,
    hidden_count: snapshot.hidden_count,
    covered_count: snapshot.covered_count,
    truncated: snapshot.truncated,
    selector: snapshot.scope.selector,
    text_filter: snapshot.scope.text,
    frame_id: snapshot.scope.frame_id,
    scope_miss: snapshot.scope_miss,
    role_counts: snapshot.role_counts,
    cached,
    elements: snapshot.elements.slice(0, 20).map((element) => ({
      ref: element.ref,
      role: element.role,
      label: element.label,
      visible: element.visible,
      covered: element.covered,
    })),
  };
}

export function summarizeInspect(snapshot: InspectSnapshot): string {
  if (snapshot.scope_error) return '选择器语法无效';
  if (snapshot.scope_miss) return '没有找到指定的区域';
  if (snapshot.total === 0) return '没有找到可操作元素';
  const parts = [`找到 ${snapshot.total} 个可操作元素`];
  if (snapshot.returned < snapshot.total) parts.push(`返回 ${snapshot.returned} 个`);
  if (snapshot.hidden_count > 0) parts.push(`${snapshot.hidden_count} 个不可见`);
  if (snapshot.covered_count > 0) parts.push(`${snapshot.covered_count} 个被遮挡`);
  return parts.join(' · ');
}
