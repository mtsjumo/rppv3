/**
 * Layanan pengaturan: baca/tulis localStorage, sinkronkan UI, uji API.
 */

import { store, initialSettings } from '../core/store.js';
import { STORAGE_KEYS, readJson, writeJson } from '../core/storage.js';
import { withCorsProxy } from './ai-provider.js';
import { showToast } from '../ui/toast.js';
import {
  DEFAULT_WORKER_URL,
  KILO_BASE,
  KILO_DEFAULT_MODEL,
  OPENROUTER_BASE,
  POOLSIDE_BASE,
  PUTER_DEFAULT_MODEL,
} from '../config.js';

/** Muat pengaturan dari localStorage dan terapkan ke state. */
export function loadSettings() {
  const saved = readJson(STORAGE_KEYS.settings, null);
  if (saved && typeof saved === 'object') {
    store.state.settings = { ...initialSettings, ...saved };
    // Migrasi: settings lama hanya punya `apiKey` (OpenRouter) — pertahankan.
    if (store.state.settings.apiKey && !store.state.settings.openRouterKey) {
      store.state.settings.openRouterKey = store.state.settings.apiKey;
    }
  }

  // Default SELALU berlaku, termasuk di origin/profil baru yang belum punya
  // simpanan. (Versi lama hanya menerapkan default bila sudah ada simpanan —
  // itu sebabnya kolom Worker pernah kosong.)
  const s = store.state.settings;
  if (!s.provider) s.provider = 'puter';
  if (!s.puterModel) s.puterModel = PUTER_DEFAULT_MODEL;
  if (!s.kiloModel) s.kiloModel = KILO_DEFAULT_MODEL;
  if (!s.poolsideModel) s.poolsideModel = 'poolside/laguna-s-2.1';
  if (!s.corsProxy) s.corsProxy = DEFAULT_WORKER_URL;
  if (!s.fallbackModel) s.fallbackModel = 'openrouter/free';
  if (!s.model) s.model = initialSettings.model;

  return s;
}

/** Simpan pengaturan ke localStorage. */
export function persistSettings() {
  return writeJson(STORAGE_KEYS.settings, store.state.settings);
}

/** API key aktif untuk provider aktif (Puter & Kilo-boleh-kosong tidak wajib key). */
export function activeApiKey() {
  const s = store.state.settings;
  if (s.provider === 'puter') return '';
  if (s.provider === 'kilo') return s.kiloKey || '';
  return s.provider === 'poolside' ? s.poolsideKey || '' : s.openRouterKey || s.apiKey || '';
}

/**
 * Uji autentikasi ke provider aktif.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testConnection() {
  const provider = store.state.settings.provider || 'puter';
  if (provider === 'puter') return testPuterConnection();
  if (provider === 'kilo') return testKiloConnection();
  const key = activeApiKey();

  if (!key) {
    return {
      ok: false,
      message: provider === 'poolside' ? '❌ Poolside API Key kosong' : '❌ API Key kosong',
    };
  }

  try {
    if (provider === 'poolside') {
      // Poolside OpenAI-compatible: daftar model sebagai uji autentikasi.
      // Catatan: Poolside tidak mengirim header CORS, jadi tanpa proxy browser
      // pasti memblokir.
      const res = await fetch(withCorsProxy(`${POOLSIDE_BASE}/models`), {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        return { ok: true, message: '✅ Poolside: key valid' };
      }
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: `❌ ${err.error?.message || err.message || res.statusText}`,
      };
    }

    const res = await fetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        message: `✅ ${data.data?.label || 'Valid'} | Sisa: ${data.data?.limit_remaining ?? '?'}`,
      };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, message: `❌ ${err.error?.message || res.statusText}` };
  } catch (e) {
    const msg = e.message || String(e);
    if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) {
      const noProxy = !(store.state.settings.corsProxy || '').trim();
      if ((provider === 'poolside' || provider === 'kilo') && noProxy) {
        const who = provider === 'poolside' ? 'Poolside' : 'Kilo';
        return {
          ok: false,
          message: `⛔ Browser memblokir request (CORS): ${who} tidak mengizinkan panggilan langsung dari browser. Isi Worker / Proxy URL milik sendiri lalu Test lagi.`,
        };
      }
      return { ok: false, message: `❌ Jaringan diblokir: ${msg}` };
    }
    return { ok: false, message: `❌ ${msg}` };
  }
}

/**
 * Uji Kilo dengan satu panggilan chat ringan (max_tokens lega agar tidak
 * terpotong reasoning). Key opsional: kosong = mode anonim.
 */
