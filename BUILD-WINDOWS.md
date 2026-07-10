# Windows 原生编译指南

在 Windows 上原生编译可产出**真正的安装包**（NSIS `.exe` 安装器），
比 macOS 交叉编译的裸 `.exe` 完整得多（带图标、可随 WebView2 引导安装）。

> 关键：Tauri 在 Windows 上**只支持 MSVC 工具链**（不是 mingw）。
> 下面第 1 步的「C++ 生成工具」是必装项，缺它会在 `cargo build` 阶段报
> `linker 'link.exe' not found`。

---

## 1. 安装 Windows 构建环境（一次性）

### 1.1 Microsoft C++ 生成工具（MSVC）— 必装
下载 **Visual Studio Build Tools 2022**：
https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/

安装时在「工作负荷」里勾选 **「使用 C++ 的桌面开发」**。
（包含 MSVC 编译器 + Windows SDK，约 6GB。）

### 1.2 Rust（rustup，默认装 MSVC 工具链）
下载 https://rustup.rs/ ，运行 `rustup-init.exe`，一路默认即可。
它会自动选 `x86_64-pc-windows-msvc`（正是 Tauri 要的）。

验证：
```powershell
rustc --version
cargo --version
rustup target list --installed   # 应含 x86_64-pc-windows-msvc
```

### 1.3 Node.js LTS（20.x）
下载 https://nodejs.org/ （LTS 版）。
验证：`node --version`、`npm --version`

### 1.4 WebView2 Runtime（运行时需要，编译不需要）
Win11 / 较新 Win10 已预装。旧系统从微软官网装 Evergreen Runtime。
（编译用的 WebView2Loader.dll 由 `webview2-com` 自动内嵌，无需单独 SDK。）

---

## 2. 把项目拷到 Windows

### 必须带上的
- `app-shell.html`
- `tools/` （`build-html.mjs`、`fetch-vendor.mjs`）
- `vendor/` （`marked.min.js` / `katex/` / `highlight.js/` / `purify.min.js` —— **构建必需**，`build-html.mjs` 会把它们内联进 dist）
- `src-tauri/`（**排除 `src-tauri/target/`**，几百 MB 缓存，Windows 用不上且会触发重编）
- `package.json`、`package-lock.json`
- `BUILD-WINDOWS.md`（本文件，备查）

### 可以不带的（会自动生成）
- `node_modules/` → `npm install` 重新生成
- `dist/` → `beforeBuildCommand` 重新生成
- `.DS_Store`、`*.log`

> 用 U 盘 / 网盘 / `scp` 拷整个项目文件夹即可，记得删掉 `src-tauri/target/`。

---

## 3. 编译

打开 **PowerShell**（或「Developer PowerShell for VS 2022」），进到项目根目录：

```powershell
cd <项目根目录>

# 1) 装前端依赖（@tauri-apps/cli + jsdom）
npm install

# 2) 编译 + 打包
npm run tauri build
```

### `tauri build` 会依次做：
1. `beforeBuildCommand` → `node tools/build-html.mjs` → 从 `app-shell.html` + `vendor/` 重新生成 `dist/index.html`（离线单文件）
2. `cargo build --release`（MSVC，首次编译几百个 crate，约 5–10 分钟；之后增量很快）
3. 调 NSIS 打包成安装器（首次会自动下载 NSIS 工具，需联网）

---

## 4. 产物路径

| 文件 | 路径 | 说明 |
|---|---|---|
| **NSIS 安装器** | `src-tauri\target\release\bundle\nsis\MDeX_0.1.0_x64-setup.exe` | 双击即装，带图标、可选「装 WebView2」 |
| 裸 exe | `src-tauri\target\release\mdex.exe` | 可直接跑，需同目录有 `WebView2Loader.dll` |
| 裸 exe 配套 | `src-tauri\target\release\WebView2Loader.dll` | Tauri 自动生成在 exe 旁 |

安装器是首选分发物；裸 exe 适合免安装直接运行。

---

## 5. 常见坑

| 报错/现象 | 原因 | 解决 |
|---|---|---|
| `linker 'link.exe' not found` | 没装 MSVC C++ 生成工具 | 回 1.1 装「使用 C++ 的桌面开发」工作负荷 |
| `error: Microsoft Visual C++ 14.0 or greater is required` | 同上，MSVC 缺失 | 同上 |
| 打包阶段卡住/下载 NSIS 失败 | 首次需下载 NSIS 工具，网络问题 | 重试；或设代理后重跑 |
| 运行报「找不到 WebView2Loader.dll」 | 裸 exe 单独拷走、漏了 dll | 把 `WebView2Loader.dll` 与 `mdex.exe` 放同目录；或直接用 NSIS 安装器 |
| 应用启动白屏 | WebView2 Runtime 未装 | 装 Evergreen Runtime（Win11/新 Win10 已自带） |
| `bundle identifier ... ends with .app` 警告 | `identifier` 是 `com.mdex.app`，以 `.app` 结尾 | 仅警告，不影响构建；洁癖可改成 `com.mdex.desktop` |

---

## 6. 验证修复

装好后启动，在语言下拉切到**阿拉伯语**：
菜单/工具栏、分栏布局、各区内部文字均应保持 LTR，不再翻转（仅界面文案变阿拉伯语）。

> 本次构建已含 RTL 修复：`app-shell.html` 的 `applyLang()` 不再设任何 `dir`，
> `dist/index.html` 经 `build-html.mjs` 重新生成后内嵌进 exe。
