/**
 * Panel pengaturan: sinkronkan DOM <-> state, ubah visibilitas per provider.
 */

import { $, $$, setText } from '../core/dom.js';
import { store } from '../core/store.js';
import {
  activeApiKey,
  adoptTestedKey,
  loadSettings,
  persistSettings,
  testConnection,
} from '../services/settings.js';
import { showToast } from './toast.js';
import { DEFAULT_WORKER_URL, PUTER_DEFAULT_MODEL } from '../config.js';

const FIELD_IDS = {
  provider: 'set-provider',
  openRouterKey: 'api-key',
  poolsideKey: 'poolside-key',
  poolsideModel: 'poolside-model',
  corsProxy: 'poolside-proxy',
  puterModel: 'puter-model',
  model: 'model-select',
  customModel: 'model-custom',
  fallbackModel: 'fallback-model',
};

const val = (id) => $(`#${id}`)?.value?.trim() ?? '';

/** Terapkan state ke elemen form. */
export function applySettingsToUI() {
  const s = store.state.settings;
  if (!s) return;
  $('#set-provider').value = s.provider || 'puter';
  $('#api-key').value = s.openRouterKey || s.apiKey || '';
  $('#poolside-key').value = s.poolsideKey || '';
  $('#poolside-model').value = s.poolsideModel || 'poolside/laguna-s-2.1';
  $('#poolside-proxy').value = s.corsProxy || '';
  const puterModelEl = $('#puter-model');
  if (puterModelEl) puterModelEl.value = s.puterModel || PUTER_DEFAULT_MODEL;
  $('#model-select').value = s.model === s.customModel ? 'custom' : s.model;
  $('#model-custom').value = s.customModel || '';
  $('#fallback-model').value = s.fallbackModel || 'openrouter/free';
  toggleCustomModelField();
  onProviderChange(false);
  refreshPuterStatus();
}

/** Aktifkan field "Kustom Model ID" hanya saat opsi Kustom dipilih. */
export function toggleCustomModelField() {
  const custom = $('#model-custom');
  if (!custom) return;
  custom.disabled = $('#model-select')?.value !== 'custom';
}

/**
 * Tampilkan grup field sesuai provider aktif.
 * @param {boolean} [save] simpan perubahan ke storage
 */
export function onProviderChange(save = true) {
  const provider = $('#set-provider')?.value || 'puter';
  const isPoolside = provider === 'poolside';
  const isPuter = provider === 'puter';

  $$('.grp-openrouter').forEach((el) => {
    el.style.display = isPoolside || isPuter ? 'none' : '';
  });
  $$('.grp-poolside').forEach((el) => {
    el.style.display = isPoolside ? '' : 'none';
  });
  $$('.grp-puter').forEach((el) => {
    el.style.display = isPuter ? '' : 'none';
  });

  const hint = $('#provider-hint');
  if (hint) {
    setText(
      hint,
      isPuter
        ? 'Login Puter — tiap guru memakai jatah akunnya sendiri, tanpa API key.'
        : isPoolside
          ? DEFAULT_WORKER_URL
            ? '✓ Terhubung via worker bawaan — cukup isi API key di bawah.'
            : 'Poolside tidak mengizinkan panggilan langsung dari browser — buka Pengaturan lanjutan di bawah.'
          : 'Gunakan API key OpenRouter untuk model-model gratis.'
    );
  }
  setText($('#api-status'), '');
  $('#api-status').innerHTML = '';

  if (save) {
    store.state.settings.provider = provider;
    persistSettings();
  }
  if (isPuter) refreshPuterStatus();
}

/**
 * Tampilkan status login Puter + sisa kuota bulanan di panel pengaturan.
 * Aman dipanggil kapan pun: bila CDN Puter diblokir, tampilkan pesan jelas.
 */
