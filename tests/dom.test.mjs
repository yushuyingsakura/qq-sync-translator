import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Window } from 'happy-dom';
import { MessageObserver } from '../src/observer.mjs';
import { extractMessage, messageDirection, readText, isProbablyChinese } from '../src/messages.mjs';
import { mountSettings } from '../src/ui.mjs';
const require = createRequire(import.meta.url);
const { normalizeConfig } = require('../src/config.cjs');

const config = (extra = {}) => normalizeConfig({ enabled: true, consent: true, provider: 'libre', ...extra });
const ok = value => ({ ok: true, value });
const settle = () => new Promise(r => setTimeout(r, 30));
function fixture() {
  const window = new Window({ url: 'http://localhost:8123/' });
  window.document.body.innerHTML = '<div id="ml-root"><div class="ml-list"></div></div>';
  const document = window.document;
  function row(text, direction = 'others', id = '') {
    const element = document.createElement('div');
    element.className = 'message-container' + (direction ? ` message-container--${direction}` : '');
    if (id) element.dataset.msgId = id;
    element.innerHTML = '<div class="msg-content-container"><div class="message-content"><span class="text-element"><span class="text-normal"></span></span></div></div>';
    element.querySelector('.text-normal').textContent = text;
    document.querySelector('.ml-list').append(element);
    return element;
  }
  return { window, document, row };
}

test('只翻译收信，跳过发信、未知方向、中文、纯 URL 与数字', async () => {
  const { window, document, row } = fixture();
  const incoming = row('Hello world!');
  const outgoing = row('My own message', 'self');
  const unknown = row('Unknown direction', '');
  row('你好，世界！'); row('https://example.com/path'); row('123456');
  const calls = [];
  const observer = new MessageObserver(document, { translate: async text => { calls.push(text); return ok({ text: '你好，世界！' }); } }, { visible: () => true });
  observer.start(config()); await settle();
  assert.deepEqual(calls, ['Hello world!']);
  assert.equal(incoming.querySelector('.qqst-translation').shadowRoot.querySelector('.text').textContent, '你好，世界！');
  assert.equal(outgoing.querySelector('.qqst-translation'), null);
  assert.equal(unknown.querySelector('.qqst-translation'), null);
  assert.equal(incoming.querySelector('.text-normal').textContent, 'Hello world!');
  observer.stop(); await window.happyDOM.close();
});

test('多层文字不重复；引用/@/文件与已有译文不进入请求', async () => {
  const { window, row } = fixture();
  const message = row('');
  message.querySelector('.message-content').innerHTML = '<span class="reply-element"><span class="text-normal">quoted</span></span><span class="at-element"><span class="text-normal">@friend</span></span><span class="text-element"><span class="text-normal">Hello</span><br><span class="text-normal">world</span></span><div class="file-element"><span class="text-normal">secret.txt</span></div><div class="qqst-translation">old</div>';
  assert.equal(extractMessage(message, config()).text, 'Hello\nworld');
  await window.happyDOM.close();
});

test('收到与发出标记冲突时发出优先；Vue 明确标记可识别', async () => {
  const { window, row } = fixture();
  const message = row('Hello');
  message.classList.add('message-container--self');
  assert.equal(messageDirection(message, config()), 'outgoing');
  const vue = row('Bonjour', '');
  vue.__vueParentComponent = { props: { isSelf: false } };
  assert.equal(messageDirection(vue, config()), 'incoming');
  await window.happyDOM.close();
});

test('QQ 原生正文 other 标记可识别收信，无需消息行收信类名或 Vue 属性', async () => {
  const { window, document, row } = fixture();
  const incoming = row('', '');
  incoming.classList.add('message-container--mix-or-markdown');
  incoming.querySelector('.message-content').innerHTML = '<span class="text-element text-element--other">这是一条收到的消息。</span>';
  const currentConfig = config({ target: 'en' });
  assert.equal(incoming.__vueParentComponent, undefined);
  assert.equal(messageDirection(incoming, currentConfig), 'incoming');
  assert.equal(extractMessage(incoming, currentConfig).text, '这是一条收到的消息。');
  const calls = [];
  const observer = new MessageObserver(document, { translate: async text => { calls.push(text); return ok({ text: 'This is a received message.' }); } }, { visible: () => true });
  observer.start(currentConfig); await settle();
  assert.deepEqual(calls, ['这是一条收到的消息。']);
  assert.equal(incoming.querySelector('.qqst-translation').shadowRoot.querySelector('.text').textContent, 'This is a received message.');
  observer.stop(); await window.happyDOM.close();
});

test('自己的消息包含正文 other 标记时仍优先判定发信并排除翻译', async () => {
  const { window, document, row } = fixture();
  const outgoing = row('', 'self');
  outgoing.querySelector('.message-content').innerHTML = '<span class="text-element text-element--other">Nested other marker in my message</span>';
  assert.equal(messageDirection(outgoing, config()), 'outgoing');
  assert.equal(extractMessage(outgoing, config()), null);
  const calls = [];
  const observer = new MessageObserver(document, { translate: async text => { calls.push(text); return ok({ text: 'Should not be called' }); } }, { visible: () => true });
  observer.start(config()); await settle();
  assert.deepEqual(calls, []);
  assert.equal(outgoing.querySelector('.qqst-translation'), null);
  observer.stop(); await window.happyDOM.close();
});

test('正文根元素自身匹配文字选择器时保留其直接文字和换行', async () => {
  const { window, document } = fixture();
  const content = document.createElement('div');
  content.className = 'message-content text-element';
  content.append(document.createTextNode('Direct body text'), document.createElement('br'), document.createTextNode('Second line'));
  assert.equal(readText(content, '.text-normal, .text-element'), 'Direct body text\nSecond line');
  await window.happyDOM.close();
});

