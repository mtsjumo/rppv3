/**
 * Lampiran siswa & kunci jawaban.
 *
 * Risiko terbesar fitur ini: kunci jawaban atau jawaban LKPD ikut tercetak di
 * lembar yang dibagikan ke siswa. Tes ini mengunci agar hal itu tidak terjadi,
 * sambil memastikan isi soal dan tugas tetap utuh.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

const ROOT = path.resolve(import.meta.dirname, '..');

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
  // Cetak: garis lentur (tidak terpotong). DOCX: deretan underscore (konverter buta border CSS).
  assert.ok(html.includes('lkpd-questions') && html.includes('write-line'), 'cetak: garis lentur');
  const docx = buildStudentSheetsHTML(data, INPUT, 'docx');
  assert.ok(docx.includes('_'.repeat(70)), 'docx: garis isian underscore');
  assert.doesNotMatch(docx, /write-line/, 'docx tidak boleh memakai garis CSS');
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

test('mode print: LKPD berupa kartu misi berpemandu (tabel/blok, bukan grid)', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'print');
  assert.ok(html.includes('Misi 1'), 'nomor misi hilang');
  assert.ok(html.includes('Mulai menulis'), 'awalan menulis hilang');
  assert.ok(html.includes('write-line'), 'garis lentur hilang di kartu');
  assert.ok(html.includes('lkpd-card'), 'kartu hilang');
  assert.doesNotMatch(html, /lkpd-grid/, 'grid sudah dibuang dari desain cetak');
  const missions = html.slice(html.indexOf('lkpd-missions'), html.indexOf('Tabel Perbandingan'));
  assert.doesNotMatch(missions, /_{10,}/, 'garis underscore terpotong tidak boleh ada di kartu');
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

test('mode docx: kepala LKPD vertikal tanpa kelas tampilan', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'docx');
  assert.doesNotMatch(html, /lkpd-|write-line|spark-label|spark-text/, 'kelas cetak bocor ke DOCX');
  assert.ok(html.includes('Nama / Kelompok'), 'kop hilang di mode docx');
});

test('mode docx: LKPD linear tanpa kelas tampilan', () => {
  const html = buildStudentSheetsHTML(sampleData(), INPUT, 'docx');
  assert.doesNotMatch(html, /lkpd-|write-line/, 'kelas cetak bocor ke DOCX');
  assert.ok(html.includes('Hasil / catatan'), 'isi linear hilang di mode docx');
  assert.ok(html.includes('Momen Spark'), 'spark harus tetap ada di DOCX');
  assert.ok(html.includes('Cek Mandiri dan Refleksi'), 'penutup harus ada juga di DOCX');
});

test('kartu misi dan panduan tidak membocorkan jawaban', () => {
  const plain = stripTags(buildStudentSheetsHTML(sampleData(), INPUT, 'print'));
  assert.doesNotMatch(plain, /Jawaban\s*:/, 'teks "Jawaban:" bocor dari kartu/panduan');
});

const missionHtml = (aktivitas, mode = 'print') => {
  const data = sampleData();
  data.lampiran.lkpd.aktivitas = aktivitas;
  return buildStudentSheetsHTML(data, INPUT, mode);
};
const count = (html, re) => (html.match(re) || []).length;
const SHORT = (n) => ({ nama: `Pendek ${n}`, deskripsi: 'Amati.', tugas: ['t1'] });
const LONG = { nama: 'Panjang', deskripsi: 'x'.repeat(400), tugas: ['t1', 't2', 't3', 't4', 't5'] };

test('misi pendek berurutan berpasangan dalam satu baris tabel', () => {
  const html = missionHtml([SHORT(1), SHORT(2)]);
  assert.equal(count(html, /class="lkpd-pair"/g), 1, 'dua misi pendek = satu pasangan');
  assert.equal(count(html, /class="lkpd-card"/g), 2);
  assert.equal(count(html, /lkpd-card--wide/g), 0);
});

test('misi panjang selebar halaman, tidak masuk pasangan', () => {
  const html = missionHtml([SHORT(1), LONG]);
  assert.equal(count(html, /class="lkpd-pair"/g), 0);
  assert.equal(count(html, /lkpd-card--wide/g), 2, 'misi pendek tanpa pasangan juga selebar halaman');
});

test('misi pendek tanpa pasangan dibuat selebar halaman (tidak menyisakan separuh halaman kosong)', () => {
  const html = missionHtml([SHORT(1), SHORT(2), SHORT(3)]);
  assert.equal(count(html, /class="lkpd-pair"/g), 1);
  assert.equal(count(html, /lkpd-card--wide/g), 1, 'misi ketiga sendirian → penuh');
});

test('ruang menulis sebanding dengan tugas, tidak pernah raksasa', () => {
  const lines = (html) => count(html, /class="write-line"/g);
  const base = lines(missionHtml([]));
  const one = lines(missionHtml([LONG])) - base; // misi panjang (5 tugas)
  assert.equal(one, 6, 'misi panjang: tugas + 2 dibatasi 6 garis');
  const manyTasks = { nama: 'Banyak', tugas: Array.from({ length: 12 }, (_, i) => `t${i}`) };
  assert.ok(lines(missionHtml([manyTasks])) - base <= 6, 'garis tidak boleh lebih dari 6 per misi');
  const small = lines(missionHtml([{ nama: 'Kecil', tugas: ['t1'] }])) - base;
  assert.equal(small, 3, 'misi sangat pendek: minimal 3 garis');
});

test('awalan menulis bervariasi antar misi dan tidak mengulang teks yang sama di tiap kartu', () => {
  const html = missionHtml(Array.from({ length: 6 }, (_, i) => SHORT(i + 1)));
  const starters = [...html.matchAll(/“(.+?)”/g)].map((m) => m[1]);
  assert.equal(starters.length, 6);
  assert.equal(new Set(starters).size, 6, 'tiap misi punya awalan berbeda');
  // Teks yang dulu diulang di setiap kartu kini tampil paling banyak sekali per lembar.
  assert.equal(count(html, /Tulisanku bisa dibaca temanku/g), 1, 'cek mandiri hanya sekali per lembar');
  assert.equal(count(html, /Cek mandiri/g), 1);
});

test('cek mandiri memuat butir tabel hanya bila LKPD memang punya tabel', () => {
  const withTable = buildStudentSheetsHTML(sampleData(), INPUT);
  assert.ok(withTable.includes('Tabel sudah lengkap'));
  const data = sampleData();
  delete data.lampiran.lkpd.tabelPerbandingan;
  assert.ok(!buildStudentSheetsHTML(data, INPUT).includes('Tabel sudah lengkap'));
});

test('tabel perbandingan: kelas lkpd-table hanya di mode cetak', () => {
  assert.ok(buildStudentSheetsHTML(sampleData(), INPUT, 'print').includes('class="lkpd-table"'));
  assert.doesNotMatch(buildStudentSheetsHTML(sampleData(), INPUT, 'docx'), /lkpd-table/);
});

test('mode default adalah print (parameter mode opsional)', () => {
  const data = sampleData();
  assert.equal(buildStudentSheetsHTML(data, INPUT), buildStudentSheetsHTML(data, INPUT, 'print'));
});

test('spark opsional: tanpa field spark tidak error di kedua mode', () => {
  const data = sampleData();
  delete data.lampiran.lkpd.spark;
  for (const mode of ['print', 'docx']) {
    assert.ok(buildStudentSheetsHTML(data, INPUT, mode).includes('Momen Spark'));
  }
});

test('teks siswa/AI di kartu misi di-escape (tidak bisa menyisipkan HTML)', () => {
  const html = missionHtml([{ nama: '<img src=x onerror=alert(1)>', deskripsi: '<script>x</script>', tugas: ['<b>t</b>'] }]);
  assert.doesNotMatch(html, /<img src=x|<script>|<b>t<\/b>/);
});

test('seluruh isi misi tetap ada (nama, deskripsi, semua tugas)', () => {
  const plain = stripTags(
    missionHtml([{ nama: 'Uji Coba', deskripsi: 'Amati tabel dengan teliti.', tugas: ['Hitung selisihnya', 'Catat hasil'] }])
  );
  for (const s of ['Uji Coba', 'Amati tabel dengan teliti.', 'Hitung selisihnya', 'Catat hasil']) {
    assert.ok(plain.includes(s), `hilang: ${s}`);
  }
});

test('tidak ada kunci/jawaban di seluruh keluaran cetak maupun DOCX', () => {
  for (const mode of ['print', 'docx']) {
    const plain = stripTags(buildStudentSheetsHTML(sampleData(), INPUT, mode));
    assert.doesNotMatch(plain, /Jawaban\s*:|Kunci\s*:|Penskoran/i, `bocor di mode ${mode}`);
  }
});

test('CSS cetak LKPD tidak memakai grid; flex hanya untuk kepala kartu', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/document.css'), 'utf8');
  const lkpdCss = css.slice(css.indexOf('LKPD siswa (mode cetak)'), css.indexOf('Responsif preview'));
  assert.ok(lkpdCss.length > 500, 'blok CSS LKPD tidak ditemukan');
  assert.doesNotMatch(lkpdCss, /display:\s*grid|grid-template|grid-column/, 'grid merusak fragmentasi cetak Chrome');
  const flexUses = lkpdCss.match(/display:\s*flex/g) || [];
  assert.equal(flexUses.length, 1, 'flex hanya boleh dipakai di .lkpd-card-head');
  assert.match(lkpdCss, /\.lkpd-card-head\s*\{[^}]*display:\s*flex/);
  // Kartu, pasangan, dan baris tabel tidak boleh terbelah antar halaman.
  for (const sel of ['.lkpd-card', 'table.lkpd-pair', 'table.lkpd-table tr']) {
    const block = lkpdCss.match(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    assert.match(block, /break-inside:\s*avoid/, `${sel} harus break-inside: avoid`);
  }
});
