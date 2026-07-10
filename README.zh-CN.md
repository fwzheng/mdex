<details>
<summary><b>🌐 语言：简体中文</b> —— 点击切换其它语言</summary>

[English](README.md) · **[简体中文](README.zh-CN.md)** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md)

</details>

# MDeX（macOS · Windows · Linux · 完全离线 · Tauri v2）

> **MDeX** · 读作 “em-dex”（/ˌemˈdɛks/）—— 字母 M 接 “dex”，共两个音节。

一个面向 **离线 / 内网 / 隐私保护** 场景的 Markdown 阅读编辑器。所有文件都在本地处理，**不联网、不上传、无云端同步**。

- 纯前端单 HTML（无 Vue / React），Tauri v2 仅提供原生外壳（窗口、菜单、文件对话框）。
- **运行时零网络请求**：`marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` 及 KaTeX 全部 woff2 字体，均以内联 / base64 方式打进单个 `index.html`。
- 支持 `.md` / `.markdown` / `.html`；可设为 `.md` 默认打开方式，双击即开。

> 适用：科研 / 涉密单位 / 内网 / 出差断网。无广告、无遥测、无数据上传。

---

## 🌐 语言

界面提供 **11 种语言**：简体中文、English、Français、Deutsch、Español、Português、Italiano、Русский、日本語、한국어、العربية。

- 随时在工具栏「语言」菜单切换，选择会被记忆、跨会话保留。
- **阿拉伯语自动从右向左（RTL）排版**——正文、标题、列表符号以及整个工具栏镜像到右侧；内嵌的代码块、LaTeX 公式、英文术语与版本号始终保持左到右（LTR），绝不被翻转。
- 本 README 本身也已翻译为全部 11 种语言——请用本页最顶部的选择器切换。

---

## ✨ 核心功能

- **多标签页 + 多窗口**：同时打开多个文件；未保存的修改用圆点标记，关闭时询问是否保存；中键点击标签可快速关闭。双击 `.md` 文件按需开独立窗口（一文件一窗口）；已在某窗口打开的文件再次双击会**置顶该窗口**而非重复打开。
- **实时分屏预览**：拖动中间分隔条调整比例；工具栏按钮轮换「分屏 / 仅编辑 / 仅预览」。
- **点击定位**：点击编辑器某处，预览自动滚到对应位置；点击预览某处，编辑器光标跳到对应位置。
- **搜索替换**：查找、逐个替换、全部替换，显示匹配数。
- **数学公式**：行内 `$…$` 与块级 `$$…$$`（也支持 `\(...\)`、`\[...\]`），由 KaTeX 渲染；超长公式自动按运算符折行，无法折行的等比缩小。
- **代码高亮**：自动识别语言着色；大文档按视口懒加载，避免卡顿。
- **Mermaid 图**：` ```mermaid ` 代码块渲染为流程图 / 时序图 / 类图 / 状态图 / 甘特图 / 饼图等。
- **图片**：粘贴 / 拖拽 / 选择，自动转 base64 嵌入；也可用相对路径引用本地图片；图片默认居中显示。
- **表格**：GFM 表格；窄表按内容居中，宽表在容器内横向滚动，不被裁切。
- **文献引用（BibTeX）**：`[@key]` / `\cite{key}` 写法，numeric 风格，文末自动生成「参考文献」表，正文 [n] 与条目**双向跳转**；支持文档内嵌 ` ```bibtex ` 块或单独加载 `.bib` 库。
- **HTML 支持**：可直接打开 `.html` 渲染预览；支持 HTML ↔ Markdown 互转。
- **主题 / 语言**：深色 / 浅色主题，**11 种界面语言**（中文、English、Français、Deutsch、Русский、Italiano、日本語、한국어、Español、Português、العربية——阿拉伯语自动右到左）。
- **自动草稿**：内容定时暂存，意外关闭 / 崩溃后可恢复。
- **字数统计**：状态栏实时显示字数 / 行数 / 词数 / 字符数，及当前行列号。
- **拖拽打开**：拖拽 `.md` 文件到窗口直接打开；拖拽图片直接插入。
- **多格式导出**：另存为 Markdown / HTML / PDF（矢量打印 + 高清位图）/ LaTeX。

