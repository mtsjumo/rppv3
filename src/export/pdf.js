/**
 * Export PDF/Print.
 *
 * Menggunakan dialog print browser ("Save as PDF") — jauh lebih andal &
 * ringan daripada html2pdf.js yang sering gagal untuk dokumen 25+ halaman
 * (tabel besar, LaTeX, page-break). Semua styling dokumen sudah di
 * `@media print`.
 */

import { $$ } from '../core/dom.js';

/** Area cetak yang sedang aktif, untuk dibersihkan setelah selesai. */
let activePrintArea = null;

/**
 * Cetak satu elemen preview sebagai PDF.
 * @param {string} elementId id container preview
 * @param {string} [fileBase] nama dasar file; dipakai sebagai nama default di dialog "Save as PDF"
 */
export function printElement(elementId, fileBase) {
  const el = document.getElementById(elementId);
  if (!el) return false;
  el.classList.add('print-area');
  runPrint(() => el.classList.remove('print-area'), fileBase);
  return true;
}

/**
 * Cetak beberapa phase sebagai satu PDF (dengan page-break di antaranya).
 * @param {Array<{id: string, label: string}>} phases
 * @param {string} [fileBase] nama dasar file untuk dialog "Save as PDF"
 */
export function printCombined(phases, fileBase) {
  const temp = document.createElement('div');
  temp.className = 'print-area';
  temp.style.cssText = 'position:absolute;left:0;top:0;width:100%;z-index:9999;background:#fff;';

  let appended = 0;
  for (const { id, label } of phases) {
    const el = document.getElementById(id)?.querySelector('.rpp-document');
    if (!el) continue;
    if (appended > 0) {
      const br = document.createElement('div');
      br.className = 'page-break';
      temp.appendChild(br);
    }
    if (label) {
      const heading = document.createElement('div');
      heading.className = 'doc-title';
      heading.style.cssText = 'page-break-before:always;padding-top:40px;';
      heading.textContent = label;
      temp.appendChild(heading);
    }
    temp.appendChild(el.cloneNode(true));
    appended++;
  }

  if (!appended) return false;

  document.body.appendChild(temp);
  activePrintArea = temp;
  runPrint(() => {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
    activePrintArea = null;
  }, fileBase);
  return true;
}

/**
 * Cetak HTML yang dibangun kode (bukan elemen yang sudah ada di halaman), mis. lembar siswa.
 * @param {string} html isi dokumen tanpa pembungkus `.rpp-document`
 * @param {string} [fileBase] nama dasar file untuk dialog "Save as PDF"
 * @returns {boolean} false bila html kosong
 */
export function printHTML(html, fileBase) {
  if (!html) return false;
  const temp = document.createElement('div');
  temp.className = 'print-area';
  temp.style.cssText = 'position:absolute;left:0;top:0;width:100%;z-index:9999;background:#fff;';
  const doc = document.createElement('div');
  doc.className = 'rpp-document';
  doc.innerHTML = html;
  temp.appendChild(doc);

  document.body.appendChild(temp);
  activePrintArea = temp;
  runPrint(() => {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
    activePrintArea = null;
  }, fileBase);
  return true;
}

function runPrint(cleanup, fileBase) {
  // Browser memakai judul halaman sebagai nama file default di dialog "Save as PDF".
  const originalTitle = document.title;
  const restore = () => {
    document.title = originalTitle;
    cleanup();
  };
  // Beri browser satu frame untuk menerapkan layout sebelum dialog print.
  requestAnimationFrame(() => {
    if (fileBase) document.title = fileBase;
    window.print();
    if (typeof window.onafterprint !== 'undefined') {
      window.onafterprint = restore;
      // Jaring pengaman: beberapa browser tidak memanggil onafterprint.
      setTimeout(restore, 5000);
    } else {
      setTimeout(restore, 3000);
    }
  });
}

/** Bersihkan area cetak yang tertinggal (mis. setelah navigating). */
export function cleanupPrintArea() {
  $$('.print-area').forEach((el) => el.classList.remove('print-area'));
  if (activePrintArea?.parentNode) {
    activePrintArea.parentNode.removeChild(activePrintArea);
    activePrintArea = null;
  }
}
