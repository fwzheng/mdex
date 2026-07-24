# MDeX Windows x64 安装包交叉编译方法

在 **Linux 宿主机**（无 Docker / VM / Windows 主机）上，为 MDeX（Tauri v2）交叉编译出 Windows x64（`x86_64-pc-windows-msvc`）安装包 `MDeX_<ver>_x64-setup.exe`。

本文档是多次实战（v1.1.0 → v1.4.0）总结的可靠方法，涵盖一次性环境准备、每次编译流程、关键坑与故障排查。

---

## 1. 核心思路

- **cargo-xwin 真交叉编译**到 `x86_64-pc-windows-msvc`：用真 MSVC SDK（从微软 CDN 下 CRT，不走 GitHub），自带 `lld-link`。
- **手写 NSIS 安装器**（`installer/installer.nsi`），用标准 `makensis` 编译。绕过 Tauri 官方 NSIS（它要从 `github.com` releases 下定制 NSIS + 插件，国内被墙）。
- **整条链路零 GitHub 依赖**：微软 CDN、crates.io、jsDelivr/cdnjs 国内均可达；`github.com` releases 完全被墙。

已验证版本：tauri-cli 2.11.x / cargo-xwin 0.23.0 / Rust 1.96+ / NSIS 3.08。

---

## 2. 一次性环境准备

### 2.1 Rust target

```bash
rustup target add x86_64-pc-windows-msvc
# 若 static.rust-lang.org 慢/挂，用 rsproxy 镜像：
# RUSTUP_DIST_SERVER=https://rsproxy.cn rustup target add x86_64-pc-windows-msvc
```

### 2.2 安装 cargo-xwin

```bash
cargo install cargo-xwin --locked   # ~22min, ~100 crate
```

它内嵌 xwin，自动从微软 CDN 下 MSVC CRT + SDK 到 `~/.cache/cargo-xwin/xwin/`，自带 `lld-link`。**首次编译时联网 15s 拿 CRT，之后全缓存。**

### 2.3 LLVM 工具软链（免 sudo）

系统已装 LLVM 14（`/usr/bin/clang-14` 等）。把以下工具软链到 `~/local/bin/`，编译时加进 `PATH`：

```bash
mkdir -p ~/local/bin
ln -sf /usr/bin/llvm-rc-14  ~/local/bin/llvm-rc      # tauri-winres 嵌图标/版本资源要
ln -sf /usr/bin/clang-14    ~/local/bin/clang-cl     # cc-rs 编 C 依赖要
ln -sf /usr/bin/clang-14    ~/local/bin/clang
ln -sf /usr/bin/clang++-14  ~/local/bin/clang++
```

> **两大坑都在最后一步暴露**（前面 ~400 crate 都过）：① `tauri-winres` 报 `NotAttempted("llvm-rc")` → 缺 `llvm-rc`；② `cc-rs` 报 `failed to find tool "clang-cl"` → 缺 `clang-cl`。上面软链一次解决。

### 2.4 NSIS（标准 makensis，免 root）

```bash
# 从 tuna 镜像下 deb 包（免 root）
cd /tmp
apt download nsis nsis-common          # 或从 tuna 手动下
mkdir -p ~/local/nsis
dpkg-deb -x nsis_*.deb ~/local/nsis/
dpkg-deb -x nsis-common_*.deb ~/local/nsis/
```

`makensis` 在 `~/local/nsis/usr/bin/makensis`。它把 `/usr/share/nsis` 写死，用环境变量改路径：

```bash
export NSISDIR=~/local/nsis/usr/share/nsis   # nsis-common 才有 Stubs/Plugins
```

> NSIS 3.08 **无 `!ifexist`** 指令（只有 `!if`/`!ifdef` 系列，没有文件存在判断）。

---

## 3. 每次编译流程（更新 zip 后）

工作目录：`/home/z/temp/mdex_win`，源码来自 `mdex-src.zip`。

### 步骤 1：解压 zip 对比，判断变化范围（关键，决定改哪些）

