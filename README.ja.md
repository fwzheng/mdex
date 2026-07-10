<details>
<summary><b>🌐 言語：日本語</b> — クリックして他の言語を選択</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · **[日本語](README.ja.md)** · [한국어](README.ko.md) · [العربية](README.ar.md)

</details>


# MDeX (macOS · Windows · Linux · 完全オフライン · Tauri v2)

> **MDeX** · 「エム・デックス」と発音します（/ˌemˈdɛks/）— アルファベットの M に続けて「dex」、2音節です。

**エアギャップ / 社内ネットワーク / 非接続**環境向けのオフラインファーストな Markdown リーダー＆エディタ。すべてのファイルはローカルで処理され、**ネットワーク不要、アップロード不要、クラウド同期なし**です。

- UIは単一の自己完結した HTML フロントエンド（Vue / React なし）。Tauri v2 はネイティブシェル（ウィンドウ、メニュー、ファイルダイアログ）のみを提供します。
- **ランタイムのネットワークリクエストがゼロ**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` およびすべての KaTeX woff2 フォントは、単一の `index.html` にインライン化 / base64 埋め込みされています。
- `.md` / `.markdown` / `.html` に対応。`.md` の既定ハンドラとして設定すれば、ダブルクリックで開けます。

> 適した用途: **研究 / 社内ネットワーク / プライバシー保護** のシナリオ。広告なし、テレメトリなし、データアップロードなし。

---

## 🌐 言語

インターフェースは **11 言語** で提供されます: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية.

- ツールバーの言語メニューからいつでも切り替えできます。選択はセッションをまたいで記憶されます。
- **العربية（アラビア語）は自動的に右から左（RTL）へ表示されます** — 本文、見出し、リストマーカー、ツールバー全体が右側に反転します。埋め込みのコードブロック、LaTeX 数式、英語の用語、バージョン番号は左から右のままで、反転しません。
- この README 自体も全 11 言語に翻訳されています — このページの最上部にあるセレクタをご利用ください。

---

## ✨ 特徴

- **マルチタブ ＋ マルチウィンドウ**: 複数のファイルを同時に開けます。未保存の変更があるタブにはドットが付き、閉じる際に確認します。タブを中クリックで閉じます。`.md` をダブルクリックすると専用ウィンドウが開き（ファイルごとに1ウィンドウ）、すでに開いているファイルをダブルクリックすると、**そのウィンドウにフォーカス**し、再び開くことはしません。
- **ライブ分割プレビュー**: 区切り線をドラッグしてサイズ調整。ツールバーのボタンで 分割 / エディタ / プレビュー を切り替えます。
- **クリックで位置移動**: エディタをクリックするとプレビューがスクロールし、プレビューをクリックするとエディタのカーソルがジャンプします。
- **検索と置換**: 検索、1件または全件の置換、マッチ数の表示。
- **数式**: インライン `$…$` とブロック `$$…$$`（`\(...\)`, `\[...\]` も可）は KaTeX でレンダリング。長い数式は演算子で折り返すか、自動的に縮小されます。
- **コードハイライト**: 言語を自動検出。大きなドキュメントはビューポート単位で遅延ハイライトし、動作をスムーズに保ちます。
- **Mermaid 図**: ` ```mermaid ` ブロックが フローチャート / シーケンス / クラス / ステート / ガント / パイ などとしてレンダリングされます。
- **画像**: ペースト / ドロップ / ピック — 自動的に base64 で埋め込み。相対ローカルパスも機能します。画像は既定で中央寄せされます。
- **テーブル**: GFM テーブル。狭いテーブルは内容に合わせて中央寄せ、広いテーブルは切り詰めなしで水平スクロールします。
- **引用（BibTeX）**: `[@key]` / `\cite{key}` 構文、数字スタイル。末尾に参考文献リストを生成し、本文中の `[n]` と項目を双方向ジャンプで結びます。埋め込みの ` ```bibtex ` ブロックや、別途読み込んだ `.bib` に対応します。
- **HTML サポート**: `.html` ファイルを開いてレンダリング。HTML と Markdown 間の相互変換も可能。
- **テーマ / 言語**: ダーク / ライト、**11 の UI 言語**（中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — アラビア語は自動で右から左へ）。
- **自動下書き**: 内容を定期的に保存し、予期しない終了 / クラッシュ後に復元します。
- **文字数カウント**: ステータスバーに 文字 / 行 / 単語 をライブ表示し、現在の行と列も表示します。
- **ドラッグ＆ドロップ**: `.md` ファイルをウィンドウにドロップして開き、画像をドロップして挿入します。
- **エクスポート**: Markdown / HTML / PDF（ベクター＋ラスター）/ LaTeX で保存。

---

## ⌨️ ショートカット

macOS では `⌘`、Windows / Linux では `Ctrl` を使います。

| ショートカット | アクション |
| --- | --- |
| `⌘/Ctrl + N` | 新規作成 |
| `⌘/Ctrl + O` | ファイルを開く |
| `⌘/Ctrl + S` | 保存 |
| `⌘/Ctrl + Shift + S` | 名前を付けて保存 |
| `⌘/Ctrl + W` | タブを閉じる |
| `⌘/Ctrl + Shift + W` | ウィンドウを閉じる |
| `⌘/Ctrl + F` | 検索 |
| `⌘/Ctrl + H` | 置換 |
| `⌘/Ctrl + B` / `I` / `E` | 太字 / 斜体 / インラインコード |
| `⌘/Ctrl + K` | リンクを挿入 |
| `Tab` | 2スペースインデント |
| `Alt/Option + ドラッグ` | 矩形（列）選択 |
| `Alt/Option + Shift + ←↑↓→` | 列選択を拡張 |
| `Esc` | 列選択をキャンセル |

> 複数のウィンドウを開いている場合、ショートカットはフォーカスのあるウィンドウにのみ作用します。

---

## 📝 チートシート

**Markdown**: 見出し `# / ## / ###`、太字 `**text**`、斜体 `*text*`、取り消し線 `~~text~~`、インラインコード `` `code` ``、コードブロック（三連バッククォート、言語指定も可）、引用 `> text`、リスト `- / 1.`、タスクリスト `- [ ] / - [x]`、リンク `[text](url)`、画像 `![alt](url)`、区切り線 `---`、テーブル `| A | B |`。

