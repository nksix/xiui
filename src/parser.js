export class Parser {
  static STATE = {
    IDLE: 'idle',
    TEXT: 'text',
    CARD: 'card',
    COMMENT: 'comment'
  };

  constructor(emitter) {
    this.emitter = emitter;
    this.state = Parser.STATE.IDLE;
    this.textBuffer = '';
    this.cardBuffer = '';
    this.currentCard = null;
    this.pendingCards = [];
    this.commentBuffer = '';
  }

  feedChar(char) {
    switch (this.state) {
      case Parser.STATE.IDLE:
        this._handleIdle(char);
        break;
      case Parser.STATE.TEXT:
        this._handleText(char);
        break;
      case Parser.STATE.CARD:
        this._handleCard(char);
        break;
      case Parser.STATE.COMMENT:
        this._handleComment(char);
        break;
    }
  }

  feed(line) {
    line.split('').forEach(char => this.feedChar(char));
    this.feedChar('\n');
  }

  flush() {
    if (this.state === Parser.STATE.TEXT && this.textBuffer) {
      this.emitter.onText(this.textBuffer);
    }
    if (this.state === Parser.STATE.CARD && this.cardBuffer) {
      this._finalizeCard();
    }
    this.state = Parser.STATE.IDLE;
  }

  reset() {
    this.state = Parser.STATE.IDLE;
    this.textBuffer = '';
    this.cardBuffer = '';
    this.currentCard = null;
    this.pendingCards = [];
    this.commentBuffer = '';
  }

  _handleIdle(char) {
    if (char === '<') {
      this.commentBuffer = '<';
      this.state = Parser.STATE.COMMENT;
    } else {
      this.textBuffer = char;
      this._transition(Parser.STATE.TEXT);
      this.emitter.onText(this.textBuffer);
    }
  }

  _handleText(char) {
    if (char === '<') {
      this.commentBuffer = '<';
      this.state = Parser.STATE.COMMENT;
    } else {
      this.textBuffer += char;
      this.emitter.onText(this.textBuffer);
    }
  }

  _handleCard(char) {
    if (char === '<') {
      this.commentBuffer = '<';
      this.state = Parser.STATE.COMMENT;
    } else {
      this.cardBuffer += char;
    }
  }

  _handleComment(char) {
    this.commentBuffer += char;

    if (this.commentBuffer.endsWith('<!--')) {
      const line = this.commentBuffer.slice(0, -4).trim();
      if (line) {
        this.textBuffer += line;
        this.emitter.onText(this.textBuffer);
      }
    }

    if (this.commentBuffer.endsWith('-->')) {
      const comment = this.commentBuffer.slice(4, -3).trim();
      const cardMatch = comment.match(/^card:(\w+):(\w+)(?:\[@(.+)\])?$/);

      if (cardMatch) {
        const [, type, id, attrStr] = cardMatch;
        if (type === '/card') {
          this._finalizeCard();
        } else {
          this.currentCard = { type, id, attrs: this._parseAttrs(attrStr) };
          this.cardBuffer = '';
          this._transition(Parser.STATE.CARD);
        }
      } else {
        this._transition(Parser.STATE.IDLE);
      }
      this.commentBuffer = '';
    }
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