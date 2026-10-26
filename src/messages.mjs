const EXCLUDED = '.qqst-translation, .reply-element, .reply-content, .reply-message, .quote, .quote-message, .forward-element, .ark-element, .file-element, .sender-name, .at-element, [contenteditable="true"]';

export function validateSelectors(selectors, document) {
  for (const [key, selector] of Object.entries(selectors)) {
    try { document.querySelector(selector); }
    catch { throw new Error(`界面适配规则 ${key} 不是有效的 CSS 选择器。`); }
  }
}

export function messageDirection(row, config) {
  const { incoming, outgoing } = config.selectors;
  // Any explicit outgoing marker wins, including a nested marker used by a theme.
  if (row.matches(outgoing) || row.querySelector(outgoing)) return 'outgoing';
  // Some QQ builds expose a boolean on the Vue component rather than a CSS class.
  // Do not infer incoming merely from the absence of an outgoing class.
  const starts = [row, row.querySelector('.msg-content-container')];
  for (const element of starts) {
    let instance = element?.__vueParentComponent;
    for (let depth = 0; instance && depth < 6; depth++, instance = instance.parent) {
      const props = instance.props;
      if (typeof props?.isSelf === 'boolean') return props.isSelf ? 'outgoing' : 'incoming';
      if (typeof props?.msgRecord?.isSelf === 'boolean') return props.msgRecord.isSelf ? 'outgoing' : 'incoming';
      const sender = props?.msgRecord?.senderUid;
      if (typeof sender === 'string' && sender && config.selfUid) return sender === config.selfUid ? 'outgoing' : 'incoming';
    }
  }
  if (row.matches(incoming) || row.querySelector(incoming)) return 'incoming';
  return 'unknown';
}

export function extractMessage(row, config) {
  if (messageDirection(row, config) !== 'incoming') return null;
  const content = row.querySelector(config.selectors.content);
  if (!content) return null;
  if (content.closest(EXCLUDED) || content.closest(config.selectors.message) !== row) return null;
  const text = readText(content, config.selectors.text);
  if (!text || !/\p{L}/u.test(text) || /^https?:\/\/\S+$/i.test(text)) return null;
  return { content, text };
}

export function readText(content, selector) {
  const pieces = [];
  function visit(node, inText = false) {
    if (node.nodeType === 3) { if (inText) pieces.push(node.nodeValue); return; }
    if (node.nodeType !== 1 || node.matches(EXCLUDED)) return;
    const eligible = inText || node.matches(selector);
    if (node.tagName === 'BR') { if (inText) pieces.push('\n'); return; }
    for (const child of node.childNodes) visit(child, eligible);
  }
  visit(content);
  return pieces.join('').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

export function isProbablyChinese(text) {
  if (!/\p{Script=Han}/u.test(text)) return false;
  // Kana and Hangul must not be mistaken for Chinese. Mixed-language text is translated.
  const remainder = text.replace(/[\p{Script=Han}\p{N}\p{P}\p{S}\p{Z}\s]/gu, '');
  return !/\p{L}/u.test(remainder);
}

export function messageIdentity(row, text) {
  // QQ recycles virtual-list nodes. Include both identity attributes and original text.
  return [row.getAttribute('data-msg-id') || '', row.getAttribute('data-message-id') || '', row.id || '', text].join('\u0000');
}
