# Linux amd64 编译指南（实战版）

在 Linux x86_64 上从 `mdex-src.zip` 编译出 **deb / rpm / AppImage** 三套安装包。
本文档基于 v1.1.0 → v1.4.0 多次实战总结，重点解决**国内网络下 AppImage 打包失败**、
**vendor 缺失**、**build 失败定位**等真实坑。

> 产物命名：`MDeX_<version>_amd64.deb` / `MDeX-<version>-1.x86_64.rpm` / `MDeX_<version>_amd64.AppImage`
> 产物路径：`src-tauri/target/release/bundle/{deb,rpm,appimage}/`

---

## 0. 核心结论（先看）

- `npm run tauri build` 会生成 **deb / rpm / AppImage** 三套。
- **deb / rpm 总能成功**，不受网络影响。
- **AppImage 间歇失败**：打包最后一步 appimagetool 要从 GitHub 下载 type2-runtime，国内直连常被墙（报 `failed to run linuxdeploy`）。失败时走第 4 节手动打包，**这是常态后备**。
- **build 前必须验证 vendor 完整性**（第 3 节），否则会在前端阶段 `ENOENT` 失败（Rust 都没编译）。
- `build exit=1` 不一定是 AppImage 失败，**必须看日志确认失败步骤 + 核对产物时间戳**（第 5 节）。

---

## 1. 前置环境（一次性）

### 1.1 系统依赖（Tauri v2 要 webkit2gtk-4.1）

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
                    build-essential curl wget unzip file python3 jq
```

> Fedora：`sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel`
> Arch：`sudo pacman -S --needed webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg`

### 1.2 Rust + Node

```bash
# Rust（国内可用 rsproxy 镜像加速：export RUSTUP_DIST_SERVER=https://rsproxy.cn）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version && cargo --version

# Node.js LTS（>= 20）
node --version && npm --version
```

---

## 2. 一次性准备 AppImage 打包工具（跨版本复用）

AppImage 手动打包需要三件工具，提取一次后放 `/tmp` 即可跨版本复用（`/tmp` 被清则重提）。

### 2.1 type2 runtime（从本地 linuxdeploy AppImage 提取，零网络）

首次 `tauri build` 会把 `linuxdeploy-x86_64.AppImage` 下载到 `~/.cache/tauri/`。
该 AppImage 文件头即是 type2 runtime。用 squashfs 魔数 `hsqs` 定位（**取最后一个** `hsqs` 偏移，
因为 runtime ELF 内部也可能偶现 `hsqs` 误匹配）：

```bash
python3 -c "
d=open('$HOME/.cache/tauri/linuxdeploy-x86_64.AppImage','rb').read()
o=d.rfind(b'hsqs')
open('/tmp/runtime-x86_64','wb').write(d[:o])
print('runtime 大小:', o)
"
file /tmp/runtime-x86_64   # 应为 ELF 64-bit, dynamically linked
```

### 2.2 appimagetool（从 plugin AppImage 提取）

```bash
cd /tmp && rm -rf /tmp/squashfs-root
APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-plugin-appimage.AppImage --appimage-extract
# 真正的 appimagetool 二进制（~29MB）在：
ls -la /tmp/squashfs-root/appimagetool-prefix/usr/bin/appimagetool
/tmp/squashfs-root/appimagetool-prefix/usr/bin/appimagetool --version
```

### 2.3 desktop-file-validate（appimagetool 依赖）

appimagetool (continuous build `8c8c91f`) 要求 PATH 里有 `desktop-file-validate`，
缺失会报 `desktop-file-validate command is missing` 并 `exit=1` 不打包。免 root 装：

```bash
mkdir -p /tmp/dfu && (cd /tmp/dfu && apt download desktop-file-utils)
dpkg-deb -x /tmp/dfu/desktop-file-utils_*.deb /tmp/dfu/root
ls /tmp/dfu/root/usr/bin/desktop-file-validate   # 验证存在
```

> 三件工具就绪：`/tmp/runtime-x86_64`、`/tmp/squashfs-root/appimagetool-prefix/usr/bin/appimagetool`、`/tmp/dfu/root/usr/bin/desktop-file-validate`

---

## 3. 标准编译流程

```bash
cd <项目根目录>   # 含 mdex-src.zip 的目录

# 1) 解压（zip 顶层无包裹目录，直接在当前目录解压覆盖）
unzip -o mdex-src.zip

