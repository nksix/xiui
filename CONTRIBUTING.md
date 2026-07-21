# 贡献指南

感谢你对 XIUI 的关注！

## 如何贡献

### 报告 Bug

1. 搜索 [Issues](https://github.com/xuanhua-inc/xiui/issues) 确认 Bug 未被报告
2. 提交新 Issue，包含：
   - 环境信息（浏览器版本、Node 版本）
   - 复现步骤
   - 期望行为 vs 实际行为
   - 相关代码片段或截图

### 提交代码

1. Fork 仓库
2. 创建分支：`git checkout -b feat/your-feature`
3. 提交变更：`git commit -m 'feat: 添加 xxx 功能'`
4. 推送分支：`git push origin feat/your-feature`
5. 提交 Pull Request

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档更新
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具变更

### 代码风格

- ES Module，纯 JavaScript
- 零依赖原则：不引入任何第三方库
- 类名使用 PascalCase，方法名使用 camelCase
- 私有方法以 `_` 开头
- JSDoc 注释所有公开方法

### 添加新卡片类型

1. 在 `spec/xiui-protocol.md` 中定义卡片类型和属性
2. 在 `src/xiui.js` 中创建新的 Plugin 类并注册到 `BUILTIN_PLUGINS`
3. 更新 README 内置插件表
4. 在 `examples/chat.html` 中添加测试用例

### 测试

目前通过浏览器手动测试 `examples/` 下的 HTML 文件。欢迎贡献自动化测试。

## 行为准则

- 保持友善和尊重
- 接受建设性批评
- 关注对社区最有利的事情