**数式**: インライン `$E = mc^2$`、ブロック `$$\int_0^1 x\,dx$$`（複数行にまたがっても可）。LaTeX 構文を使用し、KaTeX でレンダリング。コードブロック内の `$` は数式の区切りとして扱われません。`align` / `aligned`、行列、`cases` などの一般的な環境に対応します。

**引用**: 本文中に `[@key]` や `[@a; @b]` と書き（LaTeX 互換の `\cite{key}`）、` ```bibtex ` ブロックで文献ライブラリを埋め込むか、「Refs」ボタンで `.bib` を読み込みます。末尾に参考文献リストが生成され、本文中の `[n]` はクリックできます。

---

## 📤 エクスポート（名前を付けて保存）

「名前を付けて保存」をクリックして形式を選択します:

- **Markdown (.md)**: ソースを保存し、現在のタブの名前 / パスを更新します。
- **HTML (.html)**: インライン化した CSS ＋ コードハイライトを含む自己完結型 HTML。数式は `$…$` リテラルのまま保持し、インライン化した KaTeX で自動レンダリングされます。
- **PDF（ベクター）**: システムの印刷ダイアログ、ベクター出力、どのズームでも鮮明。「PDF として保存」を選択します。
- **PDF（ラスター）**: ダイアログなしで PDF ファイルを直接生成（低 / 中 / 高 解像度）。ブロック境界でページ分割され（数式 / 見出し / コードが分割されることはありません）。
- **LaTeX (.tex)**: コンパイル可能な `.tex` ソースに変換（documentclass とパッケージ込み、数式はそのまま）。コピーをエクスポートします。

---

## 🔒 オフラインとセキュリティ

- **ランタイムのネットワークリクエストがゼロ。** ビルド出力 `dist/index.html` は自己検証済みで、外部への `src=` / `href=` / `url()` / `@import` リンクはありません。
- 厳格な CSP（ローカル IPC のみ、WAN なし）。すべてのファイルはローカルで読み書きされ、何もアップロードされません。
- 検証方法: Wi-Fi を切る / ケーブルを抜いて起動しても、数式、画像、コードハイライト、Mermaid はすべて機能します。
- `dist/index.html` にはまだ十数個の `https://github.com/…` 文字列が含まれますが、これらはすべて `marked` / `highlight.js` などの **ライセンス / ソースコメント** 内にあるプレーンテキストであり、**リクエストを発生させることはありません**。オープンソースライセンスを尊重するため、そのまま残しています。

