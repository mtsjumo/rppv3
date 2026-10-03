/**
 * Lampiran untuk peserta didik + kunci jawaban untuk guru.
 *
 * Semua isi dirender ulang dari data Phase 1 yang SUDAH ada (diagnostik, LKPD,
 * evaluasi) — tidak ada panggilan AI baru, sehingga tanpa tambahan token dan
 * isinya selalu sama dengan RPP.
 *
 * Perbedaan dengan lampiran di dalam RPP (versi guru):
 *   - tanpa kunci jawaban, tanpa jawaban LKPD, tanpa label level kognitif;
 *   - ada kop Nama/Kelas/No. Absen/Tanggal dan ruang menulis;
 *   - tabel perbandingan LKPD: kolom nomor dan aspek tetap, kolom lain dikosongkan
 *     untuk diisi siswa;
 *   - tiap lembar mulai di halaman baru sehingga bisa dicetak satu per satu.
 *
 * Fungsi mengembalikan isi dokumen TANPA pembungkus `.rpp-document` (pemanggil
 * yang membungkusnya, sama seperti isi pratinjau).
 */

import { store } from '../core/store.js';
import {
  deriveColumns,
  escapeHtml,
  itemHtml,
  kvTable,
  list,
  para,
  renderSoalBlock,
  rowCells,
  table,
  text,
} from './html-helpers.js';

/** Panjang garis isian. Cukup pendek agar muat satu baris di cetak maupun DOCX. */
const LINE = '_'.repeat(70);
const LINE_STYLE = 'line-height:2.2;white-space:nowrap;overflow:hidden;color:#444;';
const SOAL_PER_GRID = 10;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Garis isian untuk jawaban tertulis. */
function answerLines(count = 3) {
  return Array.from({ length: count }, () => `<div style="${LINE_STYLE}">${LINE}</div>`).join('');
}

/**
 * Garis isian lentur untuk kolom sempit (kartu grid mode print): garis
 * border selebar kolom, tidak pernah terpotong seperti deretan underscore.
 * JANGAN dipakai untuk DOCX (konverter tidak paham border-bottom div).
 */
function writeLines(count = 3) {
  return Array.from({ length: count }, () => '<div class="write-line"></div>').join('');
}

/**
 * Awalan kalimat panduan menulis, digilir per kartu agar tidak monoton.
 * Generik dan aman (bukan jawaban), deterministik sehingga stabil di tes.
 */
const GUIDE_STARTERS = [
  'Menurut pengamatanku, … karena ….',
  'Dari kegiatan ini aku menemukan bahwa ….',
  'Langkah terpenting menurutku adalah … karena ….',
];

/** Checklist ringkas satu baris (tanpa kata "Jawaban:" agar lolos uji anti-bocor). */
const GUIDE_CHECK = 'Cek: ☐ semua tugas terjawab ☐ ada bukti/gambar ☐ bisa dibaca teman';

/** Kop identitas siswa yang diisi tangan. */
function nameBlock(labelNama = 'Nama') {
  const label = (t) => `<td style="width:16%;height:30px;"><strong>${t}</strong></td>`;
  return `<table>
    <tr>${label(labelNama)}<td style="width:44%;"></td>${label('Kelas')}<td style="width:24%;"></td></tr>
    <tr>${label('No. Absen')}<td></td>${label('Tanggal')}<td></td></tr>
  </table>`;
}

function contextLine(input) {
  const parts = [
    input.madrasah,
    input.mapel,
    input.materi && `Materi: ${input.materi}`,
    input.fase && `Fase/Kelas/Smt: ${input.fase}`,
  ].filter(Boolean);
  return `<div class="doc-subtitle" style="font-size:0.9rem;font-weight:500;">${escapeHtml(
    parts.join(' | ')
  )}</div>`;
}

/** Judul lembar + konteks + kop nama. Lembar pertama tidak diberi page-break. */
function sheetHeader(title, input, { first = false, nama = 'Nama', kop = true } = {}) {
  const cls = first ? 'doc-title' : 'doc-title page-break';
  const pad = first ? '' : ' style="padding-top:40px;"';
  const kopHtml = kop ? nameBlock(nama) : '';
  return `<div class="${cls}"${pad}>${escapeHtml(title)}</div>${contextLine(input)}${kopHtml}`;
}

