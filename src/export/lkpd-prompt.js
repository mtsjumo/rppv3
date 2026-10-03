/**
 * Prompt desain LKPD siap-copy: prompt generik + DATA LKPD saat itu.
 *
 * Satu klik → guru paste ke AI chat mana pun → hasilnya LKPD yang SAMA
 * (data identik) tetapi tampilan jauh lebih cantik, siap cetak.
 *
 * PENTING privasi: prompt ini TIDAK memuat kunci jawaban / jawaban LKPD /
 * isi sel jawaban tabel — hanya struktur + materi + tugas. AI eksternal
 * tidak pernah melihat jawabannya, jadi tidak bisa membocorkannya.
 * Merangkai string ini murni lokal: NOL token, NOL request.
 */

const num = (list) =>
  (Array.isArray(list) ? list : [])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .map((x, i) => `${i + 1}. ${x}`)
    .join('\n');

/** Baris pertama tiap kolom tabel (penanda baris), tanpa isi jawaban. */
function tableSkeleton(tabel) {
  if (!tabel?.data?.length) return '';
  const cols = Array.isArray(tabel.kolom) && tabel.kolom.length ? tabel.kolom : [];
  const head = cols.length ? cols.map(String).join(' | ') : '(tanpa nama kolom)';
  const rows = tabel.data.length;
  return `Kolom: ${head}\nJumlah baris data: ${rows} (sel jawaban DIKOSONGKAN untuk diisi siswa)`;
}

function questionsOnly(pertanyaan) {
  return (Array.isArray(pertanyaan) ? pertanyaan : [])
    .map((q) => (typeof q === 'string' ? q : (q?.pertanyaan ?? q?.soal ?? '')))
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .map((x, i) => `${i + 1}. ${x}`)
    .join('\n');
}

/**
 * Susun prompt lengkap dari data Phase 1 yang sudah ada.
 * @param {object} phase1 `{ rpp, lampiran }`
 * @param {object} [input] isi form (madrasah, mapel, materi, ...)
 * @returns {string} prompt siap copy; '' bila tidak ada LKPD
 */
export function buildLKPDPrompt(phase1, input = {}) {
  const lkpd = phase1?.lampiran?.lkpd;
  if (!lkpd) return '';
  const idn = lkpd.identitas || {};
  const materi = idn.materiPokok || input.materi || '';

  const aktivitas = (Array.isArray(lkpd.aktivitas) ? lkpd.aktivitas : [])
    .map((a, i) => {
      const tugas = num(a?.tugas);
      return `Aktivitas ${i + 1}: ${a?.nama || ''}\n${a?.deskripsi || ''}${
        tugas ? `\nTugas:\n${tugas}` : ''
      }`;
    })
    .join('\n\n');

  const spark = String(lkpd.spark ?? '').trim();

  return `Buatkan TAMPILAN Lembar Kerja Peserta Didik (LKPD) berikut menjadi jauh lebih cantik dan siap cetak. ISI HARUS SAMA PERSIS — hanya tampilannya yang dipercantik. Bahasa Indonesia.

DATA LKPD:
- Mata Pelajaran: ${idn.mataPelajaran || input.mapel || ''}
- Kelas/Semester: ${idn.kelasSemester || input.fase || ''}
- Materi Pokok: ${materi}
- Alokasi Waktu: ${idn.alokasiWaktu || input.alkok || ''}
- Kop siswa: Nama/Kelompok, Kelas, No. Absen, Tanggal (disi tangan)
${spark ? `- Momen Spark: ${spark}` : ''}
- Tujuan Pembelajaran:
${num(lkpd.tujuan) || '(tidak ada)'}
- Aktivitas:
${aktivitas || '(tidak ada)'}
- Tabel Perbandingan: ${lkpd.tabelPerbandingan?.judul || ''}
${tableSkeleton(lkpd.tabelPerbandingan) || '(tidak ada tabel)'}
- Pertanyaan Pemahaman (TANPA jawaban):
${questionsOnly(lkpd.pertanyaan) || '(tidak ada)'}

BATAS KERAS (tidak bisa ditawar):
1. Satu file HTML mandiri untuk DICETAK di kertas F4 (210x330mm). Tanpa internet saat dipakai: tidak ada font/CDN/gambar eksternal. Printer B&W — warna tidak boleh pembeda makna.
2. TIDAK BOLEH ada kunci jawaban atau jawaban di lembar ini. Panduan menulis harus membimbing TANPA memberi jawaban.
3. Tiap aktivitas terasa seperti "misi" bernomor dengan scaffolding (sentence starter bervariasi, checklist cek mandiri, ruang tulis proporsional); tiap blok tidak boleh terbelah antar halaman cetak; kolom/grid harus aman-fragmentasi (pecah antar blok, bukan di tengah blok).
4. Tabel perbandingan: header tampil, sel jawaban DIKOSONGKAN untuk diisi siswa.

KELUARAN: satu file HTML lengkap (inline <style>, tanpa JavaScript) + daftar singkat keputusan desainmu. Tanpa penjelasan lain.`;
}
