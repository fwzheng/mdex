# 在 x86_64 主机上编译 mdex 的 Linux ARM (aarch64) 安装文件

本文记录在 **x86_64 Debian/Ubuntu 主机**上，把 mdex（Tauri v2 离线 Markdown 编辑器，源码以 `mdex-src.zip` 分发）交叉/模拟编译成 **aarch64 (arm64)** 安装文件（deb / rpm / AppImage）的完整可复现方法与踩过的坑。

> 工作目录约定：`/home/z/temp/mdex-linux-arm`，源码解压到其下 `src/`。所有脚本都在该目录下。

---

## 一、两条路线，按需选择

| 路线 | 产物 | 速度 | 需要 root/docker | 适用 |
|---|---|---|---|---|
| **A. Docker arm64 容器**（推荐，出全套） | **deb + rpm + AppImage** | 慢（qemu 模拟，~40 分钟首次） | 需要 docker + qemu-binfmt | 要 AppImage，或要最省心的全套 |
| **B. sysroot 交叉编译** | **deb + rpm**（不出 AppImage） | 快（真交叉，~5 分钟） | 只需 sudo 装一个跨链器 | 只要 deb/rpm、追求快 |

**为什么 AppImage 必须走路线 A**：Tauri 打 AppImage 要执行 `linuxdeploy` 来分析依赖、捆绑库。`linuxdeploy` 的设计**假定主机架构 = 目标架构**——它从主机文件系统路径找库。在 x86 主机上直接交叉/qemu 跑 linuxdeploy，它会捆进 **x86_64 的库**（实测 108 个 x86_64 / 21 个 aarch64，废包）。只有在**容器内纯 arm64 环境**里，linuxdeploy 看到的"主机"才是 arm64，才会正确捆 arm64 库。deb/rpm 不跑 linuxdeploy（deb 的依赖是 Tauri 硬编码的包名），所以两条路线都能出。

---

## 二、公共准备（两条路线都要）

### 1. 解压源码
```bash
cd /home/z/temp/mdex-linux-arm
unzip -o mdex-src.zip -d src     # zip 顶层无包裹目录，直接解到 src/
```

### 2. 抓取前端 vendor（作者 zip **不含 vendor** 目录）
作者自带的 `npm run fetch`（`tools/fetch-vendor.mjs`）走 jsDelivr/cdnjs，**国内被墙**。用国内镜像的替代脚本 `fetch-vendor-cn.py` + `fetch-bibtex.mjs`（本目录下），严格复刻 vendor 布局：
- npm 包 → **npmmirror** 的 tgz 解包（文件直链会 404，只有 tgz 可用）
- highlight.js → **BootCDN**（`cdn.bootcdn.net`，cdnjs 的国内镜像）
- bibtex-parser → **esm.sh**（国内可达，保留作者原 IIFE 改写逻辑）

```bash
python3 fetch-vendor-cn.py     # marked/katex/jspdf/svg2pdf/turndown/mermaid/highlight.js + katex 字体
node fetch-bibtex.mjs          # bibtex-parser（esm.sh）
```
> 若 vendor 版本没变（对比 `fetch-vendor.mjs` 里的 VERSIONS 和 `src/vendor/manifest.json`），重编时**无需重新抓取**，解压 zip 不会覆盖 vendor 目录。

---

## 三、路线 A：Docker arm64 容器（推荐，出 deb+rpm+AppImage）

### 1. 一次性环境准备（需 sudo）
```bash
# 注册 arm64 binfmt：docker --platform linux/arm64 靠它用 qemu 透明模拟 arm64
sudo apt install -y qemu-user-static binfmt-support
# 把当前用户加入 docker 组（之后用 sg docker -c 驱动，无需重新登录）
sudo usermod -aG docker $USER
# 验证
sg docker -c 'docker ps'           # 能列容器即 docker 组生效
cat /proc/sys/fs/binfmt_misc/qemu-aarch64   # 应有 interpreter .../qemu-aarch64-static
```

### 2. Dockerfile（`Dockerfile`，arm64 原生环境 + 国内镜像）
关键点：base 镜像无 ca-certificates，**apt 源必须用 HTTP**（不能用 https，否则证书验证失败）。
```dockerfile
FROM --platform=linux/arm64 debian:bookworm
ENV DEBIAN_FRONTEND=noninteractive
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev \
    build-essential pkg-config file desktop-file-utils curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_DIST_SERVER=https://rsproxy.cn RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
RUN npm config set registry https://registry.npmmirror.com
# AppImage 打包需要 xdg-open（xdg-utils）；单独 layer 不破坏上层 apt 缓存
RUN apt-get update && apt-get install -y --no-install-recommends xdg-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /work
```

