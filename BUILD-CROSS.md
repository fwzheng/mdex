# 跨平台编译指南（Windows / Linux / macOS Intel）

本指南指导在 **Windows**、**Linux** 和 **macOS Intel** 上从源码编译 MDeX。

> 源码压缩包 `MDeX-src.zip` 已排除 `node_modules/`、`src-tauri/target/`、`dist/` 等可再生文件。
> 解压后按以下步骤操作即可。

---

## 一、通用前提（所有平台都需要）

### 1. Rust 工具链
- 安装 `rustup`：https://rustup.rs/
- 验证：`rustc --version`、`cargo --version`

### 2. Node.js LTS（20.x 或以上）
- 下载：https://nodejs.org/
- 验证：`node --version`、`npm --version`

### 3. 解压源码
```bash
unzip MDeX-src.zip
cd MDeX-src
```

### 4. 安装前端依赖
```bash
npm install
```

---

## 二、macOS Intel 编译

适用于 Intel CPU 的 Mac（非 Apple Silicon）。

### 1. 安装 Xcode Command Line Tools
```bash
xcode-select --install
```

### 2. 编译
```bash
cd <解压目录>
npm install
npm run tauri build -- --target x86_64-apple-darwin
```

> 如果在 Apple Silicon Mac 上交叉编译 Intel 版本，需要先安装 Intel 目标：
> `rustup target add x86_64-apple-darwin`

### 3. 产物

| 文件 | 路径 | 说明 |
|---|---|---|
| **DMG 安装包** | `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/MDeX_0.1.0_x64.dmg` | 双击安装 |
| .app | `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/MDeX.app` | 直接运行 |

### 4. 编译 Universal Binary（可选，同时支持 Intel + Apple Silicon）
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```
产物在 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` 下，体积约翻倍但一个 DMG 兼容所有 Mac。

---

## 三、Windows 编译

### 1. 额外安装：MSVC C++ 生成工具（必装）

Tauri 在 Windows 上**只支持 MSVC 工具链**（不是 MinGW）。

1. 下载 **Visual Studio Build Tools 2022**：
   https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/
2. 安装时勾选工作负荷 **「使用 C++ 的桌面开发」**（含 MSVC 编译器 + Windows SDK，约 6GB）
3. Rust 安装时会自动选 `x86_64-pc-windows-msvc` 目标

验证：
```powershell
rustup target list --installed   # 应含 x86_64-pc-windows-msvc
```

> WebView2 Runtime：Win11 / 较新 Win10 已预装。旧系统从微软官网装 Evergreen Runtime。

### 2. 编译
打开 **PowerShell**（或「Developer PowerShell for VS 2022」）：
```powershell
cd <解压目录>
npm install
npm run tauri build
```

首次编译约 5–10 分钟（下载 + 编译几百个 crate）。

### 3. 产物

| 文件 | 路径 | 说明 |
|---|---|---|
| **NSIS 安装器** | `src-tauri\target\release\bundle\nsis\MDeX_0.1.0_x64-setup.exe` | 双击即装，带图标 |
| 裸 exe | `src-tauri\target\release\mdex.exe` | 可直接运行 |

### 4. 常见问题

| 报错 | 原因 | 解决 |
|---|---|---|
| `linker 'link.exe' not found` | 未装 MSVC | 装「使用 C++ 的桌面开发」工作负荷 |
| `error: Microsoft Visual C++ 14.0` | 同上 | 同上 |
| 打包阶段下载 NSIS 失败 | 网络 | 重试或设代理 |
| 启动白屏 | WebView2 未装 | 装 Evergreen Runtime |

---

## 四、Linux 编译

### 1. 额外安装：系统依赖

**Ubuntu / Debian：**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**Fedora：**
```bash
sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel
```

**Arch / Manjaro：**
```bash
sudo pacman -S --needed webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg
```

> 注意：Tauri v2 需要 **webkit2gtk-4.1**（不是 4.0）。如果包名是 `libwebkit2gtk-4.0-dev`，说明发行版较旧，需升级或换用 4.1。

### 2. 编译
```bash
cd <解压目录>
npm install
npm run tauri build
```

### 3. 产物

