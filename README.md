# Trinity Blog Framework

> 基于 **Material Design 3 Expressive** 的个人主页 + 博客 + 动态系统，内置可扩展的**插件系统**。

前端 **Vue 3 + TypeScript**，后端 **Node.js + Express + 内置 SQLite**（`node:sqlite`，零外部数据库依赖）。

---

## ✨ 功能

- **首页**：顶栏、欢迎 Banner、可拖拽 / 编辑 / 增删 / 隐藏的卡片（个人资料、个人活动、帖子列表、自定义文本、链接集合、插件数据源 / 小组件）
- **博客**：Markdown 发帖、封面图、分类筛选、标签搜索、公开 / 隐藏 / 草稿
- **动态**：瀑布流卡片、每条最多 4 张图、200 字限制、点击放大
- **活动集成**：GitHub、Steam、Nintendo Switch Online（经 nxapi 官方代理）
- **个人资料**：头像、简介、社交链接、首页标签（自定义文字 + 图标）
- **站点外观**：横幅背景、站点图标、9 套预设配色 + **Material You 动态取色**（从图标 / 横幅 / 自定义图片取色）
- **账户系统**：首次访问创建管理员；`/teaparty` 登录入口
- **备份迁移**：整站数据导出 / 导入为 ZIP（含设置、账户、帖子、动态、卡片、上传文件、已安装插件）
- **插件系统**：ZIP 导入，启用 / 禁用、访客可见性、权限管理

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3、Vue Router 4、Vite 6、TypeScript、marked、DOMPurify、Cropper.js、@material/material-color-utilities |
| 后端 | Node.js、Express、`node:sqlite`、jsonwebtoken、bcryptjs、multer、adm-zip、sharp、nxapi |

> 运行环境要求 **Node.js ≥ 22.9**（使用了内置 `node:sqlite` 与 `--env-file-if-exists`）。

## 📁 目录结构

```
.
├── package.json          # 根脚本（install:all / dev / build / start）
├── server/               # 后端
│   ├── src/
│   │   ├── app.js        # Express 应用
│   │   ├── index.js      # 启动入口
│   │   ├── db.js         # SQLite 与数据表
│   │   ├── auth.js       # JWT / 密码
│   │   ├── nintendo.js   # NSO 集成
│   │   ├── plugins.js    # 插件系统核心（沙箱、存储、运行时）
│   │   ├── seed.js       # 动态取色种子
│   │   └── routes/       # setup / auth / posts / moments / settings / cards / activity / nintendo / plugins / backup / uploads
│   ├── .env.example
│   └── uploads/          # 上传的图片（运行时）
└── web/                  # 前端
    └── src/
        ├── components/   # TopAppBar、卡片、命令面板、插件运行时…
        ├── views/        # 首页、博客、动态、编辑器、设置、插件页面…
        ├── stores/       # auth / site / palette / toast
        ├── lib/          # api / markdown / dynamicTheme / plugins / useParallax…
        └── styles/       # M3 设计令牌与组件样式
```

## 🚀 快速开始（开发）

```bash
npm run install:all      # 安装前后端依赖
npm run dev              # 后端 :8787 + 前端 :5173（/api 自动代理）
```

打开 http://localhost:5173 —— 首次访问会引导创建管理员账户。

## 🏗️ 构建与部署

```bash
npm run install:all
npm run build            # 构建前端 → web/dist
npm start                # 启动后端（同时托管前端与上传文件）
```

后端默认监听 `8787`（`PORT` 可覆盖），单进程同时提供 API、上传文件与前端页面。生产环境建议用 Nginx/Caddy 反向代理到 `8787` 并配置 HTTPS，同时放开发送体积（如 `client_max_body_size 300m`，用于图片上传与备份导入）。

**必须持久化的目录：**

