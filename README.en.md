# MDeX (macOS · Windows · Linux · Fully Offline · Tauri v2)

> **MDeX** · pronounced "em-dex" (/ˌemˈdɛks/) — the letter M followed by "dex", two syllables.

An offline-first Markdown reader & editor for **air-gapped / intranet / disconnected** use. Every file is processed locally — **no network, no uploads, no cloud sync**.

- A single self-contained HTML frontend (no Vue / React); Tauri v2 provides only the native shell (windows, menus, file dialogs).
- **Zero runtime network requests**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` and all KaTeX woff2 fonts are inlined / base64-embedded into a single `index.html`.
- Supports `.md` / `.markdown` / `.html`; can be set as the default `.md` handler — double-click to open.

> Suited for: **research / intranets / privacy protection** scenarios. No ads, no telemetry, no data upload.

---

## ✨ Features

- **Multi-tab + multi-window**: open several files at once; unsaved changes are marked with a dot, and you are asked before closing; middle-click a tab to close it. Double-clicking a `.md` opens its own window (one file per window); double-clicking a file already open **focuses that window** instead of reopening it.
- **Live split preview**: drag the divider to resize; the toolbar button cycles Split / Editor / Preview.
- **Click-to-position**: click in the editor to scroll the preview; click in the preview to jump the cursor in the editor.
- **Search & replace**: find, replace one or all, with match count.
- **Math**: inline `$…$` and block `$$…$$` (also `\(...\)`, `\[...\]`), rendered by KaTeX; long equations wrap at operators or auto-shrink.
- **Code highlighting**: language auto-detected; large docs lazy-highlight by viewport to stay smooth.
- **Mermaid diagrams**: a ` ```mermaid ` block renders as flowchart / sequence / class / state / Gantt / pie, etc.
- **Images**: paste / drop / pick — auto-embedded as base64; relative local paths also work; images are centered by default.
- **Tables**: GFM tables; narrow tables are centered to content, wide ones scroll horizontally without clipping.
- **Citations (BibTeX)**: `[@key]` / `\cite{key}` syntax, numeric style; a References list is generated at the end, with two-way jumps between in-text `[n]` and the entry; supports an embedded ` ```bibtex ` block or a separately loaded `.bib`.
- **HTML support**: open `.html` files for rendering; convert between HTML and Markdown.
- **Theme / language**: dark / light, **11 UI languages** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — Arabic auto right-to-left).
- **Auto-draft**: content is saved periodically and restored after an unexpected close / crash.
- **Word count**: the status bar shows characters / lines / words live, plus the current row & column.
- **Drag-and-drop**: drop a `.md` file onto the window to open it; drop an image to insert it.
- **Export**: save as Markdown / HTML / PDF (vector + raster) / LaTeX.

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

> With multiple windows open, shortcuts only affect the focused window.

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
- **PDF raster**: generates a PDF file directly (no dialog), with low / medium / high resolution; paginated at block boundaries (no broken equations / headings / code).
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
Grab the installer for your platform from [Releases](./): macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe` / `.msi`), Linux (`.deb` / `.AppImage`).

### Opening the unsigned app on macOS (bypass Gatekeeper)
This app is not developer-signed / notarized (offline scenarios usually can't notarize online). The first launch is blocked — pick one:

- **CLI (recommended)**: drag `.app` into Applications, then
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI**: in Finder, right-click the `.app` → "Open" → "Open" again in the dialog; or "System Settings → Privacy & Security" → scroll down → "Open Anyway".

---

## 🛠️ Build from source

### One-time setup (macOS)
```bash
xcode-select --install                       # Xcode command-line tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # both needed for universal
npm install                                  # Tauri CLI
npm run fetch                                # download frontend deps into vendor/ (online only here)
```

### Local development
```bash
npm run tauri dev        # builds dist/index.html, then launches the app window
```

### Build
```bash
# Apple Silicon only (faster)
npm run tauri build

# Universal binary (Apple Silicon + Intel, for distribution)
npm run tauri build -- --target universal-apple-darwin
```

Output:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / cross-platform
- **Native Windows build** (produces an NSIS `.exe` installer): see [BUILD-WINDOWS.md](./BUILD-WINDOWS.md).
- **Linux / macOS Intel / other cross-platform**: see [BUILD-CROSS.md](./BUILD-CROSS.md).

The frontend `dist/index.html` needs no changes across platforms; just adjust bundling on the target OS (`tauri.conf.json` `bundle.targets` adds `nsis` / `deb` / `appimage`, plus system deps like WebView2 / webkit2gtk).

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

- Full license text: [LICENSE](./LICENSE).
- Third-party component notices: [NOTICE](./NOTICE) (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser and Tauri, etc., each under MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).
- Under Apache-2.0, redistribution must retain LICENSE and NOTICE and indicate changes in modified files.

---

## 📬 Contact

For problems or suggestions: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
