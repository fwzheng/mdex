<details>
<summary><b>🌐 Sprache: Deutsch</b> — klicken, um eine andere Sprache zu wählen</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · **[Deutsch](README.de.md)** · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md)

</details>


# MDeX (macOS · Windows · Linux · vollständig offline · Tauri v2)

> **MDeX** · ausgesprochen „em-dex" (/ˌemˈdɛks/) — der Buchstabe M gefolgt von „dex", zwei Silben.

Ein offline-orientierter Markdown-Reader & Editor für den **Air-Gap-/Intranet-/Getrennt-Betrieb**. Jede Datei wird lokal verarbeitet — **kein Netzwerk, keine Uploads, keine Cloud-Synchronisation**.

- Ein einzelnes, in sich geschlossenes HTML-Frontend (ohne Vue / React); Tauri v2 stellt lediglich die native Hülle bereit (Fenster, Menüs, Dateidialoge).
- **Keine einzigen Netzwerk-Anfragen zur Laufzeit**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` sowie sämtliche KaTeX-woff2-Fonts sind inline / base64-eingebettet in einer einzigen `index.html`.
- Unterstützt `.md` / `.markdown` / `.html`; kann als Standard-Handler für `.md` eingerichtet werden — per Doppelklick öffnen.

> Geeignet für: Szenarien in **Forschung / Intranets / Datenschutz**. Keine Werbung, keine Telemetrie, kein Daten-Upload.

---

## 🌐 Languages

Die Benutzeroberfläche wird in **11 Sprachen** ausgeliefert: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية.

- Jederzeit über das Sprachmenü der Symbolleiste umschalten; Ihre Wahl wird über Sitzungen hinweg gespeichert.
- **Arabisch wird automatisch rechts-nach-links (RTL) gerendert** — Fließtext, Überschriften, Listenmarkierungen und die gesamte Symbolleiste spiegeln sich nach rechts; eingebettete Codeblöcke, LaTeX-Formeln, englische Fachbegriffe und Versionsnummern bleiben links-nach-links und werden niemals gespiegelt.
- Diese README selbst ist in alle 11 Sprachen übersetzt — verwenden Sie die Auswahl ganz oben auf dieser Seite.

---

## ✨ Funktionen

- **Multi-Tab + Multi-Fenster**: mehrere Dateien gleichzeitig öffnen; ungespeicherte Änderungen werden mit einem Punkt markiert und vor dem Schließen abgefragt; ein Tab lässt sich per Mittelklick schließen. Ein Doppelklick auf eine `.md` öffnet ein eigenes Fenster (eine Datei pro Fenster); ein Doppelklick auf eine bereits geöffnete Datei **fokussiert dieses Fenster**, statt sie erneut zu öffnen.
- **Live Geteilte Vorschau**: den Trenner ziehen, um die Größe anzupassen; die Symbolleisten-Schaltfläche durchschaltet Split / Editor / Vorschau.
- **Klick-Positionierung**: Klick im Editor scrollt die Vorschau; Klick in der Vorschau springt mit dem Cursor in den Editor.
- **Suchen & Ersetzen**: finden, einzelnes oder alle ersetzen, mit Trefferzähler.
- **Formelsatz**: inline `$…$` und block `$$…$$` (auch `\(...\)`, `\[...\]`), gerendert durch KaTeX; lange Gleichungen brechen an Operatoren um oder schrumpfen automatisch.
- **Code-Hervorhebung**: Sprache wird automatisch erkannt; große Dokumente werden lazily nach Viewport hervorgehoben, um flüssig zu bleiben.
- **Mermaid-Diagramme**: ein ` ```mermaid `-Block wird als Flussdiagramm / Sequenz / Klasse / Zustand / Gantt / Tortendiagramm usw. gerendert.
- **Bilder**: einfügen / hineinziehen / auswählen — automatisch als base64 eingebettet; relative lokale Pfade funktionieren ebenfalls; Bilder werden standardmäßig zentriert.
- **Tabellen**: GFM-Tabellen; schmale Tabellen werden am Inhalt zentriert, breite scrollen horizontal ohne Abschneiden.
- **Zitate (BibTeX)**: Syntax `[@key]` / `\cite{key}`, numerischer Stil; am Ende wird ein Literaturverzeichnis erstellt, mit bidirektionalen Sprüngen zwischen textinterner `[n]` und dem Eintrag; unterstützt einen eingebetteten ` ```bibtex `-Block oder eine separat geladene `.bib`.
- **HTML-Unterstützung**: `.html`-Dateien zum Rendern öffnen; zwischen HTML und Markdown konvertieren.
- **Design / Sprache**: dunkel / hell, **11 UI-Sprachen** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — Arabisch automatisch rechts-nach-links).
- **Auto-Entwurf**: Inhalte werden regelmäßig gespeichert und nach einem unerwarteten Schließen / Absturz wiederhergestellt.
- **Wortzahl**: die Statusleiste zeigt live Zeichen / Zeilen / Wörter sowie die aktuelle Zeile & Spalte.
- **Drag-and-Drop**: eine `.md`-Datei auf das Fenster ziehen, um sie zu öffnen; ein Bild ziehen, um es einzufügen.
- **Export**: speichern als Markdown / HTML / PDF (Vektor + Raster) / LaTeX.

---

## ⌨️ Tastenkürzel

Auf macOS `⌘`, auf Windows / Linux `Ctrl` verwenden.

| Kürzel | Aktion |
| --- | --- |
| `⌘/Ctrl + N` | Neu |
| `⌘/Ctrl + O` | Datei öffnen |
| `⌘/Ctrl + S` | Speichern |
| `⌘/Ctrl + Shift + S` | Speichern unter |
| `⌘/Ctrl + W` | Tab schließen |
| `⌘/Ctrl + Shift + W` | Fenster schließen |
| `⌘/Ctrl + F` | Suchen |
| `⌘/Ctrl + H` | Ersetzen |
| `⌘/Ctrl + B` / `I` / `R` | Fett / Kursiv / Inline-Code |
| `⌘/Ctrl + K` | Link einfügen |
| `Tab` | 2 Leerzeichen einrücken |
| `Alt/Option + Ziehen` | Rechteckige (Spalten-) Auswahl |
| `Alt/Option + Shift + ←↑↓→` | Spaltenauswahl erweitern |
| `Esc` | Spaltenauswahl abbrechen |

> Bei mehreren offenen Fenstern wirken sich Tastenkürzel nur auf das fokussierte Fenster aus.

---

## 📝 Spickzettel

**Markdown**: Überschriften `# / ## / ###`, fett `**text**`, kursiv `*text*`, durchgestrichen `~~text~~`, Inline-Code `` `code` ``, Codeblöcke (dreifache Backticks, optional mit Sprache), Zitat `> text`, Listen `- / 1.`, Aufgabenliste `- [ ] / - [x]`, Link `[text](url)`, Bild `![alt](url)`, Trennlinie `---`, Tabellen `| A | B |`.

