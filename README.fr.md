<details>
<summary><b>🌐 Langue : Français</b> — cliquez pour choisir une autre langue</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · **[Français](README.fr.md)** · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v2.3.1 (macOS · Windows · Linux · Tauri v2)

> **MDeX** · se prononce « em-dex » (/ˌemˈdɛks/) — la lettre M suivie de « dex », deux syllabes.

Un lecteur et éditeur Markdown multilingue centré sur la **confidentialité et l'assistance AI**. Chaque fichier est traité localement — **par défaut pas de réseau, pas d'envoi, pas de synchronisation cloud, pas de publicité, pas de télémétrie** ; les enregistrements atomiques (résistants aux plantages) évitent toute perte de données en cas de plantage ou de coupure de courant. Depuis la v2.0, MDeX propose également une édition assistée par IA en option — et elle peut rester entièrement hors ligne : un modèle local (par ex. Ollama) n'a besoin d'aucune connexion ; seul un service d'AI en ligne (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi, etc.) émet une requête, et uniquement lorsque vous le configurez et le déclenchez.

- Un frontend HTML autonome en un seul fichier (sans Vue / React) ; Tauri v2 ne fournit que l'enveloppe native (fenêtres, menus, boîtes de dialogue de fichiers).
- **Zéro requête réseau à l'exécution** : `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` ainsi que toutes les polices woff2 de KaTeX sont intégrés / embarqués en base64 dans un seul `index.html`.
- Prise en charge de `.md` / `.markdown` / `.html` ; peut être défini comme gestionnaire par défaut des `.md` — un double-clic suffit pour ouvrir.


---

## 🌐 Langues

L'interface est disponible en **17 langues** : English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Changez à tout moment via le menu de langues de la barre d'outils ; votre choix est mémorisé entre les sessions.
- **L'arabe s'affiche de droite à gauche (RTL)** automatiquement — texte courant, titres, marqueurs de listes et toute la barre d'outils sont mis en miroir vers la droite ; les blocs de code, les formules LaTeX, les termes en anglais et les numéros de version restent de gauche à droite, jamais mis en miroir.
- Ce README est lui-même traduit dans les 17 langues — utilisez le sélecteur tout en haut de cette page.

---

## ✨ Fonctionnalités

