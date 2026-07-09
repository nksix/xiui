---
type: Technical Specification
title: "XIUI 协议规范"
description: "XIUI 交互协议完整规范。包含卡片语法、类型定义、交互事件、流式渲染、前端解析、消息管理、前后端交互流程。"
tags: [xiui, protocol, agent, ui, card-system, markdown, streaming, interaction]
timestamp: 2026-07-09T11:32:00+08:00
---

# XIUI 协议规范

> 一套基于标准 Markdown 的交互协议。模型输出即 Markdown，前端解析即卡片。不解析也能正常阅读，解析后获得完整交互能力。

---

## 〇、协议定位

XIUI 是一种**生成式可交互 UI 协议**。它定义了一套规范，让 AI 模型在流式输出文本的同时，能够生成可交互的 UI 组件，并在用户操作后继续对话。

### 协议边界

XIUI 回答的是「AI 和 UI 之间怎么通信」的问题，不负责「UI 长什么样」：

| 层 | 谁负责 | 协议管什么 |
|------|--------|-----------|
| **语义层** | 模型 | 决定出什么卡片、填什么内容、用什么顺序 |
| **协议层** | XIUI | 卡片边界标记、属性编码、事件回传格式 |
| **渲染层** | 前端 | 卡片组件实现、布局、样式、响应式 |
| **交互层** | 前端 + XIUI | 交互事件收集、批次提交、校验规则 |

### 与同类方案的差异

| | XIUI | 纯 JSON A2UI | 传统 Chat UI |
|---|---|---|---|
| **输出格式** | Markdown + 注释 | 纯 JSON | 纯文本 |
| **流式渲染** | 逐行即时渲染 | 必须等完整 JSON | 逐字打字 |
| **降级能力** | 不解析也能读 | 乱码 | 天然可读 |
| **模型负担** | 像写 Markdown | 像写代码 | 像说话 |
| **交互支持** | 10 种卡片 + 批次提交 | 自定义 JSON schema | 无 |
| **适用场景** | 生成式可交互 UI | API 调用/结构化输出 | 纯文本对话 |

### 什么情况下用 XIUI

- 模型输出需要**同时包含文字和可交互组件**（题、表单、进度、图表）
- 用户需要**在对话流中直接操作**，而不是跳转到另一个页面
- 需要**流式渐进渲染**，不能等完整输出才展示
- 需要**优雅降级**——不支持解析的环境仍能正常阅读

### 什么情况下不用 XIUI

- 纯文本对话，没有交互需求 → 直接 Markdown
- 交互逻辑复杂、状态管理重 → 原生前端 + API，模型只出数据
- 高频实时渲染（游戏、动画、协同编辑） → 专业渲染引擎
- 只需要结构化数据输出 → JSON Schema / function calling

---

## 一、设计原则

1. **Markdown 原生** — 卡片内容用标准 Markdown，不引入新语法
2. **注释做边界** — `<!-- card:类型:id -->` 和 `<!-- /card -->` 标记卡片起止
3. **优雅降级** — 不解析时 HTML 注释隐藏，用户看到纯 Markdown
4. **流式友好** — 检测到卡片开始立即出骨架屏，逐行渲染
5. **批次提交** — 交互卡片通过 `submit_card` 整批提交
6. **模型只管内容，前端管布局** — 排列、间距、响应式不暴露给模型

---

## 二、卡片语法

### 2.1 基本格式

```
<!-- card:类型:id -->
[标准 Markdown 内容]
<!-- /card -->
```

### 2.2 属性

属性放在卡片开始标记中，用 `[@key:value]` 包裹，多个属性用 `@` 分隔。属性可选，无属性时省略 `[@...]`：

```
<!-- card:类型:id[@key:value@key:value] -->
```

### 2.3 嵌套

容器卡片内嵌套其他卡片，靠 `<!-- /card -->` 配对，前端用栈维护：