const petunjuk = (teks) =>
  `<p style="margin:10px 0 6px;"><strong>Petunjuk:</strong> ${escapeHtml(teks)}</p>`;

/** Soal tanpa kunci dan tanpa label level; soal tanpa pilihan diberi garis isian. */
function studentSoal(soalList) {
  let html = '';
  for (const s of soalList) {
    html += renderSoalBlock(s, { showLevel: false, showKunci: false });
    if (!Array.isArray(s.opsi) || !s.opsi.length) html += answerLines(3);
  }
  return html;
}

/** Kotak lembar jawaban (satu baris nomor + satu baris kosong), per 10 soal. */
function answerGrid(soalList) {
  if (!soalList.length || !soalList.every((s) => Array.isArray(s.opsi) && s.opsi.length)) return '';
  let html = `<div class="sub-header">Lembar Jawaban</div>`;
  for (let i = 0; i < soalList.length; i += SOAL_PER_GRID) {
    const nums = soalList.slice(i, i + SOAL_PER_GRID).map((s, k) => s.nomor ?? i + k + 1);
    html += `<table>
      <tr><th>No</th>${nums.map((n) => `<th style="text-align:center;">${escapeHtml(n)}</th>`).join('')}</tr>
      <tr><td><strong>Jawaban</strong></td>${nums.map(() => '<td style="height:30px;"></td>').join('')}</tr>
    </table>`;
  }
  return html;
}

function renderStudentDiagnostik(dg, input, first) {
  if (!dg?.soal?.length) return '';
  let html = sheetHeader('TES DIAGNOSTIK AWAL', input, { first });
  html += petunjuk(
    'Kerjakan secara mandiri tanpa membuka buku. Pilih satu jawaban yang paling tepat. Tes ini bukan penilaian akhir; hasilnya dipakai guru untuk mengetahui kesiapan belajarmu.'
  );
  html += studentSoal(dg.soal);
  html += answerGrid(dg.soal);
  return html;
}

/**
 * Tabel perbandingan versi siswa. Kolom penomoran (No/nomor/n/#) dan kolom
 * aspek dipertahankan; SEMUA kolom lain dikosongkan untuk diisi siswa.
 * Bila tidak ada kolom penomoran/aspek sama sekali, kolom pertama dianggap
 * penanda baris dan dipertahankan — sisanya tetap dikosongkan. Membiarkan
 * tabel utuh berarti membocorkan jawaban (bug nyata), jadi tidak ada lagi
 * fallback "biarkan utuh".
 */
