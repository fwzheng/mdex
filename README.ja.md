<details>
<summary><b>🌐 言語：日本語</b> — クリックして他の言語を選択</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · **[日本語](README.ja.md)** · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.4.0 (macOS · Windows · Linux · 完全オフライン · Tauri v2)

> **MDeX** · 「エム・デックス」と発音します（/ˌemˈdɛks/）— アルファベットの M に続けて「dex」、2音節です。

**エアギャップ / 社内ネットワーク / 非接続**環境向けのオフラインファーストな Markdown リーダー＆エディタ。すべてのファイルはローカルで処理され、**ネットワーク不要、アップロード不要、クラウド同期、広告なし、テレメトリなし、データ送信なしなし**です。

- UIは単一の自己完結した HTML フロントエンド（Vue / React なし）。Tauri v2 はネイティブシェル（ウィンドウ、メニュー、ファイルダイアログ）のみを提供します。
- **ランタイムのネットワークリクエストがゼロ**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` およびすべての KaTeX woff2 フォントは、単一の `index.html` にインライン化 / base64 埋め込みされています。
- `.md` / `.markdown` / `.html` に対応。`.md` の既定ハンドラとして設定すれば、ダブルクリックで開けます。


---

## 🌐 言語

インターフェースは **17 言語** で提供されます: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- ツールバーの言語メニューからいつでも切り替えできます。選択はセッションをまたいで記憶されます。
- **العربية（アラビア語）は自動的に右から左（RTL）へ表示されます** — 本文、見出し、リストマーカー、ツールバー全体が右側に反転します。埋め込みのコードブロック、LaTeX 数式、英語の用語、バージョン番号は左から右のままで、反転しません。
- この README 自体も全 17 言語に翻訳されています — このページの最上部にあるセレクタをご利用ください。

---

## ✨ 特徴

- **マルチタブ ＋ マルチウィンドウ**: 複数のファイルを同時に開けます。未保存の変更があるタブにはドットが付き、閉じる際に確認します。タブを中クリックで閉じます。`.md` をダブルクリックすると専用ウィンドウが開き（ファイルごとに1ウィンドウ）、すでに開いているファイルをダブルクリックすると、**そのウィンドウにフォーカス**し、再び開くことはしません。
- **ライブ分割プレビュー**: 区切り線をドラッグしてサイズ調整。ツールバーのボタンで 分割 / エディタ / プレビュー を切り替えます。
- **クリックで位置移動**: エディタをクリックするとプレビューがスクロールし、プレビューをクリックするとエディタのカーソルがジャンプします。
- **検索と置換**: 検索、1件または全件の置換、マッチ数の表示。
- **数式**: インライン `$…$` とブロック `$$…$$`（`\(...\)`, `\[...\]` も可）は KaTeX でレンダリング。長い数式は演算子で折り返すか、自動的に縮小されます。
- **コードハイライト**: 言語を自動検出。大きなドキュメントはビューポート単位で遅延ハイライトし、動作をスムーズに保ちます。
- **Mermaid 図**: ` ```mermaid ` ブロックが フローチャート / シーケンス / クラス / ステート / ガント / パイ などとしてレンダリングされます；図をクリックすると、独立したズーム/パン/全画面のビューアウィンドウが開き、編集に合わせてリアルタイムに更新されます。
- **画像**: ペースト / ドロップ / ピック — ドキュメントと同じ場所の `<ファイル名>_images/` フォルダに保存され、クリーンな相対参照で挿入されます（インライン base64 なし）; 下書きは一時フォルダを使用し、保存時に移行されます; 「名前を付けて保存」は画像をターゲットにフラット化します; 既定で中央寄せ。
- **フォントズーム**: エディタとプレビューのフォントを独立してズーム（−/パーセント/+ コントロール、または `⌘/Ctrl + =/−/0`）; 再起動後も保持されます。
- **テーブル**: GFM テーブル。狭いテーブルは内容に合わせて中央寄せ、広いテーブルは切り詰めなしで水平スクロールします。
- **引用（BibTeX）**: `[@key]` / `\cite{key}` 構文、数字スタイル。末尾に参考文献リストを生成し、本文中の `[n]` と項目を双方向ジャンプで結びます。埋め込みの ` ```bibtex ` ブロックや、別途読み込んだ `.bib` に対応します。
- **HTML サポート**: `.html` ファイルを開いてレンダリング。HTML と Markdown 間の相互変換も可能。
- **テーマ / 言語**: ダーク / ライト、**17 の UI 言語**（中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — アラビア語とウルドゥー語は自動で右から左へ）。
- **自動下書き**: 内容を定期的に保存し、予期しない終了 / クラッシュ後に復元します。
- **文字数カウント**: ステータスバーに 文字 / 行 / 単語 をライブ表示し、現在の行と列も表示します。
- **ドラッグ＆ドロップ**: `.md` ファイルをウィンドウにドロップして開き、画像をドロップして挿入します。
- **エクスポート**: Markdown / HTML / PDF（ベクター）/ LaTeX で保存。
- **文字色**：ツールバーのパレットが選択範囲を `<span style="color:…">` で囲みます。
- **戻る / 進む**：ドキュメントとカーソル位置の統合履歴；◀ ▶ ボタン、`Alt+←/→`。
- **リンクをたどる**：プレビュー内のリンクをクリックすると新しいタブで開きます（http はシステムブラウザ）。現在のドキュメントは置き換わりません。

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
| `⌘/Ctrl + =/−/0` | 最後にクリックしたペイン（エディタまたはプレビュー）をズーム：拡大 / 縮小 / リセット |

> 複数のウィンドウを開いている場合、ショートカットはフォーカスのあるウィンドウにのみ作用します。画像ビューアウィンドウが開いているとき、`⌘/Ctrl + =/−/0`は画像をズームします。

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
いずれかのソースからお使いのプラットフォームのインストーラをダウンロード:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **ミラーサイト**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### macOS で署名なしアプリを開く（Gatekeeper をバイパス）

このアプリはデベロッパ署名 / 公証を受けて**いません**（オフライン環境では通常、オンライン公証ができません）。macOS 12+、**とくに macOS 26 (Tahoe)** では、`.dmg` から直接起動したり、コピー直後のビルドを起動すると **"MDeX.app is damaged and can't be opened."** で失敗します。これは Gatekeeper の動作であり、実際の破損ではありません。Terminal で修正してください:

1. **まず `MDeX.app` を `.dmg` から `/Applications` へドラッグしてください** — dmg から直接実行してはいけません（App Translocation と `com.apple.provenance` 属性の原因になり、これが macOS 26 で「破損」と表示される本当の原因です）。
2. 属性を消去して再署名します:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` は SIP で保護されており、`sudo` を使っても削除**できません**。再署名すると署名がリセットされ、Gatekeeper が起動を許可します。`spctl` はアドホック署名に対して `rejected` を報告し続けますが、これは想定通りで、`open` は**ブロックされません**。
3. `open /Applications/MDeX.app` で起動してください（またはダブルクリック）。初回起動で一度だけプロンプトが出る場合があります — **システム設定 → プライバシーとセキュリティ → このまま開く** で確認するか、アプリを右クリック → **開く** で進めてください。

