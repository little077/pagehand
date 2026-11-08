# Pagehand（页工）

把浏览器里重复、规则清楚的体力活交给 Agent。

Pagehand 是一个 Chrome MV3 侧边栏扩展：用户自带模型密钥（BYOK），Agent 在用户已经登录的浏览器里读取页面、理解内容，并把结果整理成可用的文字。

> 当前版本是 **v0.1 骨架**：只有读取能力，不会点击、填写或提交。所有有副作用的操作都由用户亲手完成。

## 现在能做什么

- 侧边栏对话，流式输出，可随时停止
- 四个只读工具：`read_page` 读当前页、`list_tabs` 列标签页、`read_tab` 读指定标签页、`read_selection` 读选中文本
- `ask_user`：缺信息时卡片直接盖住输入框问你，一屏一题，`↑↓` / 数字键 / Enter 选，也能直接写；右上角收起就把输入框还给你
- 执行前授权：读取你正在看的页面之外的标签页时先在同一张卡片里征求同意，可选「仅本次」或「始终允许该站点」
- 步骤时间线：每次工具调用有序号、状态、耗时和结果摘要，详情可展开
- 历史会话与多会话列表：本机 IndexedDB 存储，可打开、改名、删除
- 「运行记录」：查看每轮收到的任务、工具调用与错误
- BYOK：DeepSeek / Kimi / 智谱 / 通义 / OpenAI / 任意 OpenAI 兼容端点
- 密钥只保存在本机 `chrome.storage.local`，没有服务器、没有遥测

会话标题按优先级取：用户改过的名字 > 模型总结的标题 > 首条任务的前 20 个字。

## 快速开始

```bash
git clone https://github.com/little077/pagehand.git
cd pagehand
pnpm install
pnpm dev
```

然后：

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 点「加载已解压的扩展程序」，选择 `.output/chrome-mv3-dev`
3. 打开任意网页，点击工具栏里的 Pagehand 图标，侧边栏会打开
4. 点右上角设置，填入 Base URL、模型 ID 和 API Key
5. 在首页点「总结这个页面」，或直接输入问题

## 开发命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发模式（HMR） |
| `pnpm compile` | TypeScript 类型检查 |
| `pnpm lint` | Biome 静态检查 |
| `pnpm format` | Biome 自动格式化 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm build` | 生产构建到 `.output/chrome-mv3` |
| `pnpm check` | Biome + 类型检查 + 测试 + 构建（CI 同款） |

提交时 husky 会通过 lint-staged 自动对暂存文件跑 Biome；规则配置在 `biome.json`。

## 目录结构

```
entrypoints/
  background.ts          后台 Service Worker：唯一 Agent 运行时
  sidepanel/             侧边栏 UI（React）
lib/
  agent/                 Agent 构造、系统提示词、模型适配
  config/                服务商预设与本地密钥存储
  ipc/                   侧边栏 ↔ 后台的 Port 消息协议
  page/                  页面快照提取（注入到目标页执行）
  sessions/              会话记录、标题规则与 IndexedDB 存储
  tools/                 工具注册
tests/                   单元测试
```

原则：**Agent 只跑在后台**，UI 只收发消息，不直接请求模型；工具的能力边界写在后台的权限门禁里。

## 路线图

详细拆解（工具、场景、权限、验收）见 [docs/agent-roadmap.md](./docs/agent-roadmap.md)。

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 骨架、BYOK、流式对话、单工具闭环 | ✅ |
| 1 | 三个只读工具（`list_tabs` / `read_tab` / `read_selection`）+ 步骤时间线 | ✅ |
| 2 | 会话持久化 + 多会话 | ✅ |
| 3 | 权限门禁 + `ask_user` | ✅ |
| 4 | 写操作 `inspect` / `click` / `fill` / `scroll` | 未开始 |
| 5 | 上下文治理 | 未开始 |
| 6 | Skill / 模板 / 导出 | 未开始 |

单轮工具循环上限已从 4 个回合提到 8 个，用来容纳「列标签 → 读多页 → 回答」这类任务。

## 安全与隐私

- 权限：`sidePanel`、`storage`、`activeTab`、`scripting`；读取网页正文还需要 `host_permissions`，当前基线是 `<all_urls>`。
- 扩展只在你发起任务时读取你点名的页面，不在后台扫描、遍历或定时抓取网页；不读取密码框。
- 读取「你正在看的页面之外」的标签页会先弹卡片征求同意。授权按 **站点 + 工具** 记录（如 `https://a.com` + `read_tab`），不是全局开关；拒绝或没回应都不会执行。
- 授权记录只存在本机 `chrome.storage.local`，清除浏览器数据即撤销。
- 历史会话存在本机浏览器 IndexedDB 里，只记模型标识（服务商 / Base URL / 模型 ID），**不记 API Key**。清除浏览器数据即清除历史。
- 不上传页面内容到 Pagehand 服务器；页面文本只发给用户自己配置的模型端点。
- 不记录 API Key 到日志；密钥仅存在本机浏览器存储中。
- 当前没有写操作工具。任何新增写操作必须先注册到门禁并经过用户确认。

## License

[MIT](./LICENSE)
