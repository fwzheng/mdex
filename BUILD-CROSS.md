# MDeX 跨平台编译指南（多架构总览）

> 本文件是**总览**：列出 MDeX 全部安装包的编译分工与速查，每个架构指向同目录下的**独立实战文档**。
> 详细步骤、踩坑、排错、一键脚本均在各架构文档里——本文件不重复，只给骨架与决策依据。

MDeX 共发布 **5 类**安装包，在**两处**编译：

| 产物 | 编译位置 | 方法 | 产物格式 | 详细文档 |
|---|---|---|---|---|
| macOS（Apple Silicon / 通用） | **macOS 本机** | `npm run tauri build` | `.dmg` / `.app` | 本文 §三 |
| Linux x86_64 (amd64) | **Linux x86_64 本机** | `npm run tauri build` | `deb` / `rpm` / `AppImage` | [BUILD-LINUX_AMD64.md](BUILD-LINUX_AMD64.md) |
| Linux arm64 (aarch64) | **Linux x86_64 主机** | Docker arm64 容器 / sysroot 交叉 | `deb` / `rpm` / `AppImage` | [BUILD-LINUX-ARM64.md](BUILD-LINUX-ARM64.md) |
| Windows x86_64 | **Linux x86_64 主机** | cargo-xwin + 手写 NSIS | `.exe` (NSIS) | [BUILD-WINDOWS-X86.md](BUILD-WINDOWS-X86.md) |
| Windows arm64 | **Linux x86_64 主机** | cargo-xwin + 手写 NSIS | `.exe` (NSIS) | [BUILD-WINDOWS-ARM64.md](BUILD-WINDOWS-ARM64.md) |

> **为什么分两处**：Tauri 的 Windows 包只能用 MSVC 工具链、Linux 包需 `webkit2gtk` 系统库，二者在 macOS 上都无法原生编。故 Windows/Linux 的 **4 个架构统一在一台 Linux x86_64 主机**上交叉/模拟编出；macOS 包在 macOS 本机编。

---

## 一、通用前提（所有架构都要）

### 1. Rust + Node（国内用镜像加速）

```bash
# Rust（国内强烈建议走 rsproxy 镜像，否则 rustup/crate 拉取极慢或失败）
RUSTUP_DIST_SERVER=https://rsproxy.cn curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# cargo 镜像持久化写 ~/.cargo/config.toml：replace-with='rsproxy-sparse'
rustc --version && cargo --version

# Node.js LTS (>= 20)
node --version && npm --version
```

### 2. 源码包 `mdex-src.zip`

```bash
unzip -o mdex-src.zip          # 顶层无包裹目录，直接在当前目录解压
```

- 含：`src/`、`src-tauri/`（排除 `target/`、`gen/`）、`app-shell.html`、`tools/`、`package.json`、`Cargo.lock`、`README*.md`、`CHANGELOG.md`、`bug_history.md`、`claude.md`、`BUILD-*.md`。
- **不含**：`node_modules/`、`dist/`、`src-tauri/target/`、`src-tauri/gen/`（目标机自动生成）。
- **vendor**：是否含 `vendor/` 取决于打包批次——若含则解压即编（跳过 §六 vendor 维护）；若不含则按 §六 从镜像补齐。各架构文档默认按"不含 vendor"给出 fetch 步骤。

### 3. 前端构建（生成 `dist/index.html`）

```bash
npm install                    # 装 devDependencies（@tauri-apps/cli 等），build-html 只用 node 内置模块，理论可不装
node tools/build-html.mjs      # app-shell.html + vendor/ + src/app.js → dist/index.html（离线单文件，字体 base64 内嵌）
```

> **重要**：`dist/index.html` 是编译时由 `tauri-codegen` **embed 进二进制**的。`npm run tauri build` 会自动跑 `build-html`（经 `beforeBuildCommand`）；但 **`cargo xwin build`（Windows 交叉）是裸 cargo，不触发 `beforeBuildCommand`**——每次前端变动后必须**手动**跑 `node tools/build-html.mjs`，否则 exe 里嵌的是旧前端。

---

## 二、`tauri build` 内部步骤（所有架构通用）

1. `beforeBuildCommand` → `node tools/build-html.mjs`：内联 vendor + `src/app.js` 成 `dist/index.html`
2. `cargo build --release`：编译 Rust，将 `dist/index.html` embed 进二进制（profile：`lto=true` + `codegen-units=1` + `panic=abort` + `strip=true` + `opt-level="s"`）
3. 打包：调平台打包工具（macOS `bundle_dmg` / Linux `dpkg`+`rpm`+`linuxdeploy` / Windows NSIS）

> Rust 增量：仅前端变（`lib.rs`/依赖未变）也要重链（LTO 是瓶颈，~1min）；`lib.rs` 或 `Cargo.toml` 依赖变则重编对应 crate。

---

## 三、macOS 编译（本机）

在 Apple Silicon Mac 上（Intel Mac 见末尾）。两个 target 默认/已装，可立即编。

### 1. Apple Silicon（aarch64）

