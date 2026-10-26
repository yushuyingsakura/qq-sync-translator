// Compatible with the restricted preload module system in LiteLoaderQQNT 1.4.
const { contextBridge, ipcRenderer } = require('electron');
const prefix = 'qq-sync-translator:';
const invoke = (name, value) => ipcRenderer.invoke(prefix + name, value);

contextBridge.exposeInMainWorld('qqSyncTranslator', {
  getConfig: () => invoke('get-config'),
  saveConfig: value => invoke('save-config', value),
  translate: text => invoke('translate', text),
  test: () => invoke('test'),
  onConfigChanged: callback => {
    const listener = (_event, config) => callback(config);
    ipcRenderer.on(prefix + 'config-changed', listener);
    return () => ipcRenderer.removeListener(prefix + 'config-changed', listener);
  }
});
