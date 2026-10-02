/**
 * Export DOCX memakai docx.js (UMD, dimuat via CDN di index.html, versi 8.5.0).
 *
 * Riwayat bug penting (file hasil ekspor berisi tabel kosong tanpa satu pun teks):
 *   Versi lama membangun ulang setiap TextRun lewat `sizeAll()` yang membaca
 *   `run.options.text`. Objek TextRun di docx 8.x tidak punya properti `options`
 *   (isinya hanya rootKey/root/properties), sehingga SEMUA teks menjadi ''.
 *   Sekarang ukuran dan gaya diteruskan langsung saat run dibuat; tidak ada lagi
 *   pembacaan properti internal library.
 *
 * Perilaku:
 *   - Daftar berurutan memakai `numbering` yang benar; daftar bersarang beraras.
 *   - Walk blok/inline yang benar: teks dan elemen inline yang berurutan
 *     digabung menjadi satu paragraf, blok (tabel, daftar, div) dipisah.
 *   - Tabel bersarang (tabel di dalam sel) dan daftar di dalam sel didukung;
 *     baris tabel dalam tidak lagi dihitung sebagai baris tabel luar.
 *   - Rumus (<img>) ditulis sebagai teks terbaca dari `alt`, bukan gambar.
 *   - `<br>` menjadi pemisah baris, `<sup>`/`<sub>` menjadi naik/turun.
 *   - Tanda tangan pengesahan menjadi tabel dua kolom tanpa border.
 *
 * Satu pipeline (`buildBlocks`) dipakai bersama oleh export per-phase maupun
 * export gabungan, jadi keduanya tidak bisa berbeda perilaku.
 */

import { saveAs } from '../core/dom.js';

const FONT = 'Times New Roman';
const MARGIN = { top: 1440, right: 1440, bottom: 1440, left: 1440 };
/** Lebar halaman usable dalam twip (8.5" - 2" margin = 6.5" = 9360 twip). */
const USABLE_WIDTH_TWIP = 9020;
/** Ukuran font dalam setengah poin: 22 = 11pt, 20 = 10pt. */
const BASE_SIZE = 22;
const TABLE_SIZE = 20;
/** Penghitung instance numbering: tiap <ol> mendapat nomor sendiri supaya penomoran mulai dari 1. */
let listInstanceCounter = 0;
/** Ruang yang dipakai margin dalam sel (kiri + kanan) saat menghitung lebar tabel bersarang. */
const CELL_PADDING_TWIP = 160;

/** true bila library docx termuat. */
export function isDocxAvailable() {
  return typeof globalThis.docx !== 'undefined' && !!globalThis.docx?.Document;
}

function requireDocx() {
  if (!isDocxAvailable()) throw new Error('Library DOCX belum siap dimuat');
  return globalThis.docx;
}

const textContent = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  return Array.from(node.childNodes || [])
    .map(textContent)
    .join('');
};

/** Ubah CSS hex ke format docx (tanpa #). */
function cssColorToDocx(value) {
  const c = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c.slice(1).toUpperCase() : undefined;
}

const BLOCK_TAGS = new Set([
  'div',
  'p',
  'table',
  'ol',
  'ul',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'blockquote',
  'pre',
  'hr',
]);

const isBlockElement = (node) =>
  node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName.toLowerCase());

/** Elemen yang berisi blok di dalamnya (tabel, daftar, div, dst.). */
const hasBlockDescendant = (el) =>
  !!el.querySelector('table, ol, ul, div, p, h1, h2, h3, h4, h5, h6, blockquote, pre');

/**
 * Konversi HTML → array blok docx (Paragraph | Table).
 * @param {string} html
 * @param {object} lib destructured dari globalThis.docx
 * @returns {Array}
 */
