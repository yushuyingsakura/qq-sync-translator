export const UI_STYLE = `
:host{font:14px/1.6 "Microsoft YaHei UI","Segoe UI",sans-serif;color:var(--qqst-text,#25334a);color-scheme:light dark;--panel:#fff;--line:#e4eaf2;--muted:#68768b;--field:#f7f9fc;display:block}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}
.shell{padding:26px;max-width:760px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:18px}
.eyebrow{font-size:11px;letter-spacing:1.8px;font-weight:700;color:#167971}.head{display:flex;gap:16px;align-items:center;margin-bottom:22px}.logo{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#e5f6f0;color:#147668;font-size:22px;font-weight:700;flex-shrink:0}
h1{font-size:23px;line-height:1.35;margin:3px 0 0}h2{font-size:15px;margin:0 0 14px}p{margin:8px 0}.muted{color:var(--muted);font-size:12px}.section{border-top:1px solid var(--line);padding-top:20px;margin-top:20px}.row{display:flex;align-items:flex-start;gap:14px;justify-content:space-between}.row strong{display:block}.switch{appearance:none;cursor:pointer;width:42px;height:24px;flex-shrink:0;border:0;border-radius:20px;background:#b9c3d2;position:relative;transition:background .15s}.switch:before{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;background:white;border-radius:50%;transition:transform .15s}.switch:checked{background:#168575}.switch:checked:before{transform:translateX(18px)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:grid;gap:6px;margin:12px 0}.field span{font-size:12px;color:var(--muted)}input:not([type=checkbox]),select{width:100%;padding:10px 12px;background:var(--field);color:inherit;border:1px solid var(--line);border-radius:9px;outline:none}input:focus,select:focus,button:focus-visible{outline:2px solid #24a68d;outline-offset:2px}.check{display:flex;gap:8px;align-items:flex-start;margin:12px 0;font-size:12px}.check input{accent-color:#168575;margin-top:4px}.notice{padding:12px 14px;border-radius:10px;background:#eef8f4;color:#2f6d5c;font-size:12px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}button{border:1px solid var(--line);background:var(--panel);color:inherit;padding:8px 14px;border-radius:9px}.primary{background:#167d70;color:#fff;border-color:#167d70}.status{white-space:pre-wrap;overflow-wrap:anywhere;min-height:24px;margin-top:12px;color:var(--muted);font-size:12px}.error{color:#bc4c38}.success{color:#147668}details{margin-top:18px;font-size:12px}summary{cursor:pointer;color:var(--muted)}[hidden]{display:none!important}.diagnostic{font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:var(--field);border-radius:8px}
@media(prefers-color-scheme:dark){:host{--qqst-text:#e1e7f0;--panel:#232a35;--line:#394455;--muted:#a1b0c5;--field:#1c2330}.notice{background:#203e36;color:#b0ddcf}.logo{background:#254b40;color:#b8e7d8}.error{color:#ffad94}.success{color:#96d9be}}
@media(max-width:520px){.shell{padding:18px}.grid{grid-template-columns:1fr}}
`;

const LANGUAGE_OPTIONS = [['zh','简体中文'],['zh-TW','繁體中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'],['es','Español'],['ru','Русский'],['pt','Português']];

export async function unwrap(promise) {
  const response = await promise;
  if (!response?.ok) {
    const error = new Error(response?.error || '插件通信失败，请重新启动 QQ。');
    error.code = response?.code || 'IPC';
    throw error;
  }
  return response.value;
}