# 2) 装前端依赖
npm install

# 3) 【关键】验证 vendor 完整性——先跑一次 build-html
node tools/build-html.mjs && echo "✓ vendor 齐" || echo "❌ vendor 缺，见第 4 节"

# 4) 编译 + 打包
npm run tauri build
```

### `tauri build` 内部步骤

1. `beforeBuildCommand` -> `node tools/build-html.mjs`：把 `app-shell.html`（模板）+ `vendor/` + `src/app.js`（v1.4.0+）内联成 `dist/index.html`（离线单文件）
2. `cargo build --release`：编译 Rust，将 `dist/index.html` embed 进二进制（release profile：`lto=true` + `codegen-units=1` + `panic=abort` + `strip=true` + `opt-level=s`，约 1m10s）
3. 打包：deb（dpkg）、rpm（rpm）、appimage（linuxdeploy + appimagetool）

> Rust 增量：仅前端变（lib.rs/依赖未变）也要重链（lto 是瓶颈，~1m10s）；lib.rs 或 Cargo.toml 依赖变则重编对应 crate。

---

## 4. vendor 缺失处理

作者 zip 可能不含某些 vendor 文件（如 v1.3.1 起新增的 `svg2pdf.umd.min.js`）。
`build-html.mjs` 会报 `ENOENT: vendor/xxx.js` 直接失败——**此失败在 Rust 编译之前**。

### 4.1 先看缺什么

```bash
node tools/build-html.mjs   # 报 ENOENT 的文件名即缺失的 vendor
grep -A20 'const VERSIONS' tools/fetch-vendor.mjs   # 看 vendor 依赖清单与版本
```

### 4.2 方案 A：npm run fetch（jsDelivr，国内可能不通）

```bash
npm run fetch    # tools/fetch-vendor.mjs 从 https://cdn.jsdelivr.net/npm 下载
```

国内若报 `ETIMEDOUT` / `ENETUNREACH`（jsDelivr 被墙），走方案 B。

### 4.3 方案 B：npmmirror 淘宝镜像（推荐 fallback）

对缺失的包，从 npmmirror 下 tarball 提取 dist（国内稳定）：

```bash
# 示例：补 svg2pdf.js@2.7.0
PKG=svg2pdf.js; VER=2.7.0
curl -fsSL -o /tmp/s.tgz "https://registry.npmmirror.com/${PKG}/-/${PKG}-${VER}.tgz"
tar -xzf /tmp/s.tgz -C /tmp
cp /tmp/package/dist/svg2pdf.umd.min.js vendor/
```

> 通用做法：`fetch-vendor.mjs` 的 `VERSIONS` 里列了所有包名+版本，缺哪个就按上面套路补哪个。

---

## 5. AppImage 手动打包（当 `tauri build` 报 `failed to run linuxdeploy`）

AppImage 自动失败时，**AppDir 已生成完整**（只差最后打包）。手动打包：

```bash
export PATH=/tmp/dfu/root/usr/bin:$PATH   # 让 appimagetool 找到 desktop-file-validate

B=src-tauri/target/release/bundle/appimage
APPIMAGE_NAME=MDeX_$(grep '"version"' package.json | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')_amd64.AppImage

# 确认 AppDir 完整
ls -la "$B/MDeX.AppDir/usr/bin/mdex"   # 有 mdex 二进制即完整

# 打包（用本地 runtime，约 1 分钟，产出 ~94MB）
rm -f "$B/$APPIMAGE_NAME"
/tmp/squashfs-root/appimagetool-prefix/usr/bin/appimagetool \
  "$B/MDeX.AppDir" "$B/$APPIMAGE_NAME" --runtime-file /tmp/runtime-x86_64
```

---

## 6. 验证产物

```bash
B=src-tauri/target/release/bundle

# 1) 三套产物（时间戳应为本轮 build 时间）
find $B -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) \
  -printf '%TH:%TM  %10s  %p\n' | sort

