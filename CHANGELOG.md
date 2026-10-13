# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-13

首个版本。基于 **Material Design 3 Expressive** 的个人主页 + 博客 + 动态系统，内置插件系统。

### 新增

#### 首页
- 顶栏（站点 Logo、导航、搜索与快捷指令、主题切换、账户菜单）
- 欢迎 Banner（背景图 + 视差滚动、可配置标语与描述）
- 卡片系统：个人资料、个人活动、帖子列表、自定义文本、链接集合、插件数据源 / 小组件
- 卡片支持**拖动排序、编辑、增删、隐藏**，并保存到服务端

#### 博客
- Markdown 发帖，实时/分栏预览，图片上传（按钮 / 粘贴 / 拖拽）
- 封面图、摘要、URL 别名、标签
- **分类**（在设置中维护），列表按分类筛选；标签用于搜索
- 文章可编辑、删除、设为公开 / 隐藏 / 草稿

#### 动态
- 独立的瀑布流页面，每条最多 4 张图、200 字上限，点击放大查看

#### 用户与账户
- 首次访问创建管理员；登录入口固定为 `/teaparty`
- 用户设置：资料、头像裁剪、社交链接、首页标签（文字 + 图标）
- 站点外观：站点图标、横幅（上传 + 裁剪 + 视差）、9 套预设配色 + **Material You 动态取色**（图标 / 横幅 / 自定义图片）
- 账户安全：修改用户名与密码

#### 活动集成
- GitHub、Steam、Nintendo Switch Online（nxapi 官方 znca 代理 + `session_token` 授权、好友在线状态、最近游玩）
- 未配置时优雅降级为手动记录

#### 插件系统
- ZIP 导入，管理端可启用/禁用、设置访客可见性、逐项授权（帖子/动态/设置读取、网络请求、访问令牌、存储读写）
- 插件可提供：帖子内嵌模块（`[[plugin:id/module]]`）、编辑器小工具、Widgets、页面叠加层、独立页面、卡片数据源
- 服务端 `app.js` 在沙箱中运行；前端 `ui.ux` / `ui.js` 运行于独立 shadow root，继承主题与动态取色
- 插件独立存储（`server/data/plugins/<id>/`）与受门禁的资源访问（支持 `?token=`）

#### 数据
- 整站备份导出 / 导入为 ZIP（设置、账户、帖子、动态、卡片、上传文件、已安装插件）

### 工具与合规
- 命令面板（⌘K / Ctrl+K）：搜索文章与动态、执行快捷指令
- AGPL-3.0-or-later 许可，含 `LICENSE` / `NOTICE` / `THIRD-PARTY-LICENSES.md`
- 源文件统一 SPDX 头；`npm run licenses` 重新生成第三方许可清单

[1.0.0]: https://github.com/YurizonoMika/TrinityBlogFramework/releases/tag/v1.0.0
