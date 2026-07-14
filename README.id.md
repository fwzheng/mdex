<details>
<summary><b>🌐 Bahasa: Bahasa Indonesia</b> — klik untuk memilih bahasa lain</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · **[Bahasa Indonesia](README.id.md)** · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.3.0 (macOS · Windows · Linux · Sepenuhnya Luring · Tauri v2)

> **MDeX** · diucapkan "em-dex" (/ˌemˈdɛks/) — huruf M diikuti "dex", dua suku kata.

Pembaca & editor Markdown yang mengutamakan mode luring untuk penggunaan **air-gapped / intranet / terputus**. Setiap file diproses secara lokal — **tanpa jaringan, tanpa unggahan, tanpa sinkronisasi cloud**.

- Frontend HTML mandiri tunggal (tanpa Vue / React); Tauri v2 hanya menyediakan shell native (jendela, menu, dialog file).
- **Nol permintaan jaringan saat runtime**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` dan semua font woff2 KaTeX di-inline / disematkan sebagai base64 ke dalam satu `index.html`.
- Mendukung `.md` / `.markdown` / `.html`; dapat dijadikan penangan default `.md` — klik ganda untuk membuka.

> Cocok untuk: skenario **riset / intranet / perlindungan privasi**. Tanpa iklan, tanpa telemetri, tanpa unggahan data.

---

## 🌐 Bahasa

Antarmuka tersedia dalam **17 bahasa**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Beralih kapan saja dari menu bahasa di toolbar; pilihan Anda diingat antar-sesi.
- **Arab dan Urdu dirender kanan-ke-kiri (RTL)** secara otomatis — teks badan, heading, penanda daftar, dan seluruh toolbar tercermin ke kanan; blok kode yang disematkan, matematika LaTeX, istilah bahasa Inggris, dan nomor versi tetap kiri-ke-kanan, tidak pernah dicerminkan.
- README ini sendiri diterjemahkan ke dalam semua 17 bahasa — gunakan pemilih di bagian paling atas halaman ini.

---

## ✨ Fitur

- **Multi-tab + multi-jendela**: buka beberapa file sekaligus; perubahan yang belum disimpan ditandai dengan titik, dan Anda ditanya sebelum menutup; klik tengah tab untuk menutupnya. Klik ganda pada `.md` membuka jendelanya sendiri (satu file per jendela); klik ganda pada file yang sudah terbuka **fokus ke jendela tersebut** alih-alih membukanya ulang.
- **Pratinjau belah langsung**: seret pembatas untuk mengubah ukuran; tombol toolbar berputar antara Belah / Editor / Pratinjau.
- **Klik-untuk-posisi**: klik di editor untuk menggulir pratinjau; klik di pratinjau untuk melompatkan kursor di editor.
- **Cari & ganti**: temukan, ganti satu atau semua, dengan jumlah cocok.
- **Matematika**: inline `$…$` dan blok `$$…$$` (juga `\(...\)`, `\[...\]`), dirender oleh KaTeX; persamaan panjang berpindah baris pada operator atau menyusut otomatis.
- **Penyorotan kode**: bahasa dideteksi otomatis; dokumen besar disorot malas berdasarkan viewport agar tetap mulus.
- **Diagram Mermaid**: blok ` ```mermaid ` dirender sebagai flowchart / sequence / class / state / Gantt / pie, dll.; klik diagram untuk membuka jendela penampil mandiri (zoom / pan / layar penuh) yang diperbarui langsung saat Anda menyunting.
- **Gambar**: tempel / jatuhkan / pilih — disimpan ke folder `<namaberkas>_images/` di samping dokumen dengan referensi relatif yang bersih (tanpa base64 inline); draf menggunakan folder temporer yang dimigrasi saat menyimpan; «Simpan Sebagai» meratakan gambar ke target; dipusatkan secara default.
- **Zoom font**: zoom font editor dan pratinjau secara independen (kontrol −/persen/+, atau `⌘/Ctrl + =/−/0`); bertahan saat mulai ulang.
- **Tabel**: tabel GFM; tabel sempit dipusatkan ke konten, tabel lebar digulir horizontal tanpa pemotongan.
- **Kutipan (BibTeX)**: sintaks `[@key]` / `\cite{key}`, gaya numerik; daftar Referensi dibuat di akhir, dengan lompatan dua arah antara `[n]` dalam teks dan entri; mendukung blok ` ```bibtex ` yang disematkan atau `.bib` yang dimuat terpisah.
- **Dukungan HTML**: buka file `.html` untuk rendering; konversi antara HTML dan Markdown.
- **Tema / bahasa**: gelap / terang, **17 bahasa UI** (English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — Arab dan Urdu otomatis kanan-ke-kiri).
- **Draf otomatis**: konten disimpan secara berkala dan dipulihkan setelah penutupan tak terduga / crash.
- **Hitung kata**: status bar menampilkan karakter / baris / kata secara langsung, plus baris & kolom saat ini.
- **Seret-dan-jatuhkan**: jatuhkan file `.md` ke jendela untuk membukanya; jatuhkan gambar untuk menyisipkannya.
- **Ekspor**: simpan sebagai Markdown / HTML / PDF (vektor + raster) / LaTeX.
- **Warna teks**: palet pada bilah alat membungkus seleksi dalam `<span style="color:…">`.
- **Mundur / Maju**: riwayat terpadu lintas dokumen dan posisi kursor; tombol ◀ ▶, `Alt+←/→`.
- **Ikuti tautan**: klik tautan di pratinjau membuka target di tab baru (http di peramban sistem); dokumen saat ini tidak diganti.

---

## ⌨️ Pintasan

Gunakan `⌘` di macOS, `Ctrl` di Windows / Linux.

| Pintasan | Aksi |
| --- | --- |
| `⌘/Ctrl + N` | Baru |
| `⌘/Ctrl + O` | Buka file |
| `⌘/Ctrl + S` | Simpan |
| `⌘/Ctrl + Shift + S` | Simpan Sebagai |
| `⌘/Ctrl + W` | Tutup tab |
| `⌘/Ctrl + Shift + W` | Tutup jendela |
| `⌘/Ctrl + F` | Cari |
| `⌘/Ctrl + H` | Ganti |
| `⌘/Ctrl + B` / `I` / `E` | Tebal / Miring / Kode inline |
| `⌘/Ctrl + K` | Sisipkan tautan |
| `Tab` | Indentasi 2 spasi |
| `Alt/Option + drag` | Pilihan persegi (kolom) |
| `Alt/Option + Shift + ←↑↓→` | Perluas pilihan kolom |
| `Esc` | Batalkan pilihan kolom |
| `⌘/Ctrl + =/−/0` | Zoom panel terakhir yang diklik (editor atau pratinjau): perbesar / perkecil / reset |

> Dengan beberapa jendela terbuka, pintasan hanya memengaruhi jendela yang difokuskan. Ketika jendela penampil gambar terbuka, `⌘/Ctrl + =/−/0` memperbesar gambar.

---

## 📝 Lembar contekan

**Markdown**: heading `# / ## / ###`, tebal `**text**`, miring `*text*`, coret `~~text~~`, kode inline `` `code` ``, blok kode (triple backticks, dengan bahasa opsional), kutipan `> text`, daftar `- / 1.`, daftar tugas `- [ ] / - [x]`, tautan `[text](url)`, gambar `![alt](url)`, pembatas `---`, tabel `| A | B |`.