---

## ⌨️ 快捷键

macOS 用 `⌘`，Windows / Linux 用 `Ctrl`。

| 快捷键 | 功能 |
| --- | --- |
| `⌘/Ctrl + N` | 新建 |
| `⌘/Ctrl + O` | 打开文件 |
| `⌘/Ctrl + S` | 保存 |
| `⌘/Ctrl + Shift + S` | 另存为 |
| `⌘/Ctrl + W` | 关闭标签页 |
| `⌘/Ctrl + Shift + W` | 关闭窗口 |
| `⌘/Ctrl + F` | 查找 |
| `⌘/Ctrl + H` | 替换 |
| `⌘/Ctrl + B` / `I` / `E` | 加粗 / 斜体 / 行内代码 |
| `⌘/Ctrl + K` | 插入链接 |
| `Tab` | 缩进 2 空格 |
| `Alt/Option + 拖拽` | 矩形（列）选取 |
| `Alt/Option + Shift + ←↑↓→` | 扩展列选取 |
| `Esc` | 取消列选取 |

> 多窗口下，快捷键只作用于当前焦点窗口。

---

## 📝 语法速查

**Markdown**：标题 `# / ## / ###`、加粗 `**文本**`、斜体 `*文本*`、删除线 `~~文本~~`、行内代码 `` `代码` ``、代码块（三反引号围起，可标语言）、引用 `> 文本`、列表 `- / 1.`、任务列表 `- [ ] / - [x]`、链接 `[文字](URL)`、图片 `![描述](URL)`、分割线 `---`、表格 `| A | B |`。

**数学公式**：行内 `$E = mc^2$`；块级 `$$\int_0^1 x\,dx$$`（可跨行）。使用 LaTeX 语法，由 KaTeX 渲染；代码块内的 `$` 不会被当作公式分隔符。支持 `align` / `aligned`、矩阵、分段函数 `cases` 等环境。

**文献引用**：正文写 `[@key]` 或 `[@a; @b]`（LaTeX 兼容 `\cite{key}`），在文档中用 ` ```bibtex ` 块内嵌文献库，或用「文献」按钮加载 `.bib`。文末自动生成参考文献表，正文 `[n]` 可点击跳转。

---

## 📤 导出（另存为）

点击「另存为」后选择格式：

- **Markdown (.md)**：保存源文件，并更新当前标签的文件名与路径。
- **HTML (.html)**：导出独立 HTML 文件，内联排版 CSS + 代码高亮；数学公式保留 `$…$` 字面量，由内联 KaTeX 自动渲染。
- **PDF 矢量打印**：调用系统打印对话框，文字与公式矢量输出，任意放大清晰。选「存储为 PDF」即可保存。
- **PDF 高清位图**：直接生成 PDF 文件（无需对话框），可选低 / 中 / 高三种分辨率；按块边界分页，不切断公式 / 标题 / 代码块等。
- **LaTeX (.tex)**：转换为可编译的 `.tex` 源（含 documentclass 与宏包，数学公式原样保留），导出副本。

---

## 🔒 离线与安全

- 运行时**零网络请求**。构建产物 `dist/index.html` 经脚本自检：无任何 `src=` / `href=` / `url()` / `@import` 形式的外链。
- 严格的 CSP（仅本机 IPC，无外网）；文件全部本地读写，不上传。
- 验证：关闭 Wi-Fi / 拔网线后启动，公式、图片、代码高亮、Mermaid 均正常。
- `dist/index.html` 中仍可见约十几处 `https://github.com/…` 字样，它们全部位于 `marked` / `highlight.js` 等**许可证与来源注释**里，是纯文本，**不会发起任何网络请求**；为尊重开源许可证未强行删除。

---

## 📦 安装