```bash
npm run tauri build
# 产物：src-tauri/target/release/bundle/dmg/MDeX_<ver>_aarch64.dmg
```

### 2. Universal（Intel + Apple Silicon 通用，推荐发布）

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # 一次性
npm run tauri build -- --target universal-apple-darwin
# 产物：src-tauri/target/universal-apple-darwin/release/bundle/dmg/MDeX_<ver>_universal.dmg
```

一个 dmg 兼容所有 Mac；体积比单架构略增（仅 Rust 二进制翻倍，前端资源不重复）。

### 3. Intel Mac（x86_64，可选）

```bash
npm run tauri build -- --target x86_64-apple-darwin
```

### ⚠ 项目搬迁目录后必清 target 缓存

项目目录移动过（如从 `markdown_temp/extracted/` 移到当前目录）后，非 host 的 `src-tauri/target/<triple>/`（如 `aarch64-apple-darwin/`、`x86_64-apple-darwin/`）会残留**旧绝对路径**，编 universal 时报 `failed to read plugin permissions ... <旧路径>/app_hide.toml`。修法：`rm -rf src-tauri/target/aarch64-apple-darwin src-tauri/target/x86_64-apple-darwin` 后重编（host 的 `target/release` 不受影响）。

---

## 四、Linux 编译（Linux 主机）

### 1. x86_64 (amd64) —— 本机原生

系统依赖（Tauri v2 要 **webkit2gtk-4.1**，不是 4.0）：

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
npm run tauri build     # 一次出 deb + rpm + AppImage 三套
```

**关键坑**：`deb`/`rpm` 总能成功；**AppImage 间歇失败**（最后一步 `linuxdeploy` 要从 GitHub 下 type2-runtime，国内被墙，报 `failed to run linuxdeploy`）。失败时 AppDir 已生成完整，走手动打包（提取本地 runtime + appimagetool + desktop-file-validate 三件套）。**完整步骤见 [BUILD-LINUX_AMD64.md](BUILD-LINUX_AMD64.md)。**

### 2. arm64 (aarch64) —— x86 主机交叉/模拟

两条路线（详见 [BUILD-LINUX-ARM64.md](BUILD-LINUX-ARM64.md)）：

| 路线 | 产物 | 速度 | 要点 |
|---|---|---|---|
| **A. Docker arm64 容器**（推荐，出全套） | deb + rpm + AppImage | 慢（qemu 模拟，首次 ~40min） | `linuxdeploy` 假定主机架构=目标架构，**AppImage 必须在纯 arm64 容器内打**，否则捆进 x86_64 库成废包 |
| **B. sysroot 交叉** | deb + rpm（不出 AppImage） | 快（真交叉，~5min） | 装 `gcc-aarch64-linux-gnu`；`apt download`+`dpkg-deb -x` 建用户态 sysroot（避免 `python3:arm64` 冲突） |

**关键坑**：qemu 下 cargo 高并发死锁 → `CARGO_BUILD_JOBS=2`；pkg-config 路径用 GNU triplet `aarch64-linux-gnu`；sysroot 悬空绝对 `.so` 软链要改相对（`fix-sysroot-symlinks.sh`）。

---

## 五、Windows 编译（Linux 主机，cargo-xwin）

**核心思路**：用 `cargo-xwin` 真交叉编译（微软 CDN 下 MSVC CRT + SDK，**零 GitHub 依赖**），配**手写 NSIS**（绕过 Tauri 官方 NSIS 要从 `github.com` 拉定制 NSIS+插件、国内必挂）。x86 与 arm64 走**完全相同链路**，仅 target 三元组不同、nsi 改 3 处。

```bash
rustup target add x86_64-pc-windows-msvc      # arm64: aarch64-pc-windows-msvc
cargo install cargo-xwin --locked             # 内嵌 xwin，自带 lld-link
# LLVM 工具软链（免 sudo，两大坑都在编译最后暴露）
ln -sf /usr/bin/llvm-rc-14 ~/local/bin/llvm-rc      # tauri-winres 要
ln -sf /usr/bin/clang-14   ~/local/bin/clang-cl     # cc-rs 要
# NSIS（apt download 解到家目录，免 root，用 NSISDIR 改路径）

# 编译流程（每次）
node tools/build-html.mjs                                          # ⚠ 必须手动跑，cargo-xwin 不触发 beforeBuildCommand
cd src-tauri && cargo xwin build --release --target x86_64-pc-windows-msvc   # arm64 换 aarch64-pc-windows-msvc
NSISDIR=~/local/nsis/usr/share/nsis ~/local/nsis/usr/bin/makensis -DPROJECT_ROOT=$(pwd) installer/installer.nsi
```

- 产物：`src-tauri/target/<triple>/release/mdex.exe`（~5MB，PE32+ GUI）+ `installer/MDeX_<ver>_[x64|arm64]-setup.exe`（~3MB，LZMA）。
- arm64 的 nsi 由 x64 复制改 3 处：`x86_64-`→`aarch64-`、`_x64-setup`→`_arm64-setup`（一行 sed）。
- **完整步骤、installer.nsi 要点、故障排查见 [BUILD-WINDOWS-X86.md](BUILD-WINDOWS-X86.md) / [BUILD-WINDOWS-ARM64.md](BUILD-WINDOWS-ARM64.md)。**
- 备选：若有 Windows 机器，也可在 Windows 上原生 MSVC 编（见 [BUILD-WINDOWS.md](BUILD-WINDOWS.md)）。