**Matematika**: inline `$E = mc^2$`; blok `$$\int_0^1 x\,dx$$` (dapat mencakup beberapa baris). Menggunakan sintaks LaTeX, dirender oleh KaTeX; `$` di dalam blok kode tidak diperlakukan sebagai pembatas matematika. Mendukung `align` / `aligned`, matriks, `cases` dan environment umum lainnya.

**Kutipan**: tulis `[@key]` atau `[@a; @b]` dalam teks (kompatibel LaTeX `\cite{key}`), sematkan pustaka melalui blok ` ```bibtex ` atau muat `.bib` dengan tombol "Refs". Daftar Referensi dibuat di akhir; `[n]` dalam teks dapat diklik.

---

## 📤 Ekspor (Simpan Sebagai)

Klik "Save As" dan pilih format:

- **Markdown (.md)**: simpan sumber dan perbarui nama / path tab saat ini.
- **HTML (.html)**: HTML mandiri dengan CSS yang di-inline + penyorotan kode; matematika dipertahankan sebagai literal `$…$`, dirender otomatis oleh KaTeX yang di-inline.
- **PDF vektor**: dialog cetak sistem, keluaran vektor, tajam pada zoom apa pun. Pilih "Save as PDF".
- **PDF raster**: menghasilkan file PDF secara langsung (tanpa dialog), dengan resolusi rendah / sedang / tinggi; dipaginasi pada batas blok (tidak ada persamaan / heading / kode yang rusak).
- **LaTeX (.tex)**: dikonversi ke sumber `.tex` yang dapat dikompilasi (dengan documentclass dan paket; matematika dipertahankan apa adanya). Mengekspor salinan.

---

## 🔒 Luring & keamanan

- **Nol permintaan jaringan saat runtime.** Keluaran build `dist/index.html` diperiksa sendiri: tidak ada tautan eksternal `src=` / `href=` / `url()` / `@import`.
- CSP ketat (hanya IPC lokal, tanpa WAN); semua file dibaca/ditulis secara lokal, tidak ada yang diunggah.
- Verifikasi: matikan Wi-Fi / cabut kabel dan luncurkan — matematika, gambar, penyorotan kode, dan Mermaid semuanya berfungsi.
- `dist/index.html` masih menampilkan sekitar belasan string `https://github.com/…`; semuanya berada di dalam **komentar lisensi / sumber** dari `marked` / `highlight.js` dll. — teks biasa yang **tidak pernah memicu permintaan**; dibiarkan utuh untuk menghormati lisensi open-source.

