/**
 * Lampiran siswa & kunci jawaban.
 *
 * Risiko terbesar fitur ini: kunci jawaban atau jawaban LKPD ikut tercetak di
 * lembar yang dibagikan ke siswa. Tes ini mengunci agar hal itu tidak terjadi,
 * sambil memastikan isi soal dan tugas tetap utuh.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as F from '../src/prompts/fewshot.js';
import { buildAnswerKeyHTML, buildStudentSheetsHTML } from '../src/render/student-renderer.js';
import { buildExportFilename } from '../src/export/filename.js';

// store.js membaca localStorage secara lazy; sediakan agar modul bisa dimuat di Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

const INPUT = {
  madrasah: 'MTs Uji',
  mapel: 'Matematika',
  materi: 'Pola Bilangan',
  fase: 'D/VIII/1',
  guru: 'Andi Ariyanto, S.Pd',
  alkok: '2 x 40 menit',
};

const parse = (s) => JSON.parse(s);
const pick = (obj, key) => obj[key] ?? obj;

/** Data Phase 1 nyata dari contoh few-shot. */
function sampleData() {
  const lkpd = pick(parse(F.FEWSHOT_LKPD), 'lkpd');
  const evaluasi = pick(parse(F.FEWSHOT_EVALUASI), 'evaluasi');
  const diagnostik = pick(parse(F.FEWSHOT_DIAGNOSTIK), 'diagnostik');
  return { rpp: {}, lampiran: { lkpd, evaluasi, diagnostik } };
}

const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// Lembar siswa
// ---------------------------------------------------------------------------

test('lembar siswa memuat tiga lembar, masing-masing dengan judul dan kop nama', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT);
  for (const title of ['TES DIAGNOSTIK AWAL', 'LEMBAR KERJA PESERTA DIDIK (LKPD)', 'SOAL EVALUASI']) {
    assert.ok(html.includes(title), `judul hilang: ${title}`);
  }
  for (const label of ['Nama', 'Kelas', 'No. Absen', 'Tanggal']) {
    assert.ok(html.includes(`<strong>${label}</strong>`), `kop nama kurang: ${label}`);
  }
});

test('lembar pertama tanpa page-break; dua lembar berikutnya mulai di halaman baru', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT);
  assert.equal((html.match(/class="doc-title page-break"/g) || []).length, 2);
  assert.ok(html.startsWith('<div class="doc-title">'), 'lembar pertama tidak boleh diawali page-break');
});

test('TIDAK ADA kunci jawaban, jawaban LKPD, atau label level kognitif di lembar siswa', () => {
  const data = sampleData();
  const html = buildStudentSheetsHTML(data, INPUT);
  const plain = stripTags(html);

  assert.doesNotMatch(html, /kunci-jawaban/, 'class kunci jawaban bocor');
  assert.doesNotMatch(plain, /Kunci\s*:/i, 'teks "Kunci:" bocor');
  assert.doesNotMatch(html, /cognitive-badge/, 'label level kognitif bocor');
  assert.doesNotMatch(plain, /Jawaban\s*:/, 'teks "Jawaban:" dari LKPD bocor');
  assert.doesNotMatch(plain, /Penskoran/i, 'penskoran (khusus guru) bocor');

  for (const q of data.lampiran.lkpd.pertanyaan || []) {
    if (q?.jawaban) assert.ok(!plain.includes(String(q.jawaban).slice(0, 30)), `jawaban LKPD bocor: ${q.jawaban}`);
  }
});

test('soal dan pilihan jawaban tetap utuh (tanpa kunci)', () => {
  const data = sampleData();
  const plain = stripTags(buildStudentSheetsHTML(data, INPUT));
  const soal = data.lampiran.evaluasi.soal[0];
  assert.ok(plain.includes(String(soal.pertanyaan).slice(0, 25)), 'teks soal hilang');
  for (const opsi of soal.opsi) {
    const body = String(opsi).replace(/^\s*[A-Ea-e][.)]\s*/, '').slice(0, 15);
    assert.ok(plain.includes(body), `pilihan hilang: ${opsi}`);
  }
});

