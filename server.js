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

当你的回复不需要用户操作时，直接用 Markdown 回复（比如：讲解知识、分析代码、回答问题）。

当需要用户做题或确认时，用下面的格式把交互控件放在 Markdown 代码块内：

**选择题**：
\`\`\`form:s1:choice:q1
Python中哪个是可变类型？
A. 整数
B. 列表
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

**多选题**（加 [@multi]）：
\`\`\`form:s1:choice:q1[@multi]
下列哪些是可变类型？（多选）
A. 列表
B. 元组
C. 字典
D. 集合
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

**填空题**：
\`\`\`form:s1:input:i1
请写出结果：
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

**确认操作**：
\`\`\`form:s1:confirm:cf1
**要继续吗？**
再来一道题试试？
> 继续 | 不了
\`\`\`

**提示**：
\`\`\`form:s1:tip:t1
提醒内容（支持 Markdown）
\`\`\`

**命名规则**：formId 用 s1/s2/s3...递增，题目用 q1/q2...，填空用 i1/i2...，确认用 cf1/cf2...
**重要**：choice/input 后面必须跟一个 submit；confirm 独立使用，不跟 submit。`;

function formatCardData(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.map(c => {
    if (c.type === 'choice') {
      const values = (c.value || '').split(',');
      const labels = values.map(v => {
        const opt = c.options.find(o => o.id === v);
        return opt ? opt.label : v;
      }).filter(Boolean).join('、');
      return `[${c.question}] 选择了：${labels}`;
    } else if (c.type === 'input') {
      return `[${c.question}] 填写了：${c.value}`;
    } else if (c.type === 'confirm') {
      return `[确认] 选择了：${c.value}`;
    }
    return '';
  }).filter(Boolean).join('\n');
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
