# Catatan Sinkronisasi — Fitur LKPD Siswa (untuk Claude Code)

> Dibuat oleh Opencode. Bacalah file ini sebelum melanjutkan pekerjaan yang
> tertunda (limit). Tujuannya: tidak ada perang kode antara pekerjaanmu dan
> pekerjaan Opencode.
>
> UPDATE: catatan ini dimutakhirkan setelah 10 commit tambahan (lihat
> "Perubahan setelah catatan awal"). Teks paste-chat yang lama SUDAH
> kedaluwarsa — pakai versi baru di bawah.

## Perubahan setelah catatan awal (Opencode, sudah commit, belum tentu push)

```
258d80b  Kepala LKPD grid kop+identitas (print), vertikal di DOCX
b10d770  Kilo kembali via worker (allowlist api.kilo.ai terverifikasi)
667532e  Kilo direct tanpa worker (keputusan eksplisit, sudah dibalik lagi)
34c82ee  Pesan jelas saat worker menolak Kilo (Bad target)
1f07ea8  Provider ke-4 Kilo (tanpa key + key resmi opsional, via worker)
8731d0c  Tabel Markdown tanpa baris pemisah tetap dirender (kasus Memahami)
2c67f1f  Cetak LKPD 1 kolom + header menempel + spark anti-bocor jawaban
5a99808  Kunci kertas cetak ke F4 (210x330mm)
b5e7113  Perbaiki LKPD: tabel selalu kosongkan jawaban + kartu adaptif
f59612d  Perbaiki kartu LKPD: garis lentur + panduan digilir
```

Yang wajib kamu ketahui dari daftar itu:

1. **`html-helpers.js` disentuh Opencode** (commit `8731d0c`): deteksi tabel
   Markdown toleran — tabel TANPA baris pemisah `|---|---|` tetap dirender
   bila 3+ baris pipa konsisten (kasus tabel tahap Memahami). Kalau idemu
   menyentuh deteksi tabel, rebase ke versi ini dulu.
2. **Aturan tabel siswa diperketat** (commit `b5e7113`): kolom non-penomoran/
   non-aspek SELALU dikosongkan (bug nyata: jawaban bocor karena data AI
   tidak pakai nama kolom "aspek"). Fallback lama "biarkan utuh" dihapus.
3. **Cetak LKPD = 1 kolom** (commit `2c67f1f`): grid 2 kolom tidak
   terfragmentasi andal di print Chrome (halaman kosong). Layar tetap grid.
   `sub-header`/`section-header` + `thead` anti-yatim. Kertas dikunci F4.
4. **Spark anti-bocor** (commit `2c67f1f`): pola `Jawabnya... ada/adalah/...`
   dan spark >220 char otomatis dibuang ke fallback (kasus nyata dari
   screenshot user). Prompt diperkeras dengan contoh terlarang.
5. **Provider ke-4 Kilo** (commit `1f07ea8` + lanjutan): menyentuh
   `config.js`, `store.js`, `ai-provider.js`, `settings.js`,
   `settings-panel.js`, `index.html`, `hygiene.test.js` (allowlist host).
   Kalau kamu berencana menyentuh file settings/panel, koordinasi dulu.
6. Suite sekarang **219+ tes, semua hijau**. Jangan
   push bila ada yang merah.

## Keputusan user (opsi B)

User memilih: Opencode mengerjakan redesign LKPD **sekarang**, Claude melakukan
**rebase/penyesuaian** setelah limit pulih. Komitmen Opencode:

- Pekerjaan Claude diamankan dulu sebagai commit WIP `0d2a3ba` (tidak hilang).
- Opencode hanya menyentuh file yang perlu untuk fitur ini (lihat daftar).
- Tidak ada push tanpa perintah user. Push tetap manual oleh user.

## Peta commit (v3, branch main)

```
f74ebbc  LKPD siswa mode ganda: grid cantik (PDF) vs linear (DOCX) + Momen Spark  ← Opencode
0d2a3ba  WIP: fitur lampiran siswa Claude (belum terverifikasi)                  ← snapshot kerjaanmu, utuh
```

## Yang diubah Opencode dan alasannya (commit f74ebbc)

Keputusan user yang melandasi semuanya:

1. LKPD boleh cantik pakai CSS, **PDF yang diandalkan**; DOCX LKPD boleh
   sederhana. Diagnostik, evaluasi, kunci guru: tetap 100% DOCX-safe.
2. Spark **sesuai materi (AI)**, fallback template statis gratis bila kosong.
3. Cakupan **LKPD saja**.

Per file:

- `src/prompts/phase1.js` — schema LKPD tambah `"spark"` (satu kalimat,
  maks 140 karakter, tanpa jawaban, boleh string kosong) + satu kalimat
  aturan MUTU. Alasan: spark lahir sekali saat generate (belasan token),
  bukan panggilan AI baru setiap cetak. Validasi (`completeness.js`)
  SENGAJA tidak diubah: spark opsional, fallback menutupinya.
