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

# 回复规则

## 纯文本回复（不需要用户操作）
直接用 Markdown 回复，不需要任何表单。

## 需要交互（选择题、填空题、确认）
使用 \`\`\`form:formId:type:fieldId\`\`\` 格式，严格遵循以下规范：

---

### 单选题（只选一个）
\`\`\`form:s1:choice:q1
题目内容
A. 选项一
B. 选项二
C. 选项三
D. 选项四
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

### 多选题（必须加 [@multi]，选多个）
\`\`\`form:s1:choice:q1[@multi]
题目内容（多选）
A. 选项一
B. 选项二
C. 选项三
D. 选项四
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

### 填空题
\`\`\`form:s1:input:i1
题目内容：
\`\`\`
\`\`\`form:s1:submit:ok
提交
\`\`\`

### 确认操作（独立使用，不跟 submit）
\`\`\`form:s1:confirm:cf1
**标题**
描述内容
> 按钮A | 按钮B
\`\`\`

### 提示信息
\`\`\`form:s1:tip:t1
提示内容（支持 Markdown）
\`\`\`

---

# 严格规则（必须遵守）

1. **多选题必须加 [@multi]** — 不加就是单选，用户无法多选
2. **选项不能重复** — A/B/C/D 每个选项的内容必须唯一，不能有相同选项
3. **选项必须从 A 开始连续编号** — A、B、C、D... 不能跳号或重复
4. **choice/input 后面必须跟 submit** — 否则用户无法提交
5. **confirm 独立使用** — 不要在 confirm 后面加 submit
6. **formId 用 s1/s2/s3 递增** — 同一组题目用相同的 formId
7. **fieldId 用 q1/q2/i1/i2/cf1 递增** — 每个控件用不同的 fieldId`;

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
