# XIUI - Markdown 生成式 UI 协议

> 基于 Markdown 的流式渲染 UI 协议，让 AI 模型输出实时可交互界面。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 快速预览

模型输出一段 Markdown + 卡片，前端实时解析渲染为可交互组件：

```markdown
今天我们来学习 Python 的**可变类型**。

<!-- card:choice:c1 -->
下面哪个是可变类型？
- A. 整数 int
- B. 字符串 str
- C. 列表 list
- D. 元组 tuple
<!-- /card -->

<!-- card:tip:t1 -->
> 💡 可变类型可以在原地修改，不可变类型每次修改都会创建新对象。
<!-- /card -->

<!-- card:progress:p1 -->
**学习进度** 50% (1/2)
<!-- /card -->

<!-- card:submit:s1 -->
提交答案
<!-- /card -->
```

前端渲染效果：

- 📝 普通文本 → Markdown 格式化渲染
- 🎯 选择题卡片 → 可点击选项，自动收集选择
- 💡 提示卡片 → 高亮引用块展示
- 📊 进度卡片 → 进度条动画
- 🚀 提交按钮 → 批量校验并提交

---

## 核心特性

- **字符级别流式渲染** — 逐字符解析，实时渲染，打字机效果流畅自然
- **Markdown 原生** — 卡片内容用标准 Markdown，不引入新语法
- **优雅降级** — HTML 注释标签自动隐藏，不解析时看到纯 Markdown
- **零依赖** — 纯 JavaScript ES Module，无框架依赖
- **多卡片支持** — choice / tip / input / progress / summary / confirm / submit
- **批次提交** — 交互卡片通过 submit 整批提交，前端校验
- **跨模型兼容** — 与模型无关，OpenAI / Claude / Gemini 均可使用

---

## 快速开始

### 浏览器直接使用

```html
<script type="module">
  import { Parser, Renderer } from './src/index.js';
  
  class MyRenderer extends Renderer {
    onChar(char, textBuffer, inCard) {
      // 字符级别渲染回调
      this.renderText(textBuffer);
    }
    
    onCardStart(type, id) {
      // 卡片开始，创建预览容器
    }
    
    onCardLine(card, line) {
      // 卡片内容逐行到达
    }
    
    onCardEnd(card, lines) {
      // 卡片结束，渲染完整组件
      const data = Renderer.extractData(card, lines);
      this.renderCard(card.type, data);
    }
    
    onSubmitCard(card) {
      // 渲染提交按钮
    }
  }
  
  const renderer = new MyRenderer();
  const parser = new Parser(renderer);
  
  // 逐字符喂入模型输出
  for (const char of modelOutput) {
    parser.feedChar(char);
  }
  parser.flush();
</script>
```

### 运行示例

```bash
# 启动本地服务器
python3 -m http.server 8080

# 打开浏览器访问
open http://localhost:8080/examples/basic.html
```

---

## 协议语法

### 卡片格式

```markdown
<!-- card:类型:ID -->
卡片内容（标准 Markdown）
<!-- /card -->
```

### 支持的卡片类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `choice` | 选择题 | 单选/多选题目 |
| `tip` | 提示信息 | 知识点讲解 |
| `input` | 文本输入 | 表单填写 |
| `progress` | 进度展示 | 学习进度 |
| `summary` | 总结表格 | 数据汇总 |
| `confirm` | 确认弹窗 | 操作确认 |
| `submit` | 提交按钮 | 批量提交 |

### 交互提交

用户操作卡片后，前端收集并提交：

```json
{
  "submit_id": "s1",
  "cards": {
    "c1": "C",
    "i1": "用户输入内容",
    "confirm1": "yes"
  }
}
```

---

## API 文档

### Parser

流式解析器，逐字符喂入模型输出，识别卡片边界并触发渲染回调。

```javascript
const parser = new Parser(renderer);

parser.feedChar(char);  // 喂入单个字符
parser.feed(line);      // 喂入一行文本（向后兼容）
parser.flush();         // 刷新缓冲区剩余内容
parser.reset();         // 重置解析器状态
```

**属性**：
- `pendingCards` — 当前批次的交互卡片列表

### Renderer

渲染器基类，继承此类实现自定义渲染逻辑。

```javascript
class MyRenderer extends Renderer {
  onChar(char, textBuffer, inCard)    // 字符级别回调（流式渲染）
  onCardStart(type, id)               // 卡片开始
  onCardLine(card, line)              // 卡片内容逐行到达
  onCardEnd(card, lines)              // 卡片结束，渲染完整组件
  onSubmitCard(card)                  // 检测到 submit 卡片
}
```

**静态方法**：
- `Renderer.extractData(card, lines)` — 从卡片内容中提取结构化数据

### Collector

交互事件收集器，暂存用户操作，批次提交时组装事件。

```javascript
const collector = new Collector();

collector.onChoiceSelect(cardId, optionId)  // 记录选项选择
collector.onInput(cardId, text)             // 记录文字输入
collector.onConfirm(cardId, action)         // 记录确认操作

const { valid, result, errors } = collector.build(submitId, pendingCards);
// valid: true → result 包含提交数据
// valid: false → errors 包含未操作的卡片列表
```

---

## 示例

### 基础示例

[examples/basic.html](examples/basic.html) — 展示所有卡片类型的渲染和交互，包含模拟流式输出、深色主题、LaTeX 公式渲染。

直接用浏览器打开即可运行，支持数据集切换测试。

---

## 技术栈

- **核心**: JavaScript ES Module (零依赖)
- **Markdown 渲染**: [marked.js](https://marked.js.org/)
- **LaTeX 公式**: [KaTeX](https://katex.org/)

---

## 浏览器兼容性

- Chrome 89+
- Firefox 90+
- Safari 15+
- Edge 89+

---

## 与框架集成

### React

```jsx
import { Parser, Renderer } from 'xiui';

class ReactRenderer extends Renderer {
  constructor(setContent) {
    super();
    this.setContent = setContent;
  }
  
  onChar(char, textBuffer) {
    this.setContent(prev => prev + char);
  }
  
  onCardEnd(card, lines) {
    // 渲染卡片组件
  }
}
```

### Vue

```javascript
import { Parser, Renderer } from 'xiui';

export default {
  data() {
    return { content: '' };
  },
  mounted() {
    const renderer = new Renderer();
    renderer.onChar = (char, textBuffer) => {
      this.content = textBuffer;
    };
    this.parser = new Parser(renderer);
  }
}
```

---

## 开发

```bash
git clone https://github.com/nksix/xiui.git
cd xiui

# 启动开发服务器
python3 -m http.server 8080

# 打开示例测试
open http://localhost:8080/examples/basic.html
```

---

## License

MIT