```bash
cd /home/z/temp/mdex_win
unzip -o -q mdex-src.zip -d /tmp/new      # 解到临时目录对比
# 对比关键文件
for f in app-shell.html src/app.js src-tauri/Cargo.toml src-tauri/Cargo.lock \
         src-tauri/tauri.conf.json src-tauri/capabilities/default.json \
         src-tauri/src/lib.rs tools/fetch-vendor.mjs tools/build-html.mjs package.json; do
  cmp -s "$f" "/tmp/new/$f" 2>/dev/null || echo "[不同] $f"
done
```

**重编快速判断法**：
- 若 `Cargo.toml` / `tauri.conf.json` **仅 `version` 行变**（依赖声明、resources 列表未动）→ nsi 只改 `APP_VERSION` 一处，编译纯增量约 1min。
- 若 `build-html.mjs` / `fetch-vendor.mjs` **变化** → 必须 diff 它们，看是否新增 vendor 文件引用（见 §5 vendor 维护）。
- `capabilities/default.json` 加运行时权限（如 `mermaid-*`/`set-fullscreen`）→ **不影响编译**，忽略。
- `Cargo.toml` 新增依赖 → cargo 自动从 crates.io 下编（国内可达，无需镜像）。

### 步骤 2：同步源

```bash
cd /home/z/temp/mdex_win
unzip -o -q mdex-src.zip                   # 覆盖源文件
find . -name ".DS_Store" -not -path "./node_modules/*" -delete
```

zip 不含 `vendor/` / `dist/` / `node_modules/` / `installer/` / `src-tauri/target/`，覆盖安全（这些目录保留）。

### 步骤 3：改 installer.nsi（按需）

`installer/installer.nsi` 是手写的 NSIS 脚本。两个手动维护点：

1. **`APP_VERSION`**（随 `Cargo.toml` 的 version 改）：
   ```nsi
   !define APP_VERSION   "1.4.0"
   ```
   `OutFile` 名 / `DisplayVersion` / `BrandingText` 自动跟 `${APP_VERSION}`。若版本号未升（同版本号内迭代），**不用改**，新包覆盖旧同名包。

2. **`bundle.resources` 列表**（仅当 `tauri.conf.json` 的 resources 变化时）：官方 `tauri build` 自动装这些资源，手写 NSIS 不自动——需在 `SecCore` 区段加 `File`、`Uninstall` 区段加 `Delete` 同步。当前列表：LICENSE / NOTICE / CHANGELOG + 17 语言 README。

### 步骤 4：构建前端（关键，容易漏）

```bash
node tools/build-html.mjs
```

`tauri.conf.json` 的 `frontendDist: ../dist`，`beforeBuildCommand: node tools/build-html.mjs`。**但 `cargo-xwin build` 是裸 cargo build，不触发 `beforeBuildCommand`**（只有 `tauri build` 才触发）。所以**每次 app-shell.html / src/app.js / vendor 变动后，必须手动跑这一步**，否则 exe 里嵌的是旧前端。

产物 `dist/index.html`（单文件离线，vendor + 应用代码全 base64/内联）。自检：脚本会扫描外链，vendor 库源码注释里的 github.com 版权链接是无害的。

> v1.4.0 起应用代码从 `app-shell.html` 抽到 `src/app.js`（模块化），`build-html.mjs` 内联它到 `<!--APP:js-->`。`src/app.js` 在 zip 里，同步即可。

### 步骤 5：交叉编译 mdex.exe

```bash
cd src-tauri
export PATH="$HOME/local/bin:$PATH"        # 含 llvm-rc/clang-cl 软链
cargo xwin build --release --target x86_64-pc-windows-msvc
```

产物：`src-tauri/target/x86_64-pc-windows-msvc/release/mdex.exe`（~5.2-5.4M，PE32+ GUI x86-64，webview2-com 内嵌，无单独 dll）。

