/**
 * Penamaan file ekspor (DOCX, HTML, PDF).
 *
 * Format:  {Awalan}-{Mapel}-{Fase-Kelas-Semester}-{Guru}-{Materi}.{ext}
 * Contoh:  RPP-IPA-D-VIII-1-Siti-Nafisah-Sel-Hewan-dan-Sel-Tumbuhan.docx
 *
 * Mengapa begini:
 *   - Nama lama ("RPP.docx", "ModulAjar.docx") sama untuk semua guru, mapel, dan
 *     materi, sehingga file mudah tertimpa saat dipindah ke satu folder.
 *   - Tiap jenis dokumen punya awalan sendiri, jadi RPP, Modul Ajar, Media, dan
 *     dokumen gabungan dari data yang sama tidak saling menimpa.
 *   - Materi ikut dipakai karena guru yang sama sering membuat beberapa RPP untuk
 *     mapel dan semester yang sama. Hapus 'materi' dari FILENAME_FIELDS bila ingin
 *     nama yang lebih pendek.
 *   - Hanya huruf dan angka yang dipertahankan, sehingga nama aman di Windows,
 *     macOS, Android, dan di URL (tidak ada / \ : * ? " < > | maupun spasi).
 *
 * Modul ini murni (tanpa DOM) sehingga bisa diuji langsung.
 */

/** Awalan per jenis dokumen. */
const PREFIX = {
  rpp: 'RPP',
  modul: 'ModulAjar',
  media: 'MediaPembelajaran',
  lengkap: 'RPP-Lengkap',
  siswa: 'LampiranSiswa',
  kunci: 'KunciJawaban',
};

/** Bagian nama yang dipakai, berurutan. */
export const FILENAME_FIELDS = ['mapel', 'fase', 'guru', 'materi'];

/** Batas panjang tiap bagian (karakter), agar nama tetap muat di path Windows. */
const MAX_LEN = { mapel: 28, fase: 16, guru: 26, materi: 34 };

/** Batas mutlak panjang nama tanpa ekstensi. */
const MAX_BASE_LEN = 150;

/**
 * Bersihkan satu bagian nama: buang aksen, ganti semua selain huruf/angka
 * (spasi, titik, garis miring, titik dua, dst.) menjadi satu tanda hubung.
 * @param {*} value
 * @returns {string}
 */
export function sanitizeSegment(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pangkas pada batas kata (tanda hubung), bukan di tengah kata.
 * @param {string} segment hasil sanitizeSegment
 * @param {number} max
 */
export function truncateSegment(segment, max) {
  if (segment.length <= max) return segment;
  if (segment[max] === '-') return segment.slice(0, max);
  const cut = segment.slice(0, max);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash >= max * 0.5 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/** Nama mapel: pakai singkatan dalam kurung bila ada ("Ilmu Pengetahuan Alam (IPA)" → "IPA"). */
function shortMapel(value) {
  const raw = String(value ?? '').trim();
  const abbreviation = /\(([A-Z]{2,8})\)/.exec(raw);
  return abbreviation ? abbreviation[1] : raw;
}

/** Nama guru tanpa gelar di belakang koma ("Siti Nafisah, S.Pd.I" → "Siti Nafisah"). */
function shortGuru(value) {
  return String(value ?? '').split(',')[0];
}

const EXTRACTORS = {
  mapel: (input) => shortMapel(input.mapel),
  fase: (input) => input.fase,
  guru: (input) => shortGuru(input.guru),
  materi: (input) => input.materi,
};

/**
 * Nama dasar (tanpa ekstensi). Bagian yang kosong dilewati tanpa meninggalkan
 * tanda hubung ganda.
 *
 * @param {'rpp'|'modul'|'media'|'lengkap'|'siswa'|'kunci'} kind
 * @param {object} [input] isi form (mapel, fase, guru, materi)
 * @returns {string}
 */
export function buildExportBase(kind, input = {}) {
  const prefix = PREFIX[kind] ?? PREFIX.rpp;
  const parts = FILENAME_FIELDS.map((field) => {
    const raw = EXTRACTORS[field]?.(input ?? {});
    return truncateSegment(sanitizeSegment(raw), MAX_LEN[field] ?? 30);
  }).filter(Boolean);

  const base = [prefix, ...parts].join('-');
  return base.length <= MAX_BASE_LEN ? base : truncateSegment(base, MAX_BASE_LEN);
}

/**
 * Nama file lengkap.
 * @param {'rpp'|'modul'|'media'|'lengkap'} kind
 * @param {string} extension tanpa titik, mis. 'docx'
 * @param {object} [input]
 * @returns {string}
 */
export function buildExportFilename(kind, extension, input = {}) {
  return `${buildExportBase(kind, input)}.${String(extension).replace(/^\./, '')}`;
}