### 下载预编译包
从 [Releases](./) 下载对应平台安装包：macOS（`.dmg`，通用 arm64+x86_64）、Windows（`.exe` / `.msi`）、Linux（`.AppImage` / `.deb` / '.rpm'）。

### macOS 打开未签名程序（绕过 Gatekeeper）
本程序未做开发者签名 / 公证（离线场景通常无法联网公证）。首次打开会被拦截，任选其一：

- **命令行（推荐）**：把 `.app` 拖进「应用程序」后
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **图形界面**：Finder 里右键 `.app` →「打开」→ 弹窗里再点「打开」；或「系统设置 → 隐私与安全性」→ 拉到底点「仍要打开」。

---

## 🛠️ 从源码构建

### 环境准备（一次性，macOS）
```bash
xcode-select --install                       # Xcode 命令行工具
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # 通用二进制需要两个
npm install                                  # Tauri CLI
npm run fetch                                # 下载前端依赖到 vendor/（仅此一步联网）
```

### 本地开发
```bash
npm run tauri dev        # 先 build dist/index.html，再启动应用窗口
```

### 构建
```bash
# 仅 Apple Silicon（更快）
npm run tauri build

# 通用二进制（Apple Silicon + Intel，交付用）
npm run tauri build -- --target universal-apple-darwin
```

产物：
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / 跨平台
- **Windows 原生编译**（产出 NSIS `.exe` 安装器）：见 [BUILD-WINDOWS.md](./BUILD-WINDOWS.md)。
- **Linux / macOS Intel / 其它跨平台**：见 [BUILD-CROSS.md](./BUILD-CROSS.md)。

前端 `dist/index.html` 跨平台无需改动；只需在目标平台调整打包配置（`tauri.conf.json` 的 `bundle.targets` 增 `nsis` / `deb` / `appimage`，并安装 WebView2 / webkit2gtk 等系统依赖）。

---

## 📁 目录结构

```
markdown/
├── app-shell.html          # 前端源文件（HTML+CSS+JS，含全部应用逻辑）
├── tools/
│   ├── fetch-vendor.mjs    # 一次性下载依赖到 vendor/（仅准备阶段联网）
│   └── build-html.mjs      # 把 vendor 内联进 dist/index.html（KaTeX 字体→base64）
├── dist/index.html         # 构建产物：完全离线的单文件（Tauri 的 frontendDist）
├── vendor/                 # 下载缓存（.gitignore）
├── package.json            # @tauri-apps/cli + 脚本
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # 窗口 1200×750、严格 CSP、图标、.md 关联、菜单钩子
    ├── capabilities/default.json
    ├── icons/              # cargo tauri icon 生成的全套图标
    └── src/{main.rs, lib.rs}   # 菜单 + 文件读写 + 多窗口路由
```

---

## 🎨 自定义

| 想改 | 位置 |
| --- | --- |
| 应用名 / Bundle ID | `src-tauri/tauri.conf.json` 的 `productName` / `identifier` |
| 窗口尺寸 | `tauri.conf.json` → `app.windows[0]`（默认 1200×750） |
| 图标 | 替换源图后 `npm run icon` |
| 主题色 / 字体 | `app-shell.html` 顶部 `:root` CSS 变量 |
| 菜单项 | `src-tauri/src/lib.rs` 的 `build_menu()` |
| 界面文案 / 帮助文档 | `app-shell.html` 的 `I18N` / `HELP_STRINGS` |
| 依赖版本 | `tools/fetch-vendor.mjs` 顶部 `VERSIONS`（改完 `npm run fetch -- --force`） |

---

## 📄 许可证

本项目自身代码依据 **Apache License 2.0** 开源。

- 完整许可证文本见 [LICENSE](./LICENSE)。
- 第三方组件版权与许可证声明见 [NOTICE](./NOTICE)（marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser 及 Tauri 等，各自遵循 MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0）。
- 依据 Apache-2.0，再分发须保留 LICENSE 与 NOTICE，并在修改过的文件中标注改动。

---

## 📬 联系

问题与建议欢迎联系：**郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
