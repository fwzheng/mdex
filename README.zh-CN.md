<details>
<summary><b>🌐 语言：简体中文</b> —— 点击切换其它语言</summary>

[English](README.md) · **[简体中文](README.zh-CN.md)** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>

# MDeX v1.3.3（macOS · Windows · Linux · 完全离线 · Tauri v2）

> **MDeX** · 读作 “em-dex”（/ˌemˈdɛks/）—— 字母 M 接 “dex”，共两个音节。

一个面向 **离线 / 内网 / 隐私保护** 场景的 Markdown 阅读编辑器。所有文件都在本地处理，**不联网、不上传、无云端同步、无广告、无遥测、无数据上传**。

- 纯前端单 HTML（无 Vue / React），Tauri v2 仅提供原生外壳（窗口、菜单、文件对话框）。
- **运行时零网络请求**：`marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` 及 KaTeX 全部 woff2 字体，均以内联 / base64 方式打进单个 `index.html`。
- 支持 `.md` / `.markdown` / `.html`；可设为 `.md` 默认打开方式，双击即开。


---

## 🌐 语言

界面提供 **17 种语言**：简体中文、English、Français、Deutsch、Español、Português、Italiano、Русский、日本語、한국어、العربية、हिन्दी、ਪੰਜਾਬੀ、Tiếng Việt、Bahasa Indonesia、اردو、Монгол (Кирилл)。

- 随时在工具栏「语言」菜单切换，选择会被记忆、跨会话保留。
- **阿拉伯语自动从右向左（RTL）排版**——正文、标题、列表符号以及整个工具栏镜像到右侧；内嵌的代码块、LaTeX 公式、英文术语与版本号始终保持左到右（LTR），绝不被翻转。
- 本 README 本身也已翻译为全部 17 种语言——请用本页最顶部的选择器切换。

---

## ✨ 核心功能

- **多标签页 + 多窗口**：同时打开多个文件；未保存的修改用圆点标记，关闭时询问是否保存；中键点击标签可快速关闭。双击 `.md` 文件按需开独立窗口（一文件一窗口）；已在某窗口打开的文件再次双击会**置顶该窗口**而非重复打开。
- **实时分屏预览**：拖动中间分隔条调整比例；工具栏按钮轮换「分屏 / 仅编辑 / 仅预览」。
- **点击定位**：点击编辑器某处，预览自动滚到对应位置；点击预览某处，编辑器光标跳到对应位置。
- **搜索替换**：查找、逐个替换、全部替换，显示匹配数。
- **数学公式**：行内 `$…$` 与块级 `$$…$$`（也支持 `\(...\)`、`\[...\]`），由 KaTeX 渲染；超长公式自动按运算符折行，无法折行的等比缩小。
- **代码高亮**：自动识别语言着色；大文档按视口懒加载，避免卡顿。
- **Mermaid 图**：` ```mermaid ` 代码块渲染为流程图 / 时序图 / 类图 / 状态图 / 甘特图 / 饼图等；点击预览区的图可弹出独立窗口放大查看（缩放 / 平移 / 居中 / 全屏），并跟随编辑实时更新。
- **图片**：粘贴 / 拖拽 / 选择，自动保存到文档同目录的 `<文件名>_images/` 文件夹并插入相对引用（源码干净、不再 base64）；草稿先存临时目录、保存时迁移；另存为时把图片扁平拷到目标；图片默认居中。
- **字体缩放**：编辑区、预览区各自独立放大 / 缩小（−/百分比/+ 控件，或 `⌘/Ctrl + =/−/0`），点百分比重置；倍率持久化。
- **表格**：GFM 表格；窄表按内容居中，宽表在容器内横向滚动，不被裁切。
- **文献引用（BibTeX）**：`[@key]` / `\cite{key}` 写法，numeric 风格，文末自动生成「参考文献」表，正文 [n] 与条目**双向跳转**；支持文档内嵌 ` ```bibtex ` 块或单独加载 `.bib` 库。
- **HTML 支持**：可直接打开 `.html` 渲染预览；支持 HTML ↔ Markdown 互转。
- **主题 / 语言**：深色 / 浅色主题，**17 种界面语言**（中文、English、Français、Deutsch、Русский、Italiano、日本語、한국어、Español、Português、العربية、हिन्दी、ਪੰਜਾਬੀ、Tiếng Việt、Bahasa Indonesia、اردو、Монгол (Кирилл)——阿拉伯语、乌尔都语自动右到左）。
- **自动草稿**：内容定时暂存，意外关闭 / 崩溃后可恢复。
- **字数统计**：状态栏实时显示字数 / 行数 / 词数 / 字符数，及当前行列号。
- **拖拽打开**：拖拽 `.md` 文件到窗口直接打开；拖拽图片直接插入。
- **多格式导出**：另存为 Markdown / HTML / PDF（矢量打印）/ LaTeX。
- **文字颜色**：工具栏色板把选区包成 `<span style="color:…">`（行内彩色）。
- **前进 / 返回**：跨文档与光标位置的统一导航历史；◀ ▶ 按钮，`Alt+←/→`。
- **跟随链接**：预览中点链接在**新标签页**打开目标文件（http 链接走系统浏览器），当前文档不被替换。

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
| `⌘/Ctrl + =/−/0` | 放大 / 缩小 / 重置（作用最后点击的窗格：编辑区或预览区）|

