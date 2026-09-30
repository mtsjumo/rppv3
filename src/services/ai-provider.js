/**
 * Klien AI provider (OpenRouter & Poolside, OpenAI-compatible).
 *
 * Tanggung jawab modul ini murni: satu permintaan chat completion, dengan
 * timeout, streaming (opsional), dan normalisasi berbagai bentuk respons antar
 * model. Orkestrasi multi-model ada di `ai-client.js`.
 *
 * Kenapa streaming?
 *   1. Progres nyata: UI bisa menampilkan jumlah karakter yang sudah ditulis
 *      model, jadi tidak ada lagi layar "menunggu" tanpa kabar.
 *   2. Timeout yang adil: timer diam (idle) di-reset tiap potongan masuk,
 *      sehingga output panjang tidak dibunuh oleh batas total 120 detik.
 *   3. Batal yang sungguhan: tombol Batal meng-abort fetch yang sedang jalan,
 *      bukan menunggu respons selesai dulu.
 */

import { store } from '../core/store.js';
import { friendlyError } from './json.js';
import {
  OPENROUTER_BASE,
  POOLSIDE_BASE,
  PUTER_DEFAULT_MODEL,
  REQUEST_HARD_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from '../config.js';
import { emit } from '../core/events.js';

export { friendlyError };

/** Interval minimum antar laporan progres ke UI (ms). */
const PROGRESS_THROTTLE_MS = 250;

/**
 * Bungkus URL dengan CORS proxy bila dikonfigurasi.
 * Poolside tidak mengirim header CORS sehingga browser memblokir fetch langsung.
 * @param {string} url
 * @returns {string}
 */
export function withCorsProxy(url) {
  const proxy = (store.state.settings.corsProxy || '').trim();
  if (!proxy) return url;
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(url));
  return proxy + encodeURIComponent(url);
}

/** Provider aktif. */
export function currentProvider() {
  return store.state.settings.provider || 'openrouter';
}

/** API key untuk provider aktif. Puter tidak pakai key (login akun). */
export function currentApiKey() {
  const s = store.state.settings;
  if (currentProvider() === 'puter') return '';
  return currentProvider() === 'poolside' ? s.poolsideKey || '' : s.openRouterKey || s.apiKey || '';
}

/** Pesan error bila key belum diisi. */
function missingKeyMessage() {
  if (currentProvider() === 'puter') {
    return 'Belum login Puter. Buka ⚙️ Pengaturan, klik Login Puter.';
  }
  return currentProvider() === 'poolside'
    ? 'Poolside API Key belum diisi. Buka ⚙️ Pengaturan, pilih provider Poolside.'
    : 'API Key belum diisi. Buka ⚙️ Pengaturan.';
}

/** Error pembatalan oleh pengguna (dikenali job runner lewat `name`). */
function abortError() {
  const err = new Error('Generate dibatalkan pengguna');
  err.name = 'AbortError';
  return err;
}

/**
 * Satu panggilan chat completion.
 *
 * @param {string} model
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} [timeoutMs] batas diam: tidak ada data masuk selama ini = timeout
 * @param {number} [maxTokens]
 * @param {object} [opts]
 * @param {(p: {chars: number, thinking: boolean}) => void} [opts.onProgress]
 *     bila diisi, respons di-stream dan callback dipanggil (di-throttle)
 * @param {AbortSignal} [opts.signal] batalkan permintaan yang sedang berjalan
 * @param {boolean} [opts.stream] paksa on/off; default: on bila ada `onProgress`
 * @returns {Promise<string>} konten teks dari model
 */
