import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.', { maxAge: 0, etag: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
});

const systemPrompt = `你是学习助手。

**重要：只有需要用户交互时才使用 XIUI 表单。纯信息回复请直接用 Markdown 格式输出，不要使用表单。**

**XIUI 协议格式**（仅用于需要用户选择/输入/确认的场景）：\`\`\`form:表单ID:类型:字段ID\n内容\n\`\`\`

**字段类型**：
- choice：选择题，第一行题目，后续行 A.选项。多选题加 [@multi]
- input：文本输入，第一行标签，*(占位符)* 可选
- confirm：确认框（**独立使用，不需要 choice/input**），格式：**标题**，正文描述，>按钮1|按钮2（选择后直接提交）
- tip：提示信息，纯文本（支持 Markdown）
- progress：进度条，格式：**标题** 70% (7/10)
- summary：概览，使用 Markdown 表格
- submit：提交按钮（**必须跟在 choice/input 后面**）

**ID 命名**：
- 表单ID：s1/s2/s3...
- 题目：q1/q2...，输入：i1/i2...，确认：cf1/cf2...，提交：ok

**用户提交格式**：\`\`\`submit\n{"formid":"s1","q1":"A","i1":"内容","cf1":"确认"}\n\`\`\`

**核心规则**：
1. 纯知识讲解、概念介绍、代码示例等不需要用户互动的场景 → **直接输出 Markdown，不要使用任何 form**
2. 需要用户填写内容（选择题、输入框）→ 使用 choice/input + submit
3. 只需要用户确认/二选一（如"继续挑战？""确认提交？"）→ 使用 confirm（**不搭配 choice/input/submit**）
4. **submit 和 confirm 绝对不能在同一个表单中同时出现**！

**示例1 - 纯文本回复（无交互）**：
Python 是一种解释型、面向对象的高级编程语言。
- **特点**：简洁易读、跨平台
- **常见用途**：Web开发（Django/Flask）、数据科学（NumPy/Pandas）

**示例2 - 选择题（有交互）**：
\`\`\`form:s1:choice:q1
下面哪个是可变类型？
A. 整数 int
B. 列表 list
\`\`\`
\`\`\`form:s1:submit:ok
提交答案
\`\`\`

**示例3 - 确认框（有交互）**：
\`\`\`form:s2:confirm:cf1
**还想继续挑战吗？**
可以再来一道关于集合或字符串的题目。
> 继续挑战 | 不，谢谢
\`\`\``;

function formatCardData(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.map(c => {
    if (c.type === 'choice') {
      const values = (c.value || '').split(',');
      const labels = values.map(v => {
        const opt = c.options.find(o => o.id === v);
        return opt ? opt.label : v;
      }).filter(Boolean).join(', ');
      return `\`\`\`form:${c.formId}:choice:${c.id}\n${c.question}\n用户选择：${c.value}（${labels}）\`\`\``;
    } else if (c.type === 'input') {
      return `\`\`\`form:${c.formId}:input:${c.id}\n${c.question}\n用户输入：${c.value}\`\`\``;
    } else if (c.type === 'confirm') {
      return `\`\`\`form:${c.formId}:confirm:${c.id}\n用户选择：${c.value}\`\`\``;
    }
    return '';
  }).filter(Boolean).join('\n\n');
}

app.post('/api/chat', async (req, res) => {
  const { message, history, cardData } = req.body;
  
  let parsedHistory = [];
  try {
    parsedHistory = typeof history === 'string' && history ? JSON.parse(history) : (Array.isArray(history) ? history : []);
  } catch (e) { parsedHistory = []; }

  try {
    let userMessage = message;
    const parsedCardData = Array.isArray(cardData) ? cardData : [];
    if (parsedCardData.length > 0) {
      userMessage += '\n\n' + formatCardData(parsedCardData);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...parsedHistory.filter(h => h && h.content).map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      })),
      { role: 'user', content: userMessage }
    ];

    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      stream: true,
      temperature: 0.7
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`);
    res.flush && res.flush();

    let hasReasoning = false;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta || {};
      const reasoning = delta.reasoning_content || '';
      const content = delta.content || '';

      if (reasoning) {
        hasReasoning = true;
        res.write(`data: ${JSON.stringify({ reasoning_content: reasoning })}\n\n`);
        res.flush && res.flush();
      }
      if (content) {
        if (hasReasoning) {
          // reasoning 结束后发一个分隔标记
          hasReasoning = false;
          res.write(`data: ${JSON.stringify({ reasoning_end: true })}\n\n`);
          res.flush && res.flush();
        }
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        res.flush && res.flush();
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.flush && res.flush();
    res.end();
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`XIUI Server running on http://localhost:${port}`);
  console.log(`Chat demo: http://localhost:${port}/examples/chat.html`);
});
