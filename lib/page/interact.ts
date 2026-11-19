export type InteractAction =
  | 'click'
  | 'fill'
  | 'type'
  | 'press'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'scroll'
  | 'wait_for';

export type InteractPhase = 'probe' | 'act';

export type InteractWaitState = 'visible' | 'hidden' | 'text' | 'value' | 'url';

export type InteractErrorCode =
  | 'no_target'
  | 'ref_missing'
  | 'ref_stale'
  | 'selector_invalid'
  | 'not_found'
  | 'ambiguous'
  | 'not_visible'
  | 'not_stable'
  | 'covered'
  | 'disabled'
  | 'inert'
  | 'pointer_events_none'
  | 'not_editable'
  | 'unsupported_input'
  | 'unsupported_control'
  | 'not_select'
  | 'option_not_found'
  | 'not_checkable'
  | 'state_unchanged'
  | 'value_mismatch'
  | 'value_not_set'
  | 'timeout'
  | 'cancelled'
  | 'unsupported_action'
  | 'unknown';

export interface InteractTargetSummary {
  ref: string | null;
  tag: string;
  role: string | null;
  label: string | null;
  selector: string | null;
  name?: string | null;
  /** 坐标点到按钮内部 span 时，用最近的可操作祖先标签做风险判断。 */
  risk_label?: string | null;
  /** 点击这个控件会提交表单；搜索框回车/搜索按钮除外。 */
  submits_form?: boolean;
  /** 坐标点到按钮内部时，最近的可操作祖先是否会提交表单。 */
  risk_submits_form?: boolean;
}

export interface InteractTargetState {
  value?: string;
  checked?: boolean;
  selected_index?: number;
  focused?: boolean;
}

export interface InteractPageParams {
  phase: InteractPhase;
  action: InteractAction;
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  modifiers?: string[];
  option?: string;
  deltaX?: number;
  deltaY?: number;
  state?: InteractWaitState;
  value?: string;
  timeout?: number;
  frameId?: number;
}

export interface InteractPageResult {
  ok: boolean;
  code: InteractErrorCode | null;
  message: string;
  action: InteractAction;
  phase: InteractPhase;
  target: InteractTargetSummary | null;
  state: InteractTargetState | null;
  changed: boolean;
  url_before: string;
  url_after: string;
  title_after: string;
  frame_url: string;
  mutated: number;
  by_coords: boolean;
  duration_ms: number;
  warnings: string[];
  details: Record<string, unknown>;
}

interface RefMeta {
  ref: string;
  selector: string;
  tag: string;
  role: string | null;
  label: string | null;
}

interface RefStore {
  seq: number;
  byElement: WeakMap<Element, string>;
  byRef: Map<string, WeakRef<Element>>;
  meta: Map<string, RefMeta>;
  cancelled?: boolean;
}

interface ResolvedTarget {
  el: Element;
  point: { x: number; y: number } | null;
  byCoords: boolean;
  summary: InteractTargetSummary;
}

/**
 * 注入到页面里执行。函数会被序列化，不能引用模块级变量。
 * probe 只定位和检查，act 才真正操作；两阶段是给高风险确认留出插话点。
 */
