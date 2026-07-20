/**
 * XIUI v4 — 聊天流式 UI SDK
 *
 * 协议格式（fenced code block）:
 *   ```xiui@form:form_id:type:type_id
 *   内容行1
 *   内容行2
 *   ```
 *
 * 提交格式（用户 → AI）:
 *   ```xiui@submit:formid
 *   {"formid":"s1","q1":"A"}
 *   ```
 *
 * Plugin 设计哲学——数据/逻辑/状态/事件 自闭环:
 *   像 Vue/React 一样，每个 Plugin 是独立的响应式组件。
 *
 *   声明式模板:
 *     render()      → 返回 HTML（纯函数，数据→视图）
 *     afterRender() → DOM 就绪后绑定事件
 *
 *   响应式状态:
 *     setValue(v)   → 更新状态 → 自动触发 render() + afterRender()
 *                     类似 Vue 的 ref() 或 React 的 setState()
 *
 *   生命周期:
 *     parse(lines)  → 协议行 → 结构化数据（纯函数）
 *     init(ctx)     → 接收上下文，初始化默认值
 *     mount(el)     → 首次挂载（= render + afterRender）
 *     disable()     → 标记已提交，冻结交互
 *     refresh()     → 强制重新挂载
 *     validate()    → 校验当前值
 *
 *   事件通信:
 *     emit(event)   → 向外部（XIUIChat）发送事件
 */

// 严格匹配 xiui@form:表单ID:类型:字段ID，容忍 [@attr] 前的空格
const CARD_FENCE_RE = /^```xiui@form:(\w+):(\w+)(?::(\w+))?\s*(?:\[@(.+)\])?\s*$/;
const FENCE_END_RE  = /^```\s*$/;

// ═══════════════════════════════════════════════════════════
// XIUIPlugin 基类 —— 自闭环组件
// ═══════════════════════════════════════════════════════════

export class XIUIPlugin {
  // 纯函数：协议行 → 结构化数据
  parse(lines) { return {}; }

  // 初始化上下文，子类可重写以设置默认值
  init(ctx) {
    this.formId = ctx.formId;
    this.typeId = ctx.typeId;
    this.data   = ctx.data || {};
    this.md     = ctx.md || null;
    this.chat   = ctx.chat || null;
    this._value = ctx.value;
    this._submitted = false;
    this.el     = null;
  }

  // ── 模板方法（Vue/React 风格）────────────────

  /** 声明式模板：返回 HTML 字符串。
   *  当 setValue() 被调用时，自动重新执行 render() 并更新 DOM。
   *  这就是「响应式」——数据变，UI 自动变。 */
  render() {
    const t = this.data._text;
    if (t) return this.html(t);
    return '';
  }

  /** render() 后调用，用于绑定事件、引用 DOM 元素。
   *  每次重新渲染后都会调用（包括 setValue 触发的重渲染）。 */
  afterRender(el) {}

  // ── 挂载（由 XIUIChat 调用，通常不需要重写）─

  mount(el) {
    this.el = el;
    el.innerHTML = this.render();
    this.afterRender(el);
  }

  // ── 响应式状态 ──────────────────────────

  getValue() { return this._value; }

  /** 更新状态 → 自动触发重新渲染 */
  setValue(v, { silent = false } = {}) {
    if (this._submitted) return;
    const old = this._value;
    this._value = v;
    this._onChange(old, v);
    if (!silent && this.el) {
      this.el.innerHTML = this.render();
      this.afterRender(this.el);
    }
  }

  _onChange(oldVal, newVal) {
    if (this.chat && this.chat._onPluginChange) {
      this.chat._onPluginChange(this, oldVal, newVal);
    }
  }

  // ── 生命周期 ──────────────────────────

  /** 标记已提交，冻结交互 */
  disable() {
    this._submitted = true;
    if (this.el) {
      this.el.classList.add('x-card-disabled');
      this.el.style.pointerEvents = 'none';
    }
    this.onDisable();
  }

  /** 子类可重写：提交后的额外处理 */
  onDisable() {}

  /** 重新渲染 */
  refresh() {
    if (this.el) {
      this.el.style.pointerEvents = '';
      this.mount(this.el);
      if (this._submitted) this.el.style.pointerEvents = 'none';
    }
  }

