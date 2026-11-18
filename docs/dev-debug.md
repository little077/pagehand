# Dev Debug 页面（debug 模式）

> 只在 `pnpm dev:debug` 启动时出现；普通 `pnpm dev` 不显示入口，生产构建也不显示。

## 启动

```bash
pnpm dev:debug
```

等价于 `wxt --mode debug`。入口要求 `DEV && MODE === 'debug'`。

## Debug ENV 模型配置

为了方便开发每次重开浏览器不用在页面上重新填模型，`dev:debug` 会优先读取本地 ENV 配置。

1. 复制示例文件：

```bash
cp .env.example .env.debug.local
```

2. 填写：

```dotenv
VITE_DEBUG_MODEL_BASE_URL=https://api.example.com/v1
VITE_DEBUG_MODEL_API_KEY=sk-your-key
VITE_DEBUG_MODEL_ID=gpt-4o-mini
VITE_DEBUG_MODEL_SUPPORTS_IMAGES=false
```

3. 重新启动 `pnpm dev:debug`。

规则：

- **三要素齐全**（Base URL、API Key、模型 ID）才使用 ENV；
- 缺任意一项（尤其 Key）→ 回退到页面上保存的配置；
- `SUPPORTS_IMAGES=true/1/yes/on` 视为多模态，其他视为纯文本；
- Debug 页面会显示「配置：ENV / 页面」，方便确认当前用的是哪一份；
- ENV 配置只在 `wxt --mode debug` 的 **dev server** 中注入；生产构建和普通 `pnpm dev` 不包含这份密钥；
- ENV 配置不写入 `chrome.storage.local`；页面保存的配置仍在，ENV 优先，重开浏览器后继续用 ENV；
- 在 Debug 模式下如果手动在设置页保存，会覆盖当前内存配置，但下次重启仍以 ENV 为准。

`.env*` 已被 gitignore，`.env.example` 例外保留；不要把真实 Key 提交到仓库。

## 入口

侧边栏顶部居中，黑色刘海 + 红色 `debug 模式`：

- 点击后在**侧边栏内部**切到 debug 页面，不新开浏览器标签页；
- 顶部左侧「返回聊天」，右侧 `DEV ONLY`；
- 当前没有注册调试模块，导航栏不显示，内容区是「还没有接入调试模块」的占位。

## 路由

| 路由 | 模块 | 状态 |
| --- | --- | --- |
| `#/debug` | 总览 | 已接入 |
| `#/debug/<id>` | 注册后才有 | 待接入 |

`#/debug`、未知模块都会回退到总览（`overview`）。

## 加模块

1. 在 `lib/debug/routes.ts` 的 `DEBUG_ROUTES` 里追加 `{ id, title, description }`；
2. 顶部导航会自动多一个标签；
3. 在 `DebugView.tsx` 里按 `route.id` 渲染面板；
4. 模块多了再考虑把顶部标签换成侧栏。

## 实现位置

- 刘海：`entrypoints/sidepanel/components/DebugNotch.tsx`
- Debug 页面：`entrypoints/sidepanel/components/DebugView.tsx`
- 路由：`lib/debug/routes.ts`
- ENV 配置：`.env.example`、`lib/config/debug-env.ts`、`wxt.config.ts`
- 测试：`tests/sidepanel/debug-routes.test.ts`、`tests/config/debug-env.test.ts`

## 边界

- 只有 `dev:debug` 显示刘海；
- Debug 页面在侧边栏内部，不是新标签页；
- 「返回聊天」清掉 hash，回到原聊天状态；
- 打开 Debug 页面不会暂停 Agent；
- API Key 不在页面里展示。
