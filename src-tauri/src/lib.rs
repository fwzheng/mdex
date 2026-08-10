// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>
//
// MDeX — Tauri v2 主进程
// 提供：原生菜单、文件打开/保存（原生对话框）、窗口控制、界面语言切换。
// 另含【可选 AI 改写】：仅当用户在前端配置 API Key/端点并主动触发时，才发起外部网络请求
// （ai_rewrite 流式调用 OpenAI 兼容接口）。应用本身默认离线；AI 是用户显式开启的能力。

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use base64::Engine as _;
use futures_util::StreamExt;
use tokio::sync::oneshot;

#[derive(serde::Serialize)]
struct LoadedFile {
    name: String,
    path: String,
    content: String,
}

/// 多窗口文件打开状态。
/// - `open`：已打开文件的规范化路径 → 所在窗口 label（跨窗口去重：已开则置顶该窗口）。
/// - `pending`：窗口 label → 该窗口待打开文件路径（前端启动后用 take_window_file 取走）。
/// - `main_taken`：主窗口是否已被占用（首个 OS 文件占用主窗口，之后都开新窗口）。
/// - `next_id`：新窗口 label 的单调计数器（file-<N>）。
/// - `lang`：当前界面语言（新建窗口菜单按它构建）。
/// - `focused`：最近获得键盘焦点的窗口 label。用可靠的 Focused 事件维护，
///   供菜单快捷键（Cmd+S/B/W…）定向到【真正活动的窗口】——比 is_focused() 在
///   加速键触发瞬间的取值更稳定，避免快捷键作用到错误/全部窗口。
struct WindowState {
    open: Mutex<HashMap<String, String>>,
    pending: Mutex<HashMap<String, String>>,
    /// 查看器窗口待取的内容（SVG/<img>，key=窗口 label "mermaid-<N>"，前端 take_viewer_content 取走）
    viewer_content: Mutex<HashMap<String, String>>,
    /// AI 独立窗口待取的选区数据（JSON，key=窗口 label "ai-panel-<N>"，前端 take_ai_panel_content 取走）
    ai_panel_content: Mutex<HashMap<String, String>>,
    /// 当前"主 AI 窗口"的 label(用户右键设置)；主窗口跟随新选区(替换上下文)，非主窗口独立保内容
    ai_panel_main: Mutex<Option<String>>,
    main_taken: AtomicBool,
    next_id: Mutex<u64>,
    lang: Mutex<String>,
    focused: Mutex<Option<String>>,
    /// 焦点驱动的 AI 置顶自动管理是否启用(关闭主窗口的确认弹窗期间临时禁用，防焦点事件把 AI 重新抬起)
    ai_auto_top: AtomicBool,
    /// 失焦去抖令牌：新焦点事件 fetch_add 使旧去抖线程捕获的令牌失效(防"主窗→AI窗"焦点切换瞬间误降 AI)
    ai_focus_token: AtomicU64,
}

/// 从命令行参数中提取已存在的文件路径（Windows/Linux 双击文件时系统以 argv 传入；macOS 为空）。
fn args_to_files() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|a| {
            let p = PathBuf::from(a);
            if p.is_file() {
                p.to_str().map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect()
}

/// 规范化路径作为去重键（解析符号链接；失败回退原串，避免 panic）。
fn canon_key(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string())
}

/// 敏感目录字面量（S1 加固）。自定义 fs 命令的 path 直接来自前端 webview，一旦发生
/// DOMPurify/marked 等库的 CVE 导致脚本注入，攻击者可把任意路径交给 std::fs 读写删。
/// 这里拒绝 markdown 编辑器正常绝不会触碰的"秘密/持久化/系统"目录，把"webview 脚本执行"
/// 的爆炸半径从"全用户文件系统"收窄到"非敏感路径"。采用黑名单而非根目录白名单：
/// 用户可在任意位置打开/保存 .md、从任意来源拖入图片，无法锁定单一根目录。
fn sensitive_literals() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for s in [".ssh", ".gnupg", ".aws", ".config/gcloud", ".docker", ".kube",
                  ".config/gh", ".netrc", ".npmrc"] {
            v.push(home.join(s));
        }
        v.push(home.join("Library/LaunchAgents"));
        v.push(home.join("Library/Keychains"));
        v.push(home.join("Library/Cookies"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        // Windows 启动项（持久化）
        v.push(PathBuf::from(appdata)
            .join("Microsoft/Windows/Start Menu/Programs/Startup"));
    }
    for s in ["/etc", "/private/etc", "/var/db", "/usr", "/sbin", "/bin",
              "/System", "/boot", "/efi", "C:\\Windows", "C:\\Program Files"] {
        v.push(PathBuf::from(s));
    }
    v
}

/// 解析目标用于敏感目录比对的规范路径。目标已存在 → 直接 canonicalize；
/// 目标不存在（新建文件）→ 规范最近的已存在祖先，再把不存在的尾部相对它解析（含 `..` 折叠），
/// 防止 `/Users/z/Documents/../.ssh/id_rsa` 式遍历绕过。
fn safe_candidate(p: &std::path::Path) -> PathBuf {
    use std::path::Component;
    if let Ok(c) = fs::canonicalize(p) {
        return c;
    }
    let comps: Vec<Component> = p.components().collect();
    for split in (1..comps.len()).rev() {
        let ancestor: PathBuf = comps[..split].iter().copied().collect();
        if let Ok(mut resolved) = fs::canonicalize(&ancestor) {
            for comp in comps[split..].iter().copied() {
                match comp {
                    Component::CurDir => {}
                    Component::ParentDir => {
                        resolved.pop();
                    }
                    Component::Normal(s) => resolved.push(s),
                    _ => {} // Prefix/RootDir 不会出现在尾部（祖先已是绝对路径）
                }
            }
            return resolved;
        }
    }
    p.to_path_buf()
}

/// 校验前端传入的路径不在敏感目录内（含符号链接与 `..` 遍历解析后的真实位置）。
fn assert_safe_path(raw: &str) -> Result<(), String> {
    let candidate = safe_candidate(std::path::Path::new(raw));
    for lit in sensitive_literals() {
        if candidate.starts_with(&lit) {
            return Err(format!("拒绝访问受限路径: {raw}"));
        }
        // 敏感目录本身可能是符号链接（如 macOS /etc → /private/etc），用其规范形式再比对一次。
        if let Ok(canon) = fs::canonicalize(&lit) {
            if canon != lit && candidate.starts_with(&canon) {
                return Err(format!("拒绝访问受限路径: {raw}"));
            }
        }
    }
    Ok(())
}

/// 原子写入：写同目录临时文件 <name>.mdex-tmp-<pid> → fsync → rename 覆盖目标（D1）。
/// 同目录保证 rename 在同一文件系统上（POSIX 原子；Windows std::fs::rename 内部用
/// MoveFileEx(REPLACE_EXISTING)）。崩溃/断电/磁盘满时，要么旧文件完好、要么新文件完整，
/// 绝不出现 truncate-write 那种半截写入导致原内容丢失。
fn atomic_write(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "路径无父目录"))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "路径无文件名"))?;
    let tmp_name = {
        let mut s = std::ffi::OsString::from(file_name);
        s.push(format!(".mdex-tmp-{}", std::process::id()));
        s
    };
    let tmp_path = parent.join(&tmp_name);
    // 写 + 落盘。若中途失败，清理临时文件后向上传播错误（目标文件保持原样）。
    if let Err(e) = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp_path)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        Ok(())
    })() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }
    // 原子替换。失败则清理临时文件。
    if let Err(e) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }
    Ok(())
}

/// 把字节解码为字符串：UTF-8 优先；失败按 BOM/编码兜底；并剥前导 BOM（D6）。
///
/// - UTF-8 BOM / 无 BOM 的合法 UTF-8 → UTF-8
/// - UTF-16 LE/BE BOM → encoding_rs 解码
/// - 非 UTF-8 → 先试 GBK（中文环境最常见的传统编码），无 U+FFFD 即采用；
///   否则退回 windows-1252（每个字节都有码位，永不失败、不丢字节）。
///
/// 保证任意文件都能打开编辑（保存时统一以 UTF-8 落盘）。
fn decode_bytes_lossless(bytes: &[u8]) -> String {
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => return String::from_utf8_lossy(rest).into_owned(),
        [0xFE, 0xFF, rest @ ..] => {
            return encoding_rs::UTF_16BE.decode_without_bom_handling(rest).0.into_owned()
        }
        [0xFF, 0xFE, rest @ ..] => {
            return encoding_rs::UTF_16LE.decode_without_bom_handling(rest).0.into_owned()
        }
        _ => {}
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    let gbk = encoding_rs::GBK.decode_without_bom_handling(bytes).0;
    if !gbk.contains('\u{FFFD}') {
        return gbk.into_owned();
    }
    encoding_rs::WINDOWS_1252
        .decode_without_bom_handling(bytes)
        .0
        .into_owned()
}

/// 读取文本文件（UTF-8 优先 + 编码兜底 + 去 BOM）。
fn read_text_lossless(path: &std::path::Path) -> std::io::Result<String> {
    let bytes = std::fs::read(path)?;
    Ok(decode_bytes_lossless(&bytes))
}

/// 仅当判定为真实图片时返回其 MIME；否则 None（S1）。
/// 二进制 magic bytes 优先（防止把 `.png` 后缀的 `/etc/passwd` 当图片读出 base64）；
/// SVG/ICO/TIFF 无可靠二进制 magic，按扩展名白名单认定。
fn detect_image_mime(path: &std::path::Path, bytes: &[u8]) -> Option<&'static str> {
    // AVIF/HEIF（ISOBMFF）：[size 4B]["ftyp"][brand]——brand 在偏移 8。
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp"
        && matches!(&bytes[8..12], b"avif" | b"avis" | b"mif1" | b"heic" | b"heix")
    {
        return Some("image/avif");
    }
    let by_magic = match bytes {
        [0x89, b'P', b'N', b'G', ..] => Some("image/png"),
        [0xFF, 0xD8, 0xFF, ..] => Some("image/jpeg"),
        [0x47, b'I', b'F', 0x38, ..] => Some("image/gif"),
        [b'R', b'I', b'F', b'F', ..]
            if bytes.len() >= 12 && &bytes[8..12] == b"WEBP" =>
        {
            Some("image/webp")
        }
        [b'B', b'M', ..] => Some("image/bmp"),
        _ => None,
    };
    if let Some(m) = by_magic {
        return Some(m);
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "tif" | "tiff" => Some("image/tiff"),
        "avif" | "heic" => Some("image/avif"),
        _ => None,
    }
}

/// 前端启动后调用：取走本窗口待打开的文件路径（取后清空）。主窗口无论取到与否都标记为已占用。
#[tauri::command]
fn take_window_file(window: WebviewWindow, state: tauri::State<WindowState>) -> Option<String> {
    let label = window.label().to_string();
    if label == "main" {
        state.main_taken.store(true, Ordering::SeqCst);
    }
    state.pending.lock().unwrap().remove(&label)
}

/// 点击预览区的 mermaid 图或普通图片：新建独立 OS 窗口显示该内容（SVG 或 <img>，可移动/缩放/全屏）。
/// 内容经 viewer_content 暂存，新窗口启动后用 take_viewer_content 取走（避开冷启动 emit 丢失）。
#[tauri::command]
fn open_viewer_window(
    content: String,
    app: tauri::AppHandle,
    state: tauri::State<WindowState>,
) -> Result<String, String> {
    let label = {
        let mut idg = state.next_id.lock().unwrap();
        *idg += 1;
        format!("mermaid-{}", *idg)
    };
    state
        .viewer_content
        .lock()
        .unwrap()
        .insert(label.clone(), content);
    tauri::webview::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("MDeX Viewer")
    .inner_size(960.0, 720.0)
    .min_inner_size(360.0, 280.0)
    .center()
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(label)
}

/// 查看器窗口启动后取走其内容（SVG/<img>，取后清空）。返回 None 表示本窗口是普通编辑器窗口。
#[tauri::command]
fn take_viewer_content(window: WebviewWindow, state: tauri::State<WindowState>) -> Option<String> {
    let label = window.label().to_string();
    state.viewer_content.lock().unwrap().remove(&label)
}

/// 编辑区重渲后：把某 mermaid 块的最新 SVG 定向推给已打开的查看器窗口（live update）。
/// 返回 false 表示目标窗口已关闭，前端据此清跟踪。emit_to 仅投递给目标 label，不广播。
#[tauri::command]
fn emit_viewer_update(target: String, content: String, app: tauri::AppHandle) -> bool {
    if app.get_webview_window(&target).is_some() {
        let _ = app.emit_to(&target, "viewer-update", content);
        true
    } else {
        false
    }
}

