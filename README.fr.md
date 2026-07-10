<details>
<summary><b>🌐 Langue : Français</b> — cliquez pour choisir une autre langue</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · **[Français](README.fr.md)** · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md)

</details>


# MDeX (macOS · Windows · Linux · Entièrement hors ligne · Tauri v2)

> **MDeX** · se prononce « em-dex » (/ˌemˈdɛks/) — la lettre M suivie de « dex », deux syllabes.

Un lecteur et éditeur Markdown pensé d'abord pour le hors-ligne, conçu pour un usage **isolé (air-gapped) / intranet / déconnecté**. Chaque fichier est traité localement — **pas de réseau, pas d'envoi de données, pas de synchronisation cloud**.

- Un frontend HTML autonome en un seul fichier (sans Vue / React) ; Tauri v2 ne fournit que l'enveloppe native (fenêtres, menus, boîtes de dialogue de fichiers).
- **Zéro requête réseau à l'exécution** : `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` ainsi que toutes les polices woff2 de KaTeX sont intégrés / embarqués en base64 dans un seul `index.html`.
- Prise en charge de `.md` / `.markdown` / `.html` ; peut être défini comme gestionnaire par défaut des `.md` — un double-clic suffit pour ouvrir.

> Convient aux scénarios : **recherche / intranets / protection de la vie privée**. Pas de publicité, pas de télémétrie, pas d'envoi de données.

---

## 🌐 Langues

L'interface est disponible en **11 langues** : English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية.

- Changez à tout moment via le menu de langues de la barre d'outils ; votre choix est mémorisé entre les sessions.
- **L'arabe s'affiche de droite à gauche (RTL)** automatiquement — texte courant, titres, marqueurs de listes et toute la barre d'outils sont mis en miroir vers la droite ; les blocs de code, les formules LaTeX, les termes en anglais et les numéros de version restent de gauche à droite, jamais mis en miroir.
- Ce README est lui-même traduit dans les 11 langues — utilisez le sélecteur tout en haut de cette page.

---

## ✨ Fonctionnalités

- **Multi-onglets + multi-fenêtres** : ouvrez plusieurs fichiers à la fois ; les modifications non enregistrées sont signalées par un point, et une confirmation est demandée avant fermeture ; clic-molette sur un onglet pour le fermer. Un double-clic sur un `.md` ouvre sa propre fenêtre (une fenêtre par fichier) ; un double-clic sur un fichier déjà ouvert **donne le focus à cette fenêtre** au lieu de le rouvrir.
- **Aperçu scindé en direct** : faites glisser le séparateur pour redimensionner ; le bouton de la barre d'outils cycle entre Scindé / Éditeur / Aperçu.
- **Clic pour positionner** : cliquez dans l'éditeur pour faire défiler l'aperçu ; cliquez dans l'aperçu pour déplacer le curseur dans l'éditeur.
- **Rechercher & remplacer** : trouver, remplacer une occurrence ou tout, avec comptage des correspondances.
- **Mathématiques** : `$…$` en ligne et `$$…$$` en bloc (ainsi que `\(...\)` et `\[...\]`), rendus par KaTeX ; les longues équations sont coupées au niveau des opérateurs ou automatiquement rétrécies.
- **Coloration syntaxique du code** : langage auto-détecté ; les grands documents sont colorés par paresse selon la zone visible afin de rester fluides.
- **Diagrammes Mermaid** : un bloc ` ```mermaid ` est rendu sous forme d'organigramme / séquence / classe / état / Gantt / camembert, etc.
- **Images** : coller / déposer / choisir — intégrées automatiquement en base64 ; les chemins locaux relatifs fonctionnent aussi ; les images sont centrées par défaut.
- **Tableaux** : tableaux GFM ; les tableaux étroits sont centrés sur leur contenu, les larges défilent horizontalement sans être tronqués.
- **Citations (BibTeX)** : syntaxe `[@key]` / `\cite{key}`, style numérique ; une liste des références est générée à la fin, avec sauts bidirectionnels entre le `[n]` dans le texte et l'entrée ; prend en charge un bloc ` ```bibtex ` embarqué ou un `.bib` chargé séparément.
- **Prise en charge HTML** : ouvrez des fichiers `.html` pour les rendre ; conversion entre HTML et Markdown.
- **Thème / langue** : sombre / clair, **11 langues d'interface** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — l'arabe passe automatiquement de droite à gauche).
- **Brouillon automatique** : le contenu est enregistré périodiquement et restauré après une fermeture inattendue / un plantage.
- **Comptage des mots** : la barre d'état affiche en direct les caractères / lignes / mots, ainsi que la ligne et la colonne courantes.
- **Glisser-déposer** : déposez un fichier `.md` sur la fenêtre pour l'ouvrir ; déposez une image pour l'insérer.
- **Exportation** : enregistrer en Markdown / HTML / PDF (vectoriel + matriciel) / LaTeX.

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

