# 拓展程序（插件）开发指南

本文档介绍 Trinity Blog Framework 插件系统的完整开发流程：包结构、服务端沙箱 API、前端
渲染 API、扩展点、存储、安全模型与调试方法。

> 阅读前建议先看 [`README.md`](../README.md) 的「插件系统」一节了解概览。

---

## 目录

1. [核心概念](#核心概念)
2. [快速开始：最小插件](#快速开始最小插件)
3. [插件包结构](#插件包结构)
4. [`plugin.json` 字段](#pluginjson-字段)
5. [服务端 `app.js`（沙箱 API）](#服务端-appjs沙箱-api)
6. [前端 `ui.ux` / `ui.js`](#前端-uiux--uijs)
7. [扩展点详解](#扩展点详解)
8. [存储](#存储)
9. [权限与安全模型](#权限与安全模型)
10. [调试](#调试)
11. [打包与安装](#打包与安装)
12. [完整示例：便签插件](#完整示例便签插件)
13. [API 速查](#api-速查)

---

## 核心概念

- 插件是一个 **ZIP 包**，解压后是一堆文件。
- 服务端代码 `app.js` 在 **Node `vm` 沙箱**中执行，通过全局对象 `plugin` 注册能力和读写存储。
- 前端由两部分组成：`ui.ux`（HTML 模板）与 `ui.js`（ES 模块，导出 `mount(ctx)`），渲染在独立的
  **shadow DOM** 中，因此不会污染站点样式，同时自动继承站点的 CSS 变量（跟随主题 / 动态取色）。
- 插件是**按用户安装**的：每个用户拥有自己的插件目录与存储，互不影响。

> ⚠️ 只有**管理员**可以导入、启用、以及对访客公开插件。普通用户之间的插件完全隔离。

---

## 快速开始：最小插件

创建如下目录并打包为 `hello-plugin.zip`（ZIP 内可以有一个顶层文件夹，也可以直接是文件）：

```
hello-plugin/
├── plugin.json
└── app.js
```

`plugin.json`

```json
{
  "id": "hello-plugin",
  "name": "Hello 插件",
  "version": "1.0.0",
  "description": "最小示例",
  "author": "you"
}
```

`app.js`

```js
plugin.log('hello from', plugin.id)
plugin.registerRoute('hi', (req) => ({ message: 'hi', authed: req.authed }))
```

打包：

```bash
zip -r hello-plugin.zip hello-plugin
```

在 **用户设置 → 拓展程序 → 导入插件包（.zip）** 导入，然后打开「启用」开关。插件即可通过
`GET /api/plugins/hello-plugin/call/hi` 访问。

---

## 插件包结构

```
my-plugin/
├── plugin.json     # 必需：元信息与声明的权限
├── app.js          # 必需：服务端主代码（沙箱执行）
├── ui.ux           # 可选：前端 HTML 模板（渲染进 shadow root，可含 <style>）
├── ui.js           # 可选：前端逻辑（ES 模块，导出 mount(ctx)）
└── sources/        # 可选：静态资源（图片等），通过 /api/plugins/<id>/asset/<path> 访问
```

约束：

- `plugin.json` 中的 `id` 必须匹配 `^[a-z0-9][a-z0-9-]*$`（小写字母、数字、连字符）。
- 缺少 `plugin.json` 或 `app.js` 时插件会进入「加载失败」状态并在管理面板显示错误。
- 包内路径不允许包含 `..`。

---

## `plugin.json` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 唯一标识，`^[a-z0-9][a-z0-9-]*$` |
| `name` | string | ✅ | 显示名称 |
| `version` | string |  | 语义化版本，建议每次改动都递增 |
| `description` | string |  | 简介 |
| `author` | string |  | 作者 |
| `permissions` | string[] |  | 需要的敏感能力（见下），管理员逐项授予后才可用 |
| `minSdkVersion` | string |  | 要求的最低框架 SDK 版本（semver）。站点 SDK 低于该值时**拒绝安装/加载** |
| `capabilities` | object |  | 能力声明（信息性，供管理面板展示） |

> **SDK 版本**：框架当前 SDK 版本为 `server/src/plugins.js` 导出的 `SDK_VERSION`（当前 `1.0.0`）。
> 插件用 `minSdkVersion` 声明所需的最低版本；安装（`inspect`/`import`）与运行时加载都会校验，
> 不满足时给出「需要 SDK ≥ x，当前 y」的提示并拒绝。

> **更新**：导入与已安装插件**同 `id`** 的包即视为**更新**——安装确认弹窗会显示版本变化
> （`v旧 → v新`）与「更新」标记，确认后覆盖其代码（存储与启停状态保留）。

可用权限：

| 权限 | 授予的能力 |
|---|---|
| `storage` | 服务端 `plugin.storage.*`（按用户私有）与 `plugin.shared.*`（站点级共享） |
| `net:fetch` | 服务端 `plugin.fetch()` 发起外部 HTTP(S) 请求 |
| `token` | 服务端 `plugin.token`（管理员为该插件填写的访问令牌） |
| `posts:read` | 服务端 `plugin.getPosts()` 读取该用户的帖子 |
| `moments:read` | 服务端 `plugin.getMoments()` 读取该用户的动态 |
| `settings:read` | 服务端 `plugin.getSiteSettings()` / `plugin.getProfile()` |

---

## 服务端 `app.js`（沙箱 API）

`app.js` 在 `node:vm` 沙箱中运行，**没有 `require` / `process` / 文件系统访问**，并带有执行超时。
可用的全局对象只有 `plugin` 和 `console`。

### 注册扩展能力

```js
plugin.registerRoute(name, handler)          // 自定义接口 → 前端 api.call(name)
plugin.registerCardSource(id, handler)       // 数据源 → 前端 api.data(id)
plugin.registerWidget({ id, title })         // 首页小组件
plugin.registerPage({ id, title, icon })     // 独立页面 /p/<pluginId>/<id>
plugin.registerSettings({ id, title, icon, adminOnly }) // 设置项（adminOnly 时仅管理员可见）
plugin.registerOverlay({ id, pages })        // 页面叠加层，pages: ['home','blog',...] 或 ['*']
plugin.registerTopbar({ id, title })         // 顶栏中央插槽
plugin.registerFooter({ id, title })         // 页脚版权栏下方插槽
plugin.registerPostModule({ id, title })     // 帖子内嵌模块
plugin.registerEditorTool({ id, label, icon, ui })// 编辑器工具栏按钮（ui:true 时点击弹出插件浮窗）
```

`handler` 签名：

- **路由**：`handler(req) => any`，`req = { method, query, params, body, path, authed }`
  - `authed` 为 `true` 表示调用者是插件所属用户本人或管理员（普通访客为 `false`）。
  - 返回值会作为 `{ data: ... }` 返回给前端。
- **数据源**：`handler(query) => any`，`query` 为查询字符串对象。

```js
plugin.registerRoute('greet', (req) => {
  const who = String(req.query.who || (req.authed ? 'friend' : 'guest'))
  return { hello: who }
})

plugin.registerCardSource('latest', () => plugin.getPosts({ limit: 3 }))
```

### 通用属性 / 方法

| 成员 | 说明 |
|---|---|
| `plugin.id` | 当前插件 id |
| `plugin.manifest` | 解析后的 `plugin.json` |
| `plugin.permissions` | 已被授予的权限数组 |
| `plugin.hasPermission(name)` | 是否拥有某权限 |
| `plugin.log(...)` / `console.log(...)` | 带 `[plugin:<user>:<id>]` 前缀的日志 |

### 权限门控 API

仅在授予对应权限后才存在：

```js
// posts:read
plugin.getPosts({ all = false, limit = 20 })   // 该用户的帖子（all=true 含草稿/隐藏）
// moments:read
plugin.getMoments({ limit = 20 })
// settings:read
plugin.getSiteSettings()                        // 站点设置对象
plugin.getProfile()                             // { display_name, username, avatar, bio }
// net:fetch
plugin.fetch(url, options)                      // 仅 http(s)，禁止内网/回环地址（防 SSRF）
// token
plugin.token                                    // 管理员填写的令牌字符串
// storage（见「存储」一节）
plugin.storage.list() / stats() / read(name) / write(name, data)
plugin.storage.remove(name) / readJSON(name, fallback) / writeJSON(name, obj) / url(name)
// shared：站点级共享存储（同一插件的所有用户/访客共享，无需 url）
plugin.shared.list() / read(name) / write(name, data) / remove(name)
plugin.shared.readJSON(name, fallback) / writeJSON(name, obj)
```

> `plugin.storage` 按用户隔离（`DATA_DIR/users/<id>/plugins/<pid>/storage/`）；`plugin.shared`
> 是**整站共享**（`DATA_DIR/plugin-data/<pid>/`），适合表单数据这类需要跨用户/访客聚合的场景。

> `plugin.fetch` 会拒绝 `localhost`、内网网段、`169.254.*`（云元数据）等地址，并强制 10s 超时。

---

## 前端 `ui.ux` / `ui.js`

### `ui.ux`（模板）

- 一段 HTML，可直接包含 `<style>`。会渲染进插件的 shadow root。
- 自动继承站点 `--md-*` 设计令牌，因此自动适配主题与 Material You 动态取色。
- 支持 `{{ path.to.value }}` 插值（数据来自数据源）。
- 服务端与客户端都会**清洗模板**：`<script>`、`on*` 事件属性、`javascript:` URL 会被移除。

```html
<div class="card">
  <h3>{{ title }}</h3>
  <p id="body">加载中…</p>
</div>
<style>
  .card { padding: 16px; border-radius: 16px; background: var(--md-surface-container-high); }
</style>
```

### `ui.js`（逻辑）

ES 模块，导出 `mount(ctx)`；可选返回一个清理函数（组件卸载时调用）。当 `kind === 'editor-tool'`
时 `ctx.api.editor` 提供 `insert(text)`（在编辑器光标处插入）与 `close()`（关闭弹窗）。

```js
export function mount(ctx) {
  const { root, host, api, owner } = ctx
  const body = root.querySelector('#body')   // root = shadowRoot
  api.data('latest').then((posts) => {
    body.textContent = `共 ${posts.length} 篇`
  })
  return () => { /* 清理定时器 / 事件监听 */ }
}
```

`ctx`：

| 字段 | 说明 |
|---|---|
| `pluginId` | 插件 id |
| `kind` | `widget` / `page` / `module` / `overlay` / `topbar` / `footer` / `editor-tool` / `settings` |
| `id` | 当前小组件 / 页面 / 模块 / 叠加层 / 顶栏 / 页脚 / 编辑器工具 / 设置项的 id |
| `root` | shadow root（用 `root.querySelector`） |
| `host` | 外层宿主元素 |
| `owner` | 该页面所属用户名（用于跨用户场景） |
| `data` | 帖子模块的 marker 参数（`[[plugin:id/mod\|{...}]]` 里的 JSON 对象） |
| `api` | 客户端 API（见下） |

客户端 `api`：

```js
api.isAdmin                              // 当前访问者是否已登录（注意：仅表示已登录）
api.editor.insert(text) / close()        // 仅 kind='editor-tool'：插入编辑器 / 关闭弹窗
api.dialog.confirm(opts) / alert(opts)   // M3 全局对话框
api.call(route, { method, body, query }) // 调用 registerRoute
api.data(source, query)                  // 读取 registerCardSource 数据源
api.storage.url(name)                    // 存储文件 URL（<img>/<audio> 直接用）
api.storage.list()                       // 文件列表（需登录且为本人/管理员）
api.storage.upload(files, onProgress)    // 上传（支持进度回调）
api.storage.replace(name, file, onProgress)
api.storage.remove(name) / removeBefore(date)
```

> **网络限制**：站点使用严格的 CSP（`connect-src 'self'`），因此 `ui.js` **无法直接 `fetch` 第三方域名**。
> 需要外部数据时，请通过 `api.call()` 让服务端 `plugin.fetch()`（`net:fetch`）代取。

---

## 扩展点详解

| 扩展点 | 注册方式 | 用户如何看到 / 使用 |
|---|---|---|
| **小组件** | `registerWidget` | 首页「添加卡片」选择插件小组件，或在 拓展程序 →「提供的内容 → 小组件」点击「+」加入首页 |
| **数据源** | `registerCardSource` | 首页添加「插件数据源」卡片后选择；`ui.ux` 可用 `{{ }}` 插值 |
| **独立页面** | `registerPage` | 顶栏「页面」入口 / 直接访问 `/p/<pluginId>/<pageId>` |
| **设置项** | `registerSettings` | 在「用户设置」左侧导航新增一项，内容以 `kind='settings'` 渲染；随插件启用对当前用户可见（`adminOnly: true` 时仅管理员可见，且服务端应校验 `req.isAdmin`） |
| **叠加层** | `registerOverlay` | 在匹配的页面覆盖渲染；`pages` 用路由名（`home`/`blog`/`post`/`moments`/`settings`/`user-home`/`write`/`edit`/`plugin-page`）或 `*` |
| **顶栏** | `registerTopbar` | 渲染在顶栏中央插槽 |
| **页脚** | `registerFooter` | 渲染在底部版权栏下方（`kind='footer'`） |
| **帖子模块** | `registerPostModule` | 在帖子内容中写 `[[plugin:<pluginId>/<moduleId>]]`，可带参数：`[[plugin:<id>/<mod>\|{"foo":1}]]` |
| **编辑器工具** | `registerEditorTool` | 编辑器工具栏按钮。默认插入模块标记；声明 `ui: true` 时点击弹出插件浮窗（`kind='editor-tool'`），可用 `api.editor.insert()` 插入内容后 `close()` |
| **接口** | `registerRoute` | 前端 `api.call(name)`；HTTP：`/api/plugins/<id>/call/<name>` |
| **静态资源** | 放在 `sources/` | `/api/plugins/<id>/asset/<path>` |

### 帖子模块

`registerPostModule({ id: 'note', title: '提示框' })` 后，在帖子正文写：

```
[[plugin:my-plugin/note]]
[[plugin:my-plugin/note|{"type":"warn","text":"注意"}]] 
```

模块的 `ui.ux` / `ui.js` 会以 `kind="module"` 渲染，插值数据为 marker 中的 props。

---

## 存储

插件存储是**按用户 + 插件**隔离的目录：

```
server/data/users/<userId>/plugins/<pluginId>/storage/
```

- **服务端**（需 `storage` 权限）：`plugin.storage.read/write/readJSON/writeJSON/remove/list/stats/url`
- **前端**：`api.storage.url(name)` 可直接用于 `<img>` / `<audio>` 的 `src`（同源 Cookie 鉴权）。

```js
// 服务端：写入 JSON
if (plugin.hasPermission('storage')) {
  plugin.storage.writeJSON('config.json', { theme: 'dark' })
}
```

> 存储大小会计入「存储空间」统计；在管理面板可单独清理。

---

## 权限与安全模型

插件系统遵循**最小权限 + 管理员审批**原则：

1. **安装 / 启用 / 对访客公开 = 仅管理员。**
   - 导入、`enabled`、`visitor`、`locked` 四个动作都要求管理员身份。
   - 管理员可在管理浮窗开启「禁止用户删除此插件」；加锁后该插件只能由管理员删除，普通用户界面不再显示删除按钮。
   - 普通用户不能自行运行或发布插件代码。
2. **按账户隔离（存储/数据/文件）。**
   - 插件的数据、存储文件与接口一律绑定到**当前会话用户**：登录用户的插件请求始终解析为他自己，**只有管理员**可以用 `?username=` 指定他人。因此一个用户**无法读取其他用户的插件存储**（即使插件已「对访客开放」）。
   - 匿名（未登录）请求才会按页面归属解析，读取该用户**已对访客开放**的插件（用于公开页面渲染）。
3. **私有与公开隔离。**
   - 未开启「对访客开放」的插件**只在插件所属用户本人的会话中渲染**。
   - 管理员或其它访客访问 `/user/某用户` 时，只会加载该用户**已公开**的插件。
   - 未公开插件的资源 / 数据 / 接口仅本人或管理员可访问。
3. **敏感能力逐项授权。** `storage` / `net:fetch` / `token` / `posts:read` / `moments:read` /
   `settings:read` 需管理员授予后，对应 API 才会注入到沙箱。
4. **CSP。** 站点启用严格 CSP：`script-src 'self'`、`connect-src 'self'`。插件前端不得直连第三方，
   一律走服务端 `plugin.fetch`。
5. **模板清洗。** `ui.ux` 在服务端与客户端都会被清洗（移除脚本 / 事件属性 / `javascript:`）。
6. **SSRF 防护。** `plugin.fetch` 与站点取色请求都禁止访问回环 / 内网 / 云元数据地址。

> ⚠️ **关于沙箱的诚实说明**：`app.js` 运行在 Node `vm` 中，能约束常见误用（无 `require`/`process`），
> 但**不是**强隔离的安全边界。因此「安装并启用插件」在信任模型上等同于「在服务器上运行其作者提供的代码」——
> 只应由可信管理员操作。若需运行真正不可信的插件，请改用进程级隔离方案。

---

## 调试

- 打开浏览器控制台，查看 `[plugin:<pluginId>] ui.js failed` 等日志。
- 服务端 `plugin.log(...)` 会带 `[plugin:<userId>:<pluginId>]` 前缀输出到服务器日志。
- 管理面板的插件卡片在加载失败时会显示红色错误信息（如 `plugin.json 缺失`、语法错误）。
- 修改插件文件后重新导入 / 重新启用即可刷新（运行时按目录 mtime 缓存，会自动失效）。
- 缓存：数据源 / 运行时清单有 2 秒 TTL，启用状态改变会立即失效。

---

## 打包与安装

```bash
zip -r my-plugin.zip my-plugin
```

- ZIP 内允许有一个顶层目录（会自动剥掉），也允许直接是文件。
- 路径中不能包含 `..`。
- 安装：**用户设置 → 拓展程序 → 导入插件包**。选择 ZIP 后会先弹出**确认弹窗**，展示插件
  名称 / ID / 版本 / 作者 / 说明与**申请的权限**；确认后才真正安装，并显示安装进度。安装完成后
  由管理员**启用**、按需**对访客开放**。

---

## 完整示例：便签插件

一个带服务端存储的数据源 + 保存接口 + 小组件的完整插件。

`plugin.json`

```json
{
  "id": "hello-notes",
  "name": "便签",
  "version": "1.0.0",
  "description": "带服务端存储的便签小组件",
  "author": "you",
  "permissions": ["storage"],
  "capabilities": { "widgets": true, "cardSources": true }
}
```

`app.js`

```js
// 数据源：读取便签
plugin.registerCardSource('notes', () =>
  plugin.hasPermission('storage') ? plugin.storage.readJSON('notes.json', []) : []
)

// 接口：保存便签
plugin.registerRoute('save', (req) => {
  if (!req.authed) return { ok: false, error: '需要登录' }
  const notes = Array.isArray(req.body && req.body.notes) ? req.body.notes : []
  plugin.storage.writeJSON('notes.json', notes)
  return { ok: true, count: notes.length }
})

// 小组件
plugin.registerWidget({ id: 'notes', title: '便签' })

plugin.log('hello-notes ready')
```

`ui.ux`

```html
<div class="notes">
  <h3>便签</h3>
  <ul id="list"></ul>
</div>
<style>
  .notes { padding: 16px; color: var(--md-on-surface); }
  .notes ul { margin: 8px 0 0; padding-left: 18px; }
</style>
```

`ui.js`

```js
export function mount(ctx) {
  const { root, api } = ctx
  const list = root.querySelector('#list')

  async function render() {
    const notes = await api.data('notes')
    list.textContent = ''
    for (const n of notes) {
      const li = document.createElement('li')
      li.textContent = String(n)
      list.appendChild(li)
    }
  }

  render()
  return () => {}
}
```

安装后在管理面板勾选 **storage** 权限并启用，即可在首页加入「便签」小组件。

---

## API 速查

**服务端 `plugin`**

```
id · manifest · permissions · hasPermission(p) · log(...)

registerRoute(name, handler(req))         req = { method, query, params, body, path, authed }
registerCardSource(id, handler(query))
registerWidget/Page/Overlay/Topbar/PostModule/EditorTool(def)

getPosts({all,limit})          # posts:read
getMoments({limit})            # moments:read
getSiteSettings() / getProfile()  # settings:read
fetch(url, opts)               # net:fetch（http(s)，禁内网）
token                          # token
storage.{list,stats,read,write,remove,readJSON,writeJSON,url}  # storage
```

**前端 `ctx` / `api`**

```
ctx = { pluginId, kind, id, root, host, owner, api }

api.isAdmin
api.dialog.{confirm,alert}
api.call(route, {method, body, query})
api.data(source, query)
api.storage.{url, list, upload, replace, remove, removeBefore}
```

---

> 本指南随插件系统一起以 **AGPL-3.0-or-later** 授权。示例插件见仓库 `examples/` 目录。
>
> 进阶参考：`examples/interactive-form`（互动表单）演示了 **编辑器工具浮窗**（`ui: true` + `api.editor`）、
> **帖子模块传参**（`ctx.data`）、以及 **站点级共享存储**（`plugin.shared`）的完整用法；
> `examples/web-embed`（内嵌网页）演示了**帖子内嵌 iframe**（需站点 CSP 允许 `frame-src`）与
> 加载前征询访问者的模式。