  /** 校验 */
  validate() {
    return this._value !== undefined && this._value !== null && this._value !== '';
  }

  // ── 工具函数 ──────────────────────────

  /** Markdown 渲染（自动去 <p> 包裹） */
  html(text) {
    if (this.md) return this.md.render(text).replace(/<\/?p>/g, '');
    return text;
  }

  /** 触发事件到外部 */
  emit(event, detail) {
    if (this.chat && this.chat._onEvent) {
      this.chat._onEvent(this, event, detail);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 内置 Plugin —— 开箱即用
// ═══════════════════════════════════════════════════════════

class ChoicePlugin extends XIUIPlugin {
  parse(lines) {
    const question = lines[0] || '';
    const options = [];
    const seenIds = new Set();
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^-?\s*([A-D])\.\s*(.+)$/);
      if (m && !seenIds.has(m[1])) {
        options.push({ id: m[1], label: m[2] });
        seenIds.add(m[1]);
      }
    }
    return { question, options };
  }

  get _isMulti() { return this.data.multi === true; }

  /** 纯模板：数据 → HTML */
  render() {
    const d = this.data;
    if (!d.options || d.options.length === 0) {
      // 无选项：降级为纯文本渲染（AI 可能误用了 choice 类型）
      return this.md.render(d._text || d.question || '');
    }
    const selected = this._isMulti
      ? (this._value || '').split(',').filter(Boolean)
      : [this._value].filter(Boolean);

    return (d.question ? this.md.render(d.question) : '')
      + (d.options || []).map(o => {
          const sel = selected.includes(o.id) ? ' sel' : '';
          return `<span class="opt${sel}" data-id="${o.id}">${this.html(o.label)}</span>`;
        }).join('');
  }

  /** 事件绑定：纯交互逻辑 */
  afterRender(el) {
    const self = this;
    el.querySelectorAll('.opt').forEach(opt => {
      opt.onclick = function () {
        if (self._submitted) return;
        const id = this.dataset.id;
        if (self._isMulti) {
          const cur = (self._value || '').split(',').filter(Boolean);
          const idx = cur.indexOf(id);
          idx >= 0 ? cur.splice(idx, 1) : cur.push(id);
          self.setValue(cur.sort().join(',')); // setValue → 自动重渲染
        } else {
          self.setValue(id); // setValue → 自动重渲染，sel 类会跟到新 DOM
        }
      };
    });
  }

  onDisable() {
    if (this.el) {
      this.el.querySelectorAll('.opt').forEach(x => x.style.pointerEvents = 'none');
    }
  }
}

class InputPlugin extends XIUIPlugin {
  parse(lines) {
    return { title: lines[0] || '', placeholder: (lines[1] || '').replace(/^\*\(|\)\*$/g, '') };
  }

  init(ctx) {
    super.init(ctx);
    if (this._value === undefined) this._value = '';
  }

  render() {
    const d = this.data;
    const val = this._value || '';
    return (d.title ? this.md.render(d.title) : '')
      + `<input class="card-input" placeholder="${d.placeholder || ''}" value="${this._esc(val)}"${this._submitted ? ' disabled' : ''}>`;
  }

  afterRender(el) {
    const inp = el.querySelector('input');
    inp.oninput = () => this.setValue(inp.value, { silent: true }); // 输入中不重渲染
  }

  _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
}

class SliderPlugin extends XIUIPlugin {
  parse(lines) {
    const title = lines[0] || '';
    const parts = (lines[1] || '0-100-1-50').split('-');
    return {
      title,
      min: parseFloat(parts[0]) || 0,
      max: parseFloat(parts[1]) || 100,
      step: parseFloat(parts[2]) || 1,
      value: parts.length >= 4 ? parseFloat(parts[3]) : parseFloat(parts[0]) || 0
    };
  }

  init(ctx) {
    super.init(ctx);
    if (this._value === undefined) this._value = String(this.data.value);
  }

  render() {
    const d = this.data;
    const val = this._value || d.value;
    return (d.title ? this.md.render(d.title) : '')
      + `<div class="slider-wrap"><input type="range" class="card-slider" min="${d.min}" max="${d.max}" step="${d.step}" value="${val}"${this._submitted ? ' disabled' : ''}><span class="slider-val">${val}</span></div>`;
  }

