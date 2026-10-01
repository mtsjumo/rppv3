/**
 * Penamaan file ekspor: aman, deterministik, dan tidak saling menimpa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExportBase,
  buildExportFilename,
  sanitizeSegment,
  truncateSegment,
} from '../src/export/filename.js';

const INPUT = {
  madrasah: 'MTs Ma’arif Jumo',
  mapel: 'Ilmu Pengetahuan Alam (IPA)',
  fase: 'D/VIII/1',
  guru: 'Siti Nafisah, S.Pd.I',
  materi: 'Sel Hewan dan Sel Tumbuhan',
};

test('format utama: awalan-mapel-fase-guru-materi', () => {
  assert.equal(
    buildExportFilename('rpp', 'docx', INPUT),
    'RPP-IPA-D-VIII-1-Siti-Nafisah-Sel-Hewan-dan-Sel-Tumbuhan.docx'
  );
});

test('mapel memakai singkatan dalam kurung bila ada, selain itu nama lengkap', () => {
  assert.match(buildExportBase('rpp', INPUT), /^RPP-IPA-/);
  assert.match(
    buildExportBase('rpp', { ...INPUT, mapel: 'Bahasa Indonesia' }),
    /^RPP-Bahasa-Indonesia-/
  );
});

test('gelar setelah koma tidak ikut ke nama file', () => {
  const name = buildExportBase('rpp', { ...INPUT, guru: 'Dra. Hj. Aminah, M.Pd., Gr.' });
  assert.ok(name.includes('Dra-Hj-Aminah'));
  assert.ok(!name.includes('M-Pd'));
});

test('tiap jenis dokumen punya awalan sendiri, sehingga tidak saling menimpa', () => {
  const names = ['rpp', 'modul', 'media', 'lengkap'].map((k) =>
    buildExportFilename(k, 'docx', INPUT)
  );
  assert.equal(new Set(names).size, 4, `harus 4 nama berbeda: ${names.join(' | ')}`);
  assert.match(names[1], /^ModulAjar-/);
  assert.match(names[2], /^MediaPembelajaran-/);
  assert.match(names[3], /^RPP-Lengkap-/);
});

test('materi berbeda (guru, mapel, fase sama) menghasilkan nama berbeda', () => {
  const a = buildExportFilename('rpp', 'docx', { ...INPUT, materi: 'Sel Hewan' });
  const b = buildExportFilename('rpp', 'docx', { ...INPUT, materi: 'Jaringan Tumbuhan' });
  assert.notEqual(a, b);
});

test('karakter berbahaya dibuang: tidak ada pemisah path, spasi, atau titik ganda', () => {
  const evil = buildExportFilename('rpp', 'docx', {
    mapel: 'IPA/../../etc',
    fase: 'D\\VIII:1',
    guru: 'A*B?"C<D>E|F',
    materi: '  titik..titik  \n baris ',
  });
  assert.doesNotMatch(evil, /[\\/:*?"<>|\s]/);
  assert.doesNotMatch(evil, /\.\./);
  assert.doesNotMatch(evil, /--/);
  assert.match(evil, /\.docx$/);
});

test('bagian kosong dilewati tanpa tanda hubung ganda; semua kosong tetap valid', () => {
  assert.equal(
    buildExportFilename('rpp', 'docx', { mapel: 'Fiqih', guru: '', fase: '', materi: '' }),
    'RPP-Fiqih.docx'
  );
  assert.equal(buildExportFilename('rpp', 'docx', {}), 'RPP.docx');
  assert.equal(buildExportFilename('rpp', 'html'), 'RPP.html');
});

test('aksen Latin dibuang, huruf non-Latin tetap dipertahankan', () => {
  assert.equal(sanitizeSegment('Muḥammad Ibnu Sīnā'), 'Muhammad-Ibnu-Sina');
  assert.equal(sanitizeSegment('مدرسة المعارف'), 'مدرسة-المعارف');
});

test('pemangkasan di batas kata dan tidak meninggalkan tanda hubung di ujung', () => {
  assert.equal(truncateSegment('Satu-Dua-Tiga-Empat', 10), 'Satu-Dua');
  assert.equal(truncateSegment('Satu-Dua', 8), 'Satu-Dua');
  assert.equal(truncateSegment('Satu-Dua-Tiga', 8), 'Satu-Dua');
  assert.equal(truncateSegment('Abcdefghijklmnop', 6), 'Abcdef');

  const long = buildExportBase('lengkap', {
    mapel: 'Pendidikan Kewarganegaraan dan Pancasila Lanjutan',
    fase: 'D/VIII/1',
    guru: 'Muhammad Abdurrahman Al Fatih Hidayatullah Nugroho',
    materi: 'Penerapan Nilai Nilai Pancasila dalam Kehidupan Bermasyarakat Berbangsa dan Bernegara',
  });
  assert.ok(long.length <= 150, `terlalu panjang: ${long.length}`);
  assert.doesNotMatch(long, /-$/);
});

test('ekstensi diberi titik tepat satu kali', () => {
  assert.equal(
    buildExportFilename('rpp', '.docx', INPUT),
    buildExportFilename('rpp', 'docx', INPUT)
  );
});

test('deterministik: input sama selalu menghasilkan nama sama', () => {
  assert.equal(
    buildExportFilename('modul', 'html', INPUT),
    buildExportFilename('modul', 'html', { ...INPUT })
  );
});
