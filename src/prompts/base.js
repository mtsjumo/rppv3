/**
 * Aturan dasar & utilitas prompt yang dipakai semua phase.
 */

/**
 * Peringatan anti-salin untuk few-shot example.
 * Contoh di prompt sengaja bertopik "Sel Hewan dan Sel Tumbuhan" sebagai
 * acuan gaya; tanpa peringatan ini model gratis cenderung menyalin topiknya.
 */
export function fewshotNote(materiAsli) {
  return `\n\nPERINGATAN: Contoh di atas topiknya adalah "Sel Hewan dan Sel Tumbuhan" HANYA untuk referensi gaya bahasa, kedalaman, dan struktur JSON. JANGAN salin topik/istilah biologinya. Materi yang HARUS kamu buat adalah "${materiAsli}" — sesuaikan seluruh isi sepenuhnya dengan materi ini.`;
}

/**
 * Ringkasan konteks dari RPP inti supaya Phase 2/3 konsisten.
 * Tanpa ini, modul ajar & media bisa berbeda topik dengan RPP.
 */
export function buildContextSummary(context) {
  const rpp = context?.rpp;
  if (!rpp) return '';

  const desain = rpp.desainPembelajaran || {};
  const langkah = rpp.langkahPembelajaran || {};
  const topik = (desain.topikPembelajaran || []).join('; ');
  const tp = (desain.tujuanPembelajaran || []).join('; ');
  const model = desain.praktekPedagogis?.modelPembelajaran || '';
  const tahapNama = (langkah.kegiatanInti?.tahap || []).map((t) => t.nama).join(', ');
  if (!topik && !tp && !model) return '';

  return `\n\nKONTEKS DARI RPP INTI YANG SUDAH DIBUAT SEBELUMNYA (WAJIB konsisten dengan ini, jangan bertentangan):\n- Topik Pembelajaran: ${topik}\n- Tujuan Pembelajaran: ${tp}\n- Model Pembelajaran: ${model}\n- Tahapan Kegiatan Inti: ${tahapNama}`;
}

/**
 * Aturan notasi (matematika, kimia, fisika) — satu sumber kebenaran.
 *
 * Desain: AI TIDAK diminta memutuskan mana rumus "sederhana" dan mana yang
 * "rumit". Keputusan itu membuat model (terutama yang kecil) tidak konsisten:
 * sebagian rumus dibungkus, sebagian ditulis polos (`x^2`, `\frac{1}{2}` tanpa
 * pembungkus) sehingga tampil sebagai teks mentah. Aturannya cukup satu:
 * bungkus semua rumus dengan delimiter. Renderer (`services/latex.js`) yang
 * memutuskan tampilan — rumus ringan menjadi teks Unicode (x², H₂O, ×), rumus
 * bertingkat (pecahan, akar, sigma) menjadi gambar — sehingga rumus yang
 * dibutuhkan tidak pernah hilang dan yang sepele tidak membebani dokumen.
 */
export const NOTATION_RULES = `NOTASI MATEMATIKA/SAINS — satu aturan yang selalu diikuti:
1. Setiap rumus, persamaan, pecahan, akar, pangkat, indeks, simbol operasi/relasi (×, ÷, ≤, ≥, ≠, ≈, →), dan reaksi kimia WAJIB ditulis dalam LaTeX dan dibungkus \\(...\\) (sebaris) atau \\[...\\] (baris tersendiri). JANGAN PERNAH menulis perintah LaTeX (\\frac, \\sqrt, \\times, dst.) atau tanda ^ dan _ di luar pembungkus itu. Jangan memakai tanda $.
2. Jangan membungkus kata, kalimat, nama benda, atau angka + satuan tanpa pangkat (mis. 25 cm). Satuan berpangkat ditulis \\(m^{2}\\), \\(cm^{3}\\). Mapel yang tidak memuat rumus (bahasa, agama, IPS, seni, dst.) tidak memakai LaTeX sama sekali.
3. Rumus yang dibutuhkan untuk menyelesaikan soal atau kegiatan WAJIB ditulis lengkap; jangan diganti kata-kata atau disederhanakan menjadi teks polos. Tulislah semuanya konsisten dalam LaTeX — aplikasi yang menentukan tampilannya (rumus ringan tampil sebagai teks, rumus bertingkat sebagai gambar).
4. Di dalam JSON, backslash ditulis GANDA. Contoh BENAR:
   "Luas lingkaran \\\\(L = \\\\pi r^{2}\\\\) dengan \\\\(r = 7\\\\) cm."
   "Hitung \\\\(\\\\frac{3}{4} + \\\\frac{1}{4}\\\\)."
   "Reaksi: \\\\(2H_{2} + O_{2} \\\\rightarrow 2H_{2}O\\\\)"
   opsi jawaban: "A. \\\\(x = 3\\\\)"
   persamaan tersendiri: "\\\\[x = \\\\frac{-b \\\\pm \\\\sqrt{b^{2} - 4ac}}{2a}\\\\]"
   Contoh SALAH: \\frac{1}{2} tanpa pembungkus; x^2 tanpa pembungkus; "1/2" untuk pecahan bertingkat.
5. Tabel di dalam teks (mis. tabel pengamatan pada deskripsi aktivitas atau stimulus soal) tulis sebagai tabel Markdown: baris judul kolom, baris pemisah |---|---|, lalu satu baris per baris data. Jangan memakai HTML atau <br>. Rumus yang memuat tanda | tetap ditulis di dalam \\(...\\).`;

