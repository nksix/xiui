import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.', { maxAge: 0, etag: false }));
app.use('/npm', express.static(join(__dirname, 'node_modules')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
});

const systemPrompt = "你是一个专业的一对一辅导老师，遵循 诊断 -> 评估 ->辅导 -> 提升 的教学流程\n" + readFileSync(join(__dirname, 'spec', 'prompt.md'), 'utf-8');

// ---- 日志 ----
const LOG_DIR = join(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = join(LOG_DIR, 'chat.log');
const log = (label, data) => {
  const ts = new Date().toISOString();
  const line = `\n=== ${label} [${ts}] ===\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}\n`;
  appendFileSync(LOG_FILE, line);
};

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  
  let parsedHistory = [];
  try {
    parsedHistory = typeof history === 'string' && history ? JSON.parse(history) : (Array.isArray(history) ? history : []);
  } catch (e) { parsedHistory = []; }

  try {
    const userMessage = message + '\n\n遵循 XIUI 协议 回复';

    // 过滤 history 中与当前 message 内容相同的 user 消息，避免重复发送
    const cleanHistory = parsedHistory.filter(h => {
      if (!h || !h.content) return false;
      if (h.role === 'user' && h.content.trim() === message.trim()) return false;
      return true;
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.role === 'assistant'
          ? h.content.replace(/```form:/g, '```xiui@form:')
          : h.content
      })),
      { role: 'user', content: userMessage }
    ];
    log('REQ → AI', { messages: messages.map(m => ({ role: m.role, content: m.content.slice(0, 500) + (m.content.length > 500 ? '...' : '') })) });

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
    let buf = '';
    let fullResponse = ''; // 用于日志记录
    const send = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      res.flush && res.flush();
    };
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta || {};
      const reasoning = delta.reasoning_content || '';
      let content = delta.content || '';

      if (reasoning) {
        hasReasoning = true;
        fullResponse += reasoning;
        send({ reasoning_content: reasoning });
      }
      if (content) {
        if (hasReasoning) {
          hasReasoning = false;
          send({ reasoning_end: true });
        }
        // 流式清洗：```form: → ```xiui@form:
        buf += content;
        buf = buf.replace(/```form:/g, '```xiui@form:');
        // 保留可能被流式截断的 ``` 前缀，其余发出
        let hold = 0;
        const prefixes = ['```', '``', '`'];
        for (const p of prefixes) {
          if (buf.endsWith(p) && buf.length > p.length) { hold = p.length; break; }
        }
        let toSend;
        if (hold > 0) {
          toSend = buf.slice(0, -hold);
          send({ content: toSend });
          buf = buf.slice(-hold);
        } else {
          toSend = buf;
          send({ content: buf });
          buf = '';
        }
        fullResponse += toSend;
      }
    }
    if (buf) {
      const final = buf.replace(/```form:/g, '```xiui@form:');
      send({ content: final });
      fullResponse += final;
    }

    log('AI → RSP', fullResponse);
    send({ done: true });
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
  console.log(`Chat demo: http://localhost:${port}/examples/`);
});
