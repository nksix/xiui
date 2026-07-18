# XIUI

聊天流式 UI SDK，支持渐进式渲染 Markdown 和交互式卡片。

## 快速开始

```html
<script type="module">
import { XIUIChat } from 'xiui';

const chat = new XIUIChat({
  cards: {
    choice: {
      render(card, el) {
        el.innerHTML = card.data.question + card.data.options.map(o =>
          `<span data-id="${o.id}">${o.label}</span>`
        ).join('');
      }
    }
  },
  onText: text => { /* 文本更新 */ },
  onCard: (card, el) => { /* 卡片就绪 */ }
});

chat.feed('```card:choice:c1\n题目？\n- A. 选项A\n```');
chat.flush();
</script>
```

## 协议格式

使用 fenced code block 定义卡片：

```markdown
```card:type:id
内容行1
内容行2
```
```

**参数说明**：
- `type` — 卡片类型，如 `choice`, `input`, `poll`，决定使用哪个插件渲染
- `id` — 卡片唯一标识，如 `c1`, `p1`，用于跟踪值和提交数据

**示例**：

```markdown
```card:choice:c1
哪个是可变类型？
- A. 整数 int
- B. 字符串 str
- C. 列表 list
```
```

## XIUIChat

核心聊天类，每个实例是一个独立的 **session**，管理本次对话的所有状态。

```javascript
const chat = new XIUIChat({
  md: markdownitInstance,    // 可选，用于批量模式渲染
  cards: { ... },            // 卡片插件注册
  autoFlush: 2000,           // 空闲自动结束（毫秒），0 为禁用
  onText: (text) => {},      // 文本流式更新
  onCardBegin: (type, id) => {},   // 卡片开始 → 骨架屏
  onCardUpdate: (text) => {},      // 卡片内容预览
  onCard: (card, el) => {},        // 卡片就绪（el 已渲染）
  onDone: () => {},                // 流结束
  onEvent: (card, type, detail) => {}  // 卡片事件
});

chat.feed(text);   // 流式喂入（自动 flush）
chat.send(text);   // 立即发送并 flush（当 autoFlush=0 时）
chat.flush();      // 手动结束流
chat.render(text); // 批量渲染返回 HTML
chat.mount(el, text); // 批量渲染到容器
```

### Session 状态管理

每个 `XIUIChat` 实例自动管理以下状态：

```javascript
chat.setValue('cardId', 'value');   // 设置卡片值
chat.getValue('cardId');            // 获取卡片值
chat.getAllValues();                // 获取所有卡片值

chat.getCards();                    // 获取所有卡片
chat.getCards('choice');            // 获取指定类型的卡片

chat.validate();                    // { valid: true/false, missing: [] }
chat.submit();                      // { success, data, cards }
chat.isSubmitted();                 // 是否已提交
chat.reset();                       // 重置 session
```

### card 对象

传递给 `render` 和 `event` 的卡片对象：

```javascript
card = {
  type: 'choice',    // ← 从协议 ```card:choice:c1 解析
  id: 'c1',          // ← 从协议 ```card:choice:c1 解析
  data: { ... },     // ← parse() 返回的结构化数据
  attrs: { ... },    // ← 卡片属性 @key:val
  lines: [...],      // ← 原始行内容
  text: '...',       // ← 原始文本
  
  setValue(value)    // 设置当前卡片的值
  getValue()         // 获取当前卡片的值
  trigger(type, detail) // 触发事件
};
```

**数据来源总结**：

| 字段 | 来源 | 说明 |
|------|------|------|
| `type` | 协议 ````card:type:id```` | 卡片类型 |
| `id` | 协议 ````card:type:id```` | 卡片唯一标识 |
| `data` | 插件 `parse(lines)` | 解析后的结构化数据 |
| `value` | 用户交互 `setValue()` | 用户设置的值 |

## XIUIPlugin（插件基类）

通过继承基类实现自定义卡片，三个方法形成完整的数据闭环：

```
协议内容 → parse(lines) → card.data → render(card, el) → DOM事件 → setValue → submit()
```

### 完整示例：自定义投票卡片

**步骤 1：定义协议**

```markdown
```card:poll:p1
**今天吃什么？**
- 🍔 汉堡
- 🍕 披萨
- 🍜 拉面
```
```

**步骤 2：实现插件**

```javascript
import { XIUIPlugin } from 'xiui';

