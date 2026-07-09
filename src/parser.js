export class Parser {
  static STATE = {
    IDLE: 'idle',
    CARD: 'card'
  };

  constructor(emitter) {
    this.emitter = emitter;
    this.state = Parser.STATE.IDLE;
    this.textBuffer = '';
    this.lineBuffer = '';
    this.cardBuffer = '';
    this.currentCard = null;
    this.pendingCards = [];
  }

  feedChar(char) {
    this.lineBuffer += char;

    if (char === '\n') {
      const line = this.lineBuffer.slice(0, -1);
      this.lineBuffer = '';

      const cardStartMatch = line.match(/^<!-- card:(\w+):(\w+)(?:\[@(.+)\])? -->$/);
      const cardEndMatch = line === '<!-- /card -->';

      if (cardStartMatch) {
        const [, type, id, attrStr] = cardStartMatch;
        this.currentCard = { type, id, attrs: this._parseAttrs(attrStr) };
        this.cardBuffer = '';
        this._transition(Parser.STATE.CARD);
        return;
      }

      if (cardEndMatch) {
        this._finalizeCard();
        return;
      }

      if (this.state === Parser.STATE.IDLE) {
        if (!line.startsWith('<!--')) {
          this.textBuffer += line + '\n';
          this.emitter.onText(this.textBuffer, false);
        }
      } else {
        if (!line.startsWith('<!--')) {
          this.cardBuffer += line + '\n';
          this.emitter.onText(this.cardBuffer, true);
        }
      }
    } else {
      if (this.state === Parser.STATE.IDLE) {
        if (!this.lineBuffer.startsWith('<')) {
          const preview = this.textBuffer + this.lineBuffer;
          this.emitter.onText(preview, false);
        }
      } else {
        if (!this.lineBuffer.startsWith('<')) {
          const preview = this.cardBuffer + this.lineBuffer;
          this.emitter.onText(preview, true);
        }
      }
    }
  }

  feed(line) {
    line.split('').forEach(char => this.feedChar(char));
    this.feedChar('\n');
  }

  flush() {
    if (this.lineBuffer) {
      const line = this.lineBuffer;
      this.lineBuffer = '';

      if (line === '<!-- /card -->') {
        this._finalizeCard();
        return;
      }

      if (this.state === Parser.STATE.IDLE) {
        if (!line.startsWith('<!--')) {
          this.textBuffer += line;
          this.emitter.onText(this.textBuffer);
        }
      } else {
        this.cardBuffer += line;
        this._finalizeCard();
      }
    }
    this.state = Parser.STATE.IDLE;
  }

  reset() {
    this.state = Parser.STATE.IDLE;
    this.textBuffer = '';
    this.lineBuffer = '';
    this.cardBuffer = '';
    this.currentCard = null;
    this.pendingCards = [];
  }

  _finalizeCard() {
    if (!this.currentCard) return;

    const lines = this.cardBuffer.split('\n').filter(line => line.trim());
    const card = { ...this.currentCard, lines };

    if (['choice', 'input', 'confirm'].includes(card.type)) {
      this.pendingCards.push(card);
    }

    this.emitter.onCard(card);
    this.currentCard = null;
    this.cardBuffer = '';
    this._transition(Parser.STATE.IDLE);
  }

  _transition(newState) {
    if (this.state !== newState) {
      const from = this.state;
      this.state = newState;
      if (this.emitter.onStateChange) {
        this.emitter.onStateChange(from, newState);
      }
    }
  }

  _parseAttrs(s) {
    if (!s) return {};
    const attrs = {};
    s.split('@').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx > 0) attrs[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
    return attrs;
  }
}