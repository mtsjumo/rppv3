/**
 * Jaring pengaman untuk keluaran AI yang tidak rapi.
 *
 * Prompt sudah meminta semua rumus dibungkus `\( ... \)` / `\[ ... \]`, tetapi
 * model (terutama yang kecil/gratis) sesekali lupa. Tanpa pembungkus, `\frac{1}{2}`
 * atau `x^2` tampil sebagai teks mentah di dokumen. Modul ini membungkus
 * HANYA ekspresinya (bukan seluruh kalimat) supaya renderer bisa memutuskan:
 * teks Unicode untuk yang ringan, gambar untuk yang bertingkat.
 *
 * Aturan keras: tidak menyentuh apa pun yang sudah berada di dalam delimiter,
 * dan tidak membungkus prosa biasa.
 */

import { GREEK, SYMBOLS } from './latex-commands.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Jumlah argumen `{...}` yang dibutuhkan tiap perintah struktural. */
const ARG_COUNT = {
  frac: 2,
  dfrac: 2,
  tfrac: 2,
  cfrac: 2,
  binom: 2,
  sqrt: 1,
  overline: 1,
  underline: 1,
  vec: 1,
  hat: 1,
  bar: 1,
  ce: 1,
  sum: 0,
  prod: 0,
  int: 0,
  lim: 0,
};

/** Area yang sudah berdelimiter — jangan diubah. */
const EXISTING_MATH_RE = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g;

/**
 * Pangkat/indeks polos: `x^2`, `10^{-3}`, `cm^3`, `H_2`, `CO_2`, `v_{0}`.
 * Indeks bawah (`_`) hanya untuk basis pendek (1–3 huruf) yang berdiri sendiri, dan tidak
 * untuk nama berkas/URL (`materi_2`, `data_1.xlsx`, `/a_1`).
 */
const SCRIPT_SUP = String.raw`(?:\{[^{}]{1,12}\}|-?\d{1,3}|[nx])`;
const SCRIPT_SUB = String.raw`(?:\{[^{}]{1,12}\}|\d{1,3})`;
const BARE_SCRIPT_RE = new RegExp(
  String.raw`(?<![\\A-Za-z0-9_/.])(?:[A-Za-z0-9]+\^${SCRIPT_SUP}|[A-Za-z]{1,3}_${SCRIPT_SUB})(?:\^${SCRIPT_SUP}|_${SCRIPT_SUB})*(?!\.[A-Za-z]{2,4}\b)`,
  'g'
);

/** Indeks setelah `{` yang membuka grup seimbang, atau -1. */
function skipGroup(s, i) {
  if (s[i] !== '{') return -1;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return k + 1;
  }
  return -1;
}

const skipSpaces = (s, i) => {
  let k = i;
  while (s[k] === ' ') k++;
  return k;
};

/** Lewati argumen perintah: `[opsi]` (mis. akar pangkat n) lalu `count` grup `{...}`. */
function skipArgs(s, i, count) {
  let k = skipSpaces(s, i);
  if (s[k] === '[') {
    const close = s.indexOf(']', k);
    if (close < 0) return -1;
    k = close + 1;
  }
  for (let n = 0; n < count; n++) {
    k = skipGroup(s, skipSpaces(s, k));
    if (k < 0) return -1;
  }
  return k;
}

/** Lewati rangkaian `^x` / `_{..}` yang menempel pada ekspresi. */
function skipScripts(s, i) {
  let k = i;
  while (s[k] === '^' || s[k] === '_') {
    let next = -1;
    if (s[k + 1] === '{') {
      next = skipGroup(s, k + 1);
    } else {
      const m = /^(?:\\[A-Za-z]+|[A-Za-z0-9+-])/.exec(s.slice(k + 1));
      if (m) next = k + 1 + m[0].length;
    }
    if (next < 0) break;
    k = next;
  }
  return k;
}

const wrap = (expr) => `\\(${expr}\\)`;

/** Bungkus pangkat/indeks polos pada teks di antara perintah. */
const wrapScripts = (text) => text.replace(BARE_SCRIPT_RE, wrap);

/** Bungkus perintah LaTeX dan pangkat/indeks polos pada teks yang berada di luar delimiter. */
function wrapOutsideMath(seg) {
  const cmdRe = /\\([A-Za-z]+)/g;
  let out = '';
  let pos = 0;
  let m;
  while ((m = cmdRe.exec(seg)) !== null) {
    if (m.index < pos) continue;
    const name = m[1];
    const structural = own(ARG_COUNT, name);
    if (!structural && !own(GREEK, name) && !own(SYMBOLS, name)) continue;

    let end = m.index + m[0].length;
    if (structural) {
      end = skipArgs(seg, end, ARG_COUNT[name]);
      if (end < 0) continue; // kurung tak seimbang — biarkan apa adanya
    }
    end = skipScripts(seg, end);

    out += wrapScripts(seg.slice(pos, m.index)) + wrap(seg.slice(m.index, end));
    pos = end;
    cmdRe.lastIndex = end;
  }
  return out + wrapScripts(seg.slice(pos));
}

/**
 * Bungkus LaTeX yang lupa diberi delimiter dalam satu baris teks.
 * Baris tabel Markdown (mengandung `|`) dilewati: sel-selnya diproses satu per
 * satu oleh pemanggil, sehingga pemisah kolom tidak pernah tersentuh.
 *
 * @param {string} line
 * @returns {string}
 */
export function wrapInlineBareMath(line) {
  if (line.includes('|') || !/[\\^_]/.test(line)) return line;

  let out = '';
  let last = 0;
  for (const m of line.matchAll(EXISTING_MATH_RE)) {
    out += wrapOutsideMath(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + wrapOutsideMath(line.slice(last));
}

// ---------------------------------------------------------------------------
// Kimia: \ce{...} (mhchem) tidak didukung CodeCogs → tulis sebagai teks Unicode
// ---------------------------------------------------------------------------

const SUP = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
  '+': '⁺',
  '-': '⁻',
};
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

const mapChars = (str, table) => [...str].map((ch) => table[ch] ?? ch).join('');

/**
 * Ubah isi `\ce{...}` menjadi teks: `2H2 + O2 -> 2H2O` → `2H₂ + O₂ → 2H₂O`,
 * `SO4^2-` → `SO₄²⁻`. Koefisien di depan tetap angka biasa.
 * @param {string} body
 * @returns {string}
 */
export function chemToUnicode(body) {
  return String(body)
    .replace(/<=>|<->/g, '⇌')
    .replace(/->/g, '→')
    .replace(/\^\{?([0-9]*[+-])\}?/g, (_, ion) => mapChars(ion, SUP))
    .replace(/([A-Za-z)\]])(\d+)/g, (_, base, n) => base + mapChars(n, SUB));
}
