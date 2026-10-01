/**
 * Jaring pengaman tidak boleh merusak teks biasa yang kebetulan memuat `_` atau `^`.
 * Regresi nyata: nama berkas dan URL berubah menjadi indeks bawah Unicode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { wrapInlineBareMath } from '../src/services/latex-repair.js';
import { normalizeMathText } from '../src/services/latex.js';

test('nama berkas dan URL tidak diubah menjadi indeks bawah', () => {
  for (const s of [
    'Kunjungi https://contoh.id/materi_2 untuk video.',
    'Nama berkas: laporan_praktikum.docx dan data_1.xlsx',
    'Simpan sebagai img_1.png lalu kirim.',
    'Gunakan variabel nama_siswa_2 pada tabel.',
  ]) {
    assert.equal(wrapInlineBareMath(s), s, `harus utuh: ${s}`);
    assert.equal(normalizeMathText(s), s, `harus utuh: ${s}`);
  }
});

test('indeks pendek yang berdiri sendiri tetap dikenali', () => {
  assert.equal(wrapInlineBareMath('x_1 + x_2'), String.raw`\(x_1\) + \(x_2\)`);
  assert.equal(wrapInlineBareMath('Air H_2O'), String.raw`Air \(H_2\)O`);
  assert.equal(wrapInlineBareMath('Gas CO_2 dilepas'), String.raw`Gas \(CO_2\) dilepas`);
  assert.equal(wrapInlineBareMath('v_{0} awal'), String.raw`\(v_{0}\) awal`);
});

test('pangkat pada angka negatif dan dalam kurung tetap dikenali', () => {
  assert.equal(wrapInlineBareMath('Hasil -x^2 + 3'), String.raw`Hasil -\(x^2\) + 3`);
  assert.equal(wrapInlineBareMath('(x^2) dan 2^n'), String.raw`(\(x^2\)) dan \(2^n\)`);
});
