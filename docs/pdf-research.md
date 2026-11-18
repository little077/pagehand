# PDF 能力技术调研

> 日期：2026-11-18
> 状态：调研完成；P0 已实施，见 `docs/iterations/v0.6-pdf-plan.md` 与 `v0.6-pdf.md`
> 范围：MV3 浏览器扩展里读取 PDF 的可行路径、边界与 Pagehand 的取舍

## 1. 结论

Pagehand 可以在不引入文件系统的前提下支持 PDF 读取：

```text
打开 PDF 标签页
  → 取标签页 URL
  → fetch PDF 字节
  → offscreen document 里的 pdf.js 抽文本
  → info / read / search 返回给模型
```

不需要新增 manifest 权限；Pagehand 已有 `offscreen` 和 `<all_urls>`。

## 2. Pagehand 现状

- 现有 7 个工具：`read_page`、`read_tab`、`list_tabs`、`read_selection`、`inspect`、`screenshot`、`ask_user`；
- 没有 PDF 工具；
- `lib/page/reader.ts` 的 `isPdfUrl()` 命中 `.pdf` 后直接报“当前版本不能读取 PDF”；
- 系统提示词明确告诉模型 PDF 读不了。

所以接入 PDF 不是单纯加一个工具文件，还要改读取分流和提示词。

## 3. 为什么不能靠页面注入读 PDF

Chrome 内置 PDF 查看器把页面内容画在 canvas 上，DOM 里没有正文文本。

用 `chrome.scripting.executeScript` 注入后：

- `document.body.innerText` 基本为空；
- 找不到段落、标题、表格；
- Readability / Turndown 没有可转换的 HTML。

因此 `read_page` 的 DOM 路径对 PDF 天然无效。正确的数据源是 **PDF 字节本身**，不是渲染后的页面。

## 4. 可选技术路线

| 路线 | 可行性 | 问题 |
| --- | --- | --- |
| 注入页面读 DOM | 不可行 | PDF 正文在 canvas |
| 读取 Chrome PDF 查看器内部页面 | 不可行 | 扩展无法注入，内部结构也不是正文 |
| 把 PDF 上传到远程解析服务 | 可行但不合适 | 隐私、依赖外部服务、需要上传文档 |
| 在 Service Worker 里跑 pdf.js | 不可行 | pdf.js 需要 DOM API |
| **fetch 字节 + offscreen pdf.js** | **可行** | 需要 offscreen、worker、文件上限 |

选择最后一条。

## 5. 关键技术约束

### 5.1 pdf.js 必须在有 DOM 的上下文

pdf.js 运行需要 `DOMMatrix`、`OffscreenCanvas` 等 API，MV3 Service Worker 没有。放 offscreen document 或普通扩展页面。

### 5.2 需要能重新拿到 PDF 字节

- `http(s)`：扩展有 host 权限时可以 fetch，并带上 cookies；
- `file://`：需要用户开启“允许访问文件网址”；
- 页面作用域 `blob:`：offscreen 无法直接 fetch；
- `data:`：可以尝试，但不是 P0 重点；
- 需要登录态的 PDF：依赖扩展 fetch 时的 cookie / 站点权限。

### 5.3 URL 后缀不可靠

- 有的 PDF URL 没有 `.pdf` 后缀；
- 有的 `.pdf` 地址返回登录页或 HTML；
- 网页里嵌入的 PDF，标签页 URL 是 HTML。

所以后缀只能做提示，最终要看响应头和文件魔数。

### 5.4 扫描件没有文字层

如果 PDF 是图片扫描件，`getTextContent()` 返回空。这不是解析失败，而是没有可抽取的文字。需要：

- 明确告诉模型“可能是扫描件”；
- 让模型改用当前页截图 + 视觉模型；
- 不在 P0 里引入 OCR。

## 6. 建议的 P0 能力

| 能力 | 用户价值 | 实现 |
| --- | --- | --- |
| `info` | 页数、标题、作者、目录 | `getMetadata()` + `getOutline()` |
| `read` | 回答问题、总结、按页读 | `getTextContent()` + 页范围 |
| `search` | 快速定位条款/关键词 | 页文本 + 字面量/正则匹配 |

用户可以直接说：

- “这篇论文讲了什么”
- “违约金在第几页”
- “只读第 3-5 页”
- “这个 PDF 多少页、谁写的”
- “扫描版讲了什么”（走截图兜底）

## 7. 与 read_page 的分工

| | read_page | pdf |
| --- | --- | --- |
| 数据源 | 页面 DOM | PDF 字节 |
| 引擎 | 注入 + Readability | pdf.js + offscreen |
| 输出 | Markdown / HTML / 文本 | 页文本 / 元信息 / 搜索命中 |
| 适合 | 网页文章 | 论文、合同、说明书 |

`read_page` 命中 PDF 时应返回“改用 pdf”的可执行提示，而不是硬错误。

## 8. 主要风险

| 风险 | 处理 |
| --- | --- |
| pdf.js 体积 | 动态 import，worker 单独 asset |
| 大文件 | 文件大小上限 + 文档缓存上限 + 超时 |
| 扫描件 | 提示截图 + 视觉模型 |
| 双栏/表格错序 | 在工具描述里写清限制，建议指定页或截图 |
| PDF 文本注入 | 当作不可信资料，不执行里面指令 |
| 本地文件权限 | 前置检查 + 设置页指引 |
| 内嵌/blob PDF | P1，不在 P0 |

## 9. 不需要文件系统

P0 的读取链路只需要：

```text
URL → 字节 → pdf.js → 文本
```

文件系统只影响：

- 把全文保存到文件；
- 浏览本地 PDF 文件；
- PDF 预览器；
- 持久化索引。

这些都是后续能力，不是 PDF 读取的前置条件。

## 10. 下一步

- P0 方案：`docs/iterations/v0.6-pdf-plan.md`
- 技术细节与后续扩展点：`docs/iterations/v0.6-pdf.md`