/// AI 辅助弹窗独立窗口：主窗口把选区数据(JSON)暂存，新建独立 OS 窗口加载 index.html，
/// 启动后用 take_ai_panel_content 取走（避冷启动 emit 丢失，同 viewer 范式 BUG-067）。
/// 单例：已有 ai-panel-* 窗口则聚焦它并把新选区定向推过去（不新开），否则开新窗。窗口居中
/// 出现（不接收屏幕坐标——getBoundingClientRect 是 CSS 像素而窗口定位用物理像素，HiDPI 下
/// 换算易错；居中最稳，用户可自由拖出主界面到任意位置）。
#[tauri::command]
fn open_ai_panel(
    payload: String,
    dark: bool,
    app: tauri::AppHandle,
    state: tauri::State<WindowState>,
) -> Result<String, String> {
    // 单例：已开 ai-panel 窗口 → 聚焦 + 推新选区（不新开）
    // 有"主 AI 窗口" -> 新选区发给它(替换上下文)，不新开
    {
        let main = state.ai_panel_main.lock().unwrap().clone();
        if let Some(ml) = &main {
            if let Some(win) = app.get_webview_window(ml) {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = app.emit_to(ml, "ai-panel-payload", payload);
                return Ok(ml.clone());
            }
            *state.ai_panel_main.lock().unwrap() = None;
        }
    }
    // 无主窗口 -> 开新窗口(非主，独立保内容)
    let label = {
        let mut idg = state.next_id.lock().unwrap();
        *idg += 1;
        format!("ai-panel-{}", *idg)
    };
    state
        .ai_panel_content
        .lock()
        .unwrap()
        .insert(label.clone(), payload);
    // 级联定位：按已有 ai-panel 窗口数偏移，避免新窗完全盖住旧窗。基于主窗口 outer_position(物理)
    // 换算成逻辑坐标 + 偏移，给 builder.position(逻辑)——与 inner_size 同为逻辑像素，HiDPI 一致。
    let main_win = app.get_webview_window("main");
    let scale = main_win
        .as_ref()
        .and_then(|m| m.scale_factor().ok())
        .unwrap_or(1.0) as f64;
    let cascade = app
        .webview_windows()
        .keys()
        .filter(|k| k.starts_with("ai-panel-"))
        .count() as i32; // 已有数(本窗尚未 build)
    let (lx, ly) = main_win
        .as_ref()
        .and_then(|m| m.outer_position().ok())
        .map(|p| ((p.x as f64 + 96.0) / scale, (p.y as f64 + 96.0) / scale))
        .unwrap_or((120.0, 120.0));
    let off = ((cascade % 6) as f64) * 36.0;
    tauri::webview::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("MDeX AI")
    .inner_size(380.0, 200.0)       // 紧凑起始；JS maybeFitWindow 按内容贴合(撑大或缩到最小)。不设大默认窗——贴合必须真正生效
    .min_inner_size(300.0, 120.0)   // 最小高度放宽：允许缩到紧凑(仅输入框档)
    .position(lx + off, ly + off)   // 级联偏移：每个新窗右下错开 36px(模 6 重置)，不完全盖住已有 AI 窗
    .focused(true)
    .always_on_top(true)          // floating 级：MDeX 激活时浮在主窗之上；切到别的 App 时由焦点处理器降级(BUG-151 方案D)
    // 消除 WKWebView 创建期白闪：AI 窗加载 6.8MB index.html，HTML 解析前的"空内容白帧"在 head 主题脚本生效前已可见
    // (head 脚本在 HTML 解析后才跑，治不了 webview 创建→解析之间的白底)。builder background_color 在 webview 创建时即设，
    // 首帧即为主题底色。颜色随主窗当前主题(前端传 dark)：深色 #0d1117 / 浅色 #ffffff，与 --bg 一致。
    .background_color(if dark { tauri::webview::Color(13, 17, 23, 255) } else { tauri::webview::Color(255, 255, 255, 255) })
    // 窗口 appearance 跟随主题:控制 macOS 标题栏(含红黄绿交通灯)/系统控件底色。background_color 只管 webview,
    // 不管标题栏——不设 theme 时独立新窗落回 light→标题栏白+整窗白闪(主窗靠继承系统 dark 才深,AI 窗没继承到)。
    .theme(if dark { Some(tauri::Theme::Dark) } else { Some(tauri::Theme::Light) })
    .build()
    .map_err(|e| e.to_string())?;
    // AI 窗去掉继承的菜单栏(来自 app.set_menu / 主窗 menu)：Windows/Linux 上菜单栏占窗口垂直空间,
    // chrome offset=标题栏+菜单栏≈60px >> ensureChrome 默认 winChrome=32 → setSize 死循环卡死(BUG-154)。
    // AI 辅助窗本就不需要主菜单。macOS 菜单栏全局(屏幕顶)不占窗口空间,remove_menu 主要消除 Windows/Linux 窗口内菜单条。
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.remove_menu();
        // TEMP 诊断: Rust 独立线程延迟 eval 注入蓝字 div(不依赖 app.js——AI 窗 app.js 可能根本没执行,_diag 红字没显示)。
        // 显示 scripts 数(=index.html 是否加载)、window.CM、__diag 红字是否存在(=app.js 是否执行到 boot)、body 子元素数。
        // 蓝字显示+diag=false→app.js 阻断;蓝字显示+diag=true→_diag 创建了但被覆盖;蓝字不显示→webview 卡死。定位后移除。
        let win2 = win.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1500));
            let _ = win2.eval("try{var d=document.createElement('div');d.style.cssText='position:fixed;top:30px;left:0;z-index:2147483647;background:#06c;color:#fff;font:bold 13px monospace;padding:3px 6px';d.textContent='RUST scripts='+document.querySelectorAll('script').length+' CM='+(!!window.CM)+' diag='+(!!document.getElementById('__diag'))+' body='+(document.body?document.body.children.length:0);document.documentElement.appendChild(d);}catch(e){document.title='EVALERR'+e;}");
        });
    }
    Ok(label)
}

/// 把所有 ai-panel 窗口的 always_on_top 统一设为 on_top(floating↔normal)。底层 set_level_async 线程安全。
fn set_ai_panels_level(app: &tauri::AppHandle, on_top: bool) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("ai-panel-") { let _ = win.set_always_on_top(on_top); }
    }
}

/// 关闭主窗口的未保存确认弹窗时用(BUG-147 契约)：on_top=false 降 AI 到 normal + 抬主窗到 floating，使
/// 确认弹窗(主窗 DOM 内 overlay)盖在 AI 之上；on_top=true 还原。AI 窗为 floating(BUG-151 方案D)，靠
/// always_on_top 切 normal/floating 控制层级即可。on_top=false 时临时关焦点自动管理(防 main 聚焦事件把
/// AI 重新抬起)；on_top=true 时仅在 app 当前仍激活才升 AI(用户可能在弹窗期间切到别的 App)。
#[tauri::command]
fn set_ai_panels_on_top(on_top: bool, app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_always_on_top(!on_top); // false→主窗 floating 抬到 AI 之上；true→主窗还原 normal
        if !on_top { let _ = main.set_focus(); }
    }
    if let Some(st) = app.try_state::<WindowState>() {
        if !on_top {
            st.ai_auto_top.store(false, Ordering::Relaxed);
            st.ai_focus_token.fetch_add(1, Ordering::Relaxed); // 作废 pending 失焦去抖
            set_ai_panels_level(&app, false);
        } else {
            let active = app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false));
            set_ai_panels_level(&app, active); // 仅 app 激活才升 AI
            st.ai_auto_top.store(true, Ordering::Relaxed);
        }
    }
}

/// AI 独立窗口启动后取走选区数据（JSON，取后清空）。返回 None 表示本窗口非 AI 窗口。
#[tauri::command]
fn take_ai_panel_content(window: WebviewWindow, state: tauri::State<WindowState>) -> Option<String> {
    let label = window.label().to_string();
    state.ai_panel_content.lock().unwrap().remove(&label)
}

/// 设置/取消某 AI 窗口为"主窗口"(主窗口跟随新选区、替换上下文；非主窗口独立保内容)。
#[tauri::command]
fn set_ai_panel_main(label: String, is_main: bool, state: tauri::State<WindowState>) -> Result<(), String> {
    let mut m = state.ai_panel_main.lock().unwrap();
    if is_main { *m = Some(label); } else if m.as_deref() == Some(&label) { *m = None; }
    Ok(())
}

/// 查询某 AI 窗口是否为"主窗口"(前端右键菜单显示用)。
#[tauri::command]
fn is_ai_panel_main(label: String, state: tauri::State<WindowState>) -> bool {
    state.ai_panel_main.lock().unwrap().as_deref() == Some(&label)
}

/// AI 独立窗口点"应用/插入"：把编辑数据(JSON)定向推给主窗口执行 editor 写回。
/// 返回 false 表示主窗口已关闭。emit_to 仅投递给 main，不广播（BUG-039）。
#[tauri::command]
fn apply_ai_edit(payload: String, app: tauri::AppHandle) -> bool {
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to("main", "apply-ai-edit", payload);
        true
    } else {
        false
    }
}

/// 返回应用版本号（编译期取自 Cargo.toml 的 CARGO_PKG_VERSION）。
/// 供帮助文档等处动态显示版本，避免把版本号写死在多语言文案里、升级时漏改。
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// D4 文件所有权判定结果（纯逻辑，可单测）。
#[derive(Debug, PartialEq)]
enum Claim {
    OpenFresh,            // 未被任何窗口占用
    AlreadyMine,          // 已被本窗口占用
    OwnedByOther(String), // 已被别的窗口占用（值为该窗口 label）
}

/// 判定某规范化 key 在当前 open 映射中的归属（D4 纯逻辑，单测覆盖三种分支）。
fn classify_claim(open: &HashMap<String, String>, my_label: &str, key: &str) -> Claim {
    match open.get(key) {
        None => Claim::OpenFresh,
        Some(o) if o == my_label => Claim::AlreadyMine,
        Some(o) => Claim::OwnedByOther(o.clone()),
    }
}

/// 前端打开某文件后登记：本窗口持有该文件（跨窗口去重——之后双击同一文件会置顶本窗口而非开新窗口）。
/// 用 or_insert：不抢占已被【别的窗口】持有的所有权（D4，防本窗口重复打开同文件覆盖所有权）。
#[tauri::command]
fn register_file(window: WebviewWindow, state: tauri::State<WindowState>, path: String) {
    let key = canon_key(&path);
    let label = window.label().to_string();
    state.open.lock().unwrap().entry(key).or_insert(label);
}

/// D4 文件所有权闸门（前端 openPath/openFile 打开前调用）：
/// - 未被占用 → 登记本窗口，返回 false（前端继续打开）；
/// - 已被本窗口占用 → 返回 false（前端走本窗口去重/切标签）；
/// - 已被【别的窗口】占用 → 置顶那个窗口并向其 emit focus-file（切到对应标签），返回 true
///   （前端放弃在本窗口打开）。杜绝同一文件在两个窗口同时打开、并发存盘互相覆盖。
#[tauri::command]
fn claim_file(window: WebviewWindow, state: tauri::State<WindowState>, path: String) -> bool {
    let key = canon_key(&path);
    let my_label = window.label().to_string();
    let decision = classify_claim(&state.open.lock().unwrap(), &my_label, &key);
    match decision {
        Claim::OpenFresh => {
            state.open.lock().unwrap().insert(key, my_label);
            false
        }
        Claim::AlreadyMine => false,
        Claim::OwnedByOther(other) => {
            if let Some(w) = window.app_handle().get_webview_window(&other) {
                // 持有窗口存活 → 置顶它并切标签，本窗口不重复打开
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
                let _ = window.app_handle().emit_to(&other, "focus-file", path);
                true
            } else {
                // 僵尸所有权：登记指向的窗口已不存在（崩溃未触发 Destroyed 清理）→
                // 清除残留并接管本窗口，正常打开（与 route_file 的僵尸清理同款）
                state.open.lock().unwrap().remove(&key);
                state.open.lock().unwrap().insert(key, my_label);
                false
            }
        }
    }
}

/// 前端关闭某文件标签后注销（仅当注册项仍指向本窗口时才删，避免误删别窗口的同名登记）。
#[tauri::command]
fn unregister_file(window: WebviewWindow, state: tauri::State<WindowState>, path: String) {
    let key = canon_key(&path);
    let label = window.label().to_string();
    let mut open = state.open.lock().unwrap();
    let owned = open.get(&key).map(|s| s.as_str()) == Some(&label);
    if owned {
        open.remove(&key);
    }
}

/// 核心：处理一个 OS 投递的文件路径——已在某窗口打开则置顶该窗口并切标签；否则占用主窗口或新建窗口。
fn route_file(app: &tauri::AppHandle, raw_path: &str) {
    let st = match app.try_state::<WindowState>() {
        Some(s) => s,
        None => return,
    };
    let key = canon_key(raw_path);

    // (a) 已在某窗口打开 → 置顶该窗口 + 通知前端切到对应标签
    if let Some(label) = st.open.lock().unwrap().get(&key).cloned() {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            let _ = app.emit_to(&label, "focus-file", raw_path.to_string());
            return;
        }
        // 注册项指向的窗口已不存在（销毁时的残留）→ 清除后继续走新建分支
        st.open.lock().unwrap().remove(&key);
    }

    // (b) 主窗口尚未被占用 → 首个 OS 文件占用它（pending 待主窗口前端取走）
    if !st.main_taken.load(Ordering::SeqCst) {
        st.main_taken.store(true, Ordering::SeqCst);
        st.pending
            .lock()
            .unwrap()
            .insert("main".into(), raw_path.to_string());
        st.open.lock().unwrap().insert(key, "main".into());
        return;
    }

    // (c) 新建独立窗口
    let label = {
        let mut idg = st.next_id.lock().unwrap();
        *idg += 1;
        format!("file-{}", *idg)
    };
    if build_new_file_window(app, &label, raw_path).is_ok() {
        st.pending
            .lock()
            .unwrap()
            .insert(label.clone(), raw_path.to_string());
        st.open.lock().unwrap().insert(key, label.clone());
    }
}

