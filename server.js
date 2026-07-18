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
app.use(express.static('.'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
});

const systemPrompt = `你是学习助手。可以通过 Markdown 代码块输出交互表单：\`\`\`form:form_id:类型:type_id\`\`\`...\`\`\`

**协议格式**：\`\`\`form:表单ID:类型:字段ID\`\`\`...\`\`\`

**字段类型**：
- choice：选择题，格式：第一行题目，后续行 A. 选项
- input：文本输入，格式：第一行标签，\`*(占位符)*\` 可选
- confirm：确认框，格式：\`**标题**\`，正文描述，\`> 按钮1 | 按钮2\`
- tip：提示信息，纯文本
- progress：进度条，格式：\`**标题** 70% (7/10)\`
- summary：概览，Markdown 表格
- submit：提交按钮，必须跟在交互字段后面

**ID 命名**：
- form_id：用 s1/s2/s3... 表示每次回复的表单
- choice：用 q1/q2，input：用 i1/i2，tip：用 t1/t2，submit：用 ok

**用户提交格式**：\`\`\`submit\n{"formid":"s1","q1":"A"}\n\`\`\`，其中 formid 是表单 ID，字段 ID 对应你输出的 type_id。

**交互流程**：用户提交后你会收到 JSON 格式的字段值。你根据用户的选择继续对话。

**示例**：
\`\`\`form:s1:choice:q1
下面哪个是可变类型？
A. 整数 int
B. 列表 list
\`\`\`

\`\`\`form:s1:submit:ok
提交答案
\`\`\``;

function formatCardData(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.map(c => {
    if (c.type === 'choice') {
      const selectedOpt = c.options.find(o => o.id === c.value);
      const optLabel = selectedOpt ? selectedOpt.label : '';
      return `\`\`\`form:${c.formId}:choice:${c.id}\n${c.question}\n用户选择：${c.value}（${optLabel}）\`\`\``;
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
      'Connection': 'keep-alive'
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