**Formelsatz**: inline `$E = mc^2$`; block `$$\int_0^1 x\,dx$$` (darf mehrere Zeilen umfassen). Verwendet LaTeX-Syntax, gerendert durch KaTeX; `$` innerhalb von Codeblöcken wird nicht als Formel-Trenner behandelt. Unterstützt `align` / `aligned`, Matrizen, `cases` und weitere gängige Umgebungen.

**Zitate**: im Text `[@key]` oder `[@a; @b]` schreiben (LaTeX-kompatibles `\cite{key}`), die Bibliothek über einen ` ```bibtex `-Block einbetten oder eine `.bib` per „Refs"-Schaltfläche laden. Am Ende wird ein Literaturverzeichnis erstellt; das textinterne `[n]` ist klickbar.

---

## 📤 Export (Speichern unter)

Auf „Speichern unter" klicken und ein Format wählen:

- **Markdown (.md)**: den Quelltext speichern und den Namen / Pfad des aktuellen Tabs aktualisieren.
- **HTML (.html)**: in sich geschlossenes HTML mit inline CSS + Code-Hervorhebung; Formeln bleiben als `$…$`-Literal erhalten, automatisch durch inline KaTeX gerendert.
- **PDF Vektor**: System-Druckdialog, Vektorausgabe, bei jeder Vergrößerung scharf. „Als PDF speichern" wählen.
- **PDF Raster**: erzeugt eine PDF-Datei direkt (ohne Dialog), mit niedriger / mittlerer / hoher Auflösung; paginiert an Blockgrenzen (keine zerstückelten Formeln / Überschriften / Code).
- **LaTeX (.tex)**: konvertiert in eine kompilierbare `.tex`-Quelle (mit documentclass und Paketen; Formeln bleiben unverändert). Exportiert eine Kopie.

---

## 🔒 Offline & Sicherheit

- **Keine einzigen Netzwerk-Anfragen zur Laufzeit.** Das Build-Ergebnis `dist/index.html` wird selbst geprüft: keine externen `src=` / `href=` / `url()` / `@import`-Links.
- Striktes CSP (nur lokales IPC, kein WAN); alle Dateien werden lokal gelesen / geschrieben, nichts wird hochgeladen.
- Überprüfen: Wi-Fi ausschalten / Kabel ziehen und starten — Formelsatz, Bilder, Code-Hervorhebung und Mermaid funktionieren alle.
- `dist/index.html` zeigt weiterhin rund ein Dutzend `https://github.com/…`-Strings; diese befinden sich alle innerhalb der **Lizenz-/Quell-Kommentare** von `marked` / `highlight.js` usw. — reiner Text, der **niemals eine Anfrage auslöst**; unverändert belassen, um die Open-Source-Lizenzen zu respektieren.

