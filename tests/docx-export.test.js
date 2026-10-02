/**
 * Export DOCX: teks tidak boleh hilang.
 *
 * Regresi nyata: file hasil ekspor berisi tabel dan paragraf KOSONG karena
 * kode membangun ulang TextRun dengan membaca `run.options.text`, padahal
 * TextRun di docx 8.x tidak punya properti itu.
 *
 * Library docx palsu di bawah ini meniru hal tersebut: opsi konstruktor disimpan
 * di WeakMap, TIDAK terbuka sebagai properti publik. Kode yang membaca
 * `run.options` akan mendapat `undefined` dan tes gagal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { buildBlocks } from '../src/export/docx.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

// ---------------------------------------------------------------------------
// Library palsu (opsi tersembunyi, seperti docx asli)
// ---------------------------------------------------------------------------

const internal = new WeakMap();
const optionsOf = (obj) => internal.get(obj)?.options ?? {};
const kindOf = (obj) => internal.get(obj)?.kind;

const make = (kind) =>
  class {
    constructor(options = {}) {
      internal.set(this, { kind, options });
    }
  };

const Paragraph = make('Paragraph');
const TextRun = make('TextRun');
const Table = make('Table');
const TableRow = make('TableRow');
const TableCell = make('TableCell');
const PageBreak = make('PageBreak');

const lib = {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  PageBreak,
  HeadingLevel: { HEADING_2: 'h2' },
  AlignmentType: { CENTER: 'center', JUSTIFIED: 'both', START: 'start' },
  BorderStyle: { SINGLE: 'single', NONE: 'none' },
  WidthType: { DXA: 'dxa', PERCENTAGE: 'pct' },
  convertInchesToTwip: (n) => Math.round(n * 1440),
};

// ---------------------------------------------------------------------------
// Penelusur hasil
// ---------------------------------------------------------------------------

/** Semua TextRun (urutan dokumen), termasuk di dalam tabel bersarang. */
function allRuns(nodes) {
  const runs = [];
  const visit = (node) => {
    switch (kindOf(node)) {
      case 'TextRun':
        runs.push(node);
        break;
      case 'Paragraph':
        optionsOf(node).children?.forEach(visit);
        break;
      case 'Table':
        optionsOf(node).rows?.forEach(visit);
        break;
      case 'TableRow':
      case 'TableCell':
        optionsOf(node).children?.forEach(visit);
        break;
      default:
        break;
    }
  };
  nodes.forEach(visit);
  return runs;
}