---

## 📦 インストール

### ビルド済みダウンロード
[Releases](./) から各プラットフォームのインストーラを取得してください: macOS（`.dmg`、universal arm64 + x86_64）、Windows（`.exe` / `.msi`）、Linux（`.deb` / `.AppImage`）。

### macOS で署名なしアプリを開く（Gatekeeper をバイパス）
このアプリはデベロッパ署名 / 公証を受けていません（オフライン環境では通常、オンライン公証ができません）。初回起動はブロックされます — いずれかを選んでください:

- **CLI（推奨）**: `.app` をアプリケーションにドラッグした後、
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI**: Finder で `.app` を右クリック → 「開く」→ ダイアログで再度「開く」。または「システム設定 → プライバシーとセキュリティ」→ 下にスクロール → 「このまま開く」。

---

## 🛠️ ソースからビルド

### 1回限りのセットアップ（macOS）
```bash
xcode-select --install                       # Xcode command-line tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # both needed for universal
npm install                                  # Tauri cli
npm run fetch                                # download frontend deps into vendor/ (online only here)
```

### ローカル開発
```bash
npm run tauri dev        # builds dist/index.html, then launches the app window
```

### ビルド
```bash
# Apple Silicon only (faster)
npm run tauri build

# Universal binary (Apple Silicon + Intel, for distribution)
npm run tauri build -- --target universal-apple-darwin
```

出力:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / クロスプラットフォーム
- **ネイティブ Windows ビルド**（NSIS `.exe` インストーラを生成）: [BUILD-WINDOWS.md](./BUILD-WINDOWS.md) を参照。
- **Linux / macOS Intel / その他クロスプラットフォーム**: [BUILD-CROSS.md](./BUILD-CROSS.md) を参照。

フロントエンドの `dist/index.html` はプラットフォーム間で変更不要。ターゲット OS 上でバンドリングを調整するだけです（`tauri.conf.json` の `bundle.targets` に `nsis` / `deb` / `appimage` を追加、加えて WebView2 / webkit2gtk などのシステム依存物）。

---

## 📁 プロジェクト構成

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

## 🎨 カスタマイズ

| 変更内容 | 場所 |
| --- | --- |
| アプリ名 / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| ウィンドウサイズ | `tauri.conf.json` → `app.windows[0]`（既定 1200×750） |
| アイコン | ソース画像を差し替えて `npm run icon` |
| テーマカラー / フォント | `app-shell.html` 先頭の `:root` CSS 変数 |
| メニュー項目 | `src-tauri/src/lib.rs` の `build_menu()` |
| UI 文字列 / ヘルプ | `app-shell.html` の `I18N` / `HELP_STRINGS` |
| 依存関係のバージョン | `tools/fetch-vendor.mjs` 先頭の `VERSIONS`（その後 `npm run fetch -- --force`） |

---

## 📄 ライセンス

本プロジェクト自身のコードは **Apache License 2.0** の下でオープンソース化されています。

- ライセンス全文: [LICENSE](./LICENSE)。
- サードパーティコンポーネントの表記: [NOTICE](./NOTICE)（marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser および Tauri など。それぞれ MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0 の下にあります）。
- Apache-2.0 の下では、再配布にあたり LICENSE と NOTICE を保持し、変更したファイルには変更内容を示す必要があります。

---

## 📬 連絡先

問題やご提案はこちらまで: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