- **Multi-onglets + multi-fenêtres** : ouvrez plusieurs fichiers à la fois ; les modifications non enregistrées sont signalées par un point, et une confirmation est demandée avant fermeture ; clic-molette sur un onglet pour le fermer. Un double-clic sur un `.md` ouvre sa propre fenêtre (une fenêtre par fichier) ; un double-clic sur un fichier déjà ouvert **donne le focus à cette fenêtre** au lieu de le rouvrir.
- **Aperçu scindé en direct** : faites glisser le séparateur pour redimensionner ; le bouton de la barre d'outils cycle entre Scindé / Éditeur / Aperçu.
- **Clic pour positionner** : cliquez dans l'éditeur pour faire défiler l'aperçu ; cliquez dans l'aperçu pour déplacer le curseur dans l'éditeur.
- **Rechercher & remplacer** : trouver, remplacer une occurrence ou tout, avec comptage des correspondances.
- **Mathématiques** : `$…$` en ligne et `$$…$$` en bloc (ainsi que `\(...\)` et `\[...\]`), rendus par KaTeX ; les longues équations sont coupées au niveau des opérateurs ou automatiquement rétrécies.
- **Coloration syntaxique du code** : langage auto-détecté ; les grands documents sont colorés par paresse selon la zone visible afin de rester fluides.
- **Diagrammes Mermaid** : un bloc ` ```mermaid ` est rendu sous forme d'organigramme / séquence / classe / état / Gantt / camembert, etc. ; cliquez sur un diagramme pour ouvrir une fenêtre de visualisation autonome (zoom / pan / plein écran) qui se met à jour en direct pendant l'édition.
- **Images** : coller / déposer / choisir — enregistrées dans un dossier `<nomfichier>_images/` à côté du document avec une référence relative propre (pas de base64 en ligne) ; les brouillons utilisent un dossier temporaire migré lors de l'enregistrement ; « Enregistrer sous » aplatit les images vers la cible ; centrées par défaut.
- **Zoom de police** : zoomez indépendamment les polices de l'éditeur et de l'aperçu (contrôles −/pourcentage/+, ou `⌘/Ctrl + =/−/0`) ; persiste entre les redémarrages.
- **Tableaux** : tableaux GFM ; les tableaux étroits sont centrés sur leur contenu, les larges défilent horizontalement sans être tronqués.
- **Citations (BibTeX)** : syntaxe `[@key]` / `\cite{key}`, style numérique ; une liste des références est générée à la fin, avec sauts bidirectionnels entre le `[n]` dans le texte et l'entrée ; prend en charge un bloc ` ```bibtex ` embarqué ou un `.bib` chargé séparément.
- **Prise en charge HTML** : ouvrez des fichiers `.html` pour les rendre ; conversion entre HTML et Markdown.
- **Thème / langue** : sombre / clair, **17 langues d'interface** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — l'arabe et l'urdu passent automatiquement de droite à gauche).
- **Brouillon automatique** : le contenu est enregistré périodiquement et restauré après une fermeture inattendue / un plantage.
- **Comptage des mots** : la barre d'état affiche en direct les caractères / lignes / mots, ainsi que la ligne et la colonne courantes.
- **Glisser-déposer** : déposez un fichier `.md` sur la fenêtre pour l'ouvrir ; déposez une image pour l'insérer.
- **Exportation** : enregistrer en Markdown / HTML / PDF (vectoriel) / LaTeX.
- **Couleur du texte** : la palette de la barre d'outils enveloppe la sélection dans `<span style="color:…">`.
- **Édition assistée par IA** : sélectionnez du texte et appuyez sur `⌘/Ctrl + J` (ou le bouton de la barre d'outils) pour que l'IA le raffine, le développe ou en change le ton ; fonctionne avec les services en ligne (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi, etc.) et avec un modèle local tel qu'Ollama pour un usage entièrement hors ligne ; le résultat est prévisualisé avant de remplacer l'original, et la clé API n'est stockée que localement.
- **Précédent / Suivant** : historique unifié des documents et positions du curseur ; boutons ◀ ▶, `Alt+←/→`.
- **Suivre les liens** : un clic sur un lien de l'aperçu ouvre la cible dans un nouvel onglet (http dans le navigateur) ; le document courant n'est pas remplacé.

---

## 📦 Installation

### Prebuilt downloads
Download the installer for your platform from either source:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Mirror site**: <https://www.spinss.cn/>

Platforms: macOS (`.dmg`, arm64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

---

### macOS

1. Open the `.dmg` file, **drag `MDeX.app` into `/Applications`**.
2. The app is **unsigned** (not notarized). On macOS 12+ - **especially macOS 26 (Tahoe)** - launching it fails with **"MDeX.app is damaged and can't be opened."** This is Gatekeeper, not real damage. Fix (choose one):

   **Option A - Terminal (recommended):**
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` (new in macOS 26) is SIP-protected and can't be permanently removed; re-signing resets the signature so Gatekeeper lets it run.

   **Option B - Finder right-click:**
   In Finder, **right-click** (or Control-click) `MDeX.app` -> **Open** -> confirm "Open" in the dialog. This bypasses the double-click Gatekeeper check.

   **Option C - System Settings:**
   Double-click the app (let it be blocked), then go to **System Settings -> Privacy & Security**, scroll down, click **"Open Anyway"** next to the "MDeX.app was blocked" message.

3. Launch with `open /Applications/MDeX.app` or double-click. The first launch may still prompt once - confirm via **System Settings -> Privacy & Security -> Open Anyway**, or right-click -> **Open**.

> **Note:** Every time you update MDeX (reinstall a new version), repeat step 2. The only permanent fix is Apple Notarization ($99/year Developer certificate).

---

### Windows

1. Download `MDeX_x.x.x_win.exe` and double-click to run.
2. **SmartScreen** may show "Windows protected your PC" (because the app is unsigned). Click **"More info"** -> **"Run anyway"**.
3. Follow the NSIS installer wizard to complete installation.
4. Launch from the Start Menu or desktop shortcut.

> If Windows Defender quarantines the file, restore it: **Windows Security -> Virus & threat protection -> Protection history -> Allow on device**.

---

### Linux

**Debian / Ubuntu (.deb):**
```bash
sudo dpkg -i MDeX_x.x.x_amd64.deb
# If missing dependencies:
sudo apt-get install -f
```
Then launch from the application menu or run `mdex` in terminal.

**Fedora / RHEL (.rpm):**
```bash
sudo rpm -i MDeX_x.x.x_x86_64.rpm
```

**AppImage (all distros):**
```bash
chmod +x MDeX_x.x.x_amd64.AppImage
./MDeX_x.x.x_amd64.AppImage
```
> If AppImage won't launch, install FUSE: `sudo apt install libfuse2` (Debian/Ubuntu) or `sudo dnf install fuse` (Fedora).

---

## ⌨️ Raccourcis

Utilisez `⌘` sur macOS, `Ctrl` sur Windows / Linux.

| Raccourci | Action |
| --- | --- |
| `⌘/Ctrl + N` | Nouveau |
| `⌘/Ctrl + O` | Ouvrir un fichier |
| `⌘/Ctrl + S` | Enregistrer |
| `⌘/Ctrl + Shift + S` | Enregistrer sous |
| `⌘/Ctrl + W` | Fermer l'onglet |
| `⌘/Ctrl + Shift + W` | Fermer la fenêtre |
| `⌘/Ctrl + F` | Rechercher |
| `⌘/Ctrl + H` | Remplacer |
| `⌘/Ctrl + B` / `I` / `E` | Gras / Italique / Code en ligne |
| `⌘/Ctrl + K` | Insérer un lien |
| `Tab` | Indenter de 2 espaces |
| `Alt/Option + glisser` | Sélection rectangulaire (en colonne) |
| `Alt/Option + Shift + ←↑↓→` | Étendre la sélection en colonne |
| `Esc` | Annuler la sélection en colonne |
| `⌘/Ctrl + =/−/0` | Zoomer le dernier volet cliqué (éditeur ou aperçu) : agrandir / réduire / réinitialiser |
| `⌘/Ctrl + J` | Édition assistée par IA |

> Avec plusieurs fenêtres ouvertes, les raccourcis n'affectent que la fenêtre ayant le focus. Lorsque la fenêtre de visualisation d'images est ouverte, `⌘/Ctrl + =/−/0` zoome l'image à la place.

---

## 📝 Aide-mémoire

**Markdown** : titres `# / ## / ###`, gras `**texte**`, italique `*texte*`, barré `~~texte~~`, code en ligne `` `code` ``, blocs de code (triple accent grave, avec langue facultative), citation `> texte`, listes `- / 1.`, liste de tâches `- [ ] / - [x]`, lien `[texte](url)`, image `![alt](url)`, séparateur `---`, tableaux `| A | B |`.

**Mathématiques** : en ligne `$E = mc^2$` ; en bloc `$$\int_0^1 x\,dx$$` (peut s'étendre sur plusieurs lignes). Utilise la syntaxe LaTeX, rendue par KaTeX ; le `$` à l'intérieur des blocs de code n'est pas traité comme un délimiteur mathématique. Prend en charge `align` / `aligned`, les matrices, `cases` et d'autres environnements courants.

**Citations** : écrivez `[@key]` ou `[@a; @b]` dans le texte (compatible LaTeX via `\cite{key}`), intégrez la bibliographie via un bloc ` ```bibtex ` ou chargez un `.bib` avec le bouton « Réfs ». Une liste des références est générée à la fin ; le `[n]` dans le texte est cliquable.

---

## 📤 Exportation (Enregistrer sous)

Cliquez sur « Enregistrer sous » et choisissez un format :

- **Markdown (.md)** : enregistre la source et met à jour le nom / chemin de l'onglet courant.
- **HTML (.html)** : HTML autonome avec CSS et coloration syntaxique intégrés ; les formules sont conservées sous forme littérale `$…$`, rendues automatiquement par KaTeX intégré.
- **PDF vectoriel** : boîte de dialogue d'impression système, sortie vectorielle, net à tout niveau de zoom. Choisissez « Enregistrer au format PDF ».
- **LaTeX (.tex)** : converti en une source `.tex` compilable (avec documentclass et paquets ; les formules sont conservées telles quelles). Exporte une copie.

---

## 🔒 Hors ligne & sécurité

- **Zéro requête réseau à l'exécution.** La sortie de build `dist/index.html` est auto-vérifiée : aucun lien externe `src=` / `href=` / `url()` / `@import`.
- CSP stricte (IPC local uniquement, pas de WAN) ; tous les fichiers sont lus/écrits localement, rien n'est envoyé.
- Vérification : coupez le Wi-Fi / débranchez le câble et lancez l'application — les mathématiques, images, coloration du code et Mermaid fonctionnent tous.
- `dist/index.html` affiche encore environ une douzaine de chaînes `https://github.com/…` ; elles se trouvent toutes dans des **commentaires de licence / source** de `marked` / `highlight.js` etc. — du texte brut qui **ne déclenche jamais de requête** ; conservées intactes pour respecter les licences open-source.

---

## 🛠️ Compiler depuis les sources

Code source: <https://github.com/fwzheng/mdex>. Veuillez suivre les instructions de compilation dans le dépôt (configuration, dépendances et commandes y sont documentées).

---

## 📁 Structure du projet

```
markdown/
├── app-shell.html          # coquille frontend (HTML+CSS) ; la logique de l'application est dans src/app.js
├── src/
│   ├── app.js              # logique de l'application (// @ts-check ; intégrée dans dist par build-html.mjs)
│   ├── i18n.js            # 17-language UI strings (pure data; window.I18N, split from app.js)
│   ├── help.js            # help-document data (HELP_STRINGS + SK/sc/CITE_HELP_*, window.HELP_DATA)
│   └── globals.d.ts        # déclarations de types vendor / Window pour la vérification de types
├── tsconfig.json           # config de vérification de types (tsc --noEmit ; pas de bundler)
├── tools/
│   ├── fetch-vendor.mjs    # une fois : télécharge les dépendances dans vendor/ + verrou d'intégrité (en ligne ici uniquement)
│   ├── build-html.mjs      # intègre vendor + src/app.js + i18n.js + help.js dans dist/index.html (polices KaTeX → base64)
│   └── test-pure.mjs       # tests des fonctions pures du frontend (npm test)
├── dist/index.html         # sortie de build : fichier unique autonome (Tauri frontendDist)
├── vendor/                 # cache de téléchargement + integrity.json (.gitignore)
├── package.json            # @tauri-apps/cli + typescript(dev) + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + dialog / single-instance + encoding_rs
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # fenêtre 1200×750, CSP stricte, icônes, association .md, hooks de menu
    ├── capabilities/default.json
    ├── icons/              # jeu d'icônes complet issu de `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + E/S fichiers + routage multi-fenêtres + écriture atomique / propriété des fichiers
```

---

## 🎨 Personnalisation

| À modifier | Emplacement |
| --- | --- |
| Nom de l'application / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Taille de la fenêtre | `tauri.conf.json` → `app.windows[0]` (par défaut 1200×750) |
| Icônes | remplacer l'image source, puis `npm run icon` |
| Couleurs du thème / polices | variables CSS `:root` en haut de `app-shell.html` |
| Éléments de menu | `build_menu()` dans `src-tauri/src/lib.rs` |
| Chaînes d'interface / doc d'aide | `I18N` / `HELP_STRINGS` dans `src/app.js` |
| Versions des dépendances | `VERSIONS` en haut de `tools/fetch-vendor.mjs` (puis `npm run fetch -- --force`) |

---

## 📄 Licence

Le code propre de ce projet est open source sous **Apache License 2.0**.

Composants tiers : le projet utilise certains composants tiers (notamment marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser et Tauri, etc.) ; leurs avis de droit d'auteur et de licence sont détaillés dans les fichiers sources respectifs. Ces composants sont respectivement sous licence MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 et autres licences open source.

Exigences de distribution : sous la licence Apache-2.0, toute redistribution de ce projet exige de conserver les fichiers LICENSE et NOTICE ; si vous modifiez un fichier source, vous devez indiquer clairement les changements dans le fichier correspondant.

---

## 📬 Contact

Pour tout problème ou suggestion : **fwzheng@bit.edu.cn**
