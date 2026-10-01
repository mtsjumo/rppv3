/**
 * Jaring pengaman render matematika + arahan prompt.
 *
 * Latar belakang: rumus "terkadang tidak terender" karena model (terutama yang
 * kecil) sesekali menulis LaTeX tanpa pembungkus (`\frac{1}{2}`, `x^2`),
 * memakai `\ce{}` yang tidak didukung CodeCogs, atau menulis backslash tunggal
 * di JSON. Tes ini mengunci perbaikannya.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mathToUnicode, normalizeMathText, renderCodeCogs } from '../src/services/latex.js';
import { chemToUnicode, wrapInlineBareMath } from '../src/services/latex-repair.js';
import { extractJSON, repairJsonEscapes } from '../src/services/json.js';
import { richText, renderSoalBlock, text } from '../src/render/html-helpers.js';
import { LATEX_RULE, NOTATION_RULES } from '../src/prompts/base.js';
import { buildMediaPrompt } from '../src/prompts/phase3.js';
import { buildModulAjarPrompt } from '../src/prompts/phase2.js';
import { buildSubPhasePrompt } from '../src/prompts/phase1.js';

const INPUT = {
  madrasah: 'MTs Uji',
  mapel: 'Matematika',
  materi: 'Pecahan',
  elemen: 'Bilangan',
  fase: 'D/VII/1',
  cp: 'CP uji',
  tp: 'TP uji',
};

const imgCount = (html) => (html.match(/<img /g) || []).length;

// ---------------------------------------------------------------------------
// Rumus yang lupa dibungkus
// ---------------------------------------------------------------------------

test('perintah struktural tanpa pembungkus dibungkus (hanya ekspresinya)', () => {
  const out = normalizeMathText(String.raw`Hitung \frac{3}{4} + \sqrt{16} sekarang.`);
  assert.equal(out, String.raw`Hitung \(\frac{3}{4}\) + \(\sqrt{16}\) sekarang.`);
  assert.equal(imgCount(text(String.raw`Hitung \frac{3}{4} sekarang.`)), 1);
});

test('pangkat dan indeks polos menjadi teks Unicode', () => {
  assert.match(text('Luas = x^2 + y^2'), /x²/);
  assert.match(text('Energi E = mc^2 joule'), /mc²/);
  assert.match(text('Massa 10^{-3} kg'), /10⁻³/);
  assert.match(text('Air adalah H_2O'), /H₂/);
  assert.equal(imgCount(text('x^2 + y^2')), 0, 'rumus ringan tidak perlu gambar');
});

test('simbol dan huruf Yunani polos ikut dirender', () => {
  const html = text(String.raw`Keliling = 2 \pi r dan 3 \times 4`);
  assert.match(html, /π/);
  assert.match(html, /×/);
  assert.doesNotMatch(html, /\\pi|\\times/);
});

test('jaring pengaman tidak menyentuh yang sudah berdelimiter, harga, atau prosa', () => {
  const already = String.raw`Nilai \(x^2\) dan \[\frac{1}{2}\] dan $y^2$ tetap.`;
  assert.equal(wrapInlineBareMath(already), already);

  const prose = 'Sel hewan tidak memiliki dinding sel dan kloroplas.';
  assert.equal(wrapInlineBareMath(prose), prose);
  assert.equal(normalizeMathText(prose), prose);

  const price = 'Harga Rp$5 dan Rp$7 per buah.';
  assert.equal(wrapInlineBareMath(price), price);
});

test('kurung tak seimbang dibiarkan, tidak membuang teks', () => {
  const broken = String.raw`Rumus \frac{1}{2 belum ditutup`;
  assert.equal(wrapInlineBareMath(broken), broken);
});

test('baris tabel Markdown tetap utuh, sel diproses satu per satu', () => {
  const md = 'Data:\n| x | f(x) |\n|---|---|\n| 1 | \\frac{1}{2} |\n| 2 | x^2 |';
  const html = richText(md);
  assert.match(html, /<table>/);
  assert.equal(imgCount(html), 1, 'pecahan di sel menjadi gambar');
  assert.match(html, /x²/, 'pangkat di sel menjadi teks');
});

// ---------------------------------------------------------------------------
// Kimia
// ---------------------------------------------------------------------------

test('\\ce{} ditulis sebagai teks kimia, bukan gambar yang gagal', () => {
  assert.equal(chemToUnicode('2H2 + O2 -> 2H2O'), '2H₂ + O₂ → 2H₂O');
  assert.equal(chemToUnicode('SO4^2-'), 'SO₄²⁻');
  assert.equal(chemToUnicode('Fe^3+'), 'Fe³⁺');
  assert.equal(mathToUnicode(String.raw`\ce{CO2 + H2O -> H2CO3}`), 'CO₂ + H₂O → H₂CO₃');

  const html = text(String.raw`Reaksi \(\ce{2H2 + O2 -> 2H2O}\)`);
  assert.equal(imgCount(html), 0);
  assert.match(html, /2H₂ \+ O₂ → 2H₂O/);
});

test('reaksi kimia bergaya LaTeX biasa menjadi teks', () => {
  const html = text(String.raw`\(2H_{2} + O_{2} \rightarrow 2H_{2}O\)`);
  assert.equal(imgCount(html), 0);
  assert.match(html, /2H₂ \+ O₂ → 2H₂O/);
});

// ---------------------------------------------------------------------------
// Opsi soal & payload
// ---------------------------------------------------------------------------

test('opsi berawalan variabel ("a = 3") tidak terpecah menjadi label + rumus', () => {
  assert.equal(normalizeMathText('a = 3'), String.raw`\(a = 3\)`);
  // Label opsi eksplisit tetap dikenali.
  assert.equal(normalizeMathText(String.raw`A. x \le 3`), String.raw`A. \(x \le 3\)`);

  const html = renderSoalBlock({
    nomor: 1,
    pertanyaan: 'Nilai a?',
    opsi: ['A. a = 3', 'B. b = 4'],
    kunci: 'A',
  });
  assert.doesNotMatch(html, /a <span/, 'variabel "a" tidak boleh terlepas dari rumusnya');
});

test('rumus display tidak memakai \\inline, rumus inline memakainya', () => {
  const payloadOf = (html) => decodeURIComponent(html.match(/src="([^"]+)"/)[1]);
  assert.doesNotMatch(payloadOf(renderCodeCogs(String.raw`\[\frac{1}{2}\]`)), /\\inline/);
  assert.match(payloadOf(renderCodeCogs(String.raw`\(\frac{1}{2}\)`)), /\\inline/);
});

test('fallback gambar memakai teks terbaca, bukan LaTeX mentah', () => {
  const html = renderCodeCogs(String.raw`\(\frac{a+b}{2}\)`);
  const alt = html.match(/alt="([^"]*)"/)[1];
  assert.equal(alt, '(a+b)/2');
});

// ---------------------------------------------------------------------------
// JSON dengan backslash tunggal dari model
// ---------------------------------------------------------------------------

test('JSON dengan LaTeX berbackslash tunggal di-parse tanpa merusak rumus', () => {
  const raw = String.raw`{"a":"Hitung \(\frac{1}{2}\) dan \(x \neq 2\) lalu \times \theta \beta \right \underline{x}"}`;
  const parsed = extractJSON(raw);
  assert.ok(parsed, 'harus berhasil di-parse');
  assert.equal(
    parsed.a,
    String.raw`Hitung \(\frac{1}{2}\) dan \(x \neq 2\) lalu \times \theta \beta \right \underline{x}`
  );
});

test('JSON yang sudah benar tidak diubah, campuran benar+salah tetap aman', () => {
  const good = String.raw`{"a":"\\(x^2\\) dan \\frac{1}{2}","b":"baris1\nbaris2\tTab"}`;
  assert.equal(repairJsonEscapes(good), good);
  assert.equal(extractJSON(good).a, String.raw`\(x^2\) dan \frac{1}{2}`);
  assert.equal(extractJSON(good).b, 'baris1\nbaris2\tTab');

  const mixed = String.raw`{"a":"\\(x^2\\) dan \(\frac{1}{2}\)"}`;
  assert.equal(extractJSON(mixed).a, String.raw`\(x^2\) dan \(\frac{1}{2}\)`);
});

test('baris baru JSON sah tidak disalahartikan sebagai perintah LaTeX', () => {
  const parsed = extractJSON('{"a":"Langkah 1\\nnotasi dipakai\\nneraca seimbang"}');
  assert.equal(parsed.a, 'Langkah 1\nnotasi dipakai\nneraca seimbang');
});

// ---------------------------------------------------------------------------
// Arahan ke AI (prompt)
// ---------------------------------------------------------------------------

test('aturan notasi: satu aturan konsisten — bungkus semua rumus, jangan minta AI memilah', () => {
  for (const rule of [NOTATION_RULES, LATEX_RULE]) {
    assert.match(rule, /\\\(/, 'harus menyebut pembungkus \\(...\\)');
    assert.match(rule, /\\\[/, 'harus menyebut pembungkus \\[...\\]');
    assert.match(rule, /SEMUA|WAJIB/, 'harus mewajibkan pembungkus');
    assert.doesNotMatch(
      rule,
      /BUKAN LaTeX|teks biasa \(Unicode\)/i,
      'tidak boleh menyuruh AI memilah sendiri'
    );
  }
  assert.match(NOTATION_RULES, /\\\\frac\{3\}/, 'harus memberi contoh JSON dengan backslash ganda');
});

test('semua phase memuat aturan notasi di system prompt', () => {
  const p1 = buildSubPhasePrompt('c', INPUT, {});
  const p2 = buildModulAjarPrompt(INPUT, {});
  const p3 = buildMediaPrompt(INPUT, {});
  for (const [name, prompts] of [
    ['evaluasi', p1],
    ['modul ajar', p2],
    ['media', p3],
  ]) {
    assert.ok(
      prompts.systemPrompt.includes(NOTATION_RULES),
      `system prompt ${name} harus memuat NOTATION_RULES`
    );
  }
});