async function testKiloConnection() {
  const s = store.state.settings;
  const headers = { 'Content-Type': 'application/json' };
  if (s.kiloKey) headers.Authorization = `Bearer ${s.kiloKey}`;
  try {
    // Via worker (wajib: Kilo tanpa header CORS). Anonim = tanpa Authorization.
    const res = await fetch(withCorsProxy(`${KILO_BASE}/chat/completions`), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: s.kiloModel || KILO_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Balas hanya: ok' }],
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const raw = err.error?.message || err.message || err || res.statusText;
      if (res.status === 400 && /bad target/i.test(String(raw))) {
        return {
          ok: false,
          message:
            '⛔ Worker bawaan menolak api.kilo.ai (hanya mengizinkan Poolside). Isi Worker / Proxy URL sendiri yang mengizinkan Kilo di Pengaturan lanjutan, atau pakai provider lain.',
        };
      }
      return { ok: false, message: `❌ ${typeof raw === 'string' ? raw : res.statusText}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!String(text).trim()) return { ok: false, message: '❌ Kilo membalas kosong — coba model lain' };
    return { ok: true, message: `✅ Kilo (${s.kiloModel || KILO_DEFAULT_MODEL}): AI merespons` };
  } catch (e) {
    const msg = e.message || String(e);
    if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) {
      return {
        ok: false,
        message:
          '⛔ Browser memblokir request. Pastikan Worker / Proxy URL terisi dan mengizinkan api.kilo.ai.',
      };
    }
    return { ok: false, message: `❌ ${msg}` };
  }
}

/** Uji login + satu panggilan ringan ke Puter (tanpa API key). */
async function testPuterConnection() {
  const puter = globalThis.puter;
  if (!puter?.ai?.chat) {
    return { ok: false, message: '❌ Puter.js gagal dimuat (CDN diblokir?)' };
  }
  try {
    if (!(await puter.auth?.isSignedIn?.())) {
      return { ok: false, message: '❌ Belum login Puter — klik Login Puter dulu' };
    }
    const user = await puter.auth.getUser().catch(() => null);
    // Uji dengan model yang sedang dipilih (bukan hardcode), supaya hasilnya
    // mewakili generate sungguhan. max_tokens lega agar tidak terpotong.
    const model = store.state.settings.puterModel || PUTER_DEFAULT_MODEL;
    const resp = await puter.ai.chat('Balas hanya dengan kata: ok', {
      model,
      max_tokens: 200,
      normalize: true,
    });
    const msg = resp?.message || resp?.choices?.[0]?.message || {};
    const text = (typeof msg.content === 'string' ? msg.content : '') || '';
    if (!text.trim()) {
      const reason = resp?.finish_reason || msg.finish_reason || '?';
      return {
        ok: false,
        message: `❌ Puter membalas kosong (model ${model}, finish: ${reason}) — coba tier lain`,
      };
    }
    return {
      ok: true,
      message: `✅ Puter (${model}): login ${user?.username ? `sebagai ${user.username}` : 'ok'} — AI merespons`,
    };
  } catch (e) {
    return { ok: false, message: `❌ ${e.message || e}` };
  }
}

/** Simpan pengaturan saat test API berhasil (key baru langsung terpakai). */
export function adoptTestedKey() {
  const s = store.state.settings;
  if (s.provider === 'puter') {
    persistSettings();
    return;
  }
  if (s.provider === 'kilo') {
    persistSettings();
    return;
  }
  if (s.provider === 'poolside') {
    s.poolsideKey = s.poolsideKey || '';
  } else {
    s.openRouterKey = s.openRouterKey || s.apiKey || '';
    s.apiKey = s.openRouterKey;
  }
  persistSettings();
}

export { showToast };
