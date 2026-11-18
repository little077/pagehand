# Pagehand 工程规约

本文件是给后续 Agent / 协作者的硬约束。改动前先读，冲突时以此为准。

## 1. 项目定位

Pagehand（页工）是一个 **BYOK、本地优先** 的浏览器侧边栏**通用 Agent**：在用户已经登录的浏览器里读页面、动手操作、把用户交代的任务做完。能力范围限于浏览器内，不做操作系统级控制。

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
- **保活由后台自持**（`lib/agent/keepalive.ts`），不得依赖侧边栏心跳：面板关掉时这一轮也要跑完。只有循环真的在干活才保活，停下来等人回答时释放。
- 侧边栏重连不等于 Service Worker 重启：`restore()` 每个 SW 生命周期只读一次磁盘，重连直接回内存里的 live 快照，不能把正在跑的那一轮盖掉。

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

**工具设计检查表**（新增或改动工具前逐条回答，答不上来说明需求没想清）：

1. 输出被谁消费？消费方需要哪些字段？没有下游需求的设计不进代码。
2. 在哪些真实页面上会失败？至少列 5 种，写清失败时模型会怎么误判。
3. 每个参数对应哪条失败场景？对应不上的删掉。
4. 长内容怎么处理：截断、写盘、还是拒绝？三选一，不能"先不管"。
5. 失败时模型看到什么文案？它据此能做出什么不同的下一步？
6. 有没有同类产品的同名工具？它有哪些参数、我为什么不做？

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

## 10. 目录放置规则

目标：每个新文件有唯一合理的位置，review 时能一眼看出边界；不为了“看起来整齐”提前建空目录。

### 10.1 分层职责

| 目录 | 放什么 | 不放什么 |
| --- | --- | --- |
| `entrypoints/background.ts` | 扩展后台接线、模型请求、Port 消息、保活 | UI 组件、页面注入函数 |
| `entrypoints/sidepanel/` | 侧边栏入口与业务组件 | 工具执行、模型请求 |
| `components/ui/` | 通用基础控件（button/input/select 等） | 业务逻辑、领域类型 |
| `lib/agent/` | 循环、会话生命周期、交互挂起、门禁、提示词、模型构造 | 页面 DOM 注入函数 |
| `lib/config/` | 模型预设、模型列表、配置存储与归一化 | 会话数据、工具实现 |
| `lib/ipc/` | 跨上下文消息协议与类型 | 具体执行逻辑 |
| `lib/page/` | 注入页面执行的自包含函数、页面侧纯计算 | AgentTool 定义、UI |
| `lib/sessions/` | 会话记录、IndexedDB、修复、附件编解码 | 循环控制、模型请求 |
| `lib/tools/` | AgentTool 定义、模型侧格式化、工具级缓存/状态 | 页面注入函数本体、UI 组件 |
| `tests/` | 测试与测试夹具，按域分目录 | 生产逻辑 |

Import 方向固定：

- `entrypoints` 可以引用 `lib/` 和 `components/`；
- `components/` 只引用 `components/ui`、`lib/utils` 和纯类型；
- `lib/tools` 可以引用 `lib/page`、`lib/agent` 的类型、`lib/config`；
- `lib/page` 不得引用 `lib/tools` 或 UI；页面注入函数不得引用模块级变量；
- UI 不得直接请求模型，也不能直接执行工具。

### 10.2 平铺还是文件夹

默认平铺。满足下面条件才建文件夹：

1. 同一个概念有 **≥3 个高度内聚的文件**；
2. 它们共用同一套命名和测试；
3. 文件夹名就是能力名，不是 `misc` / `helpers` / `common`。

不建目录的情况：

- 只有一个文件的概念，哪怕名字很长也先平铺；
- 为“以后可能会有”的功能提前建空目录；
- 为了减少单文件行数而把自包含注入函数拆成跨模块引用。

当前 `lib/tools` 平铺是**有意保留**的，不要在文件数还少时做大搬家。等 `lib/tools` 接近 24 个文件，或新增一个大工具（如 `act`）带来 ≥3 个内聚文件时，再做一次机械拆分。可拆的能力名例如 `read/`、`inspect/`、`capture/`、`interaction/`；跨工具的 `errors.ts`、`runtime.ts`、`tool-images.ts` 继续留在根，或达到阈值后再收进 `shared/`。

### 10.3 工具文件命名

- `<tool>.ts`：工具定义、参数、execute；
- `<tool>-format.ts`：给模型/UI 的纯格式化；
- `<tool>-cache.ts`：工具级缓存或去重状态；
- 页面注入的共享函数放 `lib/page/<domain>.ts`，不要放进 `lib/tools`；
- 类型只服务单个工具时跟工具走；跨上下文协议类型放 `lib/ipc/protocol.ts`。

不要在同一个文件里同时塞：TypeBox 参数 + 大段 HTML 解析 + 页面注入 + React 渲染。按职责拆，但保持注入函数自包含。

### 10.4 页面注入函数

`chrome.scripting.executeScript` 注入的函数必须自包含：

- 可以引用浏览器全局（`document`、`window`、`CSS` 等）；
- 不能引用模块级常量、导入的函数或类实例；
- type-only import 可以保留（编译后消失）；
- 不要为了行数把它拆成多个模块；需要复用纯逻辑时，通过参数传入或在函数内部复制最小实现；
- 对应的类型和纯计算可以单独放 `lib/page`，但注入函数本体保持单文件可序列化。

### 10.5 测试目录

测试镜像源码域，不按“测试类型”分：

```
tests/
  agent/
  capture/
  config/
  ipc/
  sessions/
  sidepanel/
    runs/
  tools/
    inspect/
    screenshot/
```

- 新测试放进对应域；没有对应域时先建域目录；
- 旧平铺测试在被改动时再迁移，不做一次性大搬家；
- 夹具和 helper 放在同域目录（如 `tests/tools/inspect/support.ts`），不要建全局 `tests/utils.ts`；
- 一个测试文件只测一个概念；跨模块集成测试放 `tests/integration/`，不要混进单元测试目录。

### 10.6 禁止万能文件

- 不建 `utils.ts` / `constants.ts` / `helpers.ts` 当垃圾桶；领域常量跟着领域走；
- `lib/utils.ts` 只放真正跨域的纯工具（如 `cn()`）；
- 一个概念只保留一种类型；不要为“看起来完整”拆出多个近似类型；
- 新增导出前先确认有跨文件调用方；没有调用方的导出要收回。

### 10.7 文件大小

- 300 行是信号，500–600 行要认真评估；
- 按“职责缝”拆，不按行数机械切：会话生命周期 / 事件处理 / 持久化 / 格式化；
- 真正高内聚的长文件可以保留；短文件混杂多个职责仍然要拆；
- 页面注入函数因为序列化约束，可以例外地保持较长。

### 10.8 新增文件检查清单

1. 它属于哪一层？现有目录里有没有同类概念？
2. 这是该概念的第几个文件？不到 3 个，先平铺。
3. 它会不会引入反向依赖（UI → agent/tools、lib/page → tools、页面注入 → 模块变量）？
4. 它是注入函数吗？能否单独序列化？
5. 测试应该放哪个域？夹具和它同域吗？
6. 移动/重命名后，是否更新了所有 import、测试和文档，并跑过 `pnpm check`？

拿不准时先问，不要为了“整理”新建顶层目录。
