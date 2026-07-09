# XIUI — Xuanhua Interactive User Interface

> 一套基于标准 Markdown 的生成式可交互 UI 协议。AI 模型流式输出 Markdown + 卡片，前端解析渲染为可交互组件。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)](package.json)

---

## 什么是 XIUI

XIUI 是一种**生成式可交互 UI 协议**。它定义了一套规范，让 AI 模型在流式输出文本的同时，能够生成可交互的 UI 组件，并在用户操作后继续对话。

核心思路：**模型输出 Markdown，前端解析为卡片**。不解析也能正常阅读，解析后获得完整交互能力。

## 为什么需要 XIUI

| 问题 | XIUI 的解法 |
|------|------------|
| AI 对话只能纯文本，无法交互 | 10 种卡片组件，覆盖选择/输入/确认/进度/图表 |
| JSON A2UI 方案流式渲染困难 | Markdown 原生，逐行即时渲染，无需等完整 JSON |
| 复杂协议模型学习成本高 | 像写 Markdown 一样写卡片，跟 ` ``` ` 代码块一样的肌肉记忆 |
| 解析失败用户体验差 | HTML 注释降级，不解析时自动隐藏，用户看到纯 Markdown |
| 多卡片交互状态管理混乱 | submit_card 批次提交，前端校验，整批发送 |

## 协议速览

模型输出：
```markdown
今天我们来学习 Python 的可变类型。

<!-- card:choice:c1 -->
下面哪个是可变类型？
- A. 整数 int
- B. 字符串 str
- C. 列表 list
- D. 元组 tuple
<!-- /card -->

<!-- card:submit:s1 -->
提交
<!-- /card -->
```

用户操作后前端发送：
```json
{"submit_id": "s1", "cards": {"c1": "C"}}
```

模型继续输出：
```markdown
回答正确！🎉

<!-- card:tip:t1 -->
> 💡 为什么 list 是可变的？
> 列表内存是连续空间，`lst[0] = 10` 直接修改而不创建新列表。
> 元组 tuple 内存只读——任何修改触发 TypeError。
<!-- /card -->
```

## 核心特性

- **Markdown 原生** — 卡片内容用标准 Markdown，不引入新语法规则
- **流式渐进渲染** — 逐行解析，骨架屏到完整卡片的无缝过渡，无"等半天啪一下全出来"的傻逼感
- **优雅降级** — 不解析时 HTML 注释自动隐藏，用户看到纯 Markdown，完全可读
- **批次提交** — 交互卡片通过 submit_card 整批提交，前端校验，避免部分操作
- **10 种卡片** — choice / tip / input / progress / summary / confirm / chart / section / tab / submit
- **零依赖** — 纯 JavaScript ES Module，无框架依赖，可直接在浏览器中使用
- **跨模型兼容** — 协议只定义输出格式，与模型无关，OpenAI / Claude / Gemini 均可使用

## 卡片类型一览

| 卡片 | 类型 | 用途 | 交互 | 降级效果 |
|------|------|------|------|----------|
| choice | 交互 | 选择题、确认理解 | 点击选项 | 无序列表 |
| tip | 展示 | 知识点讲解、纠错 | 无 | 引用块 |
| input | 交互 | 文字输入、代码 | 输入文字 | 标题+提示 |
| progress | 展示 | 学习进度 | 无 | 加粗+文字 |
| summary | 展示 | 关键指标 | 无 | 表格 |
| confirm | 交互 | 确认操作 | 确认/取消 | 加粗+引用 |
| chart | 展示 | 趋势图、对比图 | 点击数据点 | 表格 |
| section | 容器 | 卡片分组 | 无 | 标题+内容 |
| tab | 容器 | 选项卡切换 | 切换 tab | 连续标题 |
| submit | 触发器 | 批次提交 | 点击提交 | 不显示 |

## 快速开始

### 安装

```bash
npm install xiui
```

或直接复制 `src/` 目录到项目中（零依赖，无需构建）。

### 基础用法

```javascript
import { Parser, Renderer, Collector, XIUIChat } from 'xiui';

// 1. 实现自定义渲染器
class MyRenderer extends Renderer {
  onCardStart(type, id) {
    // 创建骨架屏
    this.showSkeleton(id);
  }

  onCardEnd(card, lines) {
    // 提取结构化数据并渲染
    const data = Renderer.extractData(card, lines);
    this.renderComponent(card.type, data, card.attrs);
    this.hideSkeleton(card.id);
  }

  onMarkdownLine(line) {
    // 渲染普通 Markdown
    this.appendMarkdown(line);
  }

  onSubmitCard(card) {
    // 渲染提交按钮
    this.showSubmitButton(card.attrs.label || '提交');
  }
}

// 2. 创建解析器
const renderer = new MyRenderer();
const parser = new Parser(renderer);
const collector = new Collector();

// 3. 喂入模型输出（逐行）
for (const line of modelOutput.split('\n')) {
  parser.feed(line);
}

// 4. 用户操作卡片时收集交互
collector.onChoiceSelect('c1', 'C');
collector.onInput('i1', '用户输入的内容');

// 5. 提交
const { valid, result } = collector.build('submit_001', parser.pendingCards);
if (valid) {
  // 发送 result 给模型
  sendToModel(result);
}
```

### 完整封装

```javascript
const chat = new XIUIChat({
  systemPrompt: '你是学习助手。可以通过 XIUI 卡片协议输出 UI 组件。',
  renderer: new MyRenderer(),
  fetchChat: async (messages) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages })
    });
    return res.body; // ReadableStream
  }
});