test('lembar jawaban dibuat untuk soal pilihan ganda', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT);
  assert.ok(html.includes('Lembar Jawaban'));
  assert.ok(html.includes('<strong>Jawaban</strong>'));
});

test('tabel perbandingan LKPD: nomor dan aspek tetap, kolom lain dikosongkan', () => {
  const data = sampleData();
  const tabel = data.lampiran.lkpd.tabelPerbandingan;
  const row = tabel.data[0];
  const cells = Array.isArray(row) ? row : Object.values(row);
  const [, aspek, kategoriA] = cells.map(String);

  const student = stripTags(buildStudentSheetsHTML(data, INPUT));
  assert.ok(student.includes(aspek), `aspek harus tetap tampil: ${aspek}`);
  assert.ok(!student.includes(kategoriA), `isi kolom lain harus dikosongkan: ${kategoriA}`);

  const key = stripTags(buildAnswerKeyHTML(data, INPUT));
  assert.ok(key.includes(aspek) && key.includes(kategoriA), 'kunci guru memuat tabel lengkap');
});

test('tabel tanpa kolom aspek: hanya kolom penanda yang dipertahankan', () => {
  const data = {
    lampiran: {
      lkpd: {
        tabelPerbandingan: {
          kolom: ['No', 'Sel Hewan', 'Sel Tumbuhan'],
          data: [
            ['1', 'Tidak ada dinding sel', 'Ada dinding sel'],
            ['2', 'Bentuk tidak tetap', 'Bentuk tetap'],
          ],
        },
      },
    },
  };
  const plain = stripTags(buildStudentSheetsHTML(data, INPUT));
  assert.ok(plain.includes('Sel Hewan'), 'header kolom harus tetap (siswa tahu yang diisi)');
  assert.ok(plain.includes('1'), 'nomor baris harus tetap');
  assert.ok(!plain.includes('dinding sel'), 'jawaban tabel bocor ke lembar siswa!');
  const key = stripTags(buildAnswerKeyHTML(data, INPUT));
  assert.ok(key.includes('dinding sel'), 'kunci guru memuat tabel lengkap');
});

test('tabel tanpa penomoran/aspek sama sekali: kolom pertama dipertahankan', () => {
  const data = {
    lampiran: {
      lkpd: {
        tabelPerbandingan: {
          kolom: ['Ciri', 'A', 'B'],
          data: [['Warna', 'Merah', 'Biru']],
        },
      },
    },
  };
  const plain = stripTags(buildStudentSheetsHTML(data, INPUT));
  assert.ok(plain.includes('Warna'), 'kolom pertama (penanda baris) harus tetap');
  assert.ok(!plain.includes('Merah') && !plain.includes('Biru'), 'jawaban bocor!');
});

test('pertanyaan LKPD tampil tanpa jawaban dan diberi garis isian', () => {
  const data = sampleData();
  const html = buildStudentSheetsHTML(data, INPUT);
  const first = data.lampiran.lkpd.pertanyaan[0];
  const question = typeof first === 'string' ? first : first.pertanyaan;
  assert.ok(stripTags(html).includes(question.slice(0, 25)));
  assert.ok(html.includes('_'.repeat(70)), 'harus ada garis isian');
});

test('soal tanpa pilihan (uraian) diberi garis isian, bukan lembar jawaban kosong', () => {
  const data = { lampiran: { evaluasi: { soal: [{ nomor: 1, pertanyaan: 'Jelaskan pola barisan.' }] } } };
  const html = buildStudentSheetsHTML(data, INPUT);
  assert.ok(html.includes('_'.repeat(70)));
  assert.ok(!html.includes('Lembar Jawaban'));
});

test('tanpa lampiran sama sekali: hasil kosong, bukan error', () => {
  assert.equal(buildStudentSheetsHTML({}, INPUT), '');
  assert.equal(buildStudentSheetsHTML({ lampiran: {} }, INPUT), '');
  assert.equal(buildAnswerKeyHTML({}, INPUT), '');
});

