<details>
<summary><b>🌐 Language: English</b> — click to choose another language</summary>

**[English](README.md)** · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.3.4 (macOS · Windows · Linux · Fully Offline · Tauri v2)

> **MDeX** · pronounced "em-dex" (/ˌemˈdɛks/) — the letter M followed by "dex", two syllables.

An offline-first Markdown reader & editor for **air-gapped / intranet / disconnected** use. Every file is processed locally — **no network, no uploads, no cloud sync, no ads, no telemetry, no data uploads**.

- A single self-contained HTML frontend (no Vue / React); Tauri v2 provides only the native shell (windows, menus, file dialogs).
- **Zero runtime network requests**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` and all KaTeX woff2 fonts are inlined / base64-embedded into a single `index.html`.
- Supports `.md` / `.markdown` / `.html`; can be set as the default `.md` handler — double-click to open.


---

## 🌐 Languages

The interface ships in **17 languages**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Switch at any time from the toolbar's language menu; your choice is remembered across sessions.
- **Arabic is rendered right-to-left (RTL)** automatically — body text, headings, list markers and the whole toolbar mirror to the right; embedded code blocks, LaTeX math, English terms and version numbers stay left-to-right, never mirrored.
- This README is itself translated into all 17 languages — use the selector at the very top of this page.

---

## ✨ Features

- **Multi-tab + multi-window**: open several files at once; unsaved changes are marked with a dot, and you are asked before closing; middle-click a tab to close it. Double-clicking a `.md` opens its own window (one file per window); double-clicking a file already open **focuses that window** instead of reopening it.
- **Live split preview**: drag the divider to resize; the toolbar button cycles Split / Editor / Preview.
- **Click-to-position**: click in the editor to scroll the preview; click in the preview to jump the cursor in the editor.
- **Search & replace**: find, replace one or all, with match count.
- **Math**: inline `$…$` and block `$$…$$` (also `\(...\)`, `\[...\]`), rendered by KaTeX; long equations wrap at operators or auto-shrink.
- **Code highlighting**: language auto-detected; large docs lazy-highlight by viewport to stay smooth.
- **Mermaid diagrams**: a ` ```mermaid ` block renders as flowchart / sequence / class / state / Gantt / pie, etc.; click a diagram to open a standalone zoom / pan / fullscreen viewer window that updates live as you edit.
- **Images**: paste / drop / pick — saved to a `<filename>_images/` folder next to the doc with a clean relative reference (no inline base64); drafts use a temp folder migrated on save; Save As flattens images into the target; centered by default.
- **Font zoom**: zoom the editor and preview fonts independently (−/percentage/+ controls, or `⌘/Ctrl + =/−/0`); persists across restarts.
- **Tables**: GFM tables; narrow tables are centered to content, wide ones scroll horizontally without clipping.
- **Citations (BibTeX)**: `[@key]` / `\cite{key}` syntax, numeric style; a References list is generated at the end, with two-way jumps between in-text `[n]` and the entry; supports an embedded ` ```bibtex ` block or a separately loaded `.bib`.
- **HTML support**: open `.html` files for rendering; convert between HTML and Markdown.
- **Theme / language**: dark / light, **17 UI languages** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — Arabic & Urdu auto right-to-left).
- **Auto-draft**: content is saved periodically and restored after an unexpected close / crash.
- **Word count**: the status bar shows characters / lines / words live, plus the current row & column.
- **Drag-and-drop**: drop a `.md` file onto the window to open it; drop an image to insert it.
- **Export**: save as Markdown / HTML / PDF (vector) / LaTeX.
- **Text color**: toolbar palette wraps the selection in `<span style="color:…">`.
- **Back / Forward**: unified history across documents and cursor positions; ◀ ▶ buttons, `Alt+←/→`.
- **Follow links**: click a link in the preview to open the target in a new tab (http links in the system browser); the current document is never replaced.

---

## ⌨️ Shortcuts

Use `⌘` on macOS, `Ctrl` on Windows / Linux.

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + N` | New |
| `⌘/Ctrl + O` | Open file |
| `⌘/Ctrl + S` | Save |
| `⌘/Ctrl + Shift + S` | Save As |
| `⌘/Ctrl + W` | Close tab |
| `⌘/Ctrl + Shift + W` | Close window |
| `⌘/Ctrl + F` | Find |
| `⌘/Ctrl + H` | Replace |
| `⌘/Ctrl + B` / `I` / `E` | Bold / Italic / Inline code |
| `⌘/Ctrl + K` | Insert link |
| `Tab` | Indent 2 spaces |
| `Alt/Option + drag` | Rectangular (column) select |
| `Alt/Option + Shift + ←↑↓→` | Extend column select |
| `Esc` | Cancel column select |
| `⌘/Ctrl + =/−/0` | Zoom the last-clicked pane (editor or preview) in / out / reset |