| 路径 | 内容 |
|---|---|
| `server/data/` | SQLite 数据库（设置、账户、帖子、动态、卡片） |
| `server/uploads/` | 上传的图片 |
| `server/plugins/` | 已安装的插件 |
| `server/.env` | 集成配置（可选） |

### 环境变量（`server/.env`）

复制 `server/.env.example`。主要用于 Nintendo Switch Online 集成（nxapi 官方 znca 代理 + 客户端 ID），不配置则相关功能降级为占位/手动。

## 🔐 账户

- 首次打开：**创建管理员账户**。
- 登录入口固定在 **`/teaparty`**（不在页面上暴露链接）。
- 用户资料、站点外观、活动集成、博客分类、插件、备份均在 **用户设置** 中管理。

<a id="nso-setup"></a>

## 🎮 Nintendo Switch Online（NSO）配置

站点通过 **nxapi** 读取 NSO 数据（活动卡、Switch 游戏库）。由于任天堂的 `f` 参数必须由官方 App 生成，nxapi 官方提供了 **znca API 代理**来生成它；该代理自 2025 年起要求**客户端认证**，因此你需要注册一个客户端并填写 **Client ID / Client Secret**。

### 获取 Client ID / Secret

1. 打开注册页：<https://nxapi-auth.fancy.org.uk/oauth/clients>
2. 按提示登录，注册一个客户端，**scope 填**：`ca:gf ca:er ca:dr`
3. 复制返回的 **Client ID**（如有 **Client Secret** 也一并复制）

### 在本站填写

打开 **用户设置 → 活动集成 → Nintendo → 开发者凭据（nxapi znca 代理）**：

| 字段 | 说明 |
|---|---|
| znca 代理地址 | 默认 `https://nxapi-znca-api.fancy.org.uk/api/znca`，一般无需修改 |
| nxapi Client ID | 上一步获取的 Client ID |
| nxapi Client Secret | 上一步的 Client Secret（若为 public client 可留空） |

保存后，点击「**绑定 Nintendo 账户**」完成任天堂账号授权，首页活动卡与「Switch 游戏库」即可显示数据。

> 所有 nxapi 相关开关（**f 参数生成方式**、**远程配置**、**自定义配置地址**）也都在下方的「**高级选项**」里配置，**无需编辑 `.env`**。

> 凭据**只保存在服务器数据库**，由「用户设置」写入，**不从 `.env` 读取**，也不会进 Git / 部署包。

### 安全说明

- **Client Secret 是敏感信息**，只应填在「用户设置」（存入服务器数据库）。
- **Client ID** 属于公开客户端标识，本身不是密钥。
- 源码 `server/src/nintendo.js` 里的 `NA_CLIENT_ID = 71b963c1b7b6d119` 是**任天堂官方 NSO App 的公开 client_id**（社区公开常量），并非密钥，无需隐藏。
- 你的任天堂 `session_token`、GitHub Token、Steam API Key 等全部保存在服务器数据库，不会对外暴露。

## 🧩 插件系统

> 📘 完整开发指南见 **[`docs/plugin-guide.md`](./docs/plugin-guide.md)**。

插件为 ZIP 包，可由**管理员**在「用户设置 → 拓展程序」导入、启用/禁用、设置访客可见性与权限。插件可提供：帖子内嵌模块、编辑器小工具、Widgets、页面叠加层、独立页面、卡片数据源。插件按用户安装与隔离，未对访客开放的插件仅在其所属用户本人的会话中运行。

### 插件包结构

```
my-plugin/
├── plugin.json   # 必需：插件信息
├── app.js        # 必需：服务端主代码（在沙箱中运行）
├── ui.ux         # 可选：前端 UI 模板（渲染在 shadow DOM）
├── ui.js         # 可选：前端逻辑（ES 模块，导出 mount(ctx)）
└── sources/      # 可选：静态资源
```