export async function callAIProvider(
  model,
  messages,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxTokens = 8000,
  opts = {}
) {
  const { onProgress = null, signal = null } = opts;
  const wantStream = opts.stream ?? typeof onProgress === 'function';

  const provider = currentProvider();

  const controller = new AbortController();
  let abortReason = null;
  const abort = (reason) => {
    abortReason = abortReason || reason;
    controller.abort();
  };

  // Timer diam: di-reset setiap ada data masuk. Timer keras: batas mutlak.
  let idleTimer = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort('idle'), timeoutMs);
  };
  const hardTimer = setTimeout(() => abort('hard'), REQUEST_HARD_TIMEOUT_MS);
  const onUserAbort = () => abort('user');
  signal?.addEventListener('abort', onUserAbort, { once: true });
  const cleanupTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(hardTimer);
    signal?.removeEventListener('abort', onUserAbort);
  };
  armIdle();

  if (provider === 'puter') {
    // Puter: tanpa key, tanpa fetch, tanpa CORS proxy. Timer & pembatalan
    // tetap berlaku lewat controller yang sama seperti jalur fetch.
    try {
      return await callPuter(model, messages, maxTokens, {
        onProgress,
        signal,
        armIdle,
        controller,
      });
    } finally {
      cleanupTimers();
    }
  }
  const key = currentApiKey();
  if (!key) {
    cleanupTimers();
    throw new Error(missingKeyMessage());
  }
  if (signal?.aborted) {
    cleanupTimers();
    throw abortError();
  }

  try {
    const isPoolside = provider === 'poolside';
    let url = isPoolside
      ? `${POOLSIDE_BASE}/chat/completions`
      : `${OPENROUTER_BASE}/chat/completions`;
    if (isPoolside) url = withCorsProxy(url);

    const headers = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    if (!isPoolside) {
      headers['HTTP-Referer'] = window.location.origin || 'https://rpp-generator.github.io';
      headers['X-Title'] = 'AI RPP Generator';
    }

    const body = { model, messages, temperature: 0.3, max_tokens: maxTokens };
    // response_format & top_p hanya didukung OpenRouter — Poolside mengandalkan
    // instruksi JSON + extractJSON().
    if (!isPoolside) {
      body.response_format = { type: 'json_object' };
      body.top_p = 0.9;
    }
    if (wantStream) body.stream = true;

    emit('ai:request', { model, provider, phase: messages?.[0]?.meta?.phase });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error?.message || err.message || `HTTP ${res.status}: ${res.statusText}`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }

    armIdle();

    // Server boleh mengabaikan `stream: true` (mis. proxy yang mem-buffer).
    // Kalau bukan event-stream, perlakukan sebagai respons JSON biasa.
    const contentType = res.headers?.get?.('content-type') || '';
    if (wantStream && res.body?.getReader && /text\/event-stream/i.test(contentType)) {
      const text = await readEventStream(res, onProgress, armIdle);
      emit('ai:response', { model, provider });
      return text;
    }

    const data = await res.json();
    emit('ai:response', { model, provider });
    return extractContent(data);
  } catch (e) {
    if (e?.name === 'AbortError' || controller.signal.aborted) {
      if (abortReason === 'user' || signal?.aborted) throw abortError();
      if (abortReason === 'hard') {
        throw new Error(
          `Timeout: generate melebihi batas ${Math.round(REQUEST_HARD_TIMEOUT_MS / 1000)} detik`
        );
      }
      throw new Error(`Timeout: tidak ada respons dari model selama ${Math.round(timeoutMs / 1000)} detik`);
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(hardTimer);
    signal?.removeEventListener('abort', onUserAbort);
  }
}

/**
 * Satu panggilan lewat Puter.js (global `puter` dari CDN js.puter.com).
 *
 * Kontrak sama seperti jalur fetch: mengembalikan string konten, mendukung
 * `onProgress` (streaming) dan `signal` (batal). Bedanya: tanpa API key
 * (auth = login akun Puter guru = User-Pays) dan tanpa CORS proxy —
 * Puter mengizinkan panggilan langsung dari browser.
 *
 * `normalize: true` memaksa respons format OpenAI (`message.content` string)
 * di semua vendor, supaya `extractJSON()` di ai-client tidak perlu tahu
 * bentuk native Anthropic (array content-block).
 *
 * @returns {Promise<string>} konten teks dari model
 */
async function callPuter(model, messages, maxTokens, { onProgress, signal, armIdle, controller }) {
  const puter = globalThis.puter;
  if (!puter?.ai?.chat) {
    throw new Error(
      'Puter.js gagal dimuat (CDN js.puter.com diblokir?). Periksa koneksi lalu muat ulang halaman.'
    );
  }
  if (!(await puter.auth?.isSignedIn?.())) {
    throw new Error('Belum login Puter. Buka ⚙️ Pengaturan, klik Login Puter.');
  }
  if (signal?.aborted || controller.signal.aborted) throw abortError();

  emit('ai:request', { model, provider: 'puter', phase: messages?.[0]?.meta?.phase });
  armIdle();

  // Timer tidak bisa membatalkan promise Puter secara langsung, jadi
  // dilombakan dengan promise yang menolak saat controller di-abort
  // (idle/hard timeout maupun tombol Batal). `abortReason` di pemanggil
  // menentukan pesan akhirnya (timeout vs dibatalkan pengguna).
  const abortPromise = new Promise((_, reject) => {
    if (controller.signal.aborted) {
      reject(abortError());
      return;
    }
    controller.signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });

  const task = (async () => {
    const options = { model, temperature: 0.3, max_tokens: maxTokens, normalize: true };
    if (typeof onProgress !== 'function') {
      const resp = await puter.ai.chat(messages, options);
      armIdle();
      const text = extractPuterContent(resp);
      emit('ai:response', { model, provider: 'puter' });
      return text;
    }

    let text = '';
    let lastReport = 0;
    const report = (thinking) => {
      const now = Date.now();
      if (now - lastReport < PROGRESS_THROTTLE_MS) return;
      lastReport = now;
      onProgress({ chars: text.length, thinking });
    };
    const stream = await puter.ai.chat(messages, { ...options, stream: true });
    for await (const part of stream) {
      if (signal?.aborted || controller.signal.aborted) throw abortError();
      armIdle();
      if (typeof part?.text === 'string' && part.text) text += part.text;
      report(!text.length && !!part?.reasoning);
    }
    onProgress({ chars: text.length, thinking: false });
    if (!text) throw new Error('AI mengembalikan konten kosong');
    emit('ai:response', { model, provider: 'puter' });
    return text;
  })();

  return Promise.race([task, abortPromise]);
}

