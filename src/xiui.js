/**
 * XIUI v3 — 聊天流式 UI SDK
 *
 * 协议格式（fenced code block）:
 *   ```form:form_id:type:type_id
 *   内容行1
 *   内容行2
 *   ```
 *
 * 示例:
 *   ```form:s1:choice:q1
 *   题目？
 *   A. 选项A
 *   B. 选项B
 *   ```
 *
 * 提交格式:
 *   ```submit
 *   {"formid":"s1","q1":"A"}
 *   ```
 *
 * 核心概念：
 *   - formId（表单ID）: 从协议中解析，如 's1', 'exam1'，用于汇聚表单
 *   - type（字段类型）: 从协议中解析，如 'choice', 'input', 'tip'
 *   - typeId（字段ID）: 从协议中解析，如 'q1', 'i1'，用于唯一标识字段
 *   - parsed（结构化数据）: parse() 解析后的结果
 *   - value（字段值）: 用户交互后设置的值
 */

const CARD_FENCE_RE = /^```form:(\w+):(\w+):(\w+)(?:\[@(.+)\])?\s*$/;
const FENCE_END_RE  = /^```\s*$/;

export class XIUIPlugin {
  parse(lines) { return {}; }
  render(card, el) {
    if (card.text && card._md) {
      el.innerHTML = card._md.render(card.text);
    } else {
      el.textContent = card.text || '';
    }
  }
  event(card, type, detail) {}
}

class ChoicePlugin extends XIUIPlugin {
  parse(lines) {
    const question = lines[0] || '';
    const options = [];
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^-?\s*([A-D])\.\s*(.+)$/);
      if (m) options.push({ id: m[1], label: m[2] });
    }
    return { question, options };
  }
}

class TipPlugin extends XIUIPlugin {
  parse(lines) {
    return { body: lines.map(l => l.replace(/^>\s*/, '')).join('\n') };
  }
}

class ProgressPlugin extends XIUIPlugin {
  parse(lines) {
    const line = lines[0] || '';
    const tm = line.match(/\*\*(.+?)\*\*/);
    const pm = line.match(/(\d+)%/);
    const lm = line.match(/([\d]+\/[\d]+)/);
    return { title: tm?.[1] || '', progress: pm ? parseInt(pm[1]) / 100 : 0, label: lm?.[1] || '' };
  }
}

class SubmitPlugin extends XIUIPlugin {
  parse(lines) { return { label: lines[0] || '提交' }; }
}

class InputPlugin extends XIUIPlugin {
  parse(lines) {
    return { title: lines[0] || '', placeholder: (lines[1] || '').replace(/^\*\(|\)\*$/g, '') };
  }
}

class SummaryPlugin extends XIUIPlugin {
  parse(lines) {
    const rows = lines.filter(l => l.startsWith('|'));
    const hd = rows[0]?.split('|').filter(Boolean).map(s => s.trim()) || [];
    const vl = rows[1]?.split('|').filter(Boolean).map(s => s.trim()) || [];
    return { items: hd.map((h, i) => ({ label: h, value: vl[i] || '' })) };
  }
}

class ConfirmPlugin extends XIUIPlugin {
  parse(lines) {
    const tm = lines[0]?.match(/\*\*(.+?)\*\*/);
    const desc = lines[1] || '';
    const bm = lines.slice(2).join('\n').match(/>\s*(.+?)\s*\|\s*(.+)/);
    return { title: tm?.[1] || '', description: desc, confirmLabel: bm?.[1]?.trim() || '确认', cancelLabel: bm?.[2]?.trim() || '取消' };
  }
}

const BUILTIN_PLUGINS = {
  choice: new ChoicePlugin(),
  tip: new TipPlugin(),
  progress: new ProgressPlugin(),
  submit: new SubmitPlugin(),
  input: new InputPlugin(),
  summary: new SummaryPlugin(),
  confirm: new ConfirmPlugin()
};

export const BUILTIN_CARDS = BUILTIN_PLUGINS;

export class XIUIChat {
  constructor(opts = {}) {
    this.md = opts.md || null;
    this._onText = opts.onText;
    this._onCardBegin = opts.onCardBegin;
    this._onCardUpdate = opts.onCardUpdate;
    this._onCard = opts.onCard;
    this._onDone = opts.onDone;
    this._onEvent = opts.onEvent;
    this._autoFlush = opts.autoFlush !== undefined ? opts.autoFlush : 2000;
    this._plugins = {};
    this._mergePlugins(opts.cards || {});
    this.reset();
  }