- `src/render/student-renderer.js`
  - `renderStudentLKPD(lkpd, input, first, mode = 'print')` — parameter
    `mode` BARU (default `'print'`, jadi pemanggil lama tidak rusak).
  - Isi linear lama dipindah utuh ke `renderLKPDActivitiesLinear()` dan
    dipakai untuk `mode === 'docx'`.
  - Baru (hanya mode print): `renderLKPDActivitiesGrid()`, `activityCard()`
    (kartu "Misi N" + panduan menulis + checklist + garis isian),
    `sparkBox()`, `sparkFor()`, `SPARK_FALLBACKS` (5 template statis,
    deterministik berdasar panjang materi — stabil di tes).
  - `buildStudentSheetsHTML(phase1, input, mode = 'print')` — parameter
    `mode` BARU, diteruskan hanya ke LKPD. Diagnostik/evaluasi tidak berubah.
- `src/export/student.js`
  - `prepare(kind, mode = 'print')`; `docxKind()` memanggil dengan `'docx'`.
  - Objek `KINDS` disederhanakan: properti `build` DIHAPUS (tak terpakai).
    ⚠️ Kalau kodemu mereferensikan `KINDS.siswa.build` / `KINDS.kunci.build`,
    ganti dengan pemanggilan langsung `buildStudentSheetsHTML(...)` /
    `buildAnswerKeyHTML(...)` seperti di `prepare()`.
  - Impor `buildAnswerKeyHTML, buildStudentSheetsHTML` tetap dipakai.
- `src/styles/document.css` — kelas BARU (tidak mengubah yang lama):
  `.spark-box`, `.lkpd-grid` (2 kolom), `.lkpd-card` (+ `break-inside: avoid`),
  `.lkpd-card-head`, `.lkpd-card-num`, `.lkpd-card-body`, `.lkpd-guide`,
  `.lkpd-check`. Ramah printer B&W (border/nomor, bukan warna).
- `tests/student-sheets.test.js` — 5 tes BARU di akhir file: escape spark,
  fallback deterministik, grid di mode print, tanpa grid di mode docx,
  anti-bocor kartu/panduan. Suite: 206/206 hijau.

## Invarian yang WAJIB dijaga (jangan dilanggar saat rebase)

1. **Tidak ada kunci/jawaban di lembar siswa.** Tes `TIDAK ADA kunci jawaban...`
   + tes `kartu misi dan panduan tidak membocorkan jawaban` harus tetap hijau.
   Teks panduan sengaja menghindari kata "Jawaban:".
2. **Mode docx tidak boleh mengandung class `lkpd-grid`/`lkpd-card`.**
   Konverter DOCX tidak paham CSS grid — layout docx harus tetap linear.
3. **Backward compatible:** `mode` selalu opsional dengan default `'print'`.
4. **`spark` selalu opsional** di semua lapisan (prompt, validasi, renderer).

## Yang harus dilakukan Claude setelah limit pulih

1. `git pull` / sinkron dulu — jangan menimpa `student-renderer.js` dan
   `student.js` secara wholesale; pekerkaanmu yang belum selesai ada di
   commit WIP `0d2a3ba`, dan perubahan di atasnya ada di `f74ebbc`.
2. Selesaikan verifikasi yang tertunda: `npm run check` hijau, buka DOCX di
   LibreOffice, dan **cek print preview** (grid 2 kolom, kartu tidak
   terbelah halaman, tiap lembar mulai di halaman baru).
3. RPP lama (generate sebelum field `spark` ada) otomatis memakai fallback
   statis — itu perilaku yang disengaja, bukan bug. Spark AI asli hanya
   muncul di generate baru.
4. Commit pekerjaanmu sendiri; push tetap manual oleh user.

## Status deploy

Yang live di Vercel saat catatan ini ditulis BELUM memuat fitur LKPD grid
(itu push berikutnya, oleh user). Jangan push sebelum verifikasi selesai.

## ALIH DESAIN: tampilan cantik LKPD jadi tugas Claude (keputusan user)

User belum suka hasil CSS Opencode ("masih sangat buruk"). Kepemilikan desain
tampilan LKPD dialihkan ke Claude. Opencode TIDAK akan menyentuh lagi:
`activityCard()`, `renderLKPDActivitiesGrid()`, kelas CSS `lkpd-*`/`spark-box`/
`write-line`, dan struktur grid kepala (`lkpd-top`).

Aturan main redesign (bagian arsitektur yang TIDAK boleh dibongkar):

1. Split `mode: 'print' | 'docx'` tetap. Mode docx = linear, tanpa class
   grid/kartu — konverter DOCX hanya paham markup sederhana.
