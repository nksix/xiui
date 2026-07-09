/**
 * XIUI 交互事件收集器
 * 暂存用户操作，批次提交时组装事件
 */
export class Collector {
  constructor() {
    this.values = {};  // card_id → value
  }

  /**
   * 记录选项选择
   */
  onChoiceSelect(cardId, optionId) {
    this.values[cardId] = optionId;
  }

  /**
   * 记录文字输入
   */
  onInput(cardId, text) {
    this.values[cardId] = text;
  }

  /**
   * 记录确认操作
   */
  onConfirm(cardId, action) {
    this.values[cardId] = action;  // "yes" | "no"
  }

  /**
   * 构建提交事件
   * @param {string} submitId
   * @param {Array} pendingCards
   * @returns {{ valid: boolean, result?: object, errors?: string[] }}
   */
  build(submitId, pendingCards) {
    const result = { submit_id: submitId, cards: {} };
    const errors = [];

    for (const card of pendingCards) {
      const value = this.values[card.id];

      if (value === undefined && !card.attrs.optional) {
        errors.push(card.id);
      }

      result.cards[card.id] = value ?? null;
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, result };
  }

  /**
   * 重置收集器
   */
  reset() {
    this.values = {};
  }
}