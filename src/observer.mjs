import { extractMessage, isProbablyChinese, messageIdentity, messageDirection, validateSelectors } from './messages.mjs';
import { unwrap } from './ui.mjs';

const TRANSLATION_STYLE = `:host{display:block;margin-top:9px;padding-top:8px;border-top:1px solid #a5b6bc55;font:12px/1.7 "Microsoft YaHei UI","Segoe UI",sans-serif;color:inherit;opacity:.95}*{box-sizing:border-box}.label{font-size:10px;letter-spacing:.6px;color:#248173;margin-bottom:3px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.muted{opacity:.6}.error{color:#b65c3e}button{font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid #a5b6bc66;padding:1px 8px;border-radius:5px;margin-top:6px}@media(prefers-color-scheme:dark){.label{color:#92d7bb}.error{color:#ffb195}}`;

export class MessageObserver {
  constructor(document, bridge, { visible = null } = {}) {
    this.document = document;
    this.window = document.defaultView;
    this.bridge = bridge;
    this.isVisible = visible || (row => {
      if (this.document.visibilityState === 'hidden') return false;
      const rect = row.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < this.window.innerHeight;
    });
    this.records = new Map();
    this.config = null;
    this.timer = null;
    this.generation = 0;
    this.error = '';
    this.stats = { translated: 0, failed: 0 };
    this.listener = () => this.schedule();
  }

  start(config) {
    this.stop();
    this.config = config;
    try { validateSelectors(config.selectors, this.document); }
    catch (error) { this.error = error.message; return; }
    this.error = '';
    if (!config.enabled || !config.consent) return;
    this.observer = new this.window.MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (element?.closest('.qqst-translation, #qqst-controls, #qqst-dialog')) return false;
        // Ignore our own host insertion/removal.
        if (mutation.type === 'childList') {
          const changed = [...mutation.addedNodes, ...mutation.removedNodes];
          if (!mutation.removedNodes.length && changed.length && changed.every(node => node.nodeType === 1 && node.classList?.contains('qqst-translation'))) return false;
        }
        return true;
      });
      if (relevant) this.schedule();
    });
    this.observer.observe(this.document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class','data-msg-id','data-message-id','id'] });
    this.document.addEventListener('scroll', this.listener, true);
    this.document.addEventListener('visibilitychange', this.listener);
    this.window.addEventListener('resize', this.listener);
    this.scan();
  }

  stop() {
    this.generation++;
    this.observer?.disconnect();
    clearTimeout(this.timer); this.timer = null;
    this.document.removeEventListener('scroll', this.listener, true);
    this.document.removeEventListener('visibilitychange', this.listener);
    this.window.removeEventListener('resize', this.listener);
    for (const record of this.records.values()) record.host.remove();
    this.records.clear();
  }

  schedule() {
    if (!this.config?.enabled || this.timer) return;
    // Fixed window, so a constant stream of messages cannot starve translation.
    this.timer = setTimeout(() => { this.timer = null; this.scan(); }, 140);
  }

  scan() {
    if (!this.config?.enabled || !this.config.consent) return;
    const roots = [...this.document.querySelectorAll(this.config.selectors.root)];
    const rows = new Set(roots.flatMap(root => [...root.querySelectorAll(this.config.selectors.message)]));
    for (const [row, record] of this.records) {
      if (!rows.has(row) || !row.isConnected) { record.host.remove(); this.records.delete(row); }
    }
    for (const row of rows) {
      const message = extractMessage(row, this.config);
      const old = this.records.get(row);
      const identity = message ? messageIdentity(row, message.text) : '';
      if (old && (old.identity !== identity || !message || old.content !== message.content)) {
        old.host.remove(); this.records.delete(row);
      }
      if (!message || !this.isVisible(row)) continue;
      const record = this.records.get(row);
      if (record && record.identity === identity && record.host.isConnected) continue;
      if (record) this.records.delete(row);
      if (this.config.skipChinese && this.config.target.startsWith('zh') && isProbablyChinese(message.text)) continue;
      const host = this.document.createElement('div');
      host.className = 'qqst-translation';
      host.setAttribute('role', 'note');
      host.setAttribute('aria-label', '消息译文');
      const shadow = host.attachShadow({ mode: 'open' });
      const style = this.document.createElement('style'); style.textContent = TRANSLATION_STYLE;
      const label = this.document.createElement('div'); label.className = 'label'; label.textContent = '译文';
      const text = this.document.createElement('div'); text.className = 'text muted'; text.textContent = '正在翻译…';
      shadow.append(style, label, text);
      message.content.append(host);
      const next = { identity, host, shadow, text, content: message.content, original: message.text, generation: this.generation };
      this.records.set(row, next);
      if (message.text.length > this.config.maxChars) {
        text.className = 'text muted'; text.textContent = `超过 ${this.config.maxChars} 字符，已跳过。`;
      } else this.translate(row, next);
    }
  }

  current(row, record) {
    if (record.generation !== this.generation || this.records.get(row) !== record || !row.isConnected || !record.host.isConnected) return false;
    if (!row.closest(this.config.selectors.root)) return false;
    const message = extractMessage(row, this.config);
    return message && message.content === record.content && messageIdentity(row, message.text) === record.identity;
  }

  async translate(row, record) {
    try {
      const result = await unwrap(this.bridge.translate(record.original));
      if (!this.current(row, record)) return;
      record.text.className = 'text'; record.text.textContent = result.text;
      record.host.title = result.cached ? '来自本次运行的内存缓存' : '自动翻译';
      this.stats.translated++;
    } catch (error) {
      if (!this.current(row, record)) return;
      record.text.className = 'text error'; record.text.textContent = error.message;
      const retry = this.document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
      retry.addEventListener('click', event => {
        event.stopPropagation();
        retry.remove();
        if (!this.current(row, record)) return;
        record.text.className = 'text muted'; record.text.textContent = '正在翻译…';
        this.translate(row, record);
      });
      record.shadow.append(retry);
      this.stats.failed++;
    }
  }

  diagnostics() {
    const counts = { incoming: 0, outgoing: 0, unknown: 0 };
    let rows = [];
    try {
      const roots = [...this.document.querySelectorAll(this.config.selectors.root)];
      rows = [...new Set(roots.flatMap(root => [...root.querySelectorAll(this.config.selectors.message)]))];
      for (const row of rows) counts[messageDirection(row, this.config)]++;
      return { enabled: this.config.enabled, messageLists: roots.length, renderedMessages: rows.length, ...counts, ...this.stats, error: this.error };
    } catch { return { error: this.error || '设置尚未加载或适配规则无效。' }; }
  }
}
