import test from 'node:test';
import assert from 'node:assert/strict';

import { richText, table } from '../src/render/html-helpers.js';

test('tabel Markdown pada soal tetap menjadi tabel dan merender rumus di sel', () => {
  const out = richText(String.raw`| Bentuk | Nilai |
| --- | --- |
| Pecahan | \frac{1}{2} |`);

  assert.match(out, /<table>/);
  assert.match(out, /<th>Bentuk<\/th>/);
  assert.match(out, /<img /, 'rumus pada sel tabel harus dirender');
});

test('helper tabel dokumen merender rumus di sel tanpa mengubah teks biasa', () => {
  const out = table(['Keterangan', 'Nilai'], [['Hasil percobaan', String.raw`\frac{6}{x-2}`]]);

  assert.match(out, /Hasil percobaan/);
  assert.match(out, /<img /, 'rumus pada tabel lampiran harus dirender');
});

test('tabel Markdown TANPA baris pemisah tetap jadi tabel (kasus tahap Memahami)', () => {
  const out = richText(
    ['Perhatikan tabel berikut:', '| Organel | Sel Hewan | Sel Tumbuhan |', '| Dinding sel | Tidak ada | Ada |', '| Vakuola | Kecil | Besar |'].join('\n')
  );
  assert.match(out, /<table>/, 'tabel tanpa pemisah harus dirender');
  assert.match(out, /<th>Organel<\/th>/, 'baris pertama = header');
  assert.match(out, /Vakuola/, 'baris data harus utuh');
  assert.match(out, /Perhatikan tabel berikut:/, 'teks pengantar tidak hilang');
});

test('satu-dua baris pipa acak BUKAN tabel (anti false-positive)', () => {
  const single = 'Guru menjelaskan a | b dengan lantang.';
  assert.doesNotMatch(richText(single), /<table>/, 'satu baris pipa jangan jadi tabel');
  const two = 'Catat a | b hari ini.\nSiswa menulis c | d besok.';
  assert.doesNotMatch(richText(two), /<table>/, 'dua baris tak berpola jangan jadi tabel');
});
