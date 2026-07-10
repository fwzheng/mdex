// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>
//
// MDeX — Tauri v2 主进程
// 仅提供：原生菜单、文件打开/保存（原生对话框）、窗口控制、界面语言切换。无网络逻辑。

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use base64::Engine as _;

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
    main_taken: AtomicBool,
    next_id: Mutex<u64>,
    lang: Mutex<String>,
    focused: Mutex<Option<String>>,
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

/// 前端启动后调用：取走本窗口待打开的文件路径（取后清空）。主窗口无论取到与否都标记为已占用。
#[tauri::command]
fn take_window_file(window: WebviewWindow, state: tauri::State<WindowState>) -> Option<String> {
    let label = window.label().to_string();
    if label == "main" {
        state.main_taken.store(true, Ordering::SeqCst);
    }
    state.pending.lock().unwrap().remove(&label)
}

/// 返回应用版本号（编译期取自 Cargo.toml 的 CARGO_PKG_VERSION）。
/// 供帮助文档等处动态显示版本，避免把版本号写死在多语言文案里、升级时漏改。
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 前端打开某文件后登记：本窗口持有该文件（跨窗口去重——之后双击同一文件会置顶本窗口而非开新窗口）。
#[tauri::command]
fn register_file(window: WebviewWindow, state: tauri::State<WindowState>, path: String) {
    let key = canon_key(&path);
    let label = window.label().to_string();
    state.open.lock().unwrap().insert(key, label);
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
            let content = fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))?;
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
            let content = fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))?;
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
            fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))?;
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

/// 按完整路径写入二进制（用于 PDF 等非文本导出）。data 为 base64 编码的字节。
#[tauri::command]
fn write_bytes_at(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("解码失败: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("写入失败: {e}"))
}

/// 按完整路径读取（用于「最近打开」等场景）。
#[tauri::command]
fn read_file_at(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

/// 按完整路径写入。
#[tauri::command]
fn write_file_at(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))
}

/// 读取本地图片并以 data URL 返回。
/// 用于渲染 markdown 中引用的本地相对路径图片（前端按 .md 所在目录拼绝对路径后调用）。
#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let canon = fs::canonicalize(&path).map_err(|e| format!("无法访问 {path}: {e}"))?;
    let bytes = fs::read(&canon).map_err(|e| format!("读取失败: {e}"))?;
    let ext = canon
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
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
    // Win/Linux：app.set_menu 不保证覆盖之后创建的窗口，逐窗补一次确保所有窗口菜单同步
    for w in app.webview_windows().values() {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WindowState {
            open: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            main_taken: AtomicBool::new(false),
            next_id: Mutex::new(0),
            lang: Mutex::new("zh".into()),
            focused: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            pick_and_read,
            pick_and_read_bib,
            save_as,
            pick_save_path,
            write_bytes_at,
            read_file_at,
            write_file_at,
            read_image_data_url,
            change_language,
            print_webview,
            take_window_file,
            register_file,
            unregister_file,
            app_version
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
                    st.open.lock().unwrap().retain(|_, v| *v != label);
                    // 若销毁的正是焦点窗口，清空焦点记录（回退到 is_focused/main）
                    let mut f = st.focused.lock().unwrap();
                    if f.as_deref() == Some(label.as_str()) {
                        *f = None;
                    }
                }
            }
            // 窗口获得键盘焦点：记录其 label。该事件在用户点击/切换窗口时可靠触发，
            // 远早于任何菜单快捷键，故 on_menu_event 据此定向到真正活动的窗口。
            if let tauri::WindowEvent::Focused(true) = event {
                let label = window.label().to_string();
                if let Some(st) = window.app_handle().try_state::<WindowState>() {
                    *st.focused.lock().unwrap() = Some(label);
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
