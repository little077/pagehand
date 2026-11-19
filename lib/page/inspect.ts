import type { PageRefMeta, PageRefStore } from './ref-store';

export type InspectHiddenReason =
  | 'display_none'
  | 'visibility_hidden'
  | 'opacity_zero'
  | 'near_transparent'
  | 'zero_size'
  | 'ancestor_hidden';

export type InspectLabelSource =
  | 'aria-labelledby'
  | 'aria-label'
  | 'label'
  | 'placeholder'
  | 'alt'
  | 'title'
  | 'text';

export type InspectKind = 'input' | 'button' | 'link';

export interface InspectState {
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  expanded?: boolean;
  pressed?: boolean;
  focused?: boolean;
}

export interface InspectElement {
  ref: string;
  selector: string;
  tag: string;
  kind: InspectKind | null;
  role: string | null;
  label: string | null;
  label_source: InspectLabelSource | null;
  text: string | null;
  value: string | null;
  placeholder: string | null;
  input_type: string | null;
  name: string | null;
  autocomplete: string | null;
  state: InspectState | null;
  visible: boolean;
  hidden_reason: InspectHiddenReason | null;
  pointer_events_none: boolean;
  covered: boolean;
  covered_by: string | null;
  in_viewport: boolean;
  rect: { x: number; y: number; w: number; h: number } | null;
}

export interface InspectRoleCount {
  role: string;
  total: number;
  visible: number;
}

export interface InspectScope {
  selector: string | null;
  text: string | null;
  frame_id: number;
}

export interface InspectSnapshot {
  title: string;
  url: string;
  scope_total: number;
  total: number;
  returned: number;
  hidden_count: number;
  covered_count: number;
  truncated: boolean;
  scope_miss: boolean;
  scope_error: string | null;
  role_counts: InspectRoleCount[];
  fingerprint: string;
  scope: InspectScope;
  elements: InspectElement[];
}

export interface InspectCollectOptions {
  selector?: string | null;
  text?: string | null;
  role?: string | null;
  kind?: InspectKind | null;
  inputType?: string | null;
  includeHidden?: boolean;
  limit?: number;
  frameId?: number;
}

/**
 * 注入到页面里执行。函数会被序列化，不能引用模块级变量。
 * 只读：不点击、不聚焦、不滚动、不修改 DOM，也不读取密码框。
 */