- 依赖未变：增量 ~1min（仅 mdex crate 重编 + LTO relink）。
- 新增依赖：多 30-60s 编译新 crate（如 encoding_rs）。
- `Cargo.toml` 的 release profile：`strip=true` + `lto=true` + `codegen-units=1` + `opt-level="s"`，链接偏慢但体积小。

### 步骤 6：NSIS 打包

```bash
cd /home/z/temp/mdex_win
NSISDIR="$HOME/local/nsis/usr/share/nsis" \
  "$HOME/local/nsis/usr/bin/makensis" -DPROJECT_ROOT="$(pwd)" installer/installer.nsi
```

产物：`installer/MDeX_<ver>_x64-setup.exe`（~3.1-3.2M，LZMA solid）。

`-DPROJECT_ROOT` 传绝对路径，nsi 里所有源文件路径用 `${PROJECT_ROOT}/...` 避免 cwd 歧义。

### 步骤 7：验证

```bash
SETUP=installer/MDeX_1.4.0_x64-setup.exe
EXE=src-tauri/target/x86_64-pc-windows-msvc/release/mdex.exe

# 1. exe 类型
file "$EXE"          # 应为 PE32+ executable (GUI) x86-64, for MS Windows

# 2. 安装包内 exe = 编译产物（sha256 一致）
7z e -y "$SETUP" mdex.exe -o/tmp/chk >/dev/null 2>&1
[ "$(sha256sum "$EXE"|cut -d' ' -f1)" = "$(sha256sum /tmp/chk/mdex.exe|cut -d' ' -f1)" ] && echo "✓ 一致"

# 3. 嵌入内容
7z l "$SETUP"        # 应含 mdex.exe / LICENSE / NOTICE / CHANGELOG / README.* / uninstall.exe
```

**无 wine 无法实测运行**，需在 Windows 上验证安装、文件关联、卸载。

---

## 4. installer.nsi 脚本要点

`installer/installer.nsi` 手写，与 Tauri 官方 NSIS 功能等价：

- MUI2 界面、简体中文 + English 双语言、`Unicode true`（多语言/阿拉伯语必需）、`ManifestDPIAware true`。
- 装到 `$PROGRAMFILES64\MDeX`，`RequestExecutionLevel admin`。
- **文件关联**：`.md` / `.markdown` 注册 ProgID（`MDeX.md` / `MDeX.markdown`）+ DefaultIcon + shell\open\command + Capabilities + RegisteredApplications（出现在"默认应用"里）。
- 开始菜单 + 桌面快捷方式、ARP 卸载条目（含 `EstimatedSize`）、`WriteUninstaller`。
- `WebView2Loader.dll`：Tauri v2 经 webview2-com 内嵌进 exe，**不单独装入**（nsi 里 File 注释掉，仅保留卸载时 Delete，删不存在文件无害）。
- 卸载段：删文件、删快捷方式、删注册表（ProgID / Capabilities / RegisteredApplications / ARP）。

---

## 5. vendor 维护

`mdex-src.zip` 自 v1.2.0 起**不含 `vendor/`**，改 `tools/fetch-vendor.mjs` 从 CDN 下（jsDelivr `cdn.jsdelivr.net/npm` + cdnjs + esm.sh，版本固定写在脚本顶部 `VERSIONS` 字典）。

**正常情况**：`vendor/` 已完整且 `build-html.mjs` 未变 → 直接复用，不必联网 fetch。

**当 `build-html.mjs` / `fetch-vendor.mjs` 变化时**：必须 diff 它们，看是否新增 vendor 文件引用。若 `build-html.mjs` 新增 `read("xxx.js")` 而 `vendor/` 缺此文件 → 直接构建会抛错。补法（下单文件，比跑完整 `npm run fetch` 重下 6M 全量快得多）：

```bash
# 版本号查 fetch-vendor.mjs 顶部 VERSIONS 字典
curl -fsSL https://cdn.jsdelivr.net/npm/<pkg>@<ver>/dist/<file> -o vendor/<file>
```