  afterRender(el) {
    const inp = el.querySelector('input');
    const lbl = el.querySelector('.slider-val');
    inp.oninput = () => {
      lbl.textContent = inp.value;            // 实时的 label 更新
      this.setValue(inp.value, { silent: true }); // 同步值，不重渲染（否则滑块跳）
    };
  }
}

class SwitchPlugin extends XIUIPlugin {
  parse(lines) {
    const title = lines[0] || '';
    const defVal = (lines[1] || 'false').toLowerCase();
    return { title, value: defVal === 'true' };
  }

  init(ctx) {
    super.init(ctx);
    if (this._value === undefined) this._value = this.data.value ? 'true' : 'false';
  }

  render() {
    const d = this.data;
    const on = this._value === 'true' || this._value === true;
    return (d.title ? this.md.render(d.title) : '')
      + `<label class="switch-wrap"><input type="checkbox" class="card-toggle" ${on ? 'checked' : ''}${this._submitted ? ' disabled' : ''}><span class="switch-track"></span></label>`;
  }

  afterRender(el) {
    const cb = el.querySelector('input');
    cb.onchange = () => this.setValue(cb.checked ? 'true' : 'false'); // 自动重渲染
  }
}

class ConfirmPlugin extends XIUIPlugin {
  parse(lines) {
    const tm = lines[0]?.match(/\*\*(.+?)\*\*/);
    const desc = lines[1] || '';
    const bm = lines.slice(2).join('\n').match(/>\s*(.+?)\s*\|\s*(.+)/);
    return { title: tm?.[1] || '', description: desc, confirmLabel: bm?.[1]?.trim() || '确认', cancelLabel: bm?.[2]?.trim() || '取消' };
  }

  render() {
    const d = this.data;
    if (this._submitted) {
      const cancelled = this._value !== d.confirmLabel;
      return `<span class="x-tag-done${cancelled ? ' cancelled' : ' ok'}">✓ 已${cancelled ? '取消' : d.confirmLabel}</span>`;
    }
    return (d.title ? this.md.render(d.title) : '') + (d.description ? this.md.render(d.description) : '')
      + `<div class="bts"><button class="btn-pri">${d.confirmLabel}</button><button class="btn-ghost">${d.cancelLabel}</button></div>`;
  }

  afterRender(el) {
    if (this._submitted) return;
    const self = this;
    el.querySelector('.btn-pri').onclick = () => {
      self.setValue(self.data.confirmLabel);
      self.emit('submit', { action: 'confirm', value: self.data.confirmLabel });
    };
    el.querySelector('.btn-ghost').onclick = () => {
      self.setValue(self.data.cancelLabel);
      self.emit('submit', { action: 'cancel', value: self.data.cancelLabel });
    };
  }

  /** 提交后重渲染为标签 */
  onDisable() {
    if (this.el) this.el.innerHTML = this.render();
  }
}

class SubmitPlugin extends XIUIPlugin {
  parse(lines) { return { label: lines[0] || '提交' }; }

  render() {
    if (this._submitted) return '<span class="x-tag-done ok">✓ 已提交</span>';
    return `<button class="btn-submit">${this.data.label}</button>`;
  }

  afterRender(el) {
    if (this._submitted) return;
    const self = this;
    el.querySelector('button').onclick = () => {
      self.emit('submit', { formId: self.formId });
    };
  }