const textOf = (nodes) =>
  allRuns(nodes)
    .map((r) => optionsOf(r).text ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Semua Table (termasuk bersarang), dengan kedalamannya. */
function allTables(nodes, depth = 0, found = []) {
  for (const node of nodes) {
    if (kindOf(node) === 'Table') {
      found.push({ table: node, depth });
      for (const row of optionsOf(node).rows ?? []) {
        for (const cell of optionsOf(row).children ?? []) {
          allTables(optionsOf(cell).children ?? [], depth + 1, found);
        }
      }
    }
  }
  return found;
}

const words = (s) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
const visibleText = (html) => {
  const holder = dom.window.document.createElement('div');
  holder.innerHTML = html.replace(
    /<\/(td|th|div|li|p|tr|h\d|ol|ul|table|span)>|<br\s*\/?>/gi,
    ' $& '
  );
  holder.querySelectorAll('img').forEach((img) => img.replaceWith(` ${img.alt} `));
  return holder.textContent;
};

// ---------------------------------------------------------------------------
// Tes
// ---------------------------------------------------------------------------

test('teks paragraf, judul, dan sel tabel tidak hilang', () => {
  const html = `
    <div class="doc-title">RENCANA PEMBELAJARAN</div>
    <div class="section-header">A. Identitas</div>
    <table><tr><td><strong>Mata Pelajaran</strong></td><td>Matematika</td></tr></table>
    <p>Paragraf biasa.</p>`;
  const text = textOf(buildBlocks(html, lib));
  for (const expected of [
    'RENCANA PEMBELAJARAN',
    'A. Identitas',
    'Mata Pelajaran',
    'Matematika',
    'Paragraf biasa.',
  ]) {
    assert.ok(text.includes(expected), `hilang: "${expected}" — hasil: ${text}`);
  }
});

test('gaya dari elemen pembungkus (strong/em/u/sup/sub) diwariskan ke teks di dalamnya', () => {
  const blocks = buildBlocks(
    '<table><tr><td><strong>Tebal</strong> biasa <em>miring</em> <u>garis</u> x<sup>2</sup> H<sub>zz</sub>O</td></tr></table>',
    lib
  );
  const byText = (t) => allRuns(blocks).find((r) => optionsOf(r).text.includes(t));
  assert.equal(optionsOf(byText('Tebal')).bold, true, 'isi <strong> harus tebal');
  assert.equal(optionsOf(byText('biasa')).bold, false);
  assert.equal(optionsOf(byText('miring')).italics, true);
  assert.ok(optionsOf(byText('garis')).underline, 'isi <u> harus bergaris bawah');
  assert.equal(optionsOf(byText('2')).superScript, true);
  assert.equal(optionsOf(byText('zz')).subScript, true);
});

test('judul yang juga pemisah halaman tetap memuat teksnya', () => {
  const html = '<div class="section-header page-break">LAMPIRAN: LEMBAR KERJA PESERTA DIDIK</div>';
  const blocks = buildBlocks(html, lib);
  assert.ok(textOf(blocks).includes('LEMBAR KERJA PESERTA DIDIK'));
  const hasPageBreak = blocks.some((b) =>
    (optionsOf(b).children ?? []).some((c) => kindOf(c) === 'PageBreak')
  );
  assert.ok(hasPageBreak, 'harus ada pemisah halaman');
});

test('tabel bersarang: baris tabel dalam tidak dihitung sebagai baris tabel luar', () => {
  const html = `<table><tr><td>Aktivitas</td><td>
      Perhatikan tabel:
      <div><table><thead><tr><th>n</th><th>Un</th></tr></thead>
        <tbody><tr><td>1</td><td>3</td></tr><tr><td>2</td><td>5</td></tr></tbody></table></div>
      Tentukan pola.
    </td></tr></table>`;
  const blocks = buildBlocks(html, lib);
  const tables = allTables(blocks);
  assert.equal(tables.length, 2, 'harus ada satu tabel luar dan satu tabel dalam');

  const outer = tables.find((t) => t.depth === 0).table;
  const inner = tables.find((t) => t.depth === 1).table;
  assert.equal(optionsOf(outer).rows.length, 1, 'tabel luar hanya punya 1 baris');
  assert.equal(optionsOf(inner).rows.length, 3, 'tabel dalam: 1 judul + 2 data');

  const text = textOf(blocks);
  for (const expected of ['Perhatikan tabel:', 'Un', 'Tentukan pola.']) {
    assert.ok(text.includes(expected), `hilang: ${expected}`);
  }
  // Isi tabel dalam tidak boleh muncul dua kali (tidak ikut dihitung sebagai sel tabel luar).
  assert.equal(allRuns(blocks).filter((r) => optionsOf(r).text === 'Un').length, 1);
});

test('sel yang berakhir dengan tabel bersarang tetap diakhiri paragraf (syarat Word)', () => {
  const blocks = buildBlocks(
    '<table><tr><td><table><tr><td>dalam</td></tr></table></td></tr></table>',
    lib
  );
  const outer = allTables(blocks)[0].table;
  const cell = optionsOf(optionsOf(outer).rows[0]).children[0];
  const children = optionsOf(cell).children;
  assert.equal(kindOf(children[children.length - 1]), 'Paragraph');
});

test('daftar di dalam sel dan daftar bersarang tetap utuh; tiap <ol> mulai dari 1', () => {
  const html = `
    <table><tr><td><ol><li>Langkah satu<ul><li>sub a</li></ul></li><li>Langkah dua</li></ol></td></tr></table>
    <ol><li>Butir satu</li><li>Butir dua</li></ol>`;
  const blocks = buildBlocks(html, lib);
  const text = textOf(blocks);
  for (const expected of ['Langkah satu', 'sub a', 'Langkah dua', 'Butir satu', 'Butir dua']) {
    assert.ok(text.includes(expected), `hilang: ${expected}`);
  }

  const numbered = [];
  const collect = (nodes) => {
    for (const n of nodes) {
      if (kindOf(n) === 'Paragraph' && optionsOf(n).numbering?.reference === 'rpp-list')
        numbered.push(optionsOf(n).numbering);
      if (kindOf(n) === 'Table') {
        for (const row of optionsOf(n).rows)
          for (const cell of optionsOf(row).children) collect(optionsOf(cell).children);
      }
    }
  };
  collect(blocks);
  const instances = new Set(numbered.map((n) => n.instance));
  assert.equal(instances.size, 2, 'dua <ol> terpisah harus memakai dua instance penomoran berbeda');
});

test('<br>, rumus (img alt), dan teks inline bercampur tetap menjadi satu paragraf', () => {
  const html =
    '<table><tr><td>Baris satu<br>Baris dua <img alt="(a+b)/2" src="x"> selesai</td></tr></table>';
  const blocks = buildBlocks(html, lib);
  assert.equal(textOf(blocks), 'Baris satu Baris dua (a+b)/2 selesai');
  const cell = optionsOf(optionsOf(allTables(blocks)[0].table).rows[0]).children[0];
  const paragraphs = optionsOf(cell).children.filter((c) => kindOf(c) === 'Paragraph');
  assert.equal(
    paragraphs.length,
    1,
    'inline yang berurutan harus satu paragraf, bukan satu paragraf per elemen'
  );
});

test('tidak ada kata yang terbuang pada dokumen campuran', () => {
  const html = `
    <div class="doc-title">UJI</div>
    <div class="section-header">B. Bagian</div>
    <table>
      <tr><td><strong>Aktivitas</strong></td><td><ol><li><strong>Langkah 1:</strong> Amati gambar<br>lalu catat hasilnya</li></ol></td></tr>
      <tr><td><strong>Rumus</strong></td><td>Luas <span class="math-inline">L = π r²</span> dan <img alt="(a+b)/2" src="x"></td></tr>
    </table>
    <div class="soal-nomor"><strong>1.</strong> <span>Berapakah hasilnya?</span></div>
    <div class="soal-opsi">A. dua</div><div class="soal-opsi kunci-jawaban">Kunci: A</div>`;
  const have = new Set(words(textOf(buildBlocks(html, lib))));
  const missing = [...new Set(words(visibleText(html)))].filter((w) => !have.has(w));
  assert.deepEqual(missing, [], `kata hilang: ${missing.join(', ')}`);
});

test('dokumen kosong menghasilkan satu paragraf, bukan error', () => {
  const blocks = buildBlocks('', lib);
  assert.equal(blocks.length, 1);
});
