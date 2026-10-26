'use strict';

const { ipcMain, net, safeStorage, app } = require('electron');
const { ConfigStore } = require('./store.cjs');
const { TranslationService } = require('./translator.cjs');
const CHANNEL = 'qq-sync-translator:';
const windows = new Set();
let store;
let service;
let selfUid = '';

function publicConfig() { return { ...store.publicConfig(), selfUid }; }
function broadcast() {
  const value = publicConfig();
  for (const contents of windows) {
    if (!contents.isDestroyed()) contents.send(CHANNEL + 'config-changed', value);
  }
  return value;
}

function ready() {
  if (!store) {
    const directory = LiteLoader.plugins.qq_sync_translator.path.data;
    store = new ConfigStore(directory, safeStorage);
    service = new TranslationService({
      getConfig: () => store.config,
      getSecret: provider => store.secret(provider),
      fetchImpl: (url, options) => net.fetch(url, options)
    });
  }
}

function trusted(event) {
  if (!windows.has(event.sender) || event.sender.isDestroyed()) return false;
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try { return ['file:', 'local:', 'app:', 'qqnt:'].includes(new URL(event.senderFrame.url).protocol); }
  catch { return false; }
}

function handle(name, action) {
  ipcMain.handle(CHANNEL + name, async (event, argument) => {
    if (!trusted(event)) return { ok: false, error: '此页面没有插件访问权限。', code: 'ACCESS' };
    try {
      await app.whenReady();
      ready();
      return { ok: true, value: await action(argument) };
    } catch (error) {
      return { ok: false, error: error.message || '插件操作失败。', code: error.code || 'ERROR' };
    }
  });
}

handle('get-config', publicConfig);
handle('save-config', input => {
  store.save(input);
  service.reset();
  return broadcast();
});
handle('translate', text => service.translate(text));
// The renderer cannot turn arbitrary chat text into an unrestricted test request.
handle('test', () => service.translate('Hello, nice to meet you.', { test: true }));

exports.onBrowserWindowCreated = window => {
  const contents = window.webContents;
  windows.add(contents);
  contents.once('destroyed', () => windows.delete(contents));
};

// UID stays in memory and lets the UI distinguish self messages across theme changes.
exports.onLogin = uid => {
  if (typeof uid !== 'string' || !uid || uid.length > 200) return;
  selfUid = uid;
  if (store) { service.reset(); broadcast(); }
};