### 3. 构建脚本（`build-docker.sh`，含 4 个关键修复）
```bash
#!/usr/bin/env bash
set -uo pipefail
ROOT=/home/z/temp/mdex-linux-arm; cd "$ROOT"; mkdir -p docker-output
IMG=mdex-arm64-builder
docker build --platform linux/arm64 -t "$IMG" . 2>&1 | tee /tmp/docker-img-build.log | tail -5
docker run --platform linux/arm64 --rm \
  -v "$ROOT/src:/work" \
  -v mdex-arm64-nodemods:/work/node_modules \
  -v mdex-arm64-target:/work/src-tauri/target \
  -v /home/z/.cargo/registry:/root/.cargo/registry \
  -v /home/z/.cache/tauri:/root/.cache/tauri \
  -v "$ROOT/docker-output:/output" \
  -e CARGO_BUILD_JOBS=2 \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -w /work "$IMG" \
  sh -c 'npm install 2>&1 | tail -3; \
         rm -rf src-tauri/target/release/bundle; \      # 清残留 bundle，避免 AppDir 软链冲突
         npm run tauri build; \                          # exit 不阻断，确保 deb/rpm 能拷出
         cp -v src-tauri/target/release/bundle/appimage/*.AppImage \
               src-tauri/target/release/bundle/deb/*.deb \
               src-tauri/target/release/bundle/rpm/*.rpm /output/ 2>&1 | tail -8' \
  2>&1 | tee /tmp/docker-arm64-build.log
ls -lh "$ROOT/docker-output/"
```

### 4. 运行
```bash
sg docker -c 'bash /home/z/temp/mdex-linux-arm/build-docker.sh'
```
首次约 40 分钟（镜像 apt 装 webkit 依赖 + cargo 编译 ~400 crate，全在 qemu 下）。产物在 `docker-output/`（容器以 root 跑，文件 root 所有，cp 出来即可）。

---

## 四、路线 B：sysroot 交叉编译（出 deb+rpm，快）

只出 deb/rpm、不要 AppImage 时用。唯一需要 root 的是装跨链器；arm64 系统库用**纯用户态 sysroot** 解决（apt install 会撞 python3 冲突，见坑 1）。

### 1. 一次性（sudo）
```bash
sudo dpkg --add-architecture arm64 && sudo apt-get update
sudo apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu pkg-config-aarch64-linux-gnu
rustup target add aarch64-unknown-linux-gnu   # 国内用 RUSTUP_DIST_SERVER=https://rsproxy.cn
```

### 2. 建 sysroot（用户态，不触发依赖解析）
```bash
bash build-sysroot.sh        # apt download arm64 deb 闭包 + dpkg-deb -x 解到 sysroot-arm64/
bash fix-sysroot-symlinks.sh # 把 dev 包里悬空的绝对 .so 软链改成 sysroot 内相对软链
```

### 3. 交叉编译
```bash
bash build-arm64.sh          # tauri build --target aarch64-unknown-linux-gnu，pkg-config 指向 sysroot
```
产物在 `src/src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/`。

---