  /** 变为「已提交」视觉 */
  disable() {
    super.disable();
    if (this.el) this.el.innerHTML = this.render();
  }
}

// ═══════════════════════════════════════════════════════════
// Plugin 模板表（类，非实例）
// ═══════════════════════════════════════════════════════════

export const BUILTIN_PLUGINS = {
  choice:  ChoicePlugin,
  input:   InputPlugin,
  submit:  SubmitPlugin,
  slider:  SliderPlugin,
  switch:  SwitchPlugin,
  confirm: ConfirmPlugin
};

export const BUILTIN_CARDS = BUILTIN_PLUGINS;
export { ChoicePlugin, InputPlugin, SubmitPlugin, SliderPlugin, SwitchPlugin, ConfirmPlugin };

// ═══════════════════════════════════════════════════════════
// XIUIChat —— 流式解析 & 聊天会话
// ═══════════════════════════════════════════════════════════

export class XIUIChat {
  constructor(opts = {}) {
    this.md = opts.md || null;
    this._autoFlush = opts.autoFlush !== undefined ? opts.autoFlush : 2000;
    this._pluginTemplates = {};
    this._mergeTemplates(opts.plugins || opts.cards || {});

    // 用户可覆盖的回调，未提供时使用内建渲染
    this._onText = opts.onText !== undefined ? opts.onText : this._defaultOnText.bind(this);
    this._onCardBegin = opts.onCardBegin !== undefined ? opts.onCardBegin : this._defaultOnCardBegin.bind(this);
    this._onCardUpdate = opts.onCardUpdate !== undefined ? opts.onCardUpdate : this._defaultOnCardUpdate.bind(this);
    this._onCard = opts.onCard !== undefined ? opts.onCard : this._defaultOnCard.bind(this);
    this._onDone = opts.onDone !== undefined ? opts.onDone : this._defaultOnDone.bind(this);
    this._onEvent = opts.onEvent || null;

    this._bubble = null;
    this.reset();
  }

  /** 合并插件模板：内置 + 自定义 */
  _mergeTemplates(custom) {
    for (const key of Object.keys(BUILTIN_PLUGINS)) {
      this._pluginTemplates[key] = BUILTIN_PLUGINS[key];
    }
    for (const [key, value] of Object.entries(custom)) {
      if (typeof value === 'function' && value.prototype instanceof XIUIPlugin) {
        // 直接是 XIUIPlugin 子类
        this._pluginTemplates[key] = value;
      } else if (value instanceof XIUIPlugin) {
        // 旧式：已实例化的单例 → 转为类
        this._pluginTemplates[key] = value.constructor;
      } else if (typeof value === 'object') {
        // 旧式：{ render(card, el) {} } → 包装为类
        this._pluginTemplates[key] = this._wrapLegacy(value, key);
      } else {
        this._pluginTemplates[key] = value;
      }
    }
  }

  /** 旧式 {render, parse, event} 对象 → XIUIPlugin 子类 */
  _wrapLegacy(obj, type) {
    const Base = BUILTIN_PLUGINS[type] || XIUIPlugin;
    return class extends Base {
      parse(lines) { return obj.parse ? obj.parse(lines) : super.parse(lines); }
      mount(el) {
        this.el = el;
        // 构造兼容旧式的 card 对象
        const card = {
          formId: this.formId, type: type, typeId: this.typeId,
          data: this.data, text: this.data._text, _md: this.md,
          setValue: (v) => this.setValue(v),
          getValue: () => this.getValue(),
          trigger: (evt, detail) => { /* no-op for legacy */ }
        };
        if (obj.render) {
          obj.render(card, el);
        } else {
          el.innerHTML = this.render();
          this.afterRender(el);
        }
        el._xiui_card = card;
        el._xiui_plugin = this;
      }
    };
  }

  reset() {
    this._state = 'text';
    this._textBuf = '';
    this._lineBuf = '';
    this._cardBuf = '';
    this._cardInfo = null;
    this._cards = [];           // [{ formId, type, typeId, data, plugin }]
    this._submitted = false;
  }

  // ─── 内部：plugin 状态变化回调 ──────────────────────

  _onPluginChange(plugin, oldVal, newVal) {
    // 子类可重写，或通过 onEvent 配置项监听
    if (this._onEvent) {
      this._onEvent(plugin, 'change', { oldVal, newVal });
    }
  }

  // ─── 内建渲染（一行接入） ─────────────────────────