export async function refreshPuterStatus() {
  const statusEl = $('#puter-status');
  const quotaEl = $('#puter-quota');
  const btn = $('#puter-auth-btn');
  if (!statusEl || !btn) return;
  const puter = globalThis.puter;
  if (!puter?.auth) {
    setText(statusEl, 'Puter.js gagal dimuat (CDN diblokir?)');
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  try {
    if (await puter.auth.isSignedIn()) {
      const user = await puter.auth.getUser().catch(() => null);
      setText(statusEl, user?.username ? `Login sebagai ${user.username}` : 'Sudah login');
      btn.textContent = 'Logout';
      if (quotaEl) {
        puter.auth
          .getMonthlyUsage()
          .then((u) => {
            const used = u?.ai?.total ?? u?.total;
            setText(quotaEl, used != null ? `Pemakaian AI bulan ini: ${used}` : '');
          })
          .catch(() => setText(quotaEl, ''));
      }
    } else {
      setText(statusEl, 'Belum login');
      btn.textContent = 'Login Puter';
      if (quotaEl) setText(quotaEl, '');
    }
  } catch {
    setText(statusEl, 'Gagal mengecek status login');
  }
}

/** Toggle Login/Logout Puter dari panel pengaturan. */
export async function handlePuterAuth() {
  const puter = globalThis.puter;
  if (!puter?.auth) {
    showToast('Puter.js gagal dimuat (CDN diblokir?)', 'error');
    return;
  }
  try {
    if (await puter.auth.isSignedIn()) await puter.auth.signOut();
    else await puter.auth.signIn();
  } catch (e) {
    showToast(`Puter: ${e.message || e}`, 'error');
  }
  refreshPuterStatus();
}

/** Baca form ke state, lalu simpan. */
export function saveSettings() {
  const s = store.state.settings;
  const provider = val(FIELD_IDS.provider);
  const openRouterKey = val(FIELD_IDS.openRouterKey);
  const poolsideKey = val(FIELD_IDS.poolsideKey);
  const poolsideModel = val(FIELD_IDS.poolsideModel) || 'poolside/laguna-s-2.1';
  const corsProxy = val(FIELD_IDS.corsProxy);
  const modelSel = val(FIELD_IDS.model);
  const custom = val(FIELD_IDS.customModel);
  const fallback = val(FIELD_IDS.fallbackModel);

  s.provider = provider;
  // Simpan kedua key terpisah agar tidak saling menimpa (Puter tidak pakai key).
  if (openRouterKey) s.openRouterKey = openRouterKey;
  if (poolsideKey) s.poolsideKey = poolsideKey;
  s.apiKey = s.openRouterKey || '';
  s.poolsideModel = poolsideModel;
  s.puterModel = val(FIELD_IDS.puterModel) || PUTER_DEFAULT_MODEL;
  s.corsProxy = corsProxy;
  s.customModel = custom;
  s.fallbackModel = fallback;
  s.model =
    modelSel === 'custom'
      ? custom || s.model || 'nvidia/nemotron-3-super-120b-a12b:free'
      : modelSel;

  const ok = persistSettings();
  showToast(
    ok ? 'Pengaturan tersimpan!' : '⚠️ Pengaturan tidak tersimpan (localStorage penuh/terblokir)',
    ok ? 'success' : 'error'
  );
}

/** Tombol "🧪 Test API". */
export async function handleTestAPI(button) {
  const status = $('#api-status');
  button.disabled = true;
  setText(status, '⏳ Testing...');
  status.innerHTML = '⏳ Testing...';

  // Simpan dulu supaya test memakai nilai terbaru dari form.
  saveSettingsSilently();

  const result = await testConnection();
  status.innerHTML = result.message;
  if (result.ok) {
    adoptTestedKey();
    // Puter tidak pakai key — jangan sentuh key OpenRouter/Poolside.
    if (store.state.settings.provider !== 'puter') {
      const key = activeApiKey();
      if (store.state.settings.provider === 'poolside') store.state.settings.poolsideKey = key;
      else {
        store.state.settings.openRouterKey = key;
        store.state.settings.apiKey = key;
      }
      persistSettings();
    }
    if (store.state.settings.provider === 'puter') refreshPuterStatus();
  }
  button.disabled = false;
  return result;
}

/** Simpan tanpa toast (dipakai sebelum test). */
function saveSettingsSilently() {
  const s = store.state.settings;
  s.provider = val(FIELD_IDS.provider);
  const openRouterKey = val(FIELD_IDS.openRouterKey);
  const poolsideKey = val(FIELD_IDS.poolsideKey);
  if (openRouterKey) s.openRouterKey = openRouterKey;
  if (poolsideKey) s.poolsideKey = poolsideKey;
  s.apiKey = s.openRouterKey || '';
  s.poolsideModel = val(FIELD_IDS.poolsideModel) || 'poolside/laguna-s-2.1';
  s.puterModel = val(FIELD_IDS.puterModel) || PUTER_DEFAULT_MODEL;
  s.corsProxy = val(FIELD_IDS.corsProxy);
  s.customModel = val(FIELD_IDS.customModel);
  s.fallbackModel = val(FIELD_IDS.fallbackModel);
  const modelSel = val(FIELD_IDS.model);
  s.model =
    modelSel === 'custom'
      ? s.customModel || s.model || 'nvidia/nemotron-3-super-120b-a12b:free'
      : modelSel;
  persistSettings();
}

/** Pasang listener panel pengaturan. */
export function initSettingsPanel() {
  loadSettings();
  applySettingsToUI();

  $('#model-select')?.addEventListener('change', toggleCustomModelField);
  $('#set-provider')?.addEventListener('change', () => onProviderChange(true));
  $('#puter-auth-btn')?.addEventListener('click', handlePuterAuth);
}
