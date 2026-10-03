/**
 * Cabang provider Kilo (jalur OpenRouter Kilo, OpenAI-compatible).
 *
 * Ciri Kilo: key opsional (kosong = anonim), wajib lewat CORS proxy dari
 * browser, tanpa response_format (andalkan extractJSON + retry).
 * fetch dipalsukan supaya test berjalan offline dan deterministik.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { store } from '../src/core/store.js';
import { callAIProvider, candidateModels } from '../src/services/ai-provider.js';

const MESSAGES = [{ role: 'user', content: 'halo' }];

function setupKilo({ kiloKey = '', fetchImpl }) {
  store.state.settings = {
    ...(store.state.settings || {}),
    provider: 'kilo',
    kiloKey,
    kiloModel: 'kilo-auto/free',
    corsProxy: '',
  };
  globalThis.fetch = fetchImpl;
}

const okJson = (obj) => Response.json(obj, { status: 200 });

test('kilo tanpa key: tanpa Authorization, URL ke kilo', async () => {
  let seen = {};
  setupKilo({
    fetchImpl: async (url, init) => {
      seen = { url: String(url), auth: init.headers?.Authorization, body: JSON.parse(init.body) };
      return okJson({ choices: [{ message: { content: '{"ok":true}' } }] });
    },
  });
  const text = await callAIProvider('kilo-auto/free', MESSAGES, 5000, 100);
  assert.equal(text, '{"ok":true}');
  assert.match(seen.url, /api\.kilo\.ai/, 'harus ke endpoint Kilo');
  assert.equal(seen.auth, undefined, 'tanpa key = tanpa header Authorization');
  assert.equal(seen.body.response_format, undefined, 'kilo tanpa json-mode (andalkan retry)');
  assert.equal(seen.body.model, 'kilo-auto/free');
});

test('kilo dengan key: header Authorization terkirim', async () => {
  let auth = null;
  setupKilo({
    kiloKey: 'kk-uji',
    fetchImpl: async (_url, init) => {
      auth = init.headers?.Authorization;
      return okJson({ choices: [{ message: { content: 'x' } }] });
    },
  });
  assert.equal(await callAIProvider('kilo-auto/free', MESSAGES, 5000, 100), 'x');
  assert.equal(auth, 'Bearer kk-uji');
});

test('kilo direct tanpa proxy walau worker terkonfigurasi', async () => {
  let url = '';
  setupKilo({
    fetchImpl: async (u) => {
      url = String(u);
      return okJson({ choices: [{ message: { content: 'x' } }] });
    },
  });
  store.state.settings.corsProxy = 'https://proxy.uji/?url=';
  assert.equal(await callAIProvider('kilo-auto/free', MESSAGES, 5000, 100), 'x');
  assert.match(url, /^https:\/\/api\.kilo\.ai\//, 'kilo direct, tanpa proxy');
  assert.doesNotMatch(url, /proxy\.uji/, 'worker tidak dipakai untuk Kilo');
});

test('konten reasoning dipakai bila content kosong (model thinking)', async () => {
  setupKilo({
    fetchImpl: async () =>
      okJson({ choices: [{ message: { content: null, reasoning: '{"ok":true}' } }] }),
  });
  assert.equal(await callAIProvider('kilo-auto/free', MESSAGES, 5000, 100), '{"ok":true}');
});

test('candidateModels kilo memakai model terpilih', async () => {
  store.state.settings = {
    ...(store.state.settings || {}),
    provider: 'kilo',
    kiloModel: 'qwen/qwen3.8-27b:free',
  };
  assert.deepEqual(candidateModels(), ['qwen/qwen3.8-27b:free']);
});
