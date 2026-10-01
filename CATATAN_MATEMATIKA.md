# Catatan: Render Matematika (rpp-gen-v3)

Dokumen ini merangkum perbaikan render rumus dan tabel, serta yang belum diverifikasi.

## Akar masalah

1. **Arahan ke AI tidak konsisten.** Aturan sebelumnya meminta AI memilah sendiri mana rumus "sederhana" (teks Unicode) dan mana yang "struktural" (LaTeX). Model kecil menjawab campur: `\frac` tanpa pembungkus, `x^2` polos, `H2O`. Renderer hanya mengenali rumus yang berdelimiter, sehingga sisanya tampil sebagai teks mentah. Phase 3 (Media) bahkan hanya punya satu baris aturan.
2. **Backslash tunggal di JSON.** `\frac`, `\times`, `\neq`, `\beta`, `\right` lolos `JSON.parse` sebagai karakter kontrol; `\(`, `\sqrt`, `\underline` membuat parse gagal.
3. **`\ce{}` (mhchem)** tidak didukung CodeCogs.
4. **Opsi `a = 3`** terpecah menjadi label `a` dan rumus `= 3`.
5. Rumus display memakai `\inline`, sehingga pecahan tampil mengecil.

## Perbaikan

| Lapisan            | Berkas                                                       | Perubahan                                                                                                                                              |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt             | `src/prompts/base.js`, `phase1.js`, `phase2.js`, `phase3.js` | Satu aturan: bungkus SEMUA rumus dengan `\(...\)` / `\[...\]`; contoh JSON berbackslash ganda; Phase 3 kini memuat aturan notasi dan mutu isi          |
| Keputusan tampilan | `src/services/latex.js`                                      | Renderer memutuskan: rumus ringan menjadi teks Unicode, rumus bertingkat menjadi gambar                                                                |
| Jaring pengaman    | `src/services/latex-repair.js` (baru)                        | Membungkus ekspresi yang lupa dibungkus (`\frac{..}{..}`, `\pi`, `x^2`, `H_2`), tanpa menyentuh prosa, harga, nama berkas, URL, atau area berdelimiter |
| Kimia              | `latex-repair.js`, `latex.js`                                | `\ce{2H2 + O2 -> 2H2O}` menjadi `2H₂ + O₂ → 2H₂O`                                                                                                      |
| JSON               | `src/services/json.js`                                       | `repairJsonEscapes` memindai per karakter; JSON yang sudah benar tidak diubah                                                                          |
| Tabel/daftar       | `src/render/html-helpers.js`                                 | Tabel Markdown dikenali di sel, item daftar, dan deskripsi; item `{pihak, peran}`, `{aspek, detail}`, `{tahap, tools}` tidak lagi kosong               |

## Tes (lulus 39/39 di container)

`tests/math-safety-net.test.js`, `tests/math-safety-net-files.test.js`, serta `latex.test.js` dan `html-helpers.test.js` yang sudah ada. Satu tes lama diperbarui: bila `\frac{1}{2}` muncul di tengah kalimat, ekspresinya kini dibungkus dan kalimatnya tetap utuh.

## Belum diverifikasi

- Yang dijalankan hanya tes di atas, di container terpisah. `npm run check` penuh (lint, format, smoke jsdom, hygiene, build) belum dijalankan di mesin Anda. Jalankan `npm run format` lalu `npm run check`.
- Lapisan ekspor (DOCX, PDF, HTML mandiri) tidak diubah dan tidak diuji. Gambar rumus bertingkat tetap berasal dari CodeCogs, jadi butuh internet saat ekspor dan saat dilihat.
- Perilaku model nyata belum diukur. Prompt baru perlu dicoba dengan beberapa model (termasuk Puter) pada materi berumus, misalnya pecahan, persamaan kuadrat, dan reaksi kimia.
- Soal C3 ke atas kini diminta berbasis stimulus (di `prompts/phase1.js`). Pantau apakah `TOKEN_LIMITS['1c']` masih cukup.

## Langkah berikutnya

1. Uji manual dengan materi matematika dan kimia; hitung berapa rumus yang masih tampil mentah.
2. Bila CodeCogs menjadi hambatan (jaringan sekolah), pertimbangkan merender rumus bertingkat secara lokal dengan KaTeX, dan sesuaikan ekspor DOCX.
