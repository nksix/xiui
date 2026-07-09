# Changelog

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