test('bila hanya sebagian lampiran ada, hanya itu yang dicetak dan tidak ada page-break di awal', () => {
  const data = { lampiran: { evaluasi: sampleData().lampiran.evaluasi } };
  const html = buildStudentSheetsHTML(data, INPUT);
  assert.ok(html.includes('SOAL EVALUASI'));
  assert.ok(!html.includes('TES DIAGNOSTIK') && !html.includes('LKPD'));
  assert.ok(html.startsWith('<div class="doc-title">'));
});

// ---------------------------------------------------------------------------
// Kunci guru
// ---------------------------------------------------------------------------

test('kunci guru memuat kunci tiap soal, jawaban LKPD, penskoran, dan peringatan', () => {
  const data = sampleData();
  const html = buildAnswerKeyHTML(data, INPUT);
  const plain = stripTags(html);

  assert.ok(plain.includes('KUNCI JAWABAN DAN PENSKORAN'));
  assert.ok(plain.includes('jangan dibagikan'), 'harus ada peringatan khusus guru');

  for (const s of [...data.lampiran.evaluasi.soal, ...data.lampiran.diagnostik.soal]) {
    assert.ok(html.includes(`<td>${s.kunci}</td>`), `kunci soal ${s.nomor} hilang`);
  }
  for (const q of data.lampiran.lkpd.pertanyaan || []) {
    if (q?.jawaban) assert.ok(plain.includes(String(q.jawaban).slice(0, 25)), 'jawaban LKPD hilang dari kunci');
  }
  if (data.lampiran.evaluasi.penskoran) {
    assert.ok(plain.includes(String(data.lampiran.evaluasi.penskoran).slice(0, 20)), 'penskoran hilang');
  }
});

// ---------------------------------------------------------------------------
// Nama file
// ---------------------------------------------------------------------------

test('nama file lampiran siswa dan kunci berbeda satu sama lain dan dari RPP', () => {
  const names = ['rpp', 'siswa', 'kunci'].map((k) => buildExportFilename(k, 'docx', INPUT));
  assert.equal(new Set(names).size, 3);
  assert.match(names[1], /^LampiranSiswa-Matematika-D-VIII-1-Andi-Ariyanto-/);
  assert.match(names[2], /^KunciJawaban-/);
});

// ---------------------------------------------------------------------------
// LKPD mode print (grid) vs mode docx (linear) + Momen Spark
// ---------------------------------------------------------------------------

test('spark dari AI dirender dan di-escape', () => {
  const data = sampleData();
  data.lampiran.lkpd.spark = 'Fakta <mengejutkan> & "seru"';
  const html = buildStudentSheetsHTML(data, INPUT);
  assert.ok(html.includes('Momen Spark'), 'kotak spark hilang');
  assert.ok(!html.includes('<mengejutkan>'), 'HTML spark tidak di-escape');
  assert.ok(html.includes('&lt;mengejutkan&gt;'), 'escape spark salah');
});

test('spark kosong memakai fallback statis (deterministik)', () => {
  const data = sampleData();
  delete data.lampiran.lkpd.spark;
  const a = stripTags(buildStudentSheetsHTML(data, INPUT));
  const b = stripTags(buildStudentSheetsHTML(data, INPUT));
  assert.ok(a.includes('Momen Spark'), 'fallback spark hilang');
  assert.equal(
    a.match(/Momen Spark:(.+?)Tujuan Pembelajaran/)?.[1]?.trim(),
    b.match(/Momen Spark:(.+?)Tujuan Pembelajaran/)?.[1]?.trim(),
    'fallback harus deterministik'
  );
});

