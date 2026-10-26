'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const { once } = require('node:events');

function harness(directory) {
  const mainFile = path.resolve(__dirname, '../src/main.cjs');
  const handlers = new Map(), messages = [];
  const electron = {
    app: { whenReady: async () => {} },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    net: { fetch: (...args) => fetch(...args) },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value.split('').reverse().join('')), decryptString: value => value.toString().split('').reverse().join('') }
  };
  const realRequire = createRequire(mainFile);
  const sandbox = { exports: {}, require: name => name === 'electron' ? electron : realRequire(name), LiteLoader: { plugins: { qq_sync_translator: { path: { data: directory } } } }, URL };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), sandbox, { filename: mainFile });
  const frame = { url: 'app://./index.html' };
  const contents = { mainFrame: frame, isDestroyed: () => false, once: () => {}, send: (name, value) => messages.push({ name, value }) };
  sandbox.exports.onBrowserWindowCreated({ webContents: contents });
  const event = { sender: contents, senderFrame: frame };
  return { handlers, event, messages, call: (name, argument, from = event) => handlers.get('qq-sync-translator:' + name)(from, argument) };
}

function cleanup(directory) {
  const resolved = path.resolve(directory);
  const base = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(base) && path.basename(resolved).startsWith('qqst-ipc-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('主进程拒绝陌生窗口、子框架和远程页面的 IPC 调用', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qqst-ipc-'));
  try {
    const h = harness(directory);
    assert.equal((await h.call('get-config')).ok, true);
    assert.equal((await h.call('get-config', null, { ...h.event, sender: { isDestroyed: () => false } })).code, 'ACCESS');
    assert.equal((await h.call('get-config', null, { ...h.event, senderFrame: { url: 'app://./child.html' } })).code, 'ACCESS');
    h.event.senderFrame.url = 'https://example.com/';
    assert.equal((await h.call('get-config')).code, 'ACCESS');
  } finally { cleanup(directory); }
});

test('主进程与真实本地 HTTP 翻译服务连通；暂停阻止网络发送', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qqst-ipc-'));
  const received = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push({ path: req.url, method: req.method, payload: JSON.parse(Buffer.concat(chunks)) });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ translatedText: '你好，很高兴认识你。' }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const h = harness(directory);
    const original = (await h.call('get-config')).value;
    assert.equal((await h.call('translate', 'private')).code, 'DISABLED');
    const saved = await h.call('save-config', { ...original, provider: 'libre', endpoint: `http://127.0.0.1:${server.address().port}/translate`, apiKey: 'demo-local-key', enabled: false });
    assert.equal(saved.ok, true);
    assert.equal(saved.value.keyConfigured, true);
    assert.equal(saved.value.apiKey, undefined);
    assert.equal((await h.call('test', 'ignored arbitrary text')).ok, true);
    assert.equal(received[0].payload.q, 'Hello, nice to meet you.');
    assert.equal(received[0].payload.api_key, 'demo-local-key');
    assert.equal(received[0].method, 'POST');
    await h.call('save-config', { ...saved.value, enabled: true, consent: true });
    assert.equal((await h.call('translate', 'Received sample text')).value.text, '你好，很高兴认识你。');
    await h.call('save-config', { ...saved.value, enabled: false });
    assert.equal((await h.call('translate', 'Should not send')).code, 'DISABLED');
    assert.deepEqual(received.map(x=>x.payload.q), ['Hello, nice to meet you.', 'Received sample text']);
    assert.equal(h.messages.every(x=>!JSON.stringify(x).includes('demo-local-key')), true);
  } finally { server.close(); await once(server, 'close'); cleanup(directory); }
});