export async function runInteraction(params: InteractPageParams): Promise<InteractPageResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const urlBefore = location.href;
  const frameUrl = safeFrameUrl();
  const action = params.action;
  const phase = params.phase;
  const refStoreKey = '__pagehandRefStoreV1';
  const refStoreMax = 4000;
  const holder = globalThis as unknown as Record<string, unknown>;
  let store = holder[refStoreKey] as RefStore | undefined;
  if (!store) {
    store = {
      seq: 0,
      byElement: new WeakMap<Element, string>(),
      byRef: new Map<string, WeakRef<Element>>(),
      meta: new Map<string, RefMeta>(),
    };
    holder[refStoreKey] = store;
  }
  const activeStore = store;

  if (activeStore.byRef.size > refStoreMax) {
    for (const [ref, weak] of [...activeStore.byRef]) {
      if (!weak.deref()) {
        activeStore.byRef.delete(ref);
        activeStore.meta.delete(ref);
      }
    }
  }

  class PageFailure extends Error {
    constructor(
      readonly code: InteractErrorCode,
      message: string,
    ) {
      super(message);
    }
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });

  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const cut = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

  function safeFrameUrl(): string {
    try {
      return location.href;
    } catch {
      return '';
    }
  }

  function result(overrides: Partial<InteractPageResult> = {}): InteractPageResult {
    return {
      ok: true,
      code: null,
      message: '',
      action,
      phase,
      target: null,
      state: null,
      changed: false,
      url_before: urlBefore,
      url_after: location.href,
      title_after: document.title,
      frame_url: frameUrl,
      mutated: 0,
      by_coords: false,
      duration_ms: Date.now() - startedAt,
      warnings: [...warnings],
      details: {},
      ...overrides,
    };
  }

  function fail(
    code: InteractErrorCode,
    message: string,
    target: InteractTargetSummary | null = null,
  ): InteractPageResult {
    return result({ ok: false, code, message, target });
  }

  function escapeId(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function selectorFor(el: Element): string {
    const path: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const html = node as HTMLElement;
      if (html.id) {
        path.unshift(`#${escapeId(html.id)}`);
        return path.join(' > ');
      }
      const current: Element = node;
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        path.unshift(tag);
        break;
      }
      const sameTag = Array.from(parent.children).filter(
        (child: Element) => child.tagName === current.tagName,
      );
      path.unshift(
        sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag,
      );
      node = parent;
    }
    if (node === document.body) path.unshift('body');
    else if (node === document.documentElement) path.unshift('html');
    return path.join(' > ');
  }

  function roleFor(el: Element): string | null {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    if (isContentEditable(el)) return 'textbox';
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    return null;
  }

  function labelFor(el: Element): string | null {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (parts.length > 0) return cut(normalize(parts.join(' ')), 80);
    }
    const ariaLabel = el.getAttribute('aria-label')?.trim();
    if (ariaLabel) return cut(normalize(ariaLabel), 80);
    if (
      el instanceof HTMLInputElement &&
      (el.type === 'submit' || el.type === 'button' || el.type === 'reset') &&
      el.value
    ) {
      return cut(normalize(el.value), 80);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.id) {
        const label = document.querySelector(`label[for="${escapeId(el.id)}"]`);
        if (label?.textContent?.trim()) return cut(normalize(label.textContent), 80);
      }
      const wrap = el.closest('label');
      if (wrap?.textContent?.trim()) return cut(normalize(wrap.textContent), 80);
      if (el.placeholder?.trim()) return cut(normalize(el.placeholder), 80);
    }
    const alt = el.getAttribute('alt')?.trim();
    if (alt) return cut(normalize(alt), 80);
    const title = el.getAttribute('title')?.trim();
    if (title) return cut(normalize(title), 80);
    const role = roleFor(el);
    if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') {
      const text = normalize(el.textContent ?? '');
      if (text) return cut(text, 80);
    }
    return null;
  }

  function describe(el: Element | null): string {
    if (!el) return '未知元素';
    const role = roleFor(el);
    const label = labelFor(el);
    if (role && label) return cut(`${role}「${label}」`, 60);
    if (label) return cut(label, 60);
    if (role) return cut(role, 60);
    if ((el as HTMLElement).id) return cut(`${el.tagName.toLowerCase()}#${el.id}`, 60);
    return cut(el.tagName.toLowerCase(), 60);
  }

  function refFor(el: Element): string {
    const existing = activeStore.byElement.get(el);
    if (existing && activeStore.byRef.get(existing)?.deref() === el) return existing;
    const ref = `e${++activeStore.seq}`;
    activeStore.byElement.set(el, ref);
    activeStore.byRef.set(ref, new WeakRef(el));
    return ref;
  }

  function actionableElement(el: Element): boolean {
    const role = roleFor(el);
    const tag = el.tagName.toLowerCase();
    return (
      role === 'button' ||
      role === 'link' ||
      role === 'menuitem' ||
      role === 'tab' ||
      role === 'option' ||
      role === 'checkbox' ||
      role === 'radio' ||
      role === 'switch' ||
      tag === 'button' ||
      tag === 'a' ||
      tag === 'input' ||
      tag === 'select'
    );
  }

  function isSubmitControl(el: Element): boolean {
    if (el instanceof HTMLButtonElement) return el.type === 'submit' && el.form !== null;
    if (el instanceof HTMLInputElement) {
      return (el.type === 'submit' || el.type === 'image') && el.form !== null;
    }
    return false;
  }

  function summaryFor(el: Element): InteractTargetSummary {
    const ref = refFor(el);
    const selector = selectorFor(el);
    const tag = el.tagName.toLowerCase();
    const role = roleFor(el);
    const label = labelFor(el);
    const name = el.getAttribute('name')?.trim() || null;
    let riskEl: Element | null = el;
    let depth = 0;
    while (riskEl && depth < 6 && !actionableElement(riskEl)) {
      riskEl = riskEl.parentElement;
      depth += 1;
    }
    const riskLabel = riskEl ? labelFor(riskEl) : null;
    const submitsForm = isSubmitControl(el);
    const riskSubmitsForm = riskEl ? isSubmitControl(riskEl) : false;
    activeStore.meta.set(ref, { ref, selector, tag, role, label });
    return {
      ref,
      tag,
      role,
      label,
      selector,
      name,
      risk_label: riskLabel,
      submits_form: submitsForm,
      risk_submits_form: riskSubmitsForm,
    };
  }

  function styleOf(el: Element): CSSStyleDeclaration | null {
    try {
      return window.getComputedStyle(el);
    } catch {
      return null;
    }
  }

  function analyzeVisibility(el: Element): {
    visible: boolean;
    reason: string | null;
    pointerEventsNone: boolean;
  } {
    let pointerEventsNone = false;
    let current: Element | null = el;
    let depth = 0;
    while (current && depth < 40) {
      const style = styleOf(current);
      if (!style) break;
      const own = current === el;
      if (own && style.pointerEvents === 'none') pointerEventsNone = true;
      if (style.display === 'none') {
        return {
          visible: false,
          reason: own ? 'display:none' : '祖先元素 display:none',
          pointerEventsNone,
        };
      }
      if (style.visibility === 'hidden' || style.visibility === 'collapse') {
        return {
          visible: false,
          reason: own ? 'visibility:hidden' : '祖先元素 visibility:hidden',
          pointerEventsNone,
        };
      }
      const opacity = Number.parseFloat(style.opacity);
      if (Number.isFinite(opacity) && opacity === 0) {
        return {
          visible: false,
          reason: own ? 'opacity:0' : '祖先元素 opacity:0',
          pointerEventsNone,
        };
      }
      if (own && Number.isFinite(opacity) && opacity <= 0.1) {
        return { visible: false, reason: '接近透明，可能还在动画中', pointerEventsNone };
      }
      current = current.parentElement;
      depth += 1;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { visible: false, reason: '尺寸为 0', pointerEventsNone };
    }
    return { visible: true, reason: null, pointerEventsNone };
  }

  function centerOf(el: Element): { x: number; y: number } {
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), Math.max(0, window.innerWidth - 1));
    const y = Math.min(
      Math.max(rect.top + rect.height / 2, 0),
      Math.max(0, window.innerHeight - 1),
    );
    return { x, y };
  }

  function isInert(el: Element): boolean {
    return el.closest('[inert]') !== null;
  }

  function isDisabled(el: Element): boolean {
    if (
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLButtonElement) &&
      el.disabled
    ) {
      return true;
    }
    if (el.closest('fieldset[disabled]')) return true;
    return el.getAttribute('aria-disabled') === 'true';
  }

  function isContentEditable(el: Element): boolean {
    const value = el.getAttribute('contenteditable');
    return value === '' || value === 'true' || value === 'plaintext-only';
  }

  function isEditable(el: Element): boolean {
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      const allowed = new Set([
        'text',
        'search',
        'email',
        'url',
        'tel',
        'number',
        'date',
        'time',
        'datetime-local',
        'month',
        'week',
      ]);
      return allowed.has(type) && !el.disabled && !el.readOnly;
    }
    return isContentEditable(el);
  }

  function secretFieldReason(el: Element): string | null {
    if (!(el instanceof HTMLInputElement)) return null;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'password') return '密码框';
    if (type === 'file') return '文件上传框';
    if (type === 'hidden') return '隐藏字段';
    const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
    if (autocomplete.startsWith('cc-')) return '银行卡字段';
    if (autocomplete === 'one-time-code') return '验证码字段';
    if (autocomplete.includes('password')) return '密码框';
    const hint =
      `${el.name} ${el.id} ${el.getAttribute('aria-label') ?? ''} ${labelFor(el) ?? ''}`.toLowerCase();
    if (
      /(验证码|verification|one[-_ ]time|otp|passcode|cvv|cvc|security code|密码|password|银行卡|信用卡|card number|credit card)/.test(
        hint,
      )
    ) {
      return '验证码或安全码字段';
    }
    return null;
  }

  function isCaptchaArea(el: Element): boolean {
    const hint =
      `${(el as HTMLElement).id} ${el.className} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
    if (/(captcha|recaptcha|hcaptcha|turnstile|验证码)/.test(hint)) return true;
    const frame = el.closest('iframe');
    if (!frame) return false;
    const src = (frame.getAttribute('src') ?? '').toLowerCase();
    return /(recaptcha|hcaptcha|turnstile|captcha)/.test(src);
  }

  function focusElement(el: Element): void {
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      try {
        (el as HTMLElement).focus();
      } catch {
        // 页面自定义元素可能拒绝 focus，后面用 activeElement 判断。
      }
    }
  }

  function resolveTarget(): ResolvedTarget {
    if (params.ref) {
      const weak = activeStore.byRef.get(params.ref);
      const el = weak?.deref() ?? null;
      if (!el) {
        const meta = activeStore.meta.get(params.ref);
        if (meta) {
          throw new PageFailure(
            'ref_stale',
            `元素 ${params.ref} 已经从页面移除，请重新 inspect 获取新的 ref。`,
          );
        }
        throw new PageFailure(
          'ref_missing',
          `当前页面没有 ${params.ref} 这个 ref，请先 inspect；如果它在子框架里，带上对应的 frame_id。`,
        );
      }
      if (!el.isConnected) {
        throw new PageFailure('ref_stale', `元素 ${params.ref} 已脱离页面，请重新 inspect。`);
      }
      return {
        el,
        point: centerOf(el),
        byCoords: false,
        summary: summaryFor(el),
      };
    }

    if (params.selector) {
      let matches: Element[];
      try {
        matches = Array.from(document.querySelectorAll(params.selector));
      } catch {
        throw new PageFailure('selector_invalid', `选择器「${params.selector}」语法无效。`);
      }
      if (matches.length === 0) {
        throw new PageFailure(
          'not_found',
          `页面里找不到选择器「${params.selector}」。如果元素在 shadow DOM 或跨域 iframe 里，v0.7 不支持。`,
        );
      }
      if (matches.length > 1) {
        throw new PageFailure(
          'ambiguous',
          `选择器「${params.selector}」匹配到 ${matches.length} 个元素，请改用 inspect 返回的 ref。`,
        );
      }
      const el = matches[0];
      if (!el) throw new PageFailure('not_found', `页面里找不到选择器「${params.selector}」。`);
      return { el, point: centerOf(el), byCoords: false, summary: summaryFor(el) };
    }

    if (params.x !== undefined || params.y !== undefined) {
      if (action !== 'click' && action !== 'hover') {
        throw new PageFailure('unsupported_action', '只有 click 和 hover 支持按坐标定位。');
      }
      let x = params.x;
      let y = params.y;
      if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        throw new PageFailure('no_target', '坐标点击需要同时提供有效的 x 和 y。');
      }
      const dpr = window.devicePixelRatio || 1;
      if (
        dpr > 1 &&
        (x > window.innerWidth || y > window.innerHeight) &&
        x / dpr <= window.innerWidth &&
        y / dpr <= window.innerHeight
      ) {
        x /= dpr;
        y /= dpr;
        warnings.push(`坐标看起来是截图像素，已按 DPR ${dpr} 换算成 CSS 像素。`);
      }
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        throw new PageFailure(
          'no_target',
          `坐标 (${params.x}, ${params.y}) 不在当前视口内（视口 ${window.innerWidth}×${window.innerHeight}）。`,
        );
      }
      const el = document.elementFromPoint(x, y);
      if (!el) {
        throw new PageFailure('not_found', `坐标 (${x}, ${y}) 上没有元素。`);
      }
      return {
        el,
        point: { x, y },
        byCoords: true,
        summary: summaryFor(el),
      };
    }

    if (action === 'scroll' || action === 'press' || action === 'wait_for') {
      const active = document.activeElement ?? document.body;
      if (!active) throw new PageFailure('no_target', '页面没有可操作的目标。');
      return { el: active, point: null, byCoords: false, summary: summaryFor(active) };
    }

    throw new PageFailure('no_target', '缺少目标：请传 ref、selector 或坐标。');
  }

  function requireVisible(el: Element): void {
    const visibility = analyzeVisibility(el);
    if (!visibility.visible) {
      throw new PageFailure(
        'not_visible',
        `目标不可见（${visibility.reason ?? '未知原因'}），先展开、滚动或等页面渲染。`,
      );
    }
    if (visibility.pointerEventsNone) {
      throw new PageFailure(
        'pointer_events_none',
        '目标设置了 pointer-events:none，鼠标点不到它。',
      );
    }
  }

  function requireEnabled(el: Element): void {
    if (el instanceof HTMLInputElement && (el.type || '').toLowerCase() === 'file') {
      throw new PageFailure(
        'unsupported_input',
        '文件上传需要用户自己选择文件；Pagehand 不代替用户打开文件选择器。',
      );
    }
    if (isCaptchaArea(el)) {
      throw new PageFailure(
        'unsupported_input',
        '这是验证码区域，Pagehand 不代为操作。请用户手动完成验证后再继续。',
      );
    }
    if (isDisabled(el)) {
      throw new PageFailure('disabled', '目标处于禁用状态，点了也不会有反应。');
    }
    if (isInert(el)) {
      throw new PageFailure('inert', '目标在 inert 区域里，当前不可操作。');
    }
  }

  function rejectNativePickerClick(el: Element): void {
    if (el instanceof HTMLSelectElement) {
      throw new PageFailure(
        'unsupported_control',
        '点击原生下拉会打开浏览器弹层，v0.7 不能可靠操作；请改用 select 动作。',
      );
    }
    if (!(el instanceof HTMLInputElement)) return;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'color' || type === 'range') {
      throw new PageFailure(
        'unsupported_control',
        `点击 ${type} 输入框会打开浏览器原生控件，v0.7 不能可靠操作；请改用 fill 或让用户手动设置。`,
      );
    }
    if (
      type === 'date' ||
      type === 'time' ||
      type === 'datetime-local' ||
      type === 'month' ||
      type === 'week'
    ) {
      throw new PageFailure(
        'unsupported_control',
        '点击日期/时间输入框会打开浏览器原生选择器，v0.7 不能可靠操作；请改用 fill 写入日期。',
      );
    }
  }

  function requireEditable(el: Element): void {
    const secret = secretFieldReason(el);
    if (secret) {
      throw new PageFailure(
        'unsupported_input',
        `这是${secret}，Pagehand 不代填。请用户自己输入，或换一个普通输入框。`,
      );
    }
    if (!isEditable(el)) {
      throw new PageFailure('not_editable', '目标不是可编辑的文本输入框、文本域或可编辑区域。');
    }
  }

  async function scrollIntoView(el: Element): Promise<void> {
    const beforeX = window.scrollX;
    const beforeY = window.scrollY;
    try {
      el.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'instant' as ScrollBehavior,
      });
    } catch {
      try {
        el.scrollIntoView();
      } catch {
        // 不可滚动时忽略，后面 hit-test 会给出真实原因。
      }
    }
    await nextFrame();
    await nextFrame();
    if (Math.abs(window.scrollX - beforeX) > 2 || Math.abs(window.scrollY - beforeY) > 2) {
      warnings.push('已滚动页面到目标位置。');
    }
  }

  function requireInViewport(el: Element): void {
    const rect = el.getBoundingClientRect();
    if (
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth
    ) {
      throw new PageFailure(
        'not_visible',
        '滚动后目标仍然不在视口内，可能被固定容器限制；请让用户手动滚动到目标附近。',
      );
    }
  }

  function rectKey(el: Element): string {
    const rect = el.getBoundingClientRect();
    return [rect.left, rect.top, rect.width, rect.height]
      .map((value) => Math.round(value))
      .join(',');
  }

  async function waitStable(el: Element): Promise<boolean> {
    let last = rectKey(el);
    const started = performance.now();
    while (performance.now() - started < 500) {
      await nextFrame();
      const next = rectKey(el);
      if (next === last) return true;
      last = next;
    }
    return false;
  }

  function hitTest(point: { x: number; y: number }): Element | null {
    if (typeof document.elementFromPoint !== 'function') return null;
    try {
      return document.elementFromPoint(point.x, point.y);
    } catch {
      return null;
    }
  }

  function receivesEvents(el: Element, point: { x: number; y: number } | null): Element | null {
    if (!point) return null;
    const top = hitTest(point);
    if (!top) return null;
    if (top === el || el.contains(top)) return null;
    return top;
  }

  async function ensureReceivesEvents(
    el: Element,
    point: { x: number; y: number } | null,
  ): Promise<void> {
    if (!point) return;
    const first = hitTest(point);
    if (!first) {
      warnings.push('当前环境无法检测遮挡，已跳过命中测试。');
      return;
    }
    const started = performance.now();
    while (performance.now() - started < 800) {
      const blocker = receivesEvents(el, point);
      if (!blocker) return;
      await sleep(50);
    }
    const blocker = receivesEvents(el, point);
    if (blocker) {
      throw new PageFailure(
        'covered',
        `目标的点击点被「${describe(blocker)}」挡住，请先关闭弹窗或遮罩。`,
      );
    }
  }

  function stateFor(el: Element, truncate = true): InteractTargetState {
    const state: InteractTargetState = {};
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      if (!secretFieldReason(el)) {
        state.value = truncate ? cut(el.value ?? '', 120) : (el.value ?? '');
      }
      if (type === 'checkbox' || type === 'radio') state.checked = el.checked;
    } else if (el instanceof HTMLTextAreaElement) {
      state.value = truncate ? cut(el.value ?? '', 120) : (el.value ?? '');
    } else if (el instanceof HTMLSelectElement) {
      state.value = truncate ? cut(el.value ?? '', 120) : (el.value ?? '');
      state.selected_index = el.selectedIndex;
    } else if (el.getAttribute('role') === 'switch') {
      state.checked = el.getAttribute('aria-checked') === 'true';
    } else if (isContentEditable(el)) {
      const text = el.textContent ?? '';
      state.value = truncate ? cut(normalize(text), 120) : normalize(text);
    }
    if (document.activeElement === el) state.focused = true;
    return state;
  }

  function stateChanged(before: InteractTargetState, after: InteractTargetState): boolean {
    return (
      before.value !== after.value ||
      before.checked !== after.checked ||
      before.selected_index !== after.selected_index
    );
  }

  function dispatchMouse(
    el: Element,
    type: string,
    point: { x: number; y: number },
    options: { bubbles?: boolean; buttons?: number; detail?: number } = {},
  ): void {
    const init: MouseEventInit = {
      bubbles: options.bubbles ?? true,
      composed: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: options.buttons ?? 0,
      detail: options.detail ?? 0,
      clientX: point.x,
      clientY: point.y,
      ...modifierInit(),
    };
    const hasPointer = typeof PointerEvent === 'function';
    const event = hasPointer
      ? new PointerEvent(type, {
          ...init,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          pressure: options.buttons ? 0.5 : 0,
        })
      : new MouseEvent(type, init);
    el.dispatchEvent(event);
  }

  function dispatchMouseOnly(
    el: Element,
    type: string,
    point: { x: number; y: number },
    options: { bubbles?: boolean; buttons?: number; detail?: number } = {},
  ): void {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: options.bubbles ?? true,
        composed: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: options.buttons ?? 0,
        detail: options.detail ?? 0,
        clientX: point.x,
        clientY: point.y,
        ...modifierInit(),
      }),
    );
  }

  function modifierInit(): MouseEventInit & KeyboardEventInit {
    const modifiers = params.modifiers ?? [];
    return {
      ctrlKey: modifiers.includes('ctrl'),
      shiftKey: modifiers.includes('shift'),
      altKey: modifiers.includes('alt'),
      metaKey: modifiers.includes('meta'),
    };
  }

  function hoverAt(el: Element, point: { x: number; y: number }): void {
    dispatchMouse(el, 'pointerover', point);
    dispatchMouseOnly(el, 'mouseover', point);
    dispatchMouse(el, 'pointerenter', point, { bubbles: false });
    dispatchMouseOnly(el, 'mouseenter', point, { bubbles: false });
    dispatchMouse(el, 'pointermove', point);
    dispatchMouseOnly(el, 'mousemove', point);
  }

  function clickAt(el: Element, point: { x: number; y: number }): void {
    hoverAt(el, point);
    dispatchMouse(el, 'pointerdown', point, { buttons: 1 });
    dispatchMouseOnly(el, 'mousedown', point, { buttons: 1 });
    dispatchMouse(el, 'pointerup', point, { buttons: 0 });
    dispatchMouseOnly(el, 'mouseup', point, { buttons: 0 });
    const clickable = el as HTMLElement;
    if (typeof clickable.click === 'function') {
      clickable.click();
      return;
    }
    dispatchMouseOnly(el, 'click', point, { detail: 1 });
    warnings.push('目标不是 HTML 元素，激活行为可能不完整。');
  }

  function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function appendToInput(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    const next = `${el.value ?? ''}${text}`;
    setInputValue(el, next);
    try {
      el.setSelectionRange(next.length, next.length);
    } catch {
      // number/date 等类型不支持 setSelectionRange。
    }
  }

  function emitInput(el: Element, value: string): void {
    let event: Event;
    try {
      event = new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: value,
      });
    } catch {
      event = new Event('input', { bubbles: true, composed: true });
    }
    el.dispatchEvent(event);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectEditableContents(el: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function collapseEditableToEnd(el: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertEditableText(el: HTMLElement, text: string, replace: boolean): void {
    focusElement(el);
    if (replace) selectEditableContents(el);
    else collapseEditableToEnd(el);
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
    if (!inserted) {
      if (replace) el.textContent = text;
      else el.textContent = `${el.textContent ?? ''}${text}`;
      warnings.push('编辑器没有接受 insertText，已直接写入文本；编辑器内部状态可能不同步。');
    }
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function readEditableText(el: Element): string {
    return normalize(el.textContent ?? '');
  }

  function keyInfo(key: string): { code: string; keyCode: number } {
    const named: Record<string, { code: string; keyCode: number }> = {
      Enter: { code: 'Enter', keyCode: 13 },
      Escape: { code: 'Escape', keyCode: 27 },
      Tab: { code: 'Tab', keyCode: 9 },
      Backspace: { code: 'Backspace', keyCode: 8 },
      Delete: { code: 'Delete', keyCode: 46 },
      ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
      ArrowUp: { code: 'ArrowUp', keyCode: 38 },
      ArrowRight: { code: 'ArrowRight', keyCode: 39 },
      ArrowDown: { code: 'ArrowDown', keyCode: 40 },
      Home: { code: 'Home', keyCode: 36 },
      End: { code: 'End', keyCode: 35 },
      PageUp: { code: 'PageUp', keyCode: 33 },
      PageDown: { code: 'PageDown', keyCode: 34 },
      ' ': { code: 'Space', keyCode: 32 },
      Space: { code: 'Space', keyCode: 32 },
    };
    const known = named[key];
    if (known) return known;
    if (/^[a-zA-Z]$/.test(key)) {
      return { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };
    }
    if (/^[0-9]$/.test(key)) {
      return { code: `Digit${key}`, keyCode: key.charCodeAt(0) };
    }
    return { code: '', keyCode: 0 };
  }

  function pressKey(target: Element): void {
    const key = params.key;
    if (!key) throw new PageFailure('unsupported_action', 'press 需要 key 参数。');
    const commandModifier = (params.modifiers ?? []).some(
      (modifier) => modifier === 'ctrl' || modifier === 'alt' || modifier === 'meta',
    );
    if (key.length === 1 && key !== ' ' && !commandModifier) {
      throw new PageFailure(
        'unsupported_action',
        'press 只用于控制键和快捷键；输入文字请用 fill 或 type。',
      );
    }
    const explicitTarget = Boolean(params.ref || params.selector);
    if (explicitTarget) {
      focusElement(target);
      if (document.activeElement !== target && !target.contains(document.activeElement)) {
        throw new PageFailure('not_editable', `目标无法获得键盘焦点，按键可能落在别的元素上。`);
      }
    }
    const info = keyInfo(key);
    const init: KeyboardEventInit = {
      key,
      code: info.code,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...modifierInit(),
    };
    const makeEvent = (type: string): KeyboardEvent => {
      const event = new KeyboardEvent(type, init);
      try {
        Object.defineProperty(event, 'keyCode', { value: info.keyCode });
        Object.defineProperty(event, 'which', { value: info.keyCode });
      } catch {
        // 某些测试环境不允许覆盖只读属性，忽略。
      }
      return event;
    };
    target.dispatchEvent(makeEvent('keydown'));
    if (key.length === 1 || key === 'Enter') {
      target.dispatchEvent(makeEvent('keypress'));
    }
    target.dispatchEvent(makeEvent('keyup'));
    if (key === 'Tab' || key.startsWith('Arrow')) {
      warnings.push('合成按键不会执行浏览器默认的焦点/光标移动。');
    }
    if (commandModifier) {
      warnings.push('合成快捷键不会执行浏览器默认行为；页面需要自己监听这个快捷键。');
    }
    if (
      key === 'Enter' &&
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    ) {
      warnings.push('如果页面依赖原生表单提交，回车可能无效；可以改为点击提交按钮。');
    }
  }

  function chooseOption(el: Element): string {
    if (!(el instanceof HTMLSelectElement)) {
      throw new PageFailure(
        'not_select',
        '目标不是原生 <select>；自定义下拉请用 click 展开后点选项。',
      );
    }
    const wanted = params.option ?? params.text;
    if (!wanted) throw new PageFailure('unsupported_action', 'select 需要 option 参数。');
    if (el.multiple) {
      throw new PageFailure(
        'unsupported_control',
        'v0.7 不支持多选下拉；请用 click 逐个选择选项，或告诉用户手动完成。',
      );
    }
    const options = Array.from(el.options);
    const normalized = normalize(wanted).toLowerCase();
    const option =
      options.find((item) => item.value === wanted) ??
      options.find((item) => normalize(item.text) === normalize(wanted)) ??
      options.find(
        (item) =>
          normalize(item.text).toLowerCase() === normalized ||
          item.value.toLowerCase() === normalized,
      );
    if (!option) {
      const available = options
        .slice(0, 10)
        .map((item) => `${item.text || item.value}`)
        .join('、');
      throw new PageFailure(
        'option_not_found',
        `下拉里没有「${wanted}」。可选：${available || '（空）'}`,
      );
    }
    if (option.disabled) {
      throw new PageFailure('option_not_found', `选项「${wanted}」是禁用状态，不能选择。`);
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, option.value);
    else el.value = option.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return option.text || option.value;
  }

  function checkable(el: Element): boolean {
    if (el instanceof HTMLInputElement) {
      const type = (el.type || '').toLowerCase();
      return type === 'checkbox' || type === 'radio';
    }
    return el.getAttribute('role') === 'switch';
  }

  function checkedOf(el: Element): boolean {
    if (el instanceof HTMLInputElement) return el.checked;
    return el.getAttribute('aria-checked') === 'true';
  }

  function scrollContainerOf(el: Element): Element | null {
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = styleOf(current);
      if (style) {
        const overflow = `${style.overflowY} ${style.overflowX}`;
        if (/(auto|scroll|overlay|hidden)/.test(overflow)) {
          if (
            current.scrollHeight > current.clientHeight + 1 ||
            current.scrollWidth > current.clientWidth + 1
          ) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  function scrollBy(deltaX: number, deltaY: number, container: Element | null): void {
    try {
      if (container) {
        container.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' as ScrollBehavior });
        return;
      }
      window.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' as ScrollBehavior });
    } catch {
      if (container) container.scrollBy(deltaX, deltaY);
      else window.scrollBy(deltaX, deltaY);
    }
  }

  function installObserver(): {
    stop: () => number;
    mutated: () => number;
    lastMutation: () => number;
  } {
    let mutated = 0;
    let lastMutation = performance.now();
    const observer = new MutationObserver((records) => {
      mutated += records.length;
      lastMutation = performance.now();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    return {
      stop: () => {
        observer.disconnect();
        return mutated;
      },
      mutated: () => mutated,
      lastMutation: () => lastMutation,
    };
  }

  async function settle(
    el: Element | null,
    before: InteractTargetState | null,
    observer: ReturnType<typeof installObserver>,
  ): Promise<{ changed: boolean; mutated: number }> {
    const started = performance.now();
    while (performance.now() - started < 1200) {
      await sleep(50);
      if (location.href !== urlBefore) {
        return { changed: true, mutated: observer.mutated() };
      }
      if (el && !el.isConnected) {
        return { changed: true, mutated: observer.mutated() };
      }
      const state = el ? stateFor(el, false) : null;
      if (before && state && stateChanged(before, state)) {
        return { changed: true, mutated: observer.mutated() };
      }
      if (observer.mutated() > 0 && performance.now() - observer.lastMutation() > 150) {
        return { changed: true, mutated: observer.mutated() };
      }
    }
    const state = el ? stateFor(el, false) : null;
    return {
      changed:
        observer.mutated() > 0 ||
        (before !== null && state !== null && stateChanged(before, state)),
      mutated: observer.mutated(),
    };
  }

  const observationState: {
    observer: ReturnType<typeof installObserver> | null;
    before: InteractTargetState | null;
  } = { observer: null, before: null };

  try {
    if (action === 'wait_for') {
      const waitState = params.state ?? 'visible';
      if ((waitState === 'url' || waitState === 'text' || waitState === 'value') && !params.value) {
        throw new PageFailure('unsupported_action', `wait_for 的 ${waitState} 条件需要 value。`);
      }
      if (waitState !== 'url' && waitState !== 'text' && !params.ref && !params.selector) {
        throw new PageFailure('no_target', 'wait_for 需要 ref 或 selector（url 条件除外）。');
      }
      const timeout = Math.min(30_000, Math.max(1_000, params.timeout ?? 5_000));
      activeStore.cancelled = false;
      const started = performance.now();
      while (performance.now() - started < timeout) {
        if (activeStore.cancelled) {
          throw new PageFailure('cancelled', '等待已取消。');
        }
        let targetEl: Element | null = null;
        if (params.ref || params.selector) {
          try {
            targetEl = resolveTarget().el;
          } catch (error) {
            if (!(error instanceof PageFailure)) throw error;
            const absent =
              error.code === 'not_found' ||
              error.code === 'ref_missing' ||
              error.code === 'ref_stale';
            if (waitState === 'hidden' && absent) {
              targetEl = null;
            } else if (params.ref && (error.code === 'ref_missing' || error.code === 'ref_stale')) {
              throw error;
            } else if (!absent) {
              throw error;
            }
          }
        }
        const condition = (() => {
          if (waitState === 'url') return location.href.includes(params.value ?? '');
          if (waitState === 'text') {
            if ((params.ref || params.selector) && !targetEl) return false;
            if (targetEl && secretFieldReason(targetEl)) {
              throw new PageFailure(
                'unsupported_input',
                '不能等待密码、验证码或银行卡字段的文字；这类字段请用户自己确认。',
              );
            }
            const haystack = targetEl
              ? targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement
                ? targetEl.value
                : readEditableText(targetEl)
              : normalize(document.body?.textContent ?? '');
            return haystack.includes(normalize(params.value ?? ''));
          }
          if (waitState === 'value') {
            if (!targetEl) return false;
            if (secretFieldReason(targetEl)) {
              throw new PageFailure(
                'unsupported_input',
                '不能等待密码、验证码或银行卡字段的值；这类字段请用户自己确认。',
              );
            }
            const wantedValue = params.value ?? '';
            if (targetEl instanceof HTMLSelectElement) {
              return (
                targetEl.value === wantedValue ||
                normalize(targetEl.selectedOptions?.[0]?.text ?? '') === normalize(wantedValue)
              );
            }
            if (!('value' in targetEl)) {
              throw new PageFailure(
                'unsupported_control',
                '目标没有 value 属性；可编辑区域请改用 wait_for 的 text 条件。',
              );
            }
            return (targetEl as HTMLInputElement).value === wantedValue;
          }
          const visible = targetEl ? analyzeVisibility(targetEl).visible : false;
          return waitState === 'hidden' ? !visible : visible;
        })();
        if (condition) {
          return result({
            message: '等待条件已满足。',
            target: targetEl ? summaryFor(targetEl) : null,
            state: targetEl ? stateFor(targetEl) : null,
          });
        }
        await sleep(100);
      }
      throw new PageFailure('timeout', `等待超时（${timeout}ms），条件仍未满足。`);
    }

    if ((action === 'fill' || action === 'type') && params.text === undefined) {
      throw new PageFailure('unsupported_action', `${action} 需要 text 参数。`);
    }

    const resolved = resolveTarget();
    const target = resolved.summary;
    const el = resolved.el;

    const beginObservation = (): void => {
      if (phase !== 'act' || observationState.observer) return;
      observationState.before = stateFor(el, false);
      observationState.observer = installObserver();
    };

    if (action === 'click' || action === 'hover') {
      requireVisible(el);
      requireEnabled(el);
      if (action === 'click') rejectNativePickerClick(el);
      if (phase === 'act') {
        await scrollIntoView(el);
        if (!(await waitStable(el))) {
          throw new PageFailure('not_stable', '目标位置一直在变化（可能还在动画中），请稍后再试。');
        }
        requireInViewport(el);
        const point = resolved.byCoords ? resolved.point : centerOf(el);
        await ensureReceivesEvents(el, point);
        if (!point) throw new PageFailure('no_target', '没有可用的点击坐标。');
        beginObservation();
        if (action === 'hover') {
          hoverAt(el, point);
          warnings.push('合成悬停不会触发 CSS :hover；如果菜单没展开，请改用 click。');
        } else {
          focusElement(el);
          clickAt(el, point);
        }
      }
    } else if (action === 'fill' || action === 'type') {
      requireVisible(el);
      requireEditable(el);
      requireEnabled(el);
      if (phase === 'act') {
        await scrollIntoView(el);
        if (!(await waitStable(el))) {
          throw new PageFailure('not_stable', '目标位置一直在变化，请稍后再试。');
        }
        requireInViewport(el);
        await ensureReceivesEvents(el, centerOf(el));
        const beforeValue =
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
            ? (el.value ?? '')
            : readEditableText(el);
        const replace = action === 'fill';
        const text = params.text ?? '';
        beginObservation();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          focusElement(el);
          if (replace) {
            try {
              el.select();
            } catch {
              // 某些 input 类型不支持 select。
            }
            setInputValue(el, text);
          } else {
            appendToInput(el, text);
          }
          emitInput(el, text);
        } else {
          insertEditableText(el as HTMLElement, text, replace);
        }
        await sleep(50);
        const actual =
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
            ? el.value
            : readEditableText(el);
        const expected = replace ? text : `${beforeValue}${text}`;
        if (actual !== expected) {
          if (actual === beforeValue) {
            throw new PageFailure('value_not_set', '页面没有接受这次输入，值没有变化。');
          }
          warnings.push(`页面把内容改成了「${cut(actual, 60)}」，与请求不一致。`);
        }
      }
    } else if (action === 'press') {
      // 键盘事件不需要鼠标命中测试：Escape 经常正是用来关掉盖住页面的遮罩。
      if (secretFieldReason(el)) {
        throw new PageFailure(
          'unsupported_input',
          '目标包含密码或验证码字段，请用户自己按键提交；Pagehand 不代操作敏感字段。',
        );
      }
      if (phase === 'act') {
        beginObservation();
        pressKey(el);
      }
    } else if (action === 'select') {
      requireVisible(el);
      requireEnabled(el);
      if (!(el instanceof HTMLSelectElement)) {
        throw new PageFailure(
          'not_select',
          '目标不是原生 <select>；自定义下拉请用 click 展开后点选项。',
        );
      }
      if (phase === 'act') {
        await scrollIntoView(el);
        requireInViewport(el);
        await ensureReceivesEvents(el, centerOf(el));
        beginObservation();
        chooseOption(el);
      }
    } else if (action === 'check' || action === 'uncheck') {
      requireVisible(el);
      requireEnabled(el);
      if (!checkable(el)) {
        throw new PageFailure('not_checkable', '目标不是复选框、单选框或开关。');
      }
      const desired = action === 'check';
      if (el instanceof HTMLInputElement && el.type === 'radio' && !desired) {
        throw new PageFailure('not_checkable', '单选框不能取消勾选，请改选其他选项。');
      }
      if (checkedOf(el) === desired) {
        return result({
          message: `目标已经是${desired ? '勾选' : '未勾选'}状态，不需要再点。`,
          target,
          state: stateFor(el),
          details: { already: true },
        });
      }
      if (phase === 'act') {
        await scrollIntoView(el);
        if (!(await waitStable(el))) {
          throw new PageFailure('not_stable', '目标位置一直在变化，请稍后再试。');
        }
        requireInViewport(el);
        const point = centerOf(el);
        await ensureReceivesEvents(el, point);
        beginObservation();
        focusElement(el);
        clickAt(el, point);
        let verified = false;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          if (checkedOf(el) === desired) {
            verified = true;
            break;
          }
          await sleep(50);
        }
        if (!verified) {
          throw new PageFailure(
            'state_unchanged',
            `点击后${desired ? '没有勾选' : '没有取消勾选'}，页面可能拦截了这次操作。`,
          );
        }
      }
    } else if (action === 'scroll') {
      if (phase === 'act') {
        const deltaX = params.deltaX ?? 0;
        const deltaY = params.deltaY ?? 300;
        const container = params.ref || params.selector ? scrollContainerOf(el) : null;
        const beforeX = container ? container.scrollLeft : window.scrollX;
        const beforeY = container ? container.scrollTop : window.scrollY;
        scrollBy(deltaX, deltaY, container);
        await nextFrame();
        const afterX = container ? container.scrollLeft : window.scrollX;
        const afterY = container ? container.scrollTop : window.scrollY;
        const changed = beforeX !== afterX || beforeY !== afterY;
        return result({
          message: changed
            ? `已滚动（${Math.round(afterX - beforeX)}, ${Math.round(afterY - beforeY)}）。`
            : '页面没有继续滚动，可能已经到边界。',
          target: params.ref || params.selector ? target : null,
          state: stateFor(el),
          changed,
          details: {
            before_x: beforeX,
            before_y: beforeY,
            after_x: afterX,
            after_y: afterY,
            container: container ? describe(container) : null,
          },
        });
      }
    } else {
      throw new PageFailure('unsupported_action', `不支持的动作：${action}`);
    }

    if (phase === 'probe') {
      return result({
        message: '目标可以操作。',
        target,
        state: stateFor(el),
      });
    }

    const activeObserver = observationState.observer;
    if (!activeObserver) {
      throw new PageFailure('unknown', '没有开始观察页面变化。');
    }
    const observation = await settle(el, observationState.before, activeObserver);
    const mutated = activeObserver.stop();
    const message = observation.changed
      ? '操作已执行，页面有变化。'
      : '操作已发出，但 1.2 秒内没有看到页面变化。';
    return result({
      message,
      target,
      state: stateFor(el),
      changed: observation.changed,
      mutated,
      by_coords: resolved.byCoords,
    });
  } catch (error) {
    if (error instanceof PageFailure) {
      return fail(error.code, error.message);
    }
    return fail('unknown', error instanceof Error ? error.message : String(error));
  } finally {
    observationState.observer?.stop();
  }
}

/** 取消正在等待的 wait_for；由工具在 AbortSignal 触发时注入。 */
export function cancelPageInteraction(): void {
  const key = '__pagehandRefStoreV1';
  const store = (globalThis as unknown as Record<string, unknown>)[key] as
    | { cancelled?: boolean }
    | undefined;
  if (store) store.cancelled = true;
}
