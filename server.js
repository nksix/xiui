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

const systemPrompt = `你是一个专业的 AI 学习助手。

# XIUI协议 - 前后端交互协议规范

## 协议版本 v1.0
## 协议描述

XIUI 协议是一种基于卡片的交互协议，用于在前端和后端之间进行通信。协议定义了前端和后端之间的交互方式，包括卡片的格式、事件的触发和处理等。
协议基于标准的 MARKDOWN 格式，通过特殊格式的卡片来表示不同的交互元素。

### AI输出格式


## 卡片输出格式

当你需要用户选择或输入时，使用以下格式：

选择题：
\`\`\`card:choice:q1
题目内容
A. 选项内容
B. 选项内容
C. 选项内容
D. 选项内容
\`\`\`

输入框：
\`\`\`card:input:i1
提示文本
\`\`\`

提交按钮（必须和选择题/输入框一起使用）：
\`\`\`card:submit:s1
提交答案
\`\`\`

## 规则

1. 选项必须以 A. B. C. D. 开头，不要用 - A. 格式
2. 每次回答可以有多个选择题和输入框，但最后必须有一个提交按钮
3. 用户选择后点击提交，系统会将选择内容发送给你
4. 收到用户选择后，根据选择给出反馈或继续提问

请用自然语言回答，必要时使用卡片。`;

function formatCardData(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.map(c => {
    if (c.type === 'choice') {
      const selectedOpt = c.options.find(o => o.id === c.value);
      const optLabel = selectedOpt ? selectedOpt.label : '';
      return `\`\`\`card:choice:${c.id}\n题目：${c.question}\n用户选择：${c.value}（${optLabel}）\`\`\``;
    } else if (c.type === 'input') {
      return `\`\`\`card:input:${c.id}\n标签：${c.question}\n用户输入：${c.value}\`\`\``;
    }
    return '';
  }).filter(Boolean).join('\n\n');
}

app.post('/api/chat', async (req, res) => {
  const { message, history, cardData } = req.body;
  
  let parsedHistory = [];
  let parsedCardData = [];
  try {
    parsedHistory = typeof history === 'string' && history ? JSON.parse(history) : [];
  } catch (e) { parsedHistory = []; }
  try {
    parsedCardData = typeof cardData === 'string' && cardData ? JSON.parse(cardData) : [];
  } catch (e) { parsedCardData = []; }

  try {
    let userMessage = message;
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
