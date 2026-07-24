# Windows ARM64 交叉编译指南（Linux 主机）

在 **x86 Linux** 主机上，为 **Windows ARM64**（`aarch64-pc-windows-msvc`）交叉编译出 MDeX 的原生安装包
（`MDeX_<ver>_arm64-setup.exe`），**无需 Windows 主机 / 虚拟机 / Docker**。

> 本指南补充作者 `BUILD-WINDOWS.md`（Windows 上原生编 x64）与 `BUILD-CROSS.md` 未覆盖的场景。
> 已验证版本：1.3.4 / 1.4.0 / 1.4.0（同版本号 hotfix）。最后验证日期：2026-07-24。

---

## 一、核心思路

```
mdex-src.zip ──► [重建前端 dist] ──► [cargo-xwin 交叉编译] ──► mdex.exe (ARM64 PE)
                                                                          │
                                          [手写 NSIS 安装器] ◄────────────┘
                                                                          │
                                                          MDeX_<ver>_arm64-setup.exe
```

- **cargo-xwin** 做「真交叉编译」到 `aarch64-pc-windows-msvc`：用真正的微软 MSVC CRT + Windows SDK（从**微软 CDN** 下，不走 GitHub），由它自带的 `lld-link` 链接。
- **手写标准 NSIS 安装器**：Tauri 官方的 `--bundles nsis` 要从 `github.com` 拉它定制的 NSIS + 插件，国内被墙必挂 → 改用标准 `makensis` + 自己写的 `.nsi`。

> **整条链路零 GitHub 依赖**——这是关键，因为国内 `github.com` releases 完全不通（连 aria2c 多线程都过不去）；
> 只有 `raw.githubusercontent.com` 偶尔能通但极慢。微软 CDN、crates.io、rsproxy.cn、jsDelivr/npmmirror 均可达。

ARM64 与 x64 走**完全相同**的链路，只是 target 三元组不同、nsi 改 3 处。cargo-xwin 会按 target 自动选 ARM64 的 CRT/SDK，**几乎零额外坑**。

---

## 二、环境前提（一次性安装）

### 2.1 Rust 工具链 + aarch64 target

`rustup` 默认从 `static.rust-lang.org` 下载，国内慢/挂。用 **rsproxy.cn** 镜像：

```bash
RUSTUP_DIST_SERVER=https://rsproxy.cn rustup target add aarch64-pc-windows-msvc
# （若还要编 x64：rustup target add x86_64-pc-windows-msvc）

rustup target list --installed | grep aarch64   # 确认
```

### 2.2 cargo-xwin（内嵌 xwin，自动下 MSVC SDK）

```bash
cargo install cargo-xwin --locked     # 约 22min，~100 crate；装过则跳过
cargo xwin --version                  # 确认（如 cargo-xwin-xwin 0.23.0）
```

它内嵌 `xwin`，首次编译时自动从**微软 CDN** 把 MSVC CRT + Windows SDK 下到 `~/.cache/cargo-xwin/xwin/`，
并自带 `lld-link` 链接器。**注意**：xwin 默认同时下载 `x86_64` + `aarch64` 两套架构
（见 `~/.cache/cargo-xwin/xwin/DONE`），所以**编 x64 时 aarch64 的 CRT/SDK 就一并下好了**，
之后编 ARM64 全程零网络。

### 2.3 LLVM 工具软链（免 sudo）

系统若已装 LLVM（如 Debian 的 `llvm-14`），做 4 个软链到 `~/local/bin/`，编译时把它加进 `PATH`：

```bash
mkdir -p ~/local/bin
ln -sf /usr/bin/llvm-rc-14  ~/local/bin/llvm-rc     # tauri-winres 嵌图标/版本资源要
ln -sf /usr/bin/clang-14    ~/local/bin/clang-cl    # cc-rs 编 C 依赖要
ln -sf /usr/bin/clang-14    ~/local/bin/clang
ln -sf /usr/bin/clang++-14  ~/local/bin/clang++
```

> 这两个工具缺失是**两大坑**，且都在编译最后才暴露（前面几百个 crate 都过）：
> ① `tauri-winres` 报 `NotAttempted("llvm-rc")` → 缺 `llvm-rc`；
> ② `cc-rs` 报 `failed to find tool "clang-cl"` → 缺 `clang-cl`。

### 2.4 NSIS（apt 下载解到家目录，免 root）

`makensis` 把 `/usr/share/nsis` 路径写死，用 **`NSISDIR` 环境变量**改路径：