---

## 📦 Installation

### Vorgefertigte Downloads
Den Installer für Ihre Plattform aus [Releases](./) laden: macOS (`.dmg`, universell arm64 + x86_64), Windows (`.exe` / `.msi`), Linux (`.deb` / `.AppImage`).

### Öffnen der unsignierten App unter macOS (Gatekeeper umgehen)
Diese App ist nicht entwickler-signiert / notarisiert (Offline-Szenarien können üblicherweise nicht online notarisieren). Der erste Start wird blockiert — eine Option wählen:

- **CLI (empfohlen)**: `.app` in Programme ziehen, dann
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI**: im Finder Rechtsklick auf die `.app` → „Öffnen" → im Dialog erneut „Öffnen"; oder „Systemeinstellungen → Datenschutz & Sicherheit" → nach unten scrollen → „Trotzdem öffnen".

---

## 🛠️ Aus dem Quellcode bauen

### Einmalige Einrichtung (macOS)
```bash
xcode-select --install                       # Xcode command-line tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # both needed for universal
npm install                                  # Tauri cli
npm run fetch                                # download frontend deps into vendor/ (online only here)
```

### Lokale Entwicklung
```bash
npm run tauri dev        # builds dist/index.html, then launches the app window
```

### Bauen
```bash
# Apple Silicon only (faster)
npm run tauri build

# Universal binary (Apple Silicon + Intel, for distribution)
npm run tauri build -- --target universal-apple-darwin
```

Ausgabe:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / Cross-Plattform
- **Nativer Windows-Build** (erzeugt einen NSIS-`.exe`-Installer): siehe [BUILD-WINDOWS.md](./BUILD-WINDOWS.md).
- **Linux / macOS Intel / sonstige Cross-Plattform**: siehe [BUILD-CROSS.md](./BUILD-CROSS.md).

Das Frontend `dist/index.html` benötigt plattformübergreifend keine Änderungen; lediglich das Bündeln wird auf dem Ziel-Betriebssystem angepasst (`tauri.conf.json` `bundle.targets` erhält `nsis` / `deb` / `appimage`, plus System-Abhängigkeiten wie WebView2 / webkit2gtk).

---

## 📁 Projektstruktur

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

## 🎨 Anpassung

| Zu ändern | Wo |
| --- | --- |
| App-Name / Bundle-ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Fenstergröße | `tauri.conf.json` → `app.windows[0]` (Standard 1200×750) |
| Icons | das Quell-Bild ersetzen, dann `npm run icon` |
| Design-Farben / Fonts | `:root`-CSS-Variablen oben in `app-shell.html` |
| Menüeinträge | `build_menu()` in `src-tauri/src/lib.rs` |
| UI-Strings / Hilfedokument | `I18N` / `HELP_STRINGS` in `app-shell.html` |
| Abhängigkeits-Versionen | `VERSIONS` oben in `tools/fetch-vendor.mjs` (dann `npm run fetch -- --force`) |

---

## 📄 Lizenz

Der eigene Code dieses Projekts ist unter der **Apache License 2.0** Open Source.

- Vollständiger Lizenztext: [LICENSE](./LICENSE).
- Hinweise zu Drittanbieter-Komponenten: [NOTICE](./NOTICE) (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser und Tauri usw., jeweils unter MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).
- Gemäß Apache-2.0 muss eine Weiterverbreitung LICENSE und NOTICE beibehalten und Änderungen in modifizierten Dateien angeben.

---

## 📬 Kontakt

Bei Problemen oder Vorschlägen: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
