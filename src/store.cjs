'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeConfig } = require('./config.cjs');

class ConfigStore {
  constructor(directory, safeStorage) {
    this.directory = directory;
    this.file = path.join(directory, 'settings.json');
    this.safeStorage = safeStorage;
    this.config = normalizeConfig();
    this.secrets = {};
    this.loadError = '';
    try {
      if (fs.existsSync(this.file)) {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.config = normalizeConfig(saved.config);
        this.secrets = saved.secrets && typeof saved.secrets === 'object' ? saved.secrets : {};
      }
    } catch {
      this.loadError = '设置文件损坏或不可读取，已暂停自动翻译；请重新保存设置。';
    }
  }

  publicConfig() {
    return {
      ...this.config,
      selectors: { ...this.config.selectors },
      keyConfigured: Boolean(this.secrets[this.config.provider]),
      loadError: this.loadError
    };
  }

  secret(provider) {
    const encoded = this.secrets[provider];
    if (!encoded) return '';
    try {
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error();
      return this.safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    } catch {
      const { TranslationError } = require('./providers.cjs');
      throw new TranslationError('保存的密钥无法解密，请在本机重新填写并保存。', 'CONFIG', 30000);
    }
  }

  save(input) {
    const config = normalizeConfig(input);
    const secrets = { ...this.secrets };
    if (input.clearKey === true) delete secrets[config.provider];
    if (input.apiKey !== undefined && input.apiKey !== '') {
      if (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey)) throw new Error('API Key 格式无效。');
      if (!input.apiKey.trim()) throw new Error('API Key 不能只包含空白字符。');
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 密钥加密不可用，无法保存 API Key。');
      secrets[config.provider] = this.safeStorage.encryptString(input.apiKey.trim()).toString('base64');
    }
    if (config.enabled && config.provider === 'deepl' && !secrets.deepl) throw new Error('启用前请填写 DeepL API Key。');
    fs.mkdirSync(this.directory, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, config, secrets }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.config = config;
    this.secrets = secrets;
    this.loadError = '';
    return this.publicConfig();
  }
}

module.exports = { ConfigStore };
