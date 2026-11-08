# Pagehand 工程规约

本文件是给后续 Agent / 协作者的硬约束。改动前先读，冲突时以此为准。

## 1. 项目定位

Pagehand（页工）是一个 **BYOK、本地优先** 的浏览器侧边栏 Agent。它替用户完成重复、规则清楚、可以停在提交前的浏览器体力活。

不做的事：

- 不做通用聊天机器人，不提供云端账号体系
- 不自动发送消息、付款、删除或提交表单
- 不把页面内容或密钥上传到 Pagehand 自己的服务器
- 不复制任何 AGPL-3.0 项目的代码，只借鉴公开的产品思路与交互分层

## 2. 运行时边界

- **Agent 只在 `entrypoints/background.ts` 所在的 Service Worker 中运行。** UI 不得直接请求模型。
- 侧边栏与后台只通过 `lib/ipc/protocol.ts` 定义的 Port 消息通信；新增消息必须同时更新 `UiToBg` / `BgToUi`。
- 会话读写只在后台进行：UI 拿到的永远是摘要（`SessionSummary`），正文留在 IndexedDB。
- 工具的 `execute` 在后台运行；需要 DOM 时通过 `chrome.scripting.executeScript` 注入自包含函数，注入函数不得引用模块级变量。
- 页面快照只做只读提取，不执行页面脚本、不读取密码框、不点击。

## 3. 会话与标题

- 标题三个来源分开存：`custom`（用户改名，一旦有值永久优先）、`ai`（模型总结，后续在设置里接入）、`fromPrompt`（首条任务前 20 个字，按码点切）。展示按这个优先级取，回退不需要重算。
- 改名写 `custom`；把名字清空等于取消自定义，自动回退到 `ai` 或 `fromPrompt`。
- 新建会话不落盘，第一条任务跑完才写；改名不刷新 `updatedAt`。
- 落盘只记 presetId / baseUrl / modelId，**绝不写 API Key**。

## 4. 工具规则

- 每个工具必须有：`name`、`label`、面向模型的 `description`（写清触发条件与反例）、TypeBox `parameters`、`execute`。
- 返回双通道：`content` 给模型看，`details` 给 UI 看。失败用 `isError: true` 或抛出，不要只在 `content` 里描述失败。
- 只读工具才允许 `replay: 'safe'`；任何有副作用的工具必须 `replay: 'never'`，并先接入权限门禁。
- 当前白名单在 `lib/tools/index.ts`；`beforeToolCall` 先查白名单，再查门禁，新增工具必须同步登记。

## 5. 门禁与交互

- 需要执行前确认的工具，只往 `lib/agent/permission-gate.ts` 的 `TOOL_GATES` 注册一条 gate；门禁本体不改。
- 只读且指向用户当前页面的工具不得加门禁——那是骚扰，不是安全。授权粒度固定为「站点 + 工具」，不给全局开关。
- 四种结局必须各自给模型不同的理由文案：`once` 放行不记录、`always` 放行并记录授权、`denied` 拦住、`dismissed` 拦住（用户没理卡片直接发了新消息）。拦住时同时 `terminate: true`，别让它换条路绕过。
- 提问和授权共用 `InteractionBridge` 的挂起机制，卡片是一条 `ChatItem`（`kind: 'interaction'`），跟着会话落盘。
- 交互卡片不进对话流：由 `PendingDeck` 绝对定位浮在输入框正上方、与输入框同宽，一次只露一张。对话流里只保留对应的工具步骤卡。
- 任何挂起的卡片都必须响应 `AbortSignal`；新增退出路径时先保证卡片不会永久停在 pending。
- 恢复历史必须先过 `lib/sessions/repair.ts`：悬空的 `toolCall` 要补 `toolResult`，否则下一轮请求会被模型端拒绝。

## 6. 密钥与隐私

- API Key 只存 `chrome.storage.local`（`lib/config/storage.ts`），不写日志、不进 trace、不发往第三方。
- 不在客户端内置任何厂商密钥或代理端点。
- 新增权限（尤其 `host_permissions`、`<all_urls>`）必须先说明理由，不允许顺手扩大。

## 7. 代码与测试

- TypeScript strict；格式与 Lint 统一交给 Biome（2 空格、单引号、分号、行宽 100），提交前必须通过 `pnpm check`（Biome + 类型 + 测试 + 构建）。
- pre-commit 由 husky + lint-staged 对暂存文件自动跑 `biome check --write`；不要用 `--no-verify` 绕过。
- 纯函数优先（快照格式化、配置归一化、工具摘要），配套 Vitest 测试。
- 涉及 Chrome API 的逻辑与 UI 解耦，便于用 `wxt/testing/fake-browser` 测试。
- UI 文案用简体中文，标识符用英文；不写无信息量的注释。
- 一个提交只做一件可 review 的事：加管道 → 接线 → 删旧 → 私有化。

## 8. UI 开发规范

- 任何 UI / 样式 / 组件改动前，先完整阅读 `docs/ui-guidelines.md`，并按其硬规则执行。
- 通用组件统一放 `components/ui`；业务代码不得重复实现 button / input / select / label 等基础控件。
- 条件类名一律通过 `lib/utils.ts` 的 `cn()` 合并，禁止字符串拼接 className。

## 9. 迭代纪律
- 不确定根因时先加可观测性，不猜。
- 一次只开放一个能力；先把单工具闭环跑通，再谈横向工具集。
- 上下文压缩、循环上限、花销上限属于运行时护栏，不得为了“先跑通”而省略。
