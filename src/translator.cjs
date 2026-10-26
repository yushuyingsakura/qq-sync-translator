'use strict';

const { createHash } = require('node:crypto');
const { TranslationError, translateWithProvider } = require('./providers.cjs');

class TranslationService {
  constructor({ getConfig, getSecret, fetchImpl, intervalOverride }) {
    Object.assign(this, { getConfig, getSecret, fetchImpl, intervalOverride });
    this.queue = [];
    this.pending = new Map();
    this.cache = new Map();
    this.generation = 0;
    this.running = false;
    this.cooldownUntil = 0;
    this.nextStart = 0;
    this.controller = null;
  }

  reset() {
    this.generation++;
    this.cache.clear();
    this.cooldownUntil = 0;
    this.controller?.abort();
    const cancelled = new TranslationError('设置已更改或翻译已暂停，请重试。', 'CANCELLED');
    for (const task of this.queue.splice(0)) task.reject(cancelled);
    this.pending.clear();
  }

  translate(text, { test = false } = {}) {
    const config = this.getConfig();
    if (!test && (!config.enabled || !config.consent)) return Promise.reject(new TranslationError('自动翻译尚未启用。', 'DISABLED'));
    if (typeof text !== 'string' || !text.trim()) return Promise.reject(new TranslationError('没有可翻译的文字。', 'TEXT'));
    if (text.length > config.maxChars) return Promise.reject(new TranslationError(`消息超过 ${config.maxChars} 字符，已跳过。`, 'TOO_LONG'));
    if (Date.now() < this.cooldownUntil) return Promise.reject(new TranslationError('翻译服务暂时暂停，请稍后重试或检查设置。', 'COOLDOWN'));
    const key = createHash('sha256').update(JSON.stringify([this.generation, config.provider, config.deeplPlan, config.endpoint, config.target, text])).digest('hex');
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return Promise.resolve({ ...value, cached: true });
    }
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.queue.length >= 80) return Promise.reject(new TranslationError('待翻译消息过多，请稍后重试。', 'QUEUE_FULL'));
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const task = { key, text, config, generation: this.generation, resolve, reject };
    this.pending.set(key, promise);
    this.queue.push(task);
    this.drain();
    return promise;
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const task = this.queue.shift();
        let timer;
        try {
          const delay = Math.max(0, this.nextStart - Date.now());
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          if (task.generation !== this.generation) throw new TranslationError('翻译已取消。', 'CANCELLED');
          if (Date.now() < this.cooldownUntil) throw new TranslationError('服务暂时暂停，请稍后重试。', 'COOLDOWN');
          this.nextStart = Date.now() + (this.intervalOverride ?? task.config.intervalMs);
          const secret = this.getSecret(task.config.provider);
          const controller = new AbortController();
          this.controller = controller;
          timer = setTimeout(() => controller.abort(), task.config.requestTimeoutMs);
          const result = await translateWithProvider(task.config, secret, task.text, this.fetchImpl, controller.signal);
          if (task.generation !== this.generation) throw new TranslationError('翻译已取消。', 'CANCELLED');
          this.cache.set(task.key, result);
          if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
          task.resolve(result);
        } catch (error) {
          let safe = error;
          if (task.generation !== this.generation) safe = new TranslationError('翻译已取消。', 'CANCELLED');
          else if (error.name === 'AbortError') safe = new TranslationError('翻译超时，请检查网络或服务地址后重试。', 'TIMEOUT', 5000);
          else if (!(error instanceof TranslationError)) safe = new TranslationError('无法连接翻译服务，请检查网络、接口地址和证书。', 'NETWORK', 5000);
          if (task.generation === this.generation && safe.cooldownMs) this.cooldownUntil = Date.now() + safe.cooldownMs;
          task.reject(safe);
        } finally {
          clearTimeout(timer);
          this.controller = null;
          if (task.generation === this.generation) this.pending.delete(task.key);
        }
      }
    } finally { this.running = false; }
  }
}

module.exports = { TranslationService };