  _mergePlugins(customCards) {
    for (const key of Object.keys(BUILTIN_PLUGINS)) {
      this._plugins[key] = BUILTIN_PLUGINS[key];
    }
    for (const [key, value] of Object.entries(customCards)) {
      if (value instanceof XIUIPlugin) {
        this._plugins[key] = value;
      } else if (typeof value === 'object') {
        const plugin = BUILTIN_PLUGINS[key] || new XIUIPlugin();
        const merged = Object.create(Object.getPrototypeOf(plugin));
        Object.assign(merged, plugin);
        if (value.parse) merged.parse = value.parse;
        if (value.render) merged.render = value.render;
        if (value.event) merged.event = value.event;
        this._plugins[key] = merged;
      }
    }
  }

  reset() {
    this._state = 'text';
    this._textBuf = '';
    this._lineBuf = '';
    this._cardBuf = '';
    this._cardInfo = null;
    this._values = {};
    this._cards = [];
    this._submitted = false;
  }

  mount(container, text) {
    if (!this.md) throw new Error('[XIUI] mount() requires opts.md');
    container.innerHTML = this.md.render(text);
    this._replaceCardBlocks(container);
  }

  render(text) {
    if (!this.md) throw new Error('[XIUI] render() requires opts.md');
    const div = document.createElement('div');
    this.mount(div, text);
    return div.innerHTML;
  }

  feed(text) {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    for (const ch of text) this._feedChar(ch);
    if (this._autoFlush > 0) {
      this._flushTimer = setTimeout(() => this.flush(), this._autoFlush);
    }
  }

  send(text) {
    this.feed(text);
    if (!this._autoFlush) this.flush();
  }

  flush() {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    if (this._lineBuf && this._state === 'card') {
      if (FENCE_END_RE.test(this._lineBuf)) {
        this._lineBuf = '';
        this._emit();
      } else {
        this._emit();
      }
    }
    this._state = 'text';
    if (this._onDone) this._onDone();
  }

  _replaceCardBlocks(container) {
    const codes = container.querySelectorAll('pre code');
    codes.forEach(code => {
      const m = code.className.match(/language-form:(\w+):(\w+):(\w+)(?:\[@(.+?)\])?/);
      if (!m) return;
      const pre = code.parentElement;
      const rawText = this._dec(code.innerHTML);
      const card = this._build(m[1], m[2], m[3], m[4], rawText);
      const el = document.createElement('div');
      el.className = `card card-${card.type}`;
      el.dataset.formId = card.formId;
      el.dataset.typeId = card.typeId;
      this._callRender(card, el);
      pre.replaceWith(el);
    });
  }

  _feedChar(ch) {
    this._lineBuf += ch;
    if (ch === '\n') {
      const line = this._lineBuf.slice(0, -1);
      this._lineBuf = '';
      if (this._state === 'text') {
        const m = line.match(CARD_FENCE_RE);
        if (m) {
          this._state = 'card';
          this._cardInfo = { formId: m[1], type: m[2], typeId: m[3], attrs: this._parseAttrs(m[4]) };
          this._cardBuf = '';
          if (this._onText) this._onText(this._textBuf);
          if (this._onCardBegin) this._onCardBegin(m[1], m[2], m[3]);
          return;
        }
        this._textBuf += line + '\n';
        if (this._onText) this._onText(this._textBuf);
      } else {
        if (FENCE_END_RE.test(line)) {
          this._emit();
          this._state = 'text';
          return;
        }
        this._cardBuf += line + '\n';
        if (this._onCardUpdate) this._onCardUpdate(this._cardBuf);
      }
    } else {
      if (this._lineBuf.startsWith('`')) return;
      if (this._state === 'text') {
        if (this._onText) this._onText(this._textBuf + this._lineBuf);
      } else {
        if (this._onCardUpdate) this._onCardUpdate(this._cardBuf + this._lineBuf);
      }
    }
  }