export async function mountSettings(container, bridge, { getDiagnostics = () => ({}) } = {}) {
  const host = container.ownerDocument.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  container.replaceChildren(host);
  // Only static trusted markup is inserted as HTML. Messages, responses and keys use textContent/value.
  root.innerHTML = `<style>${UI_STYLE}</style><div class="shell">
    <div class="head"><div class="logo" aria-hidden="true">译</div><div><div class="eyebrow">QQ · INCOMING TRANSLATOR</div><h1>收信同步翻译</h1></div></div>
    <p class="muted">保留原文，在收到的文字消息下方显示译文。</p>
    <div class="section row"><div><strong>自动翻译收到的消息</strong><div class="muted">作用于当前打开会话中可见的文字消息。</div></div><input id="enabled" class="switch" type="checkbox" aria-label="启用自动翻译"></div>
    <div class="section"><h2>翻译服务</h2><div class="grid">
      <label class="field"><span>服务</span><select id="provider"><option value="deepl">DeepL 官方 API</option><option value="libre">LibreTranslate / 本地服务</option></select></label>
      <label class="field"><span>译成</span><select id="target">${LANGUAGE_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
    </div>
    <label class="field" id="plan-field"><span>DeepL API 套餐（与网页翻译会员不同）</span><select id="deeplPlan"><option value="free">DeepL API Free</option><option value="pro">DeepL API Pro</option></select></label>
    <label class="field" id="endpoint-field" hidden><span>完整 /translate 接口地址</span><input id="endpoint" type="url" spellcheck="false" placeholder="http://127.0.0.1:5000/translate"></label>
    <label class="field"><span id="key-label">API Key</span><input id="apiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="填写服务密钥"></label>
    <label class="check"><input id="clearKey" type="checkbox"><span>删除当前服务已保存的密钥</span></label>
    <p id="key-state" class="muted"></p>
    <div class="notice">启用后，待翻译的消息文字会发送到你选择的翻译服务。图片、语音和文件不作识别；本插件不保存聊天原文或译文到磁盘。</div>
    <label class="check"><input id="consent" type="checkbox"><span>我同意将待翻译文本发送至上方服务，并了解可能产生 API 用量费用。</span></label>
    <label class="check"><input id="skipChinese" type="checkbox"><span>目标为中文时跳过疑似纯中文消息（汉字判断可关闭）</span></label>
    </div>
    <div class="actions"><button id="save" class="primary">保存设置</button><button id="test">保存并测试（保持暂停）</button></div>
    <div id="status" class="status" role="status" aria-live="polite"></div>
    <details><summary>高级选项与兼容性诊断</summary><p class="muted">QQ 更新后若识别不到消息，可调整选择器。仅识别出明确“收到”标记的消息才会被翻译。</p>
      <div class="grid"><label class="field"><span>最大消息长度（字符）</span><input id="maxChars" type="number" min="100" max="5000"></label><label class="field"><span>请求最小间隔（毫秒）</span><input id="intervalMs" type="number" min="250" max="10000" step="50"></label></div>
      <div id="selectors"></div><button id="diagnose">刷新诊断</button><pre id="diagnostic" class="diagnostic"></pre>
    </details>
    <p class="muted">v0.1.1 · 需要 LiteLoaderQQNT 1.4+；QQ 版本更新可能需要重新适配。</p>
  </div>`;
  const $ = id => root.getElementById(id);
  let config;
  const selectorInputs = {};
  const selectorLabels = { root: '消息列表', message: '消息行', incoming: '收到的消息标记', outgoing: '发出的消息标记', content: '消息内容容器', text: '正文文字' };
  const status = (message, error = false) => { $('status').textContent = message; $('status').className = 'status ' + (error ? 'error' : 'success'); };
  function providerFields() {
    const isLibre = $('provider').value === 'libre';
    $('endpoint-field').hidden = !isLibre;
    $('plan-field').hidden = isLibre;
    $('key-label').textContent = isLibre ? 'API Key（自建免密服务可留空）' : 'DeepL API Key';
  }
  function fill(value) {
    config = value;
    for (const key of ['enabled','consent','skipChinese']) $(key).checked = config[key];
    for (const key of ['provider','deeplPlan','target','endpoint','maxChars','intervalMs']) $(key).value = config[key];
    $('apiKey').value = '';
    $('clearKey').checked = false;
    $('key-state').textContent = config.keyConfigured ? '当前服务已保存密钥；留空将保留现有密钥。' : '当前服务尚未保存密钥。';
    $('selectors').replaceChildren();
    for (const [key, value] of Object.entries(config.selectors)) {
      const label = host.ownerDocument.createElement('label');
      label.className = 'field';
      const span = host.ownerDocument.createElement('span');
      span.textContent = selectorLabels[key] || key;
      const input = host.ownerDocument.createElement('input');
      input.type = 'text'; input.value = value; input.spellcheck = false;
      selectorInputs[key] = input;
      label.append(span, input); $('selectors').append(label);
    }
    providerFields();
  }
  function collect() {
    const value = { ...config, selectors: {} };
    for (const key of ['enabled','consent','skipChinese']) value[key] = $(key).checked;
    for (const key of ['provider','deeplPlan','target','endpoint']) value[key] = $(key).value;
    for (const key of ['maxChars','intervalMs']) value[key] = Number($(key).value);
    for (const [key, input] of Object.entries(selectorInputs)) {
      const selector = input.value.trim();
      if (!selector) throw new Error(`${selectorLabels[key]}不能为空。`);
      try { host.ownerDocument.querySelector(selector); }
      catch { throw new Error(`${selectorLabels[key]}不是有效的 CSS 选择器。`); }
      value.selectors[key] = selector;
    }
    value.apiKey = $('apiKey').value;
    value.clearKey = $('clearKey').checked;
    if (value.enabled && !value.consent) throw new Error('请先勾选文本发送与 API 用量说明。');
    return value;
  }
  $('provider').addEventListener('change', () => {
    $('apiKey').value = ''; $('clearKey').checked = false;
    $('key-state').textContent = '切换服务后请填写该服务密钥，或留空以保留该服务之前保存的密钥。';
    providerFields();
  });
  async function save(test) {
    $('save').disabled = $('test').disabled = true;
    try {
      const input = collect();
      if (test) input.enabled = false;
      fill(await unwrap(bridge.saveConfig(input)));
      if (test) {
        status('正在测试连接…');
        const result = await unwrap(bridge.test());
        status('连接成功：' + result.text + '\n测试只发送固定问候语。打开自动翻译开关并保存即可启用。');
      } else status('设置已保存。' + (config.enabled ? '打开聊天会话即可自动翻译。' : '自动翻译已暂停。'));
    } catch (error) { status(error.message, true); }
    finally { $('save').disabled = $('test').disabled = false; }
  }
  $('save').addEventListener('click', () => save(false));
  $('test').addEventListener('click', () => save(true));
  $('diagnose').addEventListener('click', () => { $('diagnostic').textContent = JSON.stringify(getDiagnostics(), null, 2); });
  try {
    fill(await unwrap(bridge.getConfig()));
    if (config.loadError) status(config.loadError, true);
    $('diagnostic').textContent = JSON.stringify(getDiagnostics(), null, 2);
  } catch (error) { status(error.message, true); $('save').disabled = $('test').disabled = true; }
  return root;
}