> With multiple windows open, shortcuts only affect the focused window. When the image viewer window is open, `⌘/Ctrl + =/−/0` zooms the image instead.

---

## 📝 Cheat sheet

**Markdown**: headings `# / ## / ###`, bold `**text**`, italic `*text*`, strikethrough `~~text~~`, inline code `` `code` ``, code blocks (triple backticks, with optional language), quote `> text`, lists `- / 1.`, task list `- [ ] / - [x]`, link `[text](url)`, image `![alt](url)`, divider `---`, tables `| A | B |`.

**Math**: inline `$E = mc^2$`; block `$$\int_0^1 x\,dx$$` (may span lines). Uses LaTeX syntax, rendered by KaTeX; `$` inside code blocks is not treated as a math delimiter. Supports `align` / `aligned`, matrices, `cases` and other common environments.

**Citations**: write `[@key]` or `[@a; @b]` in the text (LaTeX-compatible `\cite{key}`), embed the library via a ` ```bibtex ` block or load a `.bib` with the "Refs" button. A References list is generated at the end; in-text `[n]` is clickable.

---

## 📤 Export (Save As)

Click "Save As" and pick a format:

- **Markdown (.md)**: save the source and update the current tab's name / path.
- **HTML (.html)**: self-contained HTML with inlined CSS + code highlighting; math kept as `$…$` literal, auto-rendered by inlined KaTeX.
- **PDF vector**: system print dialog, vector output, crisp at any zoom. Choose "Save as PDF".
- **LaTeX (.tex)**: converted to a compilable `.tex` source (with documentclass and packages; math kept as-is). Exports a copy.

---

## 🔒 Offline & security

- **Zero runtime network requests.** The build output `dist/index.html` is self-checked: no `src=` / `href=` / `url()` / `@import` external links.
- Strict CSP (local IPC only, no WAN); all files are read/written locally, nothing uploaded.
- Verify: turn off Wi-Fi / unplug the cable and launch — math, images, code highlighting and Mermaid all work.
- `dist/index.html` still shows ~a dozen `https://github.com/…` strings; these all live inside **license / source comments** of `marked` / `highlight.js` etc. — plain text that **never triggers a request**; left intact to respect the open-source licenses.

---

## 📦 Installation

### Prebuilt downloads
Download the installer for your platform from either source:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Mirror site**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### Opening the unsigned app on macOS (bypass Gatekeeper)

This app is **not** developer-signed / notarized (offline scenarios usually can't notarize online). On macOS 12+, **especially macOS 26 (Tahoe)**, launching it straight from the `.dmg` — or a freshly copied build — fails with **"MDeX.app is damaged and can't be opened."** That's Gatekeeper, not real damage. Fix in Terminal:

1. **Drag `MDeX.app` out of the `.dmg` into `/Applications` first** — never run it directly from the dmg (that triggers App Translocation and the `com.apple.provenance` attribute, the real cause of "damaged" on macOS 26).
2. Clear attributes and re-sign:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` is SIP-protected and **can't** be removed even with `sudo`; re-signing resets the signature so Gatekeeper lets it run. `spctl` still reports `rejected` for ad-hoc signing — expected, and it does **not** block `open`.
3. Launch with `open /Applications/MDeX.app` (or double-click). The first launch may still prompt once — confirm via **System Settings → Privacy & Security → Open Anyway**, or right-click the app → **Open**.

---

## 🛠️ Build from source

Source code: <https://github.com/fwzheng/mdex>. Please follow the build instructions in the repository (one-time setup, dependencies, and build commands are documented there).

---

## 📁 Project structure

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

## 🎨 Customization

| To change | Where |
| --- | --- |
| App name / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Window size | `tauri.conf.json` → `app.windows[0]` (default 1200×750) |
| Icons | replace the source image, then `npm run icon` |
| Theme colors / fonts | `:root` CSS variables atop `app-shell.html` |
| Menu items | `build_menu()` in `src-tauri/src/lib.rs` |
| UI strings / help doc | `I18N` / `HELP_STRINGS` in `app-shell.html` |
| Dependency versions | `VERSIONS` atop `tools/fetch-vendor.mjs` (then `npm run fetch -- --force`) |

---

## 📄 License

This project's own code is open-sourced under the **Apache License 2.0**.

Third-party components: the project uses some third-party components (including but not limited to marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser, and Tauri, etc.); their copyright and license notices are detailed in the respective source files. These components are respectively licensed under MIT, BSD-3-Clause, Apache-2.0, MPL-2.0, and other open-source licenses.

Distribution requirements: under the Apache-2.0 license, redistributing this project requires retaining the LICENSE and NOTICE files; if you modify any source file, you must clearly indicate the changes in the corresponding file.

---

## 📬 Contact

For problems or suggestions: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