/// 新建一个只显示某文件的窗口（显式挂菜单，确保 Win/Linux 新窗口也有菜单；macOS 应用级菜单共享，无害）。
fn build_new_file_window(app: &tauri::AppHandle, label: &str, path: &str) -> tauri::Result<()> {
    let title = std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "MDeX".into());
    let lang = app
        .try_state::<WindowState>()
        .and_then(|s| s.lang.lock().ok().map(|g| g.clone()))
        .unwrap_or_else(|| "zh".into());
    let menu = build_menu(app, &lang)?;
    tauri::webview::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title(&title)
    .inner_size(1200.0, 750.0)
    .min_inner_size(720.0, 450.0)
    .center()
    .focused(true)
    .menu(menu)
    .build()?;
    Ok(())
}

/// 弹出原生「打开文件」对话框，读取选中的 Markdown 文件内容。
/// 注意：必须用异步 pick_file(回调) + oneshot。若用 blocking_pick_file，会阻塞调用线程，
/// 而 macOS 的 NSOpenPanel 又必须在主线程跑模态 → 互相等待 → 整窗卡死（海滩球）。
#[tauri::command]
async fn pick_and_read(app: tauri::AppHandle) -> Result<Option<LoadedFile>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .add_filter("HTML", &["html", "htm"])
        .add_filter("所有文件", &["*"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let picked = rx.await.map_err(|e| e.to_string())?;
    match picked {
        Some(file_path) => {
            let path: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
            let content = read_text_lossless(&path).map_err(|e| format!("读取失败: {e}"))?;
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "未命名.md".to_string());
            Ok(Some(LoadedFile {
                name,
                path: path.to_string_lossy().into_owned(),
                content,
            }))
        }
        None => Ok(None), // 用户取消
    }
}

/// 弹出原生「打开 .bib 文献库」对话框，读取 BibTeX 文件内容（供前端渲染 [@key] 引用与参考文献表）。
/// 同样用异步回调 + oneshot，避免阻塞主线程（与 pick_and_read 同一模式）。
#[tauri::command]
async fn pick_and_read_bib(app: tauri::AppHandle) -> Result<Option<LoadedFile>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("BibTeX", &["bib"])
        .add_filter("所有文件", &["*"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let picked = rx.await.map_err(|e| e.to_string())?;
    match picked {
        Some(file_path) => {
            let path: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
            let content = read_text_lossless(&path).map_err(|e| format!("读取失败: {e}"))?;
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "references.bib".to_string());
            Ok(Some(LoadedFile {
                name,
                path: path.to_string_lossy().into_owned(),
                content,
            }))
        }
        None => Ok(None), // 用户取消
    }
}

/// 弹出原生「另存为」对话框，将内容写入用户选择的位置（同样用异步回调，避免阻塞死锁）。
/// 返回写入的完整路径（前端据此更新标签的路径/文件名）；用户取消则返回 None。
/// 仅用于 Markdown 源文件保存（保存 / 关闭前保存的回退路径）。
#[tauri::command]
async fn save_as(
    app: tauri::AppHandle,
    content: String,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .set_file_name(&default_name.unwrap_or_else(|| "未命名.md".to_string()))
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let picked = rx.await.map_err(|e| e.to_string())?;
    match picked {
        Some(file_path) => {
            let path: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
            atomic_write(&path, content.as_bytes()).map_err(|e| format!("写入失败: {e}"))?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None), // 用户取消
    }
}

/// 「另存为」多格式：仅弹出对话框选择路径，不写文件。前端先通过自绘弹窗选好格式，
/// 再以 `format`（"md" | "pdf" | "tex"）调用本命令：按格式设置单一过滤器与默认扩展名。
/// 注意：macOS 的 NSSavePanel 不会显示「文件格式」下拉，故格式选择放在前端弹窗完成，
/// 这里只负责按已选格式约束扩展名并返回路径。
#[tauri::command]
async fn pick_save_path(
    app: tauri::AppHandle,
    default_name: Option<String>,
    format: Option<String>,
) -> Result<Option<String>, String> {
    let fmt = format.as_deref().unwrap_or("md");
    let (label, ext): (&str, &str) = match fmt {
        "pdf" => ("PDF", "pdf"),
        "tex" => ("LaTeX", "tex"),
        "html" => ("HTML", "html"),
        _ => ("Markdown", "md"),
    };
    // 默认文件名去掉旧扩展名，再补当前格式扩展名，避免叠加成 a.md.pdf
    let mut name = default_name.unwrap_or_else(|| "未命名".to_string());
    for bad in &["md", "markdown", "tex", "pdf", "html", "htm", "txt"] {
        let with_dot = format!(".{}", bad);
        if name.to_lowercase().ends_with(&with_dot) {
            name.truncate(name.len() - with_dot.len());
            break;
        }
    }
    name.push('.');
    name.push_str(ext);

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(label, &[ext])
        .set_file_name(&name)
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let picked = rx.await.map_err(|e| e.to_string())?;
    match picked {
        Some(file_path) => {
            let path: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None), // 用户取消
    }
}

/// 按完整路径写入二进制（用于 PDF、粘贴图片落盘等）。data 为 base64 编码的字节。
/// 自动创建父目录（粘贴图片写到 markdown_images/ 时父目录可能不存在）。
#[tauri::command]
fn write_bytes_at(path: String, data: String) -> Result<(), String> {
    assert_safe_path(&path)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("解码失败: {e}"))?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent); // 父目录已存在时为 no-op
    }
    atomic_write(std::path::Path::new(&path), &bytes).map_err(|e| format!("写入失败: {e}"))
}

/// 草稿（未保存文档）粘贴图片的临时目录基址：<app_cache_dir>/mdex_draft_images（自动创建）。
/// 每个草稿在其下用 tab.id 子目录区分。保存时由 move_dir 迁移到文档目录下的 <文件名>_images。
#[tauri::command]
fn draft_images_base(app: tauri::AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("mdex"))
        .join("mdex_draft_images");
    fs::create_dir_all(&base).map_err(|e| format!("创建目录失败: {e}"))?;
    Ok(base.to_string_lossy().into_owned())
}

/// 把内置应用图标(32x32 PNG)写到缓存目录 mdex_icon.png 并返回绝对路径。
/// MDeX 示例文档的图片引用占位 @ICON@ 会解析到此路径——草稿无目录、相对路径不渲染(见前端 resolveImages)，
/// 故示例图标须用绝对路径。已存在则跳过，避免每次启动重写。
#[tauri::command]
fn app_icon_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("mdex"));
    let _ = fs::create_dir_all(&dir);
    let p = dir.join("mdex_icon.png");
    if !p.exists() {
        fs::write(&p, include_bytes!("../icons/32x32.png"))
            .map_err(|e| format!("写入图标失败: {e}"))?;
    }
    Ok(p.to_string_lossy().into_owned())
}

// 递归复制目录（move_dir 跨文件系统时用）。任何文件复制失败都向上传播（D2）：
// 调用方（move_dir）据此决定是否删源——绝不能在复制吞错后还删源，否则丢数据。
fn copy_dir_recursive(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let e = entry?;
        let p = e.path();
        let dest = to.join(e.file_name());
        if p.is_dir() {
            copy_dir_recursive(&p, &dest)?;
        } else {
            fs::copy(&p, &dest)?;
        }
    }
    Ok(())
}

/// 移动目录：同文件系统 fs::rename（原子、快）；跨文件系统则递归复制后删源。
/// 用于草稿保存时把临时图片目录迁移到文档目录下的 <文件名>_images。
#[tauri::command]
fn move_dir(from: String, to: String) -> Result<(), String> {
    assert_safe_path(&from)?;
    assert_safe_path(&to)?;
    let from_p = std::path::Path::new(&from);
    let to_p = std::path::Path::new(&to);
    if !from_p.exists() {
        return Ok(()); // 源不存在（无图片落盘）→ 视为成功
    }
    if fs::rename(from_p, to_p).is_ok() {
        return Ok(()); // 同文件系统：直接重命名
    }
    // 跨文件系统：递归复制后删源
    fs::create_dir_all(to_p).map_err(|e| format!("创建目录失败: {e}"))?;
    copy_dir_recursive(from_p, to_p).map_err(|e| format!("复制失败: {e}"))?;
    let _ = fs::remove_dir_all(from_p); // 删源失败不致命（目标已就绪）
    Ok(())
}

/// 删除目录（递归）。用于关闭未保存草稿时清理其临时图片目录。
#[tauri::command]
fn remove_dir(path: String) -> Result<(), String> {
    assert_safe_path(&path)?;
    let p = std::path::Path::new(&path);
    if p.exists() {
        fs::remove_dir_all(p).map_err(|e| format!("删除失败: {e}"))?;
    }
    Ok(())
}

/// 路径是否存在（文件或目录）。用于另存为时检测目标图片文件夹重名。
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// 返回文件最后修改时间（Unix 秒）。不存在/无法访问返回 None。
/// 外部修改检测（D8）：前端打开时记录、保存前比对——文件被外部程序改过则提示，
/// 不静默覆盖。秒级精度匹配 HFS+/FAT 等常见文件系统粒度，避免亚秒级误报。
#[tauri::command]
fn file_mtime(path: String) -> Option<u64> {
    std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// 递归复制目录（不删源）。用于「另存为」把图片文件夹拷一份到目标（保留原件）。
#[tauri::command]
fn copy_dir(from: String, to: String) -> Result<(), String> {
    assert_safe_path(&from)?;
    assert_safe_path(&to)?;
    let from_p = std::path::Path::new(&from);
    let to_p = std::path::Path::new(&to);
    if !from_p.exists() {
        return Ok(()); // 源不存在（无图片）→ 视为成功
    }
    copy_dir_recursive(from_p, to_p).map_err(|e| format!("复制失败: {e}"))
}

/// 复制单个文件（自动建父目录）。用于「另存为」拷贝文档目录下的散图。
#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
    assert_safe_path(&from)?;
    assert_safe_path(&to)?;
    let from_p = std::path::Path::new(&from);
    let to_p = std::path::Path::new(&to);
    if !from_p.exists() {
        return Ok(());
    }
    if let Some(parent) = to_p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::copy(from_p, to_p).map_err(|e| format!("复制失败: {e}"))?;
    Ok(())
}

/// 按完整路径读取（用于「最近打开」等场景）。UTF-8 优先 + 编码兜底 + 去 BOM（D6）。
#[tauri::command]
fn read_file_at(path: String) -> Result<String, String> {
    assert_safe_path(&path)?;
    read_text_lossless(std::path::Path::new(&path)).map_err(|e| format!("读取失败: {e}"))
}

/// 解析 Markdown 内的链接（相对 base_dir 或绝对），返回指向【已存在文件】的规范路径；
/// 目录(如 `./`)、失效链接、带协议(http/mailto/...)、锚点(#x) 一律返回 None。
/// 用于「渲染区点链接 → 新标签页打开」，避免误把目录/外链当文件打开后替换当前文档。
#[tauri::command]
fn resolve_doc_link(base_dir: String, href: String) -> Option<String> {
    use std::path::PathBuf;
    let href = href.trim();
    if href.is_empty() || href.starts_with('#') || href.contains("://") {
        return None;
    }
    let href = href.strip_prefix("file://").unwrap_or(href);
    let pb = PathBuf::from(href);
    let abs = if pb.is_absolute() {
        PathBuf::from(href)
    } else {
        PathBuf::from(&base_dir).join(href)
    };
    // canonicalize 顺便消解 `./`、`../`、符号链接；不存在则 None
    match abs.canonicalize() {
        Ok(c) if c.is_file() => Some(c.to_string_lossy().into_owned()),
        _ => None,
    }
}

/// 按完整路径写入（原子写，D1）。
#[tauri::command]
fn write_file_at(path: String, content: String) -> Result<(), String> {
    assert_safe_path(&path)?;
    atomic_write(std::path::Path::new(&path), content.as_bytes())
        .map_err(|e| format!("写入失败: {e}"))
}