```
<!-- card:section:sec1 -->
## 标题

<!-- card:summary:s1 -->
| 指标 | 数值 |
<!-- /card -->

<!-- /card -->
```

---

## 三、卡片类型定义

### 3.1 choice — 选择题

用于出题、确认理解。内容第一行为题目，`- 字母. 文字` 为选项。

```
<!-- card:choice:c1 -->
下面哪个是可变类型？
- A. 整数 int
- B. 字符串 str
- C. 列表 list
- D. 元组 tuple
<!-- /card -->
```

**属性**：`@multi:true`（多选） `@optional:true`（可跳过）

**交互**：用户点击选项。单选用 radio，多选用 checkbox。

**降级**：普通无序列表，完全可读。

---

### 3.2 tip — 提示

用于知识点讲解、纠错反馈、鼓励。内容用 Markdown 引用块。

```
<!-- card:tip:t1 -->
> 💡 可变类型 vs 不可变类型
> 可变类型（list、dict）的值可以原地修改；
> 不可变类型（int、str、tuple）每次操作创建新对象。
> **判断技巧**：能用 `obj[0] = ...` 修改的就是可变的。
<!-- /card -->
```

**属性**：`@icon:bulb|warning|info|success`（默认 bulb）

**交互**：无。

**降级**：标准引用块，完全可读。

---

### 3.3 input — 输入

用于收集文字回答。内容第一行为标题，`*（xxx）*` 为占位提示。

```
<!-- card:input:i1 -->
用你的话解释可变类型
*（不超过 100 字）*
<!-- /card -->
```

**属性**：`@type:text|code|multiline`（默认 text） `@max:200`

**交互**：用户输入文字。

**降级**：显示标题和提示文字，可读但不可交互。

---

### 3.4 progress — 进度

用于展示学习进度。

```
<!-- card:progress:p1 -->
**Python 函数**  ███████░░░ 70%  7/10 节
<!-- /card -->
```

**属性**：`@color:blue|green|orange|red`（默认 blue）

**交互**：无。

**降级**：加粗标题 + 文字描述，可读。

---

### 3.5 summary — 概览

用于统计数据、关键指标。内容用 Markdown 表格。

```
<!-- card:summary:s1 -->
| 今日学习时长 | 2.5 小时 ↑ |
| 比昨天 | 多 40 分钟 |
<!-- /card -->
```

**属性**：`@trend:up|down|flat`

**交互**：无。

**降级**：标准表格，完全可读。

---

### 3.6 confirm — 确认

用于确认重要操作。`**标题**` 为标题，`> 确认 | 取消` 为按钮。

```
<!-- card:confirm:cf1 -->
**确定要跳过这一章吗？**

第 3 章是后续章节的基础，跳过可能影响理解。

> 确定跳过  |  继续学习
<!-- /card -->
```

**属性**：`@yes:确认` `@no:取消`

**交互**：用户点击确认或取消。

**降级**：加粗标题 + 引用块，可读。

---

### 3.7 chart — 图表

用于趋势图、对比图。内容用 Markdown 表格 + 斜体说明。

```
<!-- card:chart:ch1 -->
| 周一 | 周二 | 周三 | 周四 | 周五 |
| 1.5 | 2.0 | 0.5 | 2.5 | 1.8 |
*本周学习时长（小时）*
<!-- /card -->
```

**属性**：`@type:bar|line|pie|radar`（默认 bar） `@unit:单位`

**交互**：点击数据点（可选）。

**降级**：标准表格 + 说明文字，完全可读。

---

### 3.8 section — 分组（容器）

用于将多张卡片归为一组。

```
<!-- card:section:sec1 -->
## 今日学习概览

<!-- card:summary:s1 -->
| 学习时长 | 2.5 小时 ↑ |
<!-- /card -->

<!-- card:summary:s2 -->
| 完成题目 | 12 题 |
<!-- /card -->

<!-- /card -->
```

**属性**：无。