export function buildBlocks(html, lib) {
  const {
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    WidthType,
    PageBreak,
    convertInchesToTwip,
  } = lib;

  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks = [];

  // ---- Run inline --------------------------------------------------------
  const makeRun = (text, opts = {}) =>
    new TextRun({
      text,
      bold: !!opts.bold,
      italics: !!opts.italics,
      color: opts.color,
      break: opts.break,
      superScript: opts.superScript || undefined,
      subScript: opts.subScript || undefined,
      underline: opts.underline ? {} : undefined,
      size: opts.size ?? BASE_SIZE,
      font: FONT,
    });

  /**
   * Walk inline: menghasilkan TextRun[] yang menghormati bold/italic/warna/<br>.
   * `inherited` membawa gaya dari induk, termasuk `size` — ukuran diteruskan
   * di sini, BUKAN dengan membangun ulang run sesudahnya.
   */
  function inlineRuns(el, inherited = {}) {
    const runs = [];
    const walk = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Spasi/indentasi dari template HTML bukan bagian teks: ringkas jadi satu spasi.
        const t = node.textContent.replace(/\s+/g, ' ');
        if (t) runs.push(makeRun(t, parent));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || node.style?.display === 'none') return;

      // Gaya diwariskan dari elemen pembungkus langsung (bukan hanya dari induk paling atas),
      // sehingga <strong> di dalam <td> tetap tebal.
      const style = { ...parent };
      if (tag === 'strong' || tag === 'b' || node.style?.fontWeight === '700') style.bold = true;
      if (tag === 'i' || tag === 'em') style.italics = true;
      if (tag === 'sup') style.superScript = true;
      if (tag === 'u') style.underline = true;
      if (tag === 'sub') style.subScript = true;
      if (node.classList?.contains('kunci-jawaban')) {
        style.bold = true;
        style.color = 'C62828';
      }
      const inlineColor = cssColorToDocx(node.style?.color);
      if (inlineColor) style.color = inlineColor;

      if (tag === 'br') {
        runs.push(makeRun('', { ...style, break: 1 }));
        return;
      }
      if (tag === 'img') {
        // Rumus bertingkat → teks terbaca dari alt (mis. "(a+b)/2", "√(x)").
        if (node.alt) runs.push(makeRun(node.alt, { ...style, italics: true }));
        return;
      }
      for (const child of Array.from(node.childNodes)) walk(child, style);
      // Blok di dalam konteks inline (mis. <div> dalam <span>): beri pemisah baris
      // supaya paragraf-paragrafnya tidak menempel.
      if ((tag === 'div' || tag === 'p') && node.nextSibling) {
        runs.push(makeRun('', { ...style, break: 1 }));
      }
    };
    for (const child of Array.from(el.childNodes)) walk(child, inherited);
    return runs;
  }

  const para = (runs, options = {}) => {
    if (!runs.length) return null;
    return new Paragraph({
      children: runs,
      alignment: options.alignment,
      heading: options.heading,
      spacing: options.spacing ?? { before: 60, after: 60 },
      indent: options.indent,
      border: options.border,
      shading: options.shading,
      numbering: options.numbering,
    });
  };

  const spacer = (after = 120) => new Paragraph({ children: [], spacing: { after } });

  // ---- Tabel -------------------------------------------------------------
  const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: 'BDBDBD' };
  const tableBorders = {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
    insideHorizontal: thinBorder,
    insideVertical: thinBorder,
  };

  function convertTable(tblEl, ctx) {
    // `rows` / `cells` hanya mencakup anak langsung tabel ini, sehingga baris dan
    // sel milik tabel bersarang tidak ikut terhitung.
    const rows = Array.from(tblEl.rows);
    if (!rows.length) return null;

    const width = ctx.width ?? USABLE_WIDTH_TWIP;
    const spanOf = (cell) => Math.max(1, cell.colSpan || 1);
    const colCount = Math.max(
      ...rows.map((tr) => Array.from(tr.cells).reduce((n, cell) => n + spanOf(cell), 0)),
      1
    );
    const colWidth = Math.floor(width / colCount);

    const tableRows = rows.map((tr) => {
      const cells = Array.from(tr.cells);
      return new TableRow({
        children: cells.map((cell) => {
          const isHeader = cell.tagName.toLowerCase() === 'th';
          const span = spanOf(cell);
          const cellWidth = colWidth * span;
          const cellBlocks = [];
          walkBlocks(cell, cellBlocks, {
            size: TABLE_SIZE,
            bold: isHeader,
            width: Math.max(cellWidth - CELL_PADDING_TWIP, 1200),
            listDepth: 0,
          });
          // Sel wajib berisi paragraf, dan harus DIAKHIRI paragraf (syarat Word
          // bila isinya berakhir dengan tabel bersarang).
          if (!cellBlocks.length || cellBlocks[cellBlocks.length - 1] instanceof Table) {
            cellBlocks.push(new Paragraph({ children: [] }));
          }
          return new TableCell({
            width: { size: cellWidth, type: WidthType.DXA },
            columnSpan: span > 1 ? span : undefined,
            shading: isHeader ? { fill: 'FCE4EC' } : undefined,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: cellBlocks,
          });
        }),
      });
    });

    return new Table({
      rows: tableRows,
      columnWidths: Array.from({ length: colCount }, () => colWidth),
      borders: tableBorders,
      width: { size: width, type: WidthType.DXA },
    });
  }

  // ---- Tanda tangan pengesahan -----------------------------------------
  function convertSignatureTable(tblEl) {
    const row = tblEl.querySelector('tr');
    if (!row) return [];
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const cell = (td) => {
      // Pecah berdasarkan <br> supaya ada baris kosong untuk tanda tangan.
      const fragments = td.innerHTML.split(/<br\s*\/?>/i);
      const paragraphs = fragments.map((frag) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = frag;
        const runs = inlineRuns(tmp, { size: BASE_SIZE });
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 20, after: 20 },
          children: runs.length ? runs : [new TextRun({ text: '', size: BASE_SIZE, font: FONT })],
        });
      });
      return new TableCell({
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
        children: paragraphs,
      });
    };
    return [
      new Table({
        rows: [new TableRow({ children: Array.from(row.cells).map(cell) })],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      spacer(200),
    ];
  }

  // ---- Daftar ------------------------------------------------------------
  function convertList(listEl, ctx) {
    const out = [];
    const ordered = listEl.tagName.toLowerCase() === 'ol';
    const depth = ctx.listDepth ?? 0;
    const level = Math.min(depth, 8);
    // Tiap daftar berurutan memakai instance baru; tanpa ini semua <ol> dalam satu
    // dokumen (termasuk antar phase pada ekspor gabungan) melanjutkan satu penomoran.
    const instance = ordered ? ++listInstanceCounter : undefined;

    for (const li of Array.from(listEl.children).filter((c) => c.tagName?.toLowerCase() === 'li')) {
      // Isi inline item = bagian yang bukan blok; blok (daftar bersarang, tabel,
      // div) diproses terpisah sesudah baris item itu sendiri.
      const clone = li.cloneNode(true);
      const blockKids = Array.from(clone.children).filter(
        (c) => isBlockElement(c) || hasBlockDescendant(c)
      );
      blockKids.forEach((c) => c.remove());

      const runs = inlineRuns(clone, { size: TABLE_SIZE, bold: ctx.bold });
      if (runs.length) {
        out.push(
          new Paragraph({
            children: runs,
            spacing: { before: 40, after: 20 },
            numbering: { reference: ordered ? 'rpp-list' : 'rpp-bullet', level, instance },
          })
        );
      }
      for (const child of blockKids) emitBlock(child, out, { ...ctx, listDepth: depth + 1 });
    }
    return out;
  }

  // ---- Opsi paragraf per kelas elemen ------------------------------------
  function paraOptionsFor(el) {
    const cls = el.classList;
    if (cls.contains('soal-nomor')) {
      return { bold: true, size: BASE_SIZE, spacing: { before: 140, after: 40 } };
    }
    if (cls.contains('soal-opsi') && !cls.contains('kunci-jawaban')) {
      return {
        size: TABLE_SIZE,
        indent: { left: convertInchesToTwip(0.4) },
        spacing: { after: 20 },
      };
    }
    if (cls.contains('kunci-jawaban')) {
      return {
        bold: true,
        size: TABLE_SIZE,
        indent: { left: convertInchesToTwip(0.4) },
        spacing: { after: 60 },
      };
    }
    if (el.style?.textAlign === 'justify') return { alignment: AlignmentType.JUSTIFIED };
    if (el.style?.textAlign === 'center') return { alignment: AlignmentType.CENTER };
    return {};
  }

  // ---- Walk blok ---------------------------------------------------------

  /**
   * Telusuri anak-anak `parent`. Node inline yang berurutan (teks, <strong>,
   * <span>, <img>, <br>) digabung menjadi SATU paragraf; elemen blok diproses
   * lewat `emitBlock`.
   */
  function walkBlocks(parent, out, ctx) {
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const holder = document.createElement('div');
      for (const n of buffer) holder.appendChild(n.cloneNode(true));
      buffer = [];
      if (!holder.textContent.trim() && !holder.querySelector('img, br')) return;
      const p = para(inlineRuns(holder, { size: ctx.size, bold: ctx.bold }));
      if (p) out.push(p);
    };

    for (const child of Array.from(parent.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (isBlockElement(child) || hasBlockDescendant(child))
      ) {
        flush();
        emitBlock(child, out, ctx);
      } else if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.ELEMENT_NODE) {
        buffer.push(child);
      }
    }
    flush();
  }

  /** Ubah satu elemen blok menjadi paragraf/tabel/daftar. */
  function emitBlock(el, out, ctx) {
    const tag = el.tagName.toLowerCase();
    const cls = el.classList;
    const heading = (size, options) => {
      // Warna eksplisit: tanpa ini judul memakai biru bawaan gaya Heading Word.
      const p = para(inlineRuns(el, { size, bold: true, color: '212121' }), options);
      if (p) out.push(p);
    };

    // Elemen bisa sekaligus judul DAN pemisah halaman (mis. "section-header page-break"):
    // sisipkan pemisah halaman, lalu tetap proses teksnya. Hanya elemen kosong yang berhenti di sini.
    if (cls.contains('page-break')) {
      out.push(new Paragraph({ children: [new PageBreak()] }));
      if (!el.textContent.trim()) return;
    }
    if (cls.contains('doc-title')) {
      heading(30, { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 120 } });
      return;
    }
    if (cls.contains('doc-subtitle')) {
      heading(24, { alignment: AlignmentType.CENTER, spacing: { after: 200 } });
      return;
    }
    if (cls.contains('section-header')) {
      heading(24, {
        heading: HeadingLevel.HEADING_2,
        shading: { fill: 'FCE4EC' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'E91E63', space: 6 } },
        spacing: { before: 240, after: 100 },
      });
      return;
    }
    if (cls.contains('sub-header')) {
      heading(BASE_SIZE, { shading: { fill: 'E3F2FD' }, spacing: { before: 160, after: 80 } });
      return;
    }
    if (tag === 'table') {
      if (cls.contains('pengesahan-table')) {
        out.push(...convertSignatureTable(el));
      } else {
        const table = convertTable(el, ctx);
        if (table) out.push(table, spacer(120));
      }
      return;
    }
    if (tag === 'ol' || tag === 'ul') {
      out.push(...convertList(el, ctx));
      return;
    }
    if (tag === 'hr') return;

    // Pembungkus (atau elemen campuran inline + blok): urai, jangan digepeng.
    if (hasBlockDescendant(el)) {
      walkBlocks(el, out, ctx);
      return;
    }

    // Paragraf biasa.
    const opts = paraOptionsFor(el);
    const runs = inlineRuns(el, {
      size: opts.size ?? ctx.size,
      bold: opts.bold || ctx.bold,
    });
    const p = para(runs, opts);
    if (p) out.push(p);
  }

  walkBlocks(container, blocks, {
    size: BASE_SIZE,
    bold: false,
    width: USABLE_WIDTH_TWIP,
    listDepth: 0,
  });

  if (!blocks.length) {
    blocks.push(new Paragraph({ children: [makeRun('(dokumen kosong)')] }));
  }
  return blocks;
}