| 文件 | 路径 | 说明 |
|---|---|---|
| **DEB 安装包** | `src-tauri/target/release/bundle/deb/MDeX_0.1.0_amd64.deb` | `sudo dpkg -i` 安装 |
| **AppImage** | `src-tauri/target/release/bundle/appimage/MDeX_0.1.0_amd64.AppImage` | 双击运行（需 `chmod +x`） |
| 裸可执行文件 | `src-tauri/target/release/mdex` | 直接 `./mdex` 运行 |

### 4. 常见问题

| 报错 | 原因 | 解决 |
|---|---|---|
| `webkit2gtk-4.1 not found` | 未装系统依赖 | 按上面命令装 |
| `pkg-config error` | 同上 | 同上 |
| AppImage 无法双击运行 | 缺少执行权限 | `chmod +x *.AppImage` |
| 编译时 `could not find library` | 系统库缺失 | 检查 `libgtk-3-dev` 等是否装齐 |

---

## 五、编译流程说明

`npm run tauri build` 会依次执行：

1. **`beforeBuildCommand`** → `node tools/build-html.mjs`
   - 从 `app-shell.html` + `vendor/` 内联所有前端库（marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown）
   - 生成 `dist/index.html`（完全离线单文件，含 base64 字体）
2. **`cargo build --release`** → 编译 Rust 后端，将 `dist/index.html` 嵌入二进制
3. **打包** → 调用平台打包工具（DMG / NSIS / dpkg / appimage）生成安装包

前端资源已全部包含在 `vendor/` 中，编译时不需要联网下载前端库。
首次 `cargo build` 会从 crates.io 下载 Rust 依赖（需要联网），之后缓存。

---

## 六、各平台编译命令速查

| 平台 | 命令 | 产物格式 |
|---|---|---|
| macOS Apple Silicon | `npm run tauri build` | `.dmg` + `.app` |
| macOS Intel | `npm run tauri build -- --target x86_64-apple-darwin` | `.dmg` + `.app` |
| macOS Universal | `npm run tauri build -- --target universal-apple-darwin` | `.dmg` + `.app` |
| Windows | `npm run tauri build` | `.exe` (NSIS 安装器) |
| Linux | `npm run tauri build` | `.deb` + `.AppImage` |

> 所有平台也可用 `npm run tauri build -- --bundles app` 只生成裸可执行文件，不打安装包。

---

## 七、源码压缩包内容

```
MDeX-src/
├── app-shell.html          # 前端主文件（含全部 HTML/CSS/JS）
├── tools/
│   ├── build-html.mjs      # 构建脚本：vendor 内联 → dist/index.html
│   └── fetch-vendor.mjs    # 重新下载前端依赖（需联网，一般不用）
├── vendor/                 # 前端依赖（离线，构建必需）
│   ├── marked.min.js
│   ├── purify.min.js
│   ├── jspdf.umd.min.js
│   ├── html2canvas-pro.min.js
│   ├── turndown.js
│   ├── turndown-plugin-gfm.js
│   ├── katex/              # KaTeX（js + css + base64 字体）
│   └── highlight.js/       # 代码高亮（js + 主题 css）
├── src-tauri/
│   ├── Cargo.toml          # Rust 项目配置
│   ├── Cargo.lock
│   ├── tauri.conf.json     # Tauri 配置（图标、CSP、窗口等）
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/              # 全平台图标（icns/ico/png）
│   └── src/
│       ├── main.rs
│       └── lib.rs          # Rust 后端（菜单、文件操作、PDF 打印等）
├── package.json
├── package-lock.json
├── LICENSE                 # Apache-2.0
├── NOTICE
├── README.md
└── BUILD-CROSS.md          # 本文件
```

**不需要拷贝的**（目标机器上会自动生成）：
- `node_modules/` → `npm install` 生成
- `dist/` → `npm run build:html` 生成
- `src-tauri/target/` → `cargo build` 生成
- `src-tauri/gen/` → Tauri 自动生成

---

## 八、开发调试（可选）

如果需要在目标平台上修改代码并调试：

```bash
npm install
npm run tauri dev    # 开发模式，热重载
```

开发模式下修改 `app-shell.html` 后保存，预览会自动刷新。
修改 `src-tauri/src/lib.rs` 后保存，Rust 会自动重编译。

---

## 九、许可证

本项目依据 Apache-2.0 授权，详见 `LICENSE`。
第三方组件的版权与许可证声明见 `NOTICE`。