**前端渲染**：带标题的卡片分组区域。

**降级**：二级标题 + 表格，可读。

---

### 3.9 tab — 选项卡（容器）

每个 `## 标题` 对应一个 tab。

```
<!-- card:tab:tb1[@default:0] -->

## 已掌握

<!-- card:tip:t1 -->
> ✓ 变量与数据类型
<!-- /card -->

## 薄弱点

<!-- card:tip:t2 -->
> ⚠️ 函数参数传递
<!-- /card -->

<!-- /card -->
```

**属性**：`@default:0`（默认选中的 tab 索引）

**交互**：用户切换 tab。

**降级**：连续二级标题 + 引用块，可读。

---

### 3.10 submit — 提交（批次触发器）

交互卡片（choice/input/confirm）后面必须跟 submit。前端收到后渲染提交按钮，校验所有交互卡片已操作，整批发送。

```
<!-- card:submit:s1 -->
提交
<!-- /card -->
```

**属性**：`@label:提交`

**交互**：用户点击提交，触发批次校验和发送。

**降级**：不显示（降级渲染器不处理交互）。

---

## 四、交互事件协议

### 4.1 事件收集

前端暂存用户操作：

```javascript
class InteractionCollector {
  values = {};  // card_id → value

  onChoiceSelect(cardId, optionId) { this.values[cardId] = optionId; }
  onInput(cardId, text)          { this.values[cardId] = text; }
  onConfirm(cardId, action)      { this.values[cardId] = action; }
}
```

### 4.2 批次提交

```javascript
onSubmit(submitId) {
  const result = { submit_id: submitId, cards: {} };
  
  for (const card of this.pendingCards) {
    const value = this.values[card.id];
    if (value === undefined && !card.attrs.optional) {
      highlightError(card.id);  // 未操作 → 标红
      return;
    }
    result.cards[card.id] = value ?? null;
  }
  
  this.pendingCards = [];
  sendToModel(result);
}
```

### 4.3 发送格式

```json
{
  "submit_id": "submit_001",
  "cards": {
    "c1": "C",
    "c2": "B",
    "i1": "列表可以原地修改，元组不行"
  }
}
```

单卡片（无 submit_card）：
```json
{"c1": "C"}
```

**取值规则**：
- choice：选项字母，如 `"C"`，多选为 `["A", "C"]`
- input：输入文本
- confirm：`"yes"` 或 `"no"`
- 未操作的 optional 卡片：`null`

---

## 五、流式渲染

### 5.1 时序

```
t+0.0s  "今天学习可变类型——"        → Markdown 流式渲染
t+0.4s  "<!-- card:choice:c1 -->"   → 骨架屏
t+0.5s  "下面哪个是可变类型？"       → 渲染标题
t+0.6s  "- A. 整数 int"             → 渲染选项 A
t+0.7s  "- B. 字符串 str"           → 渲染选项 B
t+0.8s  "- C. 列表 list"            → 渲染选项 C
t+0.9s  "- D. 元组 tuple"           → 渲染选项 D
t+1.0s  "<!-- /card -->"            → 替换骨架屏
t+1.1s  "回答正确！🎉"              → 继续 Markdown
t+1.4s  "<!-- card:submit:s1 -->"   → 渲染提交按钮
```

### 5.2 解析器