2. Data yang tersedia per aktivitas: `{ nama, deskripsi, tugas[] }`;
   per LKPD: identitas, tujuan[], tabelPerbandingan {kolom, data},
   pertanyaan[], spark (string opsional, bisa kosong).
3. Invarian anti-bocor tetap (lihat atas): tidak ada kunci/jawaban/label
   "Jawaban:" di lembar siswa; spark yang bocor dibuang oleh `sparkFor()`.
4. Cetak: kertas F4 (210×330mm), ramah printer B&W (border/nomor/pola,
   bukan warna sebagai pembeda makna), kartu/utuh tidak terbelah halaman,
   grid 2 kolom TERBUKTI merusak fragmentasi Chrome → di `@media print`
   kartu saat ini 1 kolom penuh, layar tetap grid.
5. Prompt desain yang dipakai user untuk meminta bantuan AI ada di bawah
   (bagian "Prompt desain LKPD"). Bila Claude memakai pendekatan berbeda,
   yang penting hasil akhirnya memenuhi kriteria penerima di prompt itu +
   seluruh suite tetap hijau (tambah tes untuk perilaku baru).

## Prompt desain LKPD (paste-ready, dipakai user ke AI chat)

```
Konteks: aplikasi web statis (Vite, tanpa framework) untuk guru Indonesia
membuat RPP. Satu fungsi JS me-render data JSON menjadi HTML Lembar Kerja
Peserta Didik (LKPD) untuk DICETAK di kertas F4 (210×330mm) dan diekspor ke
DOCX. Hasil render-mu menentukan apakah lembar ini enak dipakai siswa.

DATA YANG TERSEDIA (jangan minta field baru kecuali sangat perlu):
- identitas: mataPelajaran, kelasSemester, materiPokok, alokasiWaktu
- kop siswa: Nama/Kelompok, Kelas, No. Absen, Tanggal (diisi tangan)
- spark: 1 kalimat pemantik rasa ingin tahu sesuai materi (bisa kosong)
- tujuan: daftar string
- aktivitas[]: { nama, deskripsi, tugas[] } (2+ item, panjang bervariasi)
- tabelPerbandingan: { kolom[], data[][] } — kolom selain penomoran/aspek
  DIKOSONGKAN untuk diisi siswa; header tetap tampil
- pertanyaan[]: tanpa jawaban; tiap soal butuh ruang menulis

BATAS KERAS (tidak bisa ditawar):
1. Tanpa API key/internet saat dipakai: tidak ada font/CDN/gambar eksternal.
   Printer sekolah umumnya B&W — warna tidak boleh pembeda makna.
2. Ada DUA mode render dari data yang sama: mode PRINT (boleh CSS modern)
   dan mode DOCX (hanya markup linear sederhana: table/p/ol/ul/div/span —
   konverter DOCX buta CSS grid/flex/border-bottom). Struktur data→HTML
   boleh beda per mode, isi harus sama.
3. TIDAK BOLEH ada kunci jawaban, jawaban LKPD, atau teks "Jawaban:" di
   lembar siswa. Panduan menulis harus membimbing TANPA memberi jawaban.
4. Kartu/blok aktivitas tidak boleh terbelah antar halaman cetak.
   Fakta mesin: CSS grid 2 kolom TIDAK terfragmentasi andal di print
   Chrome (membuat halaman kosong) — kolom harus adaptif/aman-fragmentasi.

YANG DINILAI JELEK dari desain sekarang (jangan diulangi):
- garis jawaban underscore yang terpotong di kolom sempit;
- teks panduan yang sama persis diulang di tiap kartu;
- jeda kosong raksasa / halaman terbuang;
- tabel perbandingan yang malah terisi jawaban;
- tampilan kaku monoton seperti formulir pajak.

TUGAS: rancang ulang TAMPILAN LKPD mode print (struktur HTML + CSS scoped
.rpp-document) yang: memakai kolom/grid secara adaptif (penuh bila konten
panjang, berdampingan bila pendek); tiap aktivitas terasa seperti "misi"
bernomor dengan scaffolding (sentence starter bervariasi, checklist cek
mandiri, ruang tulis proporsional); ada kotak "Momen Spark"; tabel
perbandingan jelas untuk dilengkapi; pertanyaan punya ruang jawab.
Sertakan: (a) contoh HTML untuk 2 aktivitas (1 pendek, 1 panjang),
(b) CSS lengkap, (c) daftar yang TIDAK boleh dilakukan + alasannya,
(d) 5 kriteria uji visual yang bisa dicek di print preview.
Bahasa Indonesia. Tanpa JavaScript/framework.
```

Setelah Claude menghasilkan desain: ia yang mengimplementasikan ke
`student-renderer.js` + `document.css` + menyesuaikan/ menambah tes, lalu
verifikasi (`npm run check` + print preview + LibreOffice) dan commit sendiri.