> 多窗口下，快捷键只作用于当前焦点窗口。图查看器窗口打开时，`⌘/Ctrl + =/−/0` 缩放图片。

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
从任一来源下载对应平台的安装包:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **备用站点**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### macOS 打开未签名程序（绕过 Gatekeeper）

本程序**未做**开发者签名 / 公证（离线场景通常无法联网公证）。在 macOS 12+，**尤其是 macOS 26（Tahoe）** 上，从 `.dmg` 直接运行、或刚复制出来的副本会报 **"MDeX.app is damaged and can't be opened"（已损坏，无法打开）**——这是 Gatekeeper 拦截，并非真的损坏。在终端执行：

1. **先把 `MDeX.app` 从 `.dmg` 拖到 `/Applications`（应用程序）**——切勿直接在 dmg 里双击运行（会触发 App Translocation 与 `com.apple.provenance` 属性，这才是 macOS 26 上「已损坏」的真因）。
2. 清除属性并重新签名：
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` 受 SIP 保护，**即使 `sudo` 也删不掉**；重新签名会重置签名链，使 Gatekeeper 放行。`spctl` 对 ad-hoc 签名会显示 `rejected`——属正常，**不影响** `open` 启动。
3. 用 `open /Applications/MDeX.app` 启动（或双击）。首次打开可能仍提示一次——到「系统设置 → 隐私与安全性 → 仍要打开」确认，或右键 `.app` →「打开」。

---

## 🛠️ 从源码构建

源代码: <https://github.com/fwzheng/mdex>. 请按照仓库中的说明进行编译（初始环境、依赖与构建命令均在仓库文档中）。

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

本项目自身代码遵循 **Apache License 2.0 协议**开源。

第三方组件：项目使用了部分第三方组件（包括但不限于 marked、KaTeX、highlight.js、DOMPurify、jsPDF、html2canvas-pro、turndown、mermaid、@retorquere/bibtex-parser 及 Tauri 等），其版权与许可证声明详见各源码文件。上述组件分别遵循 MIT、BSD-3-Clause、Apache-2.0 及 MPL-2.0 等开源协议。

分发要求：依据 Apache-2.0 协议规定，对本项目进行再分发时，须保留 LICENSE 与 NOTICE 文件；若修改过源文件，须在相应文件中作出明确标注。

---

## 📬 联系

问题与建议欢迎联系：**郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
