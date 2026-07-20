/**
 * XIUI 消息管理器
 * 维护 messages 数组，处理历史压缩和裁剪
 */
export class MessageManager {
  constructor(systemPrompt, maxTokens = 8000) {
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.maxTokens = maxTokens;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content) {
    this.messages.push({ role: 'user', content });
  }

  /**
   * 添加模型消息
   */
  addAssistantMessage(content) {
    this.messages.push({ role: 'assistant', content });
  }

  /**
   * 添加交互事件
   */
  addInteractionEvent(event) {
    this.messages.push({ role: 'user', content: JSON.stringify(event) });
  }

  /**
   * 获取压缩后的消息数组（用于发送给模型）
   */
  getCompressed() {
    return this._compress(this.messages);
  }

  /**
   * 压缩历史：已完成的 XIUI 交互压缩为摘要
   */
  _compress(messages) {
    const compressed = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant' && msg.content.includes('<!-- xiui@form:')) {
        const next = messages[i + 1];
        if (next && next.role === 'user' && this._isInteractionEvent(next.content)) {
          compressed.push({
            role: 'assistant',
            content: this._summarize(msg, next)
          });
          i++;
          continue;
        }
      }

      compressed.push(msg);
    }

    return this._trimByTokens(compressed, this.maxTokens);
  }

  _isInteractionEvent(content) {
    try {
      const json = JSON.parse(content);
      return json.cards || json.submit_id;
    } catch {
      return false;
    }
  }

  _summarize(assistantMsg, userEvent) {
    const cards = this._extractCards(assistantMsg.content);
    const event = JSON.parse(userEvent.content);
    const parts = [];

    for (const card of cards) {
      if (card.type === 'choice' && event.cards?.[card.id]) {
        parts.push(`选择了${event.cards[card.id]}`);
      } else if (card.type === 'input' && event.cards?.[card.id]) {
        parts.push(`输入了：${event.cards[card.id]}`);
      } else if (card.type === 'slider' && event.cards?.[card.id]) {
        parts.push(`调节了「${card.title}」为${event.cards[card.id]}`);
      } else if (card.type === 'switch' && event.cards?.[card.id]) {
        parts.push(`设置了「${card.title}」为${event.cards[card.id] === 'true' ? '开启' : '关闭'}`);
      }
    }

    return `[上一轮：${parts.join('；')}]`;
  }

  _extractCards(content) {
    const cards = [];
    const regex = /<!-- xiui@form:(\w+):(\w+)(?:\[@.+?\])? -->/g;
    let match;
    while ((match = regex.exec(content))) {
      cards.push({ type: match[1], id: match[2] });
    }
    return cards;
  }

  _trimByTokens(messages, maxTokens) {
    // 简单估算：1 token ≈ 2 字符
    let total = 0;
    const kept = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const chars = messages[i].content.length;
      if (total + chars / 2 > maxTokens) break;
      kept.unshift(messages[i]);
      total += chars / 2;
    }

    return kept;
  }
}