---

## 六、vendor 维护（公共）

`tools/build-html.mjs` 把 `vendor/` 下的库内联进 `dist/index.html`，**vendor 缺文件会在 Rust 编译前抛 `ENOENT`**。

- **zip 含 vendor** → 解压即编，跳过本节。
- **zip 不含 vendor**（自 v1.2.0 起的精简包惯例）→ 作者的 `npm run fetch`（`tools/fetch-vendor.mjs`）走 jsDelivr/cdnjs，**国内被墙**。用国内镜像替代：
  - npm 包 → **npmmirror** 的 tgz 解包（文件直链 404，只有 tgz 可用）
  - highlight.js → **BootCDN**（cdnjs 国内镜像）
  - bibtex-parser → **esm.sh**
- **补单文件**（比全量 fetch 快）：查 `tools/fetch-vendor.mjs` 顶部 `VERSIONS` 字典拿包名+版本，从 npmmirror 下 tgz 提取 `dist/<file>`。
- **重编复用**：vendor 版本未变时（diff `fetch-vendor.mjs` 的 VERSIONS 与 `vendor/manifest.json`），重编无需重新抓取；`unzip -o` 不覆盖已存在的 vendor。

> 各架构文档有针对性的 vendor 抓取脚本（如 Linux arm64 的 `fetch-vendor-cn.py` + `fetch-bibtex.mjs`）。

---

## 七、版本演进速查（排错参考）

| 版本 | 关键变化 | 对编译的影响 |
|---|---|---|
| v1.1.0 | 基线 | 首次建立流程 |
| v1.2.0 | 新依赖 `opener`/`single-instance`/`tokio`/`base64`；vendor 改按需下载；resources 扩到 17 语言 README | nsi 加 resources 装入；vendor 复用 |
| v1.3.0 | mermaid 查看器、字体缩放、图片存 `<文件名>_images/` | 仅版本号 + 前端 |
| v1.3.1 | 新增 `svg2pdf.umd.min.js` vendor（PDF 导出 SVG） | **补 vendor 文件** |
| v1.3.2–1.3.4 | PDF 导出修复、Windows 图片渲染修复（BUG-080）等 | 仅前端 + 版本号 |
| v1.4.0 | 前端模块化（`src/app.js`）；`integrity.json`；`encoding_rs` 依赖；原子写/并发安全 | `src/app.js` 同步即可；encoding_rs 自动下编；不需 `npm install` |

> `encoding_rs`、`svg2pdf.js` 等新增依赖一旦首次编译/下载完成，后续版本缓存命中，无需重复处理。
> **重要**：作者会在**同一版本号内**发 hotfix（如 1.4.0 的 zip 二次更新只改 `src/app.js`，版本号没动）。判断变化**不能只看版本号**，必须 `diff` 关键文件（`app-shell.html`/`src/app.js`/`Cargo.toml`/`build-html.mjs`/`fetch-vendor.mjs`）。

---

## 八、源码包内容

```
mdex-src/
├── app-shell.html          # 前端模板（HTML/CSS + <!--APP:js--> 占位）
├── src/app.js              # 应用逻辑（v1.4.0+ 模块化，构建期内联到 <!--APP:js-->）
├── tools/
│   ├── build-html.mjs      # 构建脚本：app-shell.html + vendor + src/app.js → dist/index.html
│   └── fetch-vendor.mjs    # 重新下载前端依赖（需联网，VERSIONS 字典固定版本）
├── vendor/                 # 前端依赖（离线，构建必需；精简包不含，按 §六 补）
├── src-tauri/
│   ├── Cargo.toml / Cargo.lock
│   ├── tauri.conf.json     # Tauri 配置（图标、CSP、窗口、fileAssociations）
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/              # 全平台图标（icns/ico/png）
│   └── src/{main.rs,lib.rs}# Rust 后端（菜单、文件操作、PDF 打印等）
├── package.json / package-lock.json / tsconfig.json
├── LICENSE / NOTICE / README*.md / CHANGELOG.md
└── BUILD-*.md              # 本文件 + 各架构实战文档
```

**目标机自动生成**（不需拷贝）：`node_modules/`（`npm install`）、`dist/`（`build-html`）、`src-tauri/target/`（`cargo build`）、`src-tauri/gen/`（Tauri 自动）。

---

## 九、开发调试（可选）

```bash
npm install
npm run tauri dev    # 开发模式，热重载
```

修改 `app-shell.html` / `src/app.js` 后保存，预览自动刷新；修改 `src-tauri/src/lib.rs` 后保存，Rust 自动重编译。

---

## 十、许可证

本项目依据 Apache-2.0 授权，详见 `LICENSE`。第三方组件的版权与许可证声明见 `NOTICE`。