/** Aturan mutu isi — dipakai semua generator. */
export const CONTENT_QUALITY_RULES = `KUALITAS ISI (utama — lebih penting daripada panjang tulisan):
- Spesifik dan kontekstual: sebut konsep, istilah, benda, fenomena, angka, dan contoh nyata yang dekat dengan kehidupan peserta didik madrasah (rumah, lingkungan sekitar, pasar, kebun/sawah, masjid, sekolah). Kalimat yang bisa ditempel ke materi lain tanpa diubah = terlalu generik; tulis ulang.
- Hindari kalimat pengisi: "sesuai materi", "dan lain-lain", "berbagai hal", "peserta didik memahami materi", "guru menjelaskan materi".
- Langkah pembelajaran = kegiatan konkret: siapa melakukan apa, dengan media/bahan apa, menghasilkan apa. Pertanyaan pemantik, contoh kasus, dan instruksi tugas TULIS LENGKAP di dalam langkah, jangan hanya menulis "diberikan pertanyaan pemantik".
- Akurat: fakta, istilah, satuan, dan rumus harus benar dan sesuai jenjang. Bila ragu, pilih rumusan yang aman daripada mengarang angka atau nama.
- Konsisten dengan CP, TP, dan materi yang diberikan; jangan menambah topik di luar itu.`;

/** System prompt dasar untuk seluruh generator RPP. */
export const BASE_RULES = `Kamu adalah AI generator RPP Kurikulum Merdeka untuk MTs/SMP di Indonesia. Output HANYA JSON valid, tanpa teks lain. Bahasa Indonesia baku (EYD), formal.

KURIKULUM BERBASIS CINTA (KBC) — Kemenag:
KBC adalah jiwa implementasi Kurikulum Nasional di madrasah. Bukan mengganti, tetapi menginsersikan nilai cinta ke seluruh proses pembelajaran. Lima nilai Panca Cinta:
1. Cinta kepada Tuhan Yang Maha Esa — keimanan, spiritualitas, syukur
2. Cinta kepada Diri dan Sesama — empati, kasih sayang, tolong-menolong
3. Cinta kepada Ilmu Pengetahuan — semangat belajar, literasi, inovasi
4. Cinta kepada Lingkungan — ekoteologi, menjaga alam, keberlanjutan
5. Cinta kepada Bangsa dan Negeri — nasionalisme, toleransi, moderasi beragama

DEEP LEARNING — Kemendikdasmen:
Tiga pilar Pembelajaran Mendalam (PM):
- Mindful (Berkesadaran): siswa hadir penuh, termotivasi intrinsik, sadar tujuan belajar, mampu meregulasi diri
- Meaningful (Bermakna): pembelajaran terhubung dengan kehidupan nyata, siswa merasakan manfaat dan relevansi
- Joyful (Menggembirakan): lingkungan aman secara psikologis, santai, kegembiraan dari pertumbuhan autentik

Integrasi: KBC menyediakan jiwa dan nilai, Deep Learning menyediakan pendekatan pedagogis. Keduanya saling melengkapi dalam setiap langkah pembelajaran.

${CONTENT_QUALITY_RULES}

${NOTATION_RULES}

Aksara Arab dan Jawa tulis langsung dalam teks aslinya, JANGAN pakai transliterasi.`;

/** Ringkasan aturan notasi untuk prompt pengguna (per sub-phase). */
export const LATEX_RULE =
  'Notasi: bungkus SEMUA rumus, persamaan, pecahan, akar, pangkat, indeks, dan reaksi kimia dengan \\(...\\) (sebaris) atau \\[...\\] (display) dalam LaTeX; jangan pernah menulis perintah LaTeX atau tanda ^ _ di luar pembungkus, dan jangan pakai $. Kata serta angka+satuan biasa jangan dibungkus; mapel tanpa rumus: tanpa LaTeX. Tabel dalam teks: Markdown. Aksara Arab/Jawa tulis langsung.';
