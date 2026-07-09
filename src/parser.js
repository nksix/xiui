/**
 * XIUI 流式解析器
 * 逐行解析模型输出，识别卡片边界，触发渲染回调
 */
export class Parser {
  constructor(renderer) {
    this.stack = [];         // 卡片栈
    this.buffer = [];        // 当前卡片内容行
    this.pendingCards = [];  // 未提交的交互卡片
    this.renderer = renderer;
    this.inCard = false;
  }

  /**
   * 喂入一行文本
   * @param {string} line
   */
  feed(line) {
    // 卡片开始：<!-- card:类型:id --> 或 <!-- card:类型:id[@key:value@...] -->
    const start = line.match(/^<!-- card:(\w+):(\w+)(?:\[@(.+)\])? -->$/);
    if (start) {
      const [, type, id, attrStr] = start;
      this.stack.push({ type, id, attrs: this._parseAttrs(attrStr) });
      this.buffer = [];
      this.inCard = true;
      this.renderer.onCardStart(type, id);
      return;
    }

    // 卡片结束
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

    // 内容行
    this.buffer.push(line);

    if (this.inCard) {
      this.renderer.onCardLine(this.stack[this.stack.length - 1], line);
    } else {
      this.renderer.onMarkdownLine(line);
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