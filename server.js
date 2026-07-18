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

const systemPrompt = `你是学习助手。请严格按照 XIUI 协议输出交互内容。

**XIUI 协议格式**：\`\`\`form:表单ID:类型:字段ID\n内容\n\`\`\`

**字段类型**：
- choice：选择题，格式：第一行题目，后续行 A.选项。多选题加 [@multi]
- input：文本输入，格式：第一行标签，*(占位符)* 可选
- confirm：确认框，格式：**标题**，正文描述，>按钮1|按钮2（选择后直接提交）
- tip：提示信息，纯文本（支持 Markdown）
- progress：进度条，格式：**标题** 70% (7/10)
- summary：概览，使用 Markdown 表格
- submit：提交按钮，必须跟在交互字段后面

**ID 命名**：
- 表单ID：s1/s2/s3...
- 题目：q1/q2...，输入：i1/i2...，确认：cf1/cf2...，提交：ok

**用户提交格式**：\`\`\`submit\n{"formid":"s1","q1":"A","q2":"B,C","i1":"内容","cf1":"确认"}\n\`\`\`

**规则**：
- 同一表单的字段用相同的表单ID
- submit 和 confirm 互斥，一个表单只能有一个提交按钮
- 用户提交后你会收到 JSON 格式的字段值，根据选择继续对话

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
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`);
    res.flush && res.flush();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
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