/// 读取本地图片并以 data URL 返回（仅图片，S1）。
/// 用于渲染 markdown 中引用的本地相对路径图片（前端按 .md 所在目录拼绝对路径后调用）。
/// 仅当判定为真实图片（magic bytes 优先 + 扩展名白名单）才返回 data:image/* URL，
/// 否则返回错误——防止构造 <img src="/etc/passwd"> 把任意可读文件以 base64 读进预览/导出。
#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let canon = fs::canonicalize(&path).map_err(|e| format!("无法访问 {path}: {e}"))?;
    let bytes = fs::read(&canon).map_err(|e| format!("读取失败: {e}"))?;
    let mime = detect_image_mime(&canon, &bytes)
        .ok_or_else(|| format!("不支持的图片格式: {}", canon.display()))?;
    // 拼进预分配的 String（#性能8）：原 format!("data:{mime};base64,{b64}") 不预分配，
    // 写入时会多次 realloc 并整体拷贝 base64 段（大图可达数十 MB）。这里一次到位，省拷贝。
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let mut url = String::with_capacity(5 + mime.len() + 8 + b64.len()); // "data:" + mime + ";base64," + b64
    url.push_str("data:");
    url.push_str(mime);
    url.push_str(";base64,");
    url.push_str(&b64);
    Ok(url)
}

/// 矢量 PDF：调用 WebviewWindow::print()，触发系统打印对话框（macOS WKWebView 的
/// window.print() 是 no-op，必须走 Tauri 的打印才能弹出对话框、矢量输出）。
#[tauri::command]
fn print_webview(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| format!("打印失败: {e}"))
}

/// 切换界面语言：用目标语言重建原生菜单。
#[tauri::command]
fn change_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let menu = build_menu(&app, &lang).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    // Win/Linux：app.set_menu 不保证覆盖之后创建的窗口，逐窗补一次确保所有窗口菜单同步。
    // 注：tauri::menu::Menu 无 clone/try_clone 且 set_menu 消耗所有权，无法复用同一实例，
    // 只能逐窗重建（#性能7 受 API 限制未优化；语言切换是低频操作，影响可忽略）。
    for w in app.webview_windows().values() {
        if w.label().starts_with("ai-panel-") { continue; } // AI 窗不要菜单(BUG-154: 菜单栏占 Windows 窗口空间致 setSize 死循环)
        if let Ok(m) = build_menu(&app, &lang) {
            let _ = w.set_menu(m);
        }
    }
    if let Some(st) = app.try_state::<WindowState>() {
        if let Ok(mut g) = st.lang.lock() {
            *g = lang.clone();
        }
    }
    // 通知其它窗口前端刷新工具栏文案
    let _ = app.emit("lang-changed", lang);
    Ok(())
}

/// 各语言的自定义菜单文案（预定义项由 macOS 系统本地化）。所有字段为字符串字面量（'static）。
/// export_pdf 字段保留供未来恢复「导出 PDF」菜单项使用，故整体允许死代码。
#[allow(dead_code)]
struct Labels {
    file: &'static str,
    edit: &'static str,
    format: &'static str,
    view: &'static str,
    window: &'static str,
    language: &'static str,
    new: &'static str,
    open: &'static str,
    load_bib: &'static str,
    clear_bib: &'static str,
    cite_example: &'static str,
    mermaid_example: &'static str,
    close_file: &'static str,
    save: &'static str,
    save_as: &'static str,
    export_pdf: &'static str,
    close_window: &'static str,
    bold: &'static str,
    italic: &'static str,
    code: &'static str,
    link: &'static str,
    h1: &'static str,
    h2: &'static str,
    h3: &'static str,
    quote: &'static str,
    ul: &'static str,
    ol: &'static str,
    task: &'static str,
    formula: &'static str,
    image: &'static str,
    table: &'static str,
    hr: &'static str,
    toggle_theme: &'static str,
    sync_scroll: &'static str,
    split: &'static str,
    editor_only: &'static str,
    preview_only: &'static str,
    help: &'static str,
    help_intro: &'static str,
    mdex_example: &'static str,
    convert_md: &'static str,
    convert_html: &'static str,
    find: &'static str,
    replace: &'static str,
}