```bash
cd /tmp
apt download nsis nsis-common          # 走 tuna 镜像即可（/etc/apt/sources.list 已配）
mkdir -p ~/local/nsis
dpkg-deb -x nsis_*.deb      ~/local/nsis/
dpkg-deb -x nsis-common_*.deb ~/local/nsis/

# 验证
NSISDIR=$HOME/local/nsis/usr/share/nsis $HOME/local/nsis/usr/bin/makensis -VERSION
```

---

## 三、编译流程

> 下文假设工作目录为 `/home/z/temp/mdex-win-arm`，源码包为 `mdex-src.zip`。
> 新版源码直接覆盖解压即可（`unzip -o`），`vendor/`、`dist/`、`src-tauri/target/` 不在 zip 里、会保留。

### 3.1 解压源码

```bash
cd /home/z/temp/mdex-win-arm
unzip -oq mdex-src.zip
```

zip **不含** `vendor/`（自 mdex v1.2.0 起），需单独准备（见 3.2）。

### 3.2 准备 vendor（前端依赖）

`tools/build-html.mjs` 会把 `vendor/` 下的库内联进 `dist/index.html`，**vendor 缺失则 build 直接报 ENOENT**。

**优先复用**已有工作目录的 vendor（最快，零网络）：

```bash
cp -r /path/to/上一个mdex工作目录/vendor ./vendor     # 如 /home/z/temp/mdex_win/vendor
```

复用前**务必 diff** 新旧 `tools/build-html.mjs` 和 `tools/fetch-vendor.mjs`，确认没有新增 vendor 文件引用：

```bash
# 把新 zip 解到临时目录对比
unzip -oq mdex-src.zip -d /tmp/mdex-new
diff tools/build-html.mjs   /tmp/mdex-new/tools/build-html.mjs   && echo "build-html 一致"
diff tools/fetch-vendor.mjs /tmp/mdex-new/tools/fetch-vendor.mjs && echo "fetch-vendor 一致"
```

- **一致** → 直接复用旧 vendor。
- **build-html.mjs 新增了某文件引用**（如 v1.3.1 的 `svg2pdf.umd.min.js`、v1.4.0 的 `src/app.js` 内联）
  → 旧 vendor 缺该文件会抛错。补单文件比全量 fetch 快得多：
  ```bash
  # 版本号查 fetch-vendor.mjs 顶部的 VERSIONS 字典
  curl -fsSL https://registry.npmmirror.com/<pkg>/-/pkg>-<ver>.tgz -o /tmp/s.tgz
  tar -xzf /tmp/s.tgz -C /tmp && cp /tmp/package/dist/<file> vendor/
  ```
  （jsDelivr 国内偶尔超时，**npmmirror 淘宝镜像更稳**。）

> `build-html.mjs` 只用 Node 内置 `fs/path`，**不需要 `npm install`**。
> v1.4.0 起 `fetch-vendor.mjs` 新增 `vendor/integrity.json`（sha256 完整性锁），
> 但 `build-html.mjs` 不读它，复用旧 vendor 缺 integrity.json 无妨。

### 3.3 重建前端 dist

```bash
node tools/build-html.mjs
ls -la dist/index.html      # 应为 ~6MB（含 base64 字体）
```

> **关键**：`cargo-xwin build` 是裸 `cargo build`，**不触发** `tauri.conf.json` 的 `beforeBuildCommand`。
> 所以每次前端（`app-shell.html` / `vendor/` / `src/app.js`）变化后，**必须先手动跑 build-html.mjs** 重新生成 `dist/`，
> 否则 exe 里嵌的是旧前端。`dist/index.html` 是编译时由 `tauri-codegen` embed 进二进制的。

### 3.4 cargo-xwin 交叉编译到 ARM64

```bash
export PATH=$HOME/local/bin:$PATH          # 让 cargo 找到 llvm-rc / clang-cl 等软链
cd src-tauri
cargo xwin build --release --target aarch64-pc-windows-msvc
```

- 从零编译约 **3–4 分钟**；增量（仅 mdex crate 重编）约 **1 分钟**。
- 产物：`src-tauri/target/aarch64-pc-windows-msvc/release/mdex.exe`（~5 MB）
- `webview2-com` 已把 `WebView2Loader.dll` 内嵌进 exe，**无单独 dll**。
- `webview2-com` / `windows` crate / `tauri` / `tauri-plugin-single-instance` 全部在 ARM64 一次编过，**无任何 ARM 特有问题**。

### 3.5 NSIS 打包

