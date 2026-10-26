'use strict';

const { endpointURL } = require('./config.cjs');

class TranslationError extends Error {
  constructor(message, code = 'SERVICE', cooldownMs = 0) {
    super(message);
    this.code = code;
    this.cooldownMs = cooldownMs;
  }
}

function buildRequest(config, secret, text) {
  if (config.provider === 'deepl') {
    if (!secret) throw new TranslationError('请先在插件设置中填写 DeepL API Key。', 'CONFIG', 30000);
    const targets = { zh: 'ZH-HANS', 'zh-TW': 'ZH-HANT', en: 'EN-US', pt: 'PT-PT' };
    return {
      url: `https://${config.deeplPlan === 'free' ? 'api-free' : 'api'}.deepl.com/v2/translate`,
      headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${secret}` },
      body: JSON.stringify({ text: [text], target_lang: targets[config.target] || config.target.toUpperCase() })
    };
  }
  const body = { q: text, source: 'auto', target: config.target === 'zh-TW' ? 'zt' : config.target, format: 'text' };
  if (secret) body.api_key = secret;
  return { url: endpointURL(config.endpoint), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function readJSON(response) {
  // Bound the streamed body; do not buffer unbounded remote responses.
  if (Number(response.headers.get('content-length')) > 262144) throw new TranslationError('翻译服务响应过大。', 'RESPONSE');
  const reader = response.body?.getReader();
  if (!reader) throw new TranslationError('翻译服务未返回内容。', 'RESPONSE');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) {
      await reader.cancel();
      throw new TranslationError('翻译服务响应过大。', 'RESPONSE');
    }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TranslationError('翻译服务未返回有效 JSON，请检查接口地址。', 'RESPONSE'); }
}

async function translateWithProvider(config, secret, text, fetchImpl, signal) {
  const request = buildRequest(config, secret, text);
  const response = await fetchImpl(request.url, {
    method: 'POST', headers: request.headers, body: request.body,
    redirect: 'error', credentials: 'omit', signal
  });
  // Avoid displaying server-provided error bodies that may echo keys or chat text.
  if ([401, 403].includes(response.status)) throw new TranslationError('鉴权失败，请检查 API Key、套餐和服务权限。', 'AUTH', 30000);
  if (response.status === 429) throw new TranslationError('翻译服务限流，已暂停请求 30 秒，请稍后点重试。', 'RATE_LIMIT', 30000);
  if (response.status === 456) throw new TranslationError('DeepL 翻译额度已用完，请检查账户额度。', 'QUOTA', 60000);
  if (!response.ok) throw new TranslationError(`翻译服务返回 HTTP ${response.status}，请检查接口与网络。`, 'HTTP', 5000);
  const data = await readJSON(response);
  if (data.error) throw new TranslationError('翻译服务拒绝了请求，请检查 API Key、语言支持和额度。', 'SERVICE', 10000);
  const translated = config.provider === 'deepl' ? data.translations?.[0]?.text : data.translatedText;
  const detected = config.provider === 'deepl' ? data.translations?.[0]?.detected_source_language : data.detectedLanguage?.language;
  if (typeof translated !== 'string' || !translated.trim() || translated.length > 30000) throw new TranslationError('翻译服务返回的译文无效。', 'RESPONSE');
  return { text: translated.trim(), detected: typeof detected === 'string' ? detected.slice(0, 20) : '' };
}

module.exports = { TranslationError, buildRequest, translateWithProvider };