// 发送消息
await chat.sendMessage('今天学什么？');

// 提交卡片
await chat.submitCards('submit_001');
```

## API 文档

### Parser

流式解析器，逐行喂入模型输出，识别卡片边界并触发渲染回调。

```javascript
const parser = new Parser(renderer);

parser.feed(line);   // 喂入一行文本
parser.reset();      // 重置状态
```

**属性**：
- `pendingCards` — 当前批次的交互卡片列表

### Renderer

渲染器基类，继承此类实现自定义渲染逻辑。

```javascript
class MyRenderer extends Renderer {
  onCardStart(type, id)        // 卡片开始，创建骨架屏
  onCardLine(card, line)       // 卡片内容逐行到达
  onCardEnd(card, lines)       // 卡片结束，渲染完整组件
  onMarkdownLine(line)         // 普通 Markdown 行
  onSubmitCard(card)           // 检测到 submit 卡片
}
```

**静态方法**：
- `Renderer.extractData(card, lines)` — 从 Markdown 内容中提取结构化数据，返回 `{ question, options }` / `{ title, body }` / `{ title, progress, label }` 等

### Collector

交互事件收集器，暂存用户操作，批次提交时组装事件。

```javascript
const collector = new Collector();

collector.onChoiceSelect(cardId, optionId)  // 记录选项选择
collector.onInput(cardId, text)             // 记录文字输入
collector.onConfirm(cardId, action)         // 记录确认操作 ("yes" | "no")

const { valid, result, errors } = collector.build(submitId, pendingCards);
// valid: true → result 包含 { submit_id, cards }
// valid: false → errors 包含未操作的卡片 id 列表

collector.reset();  // 重置
```

### MessageManager

消息管理器，维护 messages 数组，自动压缩已完成的历史卡片。

```javascript
const manager = new MessageManager(systemPrompt, maxTokens);

manager.addUserMessage(content)       // 添加用户消息
manager.addAssistantMessage(content)  // 添加模型消息
manager.addInteractionEvent(event)    // 添加交互事件
manager.getCompressed()              // 获取压缩后的消息数组
```

**压缩策略**：已完成的卡片交互（模型出卡片 → 用户操作 → 提交）自动压缩为摘要，避免上下文膨胀。超过 maxTokens 则滑动窗口裁剪。

### XIUIChat

完整封装，组合 Parser + Renderer + Collector + MessageManager。

```javascript
const chat = new XIUIChat({
  systemPrompt: string,    // 系统提示词
  renderer: Renderer,      // 渲染器实例
  fetchChat: async (messages) => ReadableStream  // 模型调用函数
});

await chat.sendMessage(text)          // 发送文字消息
await chat.submitCards(submitId)      // 提交交互卡片
```

## 协议规范

详见 [spec/xiui-protocol.md](spec/xiui-protocol.md)

完整协议规范包含：
- 协议定位与设计原则
- 卡片语法（基本格式、属性、嵌套）
- 10 种卡片类型定义（含属性、交互、降级效果）
- 交互事件协议（事件收集、批次提交、发送格式）
- 流式渲染规范（时序、解析器实现）
- 消息管理（消息数组、历史压缩、滑动窗口）
- 前后端交互流程（完整时序、前端实现）
- 完整交互示例

## 示例

### 基础示例

[examples/basic.html](examples/basic.html) — 展示所有卡片类型的渲染和交互，包含模拟流式输出。

直接用浏览器打开即可运行。

### 学习助手示例

[examples/learning-assistant.html](examples/learning-assistant.html) — 气泡式对话界面，模拟 AI 教学场景，包含选择题、提示、进度、输入等完整交互流程。

直接用浏览器打开即可运行。

## 浏览器兼容性

- Chrome 89+
- Firefox 90+
- Safari 15+
- Edge 89+

## 与框架集成

### React

```jsx
import { Parser, Renderer } from 'xiui';
import { useState, useRef } from 'react';

function useXIUI() {
  const parserRef = useRef(new Parser(new ReactRenderer()));
  // ...
}
```

### Vue

```javascript
import { Parser, Renderer } from 'xiui';

export default {
  mounted() {
    this.parser = new Parser(new VueRenderer(this));
  }
}
```

### Node.js

```javascript
import { Parser, Renderer, Collector } from 'xiui';

// 服务端解析模型输出
const parser = new Parser({
  onCardStart: (type, id) => console.log(`Card: ${type}#${id}`),
  onCardEnd: (card, lines) => {
    const data = Renderer.extractData(card, lines);
    console.log('Extracted:', data);
  },
  onMarkdownLine: (line) => {},
  onSubmitCard: () => {},
  onCardLine: () => {}
});
```

## 贡献

欢迎提交 Issue 和 Pull Request。

### 开发

```bash
git clone https://github.com/xuanhua-inc/xiui.git
cd xiui
# 零依赖，直接修改 src/ 下的文件即可
# 用浏览器打开 examples/ 下的 HTML 文件测试
```

### 添加新卡片类型

1. 在 `spec/xiui-protocol.md` 中定义卡片类型、属性、交互规则
2. 在 `src/renderer.js` 的 `extractData` 中添加解析逻辑
3. 在渲染器中实现 `_buildCard` 对应分支
4. 更新 README 卡片类型表

## License

MIT © 2026 Xuanhua Inc.