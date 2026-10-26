'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, endpointURL } = require('../src/config.cjs');
const { buildRequest, translateWithProvider } = require('../src/providers.cjs');
const { TranslationService } = require('../src/translator.cjs');
const { ConfigStore } = require('../src/store.cjs');

const activeConfig = () => normalizeConfig({ enabled: true, consent: true, provider: 'libre' });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function service(fetchImpl, extra = {}) {
  return new TranslationService({ getConfig: activeConfig, getSecret: () => '', fetchImpl, intervalOverride: 0, ...extra });
}

test('自动翻译默认关闭，启用必须明确同意发送文本', () => {
  assert.equal(normalizeConfig().enabled, false);
  assert.throws(() => normalizeConfig({ enabled: true }), /勾选/);
  assert.throws(() => normalizeConfig({ provider: 'unknown' }), /不支持/);
  assert.throws(() => normalizeConfig({ maxChars: 100000 }), /取值/);
});

test('旧版默认收信规则自动迁移，保留用户自定义规则', () => {
  const legacy = '.message-container--others, .message-container--other, .message-container--recv, .message-container--received';
  const migrated = normalizeConfig({ selectors: { incoming: legacy } });
  assert.match(migrated.selectors.incoming, /\.message-content > \.text-element--other/);
  assert.equal(normalizeConfig({ selectors: { incoming: '.my-custom-incoming' } }).selectors.incoming, '.my-custom-incoming');
});

test('本地 HTTP 与远程 HTTPS 允许，危险地址与 URL 密钥拒绝', () => {
  for (const url of ['http://localhost:5000/translate','http://127.0.0.1:5000/translate','http://[::1]:5000/translate','https://example.com/translate']) assert.equal(endpointURL(url), url);
  for (const url of ['http://example.com/translate','file:///C:/secret','https://key:password@example.com/','https://example.com/?key=secret','https://example.com/#secret']) assert.throws(() => endpointURL(url));
});

test('DeepL 使用官方端点、鉴权头与自动源语言检测', () => {
  const request = buildRequest(normalizeConfig(), 'test-key', 'hello');
  assert.equal(request.url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(request.headers.Authorization, 'DeepL-Auth-Key test-key');
  assert.deepEqual(JSON.parse(request.body), { text: ['hello'], target_lang: 'ZH-HANS' });
  assert.equal(buildRequest(normalizeConfig({ deeplPlan: 'pro', target: 'ja' }), 'k', 'hi').url, 'https://api.deepl.com/v2/translate');
});

test('LibreTranslate 请求保留换行与特殊字符并禁用重定向', async () => {
  const text = 'hello <img onerror=x>\nworld';
  const value = await translateWithProvider(activeConfig(), 'key', text, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(JSON.parse(options.body), { q: text, source: 'auto', target: 'zh', format: 'text', api_key: 'key' });
    return json({ translatedText: '你好\n世界', detectedLanguage: { language: 'en' } });
  });
  assert.deepEqual(value, { text: '你好\n世界', detected: 'en' });
});

test('禁用与超长文本不会发起网络请求', async () => {
  let calls = 0;
  const s = service(async () => { calls++; return json({ translatedText: '你好' }); }, { getConfig: () => normalizeConfig() });
  await assert.rejects(s.translate('hello'), { code: 'DISABLED' });
  await assert.rejects(s.translate('x'.repeat(5001), { test: true }), { code: 'TOO_LONG' });
  assert.equal(calls, 0);
});

test('相同文本合并在途请求并命中内存缓存', async () => {
  let calls = 0;
  const s = service(async () => { calls++; await new Promise(r => setTimeout(r, 10)); return json({ translatedText: '你好' }); });
  const results = await Promise.all([s.translate('hello'), s.translate('hello')]);
  assert.equal(calls, 1);
  assert.equal(results[0].text, '你好');
  assert.equal((await s.translate('hello')).cached, true);
  assert.equal(calls, 1);
  s.reset();
  await s.translate('hello');
  assert.equal(calls, 2);
});

test('跨消息请求串行执行', async () => {
  let active = 0, peak = 0;
  const s = service(async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return json({ translatedText: '译文' }); });
  await Promise.all(['a','b','c'].map(text => s.translate(text)));
  assert.equal(peak, 1);
});

test('限流暂停后续请求，错误信息不会回显服务端原文或密钥', async () => {
  let calls = 0;
  const s = service(async () => { calls++; return json({ error: 'secret-key private-chat' }, 429); });
  await assert.rejects(s.translate('private-chat'), error => error.code === 'RATE_LIMIT' && !/private-chat|secret-key/.test(error.message));
  await assert.rejects(s.translate('another'), { code: 'COOLDOWN' });
  assert.equal(calls, 1);
});

test('保存配置/暂停会取消在途结果与等待队列', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const s = service(async () => { await gate; return json({ translatedText: '旧译文' }); });
  const first = assert.rejects(s.translate('first'), { code: 'CANCELLED' });
  const second = assert.rejects(s.translate('second'), { code: 'CANCELLED' });
  s.reset(); release();
  await Promise.all([first, second]);
  assert.equal(s.cache.size, 0);
});

test('请求超时返回可理解错误', async () => {
  const s = service(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })), { once: true });
  }), { getConfig: () => ({ ...activeConfig(), requestTimeoutMs: 15 }) });
  await assert.rejects(s.translate('hello'), { code: 'TIMEOUT' });
});

test('无效或过大的响应被拒绝', async () => {
  await assert.rejects(translateWithProvider(activeConfig(), '', 'hi', async () => new Response('<html>bad</html>')), { code: 'RESPONSE' });
  await assert.rejects(translateWithProvider(activeConfig(), '', 'hi', async () => new Response('x'.repeat(270000))), { code: 'RESPONSE' });
});

test('配置加密保存，公开设置不返回密钥，服务间独立保留密钥', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qqst-test-'));
  const fakeEncryption = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from('protected:' + Buffer.from(text).toString('hex')), decryptString: bytes => Buffer.from(bytes.toString().slice(10), 'hex').toString() };
  try {
    const store = new ConfigStore(directory, fakeEncryption);
    const saved = store.save({ ...normalizeConfig(), apiKey: 'private-deepl-key' });
    assert.equal(saved.keyConfigured, true);
    assert.equal('apiKey' in saved, false);
    assert.equal(fs.readFileSync(store.file, 'utf8').includes('private-deepl-key'), false);
    assert.equal(new ConfigStore(directory, fakeEncryption).secret('deepl'), 'private-deepl-key');
    store.save({ ...activeConfig(), apiKey: 'private-libre-key' });
    assert.equal(store.secret('deepl'), 'private-deepl-key');
    store.save({ ...activeConfig(), apiKey: '', clearKey: true });
    assert.equal(store.secret('libre'), '');
    assert.equal(store.secret('deepl'), 'private-deepl-key');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('加密不可用时拒绝保存明文；损坏的设置不会自动启用', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qqst-test-'));
  try {
    const store = new ConfigStore(directory, { isEncryptionAvailable: () => false });
    assert.throws(() => store.save({ ...normalizeConfig(), apiKey: 'key' }), /加密不可用/);
    assert.equal(fs.existsSync(store.file), false);
    fs.writeFileSync(store.file, '{broken');
    const damaged = new ConfigStore(directory, {});
    assert.equal(damaged.config.enabled, false);
    assert.match(damaged.loadError, /损坏/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
