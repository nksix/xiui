/**
 * XIUI 流式解析器
 * 逐字符解析模型输出，识别卡片边界，触发渲染回调
 */
export class Parser {
  constructor(renderer) {
    this.stack = [];           // 卡片栈
    this.buffer = [];          // 当前卡片内容行
    this.pendingCards = [];    // 未提交的交互卡片
    this.renderer = renderer;
    this.inCard = false;
    this.lineBuffer = '';      // 当前行缓冲区（字符累积）
    this.textBuffer = '';      // 已确认的文本缓冲区
  }

  _isCommentStart(line) {
    return line.startsWith('<');
  }

  /**
   * 喂入单个字符（流式传输场景）
   * @param {string} char 单个字符
   */
  feedChar(char) {
    this.lineBuffer += char;
    
    if (char === '\n') {
      const line = this.lineBuffer.slice(0, -1);
      this.lineBuffer = '';
      
      const start = line.match(/^<!-- card:(\w+):(\w+)(?:\[@(.+)\])? -->$/);
      if (start) {
        const [, type, id, attrStr] = start;
        this.stack.push({ type, id, attrs: this._parseAttrs(attrStr) });
        this.buffer = [];
        this.inCard = true;
        this.renderer.onCardStart(type, id);
        return;
      }

      if (line === '<!-- /card -->') {
        const card = this.stack.pop();
        this.renderer.onCardEnd(card, [...this.buffer]);
        this.buffer = [];
        this.inCard = this.stack.length > 0;

        if (['choice', 'input', 'confirm'].includes(card.type)) {
          this.pendingCards.push(card);
        }
        if (card.type === 'submit') {
          this.renderer.onSubmitCard(card);
        }
        return;
      }

      if (this.inCard) {
        this.buffer.push(line);
        this.renderer.onCardLine(this.stack[this.stack.length - 1], line);
      } else {
        if (!line.startsWith('<!--')) {
          this.textBuffer += line + '\n';
          this.renderer.onChar(char, this.textBuffer, false);
        }
      }
    } else {
      if (!this.inCard && !this._isCommentStart(this.lineBuffer)) {
        const previewBuffer = this.textBuffer + this.lineBuffer;
        this.renderer.onChar(char, previewBuffer, false);
      }
    }
  }

  /**
   * 喂入一行文本（向后兼容）
   * @param {string} line
   */
  feed(line) {
    line.split('').forEach(char => this.feedChar(char));
    this.feedChar('\n');
  }

  /**
   * 刷新缓冲区中的剩余内容
   */
  flush() {
    if (this.lineBuffer) {
      const line = this.lineBuffer;
      this.lineBuffer = '';
      
      if (line === '<!-- /card -->' && this.stack.length > 0) {
        const card = this.stack.pop();
        this.renderer.onCardEnd(card, [...this.buffer]);
        this.buffer = [];
        this.inCard = this.stack.length > 0;

        if (['choice', 'input', 'confirm'].includes(card.type)) {
          this.pendingCards.push(card);
        }
        if (card.type === 'submit') {
          this.renderer.onSubmitCard(card);
        }
        return;
      }
      
      if (this.inCard) {
        this.buffer.push(line);
        this.renderer.onCardLine(this.stack[this.stack.length - 1], line);
      } else {
        this.textBuffer += line;
        this.renderer.onChar('', this.textBuffer, false);
      }
    }
  }

  /**
   * 解析属性字符串 "@key:value@key:value"
   * @param {string} s
   * @returns {Object}
   */
  _parseAttrs(s) {
    if (!s) return {};
    const attrs = {};
    s.split('@').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx > 0) attrs[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
    return attrs;
  }

  /**
   * 重置解析器状态
   */
  reset() {
    this.stack = [];
    this.buffer = [];
    this.pendingCards = [];
    this.inCard = false;
  }
}