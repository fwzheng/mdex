<details>
<summary><b>🌐 Lingua: Italiano</b> — fai clic per scegliere un'altra lingua</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · **[Italiano](README.it.md)** · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md)

</details>


# MDeX (macOS · Windows · Linux · Completamente offline · Tauri v2)

> **MDeX** · si pronuncia "em-dex" (/ˌemˈdɛks/) — la lettera M seguita da "dex", due sillabe.

Un lettore ed editor Markdown offline-first per uso in **reti isolate / intranet / senza connessione**. Ogni file viene elaborato localmente — **nessuna rete, nessun caricamento, nessuna sincronizzazione cloud**.

- Un singolo frontend HTML autonomo (niente Vue / React); Tauri v2 fornisce solo la shell nativa (finestre, menu, finestre di dialogo file).
- **Zero richieste di rete a runtime**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` e tutti i font woff2 di KaTeX sono inline / incorporati in base64 in un unico `index.html`.
- Supporta `.md` / `.markdown` / `.html`; può essere impostato come gestore predefinito dei `.md` — doppio clic per aprire.

> Adatto a: scenari di **ricerca / intranet / protezione della privacy**. Niente pubblicità, niente telemetria, niente caricamento dati.

---

## 🌐 Lingue

L'interfaccia è disponibile in **11 lingue**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية.

- Cambia in qualsiasi momento dal menu lingua della barra strumenti; la tua scelta viene ricordata tra le sessioni.
- **L'arabo viene reso da destra a sinistra (RTL)** automaticamente — il corpo del testo, le intestazioni, i marcatori delle liste e l'intera barra degli strumenti si riflettono a destra; i blocchi di codice incorporati, la matematica LaTeX, i termini inglesi e i numeri di versione rimangono da sinistra a destra, mai riflessi.
- Questo README è a sua volta tradotto in tutte le 11 lingue — usa il selettore in cima a questa pagina.

---

## ✨ Funzionalità

- **Multi-scheda + multi-finestra**: apri più file contemporaneamente; le modifiche non salvate sono contrassegnate con un puntino e ti viene chiesto prima di chiudere; clic centrale su una scheda per chiuderla. Il doppio clic su un `.md` apre una propria finestra (una finestra per file); il doppio clic su un file già aperto **porta in primo piano quella finestra** invece di riaprirlo.
- **Anteprima affiancata in tempo reale**: trascina il divisore per ridimensionare; il pulsante della barra strumenti alterna Diviso / Editor / Anteprima.
- **Posizionamento con clic**: clicca nell'editor per scorrere l'anteprima; clicca nell'anteprima per spostare il cursore nell'editor.
- **Cerca e sostituisci**: trova, sostituisci uno o tutti, con conteggio delle corrispondenze.
- **Matematica**: inline `$…$` e blocco `$$…$$` (anche `\(...\)`, `\[...\]`), resa da KaTeX; le equazioni lunghe vanno a capo in corrispondenza degli operatori o si riducono automaticamente.
- **Evidenziazione del codice**: linguaggio rilevato automaticamente; i documenti grandi vengono evidenziati in modalità lazy in base all'area visibile per rimanere fluidi.
- **Diagrammi Mermaid**: un blocco ` ```mermaid ` viene reso come flowchart / sequence / class / state / Gantt / pie, ecc.
- **Immagini**: incolla / trascina / scegli — incorporati automaticamente in base64; funzionano anche i percorsi locali relativi; le immagini sono centrate per impostazione predefinita.
- **Tabelle**: tabelle GFM; le tabelle strette sono centrate rispetto al contenuto, quelle larghe scorrono orizzontalmente senza tagli.
- **Citazioni (BibTeX)**: sintassi `[@key]` / `\cite{key}`, stile numerico; in fondo viene generato un elenco Riferimenti, con salti bidirezionali tra `[n]` nel testo e la voce; supporta un blocco ` ```bibtex ` incorporato o un `.bib` caricato separatamente.
- **Supporto HTML**: apri file `.html` per la resa; converti tra HTML e Markdown.
- **Tema / lingua**: scuro / chiaro, **11 lingue dell'interfaccia** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — arabo automaticamente da destra a sinistra).
- **Bozza automatica**: il contenuto viene salvato periodicamente e ripristinato dopo una chiusura / crash imprevisto.
- **Conteggio parole**: la barra di stato mostra caratteri / righe / parole in tempo reale, più riga e colonna correnti.
- **Trascina e rilascia**: rilascia un file `.md` sulla finestra per aprirlo; rilascia un'immagine per inserirla.
- **Esportazione**: salva come Markdown / HTML / PDF (vettoriale + raster) / LaTeX.

---

## ⌨️ Scorciatoie

Usa `⌘` su macOS, `Ctrl` su Windows / Linux.

| Scorciatoia | Azione |
| --- | --- |
| `⌘/Ctrl + N` | Nuovo |
| `⌘/Ctrl + O` | Apri file |
| `⌘/Ctrl + S` | Salva |
| `⌘/Ctrl + Shift + S` | Salva come |
| `⌘/Ctrl + W` | Chiudi scheda |
| `⌘/Ctrl + Shift + W` | Chiudi finestra |
| `⌘/Ctrl + F` | Trova |
| `⌘/Ctrl + H` | Sostituisci |
| `⌘/Ctrl + B` / `I` / `R` | Grassetto / Corsivo / Codice inline |
| `⌘/Ctrl + K` | Inserisci collegamento |
| `Tab` | Rientro di 2 spazi |
| `Alt/Option + trascina` | Selezione rettangolare (colonna) |
| `Alt/Option + Shift + ←↑↓→` | Estendi selezione colonna |
| `Esc` | Annulla selezione colonna |

> Con più finestre aperte, le scorciatoie interessano solo la finestra in primo piano.

---

## 📝 Sintassi rapida

**Markdown**: intestazioni `# / ## / ###`, grassetto `**testo**`, corsivo `*testo*`, barrato `~~testo~~`, codice inline `` `codice` ``, blocchi di codice (tre backtick, con linguaggio opzionale), citazione `> testo`, liste `- / 1.`, lista attività `- [ ] / - [x]`, collegamento `[testo](url)`, immagine `![alt](url)`, divisore `---`, tabelle `| A | B |`.

