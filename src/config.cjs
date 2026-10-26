'use strict';

const LEGACY_INCOMING_SELECTOR = '.message-container--others, .message-container--other, .message-container--recv, .message-container--received';

const DEFAULTS = Object.freeze({
  enabled: false,
  consent: false,
  provider: 'deepl',
  deeplPlan: 'free',
  endpoint: 'http://127.0.0.1:5000/translate',
  target: 'zh',
  skipChinese: true,
  maxChars: 3000,
  requestTimeoutMs: 12000,
  intervalMs: 500,
  selectors: {
    root: '#ml-root .ml-list, .message-list',
    message: '.message-container',
    incoming: LEGACY_INCOMING_SELECTOR + ', .message-content > .text-element--other',
    outgoing: '.message-container--self, .message-container--sent',
    content: '.msg-content-container .message-content',
    text: '.text-normal, .text-element'
  }
});

const LANGUAGES = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt'];
function endpointURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('翻译地址必须是完整的 HTTP/HTTPS URL。'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('远程服务必须使用 HTTPS；HTTP 仅允许本机 localhost / 127.0.0.1 / ::1。');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('翻译地址不能包含账号、密码、查询参数或片段。');
  return url.href;
}

function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置格式无效。');
  const config = { ...DEFAULTS, selectors: { ...DEFAULTS.selectors } };
  for (const key of ['enabled', 'consent', 'skipChinese']) {
    if (key in input) {
      if (typeof input[key] !== 'boolean') throw new Error(`${key} 必须为布尔值。`);
      config[key] = input[key];
    }
  }
  if (input.provider !== undefined) {
    if (!['deepl', 'libre'].includes(input.provider)) throw new Error('不支持的翻译服务。');
    config.provider = input.provider;
  }
  if (input.deeplPlan !== undefined) {
    if (!['free', 'pro'].includes(input.deeplPlan)) throw new Error('DeepL 套餐无效。');
    config.deeplPlan = input.deeplPlan;
  }
  if (input.target !== undefined) {
    if (!LANGUAGES.includes(input.target)) throw new Error('目标语言无效。');
    config.target = input.target;
  }
  if (input.endpoint !== undefined) config.endpoint = endpointURL(input.endpoint);
  for (const [key, min, max] of [['maxChars', 100, 5000], ['requestTimeoutMs', 3000, 30000], ['intervalMs', 250, 10000]]) {
    if (input[key] !== undefined) {
      if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`${key} 的取值应为 ${min}–${max}。`);
      config[key] = input[key];
    }
  }
  if (input.selectors !== undefined) {
    if (!input.selectors || typeof input.selectors !== 'object') throw new Error('界面适配规则无效。');
    for (const key of Object.keys(DEFAULTS.selectors)) {
      if (input.selectors[key] !== undefined) {
        const selector = input.selectors[key];
        if (typeof selector !== 'string' || !selector.trim() || selector.length > 600) throw new Error(`选择器 ${key} 无效。`);
        config.selectors[key] = selector.trim();
      }
    }
  }
  // Migrate the original built-in rule, while preserving user-defined adapters.
  if (config.selectors.incoming === LEGACY_INCOMING_SELECTOR) config.selectors.incoming = DEFAULTS.selectors.incoming;
  if (config.enabled && !config.consent) throw new Error('请先勾选同意将待翻译文本发送至所选翻译服务。');
  return config;
}

module.exports = { DEFAULTS, LANGUAGES, endpointURL, normalizeConfig };