> Avec plusieurs fenêtres ouvertes, les raccourcis n'affectent que la fenêtre ayant le focus.

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
- **PDF matriciel** : génère directement un fichier PDF (sans boîte de dialogue), en résolution basse / moyenne / haute ; paginé aux frontières de blocs (pas d'équations / titres / code coupés).
- **LaTeX (.tex)** : converti en une source `.tex` compilable (avec documentclass et paquets ; les formules sont conservées telles quelles). Exporte une copie.

---

## 🔒 Hors ligne & sécurité

- **Zéro requête réseau à l'exécution.** La sortie de build `dist/index.html` est auto-vérifiée : aucun lien externe `src=` / `href=` / `url()` / `@import`.
- CSP stricte (IPC local uniquement, pas de WAN) ; tous les fichiers sont lus/écrits localement, rien n'est envoyé.
- Vérification : coupez le Wi-Fi / débranchez le câble et lancez l'application — les mathématiques, images, coloration du code et Mermaid fonctionnent tous.
- `dist/index.html` affiche encore environ une douzaine de chaînes `https://github.com/…` ; elles se trouvent toutes dans des **commentaires de licence / source** de `marked` / `highlight.js` etc. — du texte brut qui **ne déclenche jamais de requête** ; conservées intactes pour respecter les licences open-source.

---

## 📦 Installation

### Téléchargements précompilés
Récupérez l'installateur de votre plateforme depuis [Releases](./) : macOS (`.dmg`, universel arm64 + x86_64), Windows (`.exe` / `.msi`), Linux (`.deb` / `.AppImage`).

### Ouverture de l'application non signée sur macOS (contourner Gatekeeper)
Cette application n'est pas signée par le développeur / notarisée (les scénarios hors ligne ne peuvent généralement pas notariser en ligne). Le premier lancement est bloqué — choisissez l'une des options :

- **CLI (recommandé)** : glissez le `.app` dans Applications, puis
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI** : dans Finder, faites un clic droit sur le `.app` → « Ouvrir » → « Ouvrir » à nouveau dans la boîte de dialogue ; ou « Réglages Système → Confidentialité et Sécurité » → descendre → « Ouvrir quand même ».

---

## 🛠️ Compiler depuis les sources

### Configuration unique (macOS)
```bash
xcode-select --install                       # Outils en ligne de commande Xcode
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # les deux requis pour l'universel
npm install                                  # Tauri CLI
npm run fetch                                # télécharger les dépendances frontend dans vendor/ (en ligne ici uniquement)
```

### Développement local
```bash
npm run tauri dev        # construit dist/index.html, puis lance la fenêtre de l'application
```

### Compilation
```bash
# Apple Silicon uniquement (plus rapide)
npm run tauri build

# Binaire universel (Apple Silicon + Intel, pour distribution)
npm run tauri build -- --target universal-apple-darwin
```

Sortie :
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / multiplateforme
- **Build Windows natif** (produit un installateur NSIS `.exe`) : voir [BUILD-WINDOWS.md](./BUILD-WINDOWS.md).
- **Linux / macOS Intel / autre multiplateforme** : voir [BUILD-CROSS.md](./BUILD-CROSS.md).

Le frontend `dist/index.html` ne nécessite aucune modification selon la plateforme ; ajustez simplement l'empaquetage sur l'OS cible (`tauri.conf.json` `bundle.targets` ajoute `nsis` / `deb` / `appimage`, plus les dépendances système comme WebView2 / webkit2gtk).

---

## 📁 Structure du projet

```
markdown/
├── app-shell.html          # source frontend (HTML+CSS+JS, toute la logique de l'application)
├── tools/
│   ├── fetch-vendor.mjs    # une fois : télécharge les dépendances dans vendor/ (en ligne ici uniquement)
│   └── build-html.mjs      # intègre vendor dans dist/index.html (polices KaTeX → base64)
├── dist/index.html         # sortie de build : fichier unique entièrement hors ligne (Tauri frontendDist)
├── vendor/                 # cache de téléchargement (.gitignore)
├── package.json            # @tauri-apps/cli + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # fenêtre 1200×750, CSP stricte, icônes, association .md, hooks de menu
    ├── capabilities/default.json
    ├── icons/              # jeu d'icônes complet issu de `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + E/S fichiers + routage multi-fenêtres
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
| Chaînes d'interface / doc d'aide | `I18N` / `HELP_STRINGS` dans `app-shell.html` |
| Versions des dépendances | `VERSIONS` en haut de `tools/fetch-vendor.mjs` (puis `npm run fetch -- --force`) |

---

## 📄 Licence

Le code propre à ce projet est open-source sous la **Apache License 2.0**.

- Texte complet de la licence : [LICENSE](./LICENSE).
- Mentions des composants tiers : [NOTICE](./NOTICE) (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser et Tauri, etc., chacun sous MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).
- En vertu d'Apache-2.0, toute redistribution doit conserver LICENSE et NOTICE et indiquer les modifications apportées aux fichiers modifiés.

---

## 📬 Contact

Pour tout problème ou suggestion : **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