`plugin.json`：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "示例",
  "author": "you",
  "permissions": ["posts:read", "storage"],
  "capabilities": {
    "widgets": true,
    "pages": true,
    "postModules": true,
    "editorTools": true,
    "overlays": true,
    "cardSources": true
  }
}
```

### `app.js`（沙箱 API）

在 Node `vm` 沙箱中执行，无 `require`/`process`。通过全局 `plugin` 注册能力：

```js
plugin.registerRoute('hello', (req) => ({ hi: plugin.id, authed: req.authed }))
plugin.registerCardSource('latest', () => plugin.getPosts({ limit: 5 }))
plugin.registerWidget({ id: 'stats', title: '统计' })
plugin.registerPage({ id: 'index', title: '页面', icon: 'photo_library' })
plugin.registerPostModule({ id: 'note', title: '提示框' })
plugin.registerEditorTool({ id: 'note', label: '插入提示框', icon: 'extension' })
plugin.registerOverlay({ id: 'badge', pages: ['*'] })
```

权限门控的辅助方法（仅在授予对应权限后可用）：

| 权限 | 能力 |
|---|---|
| `posts:read` | `plugin.getPosts(opts)` |
| `moments:read` | `plugin.getMoments(opts)` |
| `settings:read` | `plugin.getSiteSettings()` / `plugin.getProfile()` |
| `net:fetch` | `plugin.fetch(url, opts)`（仅 http(s)） |
| `token` | `plugin.token`（管理员填写的访问令牌） |
| `storage` | `plugin.storage.{list,stats,read,write,remove,readJSON,writeJSON,url}` |

### `ui.ux` / `ui.js`（前端）

- `ui.ux`：HTML 模板，可含 `<style>`，渲染在独立 **shadow root** 内；站点 CSS 变量（`--md-*`）自动继承，因此**跟随主题与动态取色**；支持 `{{ path }}` 插值，且会被清洗（移除脚本 / 事件属性 / `javascript:`）。
- `ui.js`：ES 模块，导出 `mount(ctx)`，可选返回清理函数。`ctx = { pluginId, kind, id, root, host, owner, api }`。

客户端 `api`：

```js
api.isAdmin                       // 当前访问者是否已登录
api.dialog.confirm/alert(opts)    // M3 全局对话框
api.call(route, { method, body }) // 调用 registerRoute 注册的接口
api.data(source, query)           // 读取 registerCardSource 注册的数据源
api.storage.url(name)             // 存储文件 URL（同源 Cookie 鉴权，可直接用于 <img>/<audio>）
api.storage.list() / upload(files) / replace(name, file) / remove(name) / removeBefore(date)
```

### 安全模型

- `app.js` 在 Node `vm` 沙箱中执行（无 `require`/`process`，带超时）；**注意 `vm` 并非强隔离边界**，仅应由可信管理员安装/启用插件。
- **导入 / 启用 / 对访客公开：仅管理员。** 普通用户不能自行运行或发布插件代码。
- **私有与公开隔离**：未对访客开放的插件只在其所属用户本人的会话中渲染；管理员或访客访问 `/user/某用户` 时只加载其已公开的插件。
- 敏感能力（`storage` / `net:fetch` / `token` / `posts:read` / `moments:read` / `settings:read`）需管理员逐项授权。
- 站点启用严格 CSP（`script-src 'self'`、`connect-src 'self'`），插件前端不得直连第三方，需经服务端 `plugin.fetch`（`net:fetch`，已阻断内网/元数据地址）。

## 💾 备份与迁移

「用户设置 → 备份与迁移」可将整站数据导出为 ZIP（设置、账户含密码哈希、帖子、动态、卡片、上传文件、已安装插件），在另一个使用相同软件的站点导入即可完成迁移。导入会覆盖目标站点全部数据，请先备份。

## 📜 许可证

以 **AGPL-3.0-or-later** 授权，版权归 **YurizonoMika** 所有。详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

第三方组件及其许可证见 [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md)。

> 本项目与 Nintendo 无任何关联；Nintendo Switch / Nintendo Switch Online 是任天堂的商标。