  static _injectStyle() {
    if (XIUIChat._styleInjected) return;
    XIUIChat._styleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.x-msg{display:flex;gap:12px;margin-bottom:16px;animation:x-fade-in .3s ease}
@keyframes x-fade-in{from{opacity:0;transform:translateY(5px)}}
.x-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:linear-gradient(135deg,var(--xi-accent,#667eea),var(--xi-accent2,#7c3aed));color:#fff}
.x-bubble{max-width:70%;min-width:0;padding:12px 16px;background:var(--xi-bg2,#1a1a2e);border-radius:0 16px 16px 16px;line-height:1.6;font-size:15px;color:var(--xi-text,#e4e4e7)}
.x-bubble p{margin:0 0 8px;font-size:inherit}.x-bubble p:last-child{margin:0}
.x-bubble pre{background:var(--xi-bg,#0f0f23);border-radius:8px;padding:12px;overflow-x:auto}
.x-bubble code{font-size:13px}
.x-bubble h1,.x-bubble h2,.x-bubble h3,.x-bubble h4{margin:12px 0 8px;font-weight:600}
.x-bubble h1{font-size:1.4em}.x-bubble h2{font-size:1.2em}.x-bubble h3{font-size:1.1em}
.x-bubble ul,.x-bubble ol{padding-left:20px;margin:8px 0}
.x-bubble li{margin:4px 0}
.x-bubble blockquote{border-left:3px solid var(--xi-accent,#667eea);margin:8px 0;padding:4px 12px;color:var(--xi-mute,#a1a1aa)}
.x-bubble table{border-collapse:collapse;width:100%;margin:12px 0}
.x-bubble th{background:var(--xi-bg,#0f0f23);font-weight:600}
.x-bubble th,.x-bubble td{padding:8px 12px;border:1px solid var(--xi-border,#27272a);text-align:left}
.x-bubble a{color:var(--xi-link,#667eea)}
.x-text{line-height:1.6}
.x-sk{display:flex;flex-direction:column;gap:8px;padding:16px;margin:12px 0;border:1px solid var(--xi-border,#27272a);border-radius:12px;opacity:.5;animation:x-sk-pulse 1.5s infinite}
@keyframes x-sk-pulse{0%,100%{opacity:.4}50%{opacity:.8}}
.x-sk-line{height:12px;background:var(--xi-border,#27272a);border-radius:4px}
.x-pv{padding:12px 16px;margin:12px 0;border:1px dashed var(--xi-border,#27272a);border-radius:12px;line-height:1.6;font-size:14px}
.x-card{background:var(--xi-card-bg,#1e1e2f);border:1px solid var(--xi-border,#27272a);border-radius:12px;padding:16px 20px;margin:12px 0}
.x-card-invalid{border-color:#ef4444}
.x-card-disabled{opacity:.5;pointer-events:none;filter:grayscale(.3)}
.x-tag-done{display:inline-block;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600}
.x-tag-done.ok{background:rgba(34,197,94,.12);color:#22c55e}
.x-tag-done.cancelled{background:rgba(239,68,68,.1);color:#ef4444}
`.trim();
    document.head.appendChild(style);
  }

  createStream(container) {
    XIUIChat._injectStyle();
    const ct = typeof container === 'string' ? document.querySelector(container) : container;
    if (!ct) throw new Error('[XIUI] createStream: container not found');
    const msg = document.createElement('div');
    msg.className = 'x-msg';
    msg.innerHTML = '<div class="x-avatar">AI</div><div class="x-bubble"></div>';
    ct.appendChild(msg);
    this._bubble = msg.querySelector('.x-bubble');
    this.reset();
    return {
      feed: (text) => this.feed(text),
      done: () => this.flush(),
      bubble: this._bubble,
    };
  }

  _mdRender(t) {
    if (this.md) return this.md.render(t);
    const div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  _defaultOnText(t) {
    if (!t || !this._bubble) return;
    const lastCard = this._bubble.querySelector('.x-card:last-of-type');
    let tb;
    if (lastCard) {
      tb = lastCard.nextElementSibling;
      if (!tb || !tb.classList.contains('x-text')) {
        tb = document.createElement('div');
        tb.className = 'x-text';
        lastCard.after(tb);
      }
    } else {
      tb = this._bubble.querySelector('.x-text:last-of-type');
      if (!tb) {
        tb = document.createElement('div');
        tb.className = 'x-text';
        this._bubble.appendChild(tb);
      }
    }
    tb.innerHTML = this._mdRender(t);
    this._bubble.scrollIntoView({ block: 'end', behavior: 'instant' });
  }

  _defaultOnCardBegin(formId, type, typeId) {
    if (!this._bubble) return;
    const sk = document.createElement('div');
    sk.className = 'x-sk';
    sk.innerHTML = '<div class="x-sk-line"></div><div class="x-sk-line" style="width:60%"></div>';
    this._bubble.appendChild(sk);
  }

  _defaultOnCardUpdate(t) {
    if (!this._bubble) return;
    const sk = this._bubble.querySelector('.x-sk');
    if (sk) sk.remove();
    let pv = this._bubble.querySelector('.x-pv');
    if (!pv) {
      pv = document.createElement('div');
      pv.className = 'x-pv';
      this._bubble.appendChild(pv);
    }
    pv.innerHTML = this._mdRender(t);
  }

  _defaultOnCard(card, el) {
    if (!this._bubble) return;
    const sk = this._bubble.querySelector('.x-sk');
    const pv = this._bubble.querySelector('.x-pv');
    if (sk) sk.remove();
    if (pv) pv.remove();
    el.classList.add('x-card');
    el.dataset.typeid = card.typeId;
    this._bubble.appendChild(el);
  }

  _defaultOnDone() {
    if (!this._bubble) return;
    const sk = this._bubble.querySelector('.x-sk');
    const pv = this._bubble.querySelector('.x-pv');
    if (sk) sk.remove();
    if (pv) pv.remove();
  }

  // ─── 静态渲染（非流式） ──────────────────────────

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

  // ─── 流式 feed ────────────────────────────────

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
      this._textBuf = '';
    }
    this._state = 'text';
    if (this._onDone) this._onDone();
  }

  // ─── 替换静态渲染中的 card block ──────────────

  _replaceCardBlocks(container) {
    const codes = container.querySelectorAll('pre code');
    codes.forEach(code => {
      const m = code.className.match(/language-xiui@form:(\w+):(\w+):(\w+)\s*(?:\[@(.+?)\])?/);
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

  // ─── 字符流状态机 ─────────────────────────────

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
          if (this._onCardBegin) this._onCardBegin(m[1], m[2], m[3]);
          this._cardBuf = '';
          this._textBuf = '';
          return;
        }
        this._textBuf += line + '\n';
        if (this._onText) this._onText(this._textBuf);
      } else {
        if (FENCE_END_RE.test(line)) {
          this._emit();
          this._state = 'text';
          this._textBuf = '';
          return;
        }
        this._cardBuf += line + '\n';
        if (this._onCardUpdate) this._onCardUpdate(this._cardBuf);
      }
    } else {
      // 检测行内 card fence（文本后紧跟 ```xiui@form:...）
      if (this._state === 'text') {
        const fenceIdx = this._lineBuf.indexOf('```xiui@form:');
        if (fenceIdx > 0) {
          const before = this._lineBuf.slice(0, fenceIdx);
          this._textBuf += before;
          if (this._onText) this._onText(this._textBuf);
          this._lineBuf = this._lineBuf.slice(fenceIdx);
        }
      }
      if (this._lineBuf.startsWith('`')) return;
      if (this._state === 'text') {
        if (this._onText) this._onText(this._textBuf + this._lineBuf);
      } else {
        if (this._onCardUpdate) this._onCardUpdate(this._cardBuf + this._lineBuf);
      }
    }
  }

  // ─── 构建 card（创建 plugin 实例） ─────────────

  _emit() {
    if (!this._cardInfo) return;
    const card = this._build(this._cardInfo.formId, this._cardInfo.type, this._cardInfo.typeId, this._cardInfo.attrs, this._cardBuf);
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

    // 从模板创建 plugin 实例
    const Template = this._pluginTemplates[type] || XIUIPlugin;
    const plugin = new Template();

    // 解析数据
    let parsedData = {};
    try { parsedData = plugin.parse(lines) || {}; }
    catch (e) { console.warn(`[XIUI] parse "${type}":`, e); }
    const data = { ...parsedData, ...attrs, _text: text };

    // 初始化 plugin 实例
    plugin.init({
      formId, typeId, data,
      md: this.md,
      chat: this,
      value: undefined // 初始值由 plugin.init() 内部决定
    });

    const card = { formId, type, typeId, attrs, data, plugin };
    this._cards.push(card);
    return card;
  }

  _callRender(card, el) {
    const plugin = card.plugin;
    if (!plugin) return;
    try {
      plugin.mount(el);
    } catch (e) {
      console.warn(`[XIUI] mount "${card.type}":`, e);
      el.textContent = card.data._text || '';
    }
    el._xiui_card = card;
    el._xiui_plugin = plugin;
  }

  // ─── 表单操作 ────────────────────────────────

  validate(formId) {
    const requiredTypes = ['choice', 'input', 'slider', 'switch', 'confirm'];
    const missing = [];
    for (const card of this._cards) {
      if (formId && card.formId !== formId) continue;
      if (!requiredTypes.includes(card.type)) continue;
      if (!card.plugin.validate()) {
        missing.push(card.typeId);
      }
    }
    return { valid: missing.length === 0, missing };
  }

  submit(formId) {
    if (this._submitted) return { success: false, error: 'already submitted' };
    const { valid, missing } = this.validate(formId);
    if (!valid) {
      if (this._bubble) {
        this._bubble.querySelectorAll('.x-card-invalid').forEach(x => x.classList.remove('x-card-invalid'));
        missing.forEach(id => {
          const el = this._bubble.querySelector(`[data-typeid="${id}"]`);
          if (el) el.classList.add('x-card-invalid');
        });
      }
      return { success: false, error: 'incomplete', missing };
    }

    const formCards = formId
      ? this._cards.filter(c => c.formId === formId)
      : this._cards;

    const data = { formid: formId || 'default' };
    const result = [];

    for (const card of formCards) {
      const value = card.plugin.getValue();
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
      card.plugin.disable();
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

  getCards(type) {
    if (type) return this._cards.filter(c => c.type === type);
    return [...this._cards];
  }

  /** 获取 card 的 plugin 实例（供外部读取状态） */
  getPlugin(typeId) {
    const card = this._cards.find(c => c.typeId === typeId);
    return card ? card.plugin : null;
  }

  // ─── 状态序列化 / 恢复 ─────────────────────────

  /** 导出当前所有卡片状态（JSON 安全） */
  toJSON() {
    const forms = {};
    for (const card of this._cards) {
      if (!forms[card.formId]) forms[card.formId] = { cards: {} };
      forms[card.formId].cards[card.typeId] = {
        type: card.type,
        value: card.plugin.getValue()
      };
    }
    for (const card of this._cards) {
      if (card._submitted) {
        if (forms[card.formId]) forms[card.formId].submitted = true;
      }
    }
    return { forms };
  }

  /** 从 JSON 恢复卡片值和提交态（需先渲染卡片）
   *  只恢复值（选项高亮、滑块位置等），不冻结交互——让用户可以从恢复点继续操作。 */
  restore(json) {
    if (!json || !json.forms) return;
    for (const [formId, form] of Object.entries(json.forms)) {
      const formCards = this._cards.filter(c => c.formId === formId);
      for (const [typeId, st] of Object.entries(form.cards || {})) {
        const card = formCards.find(c => c.typeId === typeId);
        if (!card || !card.plugin) continue;
        if (st.value !== undefined && st.value !== null) {
          card.plugin._value = st.value;
        }
        card.plugin.refresh();
      }
    }
  }

  /** 非流式渲染一条消息（用于历史恢复），可选传入卡片状态 */
  renderMessage(container, text, cardState) {
    XIUIChat._injectStyle();
    const ct = typeof container === 'string' ? document.querySelector(container) : container;
    if (!ct) throw new Error('[XIUI] renderMessage: container not found');

    const msg = document.createElement('div');
    msg.className = 'x-msg';
    msg.innerHTML = '<div class="x-avatar">AI</div><div class="x-bubble"></div>';
    ct.appendChild(msg);

    const bubble = msg.querySelector('.x-bubble');
    this._bubble = bubble;
    this.reset();
    bubble.innerHTML = this._mdRender(text);
    this._replaceCardBlocks(bubble);
    if (cardState) this.restore(cardState);
    return { msg, bubble, cards: this._cards };
  }

  // ─── 工具 ────────────────────────────────────

  _dec(html) {
    const el = document.createElement('textarea');
    el.innerHTML = html;
    return el.value;
  }

  _parseAttrs(s) {
    if (!s) return {};
    const attrs = {};
    s.split('@').forEach(pair => {
      if (!pair) return;
      const idx = pair.indexOf(':');
      if (idx > 0) attrs[pair.slice(0, idx)] = pair.slice(idx + 1);
      else attrs[pair] = true;
    });
    return attrs;
  }
}