test('日语/韩语和中外文混合不会误判为纯中文', () => {
  assert.equal(isProbablyChinese('你好，世界！'), true);
  for (const text of ['こんにちは世界','안녕하세요','你好 hello','Привет']) assert.equal(isProbablyChinese(text), false);
});

test('通过登录 UID 与消息发送人判断方向，自己的消息优先于收信样式', async () => {
  const { window, row } = fixture();
  const received = row('Bonjour', '');
  received.__vueParentComponent = { props: { msgRecord: { senderUid: 'friend-uid' } } };
  const self = row('My text', 'others');
  self.__vueParentComponent = { props: { msgRecord: { senderUid: 'self-uid' } } };
  assert.equal(messageDirection(received, { ...config(), selfUid: 'self-uid' }), 'incoming');
  assert.equal(messageDirection(self, { ...config(), selfUid: 'self-uid' }), 'outgoing');
  await window.happyDOM.close();
});

test('转发卡片内嵌的文字消息不进入翻译', async () => {
  const { window, row } = fixture();
  const message = row('Hello');
  message.querySelector('.msg-content-container').innerHTML = '<div class="forward-element"><div class="message-content"><span class="text-element">Forwarded text</span></div></div>';
  assert.equal(extractMessage(message, config()), null);
  await window.happyDOM.close();
});

test('重复扫描不重复请求，翻译 HTML 作为纯文本显示', async () => {
  const { window, document, row } = fixture();
  const incoming = row('Hello'); let calls = 0;
  const observer = new MessageObserver(document, { translate: async () => { calls++; return ok({ text: '<img src=x onerror="alert(1)">' }); } }, { visible: () => true });
  observer.start(config()); await settle(); observer.scan(); observer.scan(); await settle();
  const shadow = incoming.querySelector('.qqst-translation').shadowRoot;
  assert.equal(calls, 1);
  assert.equal(shadow.querySelector('img'), null);
  assert.match(shadow.querySelector('.text').textContent, /<img/);
  observer.stop(); await window.happyDOM.close();
});

test('复用消息节点后丢弃旧响应，译文与新消息一致', async () => {
  const { window, document, row } = fixture();
  const incoming = row('First', 'others', '1');
  const pending = [];
  const observer = new MessageObserver(document, { translate: text => new Promise(resolve => pending.push({ text, resolve })) }, { visible: () => true });
  observer.start(config());
  incoming.querySelector('.text-normal').textContent = 'Second'; incoming.dataset.msgId = '2';
  observer.scan();
  pending[0].resolve(ok({ text: '第一条旧译文' })); await settle();
  assert.equal(incoming.querySelector('.qqst-translation').shadowRoot.querySelector('.text').textContent, '正在翻译…');
  pending[1].resolve(ok({ text: '第二条' })); await settle();
  assert.equal(incoming.querySelector('.qqst-translation').shadowRoot.querySelector('.text').textContent, '第二条');
  assert.deepEqual(pending.map(x=>x.text), ['First','Second']);
  observer.stop(); await window.happyDOM.close();
});

test('暂停立即移除译文，旧请求不能重建译文', async () => {
  const { window, document, row } = fixture();
  const incoming = row('Hello'); let release;
  const observer = new MessageObserver(document, { translate: () => new Promise(resolve => { release = resolve; }) }, { visible: () => true });
  observer.start(config()); observer.start(config({ enabled: false }));
  release(ok({ text: '旧译文' })); await settle();
  assert.equal(incoming.querySelector('.qqst-translation'), null);
  observer.stop(); await window.happyDOM.close();
});

test('收到新消息后自动处理，隐藏行保持未发送', async () => {
  const { window, document, row } = fixture();
  const calls = [];
  const observer = new MessageObserver(document, { translate: async text => { calls.push(text); return ok({ text: '你好' }); } }, { visible: row => !row.hidden });
  observer.start(config()); row('New message'); const hidden = row('Hidden message'); hidden.hidden = true;
  await new Promise(r => setTimeout(r, 220));
  assert.deepEqual(calls, ['New message']);
  observer.stop(); await window.happyDOM.close();
});

test('失败后支持单条重试', async () => {
  const { window, document, row } = fixture();
  const incoming = row('Hello'); let calls = 0;
  const observer = new MessageObserver(document, { translate: async () => ++calls === 1 ? { ok: false, error: '网络错误' } : ok({ text: '你好' }) }, { visible: () => true });
  observer.start(config()); await settle();
  incoming.querySelector('.qqst-translation').shadowRoot.querySelector('button').click(); await settle();
  assert.equal(calls, 2);
  assert.equal(incoming.querySelector('.qqst-translation').shadowRoot.querySelector('.text').textContent, '你好');
  observer.stop(); await window.happyDOM.close();
});

test('设置页可保存并测试；保存后清空密钥输入', async () => {
  const { window, document } = fixture();
  const container = document.createElement('div'); document.body.append(container);
  let saved, tested = 0;
  const bridge = {
    getConfig: async () => ok({ ...config({ enabled: false }), keyConfigured: false }),
    saveConfig: async input => { saved = input; return ok({ ...input, keyConfigured: true }); },
    test: async () => { tested++; return ok({ text: '你好，很高兴认识你。' }); }
  };
  const root = await mountSettings(container, bridge);
  root.getElementById('apiKey').value = 'test-api-key';
  root.getElementById('test').click(); await settle();
  assert.equal(saved.apiKey, 'test-api-key');
  assert.equal(tested, 1);
  assert.equal(root.getElementById('apiKey').value, '');
  assert.match(root.getElementById('status').textContent, /连接成功/);
  await window.happyDOM.close();
});

