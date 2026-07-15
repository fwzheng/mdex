<details>
<summary><b>🌐 Sprache: Deutsch</b> — klicken, um eine andere Sprache zu wählen</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · **[Deutsch](README.de.md)** · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.3.1 (macOS · Windows · Linux · vollständig offline · Tauri v2)

> **MDeX** · ausgesprochen „em-dex" (/ˌemˈdɛks/) — der Buchstabe M gefolgt von „dex", zwei Silben.

Ein offline-orientierter Markdown-Reader & Editor für den **Air-Gap-/Intranet-/Getrennt-Betrieb**. Jede Datei wird lokal verarbeitet — **kein Netzwerk, keine Uploads, keine Cloud-Synchronisation**.

- Ein einzelnes, in sich geschlossenes HTML-Frontend (ohne Vue / React); Tauri v2 stellt lediglich die native Hülle bereit (Fenster, Menüs, Dateidialoge).
- **Keine einzigen Netzwerk-Anfragen zur Laufzeit**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` sowie sämtliche KaTeX-woff2-Fonts sind inline / base64-eingebettet in einer einzigen `index.html`.
- Unterstützt `.md` / `.markdown` / `.html`; kann als Standard-Handler für `.md` eingerichtet werden — per Doppelklick öffnen.


---

## 🌐 Languages

Die Benutzeroberfläche wird in **17 Sprachen** ausgeliefert: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Jederzeit über das Sprachmenü der Symbolleiste umschalten; Ihre Wahl wird über Sitzungen hinweg gespeichert.
- **Arabisch wird automatisch rechts-nach-links (RTL) gerendert** — Fließtext, Überschriften, Listenmarkierungen und die gesamte Symbolleiste spiegeln sich nach rechts; eingebettete Codeblöcke, LaTeX-Formeln, englische Fachbegriffe und Versionsnummern bleiben links-nach-links und werden niemals gespiegelt.
- Diese README selbst ist in alle 17 Sprachen übersetzt — verwenden Sie die Auswahl ganz oben auf dieser Seite.

---

## ✨ Funktionen

- **Multi-Tab + Multi-Fenster**: mehrere Dateien gleichzeitig öffnen; ungespeicherte Änderungen werden mit einem Punkt markiert und vor dem Schließen abgefragt; ein Tab lässt sich per Mittelklick schließen. Ein Doppelklick auf eine `.md` öffnet ein eigenes Fenster (eine Datei pro Fenster); ein Doppelklick auf eine bereits geöffnete Datei **fokussiert dieses Fenster**, statt sie erneut zu öffnen.
- **Live Geteilte Vorschau**: den Trenner ziehen, um die Größe anzupassen; die Symbolleisten-Schaltfläche durchschaltet Split / Editor / Vorschau.
- **Klick-Positionierung**: Klick im Editor scrollt die Vorschau; Klick in der Vorschau springt mit dem Cursor in den Editor.
- **Suchen & Ersetzen**: finden, einzelnes oder alle ersetzen, mit Trefferzähler.
- **Formelsatz**: inline `$…$` und block `$$…$$` (auch `\(...\)`, `\[...\]`), gerendert durch KaTeX; lange Gleichungen brechen an Operatoren um oder schrumpfen automatisch.
- **Code-Hervorhebung**: Sprache wird automatisch erkannt; große Dokumente werden lazily nach Viewport hervorgehoben, um flüssig zu bleiben.
- **Mermaid-Diagramme**: ein ` ```mermaid `-Block wird als Flussdiagramm / Sequenz / Klasse / Zustand / Gantt / Tortendiagramm usw. gerendert; klicken Sie auf ein Diagramm, um ein eigenständiges Zoom-/Pan-/Vollbild-Anzeigefenster zu öffnen, das sich beim Bearbeiten live aktualisiert.
- **Bilder**: einfügen / hineinziehen / auswählen — gespeichert in einem `<Dateiname>_images/`-Ordner neben dem Dokument mit einer sauberen relativen Referenz (kein Inline-Base64); Entwürfe nutzen einen temporären Ordner, der beim Speichern migriert wird; «Speichern unter» flacht die Bilder ins Ziel ab; standardmäßig zentriert.
- **Schrift-Zoom**: Editor- und Vorschau-Schriftarten unabhängig zoomen (−/Prozent/+ -Steuerung oder `⌘/Ctrl + =/−/0`); bleibt über Neustarts hinweg bestehen.
- **Tabellen**: GFM-Tabellen; schmale Tabellen werden am Inhalt zentriert, breite scrollen horizontal ohne Abschneiden.
- **Zitate (BibTeX)**: Syntax `[@key]` / `\cite{key}`, numerischer Stil; am Ende wird ein Literaturverzeichnis erstellt, mit bidirektionalen Sprüngen zwischen textinterner `[n]` und dem Eintrag; unterstützt einen eingebetteten ` ```bibtex `-Block oder eine separat geladene `.bib`.
- **HTML-Unterstützung**: `.html`-Dateien zum Rendern öffnen; zwischen HTML und Markdown konvertieren.
- **Design / Sprache**: dunkel / hell, **17 UI-Sprachen** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — Arabisch & Urdu automatisch rechts-nach-links).
- **Auto-Entwurf**: Inhalte werden regelmäßig gespeichert und nach einem unerwarteten Schließen / Absturz wiederhergestellt.
- **Wortzahl**: die Statusleiste zeigt live Zeichen / Zeilen / Wörter sowie die aktuelle Zeile & Spalte.
- **Drag-and-Drop**: eine `.md`-Datei auf das Fenster ziehen, um sie zu öffnen; ein Bild ziehen, um es einzufügen.
- **Export**: speichern als Markdown / HTML / PDF (Vektor + Raster) / LaTeX.
- **Textfarbe**: Die Paletten-Schaltfläche schließt die Auswahl in `<span style="color:…">` ein.
- **Zurück / Vor**: vereinigte History über Dokumente und Cursorpositionen; ◀ ▶-Buttons, `Alt+←/→`.
- **Links folgen**: Ein Klick auf einen Link in der Vorschau öffnet das Ziel in einem neuen Tab (http im Systembrowser); das aktuelle Dokument bleibt erhalten.

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
| `⌘/Ctrl + =/−/0` | Den zuletzt geklickten Bereich (Editor oder Vorschau) zoomen: vergrößern / verkleinern / zurücksetzen |

> Bei mehreren offenen Fenstern wirken sich Tastenkürzel nur auf das fokussierte Fenster aus. Wenn das Bildanzeige-Fenster geöffnet ist, zoomt `⌘/Ctrl + =/−/0` stattdessen das Bild.

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
Laden Sie den Installer für Ihre Plattform von einer der beiden Quellen herunter:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Spiegelserver**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### Öffnen der unsignierten App unter macOS (Gatekeeper umgehen)

Diese App ist **nicht** entwickler-signiert / notarisiert (Offline-Szenarien können üblicherweise nicht online notarisieren). Unter macOS 12+, **insbesondere macOS 26 (Tahoe)**, schlägt das Starten direkt aus der `.dmg` — oder einem frisch kopierten Build — mit **"MDeX.app is damaged and can't be opened."** fehl. Das ist Gatekeeper, kein echter Schaden. Beheben im Terminal:

1. **Zuerst `MDeX.app` aus der `.dmg` in `/Applications` ziehen** — niemals direkt aus dem dmg ausführen (das löst App Translocation und das Attribut `com.apple.provenance` aus, die eigentliche Ursache für „beschädigt" unter macOS 26).
2. Attribute löschen und neu signieren:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` ist SIP-geschützt und **kann nicht** entfernt werden, auch nicht mit `sudo`; erneutes Signieren setzt die Signatur zurück, sodass Gatekeeper die Ausführung erlaubt. `spctl` meldet bei Ad-hoc-Signatur weiterhin `rejected` — erwartet, und es blockiert `open` **nicht**.
3. Starten mit `open /Applications/MDeX.app` (oder Doppelklick). Der erste Start kann trotzdem einmal nachfragen — bestätigen über **Systemeinstellungen → Datenschutz & Sicherheit → Trotzdem öffnen**, oder Rechtsklick auf die App → **Öffnen**.

---

## 🛠️ Aus dem Quellcode bauen

Quellcode: <https://github.com/fwzheng/mdex>. Bitte folgen Sie den Build-Anweisungen im Repository (Setup, Abhängigkeiten und Befehle sind dort dokumentiert).

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

Der eigene Code dieses Projekts ist Open Source unter **Apache License 2.0**.

Drittanbieter-Komponenten: Das Projekt verwendet einige Drittanbieter-Komponenten (unter anderem marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser und Tauri usw.); deren Urheber- und Lizenzhinweise finden sich in den jeweiligen Quelldateien. Diese Komponenten stehen jeweils unter MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 und weiteren Open-Source-Lizenzen.

Weitergabeanforderungen: Gemäß der Apache-2.0-Lizenz muss bei Weitergabe dieses Projekts die Dateien LICENSE und NOTICE beibehalten werden; wenn Sie eine Quelldatei ändern, müssen Sie die Änderungen in der entsprechenden Datei deutlich kennzeichnen.

---

## 📬 Kontakt

Bei Problemen oder Vorschlägen: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
