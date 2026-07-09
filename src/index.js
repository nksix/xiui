/**
 * XIUI — Xuanhua Interactive User Interface
 * 生成式可交互 UI 协议
 */
export { Parser } from './parser.js';
export { Renderer } from './renderer.js';
export { Collector } from './collector.js';
export { MessageManager } from './message-manager.js';

/**
 * XIUI Chat 完整封装
 * 
 * @example
 * const chat = new XIUIChat({
 *   systemPrompt: '你是学习助手...',
 *   fetchChat: async (messages) => { ... }  // 返回 ReadableStream
 * });
 * 
 * await chat.sendMessage('今天学什么？');
 * await chat.submitCards('submit_001');
 */
export class XIUIChat {
  constructor({ systemPrompt, fetchChat, renderer }) {
    this.manager = new MessageManager(systemPrompt);
    this.parser = new Parser(renderer);
    this.collector = new Collector();
    this.fetchChat = fetchChat;
  }

  async sendMessage(text) {
    this.manager.addUserMessage(text);
    await this._callModel();
  }

  async submitCards(submitId) {
    const { valid, result, errors } = this.collector.build(submitId, this.parser.pendingCards);
    
    if (!valid) {
      return { success: false, errors };
    }

    this.manager.addInteractionEvent(result);
    this.parser.pendingCards = [];
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        fullResponse += line + '\n';
        this.parser.feed(line);
      }
    }

    this.manager.addAssistantMessage(fullResponse.trim());
    return fullResponse;
  }
}