  _emit() {
    if (!this._cardInfo) return;
    const card = this._build(this._cardInfo.formId, this._cardInfo.type, this._cardInfo.typeId, null, this._cardBuf);
    const el = document.createElement('div');
    el.className = `card card-${card.type}`;
    el.dataset.formId = card.formId;
    el.dataset.cardId = card.typeId;
    this._callRender(card, el);
    if (this._onCard) this._onCard(card, el);
    this._cardInfo = null;
    this._cardBuf = '';
  }

  _build(formId, type, typeId, attrStr, text) {
    const attrs = typeof attrStr === 'string' ? this._parseAttrs(attrStr) : (attrStr || {});
    const lines = text ? text.split('\n').filter(l => Boolean(l)) : [];
    const plugin = this._plugins[type];
    const data = plugin && typeof plugin.parse === 'function' ? (() => {
      try { return plugin.parse(lines); }
      catch (e) { console.warn(`[XIUI] parse "${type}":`, e); return {}; }
    })() : {};
    const card = { formId, type, typeId, attrs, lines, text, data, _md: this.md };
    card.setValue = (value) => this.setValue(typeId, value);
    card.getValue = () => this.getValue(typeId);
    card.trigger = (evtType, detail) => this.trigger(card, evtType, detail);
    this._cards.push(card);
    return card;
  }

  _callRender(card, el) {
    const plugin = this._plugins[card.type];
    if (plugin && typeof plugin.render === 'function') {
      try { plugin.render(card, el); }
      catch (e) { console.warn(`[XIUI] render "${card.type}":`, e); el.innerHTML = card.text; }
    } else {
      if (card.text && this.md) {
        el.innerHTML = this.md.render(card.text);
      }
    }
    el._xiui_card = card;
    el._xiui_plugin = plugin;
  }

  setValue(cardId, value) {
    this._values[cardId] = value;
  }

  getValue(cardId) {
    return this._values[cardId];
  }

  getAllValues() {
    return { ...this._values };
  }

  getCards(type) {
    if (type) return this._cards.filter(c => c.type === type);
    return [...this._cards];
  }

  validate(formId) {
    const requiredTypes = ['choice', 'input', 'confirm'];
    const missing = [];
    for (const card of this._cards) {
      if (formId && card.formId !== formId) continue;
      if (requiredTypes.includes(card.type)) {
        const v = this._values[card.typeId];
        if (v === undefined || v === null || v === '') {
          missing.push(card.typeId);
        }
      }
    }
    return { valid: missing.length === 0, missing };
  }

  submit(formId) {
    if (this._submitted) return { success: false, error: 'already submitted' };
    const { valid, missing } = this.validate(formId);
    if (!valid) return { success: false, error: 'incomplete', missing };
    
    const formCards = formId 
      ? this._cards.filter(c => c.formId === formId)
      : this._cards;
    
    const data = { formid: formId || 'default' };
    const result = [];
    
    for (const card of formCards) {
      const value = this.getValue(card.typeId);
      if (value !== undefined && value !== null) {
        data[card.typeId] = value;
        result.push({
          id: card.typeId,
          type: card.type,
          formId: card.formId,
          value,
          question: card.data.question || card.data.title || card.data.body || '',
          options: card.data.options || []
        });
      }
    }
    
    if (formId) {
      formCards.forEach(c => c._submitted = true);
    } else {
      this._submitted = true;
    }
    
    this._lastSubmittedFormId = formId;
    
    return { success: true, data, cards: result };
  }

  isSubmitted(formId) {
    if (!formId) return this._submitted;
    return this._cards.filter(c => c.formId === formId).every(c => c._submitted);
  }

  trigger(card, evtType, detail) {
    const oldValue = this.getValue(card.id);
    if (detail?.value !== undefined) {
      this.setValue(card.id, detail.value);
    }
    const newValue = this.getValue(card.id);
    const plugin = this._plugins[card.type];
    if (plugin && typeof plugin.event === 'function') {
      plugin.event(card, evtType, { ...detail, oldValue, newValue });
    }
    if (this._onEvent) {
      this._onEvent(card, evtType, { ...detail, oldValue, newValue });
    }
  }

  _dec(html) {
    const el = document.createElement('textarea');
    el.innerHTML = html;
    return el.value;
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

export { BUILTIN_PLUGINS, ChoicePlugin, TipPlugin, ProgressPlugin, SubmitPlugin, InputPlugin, SummaryPlugin, ConfirmPlugin };