---

## 🛠️ ソースからビルド

ソースコード: <https://github.com/fwzheng/mdex>. ビルド手順はリポジトリ内の説明に従ってください（セットアップ・依存関係・ビルドコマンドはそちらに記載）。

---

## 📁 プロジェクト構成

```
markdown/
├── app-shell.html          # frontend shell (HTML+CSS); app logic lives in src/app.js
├── src/
│   ├── app.js              # application logic (// @ts-check; inlined into dist by build-html.mjs)
│   └── globals.d.ts        # vendor / Window type declarations for type-checking
├── tsconfig.json           # type-check config (tsc --noEmit; no bundler)
├── tools/
│   ├── fetch-vendor.mjs    # one-time: download deps into vendor/ + integrity lock (online only here)
│   ├── build-html.mjs      # inline vendor + src/app.js into dist/index.html (KaTeX fonts → base64)
│   └── test-pure.mjs       # frontend pure-function tests (npm test)
├── dist/index.html         # build output: fully offline single file (Tauri frontendDist)
├── vendor/                 # download cache + integrity.json (.gitignore)
├── package.json            # @tauri-apps/cli + typescript(dev) + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + dialog / single-instance + encoding_rs
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # 1200×750 window, strict CSP, icons, .md association, menu hooks
    ├── capabilities/default.json
    ├── icons/              # full icon set from `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + file IO + multi-window routing + atomic write / file ownership
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
| UI 文字列 / ヘルプ | `src/app.js` の `I18N` / `HELP_STRINGS` |
| 依存関係のバージョン | `tools/fetch-vendor.mjs` 先頭の `VERSIONS`（その後 `npm run fetch -- --force`） |

---

## 📄 ライセンス

本プロジェクト自身のコードは **Apache License 2.0** でオープンソースです。

サードパーティコンポーネント：本プロジェクトは一部のサードパーティコンポーネント（marked、KaTeX、highlight.js、DOMPurify、jsPDF、html2canvas-pro、turndown、mermaid、@retorquere/bibtex-parser、Tauri など）を使用しています。それぞれの著作権およびライセンス表記は該当ソースファイルを参照してください。これらのコンポーネントはそれぞれ MIT、BSD-3-Clause、Apache-2.0、MPL-2.0 などのオープンソースライセンスに従います。

配布要件：Apache-2.0 ライセンスに基づき、本プロジェクトを再配布する場合は LICENSE および NOTICE ファイルを保持してください。ソースファイルを改変した場合は、該当ファイルに明確にその旨を記載してください。

---

## 📬 連絡先

問題やご提案はこちらまで: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
