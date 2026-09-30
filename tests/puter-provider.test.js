/**
 * Cabang provider Puter: tanpa API key, lewat global `puter` (CDN),
 * dengan kontrak yang sama seperti jalur fetch (string, streaming, batal).
 *
 * `globalThis.puter` dipalsukan supaya test berjalan offline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { store } from '../src/core/store.js';
import { callAIProvider, candidateModels } from '../src/services/ai-provider.js';
import { PUTER_DEFAULT_MODEL } from '../src/config.js';

const MESSAGES = [{ role: 'user', content: 'halo' }];

function setupPuter({ signedIn = true, chatImpl = null } = {}) {
  store.state.settings = {
    ...(store.state.settings || {}),
    provider: 'puter',
    puterModel: 'gpt-5-nano',
  };
  const chatCalls = [];
  globalThis.puter = {
    auth: {
      isSignedIn: async () => signedIn,
      getUser: async () => ({ username: 'guru-uji' }),
    },
    ai: {
      chat: async (messages, options) => {
        chatCalls.push({ messages, options });
        if (chatImpl) return chatImpl(messages, options);
        return { message: { content: '{"ok":true}' } };
      },
    },
  };
  return chatCalls;
}

function teardownPuter() {
  delete globalThis.puter;
}

test('puter mengembalikan konten dan meneruskan model + normalize', async () => {
  const calls = setupPuter();
  try {
    const text = await callAIProvider('gpt-5-nano', MESSAGES, 5000, 100);
    assert.equal(text, '{"ok":true}');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.model, 'gpt-5-nano');
    assert.equal(calls[0].options.normalize, true);
    assert.deepEqual(calls[0].messages, MESSAGES);
  } finally {
    teardownPuter();
  }
});

test('puter tanpa login melempar pesan login', async () => {
  setupPuter({ signedIn: false });
  try {
    await assert.rejects(() => callAIProvider('gpt-5-nano', MESSAGES, 5000, 100), /Login Puter/);
  } finally {
    teardownPuter();
  }
});

test('puter tanpa CDN melempar pesan jelas', async () => {
  store.state.settings = { ...(store.state.settings || {}), provider: 'puter' };
  delete globalThis.puter;
  await assert.rejects(() => callAIProvider('gpt-5-nano', MESSAGES, 5000, 100), /gagal dimuat/);
});

test('puter streaming menggabung potongan dan melapor progres', async () => {
  async function* gen() {
    yield { text: '{"halo":"' };
    yield { text: 'dunia"}' };
  }
  setupPuter({ chatImpl: async () => gen() });
  const seen = [];
  try {
    const text = await callAIProvider('gpt-5-nano', MESSAGES, 5000, 100, {
      onProgress: (p) => seen.push(p.chars),
    });
    assert.equal(text, '{"halo":"dunia"}');
    assert.ok(seen.length >= 1, 'onProgress harus dipanggil');
    assert.equal(seen.at(-1), text.length);
  } finally {
    teardownPuter();
  }
});

test('sinyal batal sebelum panggilan menghentikan puter', async () => {
  setupPuter();
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(
      () => callAIProvider('gpt-5-nano', MESSAGES, 5000, 100, { signal: controller.signal }),
      /dibatalkan/i
    );
  } finally {
    teardownPuter();
  }
});

test('candidateModels puter: tier pilihan lalu hemat', async () => {
  store.state.settings = {
    ...(store.state.settings || {}),
    provider: 'puter',
    puterModel: 'claude-sonnet-5',
  };
  const models = candidateModels();
  assert.deepEqual(models, ['claude-sonnet-5', PUTER_DEFAULT_MODEL]);
});