**Matematica**: inline `$E = mc^2$`; blocco `$$\int_0^1 x\,dx$$` (può occupare più righe). Usa la sintassi LaTeX, resa da KaTeX; il `$` all'interno dei blocchi di codice non è trattato come delimitatore matematico. Supporta `align` / `aligned`, matrici, `cases` e altri ambienti comuni.

**Citazioni**: scrivi `[@key]` o `[@a; @b]` nel testo (compatibile con LaTeX `\cite{key}`), incorpora la libreria tramite un blocco ` ```bibtex ` o carica un `.bib` con il pulsante "Refs". In fondo viene generato un elenco Riferimenti; `[n]` nel testo è cliccabile.

---

## 📤 Esportazione (Salva come)

Fai clic su "Salva come" e scegli un formato:

- **Markdown (.md)**: salva il sorgente e aggiorna il nome / percorso della scheda corrente.
- **HTML (.html)**: HTML autonomo con CSS inline + evidenziazione del codice; la matematica viene mantenuta come letterale `$…$`, resa automaticamente dal KaTeX inline.
- **PDF vettoriale**: finestra di stampa di sistema, output vettoriale, nitido a qualsiasi zoom. Scegli "Salva come PDF".
- **PDF raster**: genera direttamente un file PDF (senza finestra di dialogo), con risoluzione bassa / media / alta; impaginato ai confini dei blocchi (nessuna equazione / intestazione / codice spezzato).
- **LaTeX (.tex)**: convertito in sorgente `.tex` compilabile (con documentclass e pacchetti; matematica lasciata invariata). Esporta una copia.

---

## 🔒 Offline e sicurezza

- **Zero richieste di rete a runtime.** L'output di build `dist/index.html` viene auto-verificato: nessun collegamento esterno `src=` / `href=` / `url()` / `@import`.
- CSP rigorosa (solo IPC locale, nessuna WAN); tutti i file vengono letti/scritti localmente, nulla viene caricato.
- Verifica: disattiva il Wi-Fi / scollega il cavo e avvia — matematica, immagini, evidenziazione del codice e Mermaid funzionano tutti.
- `dist/index.html` mostra ancora circa una dozzina di stringhe `https://github.com/…`; queste si trovano tutte all'interno di **commenti di licenza / sorgente** di `marked` / `highlight.js` ecc. — testo semplice che **non attiva mai alcuna richiesta**; lasciati intatti per rispettare le licenze open-source.