function studentComparisonTable(tabel) {
  if (!tabel?.data?.length) return '';
  const cols = tabel.kolom?.length ? tabel.kolom : deriveColumns(tabel.data);
  const keepable = cols.map(
    (c) => /^(no|nomor|n|#)$/.test(norm(c)) || norm(c).includes('aspek')
  );
  const anyKeep = keepable.some(Boolean);
  const isKept = keepable.map((k, j) => k || (!anyKeep && j === 0));

  const head = cols.map((c) => `<th>${text(c)}</th>`).join('');
  const body = tabel.data
    .map((row, ri) => {
      const cells = rowCells(row, cols, ri);
      const tds = cols
        .map((_, j) => (isKept[j] ? `<td>${text(cells[j])}</td>` : '<td style="height:48px;"></td>'))
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Pertanyaan LKPD tanpa jawaban, masing-masing diberi garis isian. */
function studentQuestions(pertanyaan) {
  const items = pertanyaan
    .map((q) => (typeof q === 'string' ? q : (q?.pertanyaan ?? q?.soal ?? '')))
    .filter((q) => String(q).trim());
  if (!items.length) return '';
  return `<ol>${items.map((q) => `<li>${text(q)}${answerLines(3)}</li>`).join('')}</ol>`;
}

function renderStudentLKPD(lkpd, input, first, mode = 'print') {
  if (!lkpd) return '';
  const idn = lkpd.identitas || {};
  // Kop dirender terpisah (bukan di sheetHeader) agar bisa sejajar identitas.
  let html = sheetHeader('LEMBAR KERJA PESERTA DIDIK (LKPD)', input, {
    first,
    nama: 'Nama / Kelompok',
    kop: false,
  });

  const kopNama = nameBlock('Nama / Kelompok');
  const identitas = kvTable(
    [
      ['Mata Pelajaran', text(idn.mataPelajaran || input.mapel)],
      ['Kelas/Semester', text(idn.kelasSemester || input.fase)],
      ['Materi Pokok', text(idn.materiPokok || input.materi)],
      ['Alokasi Waktu', text(idn.alokasiWaktu || input.alkok)],
    ],
    180
  );

  if (mode === 'docx') {
    // DOCX: susun vertikal linear (konverter tidak paham CSS grid).
    html += kopNama + identitas;
  } else {
    // Print: kop + identitas bersebelahan agar ngeblend dengan kartu grid.
    html += `<div class="lkpd-top"><div>${kopNama}</div><div>${identitas}</div></div>`;
  }

  html += sparkBox(lkpd, input.materi);

  if (lkpd.tujuan?.length) {
    html += `<div class="sub-header">Tujuan Pembelajaran</div>${list(
      lkpd.tujuan,
      'ol',
      (i) => `<li>${text(i)}</li>`
    )}`;
  }

  // Mode DOCX: layout linear patuh (konverter DOCX tidak paham CSS grid).
  // Mode print: kartu misi grid yang hidup.
  if (mode === 'docx') html += renderLKPDActivitiesLinear(lkpd);
  else html += renderLKPDActivitiesGrid(lkpd);

  if (lkpd.tabelPerbandingan?.data?.length) {
    const judul = lkpd.tabelPerbandingan.judul || `Tabel Perbandingan — ${input.materi || ''}`;
    html += `<div class="sub-header">${escapeHtml(judul)}</div>`;
    html += `<p style="margin:4px 0;font-size:0.85rem;"><em>Lengkapi kolom yang masih kosong.</em></p>`;
    html += studentComparisonTable(lkpd.tabelPerbandingan);
  }

  if (lkpd.pertanyaan?.length) {
    const questions = studentQuestions(lkpd.pertanyaan);
    if (questions) html += `<div class="sub-header">Pertanyaan Pemahaman</div>${questions}`;
  }
  return html;
}

/** Isi aktivitas versi linear (DOCX-safe): dipakai untuk mode 'docx'. */
function renderLKPDActivitiesLinear(lkpd) {
  let html = '';
  for (const a of lkpd.aktivitas || []) {
    html += `<div class="sub-header">${escapeHtml(a.nama || '')}</div>`;
    if (a.deskripsi) html += para(a.deskripsi);
    if (a.tugas?.length) html += list(a.tugas, 'ol', (i) => `<li>${text(i)}</li>`);
    html += `<p style="margin:8px 0 0;"><strong>Hasil / catatan:</strong></p>${answerLines(4)}`;
  }
  return html;
}

/**
 * Template statis "Momen Spark" — cadangan gratis bila AI tidak memberi spark.
 * Generik dan terbimbing (nol token, deterministik sehingga stabil di tes).
 */
const SPARK_FALLBACKS = [
  'Sebelum mulai, tulis satu hal tentang materi ini yang ingin kamu buktikan sendiri hari ini.',
  'Tebak dulu jawabannya sebelum mengerjakan — benar atau salah, tuliskan alasanmu.',
  'Perhatikan baik-baik: satu detail kecil dalam kegiatan ini bisa mengubah seluruh kesimpulan.',
  'Setelah selesai, jelaskan kembali hasilnya dengan bahasamu sendiri dalam dua kalimat.',
  'Diskusikan dengan teman sebangkumu: apakah kalian sampai pada kesimpulan yang sama? Mengapa?',
];

/** Pola spark AI yang membocorkan jawaban (terbukti di lapangan: "Jawabnya ada pada ..."). */
const SPARK_LEAK_RE = /jawab(?:nya|an)?\s+(ada|adalah|yaitu|ialah|berada|terletak)/i;

/** Spark dari AI bila aman; jika tidak, fallback statis deterministik berdasar materi. */
function sparkFor(lkpd, materi) {
  const ai = String(lkpd?.spark ?? '').trim();
  // Tolak spark yang membocorkan jawaban atau kepanjangan (prompt: maks 140).
  if (ai && !SPARK_LEAK_RE.test(ai) && ai.length <= 220) return ai;
  const key = String(materi ?? '');
  return SPARK_FALLBACKS[key.length % SPARK_FALLBACKS.length];
}

function sparkBox(lkpd, materi) {
  return `<div class="spark-box"><strong>⚡ Momen Spark:</strong> ${escapeHtml(
    sparkFor(lkpd, materi)
  )}</div>`;
}

/** Satu kartu misi: nama + deskripsi + tugas + panduan menulis + ruang hasil. */
function activityCard(a, i) {
  const tugas =
    Array.isArray(a.tugas) && a.tugas.length
      ? list(a.tugas, 'ol', (t) => `<li>${text(t)}</li>`)
      : '';
  const starter = GUIDE_STARTERS[i % GUIDE_STARTERS.length];
  // Kartu panjang (banyak teks/tugas) tampil penuh agar ruang mengerjakan cukup;
  // kartu pendek boleh bersebelahan. Grid tidak selalu dua kolom.
  const bulk = [a.nama, a.deskripsi, ...(Array.isArray(a.tugas) ? a.tugas : [])]
    .map((x) => String(x ?? ''))
    .join(' ');
  const wide = bulk.length > 280 || (Array.isArray(a.tugas) && a.tugas.length > 4);
  return `<div class="lkpd-card${wide ? ' lkpd-card--wide' : ''}">
    <div class="lkpd-card-head"><span class="lkpd-card-num">Misi ${i + 1}</span><span>${text(
      a.nama || `Aktivitas ${i + 1}`
    )}</span></div>
    <div class="lkpd-card-body">${a.deskripsi ? para(a.deskripsi) : ''}${tugas}</div>
    <div class="lkpd-guide"><strong>Tulis dengan kalimatmu:</strong> awali dengan
      <em>“${starter}”</em>
      <div class="lkpd-check">${GUIDE_CHECK}</div>
    </div>
    <div class="lkpd-result"><strong>Hasil / catatan:</strong></div>${writeLines(wide ? 5 : 3)}
  </div>`;
}

/** Isi aktivitas versi grid (mode print/PDF). Kartu tidak dipecah antar halaman. */
function renderLKPDActivitiesGrid(lkpd) {
  const list_ = lkpd.aktivitas || [];
  if (!list_.length) return '';
  return `<div class="lkpd-grid">${list_.map((a, i) => activityCard(a, i)).join('')}</div>`;
}

function renderStudentEvaluasi(ev, input, first) {
  if (!ev?.soal?.length) return '';
  let html = sheetHeader('SOAL EVALUASI', input, { first });
  html += petunjuk(
    'Bacalah setiap soal dengan teliti. Pilih satu jawaban yang paling tepat, lalu tuliskan pada lembar jawaban.'
  );
  html += studentSoal(ev.soal);
  html += answerGrid(ev.soal);
  return html;
}

/**
 * Lembar siswa: tes diagnostik, LKPD, dan soal evaluasi (masing-masing di halaman baru).
 * @param {object} phase1 `{ rpp, lampiran }`
 * @param {object} [input]
 * @param {string} [mode] 'print' (LKPD grid cantik) atau 'docx' (LKPD linear patuh)
 * @returns {string} HTML tanpa pembungkus; '' bila tidak ada lampiran sama sekali
 */
export function buildStudentSheetsHTML(phase1, input = store.state.input, mode = 'print') {
  const lamp = phase1?.lampiran || {};
  const sheets = [];
  const add = (render, data) => {
    const html = render(data, input, sheets.length === 0);
    if (html) sheets.push(html);
  };
  add(renderStudentDiagnostik, lamp.diagnostik);
  add((d, inp, fst) => renderStudentLKPD(d, inp, fst, mode), lamp.lkpd);
  add(renderStudentEvaluasi, lamp.evaluasi);
  return sheets.join('');
}

// ---------------------------------------------------------------------------
// Kunci jawaban (khusus guru)
// ---------------------------------------------------------------------------

/** Tabel kunci: No | Kunci | Level (kolom level hanya bila ada). */
function keyTable(soalList) {
  const withLevel = soalList.some((s) => s.level);
  const headers = withLevel ? ['No', 'Kunci', 'Level'] : ['No', 'Kunci'];
  const rows = soalList.map((s, i) => {
    const row = { No: s.nomor ?? i + 1, Kunci: s.kunci || '-' };
    if (withLevel) row.Level = s.level || '';
    return row;
  });
  return table(headers, rows);
}

function renderKeyDiagnostik(dg) {
  if (!dg?.soal?.length) return '';
  let html = `<div class="sub-header">Tes Diagnostik Awal — Kunci</div>${keyTable(dg.soal)}`;
  const interpretasi = dg.rubrik?.interpretasi;
  if (interpretasi?.length) {
    html += `<div class="sub-header">Rubrik Interpretasi Hasil</div>`;
    if (dg.rubrik.aspek?.length) {
      html += `<p><strong>Aspek yang dinilai:</strong> ${escapeHtml(dg.rubrik.aspek.join(', '))}</p>`;
    }
    html += table(
      ['Rentang Skor', 'Kategori', 'Tindak Lanjut'],
      interpretasi.map((r) => ({
        'Rentang Skor': r.rentangSkor || '',
        Kategori: r.kategori || '',
        'Tindak Lanjut': r.tindakLanjut || '',
      }))
    );
  }
  return html;
}

function renderKeyLKPD(lkpd) {
  if (!lkpd) return '';
  let html = '';
  const tabel = lkpd.tabelPerbandingan;
  if (tabel?.data?.length) {
    const cols = tabel.kolom?.length ? tabel.kolom : deriveColumns(tabel.data);
    html += `<div class="sub-header">LKPD — Tabel Perbandingan (jawaban lengkap)</div>${table(cols, tabel.data)}`;
  }
  const withAnswers = (lkpd.pertanyaan || []).filter((q) => q && typeof q === 'object' && q.jawaban);
  if (withAnswers.length) {
    html += `<div class="sub-header">LKPD — Jawaban Pertanyaan Pemahaman</div>${list(
      lkpd.pertanyaan,
      'ol',
      itemHtml
    )}`;
  }
  return html;
}

function renderKeyEvaluasi(ev) {
  if (!ev?.soal?.length) return '';
  let html = `<div class="sub-header">Soal Evaluasi — Kunci</div>${keyTable(ev.soal)}`;
  if (ev.penskoran) {
    html += `<p style="margin-top:8px;"><strong>Penskoran:</strong> ${escapeHtml(ev.penskoran)}</p>`;
  }
  return html;
}

/**
 * Halaman kunci jawaban dan penskoran untuk guru.
 * @returns {string} '' bila tidak ada isi untuk dikunci
 */
export function buildAnswerKeyHTML(phase1, input = store.state.input) {
  const lamp = phase1?.lampiran || {};
  const body =
    renderKeyDiagnostik(lamp.diagnostik) + renderKeyLKPD(lamp.lkpd) + renderKeyEvaluasi(lamp.evaluasi);
  if (!body) return '';

  const guru = input.guru ? `<p style="text-align:center;margin:2px 0;">Guru: ${escapeHtml(input.guru)}</p>` : '';
  return `<div class="doc-title">KUNCI JAWABAN DAN PENSKORAN</div>
    <div class="doc-subtitle">Khusus guru — jangan dibagikan kepada peserta didik</div>
    ${contextLine(input)}${guru}${body}`;
}
