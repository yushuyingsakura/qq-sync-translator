import { MessageObserver } from './observer.mjs';
import { mountSettings, unwrap } from './ui.mjs';

let observer;
let config;
let bridge;
let controlHost;
let dialog;
let settingsButton;
let pauseButton;
let controlsObserver;

function showError(error) {
  if (pauseButton) { pauseButton.textContent = '翻译设置'; pauseButton.title = error.message; }
  console.warn('[QQ 收信同步翻译]', error.code || 'INIT_ERROR');
}

async function openSettings() {
  if (dialog?.isConnected) return;
  dialog = document.createElement('dialog'); dialog.id = 'qqst-dialog';
  Object.assign(dialog.style, { padding: '0', border: '0', background: 'transparent', maxWidth: 'min(780px, 96vw)', width: '760px', maxHeight: '90vh', borderRadius: '18px' });
  const wrapper = document.createElement('div');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.setAttribute('aria-label','关闭翻译设置');
  Object.assign(close.style, { position: 'sticky', top: '8px', float: 'right', margin: '8px 14px -40px 0', zIndex: '1', cursor: 'pointer', padding: '4px 12px', borderRadius: '8px', border: '1px solid #b8c4ce', background: '#fff', color: '#334155' });
  close.addEventListener('click', () => dialog.close());
  const content = document.createElement('div');
  wrapper.append(close, content); dialog.append(wrapper); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  await mountSettings(content, bridge, { getDiagnostics: () => observer.diagnostics() });
}

function updateControls() {
  if (pauseButton) {
    pauseButton.textContent = config?.enabled ? '自动翻译 · 已开启' : '翻译已暂停';
    pauseButton.title = config?.enabled ? '暂停自动翻译' : '配置并启用自动翻译';
  }
}

function ensureControls() {
  const hasMessages = config && document.querySelector(config.selectors.root);
  if (!hasMessages) { controlHost?.remove(); return; }
  if (controlHost?.isConnected) return;
  controlHost = document.createElement('div'); controlHost.id = 'qqst-controls';
  Object.assign(controlHost.style, { position: 'fixed', right: '20px', bottom: '20px', zIndex: '10000' });
  const root = controlHost.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>:host{font:12px "Microsoft YaHei UI",sans-serif}.bar{display:flex;border:1px solid #b9d8cf;border-radius:24px;padding:3px;background:#f5fcf8;box-shadow:0 4px 18px #1a514718}button{font:inherit;border:0;background:transparent;cursor:pointer;padding:7px 11px;color:#236e5e;border-radius:20px}button:hover{background:#dfefe6}button:focus-visible{outline:2px solid #168575}@media(prefers-color-scheme:dark){.bar{background:#253d35;border-color:#456d5c}button{color:#b7e1c9}button:hover{background:#365445}}</style><div class="bar"><button id="pause" type="button"></button><button id="settings" type="button" aria-label="打开翻译设置">⚙ 设置</button></div>`;
  pauseButton = root.getElementById('pause'); settingsButton = root.getElementById('settings');
  settingsButton.addEventListener('click', openSettings);
  pauseButton.addEventListener('click', async () => {
    if (!config?.enabled) return openSettings();
    pauseButton.disabled = true;
    try { applyConfig(await unwrap(bridge.saveConfig({ ...config, enabled: false }))); }
    catch (error) { showError(error); }
    finally { pauseButton.disabled = false; }
  });
  document.body.append(controlHost); updateControls();
}

function applyConfig(value) {
  config = value;
  observer.start(config);
  ensureControls(); updateControls();
}

async function initialize() {
  bridge = window.qqSyncTranslator;
  if (!bridge) return;
  observer = new MessageObserver(document, bridge);
  bridge.onConfigChanged(applyConfig);
  try {
    applyConfig(await unwrap(bridge.getConfig()));
    controlsObserver = new MutationObserver(() => ensureControls());
    controlsObserver.observe(document.body, { childList: true, subtree: true });
  } catch (error) { showError(error); }
  window.addEventListener('pagehide', () => { observer.stop(); controlsObserver?.disconnect(); }, { once: true });
}

export async function onSettingWindowCreated(view) {
  const api = window.qqSyncTranslator;
  if (!api) { view.textContent = '插件桥接未加载，请确认 LiteLoaderQQNT 版本为 1.4+ 后重启 QQ。'; return; }
  await mountSettings(view, api, { getDiagnostics: () => observer?.diagnostics() || { note: '请在聊天窗口的翻译设置中查看消息识别结果。' } });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}