## 五、踩过的坑全表（精华）

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| 1 | `apt install libwebkit2gtk-4.1-dev:arm64` 报 `python3:arm64` 冲突 | arm64 dev 包 → `libgirepository1.0-dev:arm64` → `gobject-introspection:arm64` → `python3:arm64`，python3 不能跨架构与主机 `python3:amd64` 共存 | **不用 apt install**，改 sysroot（`apt download` + `dpkg-deb -x`，denylist 过滤 `gobject-introspection\|libgirepository1.0-dev\|python3*`） |
| 2 | pkg-config 找不到 arm64 库 / 路径全错 | Debian arm64 多架构目录是 **`aarch64-linux-gnu`**（GNU triplet），不是 `arm64-linux-gnu`（那是 dpkg 短架构名） | `PKG_CONFIG_LIBDIR`、rpath-link 都用 `aarch64-linux-gnu` |
| 3 | `ld: cannot find /lib/aarch64-linux-gnu/libc.so.6` | sysroot 里 `libc.so` 链接脚本写的是**绝对路径** `/lib/...`，指向主机根目录（无 arm64 libc） | 给 ld 传 `--sysroot=<sysroot>`（`CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUSTFLAGS` 里加 `-C link-arg=-Wl,--sysroot=$SR`），ld 会重写脚本绝对路径 |
| 4 | `libdbus-1.a` 静态库触发 `libsystemd` 符号缺失（DSO missing） | sysroot 里 dev 包的 `libX.so` 是**悬空绝对软链**（指 `/lib/...`），ld 跟随不了退用静态 `.a` | `fix-sysroot-symlinks.sh`：`find -xtype l` 找悬空软链，绝对目标的用 `realpath --relative-to` 改成 sysroot 内**相对软链** |
| 5 | cargo 编译到一半 **CPU 归零卡死**（qemu 下） | cargo 高并发（N 个 rustc 各自是独立 qemu 进程）死锁 | **`CARGO_BUILD_JOBS=2`** 限制并发 |
| 6 | 容器内 apt `Certificate verification failed` | base 镜像无 ca-certificates，源改 https 验证不了证书 | apt 源用 **HTTP**（`mirrors.tuna.tsinghua.edu.cn`），装上 ca-certificates 后 rustup/node 再走 https |
| 7 | AppImage 报 `xdg-open binary not found` | 容器没装 xdg-utils | Dockerfile 加 `xdg-utils`（末尾新 layer，不破坏缓存） |
| 8 | AppImage 容器内无 FUSE → linuxdeploy/appimagetool 跑不起来 | 容器默认无 `/dev/fuse` | `-e APPIMAGE_EXTRACT_AND_RUN=1` 让这俩 AppImage 解压到 /tmp 跑 |
| 9 | 重编新版本时 AppImage 反复 `failed to run linuxdeploy`（tauri 吞了真错） | target 命名卷残留上次成功的 AppDir，gtk 插件 `ln -s im-multipress.so` 撞 `File exists` | 构建前 `rm -rf src-tauri/target/release/bundle`；要看真错就手动在容器里 `APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-aarch64.AppImage --appdir ... --plugin gtk` 跑 |
| 10 | `rustup target add` 卡住/404 | 国内连 rustup 官方源/清华镜像不稳 | `RUSTUP_DIST_SERVER=https://rsproxy.cn`（rsproxy 稳） |
| 11 | `npm run fetch` 超时 | jsDelivr/cdnjs 国内被墙 | npmmirror tgz + BootCDN + esm.sh（见第二节） |

---

## 六、验证产物（务必核对架构）

```bash
# deb
dpkg-deb -I MDeX_*_arm64.deb | grep Architecture      # 应为 arm64
# 裸二进制
file MDeX_*_arm64.bin                                  # ELF ... ARM aarch64
# AppImage（解包看里面是否纯 arm64，防混架构废包）
AI=MDeX_*_aarch64.AppImage; file "$AI"                # runtime 应 ARM aarch64
OFF=$(python3 -c "print(open('$AI','rb').read().find(b'hsqs'))")
dd if="$AI" of=/tmp/p.sq bs=$OFF skip=1 2>/dev/null
mkdir -p /tmp/ai && unsquashfs -d /tmp/ai/root /tmp/p.sq >/dev/null 2>&1
file /tmp/ai/root/usr/bin/mdex                        # 应 ARM aarch64
find /tmp/ai/root -name '*.so*' | xargs file | grep -c x86-64   # 应为 0
find /tmp/ai/root -name '*.so*' | xargs file | grep -c aarch64   # 应 ~200
```

---

## 七、在 arm64 机器上安装/运行

```bash
# AppImage（免安装，单文件到处跑）
chmod +x MDeX_*_aarch64.AppImage && ./MDeX_*_aarch64.AppImage
# deb（Debian/Ubuntu/树莓派OS）
sudo dpkg -i MDeX_*_arm64.deb && sudo apt-get install -f
# rpm（Fedora/openSUSE）
sudo rpm -i MDeX-*.aarch64.rpm
```

---

## 八、脚本清单（本目录）

| 文件 | 用途 | 路线 |
|---|---|---|
| `Dockerfile` | arm64 原生构建镜像（含国内镜像 + xdg-utils） | A |
| `build-docker.sh` | 容器内全量构建 deb/rpm/AppImage（含 4 个关键修复） | A |
| `fetch-vendor-cn.py` | npmmirror tgz + BootCDN 抓前端 vendor | A/B |
| `fetch-bibtex.mjs` | esm.sh 抓 bibtex-parser | A/B |
| `build-sysroot.sh` | 用户态建 arm64 sysroot（apt download + dpkg-deb -x） | B |
| `fix-sysroot-symlinks.sh` | 修 sysroot 悬空绝对 .so 软链 | B |
| `build-arm64.sh` | sysroot 交叉编译 deb/rpm | B |

> 产物统一放 `dist-arm64/`；docker 中间产物在 `docker-output/`。
> 关键经验另见记忆 `mdex-arm64-cross-build`。