class PollPlugin extends XIUIPlugin {
  parse(lines) {
    const titleMatch = lines[0]?.match(/\*\*(.+?)\*\*/);
    const title = titleMatch?.[1] || lines[0] || '';
    const options = [];
    
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^- (.+?)\s+(.+)$/);
      if (m) options.push({ emoji: m[1], label: m[2], votes: 0 });
    }
    
    return { title, options };  // ← 返回的数据存入 card.data
  }

  render(card, el) {
    const { title, options } = card.data;  // ← 使用 parse 解析的数据
    
    el.innerHTML = `
      <h3>${title}</h3>
      <div class="poll-options">
        ${options.map((opt, idx) => `
          <button data-idx="${idx}">
            ${opt.emoji} ${opt.label} 
            <span>${opt.votes}票</span>
          </button>
        `).join('')}
      </div>
    `;

    el.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        options[idx].votes++;
        card.setValue(options[idx].votes);  // ← 设置卡片值
        btn.querySelector('span').textContent = `${options[idx].votes}票`;
      };
    });
  }

  event(card, type, detail) {
    // type: 事件类型（如 'click', 'change'）
    // detail: 事件详情，包含 oldValue, newValue
    console.log(`[${card.id}] ${type}: ${detail.oldValue} → ${detail.newValue}`);
  }
}
```

**步骤 3：注册使用**

```javascript
const chat = new XIUIChat({
  cards: { poll: new PollPlugin() },
  onEvent: (card, type, detail) => {
    console.log(`[全局] ${card.id} :: ${type}`, detail);
  }
});
```

### 两种注册方式

**方式一：继承基类（推荐）**

完全自定义 `parse`、`render`、`event`：

```javascript
class MyCardPlugin extends XIUIPlugin {
  parse(lines) { return { /* 解析数据 */ }; }
  render(card, el) { /* 渲染 DOM */ }
  event(card, type, detail) { /* 处理事件 */ }
}

const chat = new XIUIChat({
  cards: { mycard: new MyCardPlugin() }
});
```

**方式二：对象字面量（覆盖部分方法）**

复用内置 `parse`，仅自定义 `render`：

```javascript
const chat = new XIUIChat({
  cards: {
    choice: {
      render(card, el) {
        // card.data 已由内置 parse 填充
        const { question, options } = card.data;
        el.innerHTML = `<div>${question}</div>`;
      }
    }
  }
});
```

## 内置插件

| 插件类 | 卡片类型 | 说明 |
|--------|----------|------|
| `ChoicePlugin` | choice | 选择题卡片，解析选项并渲染可点击按钮 |
| `TipPlugin` | tip | 提示卡片，解析引用内容 |
| `ProgressPlugin` | progress | 进度卡片，解析标题、百分比、标签 |
| `SubmitPlugin` | submit | 提交按钮卡片 |
| `InputPlugin` | input | 输入框卡片，解析标题和占位符 |
| `SummaryPlugin` | summary | 总结卡片，解析表格内容 |
| `ConfirmPlugin` | confirm | 确认对话框卡片 |

## 示例数据集

| 名称 | 说明 |
|------|------|
| basic | 基础选择题 + 提示 + 进度条 |
| math | 公式渲染测试 |
| multiple | 多卡片验证测试 |
| form | 表单输入测试 |
| summary | 总结卡片测试 |
| confirm | 确认对话框测试 |
| complex | 复杂内容（代码、公式、表格）测试 |

## 技术栈

- **Markdown**: markdown-it
- **公式**: KaTeX（示例中使用）
- **语言**: ES Module (ES6+)

## 开发

```bash
# 启动开发服务器
python3 -m http.server 8080

# 访问示例页面
open http://localhost:8080/examples/basic.html
```

## License

MIT
