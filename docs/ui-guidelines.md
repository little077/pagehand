# Pagehand UI 开发规范

本文件是 UI 相关改动的硬约束。**任何涉及界面、样式、组件的任务开始前，先完整读一遍**；与
`AGENTS.md` 冲突时以 `AGENTS.md` 为准，但本文件里的组件规则默认不可绕过。

参考实现：`entrypoints/sidepanel/components/SettingsSheet.tsx`（模型设置页）。

## 1. 技术栈与目录

- React 19 + TypeScript strict + Tailwind CSS 4。
- shadcn/ui（new-york 风格，非 RSC），底层使用 Radix Primitives 与 lucide-react 图标。
- 通用组件：`components/ui/*`，通过 `@/components/ui/<name>` 引入。
- 业务组件：`entrypoints/sidepanel/components/*`，只负责页面逻辑与组合，不重复实现基础控件。
- 类名合并工具：`lib/utils.ts` 的 `cn()`（`clsx` + `tailwind-merge`）。
- 配置：根目录 `components.json`，样式入口 `entrypoints/sidepanel/styles.css`。

## 2. 硬规则

1. **必须使用通用组件。** 业务代码里不允许直接写裸 `<button>`、`<input>`、`<select>`、
   `<textarea>`、`<label>`。需要新控件时，先在 `components/ui` 里补组件，再在业务里使用。
2. **条件类名必须用 `cn()`。** 禁止 `` className={`base ${active ? 'x' : 'y'}`} `` 或字符串拼接。
   静态类名可以直接写字符串。
3. **只使用主题色。** 颜色来自 `styles.css` 的 `@theme`：`bg-app`、`bg-surface`、
   `bg-surface-soft`、`text-ink`、`text-ink-soft`、`text-ink-faint`、`border-line`、
   `border-line-strong`、`brand`、`success`、`warning`、`danger`。禁止新增十六进制 / RGB
   颜色或 Tailwind 默认色板（`slate-*`、`blue-*` 等）。一次性阴影可以用任意值，但要与现有
   视觉一致。
4. **尺寸基准是侧边栏 380px。** 控件默认高度 `h-10`、圆角 `rounded-xl`、正文
   `text-[12px]`，小字 `text-[10.5px]` / `text-[9.5px]`，纵向间距 `space-y-3.5`。不要为了
   桌面宽度做布局，侧栏才是主场景。
5. **新增 shadcn 组件走标准流程。** 优先
   `pnpm dlx shadcn@latest add <component>`，生成到 `components/ui`；随后把默认的
   `bg-background` / `text-foreground` / `ring-ring` 等映射为本项目 token。不要引入第二套
   UI 库，也不要保留 shadcn 默认的 zinc/slate 配色。
6. **React 实践。**
   - 函数组件 + 显式 props 类型；不使用 `React.FC`。
   - 不用 `useEffect` 派生本可在渲染期算出的状态。
   - 表单控件保持受控（`value` + `onChange` / `onValueChange`）。
   - 列表必须有稳定的 `key`，不要用数组下标。
   - 按钮默认 `type="button"`，只有提交按钮用 `type="submit"`。
   - 交互控件必须有可读名称：`aria-label` 或关联的 `Label`。
   - 加载态禁用重复提交；错误用 `aria-invalid` 与可见文案同时表达。
7. **职责边界。** UI 不直接请求模型、不读 `chrome.storage`；跨进程一律走
   `lib/ipc/protocol.ts` 的 Port 消息，网络请求在后台 Service Worker 完成。
8. **不做过早抽象。** 只有确实被复用或属于基础控件的才封装；一次性布局直接写在业务组件里。

## 3. 当前组件清单

| 组件 | 入口 | 说明 |
| --- | --- | --- |
| `Button` | `@/components/ui/button` | `variant`: default / destructive / outline / secondary / ghost / link；`size`: default / sm / lg / icon / icon-sm；支持 `asChild` |
| `Input` | `@/components/ui/input` | 单行输入框 |
| `Label` | `@/components/ui/label` | Radix Label，配合 `htmlFor` |
| `Select` | `@/components/ui/select` | 受控下拉，含 Trigger / Content / Item / Value / Group / Label / Separator |
| `InputGroup` | `@/components/ui/input-group` | 输入框内嵌按钮/前后缀，含 `InputGroupInput`、`InputGroupAddon`、`InputGroupButton` |

需要新组件时先查 shadcn 官方 registry 是否已有，再决定是否自建。

## 4. 常见写法

条件类名：

```tsx
<Button
  variant={active ? 'secondary' : 'outline'}
  className={cn('h-auto min-w-0 flex-col items-start', active && 'border-brand/45 bg-brand/[0.07]')}
/>
```

输入框内嵌操作按钮：

```tsx
<InputGroup>
  <InputGroupInput id="ph-api-key" value={apiKey} onChange={...} />
  <InputGroupAddon>
    <InputGroupButton size="icon-sm" aria-label="显示密钥">
      <Eye size={14} />
    </InputGroupButton>
    <InputGroupButton onClick={fetchModels} disabled={loading}>
      <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
      获取模型
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```

受控下拉：

```tsx
<Select value={modelId} onValueChange={setModelId} disabled={options.length === 0}>
  <SelectTrigger id="ph-model-id" aria-label="选择模型">
    <SelectValue placeholder="暂无模型可选" />
  </SelectTrigger>
  <SelectContent>
    {options.map((id) => (
      <SelectItem key={id} value={id}>
        {id}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## 5. 验收

- 提交前必须通过 `pnpm check`（Biome + 类型 + Vitest + 构建）。
- 涉及界面的改动必须在 380px 宽度下真实渲染一次：可临时新增 preview 入口，用
  headless Chrome 截图检查，确认无误后**删除临时入口与产物**再提交。
- 检查加载态、错误态、空列表态和键盘可达性（Tab / Enter / Escape）。
- UI 文案用简体中文；标识符用英文。

## 6. 禁止事项

- 禁止复制 AGPL 项目的代码或样式文件。
- 禁止在业务组件里硬编码颜色、字号体系之外的尺寸。
- 禁止绕过 `cn()` 用字符串拼类名。
- 禁止在 UI 层直接 `fetch` 模型接口或读取密钥存储。
- 禁止为了“以后可能用到”新增组件或抽象。