fn labels(lang: &str) -> Labels {
    match lang {
        "en" => Labels {
            file: "File", edit: "Edit", format: "Format", view: "View", window: "Window", language: "Language",
            new: "New", open: "Open…",
            load_bib: "Load Bibliography…",
            clear_bib: "Unload Bibliography",
            cite_example: "Citation Example…", mermaid_example: "Mermaid Examples…", close_file: "Close Tab", save: "Save", save_as: "Save As…",
            export_pdf: "Export PDF…", close_window: "Close Window",
            bold: "Bold", italic: "Italic", code: "Inline Code", link: "Link",
            h1: "Heading 1", h2: "Heading 2", h3: "Heading 3",
            quote: "Quote", ul: "Bullet List", ol: "Numbered List", task: "Task List",
            formula: "Math Block", image: "Insert Image…", table: "Table", hr: "Divider",
            toggle_theme: "Toggle Dark/Light", sync_scroll: "Toggle Sync Scroll",
            split: "Split View", editor_only: "Editor Only", preview_only: "Preview Only", help: "Help", help_intro: "MDeX Introduction", mdex_example: "MDeX Example…", convert_md: "Convert to Markdown", convert_html: "Convert to HTML", find: "Find", replace: "Replace",
        },
        "fr" => Labels {
            file: "Fichier", edit: "Édition", format: "Format", view: "Affichage", window: "Fenêtre", language: "Langue",
            new: "Nouveau", open: "Ouvrir…",
            load_bib: "Charger une bibliographie…",
            clear_bib: "Décharger la bibliographie",
            cite_example: "Exemple de citation…", mermaid_example: "Exemples Mermaid…", close_file: "Fermer l'onglet", save: "Enregistrer", save_as: "Enregistrer sous…",
            export_pdf: "Exporter en PDF…", close_window: "Fermer la fenêtre",
            bold: "Gras", italic: "Italique", code: "Code en ligne", link: "Lien",
            h1: "Titre 1", h2: "Titre 2", h3: "Titre 3",
            quote: "Citation", ul: "Liste à puces", ol: "Liste numérotée", task: "Liste de tâches",
            formula: "Bloc mathématique", image: "Insérer une image…", table: "Tableau", hr: "Séparateur",
            toggle_theme: "Basculer sombre/clair", sync_scroll: "Basculer défilement synchronisé",
            split: "Vue scindée", editor_only: "Éditeur seul", preview_only: "Aperçu seul", help: "Aide", help_intro: "Introduction à MDeX", mdex_example: "Exemple MDeX…", convert_md: "Convertir en Markdown", convert_html: "Convertir en HTML", find: "Rechercher", replace: "Remplacer",
        },
        "de" => Labels {
            file: "Datei", edit: "Bearbeiten", format: "Format", view: "Ansicht", window: "Fenster", language: "Sprache",
            new: "Neu", open: "Öffnen…",
            load_bib: "Bibliothek laden…",
            clear_bib: "Bibliothek entladen",
            cite_example: "Zitierbeispiel…", mermaid_example: "Mermaid-Beispiele…", close_file: "Tab schließen", save: "Speichern", save_as: "Speichern unter…",
            export_pdf: "Als PDF exportieren…", close_window: "Fenster schließen",
            bold: "Fett", italic: "Kursiv", code: "Inline-Code", link: "Link",
            h1: "Überschrift 1", h2: "Überschrift 2", h3: "Überschrift 3",
            quote: "Zitat", ul: "Aufzählung", ol: "Nummerierung", task: "Aufgabenliste",
            formula: "Formelblock", image: "Bild einfügen…", table: "Tabelle", hr: "Trennlinie",
            toggle_theme: "Dunkel/Hell umschalten", sync_scroll: "Sync-Scrollen umschalten",
            split: "Geteilte Ansicht", editor_only: "Nur Editor", preview_only: "Nur Vorschau", help: "Hilfe", help_intro: "MDeX-Einführung", mdex_example: "MDeX-Beispiel…", convert_md: "In Markdown umwandeln", convert_html: "In HTML umwandeln", find: "Suchen", replace: "Ersetzen",
        },
        "ru" => Labels {
            file: "Файл", edit: "Правка", format: "Формат", view: "Вид", window: "Окно", language: "Язык",
            new: "Создать", open: "Открыть…",
            load_bib: "Загрузить библиографию…",
            clear_bib: "Выгрузить библиографию",
            cite_example: "Пример цитирования…", mermaid_example: "Примеры Mermaid…", close_file: "Закрыть вкладку", save: "Сохранить", save_as: "Сохранить как…",
            export_pdf: "Экспорт в PDF…", close_window: "Закрыть окно",
            bold: "Полужирный", italic: "Курсив", code: "Код", link: "Ссылка",
            h1: "Заголовок 1", h2: "Заголовок 2", h3: "Заголовок 3",
            quote: "Цитата", ul: "Маркированный список", ol: "Нумерованный список", task: "Список задач",
            formula: "Формула", image: "Вставить изображение…", table: "Таблица", hr: "Разделитель",
            toggle_theme: "Тёмная/светлая тема", sync_scroll: "Синхр. прокрутка",
            split: "Разделённый вид", editor_only: "Только редактор", preview_only: "Только предпросмотр", help: "Справка", help_intro: "Введение в MDeX", mdex_example: "Пример MDeX…", convert_md: "Преобразовать в Markdown", convert_html: "Преобразовать в HTML", find: "Найти", replace: "Заменить",
        },
        "it" => Labels {
            file: "File", edit: "Modifica", format: "Formato", view: "Visualizza", window: "Finestra", language: "Lingua",
            new: "Nuovo", open: "Apri…",
            load_bib: "Carica bibliografia…",
            clear_bib: "Scarica bibliografia",
            cite_example: "Esempio di citazione…", mermaid_example: "Esempi Mermaid…", close_file: "Chiudi scheda", save: "Salva", save_as: "Salva con nome…",
            export_pdf: "Esporta PDF…", close_window: "Chiudi finestra",
            bold: "Grassetto", italic: "Corsivo", code: "Codice in linea", link: "Collegamento",
            h1: "Titolo 1", h2: "Titolo 2", h3: "Titolo 3",
            quote: "Citazione", ul: "Elenco puntato", ol: "Elenco numerato", task: "Elenco attività",
            formula: "Blocco formula", image: "Inserisci immagine…", table: "Tabella", hr: "Divisore",
            toggle_theme: "Toggle scuro/chiaro", sync_scroll: "Toggle scorrimento sincronizzato",
            split: "Vista divisa", editor_only: "Solo editor", preview_only: "Solo anteprima", help: "Aiuto", help_intro: "Introduzione a MDeX", mdex_example: "Esempio MDeX…", convert_md: "Converti in Markdown", convert_html: "Converti in HTML", find: "Trova", replace: "Sostituisci",
        },
        "ja" => Labels {
            file: "ファイル", edit: "編集", format: "書式", view: "表示", window: "ウィンドウ", language: "言語",
            new: "新規", open: "開く…",
            load_bib: "文献ライブラリを読み込む…",
            clear_bib: "文献ライブラリを解除",
            cite_example: "文献引用の例…", mermaid_example: "Mermaid の例…", close_file: "タブを閉じる", save: "保存", save_as: "名前を付けて保存…",
            export_pdf: "PDF書き出し…", close_window: "ウィンドウを閉じる",
            bold: "太字", italic: "斜体", code: "インラインコード", link: "リンク",
            h1: "見出し 1", h2: "見出し 2", h3: "見出し 3",
            quote: "引用", ul: "箇条書き", ol: "番号付きリスト", task: "タスクリスト",
            formula: "数式ブロック", image: "画像を挿入…", table: "表", hr: "区切り線",
            toggle_theme: "ダーク/ライト切替", sync_scroll: "同期スクロール切替",
            split: "分割表示", editor_only: "エディタのみ", preview_only: "プレビューのみ", help: "ヘルプ", help_intro: "MDeXの紹介", mdex_example: "MDeXの例…", convert_md: "Markdown に変換", convert_html: "HTML に変換", find: "検索", replace: "置換",
        },
        "ko" => Labels {
            file: "파일", edit: "편집", format: "서식", view: "보기", window: "창", language: "언어",
            new: "새로 만들기", open: "열기…",
            load_bib: "문헌고 불러오기…",
            clear_bib: "문헌고 해제",
            cite_example: "인용 예시…", mermaid_example: "Mermaid 예시…", close_file: "탭 닫기", save: "저장", save_as: "다른 이름으로 저장…",
            export_pdf: "PDF 내보내기…", close_window: "창 닫기",
            bold: "굵게", italic: "기울임", code: "인라인 코드", link: "링크",
            h1: "제목 1", h2: "제목 2", h3: "제목 3",
            quote: "인용", ul: "글머리 기호", ol: "번호 목록", task: "작업 목록",
            formula: "수식 블록", image: "이미지 삽입…", table: "표", hr: "구분선",
            toggle_theme: "다크/라이트 전환", sync_scroll: "동기 스크롤 전환",
            split: "분할 보기", editor_only: "편집기만", preview_only: "미리보기만", help: "도움말", help_intro: "MDeX 소개", mdex_example: "MDeX 예시…", convert_md: "Markdown으로 변환", convert_html: "HTML로 변환", find: "찾기", replace: "바꾸기",
        },
        "es" => Labels {
            file: "Archivo", edit: "Editar", format: "Formato", view: "Ver", window: "Ventana", language: "Idioma",
            new: "Nuevo", open: "Abrir…",
            load_bib: "Cargar bibliografía…",
            clear_bib: "Descargar bibliografía",
            cite_example: "Ejemplo de citación…", mermaid_example: "Ejemplos de Mermaid…", close_file: "Cerrar pestaña", save: "Guardar", save_as: "Guardar como…",
            export_pdf: "Exportar PDF…", close_window: "Cerrar ventana",
            bold: "Negrita", italic: "Cursiva", code: "Código en línea", link: "Enlace",
            h1: "Encabezado 1", h2: "Encabezado 2", h3: "Encabezado 3",
            quote: "Cita", ul: "Lista con viñetas", ol: "Lista numerada", task: "Lista de tareas",
            formula: "Bloque de fórmula", image: "Insertar imagen…", table: "Tabla", hr: "Divisor",
            toggle_theme: "Alternar oscuro/claro", sync_scroll: "Alternar desplazamiento sincronizado",
            split: "Vista dividida", editor_only: "Solo editor", preview_only: "Solo vista previa", help: "Ayuda", help_intro: "Introducción a MDeX", mdex_example: "Ejemplo de MDeX…", convert_md: "Convertir a Markdown", convert_html: "Convertir a HTML", find: "Buscar", replace: "Reemplazar",
        },
        "pt" => Labels {
            file: "Arquivo", edit: "Editar", format: "Formatar", view: "Ver", window: "Janela", language: "Idioma",
            new: "Novo", open: "Abrir…",
            load_bib: "Carregar bibliografía…",
            clear_bib: "Descarregar bibliografia",
            cite_example: "Exemplo de citação…", mermaid_example: "Exemplos do Mermaid…", close_file: "Fechar guia", save: "Salvar", save_as: "Salvar como…",
            export_pdf: "Exportar PDF…", close_window: "Fechar janela",
            bold: "Negrito", italic: "Itálico", code: "Código em linha", link: "Link",
            h1: "Cabeçalho 1", h2: "Cabeçalho 2", h3: "Cabeçalho 3",
            quote: "Citação", ul: "Lista com marcadores", ol: "Lista numerada", task: "Lista de tarefas",
            formula: "Bloco de fórmula", image: "Inserir imagem…", table: "Tabela", hr: "Divisor",
            toggle_theme: "Alternar escuro/claro", sync_scroll: "Alternar rolagem sincronizada",
            split: "Vista dividida", editor_only: "Apenas editor", preview_only: "Apenas pré-visualização", help: "Ajuda", help_intro: "Introdução ao MDeX", mdex_example: "Exemplo do MDeX…", convert_md: "Converter para Markdown", convert_html: "Converter para HTML", find: "Buscar", replace: "Substituir",
        },
        "ar" => Labels {
            file: "ملف", edit: "تحرير", format: "تنسيق", view: "عرض", window: "نافذة", language: "اللغة",
            new: "جديد", open: "فتح…",
            load_bib: "تحميل المراجع…",
            clear_bib: "إلغاء تحميل المراجع",
            cite_example: "مثال على الاستشهاد…", mermaid_example: "أمثلة Mermaid…", close_file: "إغلاق التبويب", save: "حفظ", save_as: "حفظ باسم…",
            export_pdf: "تصدير PDF…", close_window: "إغلاق النافذة",
            bold: "عريض", italic: "مائل", code: "كود سطري", link: "رابط",
            h1: "عنوان 1", h2: "عنوان 2", h3: "عنوان 3",
            quote: "اقتباس", ul: "قائمة نقطية", ol: "قائمة مرقمة", task: "قائمة مهام",
            formula: "كتلة صيغة", image: "إدراج صورة…", table: "جدول", hr: "فاصل",
            toggle_theme: "تبديل داكن/فاتح", sync_scroll: "تبديل التمرير المتزامن",
            split: "عرض مقسم", editor_only: "المحرر فقط", preview_only: "المعاينة فقط", help: "مساعدة", help_intro: "مقدمة عن MDeX", mdex_example: "مثال MDeX…", convert_md: "تحويل إلى Markdown", convert_html: "تحويل إلى HTML", find: "بحث", replace: "استبدال",
        },
        "hi" => Labels {
            file: "फ़ाइल", edit: "संपादन", format: "प्रारूप", view: "दृश्य", window: "विंडो", language: "भाषा",
            new: "नया", open: "खोलें…",
            load_bib: "ग्रंथ-सूची लोड करें…",
            clear_bib: "ग्रंथ-सूची अनलोड करें",
            cite_example: "उद्धरण उदाहरण…", mermaid_example: "Mermaid उदाहरण…", close_file: "टैब बंद करें", save: "सहेजें", save_as: "नाम से सहेजें…",
            export_pdf: "PDF निर्यात…", close_window: "विंडो बंद करें",
            bold: "बोल्ड", italic: "तिरछा", code: "इनलाइन कोड", link: "लिंक",
            h1: "शीर्षक 1", h2: "शीर्षक 2", h3: "शीर्षक 3",
            quote: "उद्धरण", ul: "बुलेट सूची", ol: "क्रमांकित सूची", task: "कार्य सूची",
            formula: "सूत्र खंड", image: "चित्र डालें…", table: "तालिका", hr: "विभाजक",
            toggle_theme: "गहरा/हल्का बदलें", sync_scroll: "सिंक स्क्रॉल बदलें",
            split: "विभाजित दृश्य", editor_only: "केवल संपादक", preview_only: "केवल पूर्वावलोकन", help: "सहायता", help_intro: "MDeX परिचय", mdex_example: "MDeX उदाहरण…", convert_md: "Markdown में बदलें", convert_html: "HTML में बदलें", find: "खोजें", replace: "बदलें",
        },
        "pa" => Labels {
            file: "ਫ਼ਾਈਲ", edit: "ਸੰਪਾਦਨ", format: "ਫਾਰਮੈਟ", view: "ਵੇਖੋ", window: "ਵਿੰਡੋ", language: "ਭਾਸ਼ਾ",
            new: "ਨਵਾਂ", open: "ਖੋਲ੍ਹੋ…",
            load_bib: "ਗ੍ਰੰਥ-ਸੂਚੀ ਲੋਡ ਕਰੋ…",
            clear_bib: "ਗ੍ਰੰਥ-ਸੂਚੀ ਅਨਲੋਡ",
            cite_example: "ਹਵਾਲਾ ਉਦਾਹਰਣ…", mermaid_example: "Mermaid ਉਦਾਹਰਣ…", close_file: "ਟੈਬ ਬੰਦ", save: "ਸੰਭਾਲੋ", save_as: "ਨਾਮ ਨਾਲ ਸੰਭਾਲੋ…",
            export_pdf: "PDF ਨਿਰਯਾਤ…", close_window: "ਵਿੰਡੋ ਬੰਦ",
            bold: "ਬੋਲਡ", italic: "ਤਿਰਛਾ", code: "ਇਨਲਾਈਨ ਕੋਡ", link: "ਲਿੰਕ",
            h1: "ਸਿਰਲੇਖ 1", h2: "ਸਿਰਲੇਖ 2", h3: "ਸਿਰਲੇਖ 3",
            quote: "ਹਵਾਲਾ", ul: "ਬੁਲੈਟ ਸੂਚੀ", ol: "ਅੰਕਿਤ ਸੂਚੀ", task: "ਕੰਮ ਸੂਚੀ",
            formula: "ਫਾਰਮੂਲਾ ਬਲਾਕ", image: "ਚਿੱਤਰ ਪਾਓ…", table: "ਸਾਰਣੀ", hr: "ਵੱਖਰੇਵਾਂ",
            toggle_theme: "ਗੂੜ੍ਹਾ/ਹਲਕਾ ਬਦਲੋ", sync_scroll: "ਸਿੰਕ ਸਕ੍ਰੌਲ ਬਦਲੋ",
            split: "ਵੰਡੀ ਵੇਖੋ", editor_only: "ਸਿਰਫ਼ ਸੰਪਾਦਕ", preview_only: "ਸਿਰਫ਼ ਝਲਕ", help: "ਮਦਦ", help_intro: "MDeX ਜਾਣ-ਪਛਾਣ", mdex_example: "MDeX ਉਦਾਹਰਣ…", convert_md: "Markdown ਵਿੱਚ ਬਦਲੋ", convert_html: "HTML ਵਿੱਚ ਬਦਲੋ", find: "ਖੋਜੋ", replace: "ਬਦਲੋ",
        },
        "vi" => Labels {
            file: "Tệp", edit: "Soạn thảo", format: "Định dạng", view: "Xem", window: "Cửa sổ", language: "Ngôn ngữ",
            new: "Mới", open: "Mở…",
            load_bib: "Nạp tài liệu tham khảo…",
            clear_bib: "Bỏ nạp tài liệu tham khảo",
            cite_example: "Ví dụ trích dẫn…", mermaid_example: "Ví dụ Mermaid…", close_file: "Đóng thẻ", save: "Lưu", save_as: "Lưu thành…",
            export_pdf: "Xuất PDF…", close_window: "Đóng cửa sổ",
            bold: "Đậm", italic: "Nghiêng", code: "Mã nội dòng", link: "Liên kết",
            h1: "Tiêu đề 1", h2: "Tiêu đề 2", h3: "Tiêu đề 3",
            quote: "Trích dẫn", ul: "Danh sách đầu mục", ol: "Danh sách số", task: "Danh sách việc",
            formula: "Khối công thức", image: "Chèn ảnh…", table: "Bảng", hr: "Dòng phân cách",
            toggle_theme: "Tối/Sáng", sync_scroll: "Bật/Tắt đồng bộ cuộn",
            split: "Chia đôi", editor_only: "Chỉ soạn thảo", preview_only: "Chỉ xem trước", help: "Trợ giúp", help_intro: "Giới thiệu MDeX", mdex_example: "Ví dụ MDeX…", convert_md: "Chuyển sang Markdown", convert_html: "Chuyển sang HTML", find: "Tìm", replace: "Thay thế",
        },
        "id" => Labels {
            file: "Berkas", edit: "Sunting", format: "Format", view: "Tampilan", window: "Jendela", language: "Bahasa",
            new: "Baru", open: "Buka…",
            load_bib: "Muat Pustaka…",
            clear_bib: "Lepas Pustaka",
            cite_example: "Contoh Kutipan…", mermaid_example: "Contoh Mermaid…", close_file: "Tutup Tab", save: "Simpan", save_as: "Simpan Sebagai…",
            export_pdf: "Ekspor PDF…", close_window: "Tutup Jendela",
            bold: "Tebal", italic: "Miring", code: "Kode Sebaris", link: "Tautan",
            h1: "Judul 1", h2: "Judul 2", h3: "Judul 3",
            quote: "Kutipan", ul: "Daftar Poin", ol: "Daftar Bernomor", task: "Daftar Tugas",
            formula: "Blok Rumus", image: "Sisip Gambar…", table: "Tabel", hr: "Pemisah",
            toggle_theme: "Gelap/Terang", sync_scroll: "Aktif/Nonaktif Sinkron Gulir",
            split: "Bagi", editor_only: "Editor", preview_only: "Pratinjau", help: "Bantuan", help_intro: "Pengenalan MDeX", mdex_example: "Contoh MDeX…", convert_md: "Konversi ke Markdown", convert_html: "Konversi ke HTML", find: "Cari", replace: "Ganti",
        },
        "ur" => Labels {
            file: "فائل", edit: "ترمیم", format: "تصور", view: "دیکھیں", window: "ونڈو", language: "زبان",
            new: "نیا", open: "کھولیں…",
            load_bib: "کتابیات لوڈ کریں…",
            clear_bib: "کتابیات ان لوڈ",
            cite_example: "اقتباس مثال…", mermaid_example: "Mermaid مثالیں…", close_file: "ٹیب بند کریں", save: "محفوظ کریں", save_as: "اس نام سے محفوظ…",
            export_pdf: "PDF برآمد…", close_window: "ونڈو بند کریں",
            bold: "موٹا", italic: "ترچھا", code: "ان لائن کوڈ", link: "ربط",
            h1: "سرخی 1", h2: "سرخی 2", h3: "سرخی 3",
            quote: "اقتباس", ul: "نقطہ فہرست", ol: "ترقیم فہرست", task: "فہرستِ کام",
            formula: "صیغہ بلاک", image: "تصویر داخل کریں…", table: "جدول", hr: "تقسیم کار",
            toggle_theme: "گہرا/ہلکا بدلیں", sync_scroll: "مطابقت اسکرول بدلیں",
            split: "تقسیم", editor_only: "صرف ایڈیٹر", preview_only: "صرف پیش نظارہ", help: "مدد", help_intro: "MDeX تعارف", mdex_example: "MDeX مثال…", convert_md: "Markdown میں تبدیل", convert_html: "HTML میں تبدیل", find: "تلاش", replace: "تبدیل",
        },
        "mn" => Labels {
            file: "Файл", edit: "Засварлах", format: "Формат", view: "Харах", window: "Цонх", language: "Хэл",
            new: "Шинэ", open: "Нээх…",
            load_bib: "Номын сан ачаалах…",
            clear_bib: "Номын сан ачаалахгүй болгох",
            cite_example: "Эшлэлийн жишээ…", mermaid_example: "Mermaid жишээ…", close_file: "Таб хаах", save: "Хадгалах", save_as: "Өөр нэрээр хадгалах…",
            export_pdf: "PDF экспортлох…", close_window: "Цонх хаах",
            bold: "Тод", italic: "Налуу", code: "Шугаман код", link: "Холбоос",
            h1: "Гарчиг 1", h2: "Гарчиг 2", h3: "Гарчиг 3",
            quote: "Ишлэл", ul: "Цэгт жагсаалт", ol: "Дугаарласан жагсаалт", task: "Даалгаврын жагсаалт",
            formula: "Томьёоны блок", image: "Зураг оруулах…", table: "Хүснэгт", hr: "Хуваагч",
            toggle_theme: "Бараан/Цайвар сэлгэх", sync_scroll: "Синхрон гүйлгэх сэлгэх",
            split: "Хуваасан харагдац", editor_only: "Зөвхөн засварлагч", preview_only: "Зөвхөн урьдчилан харах", help: "Тусламж", help_intro: "MDeX-ийн танилцуулга", mdex_example: "MDeX жишээ…", convert_md: "Markdown болгох", convert_html: "HTML болгох", find: "Хайх", replace: "Солих",
        },
        _ => Labels {
            // 中文（默认）
            file: "文件", edit: "编辑", format: "格式", view: "视图", window: "窗口", language: "语言",
            new: "新建", open: "打开…",
            load_bib: "加载文献库…",
            clear_bib: "卸载文献库",
            cite_example: "文献引用示例…", mermaid_example: "Mermaid 图示例…", close_file: "关闭标签页", save: "保存", save_as: "另存为…",
            export_pdf: "导出 PDF…", close_window: "关闭窗口",
            bold: "加粗", italic: "斜体", code: "行内代码", link: "链接",
            h1: "标题 1", h2: "标题 2", h3: "标题 3",
            quote: "引用", ul: "无序列表", ol: "有序列表", task: "任务列表",
            formula: "公式块", image: "插入图片…", table: "表格", hr: "分割线",
            toggle_theme: "切换深色/浅色", sync_scroll: "切换同步滚动",
            split: "左右分屏", editor_only: "仅编辑", preview_only: "仅预览", help: "帮助", help_intro: "MDeX简介", mdex_example: "MDeX 示例…", convert_md: "转为 Markdown", convert_html: "转为 HTML", find: "查找", replace: "替换",
        },
    }
}

