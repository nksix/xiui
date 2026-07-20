# Changelog

## [4.0.0] - 2026-07-20

### Changed
- **响应式 Plugin 架构**：Vue/React 风格的声明式模板 + 自动重渲染
  - `render()` — 声明式模板，返回 HTML（纯函数，数据→视图）
  - `afterRender(el)` — DOM 就绪后绑定事件
  - `setValue(v)` — 更新状态 → **自动触发 render() + afterRender()**
  - 数据变了，UI 自动变，无需手动更新 DOM
- Plugin 实例化改为"模板类"模式：每个卡片创建独立 plugin 实例，数据/状态/事件自闭环
- 配置项 `cards` 改名为 `plugins`，支持传入 XIUIPlugin 子类或旧式对象
- 内置插件全部重写为 `render()` + `afterRender()` 模式
- 流式渲染增加 `createStream(container)` 一行接入 API

### Added
- `XIUIPlugin.init(ctx)` — 初始化上下文（formId, typeId, md, chat, data）
- `XIUIPlugin.emit(event, detail)` — 向外部发送事件
- `XIUIPlugin._onChange(oldVal, newVal)` — 值变化回调
- `XIUIPlugin.html(text)` — Markdown 渲染工具函数
- `XIUIChat.getPlugin(typeId)` — 获取 plugin 实例
- `setValue(v, { silent: true })` — 静默模式，不触发重渲染（input/slider 高频输入场景）
- 旧式 `{render(card,el)}` 对象自动包装为 XIUIPlugin 子类（`_wrapLegacy`）

### Fixed
- 修复 mid-line fence 检测失败（文本后紧跟 `\`\`\`xiui@form:` 无法识别）
- 修复 `BUILTIN_PLUGINS` 缺少 `export` 导致 ES module 加载失败
- 注入 CSS 补全 table/blockquote/heading/list/link 样式

### Removed
- 移除旧的 `card.setValue()` / `card.getValue()` / `card.trigger()` 外部 API（改为 plugin 自管理）
- 移除非交互卡片类型（tip/progress/section/chart/tab）

## [1.0.0] - 2026-07-09

### Added
- 初始版本发布
- 10 种卡片类型：choice、tip、input、progress、summary、confirm、chart、section、tab、submit
- 流式解析器 Parser，支持逐行解析和骨架屏
- 渲染器基类 Renderer，支持自定义渲染逻辑
- 交互事件收集器 Collector，支持批次提交
- 消息管理器 MessageManager，支持历史压缩和滑动窗口裁剪
- 完整封装 XIUIChat
- 协议规范文档
- 两个示例：基础示例和学习助手
- 属性语法 `[@key:value@key:value]`
- HTML 注释边界 `<!-- card:type:id -->` / `<!-- /card -->`
- 优雅降级：不解析时注释隐藏，显示纯 Markdown