# 2) AppImage 可运行（输出 runtime 版本即 runtime+squashfs 完整）
chmod +x $B/appimage/*.AppImage
$B/appimage/*.AppImage --appimage-version

# 3) deb/rpm 元数据
dpkg-deb -I $B/deb/*.deb 2>/dev/null | grep -E 'Version|Package'
rpm -qpi $B/rpm/*.rpm 2>/dev/null | grep -E 'Name|Version'

# 4) 前端编入确认（dist/index.html 应为本轮重新生成，md5 随 app-shell/app.js 变化）
md5sum dist/index.html app-shell.html
```

### 验证要点（避免拿旧产物充数）

- **产物时间戳**必须是本轮 build 时间。`build exit=1` 时若 deb/rpm 时间戳是旧的，说明本轮根本没编译成功（可能 build-html 阶段就挂了），不要拿旧 AppDir 打 AppImage。
- **AppImage `--appimage-version`**：
  - Tauri 自动打包成功 -> `AppImage runtime version: ...commit/75849dc`（GitHub runtime）
  - 手动打包 -> `Version: 5735cc5`（本地提取的 runtime）
  - 两者都说明 AppImage 完整可运行。
- **前端编入**：比对 `dist/index.html` 的 md5（前端变了它必须变）。

---

## 7. 常见坑速查

| 现象/报错 | 原因 | 解决 |
|---|---|---|
| `failed to run linuxdeploy`（build 末尾） | AppImage 步骤下载 GitHub type2-runtime 被墙 | deb/rpm 已成功；AppImage 走第 5 节手动打包 |
| `ENOENT: vendor/xxx.js`（build 开头） | vendor 缺文件（zip 没带） | 第 4 节补 vendor（npm run fetch 或 npmmirror） |
| `npm run fetch` 报 `ETIMEDOUT` | jsDelivr 国内被墙 | 第 4.3 节 npmmirror tgz 提取 |
| `desktop-file-validate command is missing` | appimagetool 要该命令 | 第 2.3 节装 desktop-file-utils |
| build `exit=1` 但产物时间戳是旧的 | 本轮在 build-html 阶段就失败，没到打包 | 看日志（`grep -E 'ENOENT\|error\|failed' /tmp/tauri-build-*.log`）定位失败步骤 |
| 同版本号 zip 多次更新（前端热更新） | 作者在固定版本号下改前端 | 正常重编覆盖；用 `dist/index.html` md5 确认新前端已编入 |
| `webkit2gtk-4.1 not found` | 系统依赖没装 | 第 1.1 节装系统依赖 |
| AppImage 双击无反应 | 缺执行权限 | `chmod +x *.AppImage` |

---

## 8. 速查：从零到三套产物

```bash
# 前置：装系统依赖 + Rust + Node（第 1 节）
# 首次 build 会下载 linuxdeploy 到 ~/.cache/tauri/，之后提取三件工具（第 2 节，一次性）

cd <项目根目录>
unzip -o mdex-src.zip && npm install
node tools/build-html.mjs && echo "vendor OK"   # 验证 vendor
npm run tauri build > /tmp/build.log 2>&1
grep -E 'Bundling|Finished|failed' /tmp/build.log | tail

# 若 AppImage 失败（failed to run linuxdeploy）：
export PATH=/tmp/dfu/root/usr/bin:$PATH
B=src-tauri/target/release/bundle/appimage
V=$(grep '"version"' package.json|head -1|grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
/tmp/squashfs-root/appimagetool-prefix/usr/bin/appimagetool \
  $B/MDeX.AppDir $B/MDeX_${V}_amd64.AppImage --runtime-file /tmp/runtime-x86_64

# 验证
$B/MDeX_${V}_amd64.AppImage --appimage-version
find src-tauri/target/release/bundle -name "MDeX_${V}*" -printf '%TH:%TM %10s %p\n'
```

---

## 9. 附：版本演进中的依赖变化（供排查参考）

| 版本 | 新增依赖 | 备注 |
|---|---|---|
| v1.1.0 | （基线） | deb/rpm ~3.79MB，AppImage ~94MB |
| v1.2.0 | `tauri-plugin-opener`、`base64`、`tauri-plugin-single-instance`；profile 加 `panic=abort`+`strip` | deb/rpm 涨到 ~4.03MB |
| v1.3.1 | 前端新增 `svg2pdf.js`（PDF 导出 SVG）| zip 不含该 vendor，首次需补 |
| v1.4.0 | Rust 新增 `encoding_rs`（非 UTF-8 文件兜底解码）；前端拆出 `src/app.js`，`app-shell.html` 改为带标记模板 | deb/rpm ~4.25MB |

> `encoding_rs`、`svg2pdf.js` 等新增依赖一旦首次编译/下载完成，后续版本缓存命中，无需重复处理。