```javascript
class XIUIParser {
  stack = [];         // 卡片栈 [{type, id, attrs}]
  buffer = [];        // 当前卡片内容行
  pendingCards = [];  // 未提交的交互卡片

  feed(line) {
    // 卡片开始：<!-- card:类型:id --> 或 <!-- card:类型:id[@key:value@...] -->
    const start = line.match(/^<!-- card:(\w+):(\w+)(?:\[@(.+)\])? -->$/);
    if (start) {
      const [, type, id, attrStr] = start;
      this.stack.push({ type, id, attrs: this.parseAttrs(attrStr) });
      this.buffer = [];
      createSkeleton(type, id);
      return;
    }

    // 卡片结束
    if (line === '<!-- /card -->') {
      const card = this.stack.pop();
      renderCard(card, this.buffer);
      this.buffer = [];
      if (['choice', 'input', 'confirm'].includes(card.type)) {
        this.pendingCards.push(card);
      }
      if (card.type === 'submit') showSubmitButton(card);
      return;
    }

    // 内容行
    this.buffer.push(line);
    if (this.stack.length > 0) {
      streamUpdate(this.stack[this.stack.length - 1], line);
    } else {
      streamMarkdown(line);
    }
  }

  parseAttrs(s) {
    if (!s) return {};
    const a = {};
    s.split('@').forEach(p => { const [k, ...v] = p.split(':'); if (k) a[k] = v.join(':'); });
    return a;
  }
}
```

### 5.3 内容解析规则

| 卡片 | 解析规则 |
|------|----------|
| choice | 第一行 → question，`- A. xxx` → options |
| tip | `> 💡 标题` → title，其余行 → body |
| input | 第一行 → title，`*（xxx）*` → placeholder |
| progress | `**标题** █████░░░ 70% label` → 提取 |
| summary | Markdown 表格 → title/value/subtitle |
| confirm | `**标题**` → title，`> 确认 \| 取消` → 按钮 |
| chart | 表格 → labels/data，`*说明*` → unit |

---

## 六、消息管理

### 6.1 消息数组

```javascript
messages = [
  { role: "system", content: "你是学习助手..." },
  
  { role: "user", content: "今天学什么？" },
  { role: "assistant", content: "今天学习 Python。\n\n<!-- card:choice:c1 -->\n..." },
  { role: "user", content: '{"c1": "C"}' },
  { role: "assistant", content: "回答正确！\n\n<!-- card:tip:t1 -->\n..." },
  
  { role: "user", content: "继续下一个知识点" }
];
```

### 6.2 消息类型

| 来源 | role | content 格式 |
|------|------|-------------|
| 用户文字 | user | 纯文本 |
| 用户交互 | user | JSON 事件 |
| 模型输出 | assistant | Markdown + XIUI 卡片 |
| 系统提示 | system | 协议定义 |

### 6.3 历史压缩

已完成的 XIUI 交互压缩为摘要，避免卡片注释膨胀：

```javascript
function compressHistory(messages) {
  const compressed = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.content.includes('<!-- card:')) {
      const next = messages[i + 1];
      if (next && next.role === 'user' && isInteractionEvent(next.content)) {
        compressed.push({ role: 'assistant', content: compressToSummary(msg, next) });
        i++;
        continue;
      }
    }
    compressed.push(msg);
  }
  return trimByTokens(compressed, 8000);
}

function compressToSummary(assistantMsg, userEvent) {
  const cards = extractCards(assistantMsg.content);
  const event = JSON.parse(userEvent.content);
  const parts = cards.map(c => {
    if (c.type === 'choice') return `选择了${event.cards[c.id]}`;
    if (c.type === 'input') return `输入了：${event.cards[c.id]}`;
    if (c.type === 'tip') return `展示了「${c.title}」`;
    return '';
  }).filter(Boolean);
  return `[上一轮：${parts.join('；')}]`;
}
```

**压缩策略**：
- 展示卡片 → 压缩为 "展示了{title}"
- 交互卡片 → 压缩为 "选择了{value}" / "输入了{value}"
- 超过 8000 token → 滑动窗口裁剪
- 超过 10 轮 → 调用 LLM 生成会话级摘要

### 6.4 消息生命周期

```
1. 用户输入文字 → push {role:"user", content:"文字"}
2. 模型流式输出 → 解析器逐行 feed → 渲染
3. 流式结束 → 完整 assistant 消息存入 messages
4. 用户操作卡片 → 交互收集器暂存
5. 用户点提交 → 组装事件 → push {role:"user", content: JSON}
6. 回到步骤 2
7. 每轮检查大小 → 超出阈值触发压缩
```