export function collectInteractiveElements(options: InspectCollectOptions): InspectSnapshot {
  const MAX_CANDIDATES = 400;
  const DEFAULT_LIMIT = 40;
  const MAX_LIMIT = 200;
  const LABEL_MAX = 80;
  const TEXT_MAX = 120;
  const VALUE_MAX = 80;
  const NAME_MAX = 60;
  const AUTOCOMPLETE_MAX = 40;
  const COVERED_BY_MAX = 60;
  const ANCESTOR_DEPTH = 40;
  const ROLE_COUNT_MAX = 8;
  const REF_STORE_KEY = '__pagehandRefStoreV1';
  const REF_STORE_MAX = 4000;

  // 注册表挂在 isolated world 的 globalThis 上，跨多次注入保持；页面导航后自动消失。
  const holder = globalThis as unknown as Record<string, unknown>;
  let refStore = holder[REF_STORE_KEY] as PageRefStore | undefined;
  if (!refStore) {
    refStore = {
      seq: 0,
      byElement: new WeakMap<Element, string>(),
      byRef: new Map<string, WeakRef<Element>>(),
      meta: new Map<string, PageRefMeta>(),
    };
    holder[REF_STORE_KEY] = refStore;
  }

  // 长页面反复 inspect 时先回收已经被 GC 的元素，避免 meta 无限增长。
  if (refStore.byRef.size > REF_STORE_MAX) {
    for (const [ref, weak] of [...refStore.byRef]) {
      if (!weak.deref()) {
        refStore.byRef.delete(ref);
        refStore.meta.delete(ref);
      }
    }
    // 活元素太多时按插入顺序淘汰最老的；旧 ref 会变成 stale，重新 inspect 即可。
    let overflow = refStore.byRef.size - REF_STORE_MAX;
    for (const ref of refStore.byRef.keys()) {
      if (overflow <= 0) break;
      refStore.byRef.delete(ref);
      refStore.meta.delete(ref);
      overflow -= 1;
    }
  }

  const refFor = (el: Element): string => {
    const existing = refStore.byElement.get(el);
    if (existing && refStore.byRef.get(existing)?.deref() === el) return existing;
    const ref = `e${++refStore.seq}`;
    refStore.byElement.set(el, ref);
    refStore.byRef.set(ref, new WeakRef(el));
    return ref;
  };

  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const cut = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

  const escapeId = (value: string): string => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  };

  const selectorFor = (el: Element): string => {
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
  };

  const roleFor = (el: Element): string | null => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const editable = el.getAttribute('contenteditable');
    if (editable === '' || editable === 'true') return 'textbox';
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
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'summary') return 'button';
    return null;
  };

  const kindFor = (el: Element): InspectKind | null => {
    const role = roleFor(el);
    const tag = el.tagName.toLowerCase();
    const editable = el.getAttribute('contenteditable');
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      editable === '' ||
      editable === 'true' ||
      role === 'textbox' ||
      role === 'searchbox' ||
      role === 'combobox'
    ) {
      return 'input';
    }
    if (tag === 'button' || tag === 'summary' || role === 'button') return 'button';
    if ((tag === 'a' && el.hasAttribute('href')) || role === 'link') return 'link';
    return null;
  };

  const labelInfoFor = (
    el: Element,
  ): { value: string | null; source: InspectLabelSource | null } => {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean);
      if (parts.length > 0) {
        return { value: cut(normalize(parts.join(' ')), LABEL_MAX), source: 'aria-labelledby' };
      }
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel?.trim()) {
      return { value: cut(normalize(ariaLabel), LABEL_MAX), source: 'aria-label' };
    }

    const formControl =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement;

    if (formControl) {
      const id = el.id;
      if (id) {
        const bound = document.querySelector(`label[for="${escapeId(id)}"]`);
        const boundText = bound?.textContent?.trim();
        if (boundText) {
          return { value: cut(normalize(boundText), LABEL_MAX), source: 'label' };
        }
      }
      if (!(el instanceof HTMLSelectElement)) {
        const wrapping = el.closest('label');
        const wrappingText = wrapping?.textContent?.trim();
        if (wrappingText) {
          return { value: cut(normalize(wrappingText), LABEL_MAX), source: 'label' };
        }
      }
      const placeholder = (el as HTMLInputElement).placeholder;
      if (placeholder?.trim()) {
        return { value: cut(normalize(placeholder), LABEL_MAX), source: 'placeholder' };
      }
    }

    const alt = el.getAttribute('alt');
    if (alt?.trim()) return { value: cut(normalize(alt), LABEL_MAX), source: 'alt' };

    const title = el.getAttribute('title');
    if (title?.trim()) return { value: cut(normalize(title), LABEL_MAX), source: 'title' };

    const role = roleFor(el);
    if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') {
      const text = normalize((el.textContent ?? '').trim());
      if (text) return { value: cut(text, LABEL_MAX), source: 'text' };
    }

    return { value: null, source: null };
  };

  const textFor = (el: Element): string | null => {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      return null;
    }
    const role = roleFor(el);
    if (role !== 'button' && role !== 'link' && role !== 'menuitem' && role !== 'tab') {
      return null;
    }
    const text = normalize(el.textContent ?? '');
    return text ? cut(text, TEXT_MAX) : null;
  };

  const valueFor = (el: Element): string | null => {
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio' || type === 'password') return null;
      const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
      const hint = `${el.name} ${el.id}`.toLowerCase();
      if (
        autocomplete.startsWith('cc-') ||
        autocomplete === 'one-time-code' ||
        /(cvv|cvc|security code|verification|one[-_ ]time|otp|passcode|验证码|password|card number|credit card|银行卡|信用卡|密码)/.test(
          hint,
        )
      ) {
        return null;
      }
      return el.value ? cut(el.value, VALUE_MAX) : null;
    }
    if (el instanceof HTMLTextAreaElement) {
      return el.value ? cut(el.value, VALUE_MAX) : null;
    }
    if (el instanceof HTMLSelectElement) {
      return el.value ? cut(el.value, VALUE_MAX) : null;
    }
    return null;
  };

  const placeholderFor = (el: Element): string | null => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const placeholder = el.placeholder?.trim();
      return placeholder ? cut(normalize(placeholder), LABEL_MAX) : null;
    }
    return null;
  };

  const inputTypeFor = (el: Element): string | null => {
    if (!(el instanceof HTMLInputElement)) return null;
    return (el.type || 'text').toLowerCase();
  };

  const nameFor = (el: Element): string | null => {
    const name = el.getAttribute('name')?.trim();
    return name ? cut(normalize(name), NAME_MAX) : null;
  };

  const autocompleteFor = (el: Element): string | null => {
    const autocomplete = el.getAttribute('autocomplete')?.trim();
    return autocomplete ? cut(normalize(autocomplete), AUTOCOMPLETE_MAX) : null;
  };

  const stateFor = (el: Element): InspectState | null => {
    const state: InspectState = {};
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') state.checked = el.checked;
      if (el.disabled) state.disabled = true;
      if (el.readOnly) state.readonly = true;
    }
    if (el instanceof HTMLTextAreaElement) {
      if (el.disabled) state.disabled = true;
      if (el.readOnly) state.readonly = true;
    }
    if (el instanceof HTMLSelectElement && el.disabled) state.disabled = true;
    if (el.hasAttribute('disabled') && state.disabled === undefined) state.disabled = true;
    if (el.getAttribute('aria-expanded') === 'true') state.expanded = true;
    if (el.getAttribute('aria-pressed') === 'true') state.pressed = true;
    if (document.activeElement === el) state.focused = true;
    return Object.keys(state).length > 0 ? state : null;
  };

  const styleOf = (el: Element): CSSStyleDeclaration | null => {
    try {
      return window.getComputedStyle(el);
    } catch {
      return null;
    }
  };

  const analyzeVisibility = (
    el: Element,
  ): { visible: boolean; reason: InspectHiddenReason | null; pointerEventsNone: boolean } => {
    let pointerEventsNone = false;
    let current: Element | null = el;
    let depth = 0;

    while (current && depth < ANCESTOR_DEPTH) {
      const style = styleOf(current);
      if (!style) break;
      const own = current === el;

      if (own && style.pointerEvents === 'none') pointerEventsNone = true;
      if (style.display === 'none') {
        return {
          visible: false,
          reason: own ? 'display_none' : 'ancestor_hidden',
          pointerEventsNone,
        };
      }
      if (style.visibility === 'hidden' || style.visibility === 'collapse') {
        return {
          visible: false,
          reason: own ? 'visibility_hidden' : 'ancestor_hidden',
          pointerEventsNone,
        };
      }

      const opacity = Number.parseFloat(style.opacity);
      if (Number.isFinite(opacity)) {
        if (opacity === 0) {
          return {
            visible: false,
            reason: own ? 'opacity_zero' : 'ancestor_hidden',
            pointerEventsNone,
          };
        }
        if (own && opacity <= 0.1) {
          return { visible: false, reason: 'near_transparent', pointerEventsNone };
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { visible: false, reason: 'zero_size', pointerEventsNone };
    }
    return { visible: true, reason: null, pointerEventsNone };
  };

  const describeElement = (el: Element): string => {
    const role = roleFor(el);
    const label = labelInfoFor(el).value;
    if (role && label) return cut(`${role}「${label}」`, COVERED_BY_MAX);
    if (label) return cut(label, COVERED_BY_MAX);
    if (role) return cut(role, COVERED_BY_MAX);
    const id = (el as HTMLElement).id;
    if (id) return cut(`${el.tagName.toLowerCase()}#${id}`, COVERED_BY_MAX);
    return cut(el.tagName.toLowerCase(), COVERED_BY_MAX);
  };

  const coveredBy = (el: Element, rect: DOMRect): string | null => {
    if (typeof document.elementFromPoint !== 'function') return null;
    const x = Math.min(Math.max(rect.x + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.y + rect.height / 2, 0), window.innerHeight - 1);
    let top: Element | null = null;
    try {
      top = document.elementFromPoint(x, y);
    } catch {
      return null;
    }
    if (!top || top === el || el.contains(top)) return null;
    return describeElement(top);
  };

  const inViewport = (rect: DOMRect): boolean =>
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;

  const scope: InspectScope = {
    selector: options.selector ?? null,
    text: options.text ?? null,
    frame_id: options.frameId ?? 0,
  };

  const empty = (scopeMiss: boolean, scopeError: string | null): InspectSnapshot => ({
    title: document.title,
    url: location.href,
    scope_total: 0,
    total: 0,
    returned: 0,
    hidden_count: 0,
    covered_count: 0,
    truncated: false,
    scope_miss: scopeMiss,
    scope_error: scopeError,
    role_counts: [],
    fingerprint: `${location.href}|0:0`,
    scope,
    elements: [],
  });

  let root: Element | null = document.body;
  if (options.selector) {
    try {
      root = document.querySelector(options.selector);
    } catch {
      return empty(true, '选择器语法无效');
    }
    if (!root) return empty(true, null);
  }
  if (!root) return empty(true, null);

  const interactiveSelector = [
    'a[href]',
    'button',
    'input:not([type="hidden"]):not([type="password"])',
    'select',
    'textarea',
    'summary',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="option"]',
    '[role="combobox"]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="slider"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const scopeNodes: Element[] = [];
  if (root.matches(interactiveSelector)) scopeNodes.push(root);
  for (const node of Array.from(root.querySelectorAll(interactiveSelector))) {
    if (!scopeNodes.includes(node)) scopeNodes.push(node);
  }

  const cappedScope = scopeNodes.slice(0, MAX_CANDIDATES);
  const labelCache = new Map<
    Element,
    { value: string | null; source: InspectLabelSource | null }
  >();
  const labelInfoOf = (
    el: Element,
  ): { value: string | null; source: InspectLabelSource | null } => {
    const cached = labelCache.get(el);
    if (cached) return cached;
    const info = labelInfoFor(el);
    labelCache.set(el, info);
    return info;
  };

  const elements: InspectElement[] = cappedScope.map((el) => {
    const rect = el.getBoundingClientRect();
    const visibility = analyzeVisibility(el);
    const visible = visibility.visible;
    const viewport = inViewport(rect);
    const covered = visible && viewport ? coveredBy(el, rect) : null;
    const labelInfo = labelInfoOf(el);
    const ref = refFor(el);
    const selector = selectorFor(el);
    const tag = el.tagName.toLowerCase();
    const role = roleFor(el);

    refStore.meta.set(ref, {
      ref,
      selector,
      tag,
      role,
      label: labelInfo.value,
    });

    return {
      ref,
      selector,
      tag,
      kind: kindFor(el),
      role,
      label: labelInfo.value,
      label_source: labelInfo.source,
      text: textFor(el),
      value: valueFor(el),
      placeholder: placeholderFor(el),
      input_type: inputTypeFor(el),
      name: nameFor(el),
      autocomplete: autocompleteFor(el),
      state: stateFor(el),
      visible,
      hidden_reason: visibility.reason,
      pointer_events_none: visibility.pointerEventsNone,
      covered: covered !== null,
      covered_by: covered,
      in_viewport: viewport,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    };
  });

  const needle = normalize(options.text ?? '').toLowerCase();
  const roleFilter = normalize(options.role ?? '').toLowerCase();
  const kindFilter = options.kind ?? null;
  const inputTypeFilter = normalize(options.inputType ?? '').toLowerCase();

  const matched = elements.filter((element) => {
    if (needle) {
      const haystack =
        `${element.label ?? ''} ${element.placeholder ?? ''} ${element.text ?? ''} ${element.name ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (kindFilter && element.kind !== kindFilter) return false;
    if (roleFilter && (element.role ?? '').toLowerCase() !== roleFilter) return false;
    if (inputTypeFilter && (element.input_type ?? '').toLowerCase() !== inputTypeFilter) {
      return false;
    }
    return true;
  });

  const includeHidden = options.includeHidden === true;
  const shown = includeHidden ? matched : matched.filter((element) => element.visible);
  const requestedLimit = Number.isFinite(options.limit) ? Math.floor(options.limit ?? 0) : 0;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));
  const returned = shown.slice(0, limit);
  const hiddenCount = matched.filter((element) => !element.visible).length;
  const coveredCount = matched.filter((element) => element.visible && element.covered).length;

  const roleCounts = new Map<string, { total: number; visible: number }>();
  for (const element of matched) {
    const key = element.role ?? element.tag;
    const entry = roleCounts.get(key) ?? { total: 0, visible: 0 };
    entry.total += 1;
    if (element.visible) entry.visible += 1;
    roleCounts.set(key, entry);
  }
  const role_counts = Array.from(roleCounts, ([role, count]) => ({
    role,
    total: count.total,
    visible: count.visible,
  }))
    .sort((a, b) => b.total - a.total || a.role.localeCompare(b.role))
    .slice(0, ROLE_COUNT_MAX);

  let hash = 5381;
  for (const element of elements) {
    const part = `${element.ref}|${element.selector}|${element.role}|${element.label}|${element.placeholder}|${element.visible}|${element.hidden_reason}|${element.covered}`;
    for (let index = 0; index < part.length; index += 1) {
      hash = ((hash * 33) ^ part.charCodeAt(index)) >>> 0;
    }
  }

  return {
    title: document.title,
    url: location.href,
    scope_total: elements.length,
    total: matched.length,
    returned: returned.length,
    hidden_count: hiddenCount,
    covered_count: coveredCount,
    truncated: shown.length > limit || scopeNodes.length > cappedScope.length,
    scope_miss: false,
    scope_error: null,
    role_counts,
    fingerprint: `${location.href}|${elements.length}:${hash.toString(36)}`,
    scope,
    elements: returned,
  };
}