/// 语言菜单项：每个语言用其本族语名（与当前界面语言无关）。
fn lang_item(app: &tauri::AppHandle, code: &str, name: &'static str) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, format!("lang-{code}"), name, true, None::<&str>)
}

/// AI 设置菜单项文案（17 种语言；zh 为默认兜底）。文案与前端 I18N 的 aiSettings key 保持一致。
fn ai_settings_label(lang: &str) -> &'static str {
    match lang {
        "en" => "AI Settings",
        "fr" => "Paramètres AI",
        "de" => "AI-Einstellungen",
        "ru" => "Настройки AI",
        "it" => "Impostazioni AI",
        "ja" => "AI 設定",
        "ko" => "AI 설정",
        "es" => "Ajustes de IA",
        "pt" => "Configurações de IA",
        "ar" => "إعدادات AI",
        "hi" => "AI सेटिंग्स",
        "pa" => "AI ਸੈਟਿੰਗਾਂ",
        "vi" => "Cài đặt AI",
        "id" => "Pengaturan AI",
        "ur" => "AI ترتیبات",
        "mn" => "AI тохиргоо",
        _ => "AI 设置",
    }
}

fn build_menu(app: &tauri::AppHandle, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let l = labels(lang);

    // ===== 应用菜单（macOS 显示为加粗应用名；预定义项由系统本地化）=====
    let app_sub = Submenu::with_items(
        app,
        "MDeX",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // ===== 文件 =====
    let m_new = MenuItem::with_id(app, "new", l.new, true, None::<&str>)?;
    let m_open = MenuItem::with_id(app, "open", l.open, true, None::<&str>)?;
    let m_loadbib = MenuItem::with_id(app, "load-bib", l.load_bib, true, None::<&str>)?;
    let m_clearbib = MenuItem::with_id(app, "clear-bib", l.clear_bib, true, None::<&str>)?;
    let m_citeex = MenuItem::with_id(app, "cite-example", l.cite_example, true, None::<&str>)?;
    let m_mermaidex = MenuItem::with_id(app, "mermaid-example", l.mermaid_example, true, None::<&str>)?;
    let m_closefile = MenuItem::with_id(app, "close-file", l.close_file, true, None::<&str>)?;
    let m_save = MenuItem::with_id(app, "save", l.save, true, None::<&str>)?;
    let m_saveas = MenuItem::with_id(app, "save-as", l.save_as, true, None::<&str>)?;
    let m_convmd = MenuItem::with_id(app, "convert-md", l.convert_md, true, None::<&str>)?;
    let m_convhtml = MenuItem::with_id(app, "convert-html", l.convert_html, true, None::<&str>)?;
    let m_close = MenuItem::with_id(app, "close", l.close_window, true, None::<&str>)?;
    let file_sub = Submenu::with_items(
        app,
        l.file,
        true,
        &[
            &m_new,
            &m_open,
            &m_loadbib,
            &m_clearbib,
            &m_closefile,
            &PredefinedMenuItem::separator(app)?,
            &m_save,
            &m_saveas,
            &PredefinedMenuItem::separator(app)?,
            &m_convmd,
            &m_convhtml,
            &PredefinedMenuItem::separator(app)?,
            &m_close,
        ],
    )?;

    // ===== 编辑（预定义项 + 查找替换）=====
    let m_find = MenuItem::with_id(app, "find", l.find, true, None::<&str>)?;
    let m_replace = MenuItem::with_id(app, "replace", l.replace, true, None::<&str>)?;
    let m_aisettings = MenuItem::with_id(app, "ai-settings", ai_settings_label(lang), true, None::<&str>)?;
    let edit_sub = Submenu::with_items(
        app,
        l.edit,
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &m_find,
            &m_replace,
            &PredefinedMenuItem::separator(app)?,
            &m_aisettings,
        ],
    )?;

    // ===== 格式 =====
    let format_sub = Submenu::with_items(
        app,
        l.format,
        true,
        &[
            &MenuItem::with_id(app, "bold", l.bold, true, None::<&str>)?,
            &MenuItem::with_id(app, "italic", l.italic, true, None::<&str>)?,
            &MenuItem::with_id(app, "code", l.code, true, None::<&str>)?,
            &MenuItem::with_id(app, "link", l.link, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "h1", l.h1, true, None::<&str>)?,
            &MenuItem::with_id(app, "h2", l.h2, true, None::<&str>)?,
            &MenuItem::with_id(app, "h3", l.h3, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quote", l.quote, true, None::<&str>)?,
            &MenuItem::with_id(app, "ul", l.ul, true, None::<&str>)?,
            &MenuItem::with_id(app, "ol", l.ol, true, None::<&str>)?,
            &MenuItem::with_id(app, "task", l.task, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "formula", l.formula, true, None::<&str>)?,
            &MenuItem::with_id(app, "image", l.image, true, None::<&str>)?,
            &MenuItem::with_id(app, "table", l.table, true, None::<&str>)?,
            &MenuItem::with_id(app, "hr", l.hr, true, None::<&str>)?,
        ],
    )?;

    // ===== 视图 =====
    let view_sub = Submenu::with_items(
        app,
        l.view,
        true,
        &[
            &MenuItem::with_id(app, "toggle-theme", l.toggle_theme, true, None::<&str>)?,
            &MenuItem::with_id(app, "sync-scroll", l.sync_scroll, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "view-split", l.split, true, None::<&str>)?,
            &MenuItem::with_id(app, "view-editor", l.editor_only, true, None::<&str>)?,
            &MenuItem::with_id(app, "view-preview", l.preview_only, true, None::<&str>)?,
        ],
    )?;

    // ===== 语言（每个语言用本族语名）=====
    let lang_sub = Submenu::with_items(
        app,
        l.language,
        true,
        &[
            &lang_item(app, "zh", "中文")?,
            &lang_item(app, "en", "English")?,
            &lang_item(app, "fr", "Français")?,
            &lang_item(app, "de", "Deutsch")?,
            &lang_item(app, "ru", "Русский")?,
            &lang_item(app, "it", "Italiano")?,
            &lang_item(app, "ja", "日本語")?,
            &lang_item(app, "ko", "한국어")?,
            &lang_item(app, "es", "Español")?,
            &lang_item(app, "pt", "Português")?,
            &lang_item(app, "ar", "العربية")?,
            &lang_item(app, "hi", "हिन्दी")?,
            &lang_item(app, "pa", "ਪੰਜਾਬੀ")?,
            &lang_item(app, "vi", "Tiếng Việt")?,
            &lang_item(app, "id", "Bahasa Indonesia")?,
            &lang_item(app, "ur", "اردو")?,
            &lang_item(app, "mn", "Монгол (Кирилл)")?,
        ],
    )?;

    // ===== 窗口（预定义项，系统本地化）=====
    let win_sub = Submenu::with_items(
        app,
        l.window,
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    // ===== 帮助 =====
    // 菜单项「MDeX简介」(id=help) 打开帮助弹窗；菜单栏标题仍为「帮助」(l.help)。
    let help_item = MenuItem::with_id(app, "help", l.help_intro, true, None::<&str>)?;
    let m_mdexex = MenuItem::with_id(app, "mdex-example", l.mdex_example, true, None::<&str>)?;
    let help_sub = Submenu::with_items(
        app,
        l.help,
        true,
        &[
            &help_item,
            &PredefinedMenuItem::separator(app)?,
            &m_mdexex,
            &m_citeex,
            &m_mermaidex,
        ],
    )?;

    Menu::with_items(app, &[&app_sub, &file_sub, &edit_sub, &format_sub, &view_sub, &lang_sub, &win_sub, &help_sub])
}

// ============================ 可选 AI 改写 ============================
// 仅当用户在前端配置 Key/端点并触发时才联网。流式调用 OpenAI 兼容 /chat/completions，
// 逐 token 经 Tauri event 推回【发起窗口】（ai-token）；结束/取消/出错分别发
// ai-done / ai-cancelled / ai-error。Key 存前端 localStorage（用户决定），每次随 invoke 传入，
// Rust 侧不持久化任何凭据。

/// 复用的 HTTP 客户端（#性能5）：连接池/TLS 会话跨 ai_rewrite 调用复用，省每次 DNS/TCP/TLS 握手。
/// reqwest::Client 内部用 Arc、是 Send+Sync，可安全作进程级 static。
static AI_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

/// 进行中的 AI 任务：job_id → 取消通道。ai_cancel 取出并 drop 该 oneshot::Sender，
/// select! 的 cancel 分支随即解析 → 中断流式循环。Mutex 守卫只在插入/移除时短暂持有，不跨 await。
#[derive(Default)]
struct AiState {
    cancel: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

/// ai-token 事件载荷：增量文本片段。
#[derive(Clone, serde::Serialize)]
struct AiToken {
    job_id: String,
    delta: String,
}

/// ai-done / ai-cancelled / ai-error 事件载荷。message 仅 ai-error 用。
#[derive(Clone, serde::Serialize)]
struct AiSignal {
    job_id: String,
    message: Option<String>,
}

/// 多轮对话历史的一条消息。assistant 的 content 含 EDIT: 前缀（若该轮是改写），保持与模型产出一致。
#[derive(serde::Deserialize)]
struct ChatMsg {
    role: String,
    content: String,
}

/// 解析单行 SSE：`data: {json}` → 取 choices[0].delta.content → emit ai-token。
/// `data: [DONE]` / 空行 / 注释行（以 `:` 开头的 keepalive）/ 半包 JSON 一律静默跳过。
/// 解析单行 SSE，返回其中的增量文本（OpenAI choices[].delta.content 或 Anthropic delta.text）。
/// 非 data 行 / [DONE] / 空 / 注释行 / 半包 JSON → None。纯函数，便于单测。
fn parse_sse_line(line: &str) -> Option<String> {
    let payload = line.trim().strip_prefix("data:")?.trim();
    if payload.is_empty() || payload == "[DONE]" {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    let content = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|x| x.as_str())
        // Anthropic 流式：content_block_delta 事件的 delta.text
        .or_else(|| v.get("delta").and_then(|d| d.get("text")).and_then(|x| x.as_str()))?;
    if content.is_empty() { None } else { Some(content.to_string()) }
}

/// 从字节缓冲取出所有以 \n 结尾的完整行（剥 \r），未结束的半行留在 buf。纯函数，便于单测。
/// 按 b'\n' 切分（UTF-8 续字节均 ≥0x80，永不会与 \n 混淆）→ 半行里即便含残半多字节字符也安全保留，
/// 等下一块补全后再整体 from_utf8，杜绝跨 TCP 分块的中文乱码。
fn drain_complete_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    // 游标 start 记已消费偏移，循环末尾一次性 drain（#性能6）：
    // 原实现每行 buf.drain(0..=nl) 都把尾部整体左移，k 行的块为 O(k·B)；突发大块 SSE 时劣化明显。
    let mut start = 0;
    while let Some(rel) = buf[start..].iter().position(|&b| b == b'\n') {
        let nl = start + rel;
        if let Ok(line) = std::str::from_utf8(&buf[start..nl]) {
            lines.push(line.trim_end_matches('\r').to_string());
        }
        start = nl + 1;
    }
    if start > 0 {
        buf.drain(..start); // 只留未结束的半行
    }
    lines
}

fn emit_sse_line(window: &WebviewWindow, job_id: &str, line: &str) {
    if let Some(delta) = parse_sse_line(line) {
        let _ = window.emit("ai-token", AiToken { job_id: job_id.to_string(), delta });
    }
}

/// 流式改写。system 强约束「只输出改写后片段」，避免把解释/围栏写进文档。
/// invoke 始终返回 Ok(())：结果、取消、错误全部经事件传达，前端按 job_id 归属过滤。
/// 预检失败（缺端点/Key/空选区）直接返回 Err，前端 invoke 的 catch 即时提示。
#[tauri::command]
async fn ai_rewrite(
    window: WebviewWindow,
    ai: tauri::State<'_, AiState>,
    job_id: String,
    provider: String,
    endpoint: String,
    api_key: String,
    model: String,
    temperature: f64,
    selected: String,
    instruction: String,
    context_before: String,
    context_after: String,
    history: Vec<ChatMsg>,
) -> Result<(), String> {
    // —— 1. 预检：给前端可读错误 ——
    if endpoint.trim().is_empty() {
        return Err("未配置 AI 端点（endpoint）。请在设置中填写。".into());
    }
    if api_key.trim().is_empty() {
        return Err("未配置 API Key。请在设置中填写。".into());
    }

    // —— 2. 注册取消通道（守卫不跨 await，用作用域包裹）——
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let mut g = ai.cancel.lock().map_err(|e| format!("内部状态错误: {e}"))?;
        g.insert(job_id.clone(), cancel_tx);
    }
    tokio::pin!(cancel_rx); // 让 oneshot::Receiver 可在 select! 中按 &mut 反复轮询

    // —— 3. 构造请求（按 provider 分支；system/user 文案两协议共用）——
    // 统一多轮对话：system 自适应——编辑/生成类指令输出 EDIT: 前缀（前端据此路由到编辑区），
    // 仅明确提问才作答（进对话区）。history 为之前各轮（assistant 含 EDIT: 前缀，保持与产出一致）。
    let system = "你是 Markdown 文本助手。用户正在编辑一篇文档（【待编辑文本】即编辑区当前内容，随对话演进）。\
**默认大多数指令都是要修改或生成编辑区内容的**——只有用户明确【提问、要求解释概念、闲聊】时才作答（不加 EDIT:）。\
根据每条用户指令判断意图：\
(1) 编辑/生成类——改写、润色、翻译、扩写、缩写、修正、续写，以及「写一段/添加一段/生成/创作/介绍/替换 X」\
等要求【产出内容】的指令（含「加到编辑区/放进编辑区」等元指令）→ 输出新的编辑区完整内容，以 EDIT: 开头作标记，\
EDIT: 后紧跟内容本身，不要解释/前言/后缀，不要 ```markdown 围栏，保持原文 Markdown 标题层级与语法；\
(2) 仅当用户明确【提问、要求解释、闲聊】（如「什么是/为什么/有没有/解释一下」）→ 直接回答，不要 EDIT: 前缀；\
(3) 用与上下文一致的语言。当前【待编辑文本】以用户本轮提供的内容为准。";
    let user = format!(
        "【上下文（仅供参考，禁止改写）】\n前：{context_before}\n后：{context_after}\n\n\
【待编辑文本（编辑类请基于它改写；问答类请基于它回答；若为空则是要在光标处生成新内容）】\n{selected}\n\n\
【本轮指令】{instruction}"
    );
    // 复用进程级 Client（#性能5）：连接池/TLS 会话跨调用复用，首次构建后不再重建。
    let client = AI_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(300)) // 单轮上限 5 分钟；用户可随时 Esc 取消
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    });

    // Anthropic：x-api-key + anthropic-version 鉴权，system 为顶层字段，max_tokens 必填，
    // 端点 {base}/v1/messages（base 已含 /v1 时只追加 /messages）。
    // 其它（含 "openai" / OpenAI 兼容）：Bearer 鉴权，system 作首条 message，端点 {base}/chat/completions。
    // 两协议都把 history（之前各轮）拼到本轮 user 之前；history 由前端保证 user/assistant 交替、以 user 开头。
    let req = if provider == "anthropic" {
        let base = endpoint.trim_end_matches('/');
        let url = if base.ends_with("/v1") {
            format!("{base}/messages")
        } else {
            format!("{base}/v1/messages")
        };
        let mut msgs = Vec::with_capacity(history.len() + 1);
        for h in &history {
            msgs.push(serde_json::json!({ "role": h.role, "content": h.content }));
        }
        msgs.push(serde_json::json!({ "role": "user", "content": user }));
        client
            .post(&url)
            .header("x-api-key", api_key.trim())
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "max_tokens": 2048,
                "system": system,
                "messages": msgs,
                "temperature": temperature,
                "stream": true,
            }))
    } else {
        let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
        let mut msgs = vec![serde_json::json!({ "role": "system", "content": system })];
        for h in &history {
            msgs.push(serde_json::json!({ "role": h.role, "content": h.content }));
        }
        msgs.push(serde_json::json!({ "role": "user", "content": user }));
        client.post(&url).bearer_auth(api_key.trim()).json(&serde_json::json!({
            "model": model,
            "messages": msgs,
            "temperature": temperature,
            "stream": true,
        }))
    };

    let resp = req.send().await;
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            let _ = window.emit(
                "ai-error",
                AiSignal { job_id, message: Some(format!("连接 AI 服务失败: {e}")) },
            );
            return Ok(());
        }
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let snippet: String = text.chars().take(500).collect();
        let _ = window.emit(
            "ai-error",
            AiSignal { job_id, message: Some(format!("AI 服务返回 {status}: {snippet}")) },
        );
        return Ok(());
    }

    // —— 4. 逐块读 SSE，按字节 \n 切行解析；半行留在 buf 等下一块 ——
    // 用字节缓冲（而非 String）的原因：多字节 UTF-8（如中文）可能被 TCP 分块切成两半，
    // 逐块 from_utf8_lossy 会把残半字符变成 U+FFFD。按 b'\n' 切行时，半行（含残半字符）
    // 因尚无换行符而留在缓冲，等下一块补全后再整体 from_utf8——而 b'\n' 永不落在多字节
    // 字符内部（UTF-8 续字节均 ≥0x80），故按字节切行天然安全。
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut got_data = false; // 是否已收到过数据（末尾解码错误时据此区分"流末关闭"与"真错误"）
    loop {
        tokio::select! {
            // 取消：oneshot Sender 被 ai_cancel 取走并 drop → rx 解析（含 Err）→ 退出循环
            _ = &mut cancel_rx => {
                let _ = window.emit("ai-cancelled", AiSignal { job_id: job_id.clone(), message: None });
                break;
            }
            chunk = stream.next() => match chunk {
                None => {
                    // 流结束：冲刷缓冲里可能的残余半行，再发 ai-done
                    if !buf.is_empty() {
                        if let Ok(line) = std::str::from_utf8(&buf) {
                            emit_sse_line(&window, &job_id, line.trim_end_matches('\r'));
                        }
                        buf.clear();
                    }
                    let _ = window.emit("ai-done", AiSignal { job_id: job_id.clone(), message: None });
                    break;
                }
                Some(Err(e)) => {
                    // 已收到数据却在此报错（常见于服务端在流末尾关闭连接，reqwest 误判为响应体不完整：
                    // "error decoding response body"）→ 当作正常结束：冲刷残余 + ai-done。
                    // 仅从未收到过数据时才视为真正的连接/协议错误。
                    if got_data {
                        if !buf.is_empty() {
                            if let Ok(line) = std::str::from_utf8(&buf) {
                                emit_sse_line(&window, &job_id, line.trim_end_matches('\r'));
                            }
                            buf.clear();
                        }
                        let _ = window.emit("ai-done", AiSignal { job_id: job_id.clone(), message: None });
                    } else {
                        let _ = window.emit(
                            "ai-error",
                            AiSignal { job_id: job_id.clone(), message: Some(format!("读取流失败: {e}")) },
                        );
                    }
                    break;
                }
                Some(Ok(bytes)) => {
                    if !bytes.is_empty() { got_data = true; }
                    buf.extend_from_slice(&bytes);
                    for line in drain_complete_lines(&mut buf) {
                        emit_sse_line(&window, &job_id, &line);
                    }
                }
            },
        }
    }

    // —— 5. 收尾：注销任务（若已被 ai_cancel 取走则为空操作）——
    if let Ok(mut g) = ai.cancel.lock() {
        g.remove(&job_id);
    }
    Ok(())
}