test('spark AI yang membocorkan jawaban diganti fallback', () => {
  const data = sampleData();
  data.lampiran.lkpd.spark = "Tahu tak kenapa daun kelopak bisa tumbuh? Jawabnya ada pada dinding sel dan vakuol!";
  const plain = stripTags(buildStudentSheetsHTML(data, INPUT));
  assert.ok(!plain.includes('dinding sel dan vakuol'), 'spark bocor tidak dibuang!');
  assert.ok(plain.includes('Momen Spark'), 'fallback pengganti harus tampil');
});

test('mode print: LKPD berupa kartu misi grid berpemandu', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'print');
  assert.ok(html.includes('lkpd-grid'), 'grid hilang di mode print');
  assert.ok(html.includes('Misi 1'), 'nomor misi hilang');
  assert.ok(html.includes('Tulis dengan kalimatmu'), 'panduan menulis hilang');
  assert.ok(html.includes('write-line'), 'garis lentur hilang di kartu');
  const grid = html.slice(html.indexOf('lkpd-grid'), html.indexOf('Tabel Perbandingan'));
  assert.doesNotMatch(grid, /_{10,}/, 'garis underscore terpotong tidak boleh ada di kartu');
});

test('awalan panduan digilir antar kartu agar tidak monoton', () => {
  const data = sampleData();
  data.lampiran.lkpd.aktivitas = [
    { nama: 'A1', tugas: ['t1'] },
    { nama: 'A2', tugas: ['t2'] },
    { nama: 'A3', tugas: ['t3'] },
    { nama: 'A4', tugas: ['t4'] },
  ];
  const html = buildStudentSheetsHTML(data, INPUT, 'print');
  const cards = html.split('lkpd-card-head').slice(1);
  assert.equal(cards.length, 4);
  const starters = cards.map((c) => c.match(/“(.+?)”/)?.[1]);
  assert.ok(new Set(starters).size > 1, 'semua kartu memakai awalan yang sama');
});

test('mode print: kepala LKPD grid kop + identitas, tanpa duplikat kop', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'print');
  assert.ok(html.includes('lkpd-top'), 'grid kepala hilang di mode print');
  assert.equal(
    (html.match(/Nama \/ Kelompok/g) || []).length,
    1,
    'kop nama harus tepat satu (tidak duplikat)'
  );
});

test('mode docx: kepala LKPD vertikal tanpa grid', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'docx');
  assert.doesNotMatch(html, /lkpd-top|lkpd-grid|lkpd-card/, 'class grid bocor ke DOCX');
  assert.ok(html.includes('Nama / Kelompok'), 'kop hilang di mode docx');
});

test('mode docx: LKPD linear tanpa CSS grid', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'docx');
  assert.doesNotMatch(html, /lkpd-grid|lkpd-card/, 'class grid bocor ke DOCX');
  assert.ok(html.includes('Hasil / catatan'), 'isi linear hilang di mode docx');
  assert.ok(html.includes('Momen Spark'), 'spark harus tetap ada di DOCX');
});

test('kartu misi dan panduan tidak membocorkan jawaban', () => {
  const plain = stripTags(buildStudentSheetsHTML(sampleData(), INPUT, 'print'));
  assert.doesNotMatch(plain, /Jawaban\s*:/, 'teks "Jawaban:" bocor dari kartu/panduan');
});

test('kartu panjang tampil penuh dengan ruang tulis lebih banyak', () => {
  const data = sampleData();
  data.lampiran.lkpd.aktivitas = [
    { nama: 'Singkat', deskripsi: 'Amati.', tugas: ['t1'] },
    { nama: 'Panjang', deskripsi: 'x'.repeat(400), tugas: ['t1', 't2', 't3', 't4', 't5'] },
  ];
  const html = buildStudentSheetsHTML(data, INPUT, 'print');
  assert.ok(html.includes('lkpd-card--wide'), 'kartu panjang harus penuh');
  assert.equal((html.match(/lkpd-card--wide/g) || []).length, 1, 'kartu pendek jangan ikut penuh');
  const wide = html.slice(html.indexOf('lkpd-card--wide'));
  assert.equal((wide.match(/write-line/g) || []).length, 5, 'kartu penuh harus punya 5 garis');
});