installer 脚本在工作目录 `installer/installer.nsi`（首次需从 x64 版复制并改 3 处，见第五节）。
**在项目根目录**执行（`PROJECT_ROOT` 传绝对路径，避免 cwd 歧义）：

```bash
cd /home/z/temp/mdex-win-arm
NSISDIR=$HOME/local/nsis/usr/share/nsis \
  $HOME/local/nsis/usr/bin/makensis -DPROJECT_ROOT=$(pwd) installer/installer.nsi
```

产物：`installer/MDeX_<ver>_arm64-setup.exe`（~3 MB，LZMA solid 压缩）。

### 3.6 验证

```bash
# 1) exe 架构（必须是 AArch64）
file src-tauri/target/aarch64-pc-windows-msvc/release/mdex.exe
#   期望：PE32+ executable (GUI) Aarch64, for MS Windows

# 2) 安装包内容
7z l installer/MDeX_1.4.0_arm64-setup.exe | grep -E 'mdex.exe|LICENSE|NOTICE|uninstall'

# 3) 安装包内嵌的就是最新 exe（md5 应一致）
7z e -y -o/tmp/v installer/MDeX_1.4.0_arm64-setup.exe >/dev/null
md5sum /tmp/v/mdex.exe src-tauri/target/aarch64-pc-windows-msvc/release/mdex.exe
```

---

## 四、产物

| 文件 | 路径 | 说明 |
|---|---|---|
| **NSIS 安装器** | `installer/MDeX_<ver>_arm64-setup.exe` | 双击即装，ARM64 Windows 原生 |
| 裸 exe | `src-tauri/target/aarch64-pc-windows-msvc/release/mdex.exe` | AArch64 PE，可单独拷走运行 |

安装器功能（与作者 x64 安装器等价）：
- MUI2 中/英双语界面、装到 `C:\Program Files\MDeX`
- `.md` / `.markdown` 文件关联 + Capabilities + 注册到「默认应用」
- 开始菜单 + 桌面快捷方式、ARP（添加/删除程序）卸载条目
- 内嵌 LICENSE / NOTICE / CHANGELOG + 17 语言 README + 卸载器

---

## 五、NSIS 安装器脚本

完整脚本在工作目录 `installer/installer.nsi`。**基于 x64 版复制，只改 3 处**（一行 sed 搞定）：

```bash
sed -i 's|x86_64-pc-windows-msvc|aarch64-pc-windows-msvc|g; s|_x64-setup\.exe|_arm64-setup.exe|g' installer/installer.nsi
```

| 改动点 | x64 | ARM64 |
|---|---|---|
| `SRC_EXE` / `SRC_DLL` 路径 | `target/x86_64-pc-windows-msvc/...` | `target/aarch64-pc-windows-msvc/...` |
| `OutFile` | `MDeX_<ver>_x64-setup.exe` | `MDeX_<ver>_arm64-setup.exe` |

**不需要改**的（ARM64 Windows 上行为正确）：
- `$PROGRAMFILES64` → ARM64 Win 上指向 `Program Files`（原生 ARM64 程序目录）
- `${RunningX64}` → ARM64 Win11 属 64 位，返回 true，不会误拦
- `SetRegView 64` → 正确

**版本号维护**：`APP_VERSION` 是唯一手动维护点（如 `!define APP_VERSION "1.4.0"`），
`OutFile` 名、`DisplayVersion`、`BrandingText` 都通过 `${APP_VERSION}` 自动跟随。

> NSIS 3.08 **没有 `!ifexist` 指令**（只有 `!if` / `!ifdef` 系列），脚本里别用文件存在判断。

---

## 六、重编 / 升级流程（快速判断）

新 zip 来了，**先 diff 判断改动范围**（不要只看版本号！）：

```bash
unzip -oq mdex-src.zip -d /tmp/mdex-new
diff src-tauri/Cargo.toml       /tmp/mdex-new/src-tauri/Cargo.toml
diff src-tauri/tauri.conf.json  /tmp/mdex-new/src-tauri/tauri.conf.json
diff tools/build-html.mjs       /tmp/mdex-new/tools/build-html.mjs
diff tools/fetch-vendor.mjs     /tmp/mdex-new/tools/fetch-vendor.mjs
diff -rq src-tauri/src          /tmp/mdex-new/src-tauri/src
diff -rq src                    /tmp/mdex-new/src        # app.js 等
diff app-shell.html             /tmp/mdex-new/app-shell.html
diff -rq src-tauri/capabilities /tmp/mdex-new/src-tauri/capabilities
```

按 diff 结果分类处理：