---

## 📦 Instalasi

### Unduhan prebuilt
Unduh installer untuk platform Anda dari salah satu sumber:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Situs cermin**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### Membuka aplikasi yang tidak ditandatangani di macOS (lewati Gatekeeper)

Aplikasi ini **tidak** ditandatangani pengembang / dinotarisasi (skenario luring biasanya tidak dapat menotarisasi secara online). Di macOS 12+, **terutama macOS 26 (Tahoe)**, meluncurkannya langsung dari `.dmg` — atau build yang baru disalin — gagal dengan **"MDeX.app is damaged and can't be opened."** Itu Gatekeeper, bukan kerusakan nyata. Perbaiki di Terminal:

1. **Seret `MDeX.app` dari `.dmg` ke `/Applications` terlebih dahulu** — jangan pernah menjalankannya langsung dari dmg (itu memicu App Translocation dan atribut `com.apple.provenance`, penyebab nyata "damaged" di macOS 26).
2. Hapus atribut dan tanda tangani ulang:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` dilindungi SIP dan **tidak dapat** dihapus bahkan dengan `sudo`; penandatanganan ulang mengatur ulang tanda tangan sehingga Gatekeeper membiarkannya berjalan. `spctl` masih melaporkan `rejected` untuk penandatanganan ad-hoc — diharapkan, dan itu **tidak** memblokir `open`.
3. Luncurkan dengan `open /Applications/MDeX.app` (atau klik ganda). Peluncuran pertama mungkin masih meminta sekali — konfirmasi melalui **System Settings → Privacy & Security → Open Anyway**, atau klik kanan aplikasi → **Open**.

---

## 🛠️ Build dari sumber

Kode sumber: <https://github.com/fwzheng/mdex>. Ikuti instruksi build di repositori (setup, dependensi, dan perintah didokumentasikan di sana).

---

## 📁 Struktur proyek

```
markdown/
├── app-shell.html          # frontend source (HTML+CSS+JS, all app logic)
├── tools/
│   ├── fetch-vendor.mjs    # one-time: download deps into vendor/ (online only here)
│   └── build-html.mjs      # inline vendor into dist/index.html (KaTeX fonts → base64)
├── dist/index.html         # build output: fully offline single file (Tauri frontendDist)
├── vendor/                 # download cache (.gitignore)
├── package.json            # @tauri-apps/cli + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # 1200×750 window, strict CSP, icons, .md association, menu hooks
    ├── capabilities/default.json
    ├── icons/              # full icon set from `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + file IO + multi-window routing
```

---

## 🎨 Kustomisasi

| Untuk mengubah | Di mana |
| --- | --- |
| Nama aplikasi / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Ukuran jendela | `tauri.conf.json` → `app.windows[0]` (default 1200×750) |
| Ikon | ganti gambar sumber, lalu `npm run icon` |
| Warna tema / font | variabel CSS `:root` di bagian atas `app-shell.html` |
| Item menu | `build_menu()` di `src-tauri/src/lib.rs` |
| String UI / dokumen bantuan | `I18N` / `HELP_STRINGS` di `app-shell.html` |
| Versi dependensi | `VERSIONS` di bagian atas `tools/fetch-vendor.mjs` (lalu `npm run fetch -- --force`) |

---

## 📄 Lisensi

Kode milik proyek ini bersifat open-source di bawah **Apache License 2.0**.

Komponen pihak ketiga: proyek ini menggunakan sejumlah komponen pihak ketiga (termasuk namun tidak terbatas pada marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser, dan Tauri, dll.); peringatan hak cipta dan lisensi masing-masing dijabarkan dalam berkas sumber terkait. Komponen-komponen tersebut masing-masing berlisensi MIT, BSD-3-Clause, Apache-2.0, MPL-2.0, dan lisensi sumber terbuka lainnya.

Persyaratan distribusi: berdasarkan lisensi Apache-2.0, mendistribusikan ulang proyek ini wajib menyertakan berkas LICENSE dan NOTICE; jika Anda memodifikasi berkas sumber, Anda harus menandai perubahan secara jelas pada berkas yang bersangkutan.

---

## 📬 Kontak

Untuk masalah atau saran: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