---

## 📦 Installazione

### Download precompilati
Scarica l'installer per la tua piattaforma da [Releases](./): macOS (`.dmg`, universale arm64 + x86_64), Windows (`.exe` / `.msi`), Linux (`.deb` / `.AppImage`).

### Aprire l'app non firmata su macOS (aggirare Gatekeeper)
Questa app non è firmata dallo sviluppatore / notarizzata (gli scenari offline di solito non possono notarizzare online). Il primo avvio viene bloccato — scegli un'opzione:

- **CLI (consigliato)**: trascina `.app` in Applicazioni, poi
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI**: in Finder, clic destro sul `.app` → "Apri" → "Apri" di nuovo nella finestra di dialogo; oppure "Impostazioni di sistema → Privacy e Sicurezza" → scorri in basso → "Apri comunque".

---

## 🛠️ Compila da sorgente

### Configurazione una tantum (macOS)
```bash
xcode-select --install                       # Xcode command-line tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # both needed for universal
npm install                                  # Tauri cli
npm run fetch                                # download frontend deps into vendor/ (online only here)
```

### Sviluppo locale
```bash
npm run tauri dev        # builds dist/index.html, then launches the app window
```

### Compilazione
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

### Windows / Linux / multipiattaforma
- **Build Windows nativa** (produce un installer NSIS `.exe`): vedi [BUILD-WINDOWS.md](./BUILD-WINDOWS.md).
- **Linux / macOS Intel / altra multipiattaforma**: vedi [BUILD-CROSS.md](./BUILD-CROSS.md).

Il frontend `dist/index.html` non necessita di modifiche tra piattaforme; basta regolare il bundling sul sistema operativo di destinazione (`tauri.conf.json` `bundle.targets` aggiunge `nsis` / `deb` / `appimage`, più le dipendenze di sistema come WebView2 / webkit2gtk).

---

## 📁 Struttura del progetto

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

## 🎨 Personalizzazione

| Da modificare | Dove |
| --- | --- |
| Nome app / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Dimensioni finestra | `tauri.conf.json` → `app.windows[0]` (predefinito 1200×750) |
| Icone | sostituisci l'immagine sorgente, poi `npm run icon` |
| Colori tema / font | variabili CSS `:root` in cima a `app-shell.html` |
| Voci di menu | `build_menu()` in `src-tauri/src/lib.rs` |
| Stringhe interfaccia / documento di aiuto | `I18N` / `HELP_STRINGS` in `app-shell.html` |
| Versioni delle dipendenze | `VERSIONS` in cima a `tools/fetch-vendor.mjs` (poi `npm run fetch -- --force`) |

---

## 📄 Licenza

Il codice proprio di questo progetto è open-source sotto la **Apache License 2.0**.

- Testo completo della licenza: [LICENSE](./LICENSE).
- Avvisi sui componenti di terze parti: [NOTICE](./NOTICE) (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser e Tauri, ecc., ciascuno sotto MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).
- Sotto Apache-2.0, la redistribuzione deve conservare LICENSE e NOTICE e indicare le modifiche nei file modificati.

---

## 📬 Contatti

Per problemi o suggerimenti: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