| 情形 | 处理 | nsi |
|---|---|---|
| **仅 `version` 行变** | `unzip -o` → `cargo xwin build`（增量 ~1min）→ `makensis` | 改 `APP_VERSION` 一处 |
| **前端变**（`app-shell.html` / `src/app.js` / vendor） | `unzip -o` → `node build-html.mjs` → `cargo xwin build`（重编 mdex crate）→ `makensis` | 按版本号 |
| **Rust 依赖变**（Cargo.toml 新增 crate） | `unzip -o` → `cargo xwin build`（新 crate 自动下编）→ `makensis` | 按版本号 |
| **版本号不变但 zip 更新**（同版本号 hotfix） | 同「前端变」/「Rust 变」流程，**nsi 不动** | 不改 |

> **重要**：作者会在**同一版本号内**发 hotfix（如 1.4.0 的 zip 二次更新只改了 `src/app.js`，版本号没动）。
> 判断变化**不能只看版本号**，必须 diff 文件。

**确认前端真的进了 exe**（exe 字节数可能恰好不变，不能靠大小判断）：
1. `dist/index.html` 的 md5 编译前后变了 → build-html 生效
2. 编译日志出现 `Compiling mdex v<ver>` → mdex crate 重编（dist 变触发 tauri-codegen `rerun-if-changed`）
3. 安装包内 exe md5 == 刚编译的 exe md5 → embed 生效

---

## 七、常见坑与排错

| 报错/现象 | 原因 | 解决 |
|---|---|---|
| `tauri-winres: NotAttempted("llvm-rc")` | 缺 `llvm-rc` 软链 | 见 2.3 建 `llvm-rc` → `llvm-rc-14` 软链 |
| `cc-rs: failed to find tool "clang-cl"` | 缺 `clang-cl` 软链 | 见 2.3 建 `clang-cl` 软链 |
| build-html `ENOENT: vendor/xxx.js` | vendor 缺该文件（build-html.mjs 新增了引用） | 见 3.2 从 npmmirror 补单文件 |
| build-html `ENOENT: src/app.js` | v1.4.0+ 内联 `src/app.js`，但没解压出来 | `unzip -o mdex-src.zip` 确保 `src/app.js` 在 |
| `rustup target add` 卡住/超时 | 默认源慢 | `RUSTUP_DIST_SERVER=https://rsproxy.cn` 镜像 |
| exe 里嵌的是旧前端 | 没先跑 build-html.mjs 就编译 | 先 `node tools/build-html.mjs` 再 `cargo xwin build` |
| Tauri `--bundles nsis` 下载失败 | github.com 被墙 | 不要用官方 NSIS，走本指南的手写 nsi + makensis |
| `file` 显示 exe 非 AArch64 | target 写错 / 编错版本 | 确认 `--target aarch64-pc-windows-msvc`，重验 file |
| 装好但白屏 | 目标机没装 WebView2 Runtime | ARM64 Win11 已自带；旧系统装 Evergreen Runtime |

---

## 八、已知限制

- **运行时未实测**：x86 Linux 无 wine 可跑 ARM64 PE，也无 Windows ARM 设备。
  本指南只验证到「PE 架构正确 + 安装包结构完整 + 前端已 embed + 内嵌 exe md5 一致」，
  真机启动 / 文件关联行为需在 ARM64 Windows 上最终确认。
- 安装包是 64 位 NSIS Unicode stub，在 ARM64 Windows 上以原生 64 位进程运行（`RunningX64=true`）。

---

## 九、速查（一键重编）

```bash
cd /home/z/temp/mdex-win-arm

# 0) 探查新版变化（先解临时 diff，见第六节）

# 1) 覆盖解压（保留 vendor / dist / target）
unzip -oq mdex-src.zip

# 2) 重建前端
node tools/build-html.mjs

# 3) 交叉编译 ARM64
export PATH=$HOME/local/bin:$PATH
( cd src-tauri && cargo xwin build --release --target aarch64-pc-windows-msvc )

# 4) 改版本号（如变了）
sed -i 's/^!define APP_VERSION   .*/!define APP_VERSION   "1.4.0"/' installer/installer.nsi

# 5) 打包
NSISDIR=$HOME/local/nsis/usr/share/nsis \
  $HOME/local/nsis/usr/bin/makensis -DPROJECT_ROOT=$(pwd) installer/installer.nsi

# 6) 验证
file src-tauri/target/aarch64-pc-windows-msvc/release/mdex.exe
7z l installer/MDeX_*_arm64-setup.exe | grep mdex.exe
```
