# Pagehand 工程规约

本文件是给后续 Agent / 协作者的硬约束。改动前先读，冲突时以此为准。

## 1. 项目定位

Pagehand（页工）是一个 **BYOK、本地优先** 的浏览器侧边栏 Agent。它替用户完成重复、规则清楚、可以停在提交前的浏览器体力活。

不做的事：

- 不做通用聊天机器人，不提供云端账号体系
- 不自动发送消息、付款、删除或提交表单
- 不把页面内容或密钥上传到 Pagehand 自己的服务器
- 不复制 Cebian 的代码（其许可证为 AGPL-3.0）

## 2. 运行时边界

- **Agent 只在 `entrypoints/background.ts` 所在的 Service Worker 中运行。** UI 不得直接请求模型。
- 侧边栏与后台只通过 `lib/ipc/protocol.ts` 定义的 Port 消息通信；新增消息必须同时更新 `UiToBg` / `BgToUi`。
- 工具的 `execute` 在后台运行；需要 DOM 时通过 `chrome.scripting.executeScript` 注入自包含函数，注入函数不得引用模块级变量。
- 页面快照只做只读提取，不执行页面脚本、不读取密码框、不点击。

## 3. 工具规则

- 每个工具必须有：`name`、`label`、面向模型的 `description`（写清触发条件与反例）、TypeBox `parameters`、`execute`。
- 返回双通道：`content` 给模型看，`details` 给 UI 看。失败用 `isError: true` 或抛出，不要只在 `content` 里描述失败。
- 只读工具才允许 `replay: 'safe'`；任何有副作用的工具必须 `replay: 'never'`，并先接入权限门禁。
- 当前白名单在 `lib/tools/index.ts`；`beforeToolCall` 会拒绝白名单外的工具，新增工具必须同步登记。

## 4. 密钥与隐私

- API Key 只存 `chrome.storage.local`（`lib/config/storage.ts`），不写日志、不进 trace、不发往第三方。
- 不在客户端内置任何厂商密钥或代理端点。
- 新增权限（尤其 `host_permissions`、`<all_urls>`）必须先说明理由，不允许顺手扩大。

## 5. 代码与测试

- TypeScript strict；格式与 Lint 统一交给 Biome（2 空格、单引号、分号、行宽 100），提交前必须通过 `pnpm check`（Biome + 类型 + 测试 + 构建）。
- pre-commit 由 husky + lint-staged 对暂存文件自动跑 `biome check --write`；不要用 `--no-verify` 绕过。
- 纯函数优先（快照格式化、配置归一化、工具摘要），配套 Vitest 测试。
- 涉及 Chrome API 的逻辑与 UI 解耦，便于用 `wxt/testing/fake-browser` 测试。
- UI 文案用简体中文，标识符用英文；不写无信息量的注释。
- 一个提交只做一件可 review 的事：加管道 → 接线 → 删旧 → 私有化。

## 6. 迭代纪律

- 不确定根因时先加可观测性，不猜。
- 一次只开放一个能力；先把单工具闭环跑通，再谈横向工具集。
- 上下文压缩、循环上限、花销上限属于运行时护栏，不得为了“先跑通”而省略。
