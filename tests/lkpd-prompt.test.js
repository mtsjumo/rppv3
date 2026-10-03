/**
 * Prompt desain LKPD siap-copy: terisi data LKPD saat itu, tanpa kunci.
 *
 * Jaminan utama: prompt yang disalin guru ke AI chat eksternal TIDAK BOLEH
 * memuat jawaban — AI tidak bisa membocorkan apa yang tidak diketahuinya.
 * Merangkai prompt murni lokal: NOL token, NOL request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as F from '../src/prompts/fewshot.js';
import { buildLKPDPrompt } from '../src/export/lkpd-prompt.js';
import { copyText } from '../src/core/dom.js';

const INPUT = {
  madrasah: 'MTs Uji',
  mapel: 'Matematika',
  materi: 'Pola Bilangan',
  fase: 'D/VIII/1',
  alkok: '2 x 40 menit',
};

const parse = (s) => JSON.parse(s);
const pick = (obj, key) => obj[key] ?? obj;

function sampleData() {
  const lkpd = pick(parse(F.FEWSHOT_LKPD), 'lkpd');
  return { rpp: {}, lampiran: { lkpd } };
}

const strip = (s) => String(s).replace(/\s+/g, ' ');

test('prompt memuat data LKPD yang dibutuhkan desainer', () => {
  const data = sampleData();
  data.lampiran.lkpd.spark = 'Spark uji coba';
  const prompt = buildLKPDPrompt(data, INPUT);
  const materiAktual = data.lampiran.lkpd.identitas?.materiPokok || INPUT.materi;
  assert.ok(prompt.includes(String(materiAktual).slice(0, 15)), 'materi hilang');
  assert.ok(prompt.includes('Spark uji coba'), 'spark hilang');
  for (const t of data.lampiran.lkpd.tujuan.slice(0, 2)) {
    assert.ok(prompt.includes(String(t).slice(0, 20)), `tujuan hilang: ${t}`);
  }
  const act = data.lampiran.lkpd.aktivitas[0];
  assert.ok(prompt.includes(String(act.nama).slice(0, 15)), 'nama aktivitas hilang');
  assert.ok(prompt.includes('F4'), 'kertas F4 harus disebut');
  assert.ok(prompt.includes('TIDAK BOLEH ada kunci jawaban'), 'batas anti-bocor hilang');
});

test('prompt TIDAK memuat kunci/jawaban apa pun', () => {
  const data = sampleData();
  const prompt = buildLKPDPrompt(data, INPUT);
  const plain = strip(prompt);
  for (const q of data.lampiran.lkpd.pertanyaan || []) {
    if (q?.jawaban) {
      assert.ok(
        !plain.includes(String(q.jawaban).slice(0, 30)),
        `jawaban LKPD ikut tersalin: ${q.jawaban}`
      );
    }
  }
  for (const row of data.lampiran.lkpd.tabelPerbandingan?.data || []) {
    const cells = Array.isArray(row) ? row : Object.values(row);
    for (const c of cells.slice(1)) {
      const v = String(c ?? '').trim();
      if (v.length > 12) assert.ok(!plain.includes(v), `isi sel tabel ikut tersalin: ${v}`);
    }
  }
  assert.ok(!/kunci\s*:\s*\S/i.test(plain.replace(/tanpa kunci|kunci jawaban/gi, '')), 'kunci bocor');
});

test('tanpa LKPD: hasil kosong', () => {
  assert.equal(buildLKPDPrompt({}, INPUT), '');
  assert.equal(buildLKPDPrompt({ lampiran: {} }, INPUT), '');
});

test('copyText tanpa DOM mengembalikan false (tidak melempar)', async () => {
  assert.equal(await copyText('halo'), false);
});
