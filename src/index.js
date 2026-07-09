export { Parser } from './parser.js';
export { Renderer } from './renderer.js';
export { Collector } from './collector.js';
export { MessageManager } from './message-manager.js';

export class XIUIChat {
  constructor({ systemPrompt, fetchChat, renderer }) {
    this.manager = new MessageManager(systemPrompt);
    this.collector = new Collector();
    this.fetchChat = fetchChat;
    this.renderer = renderer;
  }

  async sendMessage(text) {
    this.manager.addUserMessage(text);
    await this._callModel();
  }

  async submitCards(submitId) {
    const { valid, result, errors } = this.collector.build(submitId, this.pendingCards);
    
    if (!valid) {
      return { success: false, errors };
    }

    this.manager.addInteractionEvent(result);
    this.pendingCards = [];
    this.collector.reset();
    await this._callModel();
    
    return { success: true };
  }

  async _callModel() {
    const messages = this.manager.getCompressed();
    const stream = await this.fetchChat(messages);
    
    let fullResponse = '';
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const parser = new Parser({
      onText: (buffer) => {
        if (this.renderer.onText) this.renderer.onText(buffer);
      },
      onCard: (card) => {
        if (['choice', 'input', 'confirm'].includes(card.type)) {
          this.pendingCards.push(card);
        }
        if (this.renderer.onCard) this.renderer.onCard(card);
      },
      onStateChange: (from, to) => {
        if (this.renderer.onStateChange) this.renderer.onStateChange(from, to);
      }
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      for (const char of chunk) {
        fullResponse += char;
        parser.feedChar(char);
      }
    }

    parser.flush();
    this.manager.addAssistantMessage(fullResponse.trim());
    return fullResponse;
  }
}