历史实例：
- v1.3.1 新增 `svg2pdf.umd.min.js`（LaTeX 导出 SVG 用）。
- v1.4.0 `fetch-vendor.mjs` 加了 `vendor/integrity.json` sha256 完整性校验（供应链加固），但**未新增 vendor 下载**，现有 vendor 仍够用；`build-html.mjs` 不读 integrity.json。

> `package.json` 新增 `dependencies`（如 svg2pdf.js）**不用 `npm install`**——`build-html.mjs` 从 `vendor/` 读，不从 `node_modules`。`devDependencies`（typescript/jsdom）也不影响构建，`build-html.mjs` 只用 node 内置模块。

---

## 6. 故障排查

| 症状 | 原因 / 解决 |
|------|------|
| `tauri-winres: NotAttempted("llvm-rc")` | 缺 `llvm-rc` 软链（§2.3） |
| `cc-rs: failed to find tool "clang-cl"` | 缺 `clang-cl` 软链（§2.3） |
| `cargo xwin build` 嵌的前端是旧的 | 忘了手动跑 `node tools/build-html.mjs`（§步骤4） |
| `build-html.mjs` 抛 `read()` 错 | `vendor/` 缺新引用的文件（§5） |
| makensis 找不到 Stubs/Plugins | `NSISDIR` 没指对（需 nsis-common 解压） |
| `github.com` 连接超时 | 链路里有 GitHub 依赖，应走 cargo-xwin（微软 CDN）+ 手写 NSIS，不用 `tauri build` |
| rustup 下载慢 | `RUSTUP_DIST_SERVER=https://rsproxy.cn` |
| 安装包内 exe 与编译产物 sha256 不符 | 打包前 exe 被重新编译过，重跑步骤 6 |

### 判断"安装包是否含最新修改"

`strip=true` 会去掉部分 Rust 符号字符串，tauri 嵌入前端资源时**压缩存储**，所以 `grep`/`strings` exe 找特定字符串不可靠（会漏报）。用以下三条硬证据：

1. **sha256 一致**：安装包内 mdex.exe = `target/.../release/mdex.exe`
2. **时间链**：zip 解压 → dist 重建 → exe 编译 → setup 打包，每步晚于上一步
3. **dist 内容**：`grep` dist/index.html 确认新功能字符串已内联

---

## 7. 版本演进速查

| 版本 | 关键变化 | 对编译流程的影响 |
|------|----------|------------------|
| v1.1.0 | 基线 | 首次建立流程 |
| v1.2.0 | 新依赖 opener/single-instance/tokio/base64；vendor 改按需下载；resources 扩到 17 语言 README | nsi 加 resources 装入；vendor 复用 |
| v1.3.0 | mermaid 查看器窗口、字体缩放、图片存 `<文件名>_images/` | 仅版本号 + 前端 |
| v1.3.1 | LaTeX 导出增强；新增 `svg2pdf.umd.min.js` vendor；`app_icon_path` command | **补 vendor 文件** |
| v1.3.2-1.3.4 | PDF 导出修复、状态栏路径、Windows 图片渲染修复（BUG-080）等 | 仅前端 + 版本号 |
| v1.4.0 | 架构升级：前端模块化（`src/app.js`）、integrity.json、`encoding_rs` 依赖、原子写/并发安全 | src/app.js 同步即可；encoding_rs 自动下编；不需 npm install |

---

## 8. 备注

- **ARM64 版**：同一 cargo-xwin 链路可编 `aarch64-pc-windows-msvc`，几乎零额外坑（cargo-xwin 自动按 target 选 XWIN_ARCH，复制 x64 的 nsi 改 3 处路径即可）。详见独立工作目录。
- **交叉编译 vs 官方**：本方法产物与作者 macOS 官方构建功能等价（同源码、同 Tauri），仅运行时 webview 引擎不同（Windows 用 WebView2/Chromium，macOS 用 WKWebView）——上游纯前端逻辑 bug（如 Windows 路径分隔符 BUG-080）与本工具链无关，所有 Windows 运行版皆受影响。
- 产物归档：`installer/MDeX_<ver>_x64-setup.exe`，多版本并列保留。