/// 取消进行中的 ai_rewrite：取出并 drop oneshot::Sender，触发该任务 select! 的 cancel 分支。
#[tauri::command]
fn ai_cancel(ai: tauri::State<'_, AiState>, job_id: String) -> Result<bool, String> {
    let removed = ai
        .cancel
        .lock()
        .map_err(|e| format!("内部状态错误: {e}"))?
        .remove(&job_id)
        .is_some();
    Ok(removed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 用系统浏览器打开帮助文档里的外部链接（GitHub / 下载站点）。应用本身仍完全离线。
        .plugin(tauri_plugin_opener::init())
        .manage(WindowState {
            open: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            viewer_content: Mutex::new(HashMap::new()),
            ai_panel_content: Mutex::new(HashMap::new()),
            ai_panel_main: Mutex::new(None),
            main_taken: AtomicBool::new(false),
            next_id: Mutex::new(0),
            lang: Mutex::new("zh".into()),
            focused: Mutex::new(None),
            ai_auto_top: AtomicBool::new(true),
            ai_focus_token: AtomicU64::new(0),
        })
        .manage(AiState::default()) // AI 任务取消通道表（ai_rewrite / ai_cancel 共用）
        .invoke_handler(tauri::generate_handler![
            pick_and_read,
            pick_and_read_bib,
            save_as,
            pick_save_path,
            write_bytes_at,
            read_file_at,
            resolve_doc_link,
            write_file_at,
            read_image_data_url,
            change_language,
            print_webview,
            take_window_file,
            register_file,
            claim_file,
            unregister_file,
            open_viewer_window,
            take_viewer_content,
            emit_viewer_update,
            open_ai_panel,
            take_ai_panel_content,
            set_ai_panel_main,
            is_ai_panel_main,
            set_ai_panels_on_top,
            apply_ai_edit,
            draft_images_base,
            move_dir,
            remove_dir,
            path_exists,
            file_mtime,
            copy_dir,
            copy_file,
            app_version,
            app_icon_path,
            ai_rewrite,
            ai_cancel
        ])
        .on_menu_event(|app, event| {
            // 转发到【当前活动窗口】（emit 广播会让每个窗口都响应，多窗口下必须定向）。
            // 优先用 Focused 事件维护的 focused 记录（可靠，远早于快捷键触发）；
            // 缺失时回退 is_focused()，再回退 main。
            let id = event.id().as_ref().to_string();
            let label = app
                .try_state::<WindowState>()
                .and_then(|s| s.focused.lock().ok().and_then(|g| g.clone()))
                .or_else(|| {
                    app.webview_windows()
                        .into_values()
                        .find(|w| w.is_focused().unwrap_or(false))
                        .map(|w| w.label().to_string())
                })
                .unwrap_or_else(|| "main".to_string());
            let _ = app.emit_to(&label, "menu-action", id);
        })
        .on_window_event(|window, event| {
            // OS 文件拖入窗口：WKWebView 的 HTML5 drop 拿不到 dataTransfer.files（安全限制），
            // 故捕获原生 DragDropEvent，把落点路径转发给【本窗口】前端（emit 广播会泄漏到所有窗口，须 emit_to）。
            if let tauri::WindowEvent::DragDrop(drag) = event {
                if let tauri::DragDropEvent::Drop { paths, .. } = drag {
                    let ps: Vec<String> = paths
                        .iter()
                        .filter_map(|p| p.to_str().map(|s| s.to_string()))
                        .collect();
                    if !ps.is_empty() {
                        let _ = window.emit_to(window.label(), "file-drop", ps);
                    }
                }
            }
            // 窗口销毁：清理其占用的 open/pending 记录（main_taken 不重置——避免向已销毁的主窗口路由）
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if let Some(st) = window.app_handle().try_state::<WindowState>() {
                    st.pending.lock().unwrap().remove(&label);
                    st.viewer_content.lock().unwrap().remove(&label);
                    st.ai_panel_content.lock().unwrap().remove(&label);
                    st.open.lock().unwrap().retain(|_, v| *v != label);
                    // 若销毁的正是焦点窗口，清空焦点记录（回退到 is_focused/main）
                    let mut f = st.focused.lock().unwrap();
                    if f.as_deref() == Some(label.as_str()) {
                        *f = None;
                    }
                }
                // AI 辅助窗口关闭 → 通知主窗口清掉 hl 上的选区/光标标记
                if label.starts_with("ai-panel-") {
                    let _ = window.app_handle().emit_to("main", "ai-panel-closed", label.clone());
                }
                // 主窗口关闭 = 用户退出程序 → 关闭所有子窗口(ai-panel/file/mermaid)，否则它们会残留、app 不退出
                if label == "main" {
                    for (lbl, w) in window.app_handle().webview_windows() {
                        if lbl != "main" { let _ = w.close(); }
                    }
                }
            }
            // 窗口获得键盘焦点：记录其 label。该事件在用户点击/切换窗口时可靠触发，
            // 远早于任何菜单快捷键，故 on_menu_event 据此定向到真正活动的窗口。
            if let tauri::WindowEvent::Focused(true) = event {
                let label = window.label().to_string();
                let app = window.app_handle().clone();
                if let Some(st) = app.try_state::<WindowState>() {
                    *st.focused.lock().unwrap() = Some(label);
                    // BUG-151 方案D：任意 MDeX 窗口聚焦 = app 激活 → 作废旧失焦去抖 + AI 升 floating
                    if st.ai_auto_top.load(Ordering::Relaxed) {
                        st.ai_focus_token.fetch_add(1, Ordering::Relaxed);
                        set_ai_panels_level(&app, true);
                    }
                }
            }
            // BUG-151 方案D：窗口失焦 → 去抖判定 app 是否整体失活(无任何 MDeX 窗口聚焦)；是则降 AI 到
            // normal，被别的 App 盖住。去抖 150ms 防"主窗→AI窗"焦点切换瞬间把 AI 误降。令牌作废旧线程。
            if let tauri::WindowEvent::Focused(false) = event {
                let app = window.app_handle().clone();
                if let Some(st) = app.try_state::<WindowState>() {
                    if st.ai_auto_top.load(Ordering::Relaxed) {
                        let token = st.ai_focus_token.fetch_add(1, Ordering::Relaxed) + 1;
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(150));
                            let st2 = match app.try_state::<WindowState>() { Some(s) => s, None => return };
                            if st2.ai_focus_token.load(Ordering::Relaxed) != token { return; } // 已被新焦点事件作废
                            let any_focused = app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false));
                            if !any_focused { set_ai_panels_level(&app, false); } // app 失活 → AI 降级被别的 App 盖住
                        });
                    }
                }
            }
        })
        .setup(|app| {
            let menu = build_menu(app.handle(), "zh")?;
            app.set_menu(menu)?;
            // Windows/Linux 冷启动 argv：逐个路由（macOS argv 为空，文件走 RunEvent::Opened）
            for p in args_to_files() {
                route_file(app.handle(), &p);
            }
            Ok(())
        });

    // Windows/Linux：应用已运行时再双击文件，系统会拉起第二个进程（新 argv）。
    // 用 single-instance 拦截，把 argv 转给已运行实例，复用 file-drop 通道打开。
    // macOS 天然单实例、走 Apple Event（见下方 RunEvent::Opened），故此插件仅在这两个平台启用。
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        // 暖启动：第二个进程的 argv 转给已运行实例，按 route_file 决定置顶已有窗口或开新窗口
        let paths: Vec<String> = argv
            .iter()
            .skip(1)
            .filter_map(|a| {
                let p = PathBuf::from(a);
                if p.is_file() {
                    p.to_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect();
        for p in &paths {
            route_file(app, p);
        }
    }));

    builder
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用失败")
        .run(|app, event| {
            // macOS：双击文件由系统经 application:openFiles: 投递，对应 RunEvent::Opened。
            // 该变体仅 macos/ios/android 存在，故按平台门控，避免另外两个平台编译失败。
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            {
                // macOS：双击文件由系统经 application:openFiles: 投递，按 route_file 路由
                if let tauri::RunEvent::Opened { urls } = event {
                    let paths: Vec<String> = urls
                        .iter()
                        .filter_map(|u| {
                            u.to_file_path()
                                .ok()
                                .and_then(|p| p.to_str().map(|s| s.to_string()))
                        })
                        .collect();
                    for p in &paths {
                        route_file(app, p);
                    }
                }
            }

            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            {
                // Windows/Linux 走 argv（见 setup 与 single-instance），此处无需处理。
                let _ = (app, event);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- 路径安全校验（assert_safe_path）：合法另存为/草稿图路径不得被误拒，敏感目录须拒 ----
    #[test]
    fn assert_safe_path_allows_legit_save_paths() {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/test".into());
        let cases = vec![
            "/Users/z/Documents/doc.md".to_string(),
            "/Users/z/Documents/doc_images/pic.png".to_string(),          // 目标图文件夹尚不存在
            "/var/folders/xx/T/mdex_tmp/a.png".to_string(),               // $TMPDIR 草稿(macOS symlink→/private/var)
            format!("{}/Library/Caches/com.mdex.app/mdex_draft_images/1/pic.png", home), // app_cache_dir 草稿
            format!("{}/Documents/my.md", home),
            format!("{}/Desktop/proj/fig.png", home),
            "C:\\Users\\me\\Docs\\img.png".to_string(),
        ];
        for p in &cases {
            assert_eq!(assert_safe_path(p), Ok(()), "误拒合法路径: {}", p);
        }
    }
    #[test]
    fn assert_safe_path_rejects_sensitive() {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/test".into());
        for p in &[
            format!("{}/.ssh/id_rsa", home),
            "/etc/passwd".to_string(),
            format!("{}/.aws/credentials", home),
        ] {
            assert!(assert_safe_path(p).is_err(), "应拒绝却放行: {}", p);
        }
    }

    // ---- AI SSE 解析（parse_sse_line / drain_complete_lines）----
    #[test]
    fn sse_openai_delta() {
        assert_eq!(parse_sse_line(r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#), Some("hello".into()));
    }
    #[test]
    fn sse_openai_absent_content_is_none() {
        // role-only delta（流式首块）：content 缺省 → None，不吐空 token
        assert_eq!(parse_sse_line(r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#), None);
    }
    #[test]
    fn sse_anthropic_text_delta() {
        assert_eq!(
            parse_sse_line(r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}"#),
            Some("你好".into())
        );
    }
    #[test]
    fn sse_done_nondata_malformed() {
        assert_eq!(parse_sse_line("data: [DONE]"), None);
        assert_eq!(parse_sse_line(": keepalive"), None); // SSE 注释行
        assert_eq!(parse_sse_line("event: content_block_delta"), None);
        assert_eq!(parse_sse_line("data: "), None);
        assert_eq!(parse_sse_line("data: {半截 json"), None);
    }
    #[test]
    fn drain_basic_crlf_and_partial() {
        let mut buf = b"data: a\ndata: b\r\npartial".to_vec();
        let lines = drain_complete_lines(&mut buf);
        assert_eq!(lines, vec!["data: a".to_string(), "data: b".to_string()]);
        assert_eq!(buf, b"partial"); // 半行保留
    }
    #[test]
    fn drain_cjk_split_across_chunks() {
        // 模拟「中」(E4 B8 AD) 被 TCP 切到只剩前两字节、且整行尚无换行符。
        let full = "data: {\"x\":\"中\"}\n";
        let mid = full.as_bytes();
        let zhong = full.find('中').unwrap(); // 「中」起始字节下标
        let mut buf = mid[..zhong + 2].to_vec(); // 含 E4 B8，缺末字节 AD，且无 \n
        assert!(drain_complete_lines(&mut buf).is_empty(), "半字符的半行不应产出任何行");
        assert!(!buf.is_empty(), "半行应保留在缓冲");
        // 续上剩余字节（AD + 后续 + \n）→ 行完整、UTF-8 完整，应正确产出且无乱码
        buf.extend_from_slice(&mid[zhong + 2..]);
        let lines = drain_complete_lines(&mut buf);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains('中'), "拼接后应得到完整中文，无乱码");
        assert!(buf.is_empty());
    }
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn atomic_write_creates_file_and_leaves_no_tmp() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("a.md");
        atomic_write(&target, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "hello");
        // 成功后目录里只剩目标文件，无 .mdex-tmp-* 残留
        let entries: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().into_string().unwrap_or_default())
            .collect();
        assert_eq!(entries, vec!["a.md".to_string()]);
    }

    #[test]
    fn atomic_write_replaces_existing() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("a.md");
        fs::write(&target, "old").unwrap();
        atomic_write(&target, b"new content").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "new content");
    }

    #[test]
    fn atomic_write_failed_target_untouched() {
        // 写到不存在的父目录 → 失败，且不产生残留临时文件
        let dir = tempdir().unwrap();
        let target = dir.path().join("nope").join("a.md");
        assert!(atomic_write(&target, b"x").is_err());
        assert!(!dir.path().join("nope").exists());
    }

    #[test]
    fn decode_utf8_plain() {
        assert_eq!(decode_bytes_lossless("你好".as_bytes()), "你好");
    }

    #[test]
    fn decode_utf8_bom_stripped() {
        let mut b = vec![0xEF, 0xBB, 0xBF];
        b.extend_from_slice(b"hi");
        assert_eq!(decode_bytes_lossless(&b), "hi");
    }

    #[test]
    fn decode_gbk() {
        // "中文" 的 GBK 编码：中=D6D0, 文=CEC4
        assert_eq!(decode_bytes_lossless(&[0xD6, 0xD0, 0xCE, 0xC4]), "中文");
    }

    #[test]
    fn decode_utf16le_bom() {
        // BOM FF FE + 'A','B' 的 UTF-16LE
        let b = [0xFF, 0xFE, b'A', 0x00, b'B', 0x00];
        assert_eq!(decode_bytes_lossless(&b), "AB");
    }

    #[test]
    fn decode_windows1252_fallback_never_fails() {
        // 单字节 0xFF：UTF-8 非法、GBK 也非法（U+FFFD）→ 退回 windows-1252 → ÿ (U+00FF)
        assert_eq!(decode_bytes_lossless(&[0xFF]), "\u{00FF}");
    }

    #[test]
    fn detect_png_by_magic_even_with_wrong_ext() {
        // 扩展名故意非 png，但 magic 命中 PNG → 认定为 png（防 /etc/passwd 伪装的核心）
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(
            detect_image_mime(std::path::Path::new("x.dat"), &png),
            Some("image/png")
        );
    }

    #[test]
    fn detect_non_image_text_rejected() {
        // 纯文本、无图片扩展名 → None（堵 <img src="/etc/passwd">）
        assert_eq!(
            detect_image_mime(std::path::Path::new("passwd"), b"root:x:0:0\n"),
            None
        );
    }

    #[test]
    fn detect_svg_by_extension() {
        assert_eq!(
            detect_image_mime(std::path::Path::new("d.svg"), b"<svg/>"),
            Some("image/svg+xml")
        );
    }

    #[test]
    fn detect_avif_by_ftyp_magic() {
        // AVIF: [size]["ftyp"]["avif"…]
        let avif = [0x00, 0x00, 0x00, 0x20, b'f', b't', b'y', b'p', b'a', b'v', b'i', b'f'];
        assert_eq!(
            detect_image_mime(std::path::Path::new("x.avif"), &avif),
            Some("image/avif")
        );
    }

    #[test]
    fn copy_dir_recursive_copies_tree() {
        let dir = tempdir().unwrap();
        let from = dir.path().join("from");
        let to = dir.path().join("to");
        fs::create_dir_all(from.join("sub")).unwrap();
        fs::write(from.join("a.txt"), "a").unwrap();
        fs::write(from.join("sub").join("b.txt"), "b").unwrap();
        copy_dir_recursive(&from, &to).unwrap();
        assert_eq!(fs::read_to_string(to.join("a.txt")).unwrap(), "a");
        assert_eq!(fs::read_to_string(to.join("sub").join("b.txt")).unwrap(), "b");
    }

    #[test]
    fn classify_claim_three_branches() {
        // D4 所有权判定三分支：未占用 / 本窗口已持有 / 别窗口持有。
        let mut m: HashMap<String, String> = HashMap::new();
        assert_eq!(classify_claim(&m, "main", "k"), Claim::OpenFresh);
        m.insert("k".into(), "main".into());
        assert_eq!(classify_claim(&m, "main", "k"), Claim::AlreadyMine);
        assert_eq!(
            classify_claim(&m, "file-1", "k"),
            Claim::OwnedByOther("main".into())
        );
    }

    #[test]
    fn file_mtime_present_and_absent() {
        // D8：存在文件返回 Some，不存在返回 None。
        let dir = tempdir().unwrap();
        let f = dir.path().join("x.md");
        assert_eq!(file_mtime(f.to_string_lossy().into_owned()), None); // 尚未创建
        std::fs::write(&f, "hi").unwrap();
        assert!(file_mtime(f.to_string_lossy().into_owned()).is_some());
    }

    // 注：atomic_write 的"崩溃半路原子性"（kill -9/断电）无法在单测里模拟；
    //     此处只验证其可观测不变式：成功无残留、内容完整、覆盖正确、失败不动目标。
}