---

## 七、前后端交互

### 7.1 完整时序

```
前端                          后端/模型
 │                              │
 │──── POST /chat ─────────────→│
 │    messages: [system, ...]   │
 │                              │
 │←─── SSE stream ──────────────│
 │    token 逐行流式输出         │
 │    ...<!-- card:choice:c1 --> │  ← 骨架屏
 │    ...<!-- /card -->          │  ← 完整卡片
 │    [流结束]                   │
 │                              │
 │  [用户操作 c1→C, c2→B]        │
 │  [用户点提交]                 │
 │                              │
 │──── POST /chat ─────────────→│
 │    messages: [               │
 │      system,                 │
 │      ...history,             │
 │      assistant: "今天学...", │
 │      user: {"cards":{...}}   │
 │    ]                         │
 │                              │
 │←─── SSE stream ──────────────│
```

### 7.2 前端实现

```javascript
class XIUIChat {
  constructor(systemPrompt) {
    this.messages = [{ role: "system", content: systemPrompt }];
    this.parser = new XIUIParser();
    this.collector = new InteractionCollector();
  }

  async sendMessage(text) {
    this.messages.push({ role: "user", content: text });
    await this.callModel();
  }

  async submitCards(submitId) {
    const result = this.collector.build(submitId, this.parser.pendingCards);
    this.messages.push({ role: "user", content: JSON.stringify(result) });
    this.parser.pendingCards = [];
    await this.callModel();
  }

  async callModel() {
    const trimmed = compressHistory(this.messages);
    
    const stream = await fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: trimmed }),
      headers: { 'Content-Type': 'application/json' }
    });

    let full = '';
    const reader = stream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of new TextDecoder().decode(value).split('\n')) {
        if (!line.trim()) continue;
        full += line + '\n';
        this.parser.feed(line);
      }
    }
    this.messages.push({ role: "assistant", content: full.trim() });
  }
}
```

---

## 八、错误处理

- **解析失败**：降级为普通 Markdown 渲染
- **嵌套不匹配**：栈深度 > 10 时强制重置
- **提交校验失败**：标红未操作卡片，不发送请求

---

## 九、完整示例

### 模型输出

```
今天我们来学习 Python 的可变类型和不可变类型。

<!-- card:choice:c1 -->
下面哪个是可变类型？
- A. 整数 int
- B. 字符串 str
- C. 列表 list
- D. 元组 tuple
<!-- /card -->

<!-- card:choice:c2 -->
下面哪个是引用传递？
- A. 整数 int
- B. 列表 list
<!-- /card -->

<!-- card:submit:s1 -->
提交
<!-- /card -->
```

### 用户操作后前端发送

```json
{"submit_id": "s1", "cards": {"c1": "C", "c2": "B"}}
```

### 模型继续输出

```
回答正确！🎉

<!-- card:tip:t1 -->
> 💡 为什么 list 是可变的？
> 列表在内存中是一块连续的空间。当你执行 `lst[0] = 10` 时，
> 是直接修改了这块空间里的值，而不是创建新列表。
> 元组 tuple 的内存是只读的——任何修改都触发 TypeError。
<!-- /card -->

用你自己的话解释一下：

<!-- card:input:i1 -->
用一句话解释可变类型
*（不超过 100 字）*
<!-- /card -->

<!-- card:submit:s2 -->
提交
<!-- /card -->
```

---

## 附录：模型提示词摘要

将以下内容注入 system prompt：

> 你是学习助手。可以通过 Markdown 输出卡片：`<!-- card:类型:id[@key:value] -->...<!-- /card -->`。card 类型：choice/tip/input/progress/summary/confirm/chart/section/tab/submit。交互卡片（choice/input/confirm）后必须跟 submit。每轮最多 3 张交互卡片。卡片内容用标准 Markdown。