/** Konfigurasi numbering untuk daftar berurutan & bullet. */
function numberingConfig(lib) {
  const { AlignmentType, LevelFormat, convertInchesToTwip } = lib;
  const levels = (format, textFor) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => ({
      level,
      format,
      text: textFor(level),
      alignment: AlignmentType.START,
      style: {
        paragraph: { indent: { left: convertInchesToTwip(0.3 + level * 0.25) } },
        run: { size: TABLE_SIZE, font: FONT },
      },
    }));

  return {
    config: [
      { reference: 'rpp-list', levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      {
        reference: 'rpp-bullet',
        levels: levels(LevelFormat.BULLET, (l) => (l % 2 === 0 ? '•' : '–')),
      },
    ],
  };
}

/**
 * Ubah HTML preview menjadi blob DOCX.
 * @param {string} html
 * @param {string} title
 * @returns {Promise<Blob>}
 */
export async function htmlToDocx(html, title) {
  const lib = requireDocx();
  const { Document, Packer } = lib;
  const doc = new Document({
    title,
    numbering: numberingConfig(lib),
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children: buildBlocks(html, lib) }],
  });
  return Packer.toBlob(doc);
}

/** Export satu phase ke DOCX. */
export async function exportPhaseDOCX(previewId, filename) {
  const el = document.getElementById(previewId);
  if (!el) throw new Error(`Elemen ${previewId} tidak ditemukan`);
  const doc = el.querySelector('.rpp-document') || el;
  saveAs(await htmlToDocx(doc.innerHTML, filename.replace(/\.docx$/, '')), filename);
}

/**
 * Export gabungan: judul tiap phase + konten, dipisah page break.
 * @param {Array<{id: string, label: string}>} phases
 * @param {string} [filename]
 */
export async function exportCombinedDOCX(phases, filename = 'RPP-Complete.docx') {
  const lib = requireDocx();
  const { Document, Packer, Paragraph, TextRun } = lib;
  const children = [];

  for (const { id, label } of phases) {
    const el = document.getElementById(id)?.querySelector('.rpp-document');
    if (!el) continue;
    children.push(
      new Paragraph({
        alignment: 'center',
        heading: lib.HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: label, bold: true, size: 28, font: FONT })],
        spacing: { before: 200, after: 200 },
      })
    );
    children.push(...buildBlocks(el.innerHTML, lib));
  }

  if (!children.length) throw new Error('Belum ada data untuk diekspor');

  const doc = new Document({
    title: filename.replace(/\.docx$/, ''),
    numbering: numberingConfig(lib),
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children }],
  });
  saveAs(await Packer.toBlob(doc), filename);
}

export { textContent };
