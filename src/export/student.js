/**
 * Lampiran siswa & kunci jawaban: cetak (PDF) dan DOCX.
 *
 * Isinya dirender ulang dari data Phase 1 yang sudah ada, tanpa panggilan AI.
 * Tombolnya terpisah dari export RPP supaya guru bisa mencetak lampiran untuk
 * siswa tanpa ikut mencetak seluruh RPP, dan kunci jawaban tidak ikut terbagikan.
 */

import { saveAs } from '../core/dom.js';
import { store } from '../core/store.js';
import { friendlyError } from '../services/json.js';
import { showToast } from '../ui/toast.js';
import { buildAnswerKeyHTML, buildStudentSheetsHTML } from '../render/student-renderer.js';
import { htmlToDocx } from './docx.js';
import { buildExportBase, buildExportFilename } from './filename.js';
import { printHTML } from './pdf.js';

const KINDS = {
  siswa: {
    empty: 'Belum ada lampiran (diagnostik, LKPD, atau evaluasi) untuk dicetak.',
  },
  kunci: {
    empty: 'Belum ada kunci jawaban untuk dibuat.',
  },
};

/** HTML untuk jenis tertentu, atau null (dengan toast) bila belum ada datanya. */
function prepare(kind, mode = 'print') {
  const phase1 = store.state.phase1;
  if (!phase1) {
    showToast('Generate RPP (Phase 1) terlebih dahulu.', 'warning');
    return null;
  }
  // Mode 'docx': LKPD dirender linear patuh (konverter DOCX tidak paham CSS grid).
  const html =
    kind === 'siswa'
      ? buildStudentSheetsHTML(phase1, store.state.input, mode)
      : buildAnswerKeyHTML(phase1, store.state.input);
  if (!html) {
    showToast(KINDS[kind].empty, 'warning');
    return null;
  }
  return html;
}

function printKind(kind) {
  const html = prepare(kind, 'print');
  if (!html) return;
  showToast('Buka dialog Print, lalu pilih "Save as PDF" atau printer.', 'info');
  printHTML(html, buildExportBase(kind, store.state.input));
}

async function docxKind(kind) {
  const html = prepare(kind, 'docx');
  if (!html) return;
  try {
    const filename = buildExportFilename(kind, 'docx', store.state.input);
    saveAs(await htmlToDocx(html, filename.replace(/\.docx$/, '')), filename);
    showToast('DOCX berhasil diunduh!', 'success');
  } catch (e) {
    showToast(`Gagal export DOCX: ${friendlyError(e.message)}`, 'error');
  }
}

/** Cetak lampiran siswa (diagnostik, LKPD, evaluasi) tanpa kunci jawaban. */
export const printStudentSheets = () => printKind('siswa');
/** Unduh lampiran siswa sebagai DOCX. */
export const exportStudentSheetsDOCX = () => docxKind('siswa');
/** Cetak kunci jawaban dan penskoran (khusus guru). */
export const printAnswerKey = () => printKind('kunci');
/** Unduh kunci jawaban sebagai DOCX. */
export const exportAnswerKeyDOCX = () => docxKind('kunci');
