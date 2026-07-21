# XIUI

聊天流式 UI SDK，支持渐进式渲染 Markdown 和交互式卡片。Plugin 采用 Vue/React 风格的**声明式模板 + 响应式状态**——数据变了，UI 自动变。

## 快速开始

```html
<script type="module">
import { XIUIChat, XIUIPlugin } from 'xiui';

class MyChoice extends XIUIPlugin {
  render() {
    return this.data.options.map(o =>
      `<span class="opt" data-id="${o.id}">${o.label}</span>`
    ).join('');
  }
  afterRender(el) {
    el.querySelectorAll('.opt').forEach(opt => {
      opt.onclick = () => this.setValue(opt.dataset.id);
    });
  }
}

const chat = new XIUIChat({
  md: markdownit(),
  plugins: { choice: MyChoice }
});

chat.createStream(document.getElementById('messages'));
chat.feed('```xiui@form:choice:c1\n题目？\nA. 选项A\nB. 选项B\n```');
chat.flush();
</script>
```

## 协议格式

使用 fenced code block 定义卡片：

```
xiui@form:表单ID:类型:字段ID[@属性]
内容
```

| 格式 | 参数 | 说明 |
|------|------|------|
| 标准 | `xiui@form:formId:type:typeId` | formId 汇聚同一表单，typeId 唯一标识字段 |
| 兼容 | `xiui@form:type:typeId` | formId 自动设为 `default`，兼容旧写法 |

**属性语法**：在字段 ID 后追加 `[@attr]` 或 `[@key:val]`，多个属性用 `@` 连接：
- `[@multi]` — 标记为多选（choice 专用），等价于 `{multi: true}`
- `[@multi@min:1]` — 多选且最少选1项

### 示例

**标准格式（多选题）**：

```
xiui@form:s1:choice:q2[@multi]
下列哪些是可变类型？（多选）
A. 列表
B. 字符串
C. 字典
D. 元组
```

**兼容格式（默认 formId='default'）**：

```
xiui@form:choice:c1
哪个是可变类型？
A. 整数 int
B. 字符串 str
C. 列表 list
```

## XIUIChat

核心聊天类，每个实例是一个独立的 **session**，管理本次对话的所有状态。

```javascript
const chat = new XIUIChat({
  md: markdownitInstance,    // Markdown 渲染器（推荐，自动注入）
  plugins: { ... },          // 插件注册（类或对象）
  autoFlush: 2000,           // 空闲自动结束（毫秒），0 为禁用

  // 回调（可选，覆盖内建渲染）
  onText: (text) => {},           // 文本流式更新
  onCardBegin: (formId, type, typeId) => {},  // 卡片开始 → 骨架屏
  onCardUpdate: (text) => {},     // 卡片内容预览
  onCard: (card, el) => {},       // 卡片就绪（el 已渲染）
  onDone: () => {},               // 流结束
  onEvent: (plugin, event, detail) => {}  // 卡片事件
});

// 流式渲染
const stream = chat.createStream(container);
chat.feed(text);    // 流式喂入（自动 flush）
chat.flush();       // 手动结束流

// 批量渲染
chat.render(text);  // 返回 HTML
chat.mount(el, text); // 渲染到容器
```

### Session 状态管理

```javascript
chat.submit(formId);        // 提交指定 formId 的表单
chat.isSubmitted(formId);   // 是否已提交
chat.getCards(type);        // 获取卡片列表（可选类型过滤）
chat.getPlugin(typeId);     // 获取 plugin 实例（读取值/状态）
chat.reset();               // 重置 session
```

## XIUIPlugin（插件基类）

Plugin 设计哲学：**数据/逻辑/状态/事件自闭环**，像 Vue/React 组件一样独立运作。

| 方法 | 说明 |
|------|------|
| `parse(lines)` | 纯函数，协议行 → 结构化数据 |
| `init(ctx)` | 初始化上下文，设置默认值 |
| `render()` | 声明式模板，返回 HTML 字符串 |
| `afterRender(el)` | DOM 就绪后绑定事件（每次重渲染后调用） |
| `setValue(v)` | 更新状态 → **自动触发 render() + afterRender()** |
| `getValue()` | 返回当前值 |
| `disable()` | 标记已提交，冻结交互 |
| `emit(event, detail)` | 向外部发送事件 |
| `validate()` | 校验当前值是否有效 |

### 完整示例：自定义投票卡片

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
    return { title, options };
  }

  render() {
    const { title, options } = this.data;
    return `
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
  }

  afterRender(el) {
    const { options } = this.data;
    el.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        options[idx].votes++;
        this.setValue(options[idx].votes);
      };
    });
  }
}
```

### 注册方式

```javascript
// 方式一：传入 XIUIPlugin 子类（推荐）
const chat = new XIUIChat({
  md: markdownit(),
  plugins: { poll: PollPlugin }
});

// 方式二：旧式对象字面量（自动包装为类，向后兼容）
const chat = new XIUIChat({
  md: markdownit(),
  plugins: {
    choice: {
      parse(lines) { /* 解析 */ },
      render(card, el) { /* card.setValue(), card.data 等旧 API */ }
    }
  }
});
```

## 内置插件

| 插件类 | 卡片类型 | 说明 |
|--------|----------|------|
| `ChoicePlugin` | choice | 选择题，支持单选/多选（`[@multi]`） |
| `InputPlugin` | input | 文本输入，解析标签和占位符 |
| `ConfirmPlugin` | confirm | 确认对话框，选择后直接提交 |
| `SliderPlugin` | slider | 滑块，解析标签和 `min-max-step-value` |
| `SwitchPlugin` | switch | 开关，解析标签和默认状态 `true/false` |
| `SubmitPlugin` | submit | 提交按钮，收集同一 formId 的字段值 |

## 示例页面

| 名称 | 说明 |
|------|------|
| chat.html | 完整 AI 聊天应用，包含流式渲染、思考过程、公式渲染、XIUI 表单交互 |

## 技术栈

- **Markdown**: markdown-it
- **公式**: KaTeX（示例中使用）
- **语言**: ES Module (ES6+)

## Chat Demo

`examples/chat.html` 是一个完整的 AI 聊天应用示例，包含：

- **流式 SSE**：通过 `server.js` 代理 OpenAI 兼容 API，支持流式输出
- **思考过程展示**：自动捕获模型的 `reasoning_content`（如 DeepSeek R1），以折叠面板展示思考过程
- **XIUI 表单交互**：选择题、多选题、输入框、确认框等，用户填写后提交给模型继续对话
- **System Prompt 控制**：自动注入 XIUI 协议规则，模型按需输出交互表单

### 启动

```bash
# 配置 .env
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-reasoner

# 启动
node server.js
# 访问 http://localhost:3000/examples/chat.html
```

## 开发

```bash
npm run dev
open http://localhost:3000/examples/chat.html
```

## License

MIT