/**
 * Ambil konten teks dari respons puter.ai.chat() yang sudah dinormalisasi.
 * Berbeda dengan extractContent() (bentuk OpenAI `choices`), respons Puter
 * menaruh pesan langsung di `message`.
 */
function extractPuterContent(resp) {
  const msg = resp?.message || {};
  let content = msg.content;
  if (Array.isArray(content)) {
    content = content
      .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .join('');
  }
  if (typeof content === 'string' && content) return content;
  console.error('[ai] Respons Puter tanpa content, dump:', resp);
  throw new Error('AI mengembalikan konten kosong');
}

/**
 * Baca respons Server-Sent Events (format OpenAI-compatible) sampai selesai.
 * Baris komentar (mis. ": OPENROUTER PROCESSING") dan JSON rusak diabaikan.
 *
 * @param {Response} res
 * @param {((p: {chars: number, thinking: boolean}) => void)|null} onProgress
 * @param {() => void} onActivity dipanggil tiap ada data masuk (reset timer diam)
 * @returns {Promise<string>}
 */
async function readEventStream(res, onProgress, onActivity) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let lastReport = 0;

  const report = (force = false) => {
    if (typeof onProgress !== 'function') return;
    const now = Date.now();
    if (!force && now - lastReport < PROGRESS_THROTTLE_MS) return;
    lastReport = now;
    onProgress({ chars: content.length, thinking: !content.length && reasoning.length > 0 });
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity();
    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // potongan JSON belum utuh / bukan JSON — abaikan
      }

      if (json.error) {
        const error = new Error(json.error.message || 'Stream dihentikan provider');
        error.status = json.error.code;
        throw error;
      }

      const delta = json.choices?.[0]?.delta ?? {};
      if (typeof delta.content === 'string') {
        content += delta.content;
      } else if (Array.isArray(delta.content)) {
        content += delta.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
      }
      const thought = delta.reasoning_content ?? delta.reasoning;
      if (typeof thought === 'string') reasoning += thought;

      report();
    }
  }

  report(true);

  const text = content || reasoning;
  if (!text) throw new Error('AI mengembalikan konten kosong');
  return text;
}

/**
 * Ambil konten teks dari berbagai bentuk respons yang dipakai model berbeda.
 * - string biasa
 * - array of content parts (OpenAI vision/part format)
 * - `reasoning_content` (model reasoning/agentic, cth. Laguna) saat `content` kosong
 */
function extractContent(data) {
  const msgObj = data.choices?.[0]?.message || data.choices?.[0]?.text || {};
  let content = msgObj.content ?? data.output_text;

  if (!content && typeof msgObj.reasoning_content === 'string' && msgObj.reasoning_content.trim()) {
    content = msgObj.reasoning_content;
  }
  if (Array.isArray(content)) {
    content = content
      .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .join('');
  }
  if (!content) {
    console.error('[ai] Respons tanpa content, dump:', data);
    throw new Error('AI mengembalikan konten kosong');
  }
  return String(content);
}

/**
 * Daftar model yang akan dicoba berurutan (utama → fallback).
 * Poolside hanya punya satu model; Puter fallback ke tier hemat internal.
 * Tidak ada fallback lintas provider (sama seperti desain awal).
 * @returns {string[]}
 */
export function candidateModels() {
  const s = store.state.settings;
  if (currentProvider() === 'poolside') {
    return [s.poolsideModel || 'poolside/laguna-s-2.1'];
  }
  if (currentProvider() === 'puter') {
    const models = [];
    if (s.puterModel) models.push(s.puterModel);
    if (PUTER_DEFAULT_MODEL && PUTER_DEFAULT_MODEL !== s.puterModel) models.push(PUTER_DEFAULT_MODEL);
    return models.length ? models : [PUTER_DEFAULT_MODEL];
  }
  const models = [];
  if (s.model) models.push(s.model);
  const fallback = s.fallbackModel || 'openrouter/free';
  if (fallback && fallback !== s.model) models.push(fallback);
  return models.length ? models : ['openrouter/free'];
}

/** Nama model yang enak dibaca untuk ditampilkan. */
export function prettyModelName(model) {
  return String(model || '')
    .split('/')
    .pop()
    .replace(/:free$/, '');
}
