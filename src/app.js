// @ts-check
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  /** @type {HTMLTextAreaElement} */
  const editor = /** @type {HTMLTextAreaElement} */ ($("editor"));
  const preview = $("preview");
  const main = $("main");
  /** @type {HTMLInputElement} */
  const fileInput = /** @type {HTMLInputElement} */ ($("file-input"));

  // Tauri 桥（构建后存在；浏览器中为 null，走降级）
  const T = window.__TAURI__;
  const invoke = (cmd, args) => (T && T.core && T.core.invoke ? T.core.invoke(cmd, args) : Promise.resolve(null));
  const isTauri = !!(T && T.core && T.core.invoke);

  // 当前窗口 label（"main" / "file-N" / "mermaid-N"）。用于草稿图片目录按窗口隔离（D3），
  // 避免两个窗口的 tabId=1 草稿写到同一 <cache>/mdex_draft_images/1/ 互相覆盖/删除。
  // 字符已做白名单清洗（label 本身仅含字母数字与连字符，清洗仅为防御性，防拼进文件路径）。
  let winLabel = "main";
  if (isTauri && T) {
    try {
      const m = T.window || (T.webviewWindow || {});
      const w = m.getCurrentWindow ? m.getCurrentWindow()
        : (m.getCurrentWebviewWindow ? m.getCurrentWebviewWindow() : null);
      if (w && w.label) winLabel = String(w.label).replace(/[^A-Za-z0-9_-]/g, "_") || "main";
    } catch (_) {}
  }

  /**
   * 标签对象契约（E3：把散落各处的字段集中为单一类型定义，编辑器/重构时 catch 字段拼写/类型错误）。
   * @typedef {Object} Tab
   * @property {number} id
   * @property {string} name
   * @property {string} path        绝对路径，草稿为空串
   * @property {string} dir         文件所在目录，草稿为空串
   * @property {string} content     编辑器文本
   * @property {("md"|"html")} type
   * @property {boolean} dirty
   * @property {number} scrollTop
   * @property {number} selStart
   * @property {number} selEnd
   * @property {string} bibText
   * @property {{kind: string, ver: number}|null} sample
   * @property {string|null} imgDir
   * @property {string|null} imgSub
   * @property {number|null} [mtime] 磁盘 mtime 基线（D8 外部修改检测）
   */
  /** @type {Tab[]} */
  let tabs = [];
  let activeId = null;           // 当前激活标签 id
  let nextId = 1;
  // 本地图片绝对路径 -> data URL(Promise) 的 LRU 缓存（避免每次渲染重新读取；C5 限容量防长会话膨胀）。
  const IMG_CACHE_CAP = 200;
  const imgCache = new Map();     // Map 保留插入序：访问时 delete+set 提到末尾=MRU，淘汰取 keys().next()=最旧
  function imgCacheSet(key, val) {
    if (imgCache.has(key)) imgCache.delete(key);
    imgCache.set(key, val);
    while (imgCache.size > IMG_CACHE_CAP) {
      const oldest = imgCache.keys().next().value;
      if (oldest === undefined) break;
      imgCache.delete(oldest);
    }
  }
  function imgCacheGet(key) {
    if (!imgCache.has(key)) return undefined;
    const v = imgCache.get(key);
    imgCache.delete(key); imgCache.set(key, v); // 访问即提到末尾=MRU
    return v;
  }
  let syncScroll = true;
  let renderTimer = null;
  /** @returns {Tab|null} */
  const activeTab = () => tabs.find((x) => x.id === activeId) || null;
  let isFileWindow = false; // 本窗口是否为 OS 双击文件而开的独立窗口（是→不持久化会话、不恢复）
  let isViewerWindow = false; // 本窗口是否为 mermaid 查看器（是→绝不拦截关闭、不恢复会话）
  let appVersion = ""; // 应用版本号（init 时从后端 app_version 取，编译期来自 Cargo.toml；帮助文档动态显示）

  /* ---------- Markdown 配置 ---------- */
  if (window.marked) marked.setOptions({ gfm: true, breaks: false });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  // 另存为时单张图片引用的改写决策（纯逻辑，回归测试覆盖）：
  // 拷贝成功 → 改写为 <targetSub>/<finalName>；失败 → 保留原引用，
  // 避免把引用改写成指向不存在的 <stem>_images/ 断链路径（运行时反馈的回归点）。
  function imgRefAfterSave(copied, targetSub, finalName, origRef) {
    return copied ? (targetSub + "/" + finalName) : origRef;
  }

  /* ---------- 渲染 ---------- */
  // 关键：在交给 marked 之前先把公式抽出来。否则 marked 的反斜杠转义会吃掉
  // \( \) \[ \] \, \; \! 等符号，导致 LaTeX 被破坏、KaTeX 无法识别。
  // 占位符用零宽字符包裹的唯一 token，marked 与 DOMPurify 都不会改动它。
  /* ---------- 国际化（界面语言切换）---------- */
  const I18N = {
    zh: {
      new: "新建", open: "打开", closeFile: "关闭", save: "保存", saveAs: "另存为", exportPdf: "导出PDF",
      editor: "编辑器", preview: "预览",
      rendered: "已渲染", rendering: "渲染中…", ready: "就绪",
      wUnit: "词", lines: "行", words: "词", chars: "字符", meta: "UTF-8 · Markdown",
      lnCol: "行 {l}, 列 {c}",
      bold: "加粗", italic: "斜体", strike: "删除线", code: "行内代码",
      h1: "标题 1", h2: "标题 2", h3: "标题 3",
      quote: "引用", ul: "无序列表", ol: "有序列表", task: "任务列表",
      link: "链接", image: "插入图片", table: "表格", formula: "公式块", hr: "分割线",
      split: "分屏", editorOnly: "仅编辑", previewOnly: "仅预览",
      sync: "同步", on: "开", off: "关", themeDark: "🌙 深色", themeLight: "☀️ 浅色",
      opened: "已打开 ", saved: "已保存", downloaded: "已下载 ", closedFile: "已关闭标签页",
      cancel: "取消", dontSave: "不保存", exported: "已导出 ",
      pickFormat: "选择导出格式", help: "帮助", helpIntro: "MDeX简介", pdfVector: "PDF（矢量打印）", convertedMd: "已转为 Markdown", convertedHtml: "已转为 HTML", searchPh: "搜索…", replacePh: "替换…", replace: "替换", replaceAll: "全部替换", references: "参考文献", loadBib: "文献库", bibBtn: "文献", bibLoaded: "已加载 {n} 条文献", bibLoadFail: "加载文献库失败: ", bibEmpty: "当前标签未加载文献库", bibUnloaded: "已卸载文献库", bibReplace: "更换文献库…", bibUnloadBtn: "卸载文献库", citeJumpTip: "点击跳回引用处", citeJumpTitle: "该文献有 {n} 处引用，选择跳转：", citeJumpNone: "未找到该文献的引用处",
      insImgPre: "插入 ", insImgSuf: " 张图片", openFail: "打开失败: ", saveFail: "保存失败: ",
      confirmNew: "放弃当前内容并新建？", confirmClose: "关闭当前标签页？未保存的更改将丢失",
      fileChangedOnDisk: "文件已被外部程序修改，如何处理？", reload: "从磁盘重载", overwrite: "覆盖保存", reloaded: "已从磁盘重载",
      quotaWarn: "会话过大，自动保存已降级（仅保留未保存标签）", sessionLost: "上次会话损坏，已恢复备份",
      untitled: "未命名.md",
      ph: "在此输入 Markdown…\n支持标题/列表/表格/代码高亮/$$ LaTeX 公式 $$/图片。\n可拖拽 .md 文件或图片到窗口。",
      dropHint: "松开以打开文件 / 插入图片",
      emptyHint: "请打开或创建一个 Markdown 文件",
    },
    en: {
      new: "New", open: "Open", closeFile: "Close", save: "Save", saveAs: "Save As", exportPdf: "Export PDF",
      editor: "Editor", preview: "Preview",
      rendered: "Rendered", rendering: "Rendering…", ready: "Ready",
      wUnit: "words", lines: "Lines", words: "Words", chars: "Chars", meta: "UTF-8 · Markdown",
      lnCol: "Ln {l}, Col {c}",
      bold: "Bold", italic: "Italic", strike: "Strikethrough", code: "Inline code",
      h1: "Heading 1", h2: "Heading 2", h3: "Heading 3",
      quote: "Quote", ul: "Bullet list", ol: "Numbered list", task: "Task list",
      link: "Link", image: "Insert image", table: "Table", formula: "Math block", hr: "Divider",
      split: "Split", editorOnly: "Editor", previewOnly: "Preview",
      sync: "Sync", on: "On", off: "Off", themeDark: "🌙 Dark", themeLight: "☀️ Light",
      opened: "Opened ", saved: "Saved", downloaded: "Downloaded ", closedFile: "File closed",
      cancel: "Cancel", dontSave: "Don't Save", exported: "Exported ",
      pickFormat: "Choose export format", help: "Help", helpIntro: "MDeX Introduction", pdfVector: "PDF (Vector)", convertedMd: "Converted to Markdown", convertedHtml: "Converted to HTML", searchPh: "Search…", replacePh: "Replace…", replace: "Replace", replaceAll: "Replace All", references: "References", loadBib: "Library", bibBtn: "Refs", bibLoaded: "Loaded {n} references", bibLoadFail: "Failed to load library: ", bibEmpty: "No bibliography loaded for this tab", bibUnloaded: "Bibliography unloaded", bibReplace: "Replace Bibliography…", bibUnloadBtn: "Unload Bibliography", citeJumpTip: "Jump back to citation", citeJumpTitle: "Cited in {n} places — choose:", citeJumpNone: "No citation found for this reference",
      insImgPre: "Inserted ", insImgSuf: " image(s)", openFail: "Open failed: ", saveFail: "Save failed: ",
      confirmNew: "Discard current content and create new?", confirmClose: "Close the current tab? Unsaved changes will be lost.",
      fileChangedOnDisk: "File changed on disk. What do you want to do?", reload: "Reload from disk", overwrite: "Overwrite", reloaded: "Reloaded from disk",
      quotaWarn: "Session too large — autosave degraded (kept unsaved tabs only)", sessionLost: "Previous session was corrupt; restored from backup",
      untitled: "Untitled.md",
      ph: "Type Markdown here…\nSupports headings/lists/tables/code highlight/$$ LaTeX math $$/images.\nDrag .md files or images onto the window.",
      dropHint: "Drop to open file / insert image",
      emptyHint: "Open or create a Markdown file",
    },
    fr: {
      new: "Nouveau", open: "Ouvrir", closeFile: "Fermer", save: "Enregistrer", saveAs: "Enregistrer sous", exportPdf: "Exporter PDF",
      editor: "Éditeur", preview: "Aperçu", rendered: "Rendu", rendering: "Rendu…", ready: "Prêt",
      wUnit: "mots", lines: "Lignes", words: "Mots", chars: "Caractères", meta: "UTF-8 · Markdown", lnCol: "Ln {l}, Col {c}",
      bold: "Gras", italic: "Italique", strike: "Barré", code: "Code en ligne",
      h1: "Titre 1", h2: "Titre 2", h3: "Titre 3", quote: "Citation", ul: "Liste à puces", ol: "Liste numérotée", task: "Liste de tâches",
      link: "Lien", image: "Insérer image", table: "Tableau", formula: "Formule", hr: "Séparateur",
      split: "Scindé", editorOnly: "Éditeur", previewOnly: "Aperçu", sync: "Sync", on: "Oui", off: "Non", themeDark: "🌙 Sombre", themeLight: "☀️ Clair",
      opened: "Ouvert ", saved: "Enregistré", downloaded: "Téléchargé ", closedFile: "Fichier fermé",
      cancel: "Annuler", dontSave: "Ne pas enregistrer", exported: "Exporté ",
      pickFormat: "Choisir le format d'export", help: "Aide", helpIntro: "Introduction à MDeX", pdfVector: "PDF (Vectoriel)", convertedMd: "Converti en Markdown", convertedHtml: "Converti en HTML", searchPh: "Rechercher…", replacePh: "Remplacer…", replace: "Remplacer", replaceAll: "Tout remplacer", references: "Références", loadBib: "Bibliographie", bibBtn: "Réf.", bibLoaded: "{n} références chargées", bibLoadFail: "Échec du chargement: ", bibEmpty: "Aucune bibliographie chargée pour cet onglet", bibUnloaded: "Bibliographie déchargée", bibReplace: "Remplacer la bibliographie…", bibUnloadBtn: "Décharger la bibliographie", citeJumpTip: "Revenir à la citation", citeJumpTitle: "Cité dans {n} endroits — choisir :", citeJumpNone: "Aucune citation trouvée pour cette référence",
      insImgPre: "Inséré ", insImgSuf: " image(s)", openFail: "Échec ouverture : ", saveFail: "Échec enregistrement : ",
      confirmNew: "Abandonner le contenu et créer un nouveau ?", confirmClose: "Fermer l'onglet ? Les modifications non enregistrées seront perdues.",
      untitled: "Sans titre.md", ph: "Saisissez le Markdown ici…", dropHint: "Déposer pour ouvrir / insérer une image", emptyHint: "Ouvrez ou créez un fichier Markdown",
    },
    de: {
      new: "Neu", open: "Öffnen", closeFile: "Schließen", save: "Speichern", saveAs: "Speichern unter", exportPdf: "PDF exportieren",
      editor: "Editor", preview: "Vorschau", rendered: "Gerendert", rendering: "Rendern…", ready: "Bereit",
      wUnit: "Wörter", lines: "Zeilen", words: "Wörter", chars: "Zeichen", meta: "UTF-8 · Markdown", lnCol: "Z {l}, Sp {c}",
      bold: "Fett", italic: "Kursiv", strike: "Durchgestrichen", code: "Inline-Code",
      h1: "Überschrift 1", h2: "Überschrift 2", h3: "Überschrift 3", quote: "Zitat", ul: "Aufzählung", ol: "Nummerierung", task: "Aufgabenliste",
      link: "Link", image: "Bild einfügen", table: "Tabelle", formula: "Formel", hr: "Trennlinie",
      split: "Geteilt", editorOnly: "Editor", previewOnly: "Vorschau", sync: "Sync", on: "An", off: "Aus", themeDark: "🌙 Dunkel", themeLight: "☀️ Hell",
      opened: "Geöffnet ", saved: "Gespeichert", downloaded: "Heruntergeladen ", closedFile: "Datei geschlossen",
      cancel: "Abbrechen", dontSave: "Nicht speichern", exported: "Exportiert ",
      pickFormat: "Exportformat wählen", help: "Hilfe", helpIntro: "MDeX-Einführung", pdfVector: "PDF (Vektor)", convertedMd: "In Markdown umgewandelt", convertedHtml: "In HTML umgewandelt", searchPh: "Suchen…", replacePh: "Ersetzen…", replace: "Ersetzen", replaceAll: "Alle ersetzen", references: "Literaturverzeichnis", loadBib: "Bibliothek", bibBtn: "Lit.", bibLoaded: "{n} Referenzen geladen", bibLoadFail: "Bibliothek laden fehlgeschlagen: ", bibEmpty: "Keine Bibliothek für diesen Tab geladen", bibUnloaded: "Bibliothek entladen", bibReplace: "Bibliothek ersetzen…", bibUnloadBtn: "Bibliothek entladen", citeJumpTip: "Zur Zitierung springen", citeJumpTitle: "An {n} Stellen zitiert — wählen:", citeJumpNone: "Keine Zitierung gefunden",
      insImgPre: "Eingefügt ", insImgSuf: " Bild(er)", openFail: "Öffnen fehlgeschlagen: ", saveFail: "Speichern fehlgeschlagen: ",
      confirmNew: "Aktuellen Inhalt verwerfen und neu erstellen?", confirmClose: "Tab schließen? Ungespeicherte Änderungen gehen verloren.",
      untitled: "Unbenannt.md", ph: "Markdown hier eingeben…", dropHint: "Ablegen zum Öffnen / Bild einfügen", emptyHint: "Markdown-Datei öffnen oder neu erstellen",
    },
    ru: {
      new: "Создать", open: "Открыть", closeFile: "Закрыть", save: "Сохранить", saveAs: "Сохранить как", exportPdf: "Экспорт PDF",
      editor: "Редактор", preview: "Предпросмотр", rendered: "Готово", rendering: "Отрисовка…", ready: "Готов",
      wUnit: "слов", lines: "Строки", words: "Слова", chars: "Символы", meta: "UTF-8 · Markdown", lnCol: "Ст {l}, Кол {c}",
      bold: "Полужирный", italic: "Курсив", strike: "Зачёркнутый", code: "Код",
      h1: "Заголовок 1", h2: "Заголовок 2", h3: "Заголовок 3", quote: "Цитата", ul: "Маркированный список", ol: "Нумерованный список", task: "Список задач",
      link: "Ссылка", image: "Вставить изображение", table: "Таблица", formula: "Формула", hr: "Разделитель",
      split: "Разделено", editorOnly: "Редактор", previewOnly: "Предпросмотр", sync: "Синхр.", on: "Вкл", off: "Выкл", themeDark: "🌙 Тёмная", themeLight: "☀️ Светлая",
      opened: "Открыто ", saved: "Сохранено", downloaded: "Скачано ", closedFile: "Файл закрыт",
      cancel: "Отмена", dontSave: "Не сохранять", exported: "Экспортировано ",
      pickFormat: "Выберите формат экспорта", help: "Справка", helpIntro: "Введение в MDeX", pdfVector: "PDF (Вектор)", convertedMd: "Преобразовано в Markdown", convertedHtml: "Преобразовано в HTML", searchPh: "Поиск…", replacePh: "Замена…", replace: "Заменить", replaceAll: "Заменить все", references: "Список литературы", loadBib: "Библиотека", bibBtn: "Ссыл.", bibLoaded: "Загружено: {n}", bibLoadFail: "Ошибка загрузки: ", bibEmpty: "Для этой вкладки библиотека не загружена", bibUnloaded: "Библиотека выгружена", bibReplace: "Заменить библиографию…", bibUnloadBtn: "Выгрузить библиографию", citeJumpTip: "Перейти к цитированию", citeJumpTitle: "Цитируется в {n} местах — выберите:", citeJumpNone: "Цитирование не найдено",
      insImgPre: "Вставлено ", insImgSuf: " изображ.", openFail: "Ошибка открытия: ", saveFail: "Ошибка сохранения: ",
      confirmNew: "Отменить текущий текст и создать новый?", confirmClose: "Закрыть вкладку? Несохранённые изменения будут потеряны.",
      untitled: "Безымянный.md", ph: "Введите Markdown здесь…", dropHint: "Отпустите, чтобы открыть / вставить изображение", emptyHint: "Откройте или создайте файл Markdown",
    },
    it: {
      new: "Nuovo", open: "Apri", closeFile: "Chiudi", save: "Salva", saveAs: "Salva con nome", exportPdf: "Esporta PDF",
      editor: "Editor", preview: "Anteprima", rendered: "Renderizzato", rendering: "Rendering…", ready: "Pronto",
      wUnit: "parole", lines: "Righe", words: "Parole", chars: "Caratteri", meta: "UTF-8 · Markdown", lnCol: "R {l}, C {c}",
      bold: "Grassetto", italic: "Corsivo", strike: "Barrato", code: "Codice in linea",
      h1: "Titolo 1", h2: "Titolo 2", h3: "Titolo 3", quote: "Citazione", ul: "Elenco puntato", ol: "Elenco numerato", task: "Elenco attività",
      link: "Collegamento", image: "Inserisci immagine", table: "Tabella", formula: "Formula", hr: "Divisore",
      split: "Diviso", editorOnly: "Editor", previewOnly: "Anteprima", sync: "Sync", on: "Sì", off: "No", themeDark: "🌙 Scuro", themeLight: "☀️ Chiaro",
      opened: "Aperto ", saved: "Salvato", downloaded: "Scaricato ", closedFile: "File chiuso",
      cancel: "Annulla", dontSave: "Non salvare", exported: "Esportato ",
      pickFormat: "Scegli formato di esportazione", help: "Aiuto", helpIntro: "Introduzione a MDeX", pdfVector: "PDF (Vettoriale)", convertedMd: "Convertito in Markdown", convertedHtml: "Convertito in HTML", searchPh: "Cerca…", replacePh: "Sostituisci…", replace: "Sostituisci", replaceAll: "Sostituisci tutto", references: "Riferimenti", loadBib: "Bibliografia", bibBtn: "Rif.", bibLoaded: "Caricate {n} referenze", bibLoadFail: "Caricamento fallito: ", bibEmpty: "Nessuna bibliografia caricata per questa scheda", bibUnloaded: "Bibliografia scaricata", bibReplace: "Sostituisci bibliografia…", bibUnloadBtn: "Scarica bibliografia", citeJumpTip: "Torna alla citazione", citeJumpTitle: "Citato in {n} punti — scegli:", citeJumpNone: "Nessuna citazione trovata",
      insImgPre: "Inserite ", insImgSuf: " immagini", openFail: "Apertura fallita: ", saveFail: "Salvataggio fallito: ",
      confirmNew: "Scartare il contenuto e crearne uno nuovo?", confirmClose: "Chiudere la scheda? Le modifiche non salvate andranno perse.",
      untitled: "Senza titolo.md", ph: "Scrivi Markdown qui…", dropHint: "Rilascia per aprire / inserire immagine", emptyHint: "Apri o crea un file Markdown",
    },
    ja: {
      new: "新規", open: "開く", closeFile: "閉じる", save: "保存", saveAs: "名前を付けて保存", exportPdf: "PDF書き出し",
      editor: "エディタ", preview: "プレビュー", rendered: "描画済み", rendering: "描画中…", ready: "準備完了",
      wUnit: "語", lines: "行", words: "単語", chars: "文字", meta: "UTF-8 · Markdown", lnCol: "{l}行 {c}列",
      bold: "太字", italic: "斜体", strike: "取り消し線", code: "インラインコード",
      h1: "見出し 1", h2: "見出し 2", h3: "見出し 3", quote: "引用", ul: "箇条書き", ol: "番号付きリスト", task: "タスクリスト",
      link: "リンク", image: "画像を挿入", table: "表", formula: "数式", hr: "区切り線",
      split: "分割", editorOnly: "エディタ", previewOnly: "プレビュー", sync: "同期", on: "オン", off: "オフ", themeDark: "🌙 ダーク", themeLight: "☀️ ライト",
      opened: "開きました ", saved: "保存しました", downloaded: "ダウンロードしました ", closedFile: "ファイルを閉じました",
      cancel: "キャンセル", dontSave: "保存しない", exported: "書き出しました ",
      pickFormat: "エクスポート形式を選択", help: "ヘルプ", helpIntro: "MDeXの紹介", pdfVector: "PDF（ベクタ）", convertedMd: "Markdown に変換しました", convertedHtml: "HTML に変換しました", searchPh: "検索…", replacePh: "置換…", replace: "置換", replaceAll: "すべて置換", references: "参考文献", loadBib: "文献ライブラリ", bibBtn: "文献", bibLoaded: "{n} 件の文献を追加", bibLoadFail: "読み込み失敗: ", bibEmpty: "このタブに文献ライブラリはありません", bibUnloaded: "文献ライブラリを解除しました", bibReplace: "文献ライブラリを変更…", bibUnloadBtn: "文献ライブラリを解除", citeJumpTip: "引用元へ戻る", citeJumpTitle: "{n} 箇所で引用 — 選択:", citeJumpNone: "引用箇所が見つかりません",
      insImgPre: "", insImgSuf: " 枚の画像を挿入", openFail: "開けませんでした: ", saveFail: "保存できませんでした: ",
      confirmNew: "現在の内容を破棄して新規作成しますか？", confirmClose: "タブを閉じますか？未保存の変更は失われます。",
      untitled: "無題.md", ph: "ここにMarkdownを入力…", dropHint: "ドロップしてファイルを開く / 画像を挿入", emptyHint: "Markdown ファイルを開くか新規作成してください",
    },
    ko: {
      new: "새로 만들기", open: "열기", closeFile: "닫기", save: "저장", saveAs: "다른 이름으로 저장", exportPdf: "PDF 내보내기",
      editor: "편집기", preview: "미리보기", rendered: "렌더링됨", rendering: "렌더링 중…", ready: "준비됨",
      wUnit: "단어", lines: "줄", words: "단어", chars: "문자", meta: "UTF-8 · Markdown", lnCol: "{l}행 {c}열",
      bold: "굵게", italic: "기울임", strike: "취소선", code: "인라인 코드",
      h1: "제목 1", h2: "제목 2", h3: "제목 3", quote: "인용", ul: "글머리 기호", ol: "번호 목록", task: "작업 목록",
      link: "링크", image: "이미지 삽입", table: "표", formula: "수식", hr: "구분선",
      split: "분할", editorOnly: "편집기", previewOnly: "미리보기", sync: "동기화", on: "켬", off: "끔", themeDark: "🌙 다크", themeLight: "☀️ 라이트",
      opened: "열림 ", saved: "저장됨", downloaded: "다운로드됨 ", closedFile: "파일 닫힘",
      cancel: "취소", dontSave: "저장 안 함", exported: "내보냄 ",
      pickFormat: "내보낼 형식 선택", help: "도움말", helpIntro: "MDeX 소개", pdfVector: "PDF (벡터)", convertedMd: "Markdown으로 변환됨", convertedHtml: "HTML로 변환됨", searchPh: "검색…", replacePh: "바꾸기…", replace: "바꾸기", replaceAll: "모두 바꾸기", references: "참고문헌", loadBib: "문헌고", bibBtn: "문헌", bibLoaded: "{n}개 불러옴", bibLoadFail: "불러오기 실패: ", bibEmpty: "이 탭에 불러온 문헌고가 없습니다", bibUnloaded: "문헌고를 해제했습니다", bibReplace: "문헌고 바꾸기…", bibUnloadBtn: "문헌고 해제", citeJumpTip: "인용 위치로 이동", citeJumpTitle: "{n}곳에 인용됨 — 선택:", citeJumpNone: "인용 위치를 찾을 수 없음",
      insImgPre: "", insImgSuf: "개 이미지 삽입", openFail: "열기 실패: ", saveFail: "저장 실패: ",
      confirmNew: "현재 내용을 버리고 새로 만드시겠습니까?", confirmClose: "탭을 닫으시겠습니까? 저장하지 않은 변경사항이 손실됩니다.",
      untitled: "제목 없음.md", ph: "여기에 Markdown 입력…", dropHint: "드롭하여 파일 열기 / 이미지 삽입", emptyHint: "Markdown 파일을 열거나 새로 만드세요",
    },
    es: {
      new: "Nuevo", open: "Abrir", closeFile: "Cerrar", save: "Guardar", saveAs: "Guardar como", exportPdf: "Exportar PDF",
      editor: "Editor", preview: "Vista previa", rendered: "Renderizado", rendering: "Renderizando…", ready: "Listo",
      wUnit: "palabras", lines: "Líneas", words: "Palabras", chars: "Caracteres", meta: "UTF-8 · Markdown", lnCol: "L {l}, C {c}",
      bold: "Negrita", italic: "Cursiva", strike: "Tachado", code: "Código en línea",
      h1: "Encabezado 1", h2: "Encabezado 2", h3: "Encabezado 3", quote: "Cita", ul: "Lista con viñetas", ol: "Lista numerada", task: "Lista de tareas",
      link: "Enlace", image: "Insertar imagen", table: "Tabla", formula: "Fórmula", hr: "Divisor",
      split: "Dividido", editorOnly: "Editor", previewOnly: "Vista previa", sync: "Sync", on: "Sí", off: "No", themeDark: "🌙 Oscuro", themeLight: "☀️ Claro",
      opened: "Abierto ", saved: "Guardado", downloaded: "Descargado ", closedFile: "Archivo cerrado",
      cancel: "Cancelar", dontSave: "No guardar", exported: "Exportado ",
      pickFormat: "Elegir formato de exportación", help: "Ayuda", helpIntro: "Introducción a MDeX", pdfVector: "PDF (Vectorial)", convertedMd: "Convertido a Markdown", convertedHtml: "Convertido a HTML", searchPh: "Buscar…", replacePh: "Reemplazar…", replace: "Reemplazar", replaceAll: "Reemplazar todo", references: "Referencias", loadBib: "Bibliografía", bibBtn: "Refs", bibLoaded: "Cargadas {n} referencias", bibLoadFail: "Error al cargar: ", bibEmpty: "No hay bibliografía cargada para esta pestaña", bibUnloaded: "Bibliografía descargada", bibReplace: "Reemplazar bibliografía…", bibUnloadBtn: "Descargar bibliografía", citeJumpTip: "Volver a la cita", citeJumpTitle: "Citado en {n} lugares — elige:", citeJumpNone: "No se encontró ninguna cita",
      insImgPre: "Insertada(s) ", insImgSuf: " imagen(es)", openFail: "Error al abrir: ", saveFail: "Error al guardar: ",
      confirmNew: "¿Descartar el contenido y crear uno nuevo?", confirmClose: "¿Cerrar la pestaña? Se perderán los cambios no guardados.",
      untitled: "Sin título.md", ph: "Escribe Markdown aquí…", dropHint: "Suelta para abrir / insertar imagen", emptyHint: "Abre o crea un archivo Markdown",
    },
    pt: {
      new: "Novo", open: "Abrir", closeFile: "Fechar", save: "Salvar", saveAs: "Salvar como", exportPdf: "Exportar PDF",
      editor: "Editor", preview: "Pré-visualização", rendered: "Renderizado", rendering: "Renderizando…", ready: "Pronto",
      wUnit: "palavras", lines: "Linhas", words: "Palavras", chars: "Caracteres", meta: "UTF-8 · Markdown", lnCol: "L {l}, C {c}",
      bold: "Negrito", italic: "Itálico", strike: "Tachado", code: "Código em linha",
      h1: "Cabeçalho 1", h2: "Cabeçalho 2", h3: "Cabeçalho 3", quote: "Citação", ul: "Lista com marcadores", ol: "Lista numerada", task: "Lista de tarefas",
      link: "Link", image: "Inserir imagem", table: "Tabela", formula: "Fórmula", hr: "Divisor",
      split: "Dividido", editorOnly: "Editor", previewOnly: "Pré-visualização", sync: "Sync", on: "Sim", off: "Não", themeDark: "🌙 Escuro", themeLight: "☀️ Claro",
      opened: "Aberto ", saved: "Salvo", downloaded: "Baixado ", closedFile: "Arquivo fechado",
      cancel: "Cancelar", dontSave: "Não salvar", exported: "Exportado ",
      pickFormat: "Escolher formato de exportação", help: "Ajuda", helpIntro: "Introdução ao MDeX", pdfVector: "PDF (Vetorial)", convertedMd: "Convertido para Markdown", convertedHtml: "Convertido para HTML", searchPh: "Buscar…", replacePh: "Substituir…", replace: "Substituir", replaceAll: "Substituir tudo", references: "Referências", loadBib: "Bibliografia", bibBtn: "Refs", bibLoaded: "Carregadas {n} referências", bibLoadFail: "Falha ao carregar: ", bibEmpty: "Nenhuma bibliografia carregada para esta aba", bibUnloaded: "Bibliografia descarregada", bibReplace: "Substituir bibliografia…", bibUnloadBtn: "Descarregar bibliografia", citeJumpTip: "Voltar à citação", citeJumpTitle: "Citado em {n} lugares — escolha:", citeJumpNone: "Nenhuma citação encontrada",
      insImgPre: "Inserida(s) ", insImgSuf: " imagem(ns)", openFail: "Erro ao abrir: ", saveFail: "Erro ao salvar: ",
      confirmNew: "Descartar o conteúdo e criar um novo?", confirmClose: "Fechar a guia? As alterações não salvas serão perdidas.",
      untitled: "Sem título.md", ph: "Escreva Markdown aqui…", dropHint: "Solte para abrir / inserir imagem", emptyHint: "Abra ou crie um arquivo Markdown",
    },
    ar: {
      new: "جديد", open: "فتح", closeFile: "إغلاق", save: "حفظ", saveAs: "حفظ باسم", exportPdf: "تصدير PDF",
      editor: "المحرر", preview: "المعاينة", rendered: "تم العرض", rendering: "جارٍ العرض…", ready: "جاهز",
      wUnit: "كلمات", lines: "أسطر", words: "كلمات", chars: "أحرف", meta: "UTF-8 · Markdown", lnCol: "س {l}، ع {c}",
      bold: "عريض", italic: "مائل", strike: "مشطوب", code: "كود سطري",
      h1: "عنوان 1", h2: "عنوان 2", h3: "عنوان 3", quote: "اقتباس", ul: "قائمة نقطية", ol: "قائمة مرقمة", task: "قائمة مهام",
      link: "رابط", image: "إدراج صورة", table: "جدول", formula: "صيغة", hr: "فاصل",
      split: "مقسم", editorOnly: "المحرر", previewOnly: "المعاينة", sync: "مزامنة", on: "نعم", off: "لا", themeDark: "🌙 داكن", themeLight: "☀️ فاتح",
      opened: "تم الفتح ", saved: "تم الحفظ", downloaded: "تم التنزيل ", closedFile: "تم إغلاق التبويب",
      cancel: "إلغاء", dontSave: "عدم الحفظ", exported: "تم التصدير ",
      pickFormat: "اختر تنسيق التصدير", help: "مساعدة", helpIntro: "مقدمة عن MDeX", pdfVector: "PDF (متجه)", convertedMd: "تم التحويل إلى Markdown", convertedHtml: "تم التحويل إلى HTML", searchPh: "بحث…", replacePh: "استبدال…", replace: "استبدال", replaceAll: "استبدال الكل", references: "المراجع", loadBib: "المراجع", bibBtn: "مراجع", bibLoaded: "تم تحميل {n} مرجعًا", bibLoadFail: "فشل التحميل: ", bibEmpty: "لا توجد مراجع محملة لهذه التبويبة", bibUnloaded: "تم إلغاء تحميل المراجع", bibReplace: "استبدال المراجع…", bibUnloadBtn: "إلغاء تحميل المراجع", citeJumpTip: "العودة إلى الاستشهاد", citeJumpTitle: "مُستشهد به في {n} مواضع — اختر:", citeJumpNone: "لم يُعثر على الاستشهاد",
      insImgPre: "تم إدراج ", insImgSuf: " صورة", openFail: "فشل الفتح: ", saveFail: "فشل الحفظ: ",
      confirmNew: "هل تريد تجاهل المحتوى الحالي وإنشاء ملف جديد؟", confirmClose: "إغلاق التبويب؟ ستُفقد التغييرات غير المحفوظة.",
      untitled: "بدون عنوان.md", ph: "اكتب Markdown هنا…", dropHint: "أفلت لفتح ملف / إدراج صورة", emptyHint: "افتح أو أنشئ ملف Markdown",
    },
    hi: {
      new: "नया", open: "खोलें", closeFile: "बंद करें", save: "सहेजें", saveAs: "नाम से सहेजें", exportPdf: "PDF निर्यात",
      editor: "संपादक", preview: "पूर्वावलोकन",
      rendered: "रेंडर हुआ", rendering: "रेंडर हो रहा है…", ready: "तैयार",
      wUnit: "शब्द", lines: "पंक्तियाँ", words: "शब्द", chars: "वर्ण", meta: "UTF-8 · Markdown", lnCol: "पं {l}, स्तंभ {c}",
      bold: "बोल्ड", italic: "तिरछा", strike: "काटा हुआ", code: "इनलाइन कोड",
      h1: "शीर्षक 1", h2: "शीर्षक 2", h3: "शीर्षक 3", quote: "उद्धरण", ul: "बुलेट सूची", ol: "क्रमांकित सूची", task: "कार्य सूची",
      link: "लिंक", image: "चित्र डालें", table: "तालिका", formula: "सूत्र खंड", hr: "विभाजक",
      split: "विभाजित", editorOnly: "केवल संपादक", previewOnly: "केवल पूर्वावलोकन",
      sync: "सिंक", on: "चालू", off: "बंद", themeDark: "🌙 गहरा", themeLight: "☀️ हल्का",
      opened: "खोला ", saved: "सहेजा", downloaded: "डाउनलोड किया ", closedFile: "टैब बंद किया",
      cancel: "रद्द करें", dontSave: "न सहेजें", exported: "निर्यात किया ",
      pickFormat: "निर्यात प्रारूप चुनें", help: "सहायता", helpIntro: "MDeX परिचय", pdfVector: "PDF (वेक्टर)", convertedMd: "Markdown में बदला", convertedHtml: "HTML में बदला", searchPh: "खोजें…", replacePh: "बदलें…", replace: "बदलें", replaceAll: "सभी बदलें", references: "संदर्भ", loadBib: "पुस्तकालय", bibBtn: "संदर्भ", bibLoaded: "{n} संदर्भ लोड हुए", bibLoadFail: "लोड विफल: ", bibEmpty: "इस टैब के लिए कोई ग्रंथसूची लोड नहीं है", bibUnloaded: "ग्रंथसूची अनलोड की गई", bibReplace: "ग्रंथसूची बदलें…", bibUnloadBtn: "ग्रंथसूची अनलोड करें", citeJumpTip: "उद्धरण पर वापस जाएँ", citeJumpTitle: "{n} स्थानों में उद्धृत — चुनें:", citeJumpNone: "इस संदर्भ के लिए कोई उद्धरण नहीं मिला",
      insImgPre: "डाली गई ", insImgSuf: " चित्र", openFail: "खोलना विफल: ", saveFail: "सहेजना विफल: ",
      confirmNew: "वर्तमान सामग्री त्यागकर नया बनाएँ?", confirmClose: "मौजूदा टैब बंद करें? असहेजे परिवर्तन खो जाएँगे।",
      untitled: "बिना_शीर्षक.md", ph: "यहाँ Markdown लिखें…\nशीर्षक/सूची/तालिका/कोड हाइलाइट/$$ LaTeX सूत्र $$/चित्र समर्थित।\n.md फ़ाइल या चित्र को विंडो पर खींचें।", dropHint: "फ़ाइल खोलने / चित्र डालने के लिए छोड़ें", emptyHint: "कोई Markdown फ़ाइल खोलें या बनाएँ",
    },
    pa: {
      new: "ਨਵਾਂ", open: "ਖੋਲ੍ਹੋ", closeFile: "ਬੰਦ ਕਰੋ", save: "ਸੰਭਾਲੋ", saveAs: "ਨਾਮ ਨਾਲ ਸੰਭਾਲੋ", exportPdf: "PDF ਨਿਰਯਾਤ",
      editor: "ਸੰਪਾਦਕ", preview: "ਝਲਕ",
      rendered: "ਰੈਂਡਰ ਹੋਇਆ", rendering: "ਰੈਂਡਰ ਹੋ ਰਿਹਾ ਹੈ…", ready: "ਤਿਆਰ",
      wUnit: "ਸ਼ਬਦ", lines: "ਸਤਰਾਂ", words: "ਸ਼ਬਦ", chars: "ਅੱਖਰ", meta: "UTF-8 · Markdown", lnCol: "ਸਤਰ {l}, ਕਾਲਮ {c}",
      bold: "ਬੋਲਡ", italic: "ਤਿਰਛਾ", strike: "ਵਿੰਨ੍ਹੋ", code: "ਇਨਲਾਈਨ ਕੋਡ",
      h1: "ਸਿਰਲੇਖ 1", h2: "ਸਿਰਲੇਖ 2", h3: "ਸਿਰਲੇਖ 3", quote: "ਹਵਾਲਾ", ul: "ਬੁਲੈਟ ਸੂਚੀ", ol: "ਅੰਕਿਤ ਸੂਚੀ", task: "ਕੰਮ ਸੂਚੀ",
      link: "ਲਿੰਕ", image: "ਚਿੱਤਰ ਪਾਓ", table: "ਸਾਰਣੀ", formula: "ਫਾਰਮੂਲਾ ਬਲਾਕ", hr: "ਵੱਖਰੇਵਾਂ",
      split: "ਵੰਡੋ", editorOnly: "ਸਿਰਫ਼ ਸੰਪਾਦਕ", previewOnly: "ਸਿਰਫ਼ ਝਲਕ",
      sync: "ਸਿੰਕ", on: "ਚਾਲੂ", off: "ਬੰਦ", themeDark: "🌙 ਗੂੜ੍ਹਾ", themeLight: "☀️ ਹਲਕਾ",
      opened: "ਖੋਲ੍ਹਿਆ ", saved: "ਸੰਭਾਲਿਆ", downloaded: "ਡਾਊਨਲੋਡ ਕੀਤਾ ", closedFile: "ਟੈਬ ਬੰਦ ਕੀਤੀ",
      cancel: "ਰੱਦ ਕਰੋ", dontSave: "ਨਾ ਸੰਭਾਲੋ", exported: "ਨਿਰਯਾਤ ਕੀਤਾ ",
      pickFormat: "ਨਿਰਯਾਤ ਫਾਰਮੈਟ ਚੁਣੋ", help: "ਮਦਦ", helpIntro: "MDeX ਜਾਣ-ਪਛਾਣ", pdfVector: "PDF (ਵੈਕਟਰ)", convertedMd: "Markdown ਵਿੱਚ ਬਦਲਿਆ", convertedHtml: "HTML ਵਿੱਚ ਬਦਲਿਆ", searchPh: "ਖੋਜੋ…", replacePh: "ਬਦਲੋ…", replace: "ਬਦਲੋ", replaceAll: "ਸਭ ਬਦਲੋ", references: "ਹਵਾਲੇ", loadBib: "ਲਾਇਬ੍ਰੇਰੀ", bibBtn: "ਹਵਾਲੇ", bibLoaded: "{n} ਹਵਾਲੇ ਲੋਡ ਹੋਏ", bibLoadFail: "ਲੋਡ ਅਸਫ਼ਲ: ", bibEmpty: "ਇਸ ਟੈਬ ਲਈ ਕੋਈ ਗ੍ਰੰਥ-ਸੂਚੀ ਲੋਡ ਨਹੀਂ ਹੈ", bibUnloaded: "ਗ੍ਰੰਥ-ਸੂਚੀ ਅਨਲੋਡ ਕੀਤੀ", bibReplace: "ਗ੍ਰੰਥ-ਸੂਚੀ ਬਦਲੋ…", bibUnloadBtn: "ਗ੍ਰੰਥ-ਸੂਚੀ ਅਨਲੋਡ ਕਰੋ", citeJumpTip: "ਹਵਾਲੇ ਉੱਤੇ ਵਾਪਸ ਜਾਓ", citeJumpTitle: "{n} ਥਾਵਾਂ ਉੱਤੇ ਹਵਾਲਾ ਦਿੱਤਾ — ਚੁਣੋ:", citeJumpNone: "ਇਸ ਹਵਾਲੇ ਲਈ ਕੋਈ ਹਵਾਲਾ ਨਹੀਂ ਲੱਭਿਆ",
      insImgPre: "ਪਾਈਆਂ ", insImgSuf: " ਚਿੱਤਰ", openFail: "ਖੋਲ੍ਹਣਾ ਅਸਫ਼ਲ: ", saveFail: "ਸੰਭਾਲਣਾ ਅਸਫ਼ਲ: ",
      confirmNew: "ਮੌਜੂਦਾ ਸਮੱਗਰੀ ਛੱਡ ਕੇ ਨਵਾਂ ਬਣਾਉਣਾ?", confirmClose: "ਮੌਜੂਦਾ ਟੈਬ ਬੰਦ ਕਰਨੀ? ਨਾ-ਸੰਭਾਲੀਆਂ ਤਬਦੀਲੀਆਂ ਖਤਮ ਹੋ ਜਾਣਗੀਆਂ।",
      untitled: "ਬਿਨਾਂ_ਸਿਰਲੇਖ.md", ph: "ਇੱਥੇ Markdown ਲਿਖੋ…\nਸਿਰਲੇਖ/ਸੂਚੀ/ਸਾਰਣੀ/ਕੋਡ ਹਾਈਲਾਈਟ/$$ LaTeX ਫਾਰਮੂਲੇ $$/ਚਿੱਤਰ ਸਮਰਥਿਤ।\n.md ਫਾਈਲ ਜਾਂ ਚਿੱਤਰ ਵਿੰਡੋ ਉੱਤੇ ਸੁੱਟੋ।", dropHint: "ਫਾਈਲ ਖੋਲ੍ਹਣ / ਚਿੱਤਰ ਪਾਉਣ ਲਈ ਛੱਡੋ", emptyHint: "ਕੋਈ Markdown ਫਾਈਲ ਖੋਲ੍ਹੋ ਜਾਂ ਬਣਾਓ",
    },
    vi: {
      new: "Mới", open: "Mở", closeFile: "Đóng", save: "Lưu", saveAs: "Lưu thành", exportPdf: "Xuất PDF",
      editor: "Trình soạn thảo", preview: "Xem trước",
      rendered: "Đã kết xuất", rendering: "Đang kết xuất…", ready: "Sẵn sàng",
      wUnit: "từ", lines: "Dòng", words: "Từ", chars: "Ký tự", meta: "UTF-8 · Markdown", lnCol: "Dòng {l}, Cột {c}",
      bold: "Đậm", italic: "Nghiêng", strike: "Gạch ngang", code: "Mã nội dòng",
      h1: "Tiêu đề 1", h2: "Tiêu đề 2", h3: "Tiêu đề 3", quote: "Trích dẫn", ul: "Danh sách đầu mục", ol: "Danh sách số", task: "Danh sách việc",
      link: "Liên kết", image: "Chèn ảnh", table: "Bảng", formula: "Khối công thức", hr: "Dòng phân cách",
      split: "Chia đôi", editorOnly: "Chỉ soạn thảo", previewOnly: "Chỉ xem trước",
      sync: "Đồng bộ", on: "Bật", off: "Tắt", themeDark: "🌙 Tối", themeLight: "☀️ Sáng",
      opened: "Đã mở ", saved: "Đã lưu", downloaded: "Đã tải xuống ", closedFile: "Đã đóng thẻ",
      cancel: "Hủy", dontSave: "Không lưu", exported: "Đã xuất ",
      pickFormat: "Chọn định dạng xuất", help: "Trợ giúp", helpIntro: "Giới thiệu MDeX", pdfVector: "PDF (Vector)", convertedMd: "Đã chuyển sang Markdown", convertedHtml: "Đã chuyển sang HTML", searchPh: "Tìm…", replacePh: "Thay thế…", replace: "Thay thế", replaceAll: "Thay tất cả", references: "Tài liệu tham khảo", loadBib: "Thư viện", bibBtn: "Tham chiếu", bibLoaded: "Đã nạp {n} tham chiếu", bibLoadFail: "Nạp thất bại: ", bibEmpty: "Chưa nạp tài liệu tham khảo cho thẻ này", bibUnloaded: "Đã bỏ nạp tài liệu tham khảo", bibReplace: "Thay tài liệu tham khảo…", bibUnloadBtn: "Bỏ nạp tài liệu tham khảo", citeJumpTip: "Quay lại chỗ trích dẫn", citeJumpTitle: "Được trích dẫn ở {n} chỗ — chọn:", citeJumpNone: "Không tìm thấy chỗ trích dẫn cho tham chiếu này",
      insImgPre: "Đã chèn ", insImgSuf: " ảnh", openFail: "Mở thất bại: ", saveFail: "Lưu thất bại: ",
      confirmNew: "Bỏ nội dung hiện tại và tạo mới?", confirmClose: "Đóng thẻ này? Các thay đổi chưa lưu sẽ mất.",
      untitled: "Không_tên.md", ph: "Nhập Markdown tại đây…\nHỗ trợ tiêu đề/danh sách/bảng/tô sáng mã/$$ công thức LaTeX $$/ảnh.\nKéo thả tệp .md hoặc ảnh vào cửa sổ.", dropHint: "Thả để mở tệp / chèn ảnh", emptyHint: "Mở hoặc tạo một tệp Markdown",
    },
    id: {
      new: "Baru", open: "Buka", closeFile: "Tutup", save: "Simpan", saveAs: "Simpan Sebagai", exportPdf: "Ekspor PDF",
      editor: "Editor", preview: "Pratinjau",
      rendered: "Dirender", rendering: "Merender…", ready: "Siap",
      wUnit: "kata", lines: "Baris", words: "Kata", chars: "Karakter", meta: "UTF-8 · Markdown", lnCol: "Brs {l}, Klm {c}",
      bold: "Tebal", italic: "Miring", strike: "Coret", code: "Kode sebaris",
      h1: "Judul 1", h2: "Judul 2", h3: "Judul 3", quote: "Kutipan", ul: "Daftar poin", ol: "Daftar bernomor", task: "Daftar tugas",
      link: "Tautan", image: "Sisip gambar", table: "Tabel", formula: "Blok rumus", hr: "Pemisah",
      split: "Bagi", editorOnly: "Editor", previewOnly: "Pratinjau",
      sync: "Sinkron", on: "Nyala", off: "Mati", themeDark: "🌙 Gelap", themeLight: "☀️ Terang",
      opened: "Dibuka ", saved: "Tersimpan", downloaded: "Terunduh ", closedFile: "Tab ditutup",
      cancel: "Batal", dontSave: "Jangan Simpan", exported: "Diekspor ",
      pickFormat: "Pilih format ekspor", help: "Bantuan", helpIntro: "Pengenalan MDeX", pdfVector: "PDF (Vektor)", convertedMd: "Dikonversi ke Markdown", convertedHtml: "Dikonversi ke HTML", searchPh: "Cari…", replacePh: "Ganti…", replace: "Ganti", replaceAll: "Ganti Semua", references: "Referensi", loadBib: "Pustaka", bibBtn: "Ref", bibLoaded: "Memuat {n} referensi", bibLoadFail: "Gagal memuat: ", bibEmpty: "Tidak ada pustaka untuk tab ini", bibUnloaded: "Pustaka dilepas", bibReplace: "Ganti Pustaka…", bibUnloadBtn: "Lepas Pustaka", citeJumpTip: "Lompat ke kutipan", citeJumpTitle: "Dikutip di {n} tempat — pilih:", citeJumpNone: "Tidak ada kutipan untuk referensi ini",
      insImgPre: "Disisipkan ", insImgSuf: " gambar", openFail: "Gagal membuka: ", saveFail: "Gagal menyimpan: ",
      confirmNew: "Buang isi saat ini dan buat baru?", confirmClose: "Tutup tab ini? Perubahan yang belum disimpan akan hilang.",
      untitled: "Tanpa_Judul.md", ph: "Ketik Markdown di sini…\nMendukung judul/daftar/tabel/penyorotan kode/$$ rumus LaTeX $$/gambar.\nSeret berkas .md atau gambar ke jendela.", dropHint: "Jatuhkan untuk membuka berkas / menyisipkan gambar", emptyHint: "Buka atau buat sebuah berkas Markdown",
    },
    ur: {
      new: "نیا", open: "کھولیں", closeFile: "بند کریں", save: "محفوظ کریں", saveAs: "اس نام سے محفوظ کریں", exportPdf: "PDF برآمد",
      editor: "ایڈیٹر", preview: "پیش نظارہ",
      rendered: "رینڈر ہوا", rendering: "رینڈر ہو رہا ہے…", ready: "تیار",
      wUnit: "الفاظ", lines: "سطریں", words: "الفاظ", chars: "حروف", meta: "UTF-8 · Markdown", lnCol: "سطر {l}، کالم {c}",
      bold: "موٹا", italic: "ترچھا", strike: "مٹا ہوا", code: "ان لائن کوڈ",
      h1: "سرخی 1", h2: "سرخی 2", h3: "سرخی 3", quote: "اقتباس", ul: "نقطہ فہرست", ol: "ترقیم فہرست", task: "فہرستِ کام",
      link: "ربط", image: "تصویر داخل کریں", table: "جدول", formula: "صیغہ بلاک", hr: "تقسیم کار",
      split: "تقسیم", editorOnly: "صرف ایڈیٹر", previewOnly: "صرف پیش نظارہ",
      sync: "مطابقت", on: "آن", off: "آف", themeDark: "🌙 گہرا", themeLight: "☀️ ہلکا",
      opened: "کھولا ", saved: "محفوظ ہوا", downloaded: "ڈاؤن لوڈ ہوا ", closedFile: "ٹیب بند ہوا",
      cancel: "منسوخ", dontSave: "محفوظ نہ کریں", exported: "برآمد ہوا ",
      pickFormat: "برآمد صورتحال منتخب کریں", help: "مدد", helpIntro: "MDeX تعارف", pdfVector: "PDF (ویکٹر)", convertedMd: "Markdown میں تبدیل ہوا", convertedHtml: "HTML میں تبدیل ہوا", searchPh: "تلاش…", replacePh: "تبدیل…", replace: "تبدیل", replaceAll: "سب تبدیل کریں", references: "حوالہ جات", loadBib: "لائبریری", bibBtn: "حوالے", bibLoaded: "{n} حوالے لوڈ ہوئے", bibLoadFail: "لوڈ ناکام: ", bibEmpty: "اس ٹیب کے لیے کوئی کتابیات لوڈ نہیں", bibUnloaded: "کتابیات ان لوڈ کی گئی", bibReplace: "کتابیات تبدیل کریں…", bibUnloadBtn: "کتابيات ان لوڈ کریں", citeJumpTip: "حوالے پر واپس جائیں", citeJumpTitle: "{n} مقامات پر حوالہ دیا گیا — منتخب کریں:", citeJumpNone: "اس حوالے کے لیے کوئی اقتباس نہیں ملا",
      insImgPre: "داخل کی گئیں ", insImgSuf: " تصاویر", openFail: "کھولنا ناکام: ", saveFail: "محفوظ کرنا ناکام: ",
      confirmNew: "موجودہ مواد چھوڑ کر نیا بنائیں؟", confirmClose: "موجودہ ٹیب بند کریں؟ غیر محفوظ تبدیلیاں ضائع ہوں گی۔",
      untitled: "بے_نام.md", ph: "یہاں Markdown لکھیں…\nسرخیاں/فہرستیں/جداول/کوڈ ہائی لائٹ/$$ LaTeX صیغے $$/تصاویر معاون ہیں۔\n.md فائل یا تصویر کو ونڈو پر گھسیٹیں۔", dropHint: "فائل کھولنے / تصویر داخل کرنے کے لیے چھوڑیں", emptyHint: "کوئی Markdown فائل کھولیں یا بنائیں",
    },
    mn: {
      new: "Шинэ", open: "Нээх", closeFile: "Хаах", save: "Хадгалах", saveAs: "Өөр нэрээр хадгалах", exportPdf: "PDF экспортлох",
      editor: "Засварлагч", preview: "Урьдчилан харах",
      rendered: "Хөрвүүлсэн", rendering: "Хөрвүүлж байна…", ready: "Бэлэн",
      wUnit: "үг", lines: "Мөр", words: "Үг", chars: "Тэмдэгт", meta: "UTF-8 · Markdown", lnCol: "Мөр {l}, Баган {c}",
      bold: "Тод", italic: "Налуу", strike: "Дундуур зураас", code: "Шугаман код",
      h1: "Гарчиг 1", h2: "Гарчиг 2", h3: "Гарчиг 3", quote: "Ишлэл", ul: "Цэгт жагсаалт", ol: "Дугаарласан жагсаалт", task: "Даалгаврын жагсаалт",
      link: "Холбоос", image: "Зураг оруулах", table: "Хүснэгт", formula: "Томьёоны блок", hr: "Хуваагч",
      split: "Хуваасан", editorOnly: "Зөвхөн засварлагч", previewOnly: "Зөвхөн урьдчилан харах",
      sync: "Синх", on: "Асаалт", off: "Унтраалт", themeDark: "🌙 Бараан", themeLight: "☀️ Цайвар",
      opened: "Нээгдсэн ", saved: "Хадгалсан", downloaded: "Татаж авсан ", closedFile: "Таб хаагдсан",
      cancel: "Цуцлах", dontSave: "Битгий хадгал", exported: "Экспортлосон ",
      pickFormat: "Экспортын форматыг сонго", help: "Тусламж", helpIntro: "MDeX-ийн танилцуулга", pdfVector: "PDF (Вектор)", convertedMd: "Markdown болгон хөрвүүлсэн", convertedHtml: "HTML болгон хөрвүүлсэн", searchPh: "Хайх…", replacePh: "Солих…", replace: "Солих", replaceAll: "Бүгдийг солих", references: "Эх сурвалж", loadBib: "Сан", bibBtn: "Эх сурвалж", bibLoaded: "{n} эх сурвалж ачааллаа", bibLoadFail: "Ачаалах амжилтгүй: ", bibEmpty: "Энэ табанд номын сан ачаалаагүй байна", bibUnloaded: "Номын сан ачаалаагүй болгосон", bibReplace: "Номын сан солих…", bibUnloadBtn: "Номын сан ачаалахгүй болгох", citeJumpTip: "Ишлэл рүү буцах", citeJumpTitle: "{n} газарт иш татсан — сонго:", citeJumpNone: "Энэ эх сурвалжид ишлэл олдсонгүй",
      insImgPre: "Оруулсан ", insImgSuf: " зураг", openFail: "Нээж чадсангүй: ", saveFail: "Хадгалж чадсангүй: ",
      confirmNew: "Одоогийн агуулгыг устгаад шинээр үүсгэх үү?", confirmClose: "Одоогийн табыг хаах уу? Хадгалаагүй өөрчлөлтүүд алдагдана.",
      untitled: "Гарчиггүй.md", ph: "Энд Markdown оруулна уу…\nГарчиг/Жагсаалт/Хүснэгт/Кодоор өнгөлөх/$$ LaTeX томьёо $$/Зураг дэмжигдсэн.\n.md файл эсвэл зургийг цонх руу чирнэ үү.", dropHint: "Файл нээх / зураг оруулахын тулд буулга", emptyHint: "Markdown файл нээ эсвэл үүсгэ",
    },
  };
  let curLang = "zh";
  // 从右向左（RTL）语言集合：切换到这些语言时设 <html dir="rtl">，正文/标题/列表自动右起排版。
  // 当前阿拉伯语(ar)、乌尔都语(ur)；将来新增希伯来语(he)/波斯语(fa) 等加进此集合即可。
  const RTL_LANGS = new Set(["ar", "ur"]);
  function t(k) { return (I18N[curLang] && I18N[curLang][k]) || I18N.zh[k] || k; }
  function setLang(lang) {
    if (!I18N[lang]) lang = "zh";
    curLang = lang;
    try { localStorage.setItem("md-lang", lang); } catch (_) {}
    applyLang();
    if (isTauri) invoke("change_language", { lang }).catch(() => {});
    scheduleRender();
  }
  function applyLang() {
    document.documentElement.lang = curLang;
    // RTL：阿拉伯语、乌尔都语等从右向左语言设 <html dir="rtl">，正文/标题/列表自动右起排版、项目符号落最右；
    // 代码块/行内代码/LaTeX 公式等内嵌 LTR 内容由样式表局部强制 direction:ltr（双向孤岛），不被整体镜像。
    // 中文/英文/日韩等其余语言保持 dir="ltr"。逻辑边距一律用 inline-start/inline-end（见样式表）。
    document.documentElement.dir = RTL_LANGS.has(curLang) ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { /** @type {HTMLElement} */(el).title = t(el.getAttribute("data-i18n-title")); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { /** @type {HTMLInputElement} */(el).placeholder = t(el.getAttribute("data-i18n-ph")); });
    refreshDynamicLabels();
    setFileName(activeTab() ? activeTab().name : t("untitled"));
    updateStats();
  }
  function refreshDynamicLabels() {
    $("sync-btn").textContent = t("sync") + ":" + (syncScroll ? t("on") : t("off"));
    $("theme-btn").textContent = document.documentElement.classList.contains("dark") ? t("themeLight") : t("themeDark");
    const cb = $("color-btn"); if (cb) cb.title = colorI18n().color;
    const ni = navI18n();
    const nb = $("nav-back"), nf = $("nav-fwd");
    if (nb) nb.title = ni.back; if (nf) nf.title = ni.fwd;
    // 图查看器按钮多语言标题（全屏态切换为 exitFullscreen；mv-* 元素在主窗口/查看器窗口都存在）
    const mv = mermaidI18n();
    const mvIn = $("mv-in"), mvOut = $("mv-out"), mvReset = $("mv-reset"), mvCenter = $("mv-center"), mvFs = $("mv-fullscreen"), mvClose = $("mv-close"), mvTitle = $("mv-title"), mvHint = $("mv-hint");
    if (mvIn) mvIn.title = mv.zoomIn; if (mvOut) mvOut.title = mv.zoomOut; if (mvReset) mvReset.title = mv.reset;
    if (mvCenter) mvCenter.title = mv.center;
    if (mvClose) mvClose.title = mv.close; if (mvHint) mvHint.textContent = mv.hint; // title 由内容类型设（svg/img）
    const mvMask = $("mermaid-viewer");
    if (mvFs) mvFs.title = (mvMask && mvMask.classList.contains("mv-fs")) ? mv.exitFullscreen : mv.fullscreen;
    // 编辑区/预览区字体缩放按钮多语言标题（百分比标签点击重置）
    const zi = zoomI18n();
    const ezIn = $("ez-in"), ezOut = $("ez-out"), ezLvl = $("ez-lvl"), pzIn = $("pz-in"), pzOut = $("pz-out"), pzLvl = $("pz-lvl");
    if (ezIn) ezIn.title = zi.zoomIn; if (ezOut) ezOut.title = zi.zoomOut; if (ezLvl) ezLvl.title = zi.reset;
    if (pzIn) pzIn.title = zi.zoomIn; if (pzOut) pzOut.title = zi.zoomOut; if (pzLvl) pzLvl.title = zi.reset;
    refreshViewLabel();
  }

  function extractMath(src) {
    const store = [];
    const PH = (i) => "\u200bMATH" + i + "\u200b";
    // 1) 块级：$$...$$ 与 \[...\]（可跨行）
    src = src.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (m, a, b) => {
      store.push({ display: true, tex: (a != null ? a : b).replace(/^\s+|\s+$/g, "") });
      return PH(store.length - 1);
    });
    // 2) 行内：$...$ 与 \(...\)（不跨行；$ 内首尾不得为空格，避免货币误伤）
    src = src.replace(/\$([^\n$]+?)\$|\\\(([\s\S]+?)\\\)/g, (m, a, b) => {
      if (a != null && /^\s|\s$/.test(a)) return m;
      store.push({ display: false, tex: (a != null ? a : b).replace(/^\s+|\s+$/g, "") });
      return PH(store.length - 1);
    });
    return { src, store, PH };
  }

  /* ---------- 文献引用（BibTeX，numeric / unsrt 风格）----------
     语法：[@key] / [@k1; @k2] / [@key, p. 12]  或 LaTeX 兼容 \cite{key} / \citep{key}
     .bib 来源：① 文档内 ```bibtex 代码块（自包含）② 「文献」按钮加载的 .bib（tab.bibText）
     渲染：正文 [n] 上标（按首次出现编号），文末追加「参考文献」有序列表。
     占位符 ​CITE i​ 复用零宽字符模式，marked + DOMPurify 不动它；还原走单次正则（见 BUG-011）。
  */
  const CITE_RE = /​CITE(\d+)​/g;
  const _bibCache = new Map();
  // 解析 .bib 文本 → Map<key, entry>（entry = {type, key, fields:{title,author,...}}）
  // 库默认对标题做 sentence-case；此处关闭以保留原始大小写（LaTeX 不自动小写标题）。
  function parseBib(text) {
    if (!window.BibTeXParser || !text) return null;
    const cached = _bibCache.get(text);
    if (cached) return cached;
    let entries = [];
    try { entries = (window.BibTeXParser.parse(text, { sentenceCase: false }) || {}).entries || []; }
    catch (e) { return null; }
    const db = new Map();
    for (const e of entries) if (e && e.key) db.set(e.key, e);
    if (_bibCache.size > 8) _bibCache.clear();
    _bibCache.set(text, db);
    return db;
  }
  // 合并「加载的 .bib」与「内嵌 bibtex 块」两路来源
  function buildBibDB(tab, embedded) {
    const parts = [];
    if (tab && tab.bibText && tab.bibText.trim()) parts.push(tab.bibText);
    if (embedded && embedded.trim()) parts.push(embedded);
    if (!parts.length) return null;
    return parseBib(parts.join("\n\n"));
  }
  // 抽取文档内 ```bibtex / ~~~bibtex 代码块：内容累加进 embedded，块体用等长空白替换
  // （仅保留换行）以保持 srcBlockOffsets 与 editor.value 偏移对齐（点击定位用）。
  function extractEmbeddedBib(text) {
    let embedded = "";
    const re = /(^|\n)[ \t]*(`{3}|~{3})\s*bibtex\s*\n([\s\S]*?)\n[ \t]*\2/g;
    const t = text.replace(re, (m, lead, _fence, body) => {
      embedded += (embedded ? "\n\n" : "") + body.trim();
      // 等长空白替换：保留换行符，其余字符变空格
      return lead + m.slice(lead.length).replace(/[^\n]/g, " ");
    });
    return { text: t, embedded };
  }
  // 解析 [@...] 内部：返回 { keys:[...], locator:"" }
  // 例：[@smith2020] → {keys:["smith2020"]}
  //     [@a; @b] → {keys:["a","b"]}
  //     [@a; @b, p. 12] → {keys:["a","b"], locator:"p. 12"}
  //     [-@a]（抑制作者，numeric 下同 [n]）→ {keys:["a"]}
  function parseCiteInner(inner) {
    const segs = inner.split(";").map((s) => s.trim()).filter((s) => s.length);
    let locator = "";
    const keys = [];
    segs.forEach((seg, i) => {
      let k = seg, loc = "";
      if (i === segs.length - 1 && k.includes(",")) {
        const c = k.indexOf(",");
        loc = k.slice(c + 1).trim();
        k = k.slice(0, c).trim();
      }
      k = k.replace(/^[-]?@?/, "").trim(); // 去掉前导 - 与 @
      if (k) keys.push(k);
      if (loc) locator = loc;
    });
    return { keys, locator };
  }
  // 在 src（已保护代码/公式为占位符）中把引用替换为 ​CITE i​ 占位符，收集 citeList
  // 单遍联合正则：[@...] 与 \cite...{...} 按文本位置依次处理，保证编号按出现顺序
  function scanCitations(src) {
    const citeList = [];
    const PH = (i) => "​CITE" + i + "​";
    const re = /\[\s*@([^\]]*)\]|\\cite[a-zA-Z]*\s*\{([^}]*)\}/g;
    src = src.replace(re, (m, atInner, citeInner) => {
      let keys, locator = "";
      if (atInner != null) {
        ({ keys, locator } = parseCiteInner(atInner));
        if (!keys.length) return m;
      } else {
        keys = citeInner.split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
        if (!keys.length) return m;
      }
      const i = citeList.length; citeList.push({ keys, locator });
      return PH(i);
    });
    return { src, citeList };
  }
  // 格式化作者列表：1 人 "J. Smith"｜2 人 "J. Smith and B. Jones"｜≥3 人 "J. Smith et al."
  function fmtAuthors(au) {
    if (!au) return "";
    if (typeof au === "string") return au; // 团体作者 / 字面量
    if (!Array.isArray(au) || !au.length) return "";
    const ini = (fn) => (fn || "").split(/[ .\-]+/).filter(Boolean)
      .map((p) => p[0] ? p[0].toUpperCase() + "." : "").join(" ");
    const one = (a) => (ini(a.firstName) + " " + (a.lastName || "")).trim();
    let s;
    if (au.length === 1) s = one(au[0]);
    else if (au.length === 2) s = one(au[0]) + " and " + one(au[1]);
    else s = one(au[0]) + " et al.";
    return s;
  }
  // 格式化单条文献（unsrt 风格）。字段已由库做 LaTeX→unicode 解码（-- → en-dash、重音等）。
  function fmtEntry(e) {
    const f = e && e.fields ? e.fields : {};
    const parts = [];
    const au = fmtAuthors(f.author);
    if (au) parts.push(au);
    if (f.title) parts.push('<span class="bib-title">' + escapeHtml(f.title) + "</span>");
    const venue = [];
    if (f.journal) venue.push("<em>" + escapeHtml(f.journal) + "</em>");
    else if (f.booktitle) venue.push("<em>" + escapeHtml(f.booktitle) + "</em>");
    else if (f.publisher) venue.push(escapeHtml(f.publisher));
    const volnum = [];
    if (f.volume) volnum.push(escapeHtml(String(f.volume)));
    if (f.number) volnum.push("(" + escapeHtml(String(f.number)) + ")");
    if (volnum.length) venue.push(volnum.join(""));
    if (f.pages) venue.push(escapeHtml(String(f.pages)));
    if (venue.length) parts.push(venue.join(", "));
    if (f.year) parts.push(escapeHtml(String(f.year)));
    let s = parts.map((p) => p.trim()).filter(Boolean).join(". ");
    s = s.replace(/\.{2,}/g, "."); // 合并多余句点（如 "et al.." → "et al."）
    if (s && !/[.!?]$/.test(s)) s += "."; // 条目以句点收尾
    return s;
  }
  // 还原 ​CITE i​ 占位为上标链接，并按首次出现给已知 key 编号、追加参考文献表
  let lastBibOrder = []; // lastBibOrder[n-1] = 编号为 n 的 key（供文献表回链跳转用）
  function renderCitations(html, citeList, bibDB) {
    if (!citeList || !citeList.length) { lastBibOrder = []; return html; }
    const num = new Map(); let next = 1; const order = [];
    citeList.forEach((c) => c.keys.forEach((k) => {
      if (bibDB && bibDB.has(k) && !num.has(k)) { num.set(k, next++); order.push(k); }
    }));
    lastBibOrder = order.slice();
    // 单次正则还原（避免 O(文本长 × 引用数) 的 split/join 循环，见 BUG-011）
    html = html.replace(CITE_RE, (_m, i) => {
      const c = citeList[+i]; if (!c) return "";
      const parts = c.keys.map((k) => {
        const n = num.get(k);
        if (n == null) return "?";
        return '<a href="#ref-' + n + '">' + n + "</a>";
      });
      let body = parts.join(", ");
      if (c.locator) body += ", " + escapeHtml(c.locator);
      return '<sup class="cite">[' + body + "]</sup>";
    });
    if (!order.length) return html; // 无已知条目则不输出文献表
    let bib = '<section class="bibliography" id="refs"><h2>' + escapeHtml(t("references")) +
      '</h2><ol class="biblist">';
    order.forEach((k) => {
      const n = num.get(k);
      bib += '<li class="bibitem" id="ref-' + n + '"><a class="bib-back" data-ref="' + n +
        '" title="' + escapeHtml(t("citeJumpTip")) + '">[' + n + ']</a> ' + fmtEntry(bibDB.get(k)) + "</li>";
    });
    bib += "</ol></section>";
    return html + bib;
  }

  // 代码块懒高亮：IntersectionObserver 只对进入视口(含 200px 预判区)的 pre code 调 hljs。
  // 大文件含上千代码块时，避免一次性同步高亮导致打开/编辑卡顿数秒。
  let hljsObserver = null;
  // 超长 display 公式按 font-size 等比缩小到容器宽度内（KaTeX 用 em 单位，缩 font-size 即整体等比）。
  // 数学公式无法像文字自动换行，故用缩放保证整式可见、右侧不被裁切。
  // 超长 display 公式：优先按顶层运算符(= + -)折行重渲为多行 gathered，把溢出部分放到下一行；
  // 无法断行(如纯长分数)才回退到等比缩小。数学公式本身不能像文字自动换行，此处按运算符断点近似折行。
  function fitOne(kd) {
    const natural = kd.scrollWidth, visible = kd.clientWidth;
    if (natural <= visible + 1) return;
    const base = parseFloat(getComputedStyle(kd).fontSize) || 16;
    kd.style.fontSize = Math.max(8, base * (visible / natural) * 0.98) + "px";
  }
  // 贪心：把 tex 在顶层运算符处切成段，逐段累加，超宽即断行，生成 gathered 多行 tex。
  function wrapTexToFit(tex, maxWidth, measure) {
    const ops = [];
    let depth = 0;
    for (let i = 0; i < tex.length; i++) {
      const c = tex[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && (c === "=" || c === "+" || c === "-")) ops.push(i);
    }
    if (!ops.length) return null;
    const segs = [];
    let last = 0;
    for (const op of ops) { segs.push(tex.slice(last, op)); last = op; }
    segs.push(tex.slice(last));
    const widthOf = (t) => {
      try {
        measure.innerHTML = "";
        katex.render(t, measure, { displayMode: true, throwOnError: false });
        const k = measure.querySelector(".katex");
        return k ? k.scrollWidth : maxWidth + 1;
      } catch (e) { return maxWidth + 1; }
    };
    const lines = [];
    let cur = "";
    for (const seg of segs) {
      const trial = cur + seg;
      if (!cur || widthOf(trial) <= maxWidth) cur = trial;
      else { lines.push(cur); cur = seg; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= 1) return null;
    return "\\begin{gathered} " + lines.map((l) => l.trim()).filter(Boolean).join(" \\\\ ") + " \\end{gathered}";
  }
  // 多行环境(align/gather 类，按 \\ 分行)逐行折行：对超宽行在其 & 之后的顶层 +/- 处折成续行。
  // align 用 "& op 续行" 对齐到等号列；gather 直接续行。cases/matrix/array 等结构不适合，返回 null。
  // 按 depth-0 的 \\ 拆行（避开 \\[ \\] 与 \begin/\end 内部）
  function splitTexLines(body) {
    const lines = [];
    let depth = 0, cur = "", i = 0;
    while (i < body.length) {
      const c = body[i];
      if (c === "{") { depth++; cur += c; i++; }
      else if (c === "}") { depth--; cur += c; i++; }
      else if (c === "\\" && body[i + 1] === "\\" && depth === 0) {
        const nx = body[i + 2];
        if (nx === "[" || nx === "]") { cur += "\\\\"; i += 2; }
        else { lines.push(cur); cur = ""; i += 2; }
      } else { cur += c; i++; }
    }
    if (cur.trim()) lines.push(cur);
    return lines;
  }
  // 单行(含 & 对齐点)折行：在第一个 & 之后的顶层 +/- 处切，续行 "& op seg"(useAmp) 或 "op seg"
  function breakOneLine(line, maxWidth, widthOf, useAmp) {
    let amp = -1, depth = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === "&") { amp = i; break; }
    }
    const prefix = amp >= 0 ? line.slice(0, amp + 1) : "";
    const rest = amp >= 0 ? line.slice(amp + 1) : line;
    const ops = [];
    depth = 0;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && (c === "+" || c === "-")) ops.push(i);
    }
    if (!ops.length) return null;
    const segs = [];
    let last = 0;
    for (const op of ops) { segs.push(rest.slice(last, op)); last = op; }
    segs.push(rest.slice(last));
    const rows = [];
    let cur = prefix + segs[0];
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i];
      if (widthOf(cur + seg) <= maxWidth) cur += seg;
      else { rows.push(cur); cur = (useAmp ? "& " : "") + seg.replace(/^\s+/, ""); }
    }
    if (cur) rows.push(cur);
    // 续行(折出来的)加 \notag 抑制编号：align 不带星号每行自动编号，折行不该给每段都加编号，
    // 只保留原始逻辑行的编号(rows[0])，续行 \notag 不编号。
    return rows.length > 1 ? rows.map((r, i) => (i === 0 ? r : "\\notag " + r)).join(" \\\\ ") : null;
  }
  // align/gather 类多行环境逐行折行；其他环境或无可折行点返回 null（交 fitOne 等比缩小）
  function wrapMultiLineToFit(tex, maxWidth, measure) {
    const m = tex.match(/\\begin\s*\{([a-zA-Z]+\*?)\}([\s\S]*?)\\end\s*\{\1\}/);
    if (!m) return null;
    const env = m[1];
    if (!/^(align|gather)\*?$/.test(env)) return null;
    const wrapPrefix = tex.slice(0, m.index); // \begin 前内容
    const wrapSuffix = tex.slice(m.index + m[0].length); // \end 后内容（如 \tag{a}，须保留）
    const useAmp = /^align\*?$/.test(env);
    const lines = splitTexLines(m[2]);
    const widthOf = (t) => {
      try {
        measure.innerHTML = "";
        katex.render("\\begin{aligned} " + t + " \\end{aligned}", measure, { displayMode: true, throwOnError: false });
        const k = measure.querySelector(".katex");
        return k ? k.scrollWidth : maxWidth + 1;
      } catch (e) { return maxWidth + 1; }
    };
    let changed = false;
    const out = [];
    for (const line of lines) {
      const tr = line.trim();
      if (!tr) { out.push(line); continue; }
      if (widthOf(tr) <= maxWidth) { out.push(line); continue; }
      const broken = breakOneLine(tr, maxWidth, widthOf, useAmp);
      if (broken) { out.push(broken); changed = true; } else out.push(line);
    }
    if (!changed) return null;
    return wrapPrefix + "\\begin{" + env + "} " + out.map((l) => l.trim()).filter(Boolean).join(" \\\\ ") + " \\end{" + env + "}" + wrapSuffix;
  }
  function wrapDisplayMath(root) {
    if (!window.katex) return;
    // 离屏测宽元素（继承 root 字号），仅对溢出公式启用，用完即删
    let measure = null;
    const ensureMeasure = () => {
      if (measure) return measure;
      measure = document.createElement("span");
      measure.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;";
      root.appendChild(measure);
      return measure;
    };
    root.querySelectorAll(".mdmath").forEach((md) => {
      const tex = decodeURIComponent(md.getAttribute("data-tex") || "");
      let kd = md.querySelector(".katex-display");
      if (!kd) return;
      kd.style.fontSize = ""; // 清除之前的缩放
      // 先恢复原始 tex 再评估：resize 重跑时 kd 可能是上次折行/缩放后的状态，不能基于它判定，
      // 必须从原始按当前容器宽重新决定 单行/折行/缩放（否则拉宽后仍停在旧折行不重排）。
      if (tex) {
        try { katex.render(tex, md, { displayMode: true, throwOnError: false }); } catch (e) { return; }
        kd = md.querySelector(".katex-display");
      }
      if (!kd) return;
      // 编号环境(align/gather/equation 不带星号)右侧空编号占位列使 scrollWidth 恒≈client+2，
      // 属子像素假溢出：≤4px 不处理（.katex-display overflow-x:hidden，2px 被裁视觉无感）。
      if (kd.scrollWidth - kd.clientWidth <= 4) return;
      // 真·超宽。多行环境(含 \begin{env})：wrapTexToFit 顶层盲切会破坏 &/\\，改用 wrapMultiLineToFit
      // 逐行折行(align/gather 类，align 保留 = 对齐)；单行公式走 wrapTexToFit。
      // widthOf 量宽(同环境)与实际渲染有~2px 子像素差异，maxWidth 留 8px 安全边距，
      // 确保折行后整体(含编号 .tag)在容器内、不被推出右边界。
      if (tex) {
        const isMultiLineEnv = /\\begin\s*\{/.test(tex);
        // widthOf(离屏 aligned 量)比实际渲染窄(~16px)，单次折行后第一行仍可能越过右侧编号。
        // 迭代实测：折行→渲染→量第一行内容右边界(叶子元素,排除 .tag)vs tag 左，仍重叠就收窄重折。
        const tagEl0 = kd.querySelector(".tag");
        const tagW0 = tagEl0 ? tagEl0.offsetWidth : 0;
        const firstRowFits = () => {
          const tag = kd.querySelector(".tag");
          if (!tag) return true;
          const db = kd.getBoundingClientRect();
          const tg = tag.getBoundingClientRect();
          let rr = 0;
          kd.querySelectorAll(".katex-html *").forEach((el) => {
            if (el.children.length > 0 || el.closest(".tag")) return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && Math.abs((r.top - db.top) - (tg.top - db.top)) < 12) rr = Math.max(rr, r.right - db.left);
          });
          return rr <= tg.left - db.left - 2; // 多留 2px，避免边界子像素重叠
        };
        let maxW = kd.clientWidth - tagW0 - 12;
        for (let attempt = 0; attempt < 12; attempt++) {
          const broken = isMultiLineEnv
            ? wrapMultiLineToFit(tex, maxW, ensureMeasure())
            : wrapTexToFit(tex, maxW, ensureMeasure());
          if (!broken) break;
          try {
            katex.render(broken, md, { displayMode: true, throwOnError: false });
            kd = md.querySelector(".katex-display");
            if (firstRowFits()) return; // 第一行 ≤ 编号左，不重叠
          } catch (e) { break; }
          maxW -= 16; // 仍越，收窄重折
        }
      }
      // 逐行/单行折行失败(cases/matrix 或无可折行点) / 仍溢出：等比缩小到容器内（无横向滚动条）
      kd = md.querySelector(".katex-display");
      if (kd) fitOne(kd);
    });
    if (measure) measure.remove();
  }
  // 渲染栏宽度变化时(拉宽/缩窄窗口、调分栏)实时重排：debounce 重跑 wrapDisplayMath，
  // 公式按新宽度重新折行/缩放（折行位置需重新触发计算，渲染栏宽变不会自动重排）。
  let wrapResizeObs = null;
  function watchWrapResize() {
    if (wrapResizeObs || typeof ResizeObserver === "undefined" || !preview) return;
    let tid = null;
    wrapResizeObs = new ResizeObserver(() => {
      clearTimeout(tid);
      tid = setTimeout(() => wrapDisplayMath(preview), 150);
    });
    wrapResizeObs.observe(preview);
  }
  watchWrapResize();
  function highlightCodeLazy() {
    if (!window.hljs) return;
    if (hljsObserver) hljsObserver.disconnect();
    const blocks = preview.querySelectorAll("pre code:not([data-hl])");
    if (!blocks.length) return;
    if (!hljsObserver) {
      hljsObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target;
            el.setAttribute("data-hl", "1");
            try { hljs.highlightElement(el); } catch (_) {}
            hljsObserver.unobserve(el);
          }
        }
      }, { root: preview, rootMargin: "200px 0px" });
    }
    blocks.forEach((el) => hljsObserver.observe(el));
  }

  let previewDirty = false;
  let srcBlockOffsets = []; // 每个源码块在 editor.value 中的起始字符偏移量（用于点击定位）

  /* ---------- mermaid（流程图/时序图等）----------
     ```mermaid 代码块在 render() 里预渲染为 SVG，写回 html 字符串——这样实时预览、
     PDF 矢量/位图（均取 lastFullHtml）、HTML 导出三路都能拿到 SVG。
     mermaid.render 异步，故 render() 整体异步；renderGen 代际守卫防连击竞态。
  */
  let renderGen = 0;        // 渲染代际：每次 render 自增，await 后若已过期则丢弃结果
  let mermaidReady = false;
  let mermaidSeq = 0;
  function initMermaid() {
    if (!window.mermaid) { mermaidReady = false; return; }
    const dark = document.documentElement.classList.contains("dark");
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        securityLevel: "strict",
        suppressErrorRendering: true, // 错误由本程序 .catch 自绘 .mermaid-err，不让 mermaid 自渲染错误图
        flowchart: { htmlLabels: true, curve: "basis" },
      });
      mermaidReady = true;
    } catch (e) { mermaidReady = false; }
  }
  // 清除 mermaid.render 在 <body> 留下的临时错误元素 <div id="d<renderId>">（含"Syntax error…mermaid version"）。
  // 它在 #preview 之外，重渲预览/换标签都清不掉、每次出错累加、仅重启消失（bug_history BUG-068）。每次 render 后主动删。
  function cleanupMermaidTemp(id) {
    const el = document.getElementById("d" + id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  // 还原 marked 对代码内容的 HTML 转义，得到 mermaid 源码
  function decodeEntities(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  // 把 html 中所有 <pre><code class="language-mermaid">…</code></pre> 预渲染为 SVG
  async function renderMermaidInHtml(html) {
    if (!window.mermaid || html.indexOf("language-mermaid") === -1) return html;
    if (!mermaidReady) initMermaid();
    if (!mermaidReady) return html;
    const blocks = [];
    html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (m, code) => {
      const i = blocks.length;
      blocks.push(decodeEntities(code));
      return "​MERMAID" + i + "​";
    });
    if (!blocks.length) return html;
    // 顺序渲染（C12）：mermaid.render 共享内部状态（字体测量、body 上 d<id> 错误残留），
    // 并发 Promise.all 在多块/含语法错误时偶发缺图或残留。改为 for-await 串行。
    const svgs = [];
    for (const src of blocks) {
      const id = "mmd-" + (mermaidSeq++);
      try {
        const r = await mermaid.render(id, src);
        svgs.push('<div class="mermaid-wrap">' + (r && r.svg ? r.svg : "") + "</div>");
      } catch (e) {
        const msg = String((e && e.message) || e);
        svgs.push('<div class="mermaid-wrap"><pre class="mermaid-err">' +
          escapeHtml(src) + "\n\n⚠ " + escapeHtml(msg) + "</pre></div>");
      } finally {
        cleanupMermaidTemp(id); // 清除 mermaid 在 body 留下的 d<id> 错误残留（BUG-068）
      }
    }
    html = html.replace(/​MERMAID(\d+)​/g, (_m, i) => svgs[+i] || "");
    return html;
  }

  async function render(force) {
    // 空状态（所有标签已关闭）：不渲染预览，编辑区由空状态提示接管。
    if (!activeTab()) return;
    // 预览窗格隐藏（仅编辑模式）时，跳过整段昂贵的解析与 DOM 构建，只更新统计。
    // 大文件在仅编辑模式下打开/编辑可因此快很多；切回分屏/仅预览时由 setViewMode 触发重渲。
    // force=true 时强制构建（矢量 PDF 导出需要完整 HTML，即使在仅编辑模式下）。
    if (!force && curViewMode === "editor") {
      previewDirty = true;
      updateStats();
      return;
    }
    previewDirty = false;
    const at0 = activeTab();
    if (at0 && at0.type === "html") {
      // HTML 模式：直接净化渲染，跳过 marked/extractMath（避免 $ 被误判为公式、Markdown 语法误伤）
      let html = editor.value;
      if (window.DOMPurify) {
        html = DOMPurify.sanitize(html, {
          ADD_ATTR: ["target", "colspan", "rowspan", "align", "loading", "aria-hidden", "encoding"],
        });
      }
      { const g = ++renderGen; html = await renderMermaidInHtml(html); if (g !== renderGen) return; renderIntoPreview(html); return; }
    }
    // Markdown 模式：先把代码块 / 行内代码用占位符保护起来，避免公式正则误伤代码里的 $ 与反斜杠。
    let text = editor.value;
    computeEditorMap(); // 源码行起始偏移 + 折行视觉行映射（编辑↔预览滚动同步/定位用）
    // 抽取内嵌 ```bibtex 块（等长空白替换，保持偏移对齐）→ 合并 tab.bibText 建文献库
    const { text: textNoBib, embedded } = extractEmbeddedBib(text);
    text = textNoBib;
    const bibDB = buildBibDB(at0, embedded);
    // 计算源码块偏移量（按空行分块），用于点击定位——不依赖文本匹配，确定性方案
    // text 与 editor.value 等长（bibtex 块用等长空白替换），故偏移可直接映射回源码
    srcBlockOffsets = [];
    let _pos = 0;
    for (const part of text.split(/(\n\n+)/)) {
      if (part.trim()) srcBlockOffsets.push(_pos);
      _pos += part.length;
    }
    const codeStore = [];
    const CPH = (i) => "\u200bCODE" + i + "\u200b";
    text = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (m) => { codeStore.push(m); return CPH(codeStore.length - 1); });
    text = text.replace(/`[^`\n]+`/g, (m) => { codeStore.push(m); return CPH(codeStore.length - 1); });

    let { src, store, PH } = extractMath(text);
    // 抽引用为占位符（代码/公式已是占位符，引用不会被误伤；\cite{} 也在此步移除）
    let citeList;
    ({ src, citeList } = scanCitations(src));
    // 还原代码（让 marked 正常渲染为 <code>/<pre>），公式占位符保留给后面替换
    // 单次正则替换，避免 O(文本长 × 代码块数) 的 split/join 循环（大文档会明显卡顿）
    src = src.replace(/​CODE(\d+)​/g, (_m, i) => codeStore[+i] || "");

    let html;
    try { html = marked.parse(src); }
    catch (e) { html = '<p style="color:red">渲染错误: ' + escapeHtml(String(e)) + '</p>'; }

    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, {
        ADD_ATTR: ["target", "colspan", "rowspan", "align", "loading", "aria-hidden", "encoding"],
      });
    }

    // 把占位符替换成 KaTeX 渲染结果（在 DOMPurify 之后，KaTeX 输出不再被过滤）
    // 单次正则替换，避免 O(html 长 × 公式数) 的 split/join 循环（公式多的大文档会明显卡顿）
    // display 公式外层包 .mdmath 并存原始 tex，供 wrapDisplayMath 超长时按运算符折行重渲。
    if (window.katex && store.length) {
      const rendered = store.map((s) => {
        let out;
        try {
          // S2：KaTeX 输出在 DOMPurify 之后注入 innerHTML；对其单独消毒（html+mathMl profile，
          // 保留 span 与 MathML），失败/被清空则回退原输出（绝不致公式空白）。
          out = katex.renderToString(s.tex, { displayMode: s.display, throwOnError: false, trust: false });
        } catch (e) {
          out = '<span style="color:#d33" title="' + escapeHtml(String(e)) + '">' +
            escapeHtml(s.tex) + "</span>";
        }
        if (s.display) {
          // data-tex 存原始 LaTeX（encodeURIComponent 防属性注入），便于折行重渲
          out = '<span class="mdmath" data-tex="' + encodeURIComponent(s.tex) + '">' + out + "</span>";
        }
        return out;
      });
      html = html.replace(/​MATH(\d+)​/g, (_m, i) => rendered[+i] || "");
    }

    // 还原引用占位为 [n] 上标，并追加「参考文献」表（单次正则，见 BUG-011）
    html = renderCitations(html, citeList, bibDB);

    // mermaid 预渲染（异步）：把 ```mermaid 代码块替换为 SVG，写入 html 字符串。
    // 代际守卫：await 后若已有更新的 render 启动，丢弃本次结果，避免覆盖新内容。
    const myGen = ++renderGen;
    html = await renderMermaidInHtml(html);
    if (myGen !== renderGen) return;
    renderIntoPreview(html);
  }
  // HTML 模式：用 KaTeX auto-render 渲染 $...$ / $$...$$（HTML 里公式是字面量，不像 MD 模式已预渲染）
  function renderMathAuto(root) {
    if (window.renderMathInElement) {
      try {
        renderMathInElement(root, {
          delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
          throwOnError: false,
          trust: false, // 显式禁用 \href/\url/\includegraphics 等（默认即 false；显式标注防未来误开，S2）
        });
      } catch (e) {}
    }
  }
  // 把已构建好的完整 HTML 挂进预览：大文档虚拟化、小文档全量；含代码高亮/公式折行/图片解析。
  // Markdown 与 HTML 两种模式最终都走这里。
  // 细粒度点击定位：返回"列表项 / 表格行"在源码区间 [s,e) 内的起始偏移数组（含 s）。空=该块无细粒度（退回块级）。
  // 确定性扫描源码（不依赖 marked 内部），与 srcBlockOffsets 同思路；bibtex 等长空白替换不影响列表/表格扫描。
  function fineUnitOffsets(s, e) {
    const block = editor.value.slice(s, e);
    const lines = []; let rel = 0;
    for (const ln of block.split("\n")) { lines.push([rel, ln]); rel += ln.length + 1; }
    const isItem = (t) => /^[ \t]*([-*+]|\d+\.)[ \t]/.test(t);
    const isSep = (t) => /^[ \t|:-]+$/.test(t) && /-/.test(t);
    if (lines.some(([, t]) => isItem(t)))
      return lines.filter(([, t]) => isItem(t)).map(([r]) => s + r);            // 列表项（含嵌套，深度优先≈源码序）
    if (lines.some(([, t]) => isSep(t)))
      return lines.filter(([, t]) => /\|/.test(t) && !isSep(t)).map(([r]) => s + r); // 表格行（跳过分隔行）
    return [];
  }
  // 给列表/表格块的 <li>/<tr> 打 data-src-offset/end；点击时 closest("[data-src-offset]") 自动落到更细的项/行。
  function tagFineInBlock(el, s, e) {
    if (!el || e <= s) return;
    const tag = el.tagName;
    if (tag !== "UL" && tag !== "OL" && tag !== "TABLE") return;
    const offs = fineUnitOffsets(s, e); if (!offs.length) return;
    const units = el.querySelectorAll(tag === "TABLE" ? "tr" : "li");
    for (let i = 0; i < units.length && i < offs.length; i++) {
      const st = offs[i], en = (i + 1 < offs.length ? offs[i + 1] : e);
      units[i].setAttribute("data-src-offset", st);
      units[i].setAttribute("data-src-end", en);
    }
  }
  function renderIntoPreview(html) {
    // 表格统一包一层 .table-wrap：窄表居中、宽表横向滚动（CSS 见 #preview .table-wrap）。
    // marked 不输出嵌套 <table>，非贪婪匹配即安全；bibliography 用 <ol>，不会误伤。
    if (html.indexOf("<table") !== -1)
      html = html.replace(/<table(\s[^>]*)?>[\s\S]*?<\/table>/g,
        (m) => '<div class="table-wrap">' + m + "</div>");
    lastFullHtml = html; // 供 PDF 导出取用完整 HTML，不依赖预览 DOM（虚拟化时预览只挂可见块）
    // 大文档虚拟化：只挂可见块；小文档全量渲染。用一次 template 解析同时完成块计数与切分。
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    // 给每个顶层块打上 data-src-offset（源码偏移量），供点击定位用
    const children = Array.from(tpl.content.children);
    for (let i = 0; i < children.length && i < srcBlockOffsets.length; i++) {
      const so = srcBlockOffsets[i];
      const eo = i + 1 < srcBlockOffsets.length ? srcBlockOffsets[i + 1] : editor.value.length;
      children[i].setAttribute("data-src-offset", so);
      children[i].setAttribute("data-src-end", eo);
      tagFineInBlock(children[i], so, eo); // 列表/表格：给 li/tr 打细粒度偏移
    }
    const blockCount = children.length;
    if (blockCount > VIRT_THRESHOLD) {
      const keepScroll = preview.scrollTop;
      vClear();
      vSetup(tpl);          // 复用已解析的 template，不再二次解析
      preview.scrollTop = Math.min(keepScroll, vprefix[vblocks.length] - (preview.clientHeight || 0));
      renderVisible();
    } else {
      vClear();
      preview.innerHTML = html;
      // 非虚拟化：直接在 DOM 上标记 data-src-offset（template 上的标记不会随 innerHTML 带过来）
      const pvChildren = preview.children;
      for (let i = 0; i < pvChildren.length && i < srcBlockOffsets.length; i++) {
        const so = srcBlockOffsets[i];
        const eo = i + 1 < srcBlockOffsets.length ? srcBlockOffsets[i + 1] : editor.value.length;
        pvChildren[i].setAttribute("data-src-offset", so);
        pvChildren[i].setAttribute("data-src-end", eo);
        tagFineInBlock(pvChildren[i], so, eo);
      }
      // 代码高亮：懒加载——只高亮进入视口的代码块（IntersectionObserver）。
      highlightCodeLazy();
      wrapDisplayMath(preview);
      // HTML 模式：渲染 $...$ 数学公式（MD 模式已在 html 字符串里预渲染，不需要）
      const at = activeTab();
      if (at && at.type === "html") renderMathAuto(preview);
      if (isTauri && at) resolveImages(preview, at.dir || "");
    }
    updateStats();
    buildPreviewBlockY(); // 测预览块顶 Y（非虚拟化每次渲染测一次缓存；虚拟化用 vprefix，此处空操作）
    if (searchBar && !searchBar.hidden) highlightPreview();
    syncViewerWindows();   // mermaid 查看器 live update：推送对应块的新 SVG
  }

  /* ---------- 预览虚拟化（大文档）---------- */
  // 仅把可见区域（含缓冲）的块挂进 DOM，上下用 spacer 撑出总高度，滚动时按需切换可见块。
  // 这样预览 DOM 节点数与文档大小无关，只随可见区域变化——大文档也能丝滑滚动与即时编辑。
  // 小文档（块数 ≤ 阈值）走原 innerHTML 全量渲染，避免滚动条估算误差。
  const VIRT_THRESHOLD = 300;
  let lastFullHtml = "";       // 最近一次完整渲染的 HTML（供 PDF 导出使用，不依赖预览 DOM）
  let vblocks = [];            // 块 DOM 节点数组（来自 template 解析，未挂载到预览）
  let vheights = [];           // 每块高度：实测缓存，否则估算
  let vprefix = [0];           // 前缀和，vprefix[i] = 前 i 块高度之和
  let vRangeStart = -1, vRangeEnd = -1;
  let vScrollRaf = 0;
  let vSpacerTop = null, vContent = null, vSpacerBottom = null;

  // 按节点结构粗略估算块高度（px）。实测后会缓存真实值覆盖。避免对每块做 outerHTML 序列化。
  function estimateFromNode(el) {
    const tag = el.tagName;
    if (tag === "H1") return 52;
    if (tag === "H2") return 42;
    if (tag === "H3") return 34;
    if (tag === "H4" || tag === "H5" || tag === "H6") return 30;
    if (tag === "HR") return 24;
    if (tag === "PRE") return 40 + Math.max(1, (el.textContent.match(/\n/g) || []).length) * 18;
    if (tag === "UL" || tag === "OL") return 20 + Math.max(1, el.querySelectorAll("li").length) * 28;
    if (tag === "TABLE") return 20 + Math.max(1, el.querySelectorAll("tr").length) * 30;
    if (tag === "BLOCKQUOTE") return 36 + Math.max(1, el.querySelectorAll("p").length) * 28;
    const lines = el.querySelectorAll("p,br").length;
    const tlen = (el.textContent || "").length;
    return 28 + Math.max(1, lines) * 26 + (tlen > 200 ? Math.floor((tlen - 200) / 40) * 24 : 0);
  }
  function vRecomputePrefix() {
    vprefix = [0];
    for (let i = 0; i < vblocks.length; i++) vprefix.push(vprefix[i] + vheights[i]);
  }
  // 用已解析的 template 初始化虚拟化结构（复用 render() 的解析结果，不再二次解析）
  function vSetup(tpl) {
    vblocks = Array.from(tpl.content.children);
    vheights = vblocks.map(estimateFromNode);
    vRecomputePrefix();
    vRangeStart = vRangeEnd = -1;
    // 建立 spacer / content 三段结构
    vSpacerTop = document.createElement("div");
    vContent = document.createElement("div");
    vContent.className = "vcontent";
    vSpacerBottom = document.createElement("div");
    preview.appendChild(vSpacerTop);
    preview.appendChild(vContent);
    preview.appendChild(vSpacerBottom);
  }
  function vClear() {
    if (hljsObserver) { hljsObserver.disconnect(); }
    preview.innerHTML = ""; // 清空所有内容（全量 html 或 spacer 结构），避免模式切换时残留
    vSpacerTop = vContent = vSpacerBottom = null;
    vblocks = []; vheights = []; vprefix = [0]; vRangeStart = vRangeEnd = -1;
  }
  function renderVisible() {
    if (!vblocks.length || !vContent) return;
    const st = preview.scrollTop;
    const ch = preview.clientHeight || 600;
    const buf = 320;
    let s = 0;
    while (s < vblocks.length && vprefix[s + 1] <= st - buf) s++;
    let e = s;
    while (e < vblocks.length && vprefix[e] < st + ch + buf) e++;
    if (e <= s) e = Math.min(vblocks.length, s + 1);
    if (s === vRangeStart && e === vRangeEnd) return;
    vRangeStart = s; vRangeEnd = e;
    vSpacerTop.style.height = vprefix[s] + "px";
    vContent.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = s; i < e; i++) frag.appendChild(vblocks[i].cloneNode(true));
    vContent.appendChild(frag);
    vSpacerBottom.style.height = (vprefix[vblocks.length] - vprefix[e]) + "px";
    // 先缩放超长公式（会改变其高度），再实测块高度，避免高度缓存失真
    wrapDisplayMath(vContent);
    // 实测可见块高度并回填缓存，修正滚动条
    let changed = false;
    const kids = vContent.children;
    for (let k = 0; k < kids.length; k++) {
      const idx = s + k;
      const h = kids[k].offsetHeight;
      if (h && Math.abs(h - vheights[idx]) > 1) { vheights[idx] = h; changed = true; }
    }
    if (changed) {
      vRecomputePrefix();
      vSpacerTop.style.height = vprefix[s] + "px";
      vSpacerBottom.style.height = (vprefix[vblocks.length] - vprefix[e]) + "px";
    }
    // 高亮可见代码块（已可见，无需懒加载）
    if (window.hljs) {
      vContent.querySelectorAll("pre code:not([data-hl])").forEach((el) => {
        el.setAttribute("data-hl", "1");
        try { hljs.highlightElement(el); } catch (_) {}
      });
    }
    const at = activeTab();
    // HTML 模式：渲染可见区的 $...$ 数学公式
    if (at && at.type === "html") renderMathAuto(vContent);
    if (isTauri && at) resolveImages(vContent, at.dir || "");
    buildPreviewBlockY(); // 测预览块顶 Y（非虚拟化每次渲染测一次缓存；虚拟化用 vprefix，此处空操作）
    if (searchBar && !searchBar.hidden) highlightPreview();
    syncViewerWindows();   // mermaid 查看器 live update：推送对应块的新 SVG
  }
  function scheduleRenderVisible() {
    if (vScrollRaf) return;
    vScrollRaf = requestAnimationFrame(() => { vScrollRaf = 0; renderVisible(); });
  }

  // 把容器内指向本地文件的 <img>（相对路径）按 .md 所在目录解析为 base64 data URL。
  function resolveImages(root, dir) {
    root.querySelectorAll("img").forEach((img) => {
      let src = img.getAttribute("src") || "";
      if (!src || /^(data:|https?:|blob:|asset:)/i.test(src)) return; // 已是可用源
      // marked 会把图片 URL 中的非 ASCII（如中文文件夹名 未命名_images）percent-encode 成 %E6%9C%AA…
      // 直接当 fs 路径读会与真实 UTF-8 文件名不匹配 → 读不到。先 decodeURIComponent 还原 UTF-8 再拼路径。
      try { src = decodeURIComponent(src); } catch (_) {}
      // 绝对路径（Unix / 开头 或 Windows 盘符 X:）直接用；相对路径按文档目录拼。
      // 草稿标签（未保存、dir 为空）拖入的图片是绝对路径，仍可读取渲染；
      // 此时相对路径无法解析则跳过，避免拼成 "/pic.png" 误读根路径（见 BUG-033）。
      const isAbs = src.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(src);
      if (!isAbs && !dir) return;
      const abs = isAbs ? src : dir + "/" + src;
      // 前端扩展名白名单（S1，与后端 magic-byte 校验互为纵深防御）：
      // 非图片扩展名直接跳过，避免把 <img src="/etc/passwd"> 这类引用发给后端读取。
      if (!/\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|avif|heic)$/i.test(abs)) return;
      // imgCache[abs] 缓存 Promise<dataURL|null>：首次 invoke 创建，后续 render 的 img 共享同一 Promise。
      // 用 Promise 而非 null 标记：双击打开等场景连触多次 render(loadTab 的 rAF + init 的 rAF/setTimeout),
      // innerHTML 替换使旧 img 脱离 DOM；旧 invoke 回调只设旧 img(无效)，新 img 因 null 标记被跳过 → 首次不显示(BUG-076)。
      // 改 Promise 后，每个 img 各自 .then 拿同一结果设自身 src(isConnected 守卫防脱离 DOM 的旧 img)。
      if (!imgCache.has(abs)) {
        imgCacheSet(abs, invoke("read_image_data_url", { path: abs })
          .then((url) => {
            if (typeof url === "string" && url.indexOf("data:") === 0) return url;
            imgCache.delete(abs); return null; // 失败/非图片：清缓存允许下次重试
          })
          .catch(() => { imgCache.delete(abs); return null; }));
      }
      Promise.resolve(imgCacheGet(abs)).then((url) => { if (url && img.isConnected) img.src = url; });
    });
  }

  function scheduleRender() {
    markDirty();
    clearTimeout(renderTimer);
    // 大文档全量解析较重，用更长防抖避免连击卡顿；小文档保持 120ms 灵敏。
    const delay = editor.value.length > 60000 ? 450 : 120;
    renderTimer = setTimeout(render, delay);
    saveDraft();
  }

  /* ---------- 统计 ---------- */
  function updateStats() {
    const v = editor.value;
    const cn = (v.match(/[一-龥]/g) || []).length;
    const en = (v.replace(/[一-龥]/g, " ").match(/[A-Za-z0-9_]+/g) || []).length;
    // 底部状态栏：显示当前文件的绝对路径（草稿未存盘时退化为文件名 / 未命名）
    const at = activeTab();
    const p = (at && (at.path || at.name)) || t("untitled");
    const sp = $("s-path"); if (sp) { sp.textContent = p; sp.title = p; }
    $("wc").textContent = (cn + en) + " " + t("wUnit");
  }
  function updateCursor() {
    const p = editor.selectionStart;
    const before = editor.value.slice(0, p);
    $("s-cursor").textContent = t("lnCol").replace("{l}", before.split("\n").length).replace("{c}", p - before.lastIndexOf("\n"));
  }

  /* ---------- 编辑辅助 ---------- */
  function wrapSelection(before, after, ph) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    const sel = editor.value.slice(s, e) || ph;
    editor.value = editor.value.slice(0, s) + before + sel + (after || "") + editor.value.slice(e);
    const cs = s + before.length;
    editor.setSelectionRange(cs, cs + sel.length);
    editor.focus(); scheduleRender();
  }
  function linePrefix(prefix) {
    const s = editor.selectionStart, v = editor.value;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    editor.value = v.slice(0, ls) + prefix + v.slice(ls);
    editor.setSelectionRange(s + prefix.length, s + prefix.length);
    editor.focus(); scheduleRender();
  }
  function insertBlock(text, f, t) {
    const s = editor.selectionStart, v = editor.value;
    const nl = s > 0 && v[s - 1] !== "\n" ? "\n" : "";
    editor.value = v.slice(0, s) + nl + text + v.slice(s);
    const base = s + nl.length;
    editor.setSelectionRange(base + (f || 0), base + (t || 0));
    editor.focus(); scheduleRender();
  }

  const MD = {
    bold:   () => wrapSelection("**", "**", "加粗文本"),
    italic: () => wrapSelection("*", "*", "斜体文本"),
    strike: () => wrapSelection("~~", "~~", "删除线"),
    code:   () => wrapSelection("`", "`", "code"),
    h1:     () => linePrefix("# "),
    h2:     () => linePrefix("## "),
    h3:     () => linePrefix("### "),
    quote:  () => linePrefix("> "),
    ul:     () => linePrefix("- "),
    ol:     () => linePrefix("1. "),
    task:   () => linePrefix("- [ ] "),
    link:   () => wrapSelection("[", "](https://)", "链接文字"),
    image:  () => pickImage(),
    table:  () => insertBlock("\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| A | B | C |\n| D | E | F |\n", 0, 0),
    formula:() => insertBlock("\n$$\nE = mc^2\n$$\n", 5, 5),
    hr:     () => insertBlock("\n---\n", 0, 0),
  };
  document.querySelectorAll("[data-md]").forEach((b) =>
    b.addEventListener("click", () => MD[/** @type {HTMLElement} */(b).dataset.md] && MD[/** @type {HTMLElement} */(b).dataset.md]()));

  /* ---------- 前进/返回：统一导航历史（文档/标签跳转 + 文件内光标位置）----------
     navStack 记录"导航点" {tabId, offset, scrollTop}：标签切换/链接打开/点击定位时即时记；
     文件内光标远距(>200 字)移动后防抖记一条（覆盖"编辑历史"）。返回/前进在栈内回溯，
     程序化跳转(navGo)期间 navSuppress 抑制再记录，避免自激；关闭标签后 navPrune 清理。 */
  let navStack = [];
  let navIdx = -1;
  let navSuppress = false;
  let navEditTimer = null;
  function updateNavBtns() {
    const b = /** @type {HTMLButtonElement} */ ($("nav-back")), f = /** @type {HTMLButtonElement} */ ($("nav-fwd"));
    if (b) b.disabled = navIdx <= 0;
    if (f) f.disabled = navIdx >= navStack.length - 1;
  }
  function navPush() {
    if (navSuppress) return;
    const at = activeTab(); if (!at) return;
    const pos = { tabId: at.id, offset: editor.selectionStart, scrollTop: editor.scrollTop };
    const cur = navStack[navIdx];
    // 去重：同标签且偏移/滚动几乎不变则不记
    if (cur && cur.tabId === pos.tabId && Math.abs(cur.offset - pos.offset) <= 2 && Math.abs(cur.scrollTop - pos.scrollTop) <= 4) return;
    navStack.length = navIdx + 1;                 // 截断前进历史
    navStack.push(pos);
    while (navStack.length > 500) navStack.shift(); // C6: 长度封顶，防长会话无界增长
    navIdx = navStack.length - 1;
    updateNavBtns();
  }
  function navPrune() {
    const n = navStack.filter((p) => tabs.some((x) => x.id === p.tabId));
    if (n.length === navStack.length) return;
    navStack = n;
    if (!navStack.length) navIdx = -1;
    else if (navIdx >= navStack.length) navIdx = navStack.length - 1;
    updateNavBtns();
  }
  async function navGo(idx) {
    if (idx < 0 || idx >= navStack.length) return;
    const pos = navStack[idx];
    if (!tabs.some((x) => x.id === pos.tabId)) { navPrune(); return; }
    navSuppress = true;
    try {
      if (pos.tabId !== activeId) switchTab(pos.tabId);
      editor.setSelectionRange(pos.offset, pos.offset);
      editor.scrollTop = pos.scrollTop;
      editor.focus();
    } finally { navIdx = idx; navSuppress = false; updateNavBtns(); }
  }
  function navBack() { if (navIdx > 0) navGo(navIdx - 1); }
  function navFwd() { if (navIdx < navStack.length - 1) navGo(navIdx + 1); }
  function navOnEdit() {
    if (navSuppress) return;
    clearTimeout(navEditTimer);
    navEditTimer = setTimeout(() => {
      const at = activeTab(); if (!at) return;
      const cur = navStack[navIdx];
      const off = editor.selectionStart;
      const v = editor.value;
      const newLine = v.slice(0, off).split("\n").length;
      // 记录每步编辑操作的位置：不同标签，或换了行（同行连续输入合并为一条，避免逐字符淹没）
      const sameLine = cur && cur.tabId === at.id && v.slice(0, cur.offset).split("\n").length === newLine;
      if (!sameLine) navPush();
    }, 350);
  }
  // 自定义撤销/重做栈（textarea execCommand 在 WKWebView 不可靠——一次全退回，改自建快照栈）
  let undoStack = [], redoStack = [];
  let undoLast = { v: "", s: 0, e: 0 };
  let undoTimer = 0;
  // 按总字节预算封顶（C4）：仅按条数 500 限不住大文档——5MB 文档 × 数百步全量快照可吃掉 GB 级内存致 OOM。
  // 超预算则丢最旧（FIFO），保证内存有界；条数上限 500 仍作硬上限保留。
  const UNDO_BYTE_BUDGET = 48 * 1024 * 1024;
  function trimUndoBytes(stack) {
    let bytes = 0;
    for (const e of stack) bytes += (e.v ? e.v.length : 0);
    while (stack.length > 1 && bytes > UNDO_BYTE_BUDGET) {
      const dropped = stack.shift();
      bytes -= (dropped.v ? dropped.v.length : 0);
    }
  }
  function undoSnapshot() {
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      if (editor.value !== undoLast.v) {
        undoStack.push(undoLast);
        if (undoStack.length > 500) undoStack.shift();
        trimUndoBytes(undoStack); // C4: 按字节预算封顶
        redoStack = [];
      }
      undoLast = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
    }, 200); // 200ms 合并：连续快速输入=一步，停顿>200ms=新的一步（细粒度）
  }
  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push({ v: editor.value, s: editor.selectionStart, e: editor.selectionEnd });
    trimUndoBytes(redoStack); // C4: redoStack 同样受限（原本无任何上限）
    const p = undoStack.pop();
    editor.value = p.v; editor.setSelectionRange(p.s, p.e || p.s); undoLast = p;
    editor.focus(); scheduleRender();
  }
  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push({ v: editor.value, s: editor.selectionStart, e: editor.selectionEnd });
    trimUndoBytes(undoStack); // C4
    const n = redoStack.pop();
    editor.value = n.v; editor.setSelectionRange(n.s, n.e || n.s); undoLast = n;
    editor.focus(); scheduleRender();
  }
  function resetUndo() {
    clearTimeout(undoTimer); // 清掉前一个标签遗留的待入栈快照（L7），避免切标签后误压入新标签栈
    undoStack = []; redoStack = [];
    undoLast = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
  }
  (function initNav() {
    const u = $("undo-btn"), r = $("redo-btn");
    if (u) u.addEventListener("click", (e) => { e.preventDefault(); doUndo(); });
    if (r) r.addEventListener("click", (e) => { e.preventDefault(); doRedo(); });
    editor.addEventListener("input", undoSnapshot); // 编辑→快照入撤销栈
    editor.addEventListener("keyup", navOnEdit);
    editor.addEventListener("click", navOnEdit);
    // Ctrl+Z / Ctrl+Y 拦截→自定义撤销/重做（拦截 textarea 原生 undo，避免两套冲突）
    editor.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); doRedo(); }
    });
    // 导航历史（编辑位置跳转）仍由 Alt+← / Alt+→ 触发
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
        if (e.key === "ArrowLeft") { e.preventDefault(); navBack(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); navFwd(); }
      }
    });
  })();

  /* ---------- 文件名 / 视图 ---------- */
  function setFileName(name) {
    const tab = activeTab();
    const n = name || t("untitled");
    if (tab) tab.name = n;
    document.title = n + " — MDeX";
    renderTabs();
  }
  // 视图模式轮换按钮：分屏 → 仅编辑 → 仅预览 → 分屏
  const VIEW_MODES = ["split", "editor", "preview"];
  let curViewMode = "split";
  function refreshViewLabel() {
    const vm = $("view-mode");
    if (!vm) return;
    vm.textContent = curViewMode === "split" ? t("split")
      : curViewMode === "editor" ? t("editorOnly") : t("previewOnly");
  }
  function setViewMode(mode) {
    clearColSel();
    clearTimeout(renderTimer); // C10: 切视图模式时取消待渲染（下方按需直接 render()）
    const wasEditor = curViewMode === "editor";
    curViewMode = mode;
    main.classList.remove("view-split", "view-editor", "view-preview");
    main.classList.add("view-" + mode);
    refreshViewLabel();
    // 从「仅编辑」切回含预览的视图，且预览曾被跳过时，补一次渲染
    if (wasEditor && mode !== "editor" && previewDirty) render();
  }
  $("view-mode").addEventListener("click", () => {
    const idx = VIEW_MODES.indexOf(curViewMode);
    setViewMode(VIEW_MODES[(idx + 1) % VIEW_MODES.length]);
  });

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("md-theme", dark ? "dark" : "light"); } catch (_) {}
    refreshDynamicLabels();
    // mermaid 主题跟随：重新初始化并重渲（SVG 配色是渲染时烘焙的，需重渲才更新）
    initMermaid();
    scheduleRender();
  }
  $("theme-btn").addEventListener("click", toggleTheme);
  $("sync-btn").addEventListener("click", () => {
    syncScroll = !syncScroll;
    refreshDynamicLabels();
  });

  /* ---------- 文件操作 ---------- */
  // 同时认 / 与 \：Windows 下 Rust 返回的是反斜杠绝对路径（C:\Users\...），仅按 / 切会得到空目录
  // → tab.dir 为空 → resolveImages 的 !dir 守卫跳过所有相对路径图（BUG-080）。
  function dirOf(p) { const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i >= 0 ? p.slice(0, i) : ""; }
  function baseName(p) { const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i >= 0 ? p.slice(i + 1) : p; }

  /* ---------- 多标签页 ---------- */
  // 示例文档版本：模板内容有实质改动时 bump。启动恢复会话时，自动把过期的示例标签
  // 内容刷新为最新模板（仅限带 sample 标记且未另存为文件的标签；用户自有文档永不触碰）。
  const SAMPLE_VER = 2;
  function createTab(opts) {
    const tab = {
      id: nextId++,
      name: opts.name || t("untitled"),
      path: opts.path || "",
      dir: opts.dir || "",
      content: opts.content != null ? opts.content : "",
      type: opts.type || "md", // "md" | "html"：决定 render() 走 Markdown 还是 HTML 渲染
      bibText: opts.bibText || "", // 加载的 .bib 文献库内容（参考文献渲染用）
      sample: opts.sample || null, // {kind,ver}：标记为内置示例文档（cite/mermaid/mdex），便于模板更新后自动刷新
      imgDir: opts.imgDir || null, // 本标签粘贴图片的落盘目录（草稿=缓存临时目录，已保存=<文档目录>/<文件名>_images）
      imgSub: opts.imgSub || null, // markdown 里写的引用前缀（草稿=绝对路径，已保存=<文件名>_images）
      dirty: false,
      scrollTop: 0,
      selStart: 0,
      selEnd: 0,
    };
    tabs.push(tab);
    return tab;
  }
  // 按文件名扩展名判定文档类型
  function fileTypeOf(name) {
    return /\.(html?|xhtml)$/i.test(name || "") ? "html" : "md";
  }

  function renderTabs() {
    const bar = $("tabs");
    bar.innerHTML = "";
    tabs.forEach((tab) => {
      const el = document.createElement("div");
      el.className = "tab" + (tab.id === activeId ? " active" : "");
      el.title = tab.path || tab.name;
      if (tab.dirty) {
        const dot = document.createElement("span");
        dot.className = "tab-dirty";
        el.appendChild(dot);
      }
      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tab.name;
      el.appendChild(name);
      const close = document.createElement("button");
      close.className = "tab-close";
      close.title = t("closeFile");
      close.textContent = "×";
      close.addEventListener("click", (e) => { e.stopPropagation(); closeTab(tab.id); });
      el.appendChild(close);
      el.addEventListener("click", () => switchTab(tab.id));
      el.addEventListener("mousedown", (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
      bar.appendChild(el);
    });
    updateEmptyState();
  }

  // 空状态切换：所有标签都关闭后，主区域不再自动新建「未命名」空白标签，
  // 改为显示居中提示「请打开或创建一个 Markdown 文件」；重新打开/新建文件时自动恢复。
  // 在 renderTabs 末尾调用，覆盖所有增删/切换/语言变更路径（renderTabs 是标签变更的统一收口）。
  function updateEmptyState() {
    const empty = tabs.length === 0;
    const mainEl = $("main");
    if (mainEl) mainEl.classList.toggle("no-tabs", empty);
    if (empty) {
      activeId = null;
      document.title = "MDeX";
      editor.value = "";
      const pv = $("preview");
      if (pv) pv.innerHTML = "";
    }
  }

  // 切换前把当前编辑器状态存回活动标签，再载入目标标签
  function switchTab(id) {
    if (id === activeId) return;
    clearTimeout(renderTimer); // C10: 取消旧标签的待渲染，避免切标签后旧防抖回调多余触发/短暂串内容
    liveViewers = []; // C11: 切标签清空 mermaid 查看器跟踪（旧 offset 指向旧标签块，留着只会向无关窗口发 IPC）
    const cur = activeTab();
    if (cur) {
      cur.content = editor.value;
      cur.scrollTop = editor.scrollTop;
      cur.selStart = editor.selectionStart;
      cur.selEnd = editor.selectionEnd;
    }
    activeId = id;
    loadTab(activeTab());
    renderTabs();
    saveDraft();
    navPush(); // 记录导航点（程序化切换由 navSuppress 抑制）
  }

  function loadTab(tab) {
    clearColSel();
    if (!tab) { editor.value = ""; updateStats(); updateCursor(); return; }
    resetUndo(); // 切标签→重置撤销/重做栈（每个标签独立 undo 上下文）
    editor.value = tab.content;
    editor.setSelectionRange(tab.selStart || 0, tab.selEnd || 0);
    document.title = tab.name + " — MDeX";
    // 延后一帧再渲染预览：先让编辑器文本绘制出来（大文件下用户立刻看到内容），
    // 随后才进入较重的预览渲染，避免打开时整窗卡住几秒。
    requestAnimationFrame(() => render());
    if (tab.scrollTop) editor.scrollTop = tab.scrollTop;
    updateCursor();
    updateStats(); // 立即刷新底部状态栏（文件绝对路径），不等 rAF 渲染
    // 切标签时同步文献库徽标条数
    {
      let n = 0;
      if (window.BibTeXParser && tab.bibText && tab.bibText.trim()) {
        try { n = ((window.BibTeXParser.parse(tab.bibText, { sentenceCase: false }) || {}).entries || []).length; } catch (e) {}
      }
      updateBibBadge(n);
    }
  }

  function markDirty() {
    const tab = activeTab();
    if (tab && !tab.dirty) { tab.dirty = true; renderTabs(); }
  }

  function newFile() {
    const tab = createTab({ content: "" });
    switchTab(tab.id);
    editor.focus();
  }

  // 未保存关闭确认弹窗。返回 "cancel" | "discard" | "save"。
  // 用自绘弹窗而非原生 confirm()：Tauri WKWebView 下 confirm() 行为不稳定，
  // 且三按钮（取消/不保存/保存）比浏览器二选一更符合编辑器习惯。
  let confirmClosePending = null; // C2: 重入守卫——已有未决弹窗时，新调用先把旧 promise 以 "cancel" 兜底 resolve
  function confirmCloseDialog() {
    return new Promise((resolve) => {
      // C2: 防重入。两次快速触发关闭（如连按 ⌘W、或弹窗期间中键关另一标签）时，旧 promise 会因
      // onclick 被新调用覆盖而永不 resolve，导致 closeTab 续体悬挂、捕获的 idx 陈旧化（叠加 C1 风险）。
      // 新调用先把旧 promise 以 "cancel" 兜底 resolve（C1 已用 indexOf 重定位，安全）。
      if (confirmClosePending) { const prev = confirmClosePending; confirmClosePending = null; prev("cancel"); }
      const mask = $("confirm-mask");
      $("confirm-msg").textContent = t("confirmClose");
      $("confirm-cancel").textContent = t("cancel");
      $("confirm-discard").textContent = t("dontSave");
      $("confirm-save").textContent = t("save");
      mask.hidden = false;
      const done = (v) => { mask.hidden = true; cleanup(); confirmClosePending = null; resolve(v); };
      const onMask = (e) => { if (e.target === mask) done("cancel"); };
      const onKey = (e) => { if (e.key === "Escape") done("cancel"); };
      function cleanup() {
        $("confirm-cancel").onclick = null;
        $("confirm-discard").onclick = null;
        $("confirm-save").onclick = null;
        mask.removeEventListener("click", onMask);
        document.removeEventListener("keydown", onKey);
      }
      $("confirm-cancel").onclick = () => done("cancel");
      $("confirm-discard").onclick = () => done("discard");
      $("confirm-save").onclick = () => done("save");
      mask.addEventListener("click", onMask);
      document.addEventListener("keydown", onKey);
      $("confirm-discard").focus();
      confirmClosePending = resolve;
    });
  }

  // D8 外部修改检测：保存时发现磁盘 mtime 变了，弹"覆盖 / 从磁盘重载 / 取消"。
  // 复用 confirm-mask 三按钮 DOM（与关闭确认弹窗互斥——关闭确认已在保存前结束），各自维护 pending 守卫。
  let confirmOverwritePending = null;
  function confirmOverwriteDialog() {
    return new Promise((resolve) => {
      if (confirmOverwritePending) { const p = confirmOverwritePending; confirmOverwritePending = null; p(null); }
      const mask = $("confirm-mask");
      $("confirm-msg").textContent = t("fileChangedOnDisk");
      $("confirm-cancel").textContent = t("cancel");
      $("confirm-discard").textContent = t("reload");
      $("confirm-save").textContent = t("overwrite");
      mask.hidden = false;
      const done = (v) => { mask.hidden = true; cleanup(); confirmOverwritePending = null; resolve(v); };
      const onMask = (e) => { if (e.target === mask) done(null); };
      const onKey = (e) => { if (e.key === "Escape") done(null); };
      function cleanup() {
        $("confirm-cancel").onclick = null;
        $("confirm-discard").onclick = null;
        $("confirm-save").onclick = null;
        mask.removeEventListener("click", onMask);
        document.removeEventListener("keydown", onKey);
      }
      $("confirm-cancel").onclick = () => done(null);          // 取消
      $("confirm-discard").onclick = () => done("reload");     // 从磁盘重载
      $("confirm-save").onclick = () => done("overwrite");     // 覆盖保存
      mask.addEventListener("click", onMask);
      document.addEventListener("keydown", onKey);
      $("confirm-cancel").focus(); // 默认聚焦"取消"，避免误触覆盖
      confirmOverwritePending = resolve;
    });
  }

  // D8：记录标签文件当前的磁盘 mtime（打开/另存为/会话恢复后调用，作为"外部是否改动"的基线）。
  function recordMtime(tab) {
    if (!tab || !tab.path || !isTauri) return;
    invoke("file_mtime", { path: tab.path }).then((m) => { if (m != null) tab.mtime = m; }).catch(() => {});
  }

  async function closeTab(id) {
    const tab = tabs.find((x) => x.id === id);
    if (!tab) return;
    if (tab.dirty) {
      const choice = await confirmCloseDialog();
      if (choice === "cancel") return;
      if (choice === "save") {
        // 保存作用于被关闭的标签：先切到它，再显式传 tab 走源文件保存（避免 await 期间切标签存错——C7）
        if (activeId !== id) switchTab(id);
        const ok = await saveFile(tab);
        if (!ok || tab.dirty) return; // 保存被取消/失败 → 不关闭
      }
    }
    // await 之后标签数组可能已被其它异步路径（拖入文件、focus-file 等）改变，
    // 用对象引用重新定位（C1），避免 splice 到错误标签而销毁未保存内容。
    clearTimeout(renderTimer); // C10: 关闭前取消待渲染，防止在飞行渲染回写已关闭标签的预览
    const idx = tabs.indexOf(tab);
    if (idx < 0) return; // 已被其它路径移除，无需再处理
    tabs.splice(idx, 1);
    // C8: 注销/清理失败不再纯静默——至少打 console，便于发现"幽灵窗口登记/临时目录残留"
    if (tab.path && isTauri) invoke("unregister_file", { path: tab.path }).catch((e) => console.warn("unregister_file failed:", e));
    // 未保存草稿：清理其临时图片目录（已保存的图片在文档目录，不动）
    if (!tab.path && tab.imgDir && isTauri) invoke("remove_dir", { path: tab.imgDir }).catch((e) => console.warn("remove_dir failed:", e));
    if (activeId === id) {
      if (tabs.length === 0) {
        // 最后一个标签已关闭：进入空状态（显示「请打开或创建…」提示），不再自动新建空白标签。
        activeId = null;
        loadTab(null);
      } else {
        activeId = tabs[Math.min(idx, tabs.length - 1)].id;
        loadTab(activeTab());
      }
    }
    renderTabs(); // → updateEmptyState() 显示空状态或恢复编辑区
    saveDraft();
    navPrune(); // 清理已关闭标签的导航点
  }

  // 工具栏/菜单「关闭」= 关闭当前标签
  function closeFile() {
    if (activeId != null) closeTab(activeId);
  }

  async function openFile() {
    if (isTauri) {
      try {
        const data = await invoke("pick_and_read");
        if (data) {
          const path = data.path || "";
          // D4：已在别的窗口打开 → claim_file 已置顶那个窗口并切标签，本窗口不重复打开
          if (path && isTauri && await invoke("claim_file", { path }).catch(() => false)) return;
          const dup = path ? tabs.find((x) => x.path === path) : null;
          if (dup) { switchTab(dup.id); return; }
          const tab = createTab({
            name: data.name || t("untitled"),
            path,
            dir: dirOf(path),
            content: data.content,
            type: fileTypeOf(data.name),
          });
          switchTab(tab.id);
          toast(t("opened") + tab.name);
          recordMtime(tab); // D8: 记录打开时的磁盘 mtime 作为外部修改检测基线
        }
      } catch (e) { toast(t("openFail") + e); }
    } else {
      fileInput.accept = ".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html";
      fileInput.onchange = () => { const f = fileInput.files[0]; if (f) readBrowser(f); fileInput.value = ""; };
      fileInput.click();
    }
  }
  function readBrowser(file) {
    const r = new FileReader();
    r.onload = () => {
      const tab = createTab({ name: file.name, content: r.result, type: fileTypeOf(file.name) });
      switchTab(tab.id);
    };
    r.readAsText(file);
  }

  // 加载 .bib 文献库到当前标签（渲染 [@key] 引用与文末参考文献表）
  async function loadBib() {
    const tab = activeTab();
    if (!tab) return;
    let content = "";
    if (isTauri) {
      try {
        const data = await invoke("pick_and_read_bib");
        if (!data) return; // 用户取消
        content = data.content || "";
      } catch (e) { toast(t("bibLoadFail") + (e && e.message ? e.message : e)); return; }
    } else {
      const f = await new Promise((resolve) => {
        fileInput.accept = ".bib,.txt,text/x-bibtex";
        fileInput.onchange = () => { const x = fileInput.files[0]; fileInput.value = ""; resolve(x); };
        fileInput.click();
      });
      if (!f) return;
      content = await new Promise((resolve) => {
        const r = new FileReader(); r.onload = () => resolve(/** @type {string} */ (r.result)); r.readAsText(f);
      });
    }
    tab.bibText = content;
    // 预解析统计条目数（失败也保留文本，渲染时 parseBib 会再试）
    let n = 0;
    if (window.BibTeXParser && content.trim()) {
      try { n = ((window.BibTeXParser.parse(content, { sentenceCase: false }) || {}).entries || []).length; }
      catch (e) { toast(t("bibLoadFail") + (e && e.message ? e.message : e)); }
    }
    updateBibBadge(n);
    render();
    toast(t("bibLoaded").replace("{n}", String(n)));
  }
  // 更新工具栏徽标显示当前库条目数
  function updateBibBadge(n) {
    const el = $("bib-count");
    if (el) el.textContent = n > 0 ? " " + n : "";
  }
  // 卸载当前标签的外挂文献库（不影响内嵌 ```bibtex 块）
  function unloadBib() {
    const tab = activeTab();
    if (!tab) return;
    if (!tab.bibText || !tab.bibText.trim()) { toast(t("bibEmpty")); return; }
    tab.bibText = "";
    updateBibBadge(0);
    render();
    toast(t("bibUnloaded"));
  }

  // 载入文献引用示例到新标签（含内嵌 bibtex 块，开箱即渲染）
  function openCiteExample() {
    const content = getSampleDoc("cite");
    const tab = createTab({ name: "cite-example.md", content, type: "md", sample: { kind: "cite", ver: SAMPLE_VER } });
    switchTab(tab.id);
    renderTabs();
    toast(t("opened") + tab.name);
  }

  // 载入 Mermaid 图示例到新标签（流程图/时序图/类图/甘特图/饼图等，开箱即渲染）
  function openMermaidExample() {
    const content = getSampleDoc("mermaid");
    const tab = createTab({ name: "mermaid-example.md", content, type: "md", sample: { kind: "mermaid", ver: SAMPLE_VER } });
    switchTab(tab.id);
    renderTabs();
    toast(t("opened") + tab.name);
  }

  // 载入 MDeX 简介/示例文档到新标签（即安装后自动显示的欢迎文档，可随时从「帮助」菜单重新打开）
  function openMdexExample() {
    const tab = createTab({ name: "MDeX-example.md", content: getSampleDoc("mdex"), type: "md", sample: { kind: "mdex", ver: SAMPLE_VER }, dir: appIconPath ? appIconPath.replace(/[\/\\][^\/\\]*$/, "") : "" });
    switchTab(tab.id);
    renderTabs();
    toast(t("opened") + tab.name);
  }

  // 保存源文件。有路径就直写，无路径按 tab 类型走 md/html 另存为。
  // 返回是否真正落盘（用于关闭前保存：取消/失败则不关闭）。
  // 保存当前标签。可显式传入 specificTab（关闭确认流程用，避免读取 activeTab() 在 await 后跑偏——C7）。
  async function saveFile(specificTab) {
    const tab = specificTab || activeTab();
    if (!tab) return false;
    if (tab.path && isTauri) {
      try {
        // D8 外部修改检测：保存前比对磁盘 mtime。被外部程序改过则弹"覆盖/重载/取消"，不静默覆盖。
        const cur = await invoke("file_mtime", { path: tab.path }).catch(() => null);
        if (tab.mtime && cur && cur !== tab.mtime) {
          const choice = await confirmOverwriteDialog();
          if (!choice || choice === "cancel") return false;       // 取消：不保存
          if (choice === "reload") {                              // 重载：丢弃编辑，读回磁盘版本
            const content = await invoke("read_file_at", { path: tab.path });
            editor.value = content; tab.content = content; tab.dirty = false;
            tab.mtime = await invoke("file_mtime", { path: tab.path }).catch(() => tab.mtime) || tab.mtime;
            renderTabs(); scheduleRender(); toast(t("reloaded"));
            return false;
          }
          // choice === "overwrite" → 继续写盘
        }
        await invoke("write_file_at", { path: tab.path, content: editor.value });
        tab.content = editor.value; tab.dirty = false;
        // D8：写后更新基线 mtime，避免下次保存因本次写入触发的 mtime 变化误报。
        const after = await invoke("file_mtime", { path: tab.path }).catch(() => null);
        if (after != null) tab.mtime = after;
        renderTabs(); toast(t("saved"));
        return true;
      } catch (e) { toast(t("saveFail") + e); return false; }
    }
    return tab && tab.type === "html" ? saveAsHtml() : saveAsMarkdown();
  }
  // 文档保存到 newPath 时安置图片：
  //   草稿首存(oldPath 空) → 移动临时图片目录到 <newDir>/<stem>_images（消费临时目录），绝对引用重写为相对
  //   另存为副本(oldPath 有) → 扫描 markdown 里【所有相对图片引用】，把引用到的图片文件夹/散图
  //     从 oldDir 拷到 newDir（保留原件；不重写引用，引用仍按相对路径在新目录有效）
  // 草稿临时目录重名 → 自动改名 <stem>_images_N 并提示。
  // 扫描 editor.value 里所有 ![](path) 图片引用，按 oldDir 解析后拷到 targetDir(扁平) + 改写为 targetSub/名。
  // 相对路径无 oldDir 时跳过(无法解析)。返回是否有引用被改写。供 placeImagesOnSave 首存(示例图标等)与另存为共用。
  async function scanCopyImages(targetDir, targetSub, oldDir) {
    const exists = (p) => invoke("path_exists", { path: p }).catch(() => false);
    const usedNames = new Set();
    const refMap = Object.create(null);
    const re = /!\[[^\]]*\]\(([^)]+)\)/g;
    let mm;
    while ((mm = re.exec(editor.value))) {
      const p = (mm[1] || "").split(/\s+/)[0].replace(/^<|>$/g, "");
      if (refMap[p] !== undefined) continue;
      let decoded = p;
      try { decoded = decodeURIComponent(decoded); } catch (_) {}
      if (!decoded || /^(data:|https?:|blob:|asset:|mailto:|#)/i.test(decoded)) { refMap[p] = p; continue; }
      const isAbs = decoded.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(decoded);
      if (!isAbs && !oldDir) { refMap[p] = p; continue; }
      const src = isAbs ? decoded : (oldDir + "/" + decoded);
      const origName = baseName(decoded);
      let finalName = origName;
      let n2 = 2;
      while (usedNames.has(finalName) || (src !== targetDir + "/" + finalName && await exists(targetDir + "/" + finalName))) {
        finalName = origName.replace(/^([^.]*)(\.[^.]+)?$/, (_, s, e) => s + "_" + n2++ + (e || ""));
      }
      usedNames.add(finalName);
      const dst = targetDir + "/" + finalName;
      let copied = (src === dst);
      if (!copied) { try { if (await exists(src)) { await invoke("copy_file", { from: src, to: dst }); copied = true; } } catch (_) {} }
      // 仅拷贝成功（或已在目标处）才改写引用；失败保留原引用，避免写出指向不存在图片的 <stem>_images/ 断链路径
      refMap[p] = imgRefAfterSave(copied, targetSub, finalName, p);
    }
    let changed = false;
    for (const p in refMap) {
      if (refMap[p] !== p) { editor.value = editor.value.split("](" + p).join("](" + refMap[p]); changed = true; }
    }
    return changed;
  }
  // 文档保存到 newPath 时安置图片（草稿首存移动临时目录 / 另存为副本拷贝）。
  // 返回 true=所有关键写入（move_dir / 引用回写）成功；false=有关键失败——
  // 调用方据此保持 dirty=true 并告警，避免"已保存"提示掩盖图片引用已断（D7）。
  async function placeImagesOnSave(tab, oldPath, newPath) {
    if (!isTauri) return true;
    let ok = true;
    // 回写文件：失败记为关键失败（ok=false），不再静默吞错。
    const tryWrite = async (p, c) => {
      try { await invoke("write_file_at", { path: p, content: c }); }
      catch (_) { ok = false; }
    };
    const newDir = dirOf(newPath);
    const newStem = (baseName(newPath).replace(/\.[^.]+$/, "")) || "doc";

    // —— 草稿首存：移动临时目录 ——
    if (!oldPath) {
      if (!tab.imgDir) {
        // 无粘贴图片临时目录：但可能有其它图片引用(如示例图标 mdex_icon.png, 相对 tab.dir)，
        // 扫描拷到 <stem>_images/ + 改相对, 使保存后跨系统可移植(图标随文档走)
        const targetDir = newDir + "/" + newStem + "_images";
        const targetSub = newStem + "_images";
        if (await scanCopyImages(targetDir, targetSub, tab.dir || "")) {
          tab.content = editor.value;
          await tryWrite(newPath, editor.value);
        }
        tab.imgDir = targetDir; tab.imgSub = targetSub;
        return ok;
      }
      let newImgDir = newDir + "/" + newStem + "_images";
      let newImgSub = newStem + "_images";
      if (newImgDir === tab.imgDir) return ok;
      let renamed = false;
      try {
        if (await invoke("path_exists", { path: newImgDir })) {
          let n = 2;
          while (await invoke("path_exists", { path: newDir + "/" + newStem + "_images_" + n })) n++;
          newImgDir = newDir + "/" + newStem + "_images_" + n;
          newImgSub = newStem + "_images_" + n;
          renamed = true;
        }
      } catch (_) {}
      // 整个图片目录迁移失败 → 关键失败（不能让 .md 引用指向已不存在的临时目录）。
      try { await invoke("move_dir", { from: tab.imgDir, to: newImgDir }); }
      catch (_) { return false; }
      if (renamed) toast(imgI18n().renamed.replace("{n}", newImgSub));
      if (tab.imgSub && tab.imgSub !== newImgSub) {
        editor.value = editor.value.split(tab.imgSub + "/").join(newImgSub + "/");
        tab.content = editor.value;
        await tryWrite(newPath, editor.value);   // 改写引用后回写；失败则 ok=false
      }
      tab.imgDir = newImgDir; tab.imgSub = newImgSub;
      return ok;
    }

    // —— 另存为副本(oldPath 有)：引用到的每张图片拷到 <newDir>/<newStem>_images/（扁平，不拷文件夹），
    //    重名自动改名 _2/_3，markdown 引用同步改为 <newStem>_images/<名> ——
    const oldDir = dirOf(oldPath);
    const targetDir = newDir + "/" + newStem + "_images";
    const targetSub = newStem + "_images";
    const exists = (p) => invoke("path_exists", { path: p }).catch(() => false);
    const usedNames = new Set();          // 本批已用的目标文件名（防同批重名）
    const refMap = Object.create(null);   // 原引用 path → 新引用 targetSub/名（去重：同源只拷一次）
    const re = /!\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(editor.value))) {
      const p = (m[1] || "").split(/\s+/)[0].replace(/^<|>$/g, "");
      if (refMap[p] !== undefined) continue;            // 同一原引用已处理
      let decoded = p;
      try { decoded = decodeURIComponent(decoded); } catch (_) {}
      if (!decoded || /^(data:|https?:|blob:|asset:|mailto:|#)/i.test(decoded)) { refMap[p] = p; continue; }
      const isAbs = decoded.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(decoded);
      const src = isAbs ? decoded : (oldDir + "/" + decoded); // 绝对路径用其自身，相对路径按文档目录拼
      const origName = baseName(decoded);
      let finalName = origName;
      // 重名：本批已用 或 目标已存在（且非源自身）→ _2/_3
      let n = 2;
      while (usedNames.has(finalName) || (src !== targetDir + "/" + finalName && await exists(targetDir + "/" + finalName))) {
        finalName = origName.replace(/^([^.]*)(\.[^.]+)?$/, (_, s, e) => s + "_" + n++ + (e || ""));
      }
      usedNames.add(finalName);
      const dst = targetDir + "/" + finalName;
      let copied = (src === dst);
      if (!copied) {
        // 源图找不到 → 记关键失败（ok=false，调用方会提示"保存失败 images"）；拷成功则 copied=true。继续处理其余图片。
        try { if (await exists(src)) { await invoke("copy_file", { from: src, to: dst }); copied = true; } else ok = false; }
        catch (_) { ok = false; }
      }
      // 仅拷贝成功（或已在目标处）才改写引用；失败保留原引用，避免把引用改写成指向不存在的 <stem>_images/ 断链路径
      refMap[p] = imgRefAfterSave(copied, targetSub, finalName, p);
    }
    // 应用引用替换（锚定 `](<path>`，避免子串误伤）并回写文件
    let changed = false;
    for (const p in refMap) {
      if (refMap[p] !== p) { editor.value = editor.value.split("](" + p).join("](" + refMap[p]); changed = true; }
    }
    if (changed) {
      tab.content = editor.value;
      await tryWrite(newPath, editor.value);
    }
    tab.imgDir = targetDir; tab.imgSub = targetSub;
    return ok;
  }
  // 仅 Markdown 的另存为（保存/关闭前保存的回退路径）。会更新标签身份。
  async function saveAsMarkdown() {
    const tab = activeTab();
    if (!tab) return false;
    if (isTauri) {
      const oldPath = tab.path; // 保存前路径：空=草稿首存(移动临时目录)；有=另存为副本(拷贝)
      try {
        const path = await invoke("save_as", { content: editor.value, defaultName: tab.name });
        if (!path) return false; // 用户取消
        // 图片文件夹随保存安置：草稿首存移动临时目录、另存为副本拷贝；重名自动改名
        const imgOk = await placeImagesOnSave(tab, oldPath, path);
        tab.path = path;
        tab.dir = dirOf(path);
        tab.name = baseName(path) || tab.name;
        tab.type = "md";
        tab.content = editor.value;
        tab.dirty = !imgOk;            // 图片安置失败则保持未保存，避免"已保存"掩盖断链（D7）
        recordMtime(tab);              // D8: 另存为新路径后记录该路径的 mtime 基线
        renderTabs();
        updateStats();
        document.title = tab.name + " — MDeX";
        toast(imgOk ? t("saved") : (t("saveFail") + " images"));
        return imgOk;
      } catch (e) { toast(t("saveFail") + e); return false; }
    }
    const blob = new Blob([editor.value], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, tab.name);
    tab.content = editor.value; tab.dirty = false; renderTabs();
    toast(t("downloaded") + tab.name);
    return true;
  }
  // 仅 HTML 的另存为（HTML 标签无路径时「保存」的回退）。会更新标签身份。
  async function saveAsHtml() {
    const tab = activeTab();
    if (!tab) return false;
    if (isTauri) {
      try {
        const base = (tab.name || t("untitled")).replace(/\.(md|markdown|tex|pdf|html?|txt)$/i, "");
        const path = await invoke("pick_save_path", { defaultName: base, format: "html" });
        if (!path) return false; // 用户取消
        await invoke("write_file_at", { path, content: editor.value });
        tab.path = path; tab.dir = dirOf(path); tab.name = baseName(path) || tab.name;
        tab.type = "html"; tab.content = editor.value; tab.dirty = false;
        recordMtime(tab); // D8
        renderTabs(); updateStats(); document.title = tab.name + " — MDeX"; toast(t("saved"));
        return true;
      } catch (e) { toast(t("saveFail") + e); return false; }
    }
    const blob = new Blob([editor.value], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, tab.name);
    tab.content = editor.value; tab.dirty = false; renderTabs();
    toast(t("downloaded") + tab.name);
    return true;
  }
  // 另存为格式选择弹窗。返回 "md" | "pdf" | "tex" | null(取消)。
  // macOS 的 NSSavePanel 不会显示「文件格式」下拉（tauri-plugin-dialog 只设 allowedContentTypes，
  // 不加 accessory view），因此无法在原生存盘对话框里选格式——改在弹对话框前先用自绘弹窗选好。
  function pickExportFormat() {
    return new Promise((resolve) => {
      const mask = $("format-mask");
      $("format-msg").textContent = t("pickFormat");
      mask.hidden = false;
      const done = (v) => { mask.hidden = true; cleanup(); resolve(v); };
      const onMask = (e) => { if (e.target === mask) done(null); };
      const onKey = (e) => { if (e.key === "Escape") done(null); };
      function cleanup() {
        $("format-actions").querySelectorAll("button").forEach((b) => { b.onclick = null; });
        $("format-close").onclick = null;
        mask.removeEventListener("click", onMask);
        document.removeEventListener("keydown", onKey);
      }
      $("format-actions").querySelectorAll("button").forEach((b) => {
        b.onclick = () => done(b.dataset.fmt);
      });
      $("format-close").onclick = () => done(null); // 右上角 × = 取消（与点遮罩/Esc 同效）
      mask.addEventListener("click", onMask);
      document.addEventListener("keydown", onKey);
    });
  }

  // 另存为（多格式：Markdown / PDF 矢量 / PDF 位图 / LaTeX）。
  //  - md：保存源文件，更新标签身份（同 saveAsMarkdown）
  //  - pdf/latex：导出一份副本，不改变当前标签身份（标签仍是其 Markdown 源）
  async function saveAs() {
    const tab = activeTab();
    if (!tab) return;
    const fmt = await pickExportFormat();
    if (!fmt) return; // 用户在格式选择弹窗取消
    if (isTauri) {
      // 矢量 PDF：由系统打印对话框「存储为 PDF」负责保存，不走 pick_save_path
      if (fmt === "pdf-vector") {
        exportPdfVector();
        return;
      }
      let path;
      try {
        // 默认文件名去掉旧扩展名，由后端按所选格式补扩展名
        const base = (tab.name || t("untitled")).replace(/\.(md|markdown|tex|pdf|html?|txt)$/i, "");
        path = await invoke("pick_save_path", { defaultName: base, format: fmt });
      } catch (e) { toast(t("saveFail") + e); return; }
      if (!path) return; // 用户在存盘对话框取消
      try {
        if (fmt === "tex") {
          // HTML 标签导出 LaTeX：先转 Markdown，再走 mdToLatex
          let src = tab.type === "html" ? htmlToMd(editor.value) : editor.value;
          const dir = path.replace(/[/\\][^/\\]*$/, "");
          const stem = baseName(path).replace(/\.[^.]+$/, "");
          // 方案B：mermaid 块预渲染成 PNG 落盘到 <stem>_figs/ 子文件夹，latex 用 \includegraphics(用户编译零依赖)
          const figsSub = stem + "_figs";
          const mermaidImgs = await renderMermaidForLatex(src, dir + "/" + stem + "_figs", figsSub);
          // 普通图片 ![](path)(如示例图标) 像 md 另存为: 拷到 <stem>_figs/ + 改引用为 _figs/名(与 mermaid 图统一)
          const oldDir = tab.dir || "";
          const imgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
          let mm;
          while ((mm = imgRe.exec(src))) {
            const origP = (mm[1] || "").split(/\s+/)[0].replace(/^<|>$/g, "");
            let p = origP;
            try { p = decodeURIComponent(p); } catch (_) {}
            if (!p || /^(data:|https?:|blob:|asset:|mailto:|#)/i.test(p)) continue;
            const isAbs = p.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(p);
            if (!isAbs && !oldDir) continue;
            const sp = isAbs ? p : (oldDir + "/" + p);
            const fn = baseName(p);
            try { if (await invoke("path_exists", { path: sp })) await invoke("copy_file", { from: sp, to: dir + "/" + figsSub + "/" + fn }); } catch (_) {}
            src = src.split("](" + origP).join("](" + figsSub + "/" + fn);
          }
          // 文献：内嵌 ```bibtex 块 + tab.bibText 解析成 thebibliography 内嵌文末(不另建 .bib)
          const bibSection = buildTexBibliography(src, tab);
          const tex = mdToLatex(src, mermaidImgs, bibSection);
          await invoke("write_file_at", { path, content: tex });
          toast(t("exported") + baseName(path));
        } else if (fmt === "html") {
          // 导出独立 HTML：body 用 marked 输出（$...$ 字面量保留，源码干净），
          // 数学由 KaTeX auto-render（内联 JS）打开时渲染。
          // 必须先把 $...$ / $$...$$ 抽出占位，否则 marked 会把公式里的 _ * 等当 Markdown 语法破坏。
          let srcHtml;
          if (tab.type === "html") {
            srcHtml = editor.value;
          } else {
            let text = editor.value;
            // 内嵌 bibtex 块 → 合并 tab.bibText 建库（导出 HTML 也要带文献表）
            const { text: textNoBib, embedded } = extractEmbeddedBib(text);
            text = textNoBib;
            const bibDB = buildBibDB(tab, embedded);
            const mathStore = [];
            text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m) => { mathStore.push(m); return "​MATH" + (mathStore.length - 1) + "​"; });
            text = text.replace(/\$([^\n$]+?)\$/g, (m) => { mathStore.push(m); return "​MATH" + (mathStore.length - 1) + "​"; });
            // 引用占位（在 marked 前，避免 [@key] 被 marked 触动；\cite 同理，见 BUG-029）
            let citeList;
            ({ src: text, citeList } = scanCitations(text));
            try { srcHtml = marked.parse(text); } catch (e) { srcHtml = text; }
            srcHtml = srcHtml.replace(/​MATH(\d+)​/g, (_m, i) => mathStore[+i] || "");
            // 还原引用 + 追加文献表（与预览一致）
            srcHtml = renderCitations(srcHtml, citeList, bibDB);
          }
          const content = buildStandaloneHtml(tab.name, srcHtml);
          await invoke("write_file_at", { path, content });
          toast(t("exported") + baseName(path));
        } else {
          // md：按源文件保存并更新身份
          const oldMdPath = tab.path; // 保存前路径（空=草稿首存 move；有=另存为副本 copy）
          await invoke("write_file_at", { path, content: editor.value });
          const imgOk = await placeImagesOnSave(tab, oldMdPath, path); // 图片文件夹随另存为拷贝/草稿首存迁移
          tab.path = path;
          tab.dir = dirOf(path);
          tab.name = baseName(path) || tab.name;
          tab.type = "md";
          tab.content = editor.value;
          tab.dirty = !imgOk;            // 图片安置失败则保持未保存（D7）
          recordMtime(tab);              // D8: 另存为新路径后记录 mtime 基线
          renderTabs();
          updateStats(); // 刷新底部状态栏（文件绝对路径随另存为更新）
          document.title = tab.name + " — MDeX";
          toast(imgOk ? t("saved") : (t("saveFail") + " images"));
        }
      } catch (e) { toast(t("saveFail") + (e && e.message ? e.message : e)); }
    } else {
      // 浏览器降级：仅下载 Markdown 源
      const blob = new Blob([editor.value], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, tab.name);
      tab.content = editor.value; tab.dirty = false; renderTabs();
      toast(t("downloaded") + tab.name);
    }
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- HTML ↔ Markdown 转换（档位二）---------- */
  // HTML → Markdown：turndown + GFM 插件。turndown 默认会转义 \ 和 _ 等，
  // 会破坏 LaTeX 公式（\frac→\\frac、下标 _0→\_0）；故对公式段($$…$$/$…$)内
  // 反转义这些字符，保证数学语法原样。
  function htmlToMd(html) {
    if (!window.TurndownService) return html;
    const ts = new TurndownService({
      headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-",
      emDelimiter: "*", strongDelimiter: "**", linkStyle: "inlined",
    });
    if (window.turndownPluginGfm && turndownPluginGfm.gfm) ts.use(turndownPluginGfm.gfm);
    let md = ts.turndown(html);
    // 公式段内还原被 turndown 转义的 \ _ * ` [ ]
    md = md.replace(/\$\$[\s\S]+?\$\$|\$[^\n$]+\$/g, (m) =>
      m.replace(/\\([\\_*`[\]])/g, "$1"));
    return md;
  }
  // 构建独立 HTML 文档：渲染后的内容 + 内联 CSS（预览排版/KaTeX/hljs），外部打开即有格式。
  // 构建独立 HTML：body 用含 $...$ 字面量的 HTML（非 KaTeX 渲染后的 span 堆，源码干净），
  // 数学公式由 KaTeX auto-render（CDN）在打开时渲染。CSS 内联排版/代码高亮，字体走 CDN。
  function buildStandaloneHtml(title, srcHtml) {
    let html = srcHtml || "";
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, {
        ADD_ATTR: ["target", "colspan", "rowspan", "align", "loading", "aria-hidden", "encoding"],
      });
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    if (window.hljs) {
      // mermaid 块跳过 hljs（保留原始源码供 mermaid 渲染，避免高亮 span 干扰）
      tpl.content.querySelectorAll("pre code:not([data-hl]):not(.language-mermaid)").forEach((el) => {
        try { hljs.highlightElement(el); } catch (_) {}
      });
    }
    const body = tpl.innerHTML;
    const sels = [":root", "#preview", ".katex", ".hljs", ".cite", ".bibliography", ".bibitem", ".biblist", ".bib-title", ".mermaid-wrap", ".mermaid-err"];
    let css = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const t = rule.cssText;
          if (t.includes("@font-face") || t.includes("data:")) continue;
          if (sels.some((s) => t.includes(s))) css += t + "\n";
        }
      } catch (e) {}
    }
    const KATEX_CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist";
    // 内联 KaTeX JS + auto-render（离线也能渲染）；字体走 CDN link（在线完美、离线回退）
    const katexSrc = (document.getElementById("katex-src") || {}).textContent || "";
    const arSrc = (document.getElementById("katex-autorender-src") || {}).textContent || "";
    // 内联 mermaid（离线渲染 ```mermaid 代码块）
    const mermaidSrc = (document.getElementById("mermaid-src") || {}).textContent || "";
    const mermaidBoot = mermaidSrc ?
      '<script>mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default")});<\/script>\n' +
      '<script>Array.from(document.querySelectorAll("pre code.language-mermaid")).forEach(function(el){var pre=el.parentElement,src=el.textContent;mermaid.render("mmd-"+Math.random().toString(36).slice(2),src).then(function(r){var d=document.createElement("div");d.className="mermaid-wrap";d.innerHTML=r.svg;pre.replaceWith(d);}).catch(function(e){var d=document.createElement("pre");d.className="mermaid-err";d.textContent=src+"\\n\\n"+(e&&e.message||e);pre.replaceWith(d);});});<\/script>\n' : "";
    return '<!DOCTYPE html>\n<html lang="' + (curLang || "zh") + '" dir="' + (RTL_LANGS.has(curLang) ? "rtl" : "ltr") + '">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' +
      escapeHtml(title || "MDeX") + '</title>\n' +
      '<link rel="stylesheet" href="' + KATEX_CDN + '/katex.min.css" crossorigin>\n' +
      '<style>\n' + css + '</style>\n</head>\n' +
      '<body style="background:var(--bg);color:var(--fg);font-family:var(--sans);margin:0;">\n' +
      '<article id="preview" style="max-width:820px;margin:40px auto;padding:0 24px;line-height:1.7;font-size:16px;">' +
      body + '</article>\n' +
      '<script>' + katexSrc + '<\/script>\n' +
      '<script>' + arSrc + '<\/script>\n' +
      '<script>renderMathInElement(document.getElementById("preview"),{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false,trust:false});<\/script>\n' +
      mermaidBoot +
      '</body>\n</html>\n';
  }
  // 当前标签 HTML→Markdown，切换为 md 模式
  function convertToMd() {
    const tab = activeTab();
    if (!tab) return;
    const md = htmlToMd(editor.value);
    editor.value = md;
    tab.type = "md";
    tab.dirty = true;
    renderTabs();
    render();
    toast(t("convertedMd"));
  }
  // 当前标签 Markdown→HTML（marked 生成标准 HTML，$...$ 作为文本保留），切换为 html 模式
  function convertToHtml() {
    const tab = activeTab();
    if (!tab) return;
    let html;
    try { html = marked.parse(editor.value); } catch (e) { html = editor.value; }
    editor.value = html;
    tab.type = "html";
    tab.dirty = true;
    renderTabs();
    render();
    toast(t("convertedHtml"));
  }

  /* ---------- 图片：选择 / 粘贴 / 拖拽 ----------
     Tauri 下统一落盘到该标签的图片目录、插入文件引用（保持 .md 源码干净，无 base64）：
       - 已保存文档：<文档目录>/<文件名>_images/，引用 ![name](<文件名>_images/name)（相对）
       - 未保存草稿：MDeX 缓存目录下 mdex_draft_images/<tabId>/（多草稿各自独立），引用绝对路径；
         文档保存时把该目录迁移到 <保存目录>/<文件名>_images 并重写引用为相对（见 migrateImagesOnSave）。
     预览由 resolveImages 按文档目录(相对)或直接(绝对)解析渲染。浏览器/落盘失败 → 回退 base64。 */
  let draftImgBase = ""; // 草稿图片临时目录基址（缓存 invoke 结果）
  function pickImage() {
    fileInput.accept = "image/*";
    fileInput.onchange = () => {
      const imgs = Array.from(fileInput.files || []).filter((f) => /^image\//.test(f.type));
      if (imgs.length) insertImages(imgs);
      fileInput.value = "";
    };
    fileInput.click();
  }
  function readImgDataUrl(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result || "");
      r.onerror = () => res("");
      r.readAsDataURL(file);
    });
  }
  function imgExtOf(file) {
    const m = (file.name || "").match(/\.([a-zA-Z0-9]+)$/);
    if (m) return m[1].toLowerCase();
    const tm = (file.type || "").match(/image\/([a-zA-Z0-9.+-]+)/);
    return tm ? tm[1].replace("jpeg", "jpg") : "png";
  }
  function insertMdAtCursor(md) {
    const s = editor.selectionStart;
    editor.value = editor.value.slice(0, s) + md + editor.value.slice(s);
    editor.setSelectionRange(s + md.length, s + md.length);
  }
  // 确保标签有图片目录（懒创建）：已保存→<dir>/<stem>_images；草稿→缓存下 mdex_draft_images/<tabId>。
  async function ensureImgDir(tab) {
    if (tab.imgDir) return tab.imgDir;
    if (!isTauri) return null;
    if (tab.path) {
      const stem = (baseName(tab.path).replace(/\.[^.]+$/, "")) || "doc";
      tab.imgDir = (tab.dir || dirOf(tab.path)) + "/" + stem + "_images";
      tab.imgSub = stem + "_images";
    } else {
      if (!draftImgBase) { try { draftImgBase = await invoke("draft_images_base"); } catch (_) { draftImgBase = ""; } }
      if (!draftImgBase) return null;
      // 按窗口隔离（D3）：各窗口 tabId 都从 1 开始，必须用 winLabel 隔层，
      // 否则两个窗口的草稿写到同一 <cache>/mdex_draft_images/1/，关闭其一时 remove_dir 会删掉对方的图。
      tab.imgDir = draftImgBase + "/" + winLabel + "/" + tab.id;
      tab.imgSub = tab.imgDir; // 草稿用绝对路径（无文档目录，resolveImages 直接读绝对路径）
    }
    return tab.imgDir;
  }
  async function insertImages(files) {
    const at = activeTab();
    const imgDir = (isTauri && at) ? await ensureImgDir(at) : null;
    // HTML 模式不用文件夹（D9）：HTML 内容里 ![]() 本就不渲染，落盘到缓存目录反而在保存时留下
    // 指向缓存的断链引用；改用 base64 内联，至少自包含。
    const useFolder = !!(imgDir && at && at.imgSub && at.type !== "html");
    let mdAcc = "", saved = 0;
    for (const file of files) {
      const dataUrl = await readImgDataUrl(file);
      const stem = ((file.name || "image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\s]/g, "_")) || "image";
      if (useFolder && dataUrl) {
        try {
          const b64 = dataUrl.split(",")[1] || "";
          const fname = stem + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "." + imgExtOf(file);
          await invoke("write_bytes_at", { path: imgDir + "/" + fname, data: b64 });
          mdAcc += `![${stem}](${at.imgSub}/${fname})\n\n`;
          saved++;
          continue;
        } catch (_) { /* 落 base64 回退 */ }
      }
      mdAcc += `![${stem}](${dataUrl})\n\n`; // 浏览器/落盘失败 → base64
    }
    if (mdAcc) {
      insertMdAtCursor(mdAcc);
      scheduleRender();
      toast(t("insImgPre") + (saved > 0 ? saved + "/" + files.length : files.length) + t("insImgSuf"));
    }
  }
  editor.addEventListener("paste", (e) => {
    const imgs = Array.from((e.clipboardData && e.clipboardData.items) || [])
      .filter((it) => /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
    if (imgs.length) { e.preventDefault(); insertImages(imgs); }
  });

  /* ---------- 拖拽（.md 打开 / 图片插入）---------- */
  let dragCnt = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragCnt++; document.body.classList.add("dragging"); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", () => { if (--dragCnt <= 0) { dragCnt = 0; document.body.classList.remove("dragging"); } });
  window.addEventListener("drop", (e) => {
    e.preventDefault(); dragCnt = 0; document.body.classList.remove("dragging");
    if (isTauri) return; // Tauri 由原生 DragDropEvent → "file-drop" 事件处理（HTML5 拿不到文件路径）
    const files = Array.from(e.dataTransfer && e.dataTransfer.files || []);
    const md = files.find((f) => /\.(md|markdown|txt|html?|xhtml)$/i.test(f.name));
    if (md) { readBrowser(md); return; }
    const imgs = files.filter((f) => /^image\//.test(f.type));
    if (imgs.length) insertImages(imgs);
  });

  /* ---------- Tauri 原生文件拖入（WKWebView HTML5 drop 拿不到路径，走原生事件）----------
     文档（.md/.txt/.html…）→ 新标签打开；图片 → 插入对该图片的【引用】（相对路径优先，无目录时用绝对路径），
     不再 base64 内嵌，预览由 resolveImages 按文档目录解析渲染。 */
  const DROP_DOC_EXT = /\.(md|markdown|txt|html?|xhtml)$/i;
  const DROP_IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?)$/i;
  function relPath(fromDir, toAbs) {
    if (!fromDir) return toAbs;
    // 按 [\\/] 切：同时认 Unix / 与 Windows \（fromDir/toAbs 可能混用分隔符，BUG-080）
    const a = fromDir.split(/[\\/]/), b = toAbs.split(/[\\/]/);
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let rel = b.slice(i).join("/"); let up = a.length - i; while (up-- > 0) rel = "../" + rel;
    return rel || ".";
  }
  async function openPath(path) {
    try {
      // D4：已被别的窗口占用 → 那个窗口已被 claim_file 置顶并切标签，本窗口不重复打开
      // （防同一文件在两窗口并发存盘互相覆盖）。本窗口已持有或未占用时 claim_file 返回 false。
      if (isTauri && await invoke("claim_file", { path }).catch(() => false)) return;
      const content = await invoke("read_file_at", { path });
      const dup = tabs.find((x) => x.path === path);
      if (dup) {
        switchTab(dup.id);
      } else {
        const name = baseName(path);
        const tab = createTab({ name, path, dir: dirOf(path), content, type: fileTypeOf(name) });
        switchTab(tab.id);
        toast(t("opened") + tab.name);
        recordMtime(tab); // D8: 记录打开时的磁盘 mtime 作为外部修改检测基线
      }
      // 登记到后端注册表：本窗口持有该文件（之后双击同一文件会置顶本窗口而非开新窗口）
      if (isTauri) invoke("register_file", { path }).catch(() => {});
    } catch (e) { toast(t("openFail") + e); }
  }
  // 渲染区点链接 → 解析为本地文件路径并在【新标签页】打开（不替换当前文档）。
  // 目录(./)、失效链接、外链(http 由 opener 处理)、mailto/锚点 不在此处理。
  async function openLinkInNewTab(href) {
    if (!isTauri) return;                 // 浏览器降级：无文件访问能力
    const at = activeTab();
    const baseDir = at ? (at.dir || "") : "";
    let path = null;
    try { path = await invoke("resolve_doc_link", { baseDir, href }); } catch (_) { path = null; }
    if (!path) return;                    // 解析不到已存在文件 → 忽略（不导航、不报错）
    await openPath(path);                 // openPath 内置去重(同 path 切到已有标签) + 新标签 + 导航记录
  }
  function insertImageRef(path) {
    const tab = activeTab();
    const alt = baseName(path).replace(/\.[^.]+$/, "");
    const ref = (tab && tab.dir) ? relPath(tab.dir, path) : path;
    const md = `![${alt}](${ref})\n\n`;
    const s = editor.selectionStart;
    editor.value = editor.value.slice(0, s) + md + editor.value.slice(s);
    editor.setSelectionRange(s + md.length, s + md.length);
  }
  async function handleDropPaths(paths) {
    document.body.classList.remove("dragging"); dragCnt = 0;
    const docs = paths.filter((p) => DROP_DOC_EXT.test(p));
    const imgs = paths.filter((p) => DROP_IMG_EXT.test(p));
    for (const p of docs) await openPath(p);   // 先打开文档
    if (imgs.length) { imgs.forEach(insertImageRef); scheduleRender(); toast(t("insImgPre") + imgs.length + t("insImgSuf")); }
  }

  /* ---------- 另存为 PDF（离线：预览 DOM → html2canvas-pro → jsPDF 多页）---------- */
  // 旧实现用 window.print()：在 Tauri WKWebView 中会弹出填满页面的打印预览且无回退，
  // 用户被困住只能强退。改为直接生成 PDF 字节落盘，与「另存为」合并。
  // 性能要点：只对整篇内容做【一次】html2canvas 截图，再用块边界把这张长图切进各 A4 页。
  // 旧的「每页一次 html2canvas」会随页数线性变慢（17 页要 9 秒），因为每次调用都要
  // 重新克隆整份文档、解析全部样式与公式 DOM。单次截图 + 切片后，耗时基本与页数无关。
  // 仍按块边界分页，公式/标题/代码块/表格行等不被切断。
  function uint8ToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  // 采集「安全分页断点」= 顶层块顶部坐标；列表/表格/引用再下钻一层取子项顶部。
  // 这样分页线只落在块间空白，不会切断任何块（公式块、代码块、表格行、li 等保持整体）。
  // 必须在 inner 未做 transform 时调用（坐标基于布局，与 transform 无关）。
  // 矢量 PDF：用浏览器原生打印引擎。临时把完整内容挂回预览（虚拟化时只挂了可见块），
  // 加 printing 类（@media print 仅显示预览），调 window.print()，在系统打印对话框
  // 选「存储为 PDF」即得矢量 PDF（文字/公式任意放大清晰）。afterprint 后恢复渲染。
  // 矢量 PDF：把完整内容挂回预览（虚拟化时只挂可见块），调 Tauri 的 print_webview
  // 触发系统打印对话框（macOS WKWebView 的 window.print() 是 no-op，必须走 Tauri 的打印）。
  // 在对话框选「存储为 PDF」即得矢量 PDF。打印后不立即恢复虚拟化——下次编辑会自动重渲。
  async function exportPdfVector() {
    await render(true); // 强制构建完整 HTML（含仅编辑模式）；await 等 mermaid 预渲染完成
    vClear();
    preview.innerHTML = lastFullHtml || preview.innerHTML;
    wrapDisplayMath(preview);
    // lastFullHtml 快照里 <img> 仍是原始相对路径（resolveImages 只改 preview DOM、不回写字符串），
    // 而上方 preview.innerHTML = lastFullHtml 又把 DOM 重置回相对路径 → @media print 仅渲染 #preview，
    // 相对路径图按 base URL 解析不到 → 矢量 PDF 里图变问号(broken)。打印前复用 resolveImagesForExport
    // 把图片 resolve 成 data URL 并等加载完成（BUG-078/BUG-079 家族：凡取用 lastFullHtml 的导出/打印
    // 路径都必须先 resolve 相对路径图，否则图变问号）。
    const at = activeTab();
    await resolveImagesForExport(preview, at ? (at.dir || "") : "");
    invoke("print_webview").catch((e) => toast(t("saveFail") + (e && e.message ? e.message : e)));
  }
  // 打印/导出前：把容器内 <img> 的【相对路径 src】复用 imgCache resolve 成 data URL，并等待全部
  // 加载完成。lastFullHtml 快照里 img 仍是原始相对路径（resolveImages 只改 preview DOM、不回写
  // 字符串），而矢量打印会把 preview 重置回 lastFullHtml，相对路径图按 base URL 解析不到 → 图变
  // 问号(broken)。打印前先 resolve 并等待，保证图正常渲染（BUG-078/BUG-079 家族）。
  // 复用 imgCache：预览已读过的图片不重复读盘；与 resolveImages 同语义但返回 Promise 等全部就位。
  async function resolveImagesForExport(root, dir) {
    const tasks = [];
    root.querySelectorAll("img").forEach((img) => {
      let src = img.getAttribute("src") || "";
      if (!src || /^(data:|https?:|blob:|asset:)/i.test(src)) return; // 已是可用源
      try { src = decodeURIComponent(src); } catch (_) {} // 还原 marked 对非 ASCII 的 percent-encode
      const isAbs = src.charAt(0) === "/" || /^[A-Za-z]:[\\/]/.test(src);
      if (!isAbs && !dir) return; // 相对路径且无文档目录：无法解析，跳过
      const abs = isAbs ? src : dir + "/" + src;
      if (!imgCache.has(abs)) {
        imgCacheSet(abs, invoke("read_image_data_url", { path: abs })
          .then((url) => {
            if (typeof url === "string" && url.indexOf("data:") === 0) return url;
            imgCache.delete(abs); return null; // 失败/非图片：清缓存允许下次重试
          })
          .catch(() => { imgCache.delete(abs); return null; }));
      }
      tasks.push(Promise.resolve(imgCacheGet(abs)).then((url) => {
        if (!url || !img.isConnected) return;
        img.src = url; // 换成 data URL，离屏容器里浏览器可直接解码加载
        if (img.complete && img.naturalWidth > 0) return;
        return /** @type {Promise<void>} */ (new Promise((res) => { // 等 data URL 解码完成，确保测高时图片已撑开
          const settle = async () => {
            // load 触发 ≠ 解码完成 ≠ 布局已更新。decode 等"可渲染"再放行，
            // 避免 WKWebView 下测高偏小导致末尾被裁（BUG-078）。
            try { await img.decode(); } catch (_) {}
            res();
          };
          img.addEventListener("load", settle, { once: true });
          img.addEventListener("error", () => res(), { once: true });
        }));
      }));
    });
    await Promise.all(tasks);
  }

  /* ---------- 另存为 LaTeX（Markdown → .tex，尽力转换）---------- */
  // 行级转换，保留 $...$ / $$...$$ 数学原样（已是合法 LaTeX）。
  // 仅转义非数学文本的 LaTeX 特殊字符；不处理 _ 斜体（下划线会被转义，避免与 LaTeX 下标歧义）。
  const TEX_ESC_MAP = {
    "\\": "\\textbackslash{}", "%": "\\%", "&": "\\&", "$": "\\$", "#": "\\#",
    "_": "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}",
  };
  const texEsc = (s) => s.replace(/([\\%&$#_{}~^])/g, (m) => TEX_ESC_MAP[m]);
  // 颜色值 → xcolor 颜色说明符：#RGB/#RRGGBB/#RRGGBBAA → [HTML]{...}；rgb()/rgba() → [RGB]{...}；命名色原样
  function texColor(c) {
    c = String(c).trim().replace(/;+$/, "");
    let m;
    if ((m = /^#([0-9a-fA-F]{6})$/.exec(c))) return "[HTML]{" + m[1].toUpperCase() + "}";
    if ((m = /^#([0-9a-fA-F]{3})$/.exec(c))) {
      const h = m[1]; return "[HTML]{" + (h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase() + "}";
    }
    if ((m = /^#([0-9a-fA-F]{8})$/.exec(c))) return "[HTML]{" + m[1].slice(0, 6).toUpperCase() + "}";
    if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c))) {
      return "[RGB]{" + Math.round(+m[1]) + "," + Math.round(+m[2]) + "," + Math.round(+m[3]) + "}";
    }
    return "{" + c.replace(/\s+/g, "") + "}"; // 命名色（red/blue…），需 xcolor（dvipsnames）等；返回 {name} 以拼成 \textcolor{name}{}
  }
  // 转义文本，但保留数学段（$$…$$ / \[…\] / $…$ / \(…\)）原样
  function texEscText(s) {
    const re = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\n$]+?\$|\\\([\s\S]+?\\\))/g;
    let out = "", last = 0, m;
    while ((m = re.exec(s))) {
      out += texEsc(s.slice(last, m.index));
      out += m[0]; // 数学原样
      last = m.index + m[0].length;
    }
    out += texEsc(s.slice(last));
    return out;
  }
  // 行内 Markdown → LaTeX（先抽数学/行内代码/删除线占位，再转义，再套加粗/斜体/链接/图片）
  // 删除线 ~~ 必须先占位：~ 是 LaTeX 特殊字符，转义后 ~~ 不再成对，正则无法匹配。
  function texInline(s, depth) {
    if (depth === undefined) depth = 0; // 嵌套颜色 span 的递归深度（防病态嵌套爆栈）
    if (s == null) return "";
    const math = [];
    s = s.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\n$]+?\$|\\\([\s\S]+?\\\))/g,
      (m) => " M" + (math.push(m) - 1) + " ");
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (m, a) => {
      codes.push("\\texttt{" + texEsc(a) + "}");
      return " C" + (codes.length - 1) + " ";
    });
    const strikes = [];
    s = s.replace(/~~([\s\S]+?)~~/g, (m, a) => {
      strikes.push("\\sout{" + texEscText(a) + "}");
      return " S" + (strikes.length - 1) + " ";
    });
    // 引用占位：[@key] / [@k1; @k2] / [-@key] → \cite{k1,k2}；\cite{} 类原样保留
    // （texEsc 会破坏 \ 与 {}，故先占位、最后还原，同 math/code/strike 思路）
    const cites = [];
    s = s.replace(/\\cite[a-zA-Z]*\s*\{([^}]*)\}/g, (m) => {
      cites.push(m); return " X" + (cites.length - 1) + " ";
    });
    s = s.replace(/\[\s*@([^\]]*)\]/g, (m, inner) => {
      const { keys } = parseCiteInner(inner);
      if (!keys.length) return m;
      cites.push("\\cite{" + keys.join(",") + "}");
      return " X" + (cites.length - 1) + " ";
    });
    // 颜色 span：<span style="color: …">…</span> → \textcolor{…}{…}（需 xcolor）。须在 texEsc 前占位：
    // body 内的 \ _ 等需经 texEsc，且 span 的 <> 虽不被 texEsc 转义但会以 HTML 字面量残留在 .tex。
    const colors = [];
    s = s.replace(/<span\s+[^>]*style\s*=\s*"[^"]*?\bcolor:\s*([^;"]+)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      (_m, c, body) => {
        // 深度上限 32：超过则不再下钻（回退为转义文本），防病态深嵌套 color span 爆栈（P3）
        colors.push("\\textcolor" + texColor(c) + "{" + (depth < 32 ? texInline(body, depth + 1) : texEscText(body)) + "}");
        return " K" + (colors.length - 1) + " ";
      });
    s = texEsc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, _alt, url) => "\n\\includegraphics[width=0.8\\linewidth]{" + url + "}\n");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, txt, url) => "\\href{" + url + "}{" + txt + "}");
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, "\\textbf{$1}");
    s = s.replace(/\*([^\n*]+?)\*/g, "\\textit{$1}");
    s = s.replace(/ S(\d+) /g, (_m, n) => strikes[+n]);
    s = s.replace(/ C(\d+) /g, (_m, n) => codes[+n]);
    s = s.replace(/ M(\d+) /g, (_m, n) => math[+n]);
    s = s.replace(/ X(\d+) /g, (_m, n) => cites[+n]);
    s = s.replace(/ K(\d+) /g, (_m, n) => colors[+n]);
    return s;
  }
  // 检测源文本里的非拉丁字符集，决定导言区需补哪些多语言包（使 PDF 能显示这些字符）
  function detectTexLangs(src) {
    const L = new Set();
    if (/[ᄀ-ᇿ⺀-⻿　-〿぀-ヿㇰ-ㇿ㐀-䶿一-鿿ꥠ-꥿가-힯豈-﫿＀-￯]/.test(src)) L.add("cjk");
    if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(src)) L.add("arabic");
    if (/[֐-׿יִ-ﭏ]/.test(src)) L.add("hebrew");
    if (/[Ѐ-ӿ]/.test(src)) L.add("cyrillic");
    if (/[Ͱ-Ͽἀ-῿]/.test(src)) L.add("greek");
    if (/[ऀ-ॿ]/.test(src)) L.add("devanagari");
    if (/[฀-๿]/.test(src)) L.add("thai");
    return L;
  }
  // 据检测结果拼导言区，首行用 % !TEX program 提示编译引擎（所有情况都标注）：
  //   CJK/阿拉伯/希伯来/印地/泰等 → XeLaTeX；其余 → pdfLaTeX。
  // hasColor 加 xcolor；CJK 加 ctex；西里尔/希腊用 babel；复杂脚本加 polyglossia。
  // mermaid 图由 saveAs 预渲染成 PNG 用 \includegraphics 嵌入(方案B)，只需 graphicx(已含)，无需 mermaid 包/mmdc。
  function texPreamble(langs, hasColor) {
    const needCJK = langs.has("cjk");
    const needComplex = langs.has("arabic") || langs.has("hebrew") || langs.has("devanagari") || langs.has("thai");
    const xe = needCJK || needComplex;
    let prog = xe ? "% !TEX program = xelatex\n" : "% !TEX program = pdflatex\n";
    let h = xe
      ? "\\documentclass{article}\n\\usepackage{fontspec}\n"
      : "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[" + (langs.has("cyrillic") ? "T2A" : "T1") + "]{fontenc}\n";
    if (needCJK) h += "\\usepackage[UTF8]{ctex}\n";
    if (!xe) {
      if (langs.has("cyrillic")) h += "\\usepackage[russian,english]{babel}\n";
      else if (langs.has("greek")) h += "\\usepackage[greek,english]{babel}\n";
    } else if (needComplex) {
      h += "% 注意：阿拉伯/希伯来/印地/泰等复杂脚本需 polyglossia 并设相应字体\n\\usepackage{polyglossia}\n";
    }
    h += "\\usepackage{hyperref}\n\\usepackage{graphicx}\n\\usepackage[normalem]{ulem}\n\\usepackage{amsmath,amssymb}\n";
    if (hasColor) h += "\\usepackage[dvipsnames]{xcolor}\n";
    return prog + h;
  }
  // 管道表格行 → tabular。对齐行(:- l :-: c -: r - l)定列对齐；单元格经 texInline 处理公式/代码/链接。
  function mdTableToLatex(rows) {
    const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const aligns = cells(rows[1]).map((a) => {
      const l = /^:/.test(a), rr = /:$/.test(a);
      return (l && rr) ? "c" : rr ? "r" : "l";
    });
    const line = (arr) => arr.map((t) => texInline(t)).join(" & ") + " \\\\";
    let body = "\\hline\n" + line(cells(rows[0])) + "\n\\hline\n";
    for (let k = 2; k < rows.length; k++) {
      if (rows[k].trim() === "") continue;
      body += line(cells(rows[k])) + "\n\\hline\n";
    }
    return "\\begin{tabular}{|" + aligns.join("|") + "|}\n" + body + "\\end{tabular}";
  }
  function mdToLatex(src, mermaidImgs, bibSection) {
    const lines = src.split("\n");
    const out = [];
    let i = 0;
    let mi = 0; // mermaid 块序号(对应 mermaidImgs 数组)
    let listEnv = null;
    const closeList = () => { if (listEnv) { out.push("\\end{" + listEnv + "}"); listEnv = null; } };
    while (i < lines.length) {
      const line = lines[i];
      // 代码围栏：mermaid 围栏 → \includegraphics（saveAs 预渲染成 PNG 落盘，方案B：用户编译零依赖）；
      //   mermaidImgs[mi] 为对应图片文件名(无则回退 verbatim)。其余围栏 → verbatim。
      if (/^```/.test(line)) {
        closeList();
        const lang = (/^```(\w*)/.exec(line) || [])[1] || "";
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 跳过闭合围栏
        if (lang === "mermaid") {
          const img = mermaidImgs && mermaidImgs[mi++];
          out.push(img
            ? "\\begin{figure}[h]\\centering\\includegraphics[width=0.8\\linewidth,height=\\textheight,keepaspectratio]{" + img + "}\\end{figure}"
            : "\\begin{verbatim}\n" + buf.join("\n") + "\n\\end{verbatim}");
        } else if (lang === "bibtex") {
          // 跳过：bibtex 内容由 saveAs 落盘 <stem>.bib，文末用 \bibliography 引用（不进 body）
        } else {
          out.push("\\begin{verbatim}\n" + buf.join("\n") + "\n\\end{verbatim}");
        }
        continue;
      }
      // 行间公式块：$$ 独占行（常跨多行，见 BUG-037 修后的示例写法）。
      // 必须块级识别：逐行 texInline 的单行数学正则匹配不到跨行 $$…$$，会把独占的 $$ 当普通文本
      // 转义成 \$\$，且把公式体里的 \ _ ^ 转义成 \textbackslash{} \_ \textasciicircum{}（BUG-075）。
      if (/^\s*\$\$\s*$/.test(line)) {
        closeList();
        const mbuf = [];
        i++;
        while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) { mbuf.push(lines[i]); i++; }
        i++; // 跳过闭合 $$
        out.push("$$" + (mbuf.length ? "\n" + mbuf.join("\n") : "") + "\n$$");
        continue;
      }
      // 行间公式块：\[ … \] 各自独占行，同理原样输出。
      if (/^\s*\\\[\s*$/.test(line)) {
        closeList();
        const dbuf = [];
        i++;
        while (i < lines.length && !/^\s*\\\]\s*$/.test(lines[i])) { dbuf.push(lines[i]); i++; }
        i++; // 跳过闭合 \]
        out.push("\\[" + (dbuf.length ? "\n" + dbuf.join("\n") : "") + "\n\\]");
        continue;
      }
      // 引用块
      if (/^>\s?/.test(line)) {
        closeList();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
        out.push("\\begin{quote}\n" + buf.map(texInline).join("\n") + "\n\\end{quote}");
        continue;
      }
      // 标题
      const hm = /^(#{1,6})\s+(.*)$/.exec(line);
      if (hm) {
        closeList();
        const cmds = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "textbf"];
        const cmd = cmds[hm[1].length - 1] || "textbf";
        out.push("\\" + cmd + "{" + texInline(hm[2]) + "}");
        i++; continue;
      }
      // 分割线
      if (/^(---|\*\*\*|___)\s*$/.test(line)) { closeList(); out.push("\\noindent\\rule{\\linewidth}{0.4pt}"); i++; continue; }
      // 任务列表项
      if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
        if (listEnv !== "itemize") { closeList(); out.push("\\begin{itemize}"); listEnv = "itemize"; }
        const checked = /\[[xX]\]/.test(line);
        out.push("\\item " + (checked ? "$\\boxtimes$ " : "$\\square$ ") +
          texInline(line.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")));
        i++; continue;
      }
      // 无序列表
      if (/^\s*[-*+]\s+/.test(line)) {
        if (listEnv !== "itemize") { closeList(); out.push("\\begin{itemize}"); listEnv = "itemize"; }
        out.push("\\item " + texInline(line.replace(/^\s*[-*+]\s+/, "")));
        i++; continue;
      }
      // 有序列表
      if (/^\s*\d+\.\s+/.test(line)) {
        if (listEnv !== "enumerate") { closeList(); out.push("\\begin{enumerate}"); listEnv = "enumerate"; }
        out.push("\\item " + texInline(line.replace(/^\s*\d+\.\s+/, "")));
        i++; continue;
      }
      // 表格（管道表）：转 tabular 环境（表头+对齐行+数据行）
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        closeList();
        const buf = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        out.push(mdTableToLatex(buf));
        continue;
      }
      // 空行
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      // 普通段落
      closeList();
      out.push(texInline(line));
      i++;
    }
    closeList();
    const hasColor = /<span\s+[^>]*style\s*=\s*"[^"]*?\bcolor:/i.test(src);
    return texPreamble(detectTexLangs(src), hasColor) +
      "\\begin{document}\n\n" + out.join("\n\n") +
      (bibSection ? "\n\n" + bibSection + "\n" : "") +
      "\n\n\\end{document}\n";
  }
  // SVG 字符串 → PNG data URL(白底, scale 倍超采样保清晰)。失败返回 null。
  async function svgToPngDataUrl(svg, scale) {
    if (!window.html2canvas) return null;
    // 用 html2canvas 截 DOM 内渲染的 SVG: foreignObject 的 mermaid 图(flowchart/classDiagram/stateDiagram)
    // 作为 Image 加载会 onerror 失败; html2canvas 直接渲染 DOM, foreignObject 正常, 中英文也都 OK
    const div = document.createElement("div");
    div.style.cssText = "position:absolute;left:-9999px;top:0;display:inline-block;background:#ffffff;";
    div.innerHTML = String(svg);
    document.body.appendChild(div);
    try {
      const el = div.querySelector("svg");
      if (!el) return null;
      const vb = (el.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
      const mw = (el.getAttribute("style") || "").match(/max-width:\s*([\d.]+)/);
      const wAttr = el.getAttribute("width") || "", hAttr = el.getAttribute("height") || "";
      let pw = /%$/.test(wAttr) ? NaN : parseFloat(wAttr), ph = /%$/.test(hAttr) ? NaN : parseFloat(hAttr);
      if (!pw || isNaN(pw)) pw = (mw && +mw[1]) || (vb.length === 4 ? vb[2] : 0) || 300; // 100% 等百分比当无效, 用 viewBox/max-width 真实像素
      if (!ph || isNaN(ph)) ph = (vb.length === 4 ? vb[3] : 0) || 150;
      el.setAttribute("width", String(pw)); el.setAttribute("height", String(ph));
      el.style.maxWidth = "none"; el.style.width = pw + "px"; el.style.height = ph + "px";
      let sc = Math.max(scale || 3, 3);
      if (Math.max(pw, ph) * sc < 1600) sc = Math.max(3, Math.ceil(1600 / Math.max(pw, ph))); // 较大边至少 ~1600px 清晰
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // 等两帧让 SVG 完成 DOM 渲染/布局
      const canvas = await window.html2canvas(div, { scale: sc, backgroundColor: "#ffffff", logging: false, useCORS: true });
      return canvas.toDataURL("image/png");
    } catch (_) { return null; }
    finally { if (div.parentNode) div.remove(); }
  }
  // 导出 LaTeX 方案B：把 src 里所有 mermaid 块渲染成【矢量 PDF】落盘到 <figsDir>, 返回文件名数组(顺序与 mdToLatex mermaid 块对齐)。
  // 渲染失败处为 null(mdToLatex 回退 verbatim)。用户编译 .tex 只需 graphicx, 无需 mermaid 包/mmdc。
  async function renderMermaidForLatex(src, figsDir, figsSub) {
    const blocks = [];
    const re = /```mermaid[ \t]*\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(src))) blocks.push(m[1].replace(/\s+$/, ""));
    if (!blocks.length || !window.mermaid) return [];
    if (!mermaidReady) initMermaid();
    if (!mermaidReady) return [];
    const names = [];
    const fails = [];
    for (let idx = 0; idx < blocks.length; idx++) {
      const id = "mmd-" + (mermaidSeq++);
      let svg = null;
      const head = blocks[idx].split("\n")[0].slice(0, 18);
      try { const r = await mermaid.render(id, blocks[idx]); svg = r && r.svg; }
      catch (e) { fails.push("#" + (idx + 1) + " " + head + " [render]:" + (e && e.message ? e.message : e)); }
      finally { cleanupMermaidTemp(id); }
      if (!svg) { names.push(null); continue; }
      // 统一 PNG 光栅化: 浏览器渲染 SVG(中英文/foreignObject 全部正常), 成功率最高、无字体问题
      const png = await svgToPngDataUrl(svg, 2);
      const data = (png && png.indexOf("data:image/png;base64,") === 0) ? png.slice(png.indexOf(",") + 1) : null;
      if (!data) { fails.push("#" + (idx + 1) + " " + head + " [png]"); names.push(null); continue; }
      const fname = "mermaid_" + (idx + 1) + ".png";
      try { await invoke("write_bytes_at", { path: figsDir + "/" + fname, data }); names.push(figsSub + "/" + fname); }
      catch (e) { fails.push("#" + (idx + 1) + " " + head + " [write]:" + (e && e.message ? e.message : e)); names.push(null); }
    }
    if (fails.length) toast("mermaid→图 失败 " + fails.length + "/" + blocks.length + ": " + fails.join(" | "));
    return names;
  }
  // 导出 LaTeX 修订3：把 bibtex(内嵌 ```bibtex 块 + tab.bibText) 解析成 thebibliography 环境内嵌到 .tex 文末，
  // 不再另建 .bib 文件(用户无需跑 BibTeX)。entry 字段在 .fields(同 fmtEntry)。
  function buildTexBibliography(src, tab) {
    let bibContent = "";
    try { const { embedded } = extractEmbeddedBib(src); bibContent = ((tab && tab.bibText) || "") + (embedded ? "\n" + embedded : ""); } catch (_) {}
    bibContent = bibContent.trim();
    if (!bibContent || !window.BibTeXParser) return "";
    let entries = [];
    try { entries = (window.BibTeXParser.parse(bibContent, { sentenceCase: false }) || {}).entries || []; } catch (_) {}
    if (!entries.length) return "";
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim(); // bibtex 字段值本身是 LaTeX 文本({}保护大小写等),原样保留不转义
    // author 可能是字符串(团体作者)或数组[{firstName,lastName}]; 全列、不缩写(f.author 非 string 时无 .split)
    const fmtAu = (au) => {
      if (!au) return "";
      if (typeof au === "string") return clean(au);
      if (!Array.isArray(au)) return clean(String(au));
      return au.map((a) => {
        if (typeof a === "string") return clean(a);
        const fn = clean(a.firstName), ln = clean(a.lastName);
        return fn && ln ? fn + " " + ln : (ln || fn);
      }).filter(Boolean).join(", ");
    };
    const items = entries.map((en) => {
      const f = (en && en.fields) || {};
      const au = fmtAu(f.author);
      const parts = [];
      if (au) parts.push(au);
      if (f.title) parts.push("\\textit{" + clean(f.title) + "}");
      const ven = [];
      if (f.journal) ven.push("\\textit{" + clean(f.journal) + "}");
      else if (f.booktitle) ven.push("In " + clean(f.booktitle));
      else if (f.publisher) ven.push(clean(f.publisher));
      if (f.volume) ven.push(String(f.volume));
      if (f.pages) ven.push("pp. " + String(f.pages).replace(/--?/g, "-"));
      if (ven.length) parts.push(ven.join(", "));
      if (f.year) parts.push(String(f.year));
      return "\\bibitem{" + (en.key || "") + "} " + parts.filter(Boolean).join(", ") + ".";
    }).filter((s) => s && s.trim());
    if (!items.length) return "";
    return "\\begin{thebibliography}{99}\n" + items.join("\n") + "\n\\end{thebibliography}";
  }

  /* ---------- 草稿自动保存（IndexedDB 混合 + localStorage 回退）----------
     IDB 突破 localStorage 5MB 配额；localStorage best-effort 兜底，且 pagehide 同步刷它保 M2。
     payload 带 ts，恢复时取 IDB/localStorage 中较新者：大 session（localStorage 超配额）走 IDB；
     小 session 突然关闭时 localStorage 的 pagehide 同步写（更新）胜出——M2 仍生效。 */
  let draftTimer;
  let quotaWarned = false; // D11：配额告警一次性开关（避免每 500ms 刷屏）
  const IDB_NAME = "mdex", IDB_STORE = "kv", IDB_KEY = "session";
  let _idb = null;
  function idbDb() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore(IDB_STORE); } catch (_) {} };
        req.onsuccess = () => { _idb = req.result; resolve(_idb); };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  async function idbSet(key, val) {
    const db = await idbDb(); if (!db) return false;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(val, key);
      return await new Promise((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
    } catch (_) { return false; }
  }
  async function idbGet(key) {
    const db = await idbDb(); if (!db) return null;
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      return await new Promise((res) => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); });
    } catch (_) { return null; }
  }
  // 同步写 localStorage + 异步写 IDB（从 saveDraft 防抖体抽出，供关闭时同步刷盘复用——M2）。
  function writeDraftNow() {
    // 文件窗口不写全局会话；viewer 窗口（mermaid-*）无编辑内容，绝不能写——
    // 否则其 visibilitychange/pagehide 会把主窗口的会话覆盖成空（M2 副作用）。
    if (isFileWindow || winLabel.startsWith("mermaid-")) return;
    const cur = activeTab();
    if (cur) {
      cur.content = editor.value;
      cur.selStart = editor.selectionStart;
      cur.selEnd = editor.selectionEnd;
      cur.scrollTop = editor.scrollTop;
    }
    const payload = JSON.stringify({
      ts: Date.now(), // 恢复时据 ts 在 IDB/localStorage 间取较新者
      tabs: tabs.map((x) => ({ id: x.id, name: x.name, path: x.path, dir: x.dir,
        content: x.content, type: x.type || "md", dirty: x.dirty, scrollTop: x.scrollTop,
        selStart: x.selStart, selEnd: x.selEnd, bibText: x.bibText || "",
        sample: x.sample || null, imgDir: x.imgDir || null, imgSub: x.imgSub || null })),
      activeId,
    });
    idbSet(IDB_KEY, payload); // IDB 主存（异步，突破 5MB 配额）；不 await——pagehide 不可靠时由 localStorage 兜底
    try {
      localStorage.setItem("md-session", payload);
      quotaWarned = false; // 写入成功 → 重置告警，下次再超配额会再提示一次
    } catch (e) {
      // D11：localStorage 超配额不再静默——IDB 已收下，一次性 toast 告知"自动保存已降级"。
      if (!quotaWarned) { quotaWarned = true; toast(t("quotaWarn")); }
    }
  }
  function saveDraft() {
    if (isFileWindow) return; // 文件窗口不写全局 md-session（避免多窗口互相覆盖）
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraftNow, 500);
  }
  // M2: 关闭/隐藏窗口时同步刷盘（localStorage.setItem 同步、可在卸载前完成），
  // 挽回关闭前 ≤500ms 防抖窗口内的编辑丢失。完整的"关窗前逐个 dirty 标签逐个确认"需
  // Tauri CloseRequested 集成（要阻塞关闭），风险较高，延后到前端测试护栏（E1）落地后再做。
  window.addEventListener("pagehide", writeDraftNow);
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") writeDraftNow(); });

  /* ---------- 分栏拖拽 ---------- */
  let dragging = false;
  $("gutter").addEventListener("mousedown", () => {
    dragging = true; $("gutter").classList.add("dragging");
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const pct = Math.min(85, Math.max(15, ((e.clientX - rect.left) / rect.width) * 100));
    main.style.gridTemplateColumns = pct + "% 5px " + (100 - pct) + "%";
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; $("gutter").classList.remove("dragging");
      document.body.style.cursor = ""; document.body.style.userSelect = ""; }
  });

  /* ---------- 同步滚动 ---------- */
  let scrollSrc = null, scrollReset;
  /* ---- 编辑↔预览 双向定位（点击 + 滚动同步）----
     预览侧用"块顶 Y"：非虚拟化时每次渲染测一次缓存（buildPreviewBlockY）；虚拟化时直接用 vprefix
     （虚拟化自维护、滚动时自动校正）。滚动只查缓存、零 DOM 测量 → 丝滑。代码块按行插值。 */
  let previewBlockY = [];
  let editorLineStarts = [0];   // 每个源码行的起始偏移
  let visLineStart = [0];       // 累计【视觉行】：visLineStart[i]=源码第 i 行之前的视觉行数（含折行）
  let editorCharW = 8.4;        // 等宽字体单字符宽（px）
  let editorLH = 23.8;          // 编辑器实际行高（px）
  let editorCharsPerRow = 80;   // 编辑器内容区每行可容纳字符数
  let editorFontMeasured = false;
  // 量等宽字体的单字符宽与行高（隐藏 span）。字号须取 #editor 当前计算值（字体缩放后随变），
  // 否则折行映射 charsPerRow/visLineStart 算错 → 滚动同步偏（bug_history BUG-060）。
  function measureEditorFont() {
    let m = $("editor-measure");
    const fs = getComputedStyle(editor).fontSize || "14px";
    if (!m) {
      m = document.createElement("span"); m.id = "editor-measure";
      m.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-family:var(--mono);line-height:1.7;";
      document.body.appendChild(m);
    }
    m.style.fontSize = fs;
    m.textContent = "MMMMMMMMMM"; editorCharW = m.getBoundingClientRect().width / 10 || 8.4;
    m.textContent = Array(11).join("M\n"); editorLH = m.getBoundingClientRect().height / 10 || 23.8;
  }
  // 源码行起始偏移 + 每行折行数（等宽字体确定性：视觉行数=ceil(字数/每行字符数)）
  function computeEditorMap() {
    if (!editorFontMeasured) { measureEditorFont(); editorFontMeasured = true; }
    const v = editor.value;
    const ls = [0]; let i = 0;
    while ((i = v.indexOf("\n", i)) !== -1) ls.push(++i);
    editorLineStarts = ls;
    const cs = getComputedStyle(editor);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    const contentW = editor.clientWidth - padL - padR;
    editorCharsPerRow = Math.max(1, Math.floor(contentW / editorCharW));
    const vis = [0];
    for (let k = 0; k < ls.length; k++) {
      const start = ls[k];
      const end = k + 1 < ls.length ? ls[k + 1] - 1 : v.length; // 行内容（不含换行符）
      vis.push(vis[k] + Math.max(1, Math.ceil((end - start) / editorCharsPerRow)));
    }
    visLineStart = vis;
  }
  // 预览块顶 Y：虚拟化用 vprefix（虚拟化自维护），非虚拟化每次渲染测一次（滚动不重测 → 丝滑）
  function pby(i) { const a = vblocks.length ? vprefix : previewBlockY; return a ? (a[i] || 0) : 0; }
  function pbyLen() { const a = vblocks.length ? vprefix : previewBlockY; return a ? a.length : 0; }
  function buildPreviewBlockY() {
    if (vblocks.length) return;              // 虚拟化：由 vprefix 提供，无需测
    if (!srcBlockOffsets.length) { previewBlockY = []; return; }
    const pvTop = preview.getBoundingClientRect().top, sts = preview.scrollTop;
    const arr = [], kids = preview.children;
    for (let i = 0; i < kids.length && i < srcBlockOffsets.length; i++) {
      const r = kids[i].getBoundingClientRect();
      arr.push(r.top - pvTop + sts);
    }
    previewBlockY = arr;
  }
  function blockIsCode(bs) { return editor.value.slice(bs, bs + 3) === "```"; }
  function previewYToOff(y) { // 预览内容 Y → 源偏移（块顶 Y 分段线性）
    const n = pbyLen(); if (!n || !srcBlockOffsets.length) return -1;
    if (y <= pby(0)) return srcBlockOffsets[0] || 0;
    if (y >= pby(n - 1)) return srcBlockOffsets[srcBlockOffsets.length - 1] || editor.value.length;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pby(mid) <= y) lo = mid; else hi = mid - 1; }
    const bi = lo, top = pby(bi), bot = bi + 1 < n ? pby(bi + 1) : top;
    const frac = bot > top ? (y - top) / (bot - top) : 0;
    const bs = srcBlockOffsets[bi], be = bi + 1 < srcBlockOffsets.length ? srcBlockOffsets[bi + 1] : editor.value.length;
    return Math.round(bs + frac * (be - bs));
  }
  function offToPreviewY(off) { // 源偏移 → 预览内容 Y（代码块按行插值，其余按字符比）
    const n = pbyLen(); if (!n || !srcBlockOffsets.length) return null;
    let lo = 0, hi = srcBlockOffsets.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (srcBlockOffsets[mid] <= off) lo = mid + 1; else hi = mid; }
    const bi = Math.max(0, lo - 1);
    if (bi >= n) return pby(n - 1);
    const top = pby(bi), bot = bi + 1 < n ? pby(bi + 1) : top;
    const bs = srcBlockOffsets[bi], be = bi + 1 < srcBlockOffsets.length ? srcBlockOffsets[bi + 1] : editor.value.length;
    let frac;
    if (blockIsCode(bs)) {                     // 代码块行高均匀：按源码行号比例（精确到行）
      const tl = editor.value.slice(bs, be).split("\n").length;
      const cl = editor.value.slice(bs, off).split("\n").length;
      frac = tl > 1 ? (cl - 1) / (tl - 1) : 0;
    } else frac = be > bs ? (off - bs) / (be - bs) : 0;
    return top + frac * (bot - top);
  }
  function editorYToOff(y) { // 编辑器像素 Y → 源偏移（按视觉行累计，含折行；修旧线性模型导致滑动不准）
    const ls = editorLineStarts, vis = visLineStart; if (!ls.length || !vis.length) return 0;
    let vline = Math.round(y / editorLH);
    const total = vis[vis.length - 1];
    if (vline >= total) return ls[ls.length - 1];
    if (vline <= 0) return 0;
    let lo = 0, hi = vis.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (vis[mid] <= vline) lo = mid; else hi = mid - 1; }
    const lineIdx = lo, localVis = vline - vis[lineIdx];
    const start = ls[lineIdx];
    const end = lineIdx + 1 < ls.length ? ls[lineIdx + 1] - 1 : editor.value.length;
    return Math.min(end, start + localVis * editorCharsPerRow);
  }
  function offToEditorY(off) { // 源偏移 → 编辑器像素 Y（含折行）
    const ls = editorLineStarts, vis = visLineStart; if (!ls.length || !vis.length) return 0;
    if (off <= 0) return 0;
    if (off >= ls[ls.length - 1]) return vis[vis.length - 1] * editorLH;
    let lo = 0, hi = ls.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ls[mid] <= off) lo = mid; else hi = mid - 1; }
    const lineIdx = lo, col = off - ls[lineIdx];
    return (vis[lineIdx] + Math.floor(col / editorCharsPerRow)) * editorLH;
  }
  // 锚点式滚动同步（替换原全局比例）：以各自中线偏移互映射；无锚点时回退比例
  function syncAnchors(src, dst) {
    if (!syncScroll) return;
    if (!pbyLen()) {
      const r = src.scrollTop / (src.scrollHeight - src.clientHeight || 1);
      dst.scrollTop = r * (dst.scrollHeight - dst.clientHeight); return;
    }
    const center = src.scrollTop + src.clientHeight / 2;
    let y = null;
    if (src === editor) { const off = editorYToOff(center); y = offToPreviewY(off); }
    else { const off = previewYToOff(center); y = offToEditorY(off); }
    if (y == null || !isFinite(y)) return;
    const max = dst.scrollHeight - dst.clientHeight;
    dst.scrollTop = Math.max(0, Math.min(max || 0, y - dst.clientHeight / 2));
  }
  // 滚动同步用 requestAnimationFrame 合并（每帧最多一次），避免滚动卡顿
  let syncRaf = 0, syncDir = null;
  function scheduleSync(src, dst) {
    syncDir = { src, dst };
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => { syncRaf = 0; if (syncDir) { const d = syncDir; syncDir = null; syncAnchors(d.src, d.dst); } });
  }
  editor.addEventListener("scroll", () => { if (scrollSrc !== "preview") { scrollSrc = "editor"; scheduleSync(editor, preview); } });
  preview.addEventListener("scroll", () => {
    if (scrollSrc !== "editor") { scrollSrc = "preview"; scheduleSync(preview, editor); }
    if (vblocks.length) scheduleRenderVisible(); // 虚拟化：滚动时按需切换可见块
  });
  [editor, preview].forEach((el) => el.addEventListener("scrollend", () => {
    clearTimeout(scrollReset); scrollReset = setTimeout(() => (scrollSrc = null), 120);
  }));
  // 编辑器尺寸变化（窗口缩放 / 分栏拖拽 / 视图切换）→ 每行字符数变 → 重算折行映射，否则滑动同步会偏
  if (window.ResizeObserver) {
    let mapRaf = 0;
    new ResizeObserver(() => { clearTimeout(mapRaf); mapRaf = setTimeout(computeEditorMap, 80); }).observe(editor);
  }
  window.addEventListener("resize", () => { if (vblocks.length) scheduleRenderVisible(); });

  /* ---------- 搜索替换 ---------- */
  let searchMatches = [];
  let searchIdx = -1;
  const searchBar = $("search-bar");
  /** @type {HTMLInputElement} */
  const searchInput = /** @type {HTMLInputElement} */ ($("search-input"));
  /** @type {HTMLInputElement} */
  const replaceInput = /** @type {HTMLInputElement} */ ($("replace-input"));
  const editorHl = $("editor-hl");
  // 编辑器覆盖层：把全文 + 匹配 <mark> 渲到 #editor-hl（文字透明、仅 mark 显底色），与 textarea 同字体/内边距/行高对齐。
  function renderEditorHighlight() {
    if (!editorHl) return;
    if (searchBar.hidden || !searchInput.value || !searchMatches.length) { editorHl.innerHTML = ""; return; }
    const v = editor.value, q = searchInput.value;
    let html = "", last = 0;
    for (let i = 0; i < searchMatches.length; i++) {
      const pos = searchMatches[i];
      html += escapeHtml(v.slice(last, pos));
      html += '<mark class="search-mark' + (i === searchIdx ? " current" : "") + '">' + escapeHtml(v.slice(pos, pos + q.length)) + '</mark>';
      last = pos + q.length;
    }
    html += escapeHtml(v.slice(last));
    editorHl.innerHTML = html;
    editorHl.scrollTop = editor.scrollTop;
    editorHl.scrollLeft = editor.scrollLeft;
  }
  // 预览：把可见文本节点里的查询串包进 <mark>，第 searchIdx 个加 current（闪一闪）。每次渲染后重跑。
  function highlightPreview() {
    preview.querySelectorAll("mark.search-mark").forEach((m) => {
      const p = m.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
    if (searchBar.hidden || !searchInput.value) return;
    const q = searchInput.value; if (!q) return;
    const tw = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const pn = n.parentNode; if (!pn) return NodeFilter.FILTER_REJECT;
        const tag = pn.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") return NodeFilter.FILTER_REJECT;
        return n.nodeValue.indexOf(q) !== -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode);
    let idx = 0;
    for (const node of nodes) {
      const parts = node.nodeValue.split(q);
      if (parts.length <= 1) continue;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) frag.appendChild(document.createTextNode(parts[i]));
        if (i < parts.length - 1) {
          const mk = document.createElement("mark");
          mk.className = "search-mark" + (idx === searchIdx ? " current" : "");
          mk.textContent = q;
          frag.appendChild(mk); idx++;
        }
      }
      node.parentNode.replaceChild(frag, node);
    }
  }
  function openSearch(showReplace) {
    searchBar.hidden = false;
    $("replace-row").hidden = !showReplace;
    searchInput.focus();
    searchInput.select();
    doSearch(1);
  }
  function closeSearch() {
    searchBar.hidden = true;
    renderEditorHighlight(); // 清空编辑器高亮覆盖层
    highlightPreview();      // 清空预览高亮
    editor.focus();
  }
  function updateSearchMatches() {
    const q = searchInput.value;
    searchMatches = [];
    if (q) {
      let pos = 0;
      while ((pos = editor.value.indexOf(q, pos)) !== -1) {
        searchMatches.push(pos);
        pos += q.length;
      }
    }
    searchIdx = searchMatches.length ? 0 : -1;
    $("search-count").textContent = searchMatches.length
      ? (searchIdx + 1) + "/" + searchMatches.length : "0/0";
  }
  function doSearch(dir) {
    updateSearchMatches();
    if (!searchMatches.length) { $("search-count").textContent = "0/0"; return; }
    // 找离当前选区最近的匹配：向后(下)从选区【末尾】找，向前(上)从选区【开头】找。
    // 用 selectionEnd 才能跳过当前已选中的那条匹配（旧代码用 >= selectionStart 会反复命中同一条，下箭头无反应）。
    const cur = editor.selectionStart;
    const curEnd = editor.selectionEnd;
    if (dir > 0) {
      searchIdx = searchMatches.findIndex((p) => p >= curEnd);
      if (searchIdx < 0) searchIdx = 0;
    } else {
      searchIdx = -1;
      for (let i = searchMatches.length - 1; i >= 0; i--) {
        if (searchMatches[i] < cur) { searchIdx = i; break; }
      }
      if (searchIdx < 0) searchIdx = searchMatches.length - 1;
    }
    selectMatch();
  }
  function selectMatch() {
    if (searchIdx < 0 || !searchMatches.length) return;
    const pos = searchMatches[searchIdx];
    const len = searchInput.value.length;
    // 不抢焦点：setSelectionRange 在 textarea 未聚焦时仍能设置选区并滚动到可见，
    // 保留焦点在搜索框，否则每输入一个字符就把后续按键灌进正文（旧 bug）。
    editor.setSelectionRange(pos, pos + len);
    // 滚动到可见
    const line = editor.value.slice(0, pos).split("\n").length;
    const lineHeight = 14 * 1.7;
    editor.scrollTop = (line - 1) * lineHeight - editor.clientHeight / 2;
    $("search-count").textContent = (searchIdx + 1) + "/" + searchMatches.length;
    renderEditorHighlight(); // 刷新高亮：当前条 current 闪一闪
    highlightPreview();
  }
  function doReplace() {
    if (searchIdx < 0 || !searchMatches.length) return;
    const q = searchInput.value;
    const r = replaceInput.value;
    const pos = searchMatches[searchIdx];
    editor.value = editor.value.slice(0, pos) + r + editor.value.slice(pos + q.length);
    editor.setSelectionRange(pos, pos + r.length);
    scheduleRender();
    updateSearchMatches();
    if (searchMatches.length) selectMatch();
  }
  function doReplaceAll() {
    const q = searchInput.value;
    const r = replaceInput.value;
    if (!q) return;
    editor.value = editor.value.split(q).join(r);
    scheduleRender();
    searchMatches = [];
    searchIdx = -1;
    $("search-count").textContent = "0/0";
    toast(t("replaceAll") + " ✓");
  }
  searchInput.addEventListener("input", () => doSearch(1));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doSearch(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
  });
  replaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
  });
  $("search-next").onclick = () => doSearch(1);
  $("search-prev").onclick = () => doSearch(-1);
  $("search-close").onclick = closeSearch;
  // 编辑器滚动：同步高亮覆盖层滚动；编辑器正文被改：重算匹配并刷新覆盖层（预览由 render 钩子刷新）。
  editor.addEventListener("scroll", () => {
    if (editorHl) { editorHl.scrollTop = editor.scrollTop; editorHl.scrollLeft = editor.scrollLeft; }
  });
  editor.addEventListener("input", () => {
    if (!searchBar.hidden) { updateSearchMatches(); renderEditorHighlight(); }
  });
  $("replace-btn").onclick = doReplace;
  $("replace-all-btn").onclick = doReplaceAll;

  /* ---------- 点击同步：编辑器↔预览（源码偏移量映射，确定性方案）---------- */
  // 编辑器点击 → 预览滚到对应块
  editor.addEventListener("click", () => {
    setTimeout(() => {
      updateCursor();
      scrollSrc = "editor";
      clearTimeout(scrollReset);
      scrollReset = setTimeout(() => (scrollSrc = null), 300);
      if (!srcBlockOffsets.length) return;
      const pos = editor.selectionStart;
      // 二分查找：找到最后一个 offset <= pos 的块
      let lo = 0, hi = srcBlockOffsets.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (srcBlockOffsets[mid] <= pos) lo = mid + 1; else hi = mid; }
      const blockIdx = Math.max(0, lo - 1);
      const half = preview.clientHeight / 2;
      // 优先：测量式锚点分段线性（精确到 li/tr 与块内位置）
      const py = offToPreviewY(pos);
      if (py != null) { preview.scrollTop = Math.max(0, py - half); }
      else {
        // 回退：块内字符比例（锚点表为空时）
        const bs = srcBlockOffsets[blockIdx];
        const be = blockIdx + 1 < srcBlockOffsets.length ? srcBlockOffsets[blockIdx + 1] : editor.value.length;
        const ratio = be > bs ? (pos - bs) / (be - bs) : 0;
        if (vblocks.length && blockIdx < vprefix.length) {
          const top = vprefix[blockIdx];
          const h = (blockIdx + 1 < vprefix.length ? vprefix[blockIdx + 1] : vprefix[vblocks.length]) - top;
          preview.scrollTop = Math.max(0, top + ratio * h - half);
        } else {
          const el = preview.children[blockIdx];
          if (el) {
            const pvRect = preview.getBoundingClientRect();
            const top = el.getBoundingClientRect().top - pvRect.top + preview.scrollTop;
            preview.scrollTop = Math.max(0, top + ratio * /** @type {HTMLElement} */ (el).offsetHeight - half);
          }
        }
      }
    }, 0);
  });
  // 预览点击 → 编辑器光标跳到对应块
  // 滚动预览到参考文献条目 #ref-n（已挂载直接滚；虚拟化未挂载则按块前缀和滚到所在块）
  function scrollToCite(n) {
    const id = "ref-" + n;
    const target = document.getElementById(id);
    if (target) {
      const pr = preview.getBoundingClientRect();
      const top = target.getBoundingClientRect().top - pr.top + preview.scrollTop;
      preview.scrollTop = Math.max(0, top - 40);
      flashBib(target);
      return;
    }
    if (vblocks.length) {
      for (let i = 0; i < vblocks.length; i++) {
        const node = vblocks[i];
        if ((node.id && node.id === id) || (node.querySelector && node.querySelector("#" + id))) {
          preview.scrollTop = Math.max(0, (vprefix[i] || 0) - 40);
          // 滚动后虚拟化会挂载该块，延迟高亮
          setTimeout(() => { const t = document.getElementById(id); if (t) flashBib(t); }, 80);
          return;
        }
      }
    }
  }
  function flashBib(el) {
    el.classList.add("bib-flash");
    setTimeout(() => el.classList.remove("bib-flash"), 1400);
  }
  function flashEl(el) {
    const prev = el.style.background;
    el.style.transition = "background .2s";
    el.style.background = "var(--border)";
    setTimeout(() => { el.style.background = prev; }, 1400);
  }

  // 文献表 [n] 回链：跳回正文引用处。多处引用则弹选择器。
  // 在源码里扫描该 key 的所有引用（[@key] / [@k; @key] / \cite{...,key,...}），取源偏移与行内片段。
  function findCiteOccurrences(key) {
    const text = editor.value;
    const re = /\[\s*@([^\]]*)\]|\\cite[a-zA-Z]*\s*\{([^}]*)\}/g;
    const occ = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      let keys;
      if (m[1] != null) keys = parseCiteInner(m[1]).keys;
      else keys = m[2].split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
      if (keys.includes(key)) {
        const off = m.index;
        const ls = text.lastIndexOf("\n", off - 1) + 1;
        const le = text.indexOf("\n", off);
        const line = text.slice(ls, le === -1 ? undefined : le).trim();
        occ.push({ offset: off, snippet: line.slice(0, 64) || ("@" + key) });
      }
    }
    return occ;
  }
  // 滚动预览到包含某源偏移的块（块级，虚拟化 best-effort）
  function scrollPreviewToSrcOffset(offset) {
    if (!srcBlockOffsets.length) return;
    let lo = 0, hi = srcBlockOffsets.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (srcBlockOffsets[mid] <= offset) lo = mid + 1; else hi = mid; }
    const blockIdx = Math.max(0, lo - 1);
    if (vblocks.length && blockIdx < vprefix.length) {
      preview.scrollTop = Math.max(0, vprefix[blockIdx] - 20);
    } else {
      const el = preview.children[blockIdx]; // 顶层块（li/tr 也带 data-src-offset，故只取顶层 children）
      if (el) {
        const pvRect = preview.getBoundingClientRect();
        preview.scrollTop = el.getBoundingClientRect().top - pvRect.top + preview.scrollTop - 20;
      }
    }
  }
  // 跳到某处引用：编辑器光标精确定位 + 预览滚到该引用。
  // i = 该 key 的第 i 处引用（0 基），用于在 DOM 里匹配第 i 个含 href=#ref-n 的 <sup>（非虚拟化时精确到引用位置）。
  function jumpToCitation(o, i, n) {
    editor.focus();
    editor.setSelectionRange(o.offset, o.offset);
    updateCursor();
    scrollSrc = "editor";
    clearTimeout(scrollReset);
    scrollReset = setTimeout(() => (scrollSrc = null), 300);
    if (!vblocks.length) {
      const sups = Array.from(preview.querySelectorAll("sup.cite"))
        .filter((s) => s.querySelector('a[href="#ref-' + n + '"]'));
      const sup = sups[i];
      if (sup) {
        const pvRect = preview.getBoundingClientRect();
        const top = sup.getBoundingClientRect().top - pvRect.top + preview.scrollTop;
        preview.scrollTop = Math.max(0, top - Math.max(20, Math.floor(preview.clientHeight / 3)));
        flashEl(sup);
        return;
      }
    }
    scrollPreviewToSrcOffset(o.offset); // 虚拟化回退：块级
  }
  function jumpBackToCitations(n) {
    const key = lastBibOrder[n - 1];
    if (!key) return;
    const occ = findCiteOccurrences(key);
    if (!occ.length) { toast(t("citeJumpNone")); return; }
    if (occ.length === 1) { jumpToCitation(occ[0], 0, n); return; }
    // 多处：弹选择器
    const list = $("cite-jump-list");
    list.innerHTML = "";
    occ.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "cite-jump-item";
      b.innerHTML = "<span class=\"cj-idx\">" + (i + 1) + "</span><span class=\"cj-snip\"></span>";
      b.querySelector(".cj-snip").textContent = o.snippet;
      b.onclick = () => { closeCiteJump(); jumpToCitation(o, i, n); };
      list.appendChild(b);
    });
    $("cite-jump-title").textContent = t("citeJumpTitle").replace("{n}", String(occ.length));
    $("cite-jump-mask").hidden = false;
  }
  function closeCiteJump() { const m = $("cite-jump-mask"); if (m) m.hidden = true; }

  // 已打开的 mermaid 查看器窗口跟踪（live update）：{label, offset}。编辑区重渲后按 data-src-offset
  // 找到对应块的新 SVG，经 emit_viewer_update 定向推给查看器窗口。块内编辑时起始偏移不变→稳定匹配。
  let liveViewers = [];
  function syncViewerWindows() {
    if (!isTauri || !liveViewers.length) return;
    const checks = liveViewers.map((v) => {
      const wrap = preview.querySelector('.mermaid-wrap[data-src-offset="' + v.offset + '"]');
      const svg = wrap && wrap.querySelector("svg");
      if (!svg) return Promise.resolve(true);          // 块暂未找到（偏移变/块删除）→ 保留待下次
      return invoke("emit_viewer_update", { target: v.label, content: svg.outerHTML })
        .then((ok) => ok !== false, () => false);        // false=目标窗口已关 → 清除跟踪
    });
    Promise.all(checks).then((keep) => { liveViewers = liveViewers.filter((_, i) => keep[i]); });
  }

  preview.addEventListener("click", (e) => {
    // 点击事件 e.target 运行时恒为 Element（preview 内点击）；收窄后 .closest 等才可校验。
    const t = /** @type {Element} */ (e.target);
    // Mermaid 图：点击渲染区 mermaid 图 → 弹大图查看器（缩放/平移/全屏）。
    // 必须在 data-src-offset 块级定位（bug_history BUG-057）之前拦截，否则点击落到源码定位；
    // 仅成功渲染（含 <svg>）的 .mermaid-wrap 触发，错误回退 .mermaid-err 不弹。
    const mwrap = t.closest && t.closest(".mermaid-wrap");
    if (mwrap && mwrap.querySelector("svg")) {
      const svgEl = mwrap.querySelector("svg");
      // Tauri：新建独立窗口显示（可移动/缩放/全屏）；记 data-src-offset 供 live update 跟踪
      if (isTauri) {
        const off = parseInt(mwrap.getAttribute("data-src-offset"), 10);
        invoke("open_viewer_window", { content: svgEl.outerHTML }).then((label) => {
          if (label && !isNaN(off)) liveViewers.push({ label, offset: off });
        }).catch(() => {});
      } else if (openViewer) openViewer(svgEl);   // 浏览器降级：页内弹窗
      return;
    }
    // 普通图片：点击非链接、非 mermaid 的 <img> → 弹独立窗口查看（位图放大仍糊）
    const imgEl = t.closest && t.closest("img");
    if (imgEl && imgEl.closest("#preview") && !imgEl.closest("a") && !imgEl.closest(".mermaid-wrap")) {
      if (isTauri) invoke("open_viewer_window", { content: imgEl.outerHTML }).catch(() => {});
      else if (openViewer) openViewer(imgEl);
      return;
    }
    // 文献表 [n] 回链：跳回正文引用处（多处则弹选择器）
    const back = t.closest(".bib-back");
    if (back) {
      e.preventDefault();
      jumpBackToCitations(parseInt(back.getAttribute("data-ref"), 10) || 0);
      return;
    }
    // 引用 [n] 上标链接：禁止默认 hash 导航（在 Tauri WKWebView 会触发主框架滚动/重排，
    // 导致工具栏/标题栏被挤出视口、下方出现空白），改为在 #preview 内手动滚动到目标条目
    const citeA = t.closest(".cite a[href^=\"#ref-\"]");
    if (citeA) {
      e.preventDefault();
      const n = citeA.getAttribute("href").slice(5);
      scrollToCite(n);
      return;
    }
    // 普通链接：http(s) 交由 document 级 opener（开系统浏览器）；mailto 由 webview 原生；
    // 文档内 #锚点 → 滚动定位；本地文件链接(.md/.html 等) → 新标签页打开，绝不替换当前文档。
    const linkA = t.closest("a[href]");
    if (linkA) {
      const href = linkA.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) return;
      e.preventDefault();
      if (href.startsWith("#")) {
        const id = href.slice(1);
        if (id) {
          const sel = window.CSS && CSS.escape ? "#" + CSS.escape(id) : "#" + id;
          const el = document.getElementById(id) || preview.querySelector(sel);
          if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
        }
        return;
      }
      openLinkInNewTab(href);
      return;
    }
    if (t.closest("a, button, .tab-close")) return;
    const unit = t.closest("[data-src-offset]"); // 列表项/表格行优先（细粒度），否则块
    if (unit) {
      // 点击用"命中的具体单元"插值（li/tr/块），最准；不走向量级 previewYToOff
      const us = parseInt(unit.getAttribute("data-src-offset"), 10);
      const ue = parseInt(unit.getAttribute("data-src-end"), 10);
      let offset = us;
      if (ue > us) {
        const ur = unit.getBoundingClientRect();
        let ratio = ur.height > 0 ? (e.clientY - ur.top) / ur.height : 0;
        if (ratio < 0) ratio = 0; if (ratio > 1) ratio = 1;
        offset = Math.round(us + ratio * (ue - us));
      }
      if (offset >= 0) {
        scrollSrc = "preview";
        editor.focus();
        editor.setSelectionRange(offset, offset);
        navPush(); // 点击定位：记一条导航点（程序化 setSelectionRange 不触发 navOnEdit）
        return;
      }
    }
    // 回退：按 Y 比例
    const rect = preview.getBoundingClientRect();
    const y = e.clientY - rect.top + preview.scrollTop;
    const r = y / (preview.scrollHeight || 1);
    const epos = Math.round(r * editor.value.length);
    scrollSrc = "preview";
    editor.focus();
    editor.setSelectionRange(epos, epos);
  });

  /* ---------- 编辑器事件 ---------- */
  editor.addEventListener("input", scheduleRender);
  editor.addEventListener("keyup", updateCursor);
  editor.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    // 列选取：Alt+Shift+方向键扩展；Esc 取消；活跃时字符/Backspace/Delete 按列作用
    if (e.altKey && e.shiftKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      const { row, col } = offToRC(editor.selectionStart);
      if (!colSel) colSel = { sr: row, sc: col, er: row, ec: col };
      const last = edLines().length - 1;
      if (e.key === "ArrowUp") colSel.er = Math.max(0, colSel.er - 1);
      else if (e.key === "ArrowDown") colSel.er = Math.min(last, colSel.er + 1);
      else if (e.key === "ArrowLeft") colSel.ec = Math.max(0, colSel.ec - 1);
      else colSel.ec = colSel.ec + 1;
      drawColSel();
      return;
    }
    if (colSel) {
      if (mod && (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X")) {
        // 列复制/剪切：写矩形块文本到剪贴板（不抢焦点，避免触发 blur 清除列选）；剪切再删列
        e.preventDefault();
        const _t = colText();
        try { const _p = navigator.clipboard && navigator.clipboard.writeText(_t); if (_p && _p.catch) _p.catch(() => {}); } catch (_) {}
        if (e.key === "x" || e.key === "X") { const _rg = colRange(); if (_rg.c1 > _rg.c0) colDelete(true); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); clearColSel(); return; }
      if (!e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) { clearColSel(); /* 落默认移动 */ }
      else if (!mod && !e.altKey && !e.isComposing && e.key.length === 1) { e.preventDefault(); colType(e.key); return; }
      else if (!mod && !e.altKey && (e.key === "Backspace" || e.key === "Delete")) { e.preventDefault(); colDelete(e.key === "Delete"); return; }
      else if (e.key === "Enter" || e.key === "Tab") { clearColSel(); /* 落默认 */ }
    }
    // 浏览器降级快捷键；Tauri 中由原生菜单（加速键）触发，避免重复
    if (!isTauri && mod) {
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); saveFile(); return; }
      if (k === "o") { e.preventDefault(); openFile(); return; }
      if (k === "n") { e.preventDefault(); newFile(); return; }
      if (k === "b") { e.preventDefault(); MD.bold(); return; }
      if (k === "i") { e.preventDefault(); MD.italic(); return; }
      if (k === "k") { e.preventDefault(); MD.link(); return; }
      if (k === "e") { e.preventDefault(); MD.code(); return; }
      if (k === "f") { e.preventDefault(); openSearch(false); return; }
      if (k === "h") { e.preventDefault(); openSearch(true); return; }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const s = editor.selectionStart, en = editor.selectionEnd;
      editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(en);
      editor.setSelectionRange(s + 2, s + 2);
      scheduleRender();
    }
  });

  /* ---------- 列选取（矩形块选）----------
     等宽编辑器：Alt/Option+拖拽 或 Alt+Shift+方向键 进入列选；活跃时输入/Backspace/Delete
     按列作用于多行（多光标），复制/剪切取矩形块文本；Esc/普通方向键/切标签/切视图取消。
     注：按等宽字宽算列像素位置，文档内 Tab 会令对齐略有偏差（本编辑器 Tab 插入 2 空格，故罕见）。 */
  let colSel = null;        // {sr,sc,er,ec} 0 基行列
  let colDrag = false;
  let _cw = 0, _measurer = null, _m = null;
  function charW() {
    if (!_cw) {
      if (!_measurer) {
        _measurer = document.createElement("span");
        _measurer.style.cssText = "position:absolute;visibility:hidden;white-space:pre;top:-9999px;left:-9999px;";
        document.body.appendChild(_measurer);
      }
      const cs = getComputedStyle(editor);
      _measurer.style.fontFamily = cs.fontFamily;
      _measurer.style.fontSize = cs.fontSize;
      _measurer.textContent = "M".repeat(100);
      _cw = _measurer.getBoundingClientRect().width / 100;
    }
    return _cw || 8;
  }
  function edMetrics() {
    if (!_m) {
      const cs = getComputedStyle(editor);
      _m = {
        padL: parseFloat(cs.paddingLeft) || 24,
        padT: parseFloat(cs.paddingTop) || 20,
        lh: parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.7) || 23.8,
      };
    }
    return _m;
  }
  function edLines() { return editor.value.split("\n"); }
  function offToRC(p) { const b = editor.value.slice(0, p); return { row: b.split("\n").length - 1, col: p - (b.lastIndexOf("\n") + 1) }; }
  function rcToOff(row, col) {
    const lines = edLines();
    let off = 0;
    for (let i = 0; i < row && i < lines.length; i++) off += lines[i].length + 1;
    return off + Math.min(col, (lines[row] || "").length);
  }
  function ptToRC(x, y) {
    const r = editor.getBoundingClientRect(), m = edMetrics();
    return {
      row: Math.max(0, Math.floor((y - r.top - m.padT + editor.scrollTop) / m.lh)),
      col: Math.max(0, Math.round((x - r.left - m.padL + editor.scrollLeft) / charW())),
    };
  }
  function colRange() { if (!colSel) return null; return { r0: Math.min(colSel.sr, colSel.er), r1: Math.max(colSel.sr, colSel.er), c0: Math.min(colSel.sc, colSel.ec), c1: Math.max(colSel.sc, colSel.ec) }; }
  function drawColSel() {
    let ov = document.getElementById("colsel-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "colsel-overlay"; ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;"; document.body.appendChild(ov); }
    ov.innerHTML = "";
    if (!colSel) { editor.classList.remove("colsel-active"); ov.style.display = "none"; return; }
    editor.classList.add("colsel-active"); ov.style.display = "";
    const r = editor.getBoundingClientRect(), cw = charW(), m = edMetrics(), lines = edLines();
    const { r0, r1, c0, c1 } = colRange();
    const zero = c0 === c1;
    for (let row = r0; row <= r1; row++) {
      const x = r.left + m.padL + c0 * cw - editor.scrollLeft;
      const y = r.top + m.padT + row * m.lh - editor.scrollTop;
      const d = document.createElement("div");
      if (zero) d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:1px;height:${m.lh}px;background:rgba(80,140,255,.8);`;
      else d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${(c1 - c0) * cw}px;height:${m.lh}px;background:rgba(80,140,255,.25);box-shadow:inset 0 0 0 1px rgba(80,140,255,.5);`;
      ov.appendChild(d);
    }
  }
  function clearColSel() { if (colSel) { colSel = null; drawColSel(); } }
  function colText() { const { r0, r1, c0, c1 } = colRange(); const lines = edLines(); const out = []; for (let r = r0; r <= r1; r++) out.push((lines[r] || "").slice(c0, c1)); return out.join("\n"); }
  function colType(ch) {
    const { r0, r1, c0, c1 } = colRange();
    const lines = edLines().slice();
    for (let r = r0; r <= r1; r++) {
      let ln = lines[r] || "";
      while (ln.length < c0) ln += " ";                // 短行补空格对齐列
      lines[r] = ln.slice(0, c0) + ch + ln.slice(c1);  // 替换 [c0,c1) 为 ch
    }
    editor.value = lines.join("\n");
    const nc = c0 + 1;
    colSel = { sr: r0, sc: nc, er: r1, ec: nc };
    try { editor.setSelectionRange(rcToOff(r0, nc), rcToOff(r0, nc)); } catch (_) {}
    scheduleRender(); drawColSel(); updateCursor();
  }
  function colDelete(forward) {
    const { r0, r1, c0, c1 } = colRange();
    const wide = c1 > c0;
    const lines = edLines().slice();
    for (let r = r0; r <= r1; r++) {
      let ln = lines[r] || "";
      if (wide) ln = ln.slice(0, c0) + ln.slice(c1);
      else if (forward) ln = ln.slice(0, c0) + ln.slice(c0 + 1);
      else ln = ln.slice(0, Math.max(0, c0 - 1)) + ln.slice(c0);
      lines[r] = ln;
    }
    editor.value = lines.join("\n");
    const nc = wide ? c0 : (forward ? c0 : Math.max(0, c0 - 1));
    colSel = { sr: r0, sc: nc, er: r1, ec: nc };
    try { editor.setSelectionRange(rcToOff(r0, nc), rcToOff(r0, nc)); } catch (_) {}
    scheduleRender(); drawColSel(); updateCursor();
  }
  editor.addEventListener("mousedown", (e) => {
    if (!e.altKey) { if (colSel) clearColSel(); return; }
    e.preventDefault();
    const { row, col } = ptToRC(e.clientX, e.clientY);
    if (e.shiftKey && colSel) { colSel.er = row; colSel.ec = col; }   // Alt+Shift+点击：扩展
    else colSel = { sr: row, sc: col, er: row, ec: col };             // Alt+拖拽：新建
    colDrag = true; drawColSel();
  });
  document.addEventListener("mousemove", (e) => { if (!colDrag || !colSel) return; const { row, col } = ptToRC(e.clientX, e.clientY); colSel.er = row; colSel.ec = col; drawColSel(); });
  document.addEventListener("mouseup", () => { colDrag = false; });
  editor.addEventListener("scroll", () => { if (colSel) drawColSel(); });
  editor.addEventListener("blur", () => { if (colSel) clearColSel(); });
  editor.addEventListener("copy", (e) => { if (!colSel) return; e.preventDefault(); e.clipboardData.setData("text/plain", colText()); });
  editor.addEventListener("cut", (e) => {
    if (!colSel) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", colText());
    const { c0, c1 } = colRange();
    if (c1 > c0) setTimeout(() => colDelete(true), 0);   // 有选区才删（零宽列无可删内容）
  });

  /* ---------- 菜单事件（Tauri 原生菜单转发）---------- */
  function handleMenu(id) {
    switch (id) {
      case "new": newFile(); break;
      case "open": openFile(); break;
      case "close-file": closeFile(); break;
      case "save": saveFile(); break;
      case "save-as": saveAs(); break;
      case "convert-md": convertToMd(); break;
      case "convert-html": convertToHtml(); break;
      case "close": window.close(); break;
      case "help": openHelp(); break;
      case "find": openSearch(false); break;
      case "replace": openSearch(true); break;
      case "bold": MD.bold(); break;
      case "italic": MD.italic(); break;
      case "code": MD.code(); break;
      case "link": MD.link(); break;
      case "h1": MD.h1(); break;
      case "h2": MD.h2(); break;
      case "h3": MD.h3(); break;
      case "quote": MD.quote(); break;
      case "ul": MD.ul(); break;
      case "ol": MD.ol(); break;
      case "task": MD.task(); break;
      case "formula": MD.formula(); break;
      case "image": MD.image(); break;
      case "table": MD.table(); break;
      case "hr": MD.hr(); break;
      case "toggle-theme": toggleTheme(); break;
      case "sync-scroll": $("sync-btn").click(); break;
      case "load-bib": loadBib(); break;
      case "clear-bib": unloadBib(); break;
      case "cite-example": openCiteExample(); break;
      case "mermaid-example": openMermaidExample(); break;
      case "mdex-example": openMdexExample(); break;
      default:
        if (id.indexOf("lang-") === 0) setLang(id.slice(5));
        break;
      case "view-split": setViewMode("split"); break;
      case "view-editor": setViewMode("editor"); break;
      case "view-preview": setViewMode("preview"); break;
    }
  }
  if (T && T.event && T.event.listen) {
    T.event.listen("menu-action", (e) => {
      const id = String(e.payload);
      handleMenu(id);
    });
    T.event.listen("file-drop", (e) => {
      const paths = Array.isArray(e.payload) ? e.payload : [];
      if (paths.length) handleDropPaths(paths);
    });
    // 文件已在某窗口打开、再次双击时，后端置顶该窗口并 emit "focus-file"。
    // 仅切到【本窗口已存在的同路径标签】；本窗口没有则忽略——绝不在此创建新标签，避免多窗口重复开标签。
    T.event.listen("focus-file", (e) => {
      const p = String(e.payload);
      const dup = p && tabs.find((x) => x.path === p);
      if (dup) switchTab(dup.id);
    });
    // #3 关窗 dirty 确认：拦截原生关闭请求，若有未保存标签则逐个走"保存/不保存/取消"，
    // 全部处理完才放行；用户取消任一则中止关窗。API 不可用时优雅降级（行为同改前：直接关 + pagehide 刷盘）。
    // 结构性根因修法：viewer 窗口（mermaid-*）根本【不注册】本拦截器——而非注册后运行时判断。
    // 处理器内仍保留 isViewerWindow 兜底，覆盖"winLabel 检测失败（viewer 误判为 main）仍注册"的边界。
    if (!winLabel.startsWith("mermaid-")) {
    let windowCloseConfirmed = false;
    try {
      const wm = T.window || (T.webviewWindow || {});
      const cwin = wm.getCurrentWindow ? wm.getCurrentWindow() : (wm.getCurrentWebviewWindow ? wm.getCurrentWebviewWindow() : null);
      if (cwin && typeof cwin.onCloseRequested === "function") {
        cwin.onCloseRequested(async (event) => {
          if (isViewerWindow || winLabel.startsWith("mermaid-")) return; // viewer 窗口无编辑内容，绝不拦截关闭
          if (windowCloseConfirmed) return;                  // 本轮已确认 → 放行默认关闭
          if (!tabs.some((x) => x.dirty)) return;             // 无未保存标签 → 放行
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          else return;                                         // 无法拦截 → 不阻拦（降级为改前行为）
          const pending = tabs.filter((x) => x.dirty).slice();
          for (const tab of pending) {
            if (activeId !== tab.id) switchTab(tab.id);
            const choice = await confirmCloseDialog();
            if (!choice || choice === "cancel") return;       // 取消 → 中止关窗，保持现状
            if (choice === "save") {
              const ok = await saveFile(tab);
              if (!ok || tab.dirty) return;                   // 保存取消/失败 → 中止关窗
            }
            // choice === "discard" → 丢弃（继续关）
          }
          windowCloseConfirmed = true;
          writeDraftNow();                                     // 落盘最终会话后再关
          try { await cwin.close(); } catch (_) {}            // 再次关闭（本次 windowCloseConfirmed=true 直接放行）
        });
      }
    } catch (_) {}
    } // end if (!winLabel.startsWith("mermaid-")) —— viewer 窗口不注册 close 拦截
    // 其它窗口切换语言时同步本窗口工具栏文案
    T.event.listen("lang-changed", (e) => {
      curLang = String(e.payload);
      if (!I18N[curLang]) curLang = "zh";
      try { localStorage.setItem("md-lang", curLang); } catch (_) {}
      applyLang();
      initMermaid();   // C9: 与 setLang 同步——mermaid 主题随语言刷新
      scheduleRender(); // C9: 预览中渲染时烘焙的文案（如「参考文献」标题、示例模板）随之刷新
    });
  }

  /* ---------- 键盘快捷键（每窗独立）----------
     多窗口下：菜单加速键经应用级 on_menu_event 派发，目标窗口判定不可靠（会作用到错误/全部窗口）。
     改为在前端监听 keydown——每个 webview 各自独立，按键只在本窗口触发，天然窗口隔离、绝不串窗。
     菜单栏的加速键已全部移除（改 None），故按键直达 webview 而不被菜单拦截；菜单项本身仍可鼠标点击。
  */
  const SHORTCUT_TO_MENU = {
    n: "new", o: "open", w: "close-file", s: "save",
    b: "bold", i: "italic", e: "code", k: "link", f: "find", h: "replace",
  };
  document.addEventListener("keydown", (e) => {
    if (!isTauri) return; // 浏览器模式由 editor 内的 !isTauri 降级快捷键负责，避免重复触发
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = (e.key || "").toLowerCase();
    // 带 Shift 的组合：关闭窗口 / 另存为
    if (e.shiftKey && k === "w") { e.preventDefault(); handleMenu("close"); return; }
    if (e.shiftKey && k === "s") { e.preventDefault(); handleMenu("save-as"); return; }
    if (SHORTCUT_TO_MENU[k]) { e.preventDefault(); handleMenu(SHORTCUT_TO_MENU[k]); }
  });

  /* ---------- 字体 / 图片缩放快捷键（每窗独立，Tauri 与浏览器均生效）----------
     Cmd/Ctrl + =/-/0（及小键盘 +-/0）。缩放【最后点击的窗格】：点编辑器→编辑器字体、点预览→预览字体；
     查看器打开时缩放图。按"最后点击窗格"而非 Shift 区分——因 "+" 在多数键盘是 Shift+=，
     用 Shift 区分会与"放大当前窗格"的直觉冲突。用 e.code（物理键，不随 Shift 变字符）。 */
  let zoomTarget = "editor"; // "editor" | "preview"：最后点击的窗格（mousedown 更新）
  // 用 mousedown 而非 focus 追踪：点击预览会触发 click-to-locate -> editor.focus()，
  // 若用 focus 监听会把 zoomTarget 改回 editor；mousedown 是用户直接点击意图，程序化 focus 不触发。
  editor.addEventListener("mousedown", () => { zoomTarget = "editor"; });
  preview.addEventListener("mousedown", () => { zoomTarget = "preview"; });
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const code = e.code || "";
    const isIn = code === "Equal" || code === "NumpadAdd";
    const isOut = code === "Minus" || code === "NumpadSubtract";
    const isReset = code === "Digit0" || code === "Numpad0";
    if (!isIn && !isOut && !isReset) return;
    const mvMask = $("mermaid-viewer");
    const viewerOpen = mvMask && !mvMask.hidden;
    e.preventDefault();
    const click = (id) => { const b = $(id); if (b) b.click(); };
    if (viewerOpen) {                                   // 查看器（独立窗口/页内弹窗）打开 → 缩放图
      if (isIn) click("mv-in"); else if (isOut) click("mv-out"); else click("mv-reset");
    } else if (zoomTarget === "preview") {              // 最后点击预览区 → 预览区字体
      if (isIn) click("pz-in"); else if (isOut) click("pz-out"); else click("pz-lvl");
    } else {                                            // 最后点击编辑器（默认）→ 编辑器字体
      if (isIn) click("ez-in"); else if (isOut) click("ez-out"); else click("ez-lvl");
    }
  });

  /* ---------- 顶栏按钮 ---------- */
  /** querySelector 的非空 HTMLElement 版（顶栏按钮均确定存在）。 */
  const $q = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
  $q('[data-act="new"]').onclick = newFile;
  $q('[data-act="open"]').onclick = openFile;
  $q('[data-act="close-file"]').onclick = closeFile;
  $q('[data-act="save"]').onclick = saveFile;
  $q('[data-act="save-as"]').onclick = saveAs;
  // 📚 文献库按钮（与卸载共用）：未加载→直接加载；已加载→弹浮层（更换/卸载）
  function bibLoaded() {
    const tab = activeTab();
    return !!(tab && tab.bibText && tab.bibText.trim());
  }
  function closeBibPop() { const p = $("bib-pop"); if (p) p.hidden = true; }
  function toggleBibPop() {
    const p = $("bib-pop"); if (!p) return;
    p.hidden = !p.hidden;
  }
  $("bib-btn").onclick = (e) => {
    e.stopPropagation();
    if (bibLoaded()) toggleBibPop(); else { closeBibPop(); loadBib(); }
  };
  $("bib-replace").onclick = () => { closeBibPop(); loadBib(); };
  $("bib-unload").onclick = () => { closeBibPop(); unloadBib(); };
  document.addEventListener("click", (e) => {
    const p = $("bib-pop"); if (!p || p.hidden) return;
    const et = /** @type {Element} */ (e.target);
    if (!p.contains(et) && et.id !== "bib-btn") closeBibPop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeBibPop();
    closeColorPop();
    closeCiteJump();
  });
  /* ---------- 文字颜色：下拉色板，用 <span style="color:..."> 包裹选区 ---------- */
  const COLORS = ["#e03131","#f08c00","#e8a317","#2f9e44","#0c8599","#1971c2","#9c36b5","#d6336c","#a0522d","#868e96","#1098ad","#1a1a1a"];
  (function initColorPop() {
    const pop = $("color-pop"); if (!pop) return;
    pop.innerHTML = COLORS.map((c) =>
      '<button type="button" class="color-sw" data-color="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + c + '"></button>'
    ).join("");
  })();
  function closeColorPop() { const p = $("color-pop"); if (p) p.hidden = true; }
  function applyColor(c) {
    // c 仅来自硬编码色板（hex），非用户输入；仍做格式校验防注入
    if (!/^#[0-9a-fA-F]{3,8}$/.test(c)) return;
    wrapSelection('<span style="color: ' + c + ';">', "</span>", colorI18n().coloredText);
  }
  $("color-btn").onclick = (e) => {
    e.stopPropagation();
    const p = $("color-pop");
    if (p) { p.hidden = !p.hidden; closeBibPop(); }
  };
  $("color-pop").addEventListener("click", (e) => {
    const sw = /** @type {Element} */ (e.target).closest(".color-sw"); if (!sw) return;
    applyColor(/** @type {HTMLElement} */ (sw).dataset.color);
    closeColorPop();
  });
  document.addEventListener("click", (e) => {
    const p = $("color-pop"); if (!p || p.hidden) return;
    const et = /** @type {Element} */ (e.target);
    if (!p.contains(et) && et.id !== "color-btn") closeColorPop();
  });
  // 引用回跳选择器：点遮罩 / 取消 关闭
  $("cite-jump-mask").addEventListener("click", (e) => { if (e.target === $("cite-jump-mask")) closeCiteJump(); });
  $("cite-jump-cancel").onclick = closeCiteJump;

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------- 帮助文档 ---------- */
  // 帮助正文随界面语言切换；17 种界面语言各有对应文案。联系人在中文界面用「郑法伟」，
  // 其余语言用「Fawei Zheng (郑法伟)」。代码片段（快捷键、Markdown 语法）跨语言共用。
  const SK = ["⌘/Ctrl + N","⌘/Ctrl + O","⌘/Ctrl + S","⌘/Ctrl + Shift + S","⌘/Ctrl + W","⌘/Ctrl + Shift + W","⌘/Ctrl + F","⌘/Ctrl + H","⌘/Ctrl + B","⌘/Ctrl + I","⌘/Ctrl + E","⌘/Ctrl + K","Tab","Alt/Option + Drag","Alt/Option + Shift + ←↑↓→","Esc"];
  const sc = (acts) => SK.map((k, i) => ({ k, a: acts[i] }));
  // 帮助文档「联系我们」区两个外部链接（GitHub 源码 / 下载站点）的本地化标签。URL 本身各语言相同。
  const LINK_LABELS = {
    zh: { source: "源代码", download: "下载站点" },
    en: { source: "Source code", download: "Download" },
    fr: { source: "Code source", download: "Téléchargement" },
    de: { source: "Quellcode", download: "Download" },
    ru: { source: "Исходный код", download: "Скачать" },
    it: { source: "Codice sorgente", download: "Download" },
    ja: { source: "ソースコード", download: "ダウンロード" },
    ko: { source: "소스 코드", download: "다운로드" },
    es: { source: "Código fuente", download: "Descarga" },
    pt: { source: "Código-fonte", download: "Download" },
    ar: { source: "الكود المصدري", download: "تنزيل" },
    hi: { source: "स्रोत कोड", download: "डाउनलोड" },
    pa: { source: "ਸਰੋਤ ਕੋਡ", download: "ਡਾਊਨਲੋਡ" },
    vi: { source: "Mã nguồn", download: "Tải xuống" },
    id: { source: "Kode sumber", download: "Unduh" },
    ur: { source: "سورس کوڈ", download: "ڈاؤن لوڈ" },
    mn: { source: "Эх код", download: "Татаж авах" },
  };
  // 文字颜色按钮的本地化：title=鼠标悬停标题，coloredText=无选区时插入的占位文字。
  const COLOR_I18N = {
    zh: { color: "文字颜色", coloredText: "彩色文字" },
    en: { color: "Text color", coloredText: "colored text" },
    fr: { color: "Couleur du texte", coloredText: "texte coloré" },
    de: { color: "Textfarbe", coloredText: "farbiger Text" },
    ru: { color: "Цвет текста", coloredText: "цветной текст" },
    it: { color: "Colore del testo", coloredText: "testo colorato" },
    ja: { color: "文字の色", coloredText: "色付きテキスト" },
    ko: { color: "글자 색", coloredText: "색상 글자" },
    es: { color: "Color del texto", coloredText: "texto de color" },
    pt: { color: "Cor do texto", coloredText: "texto colorido" },
    ar: { color: "لون النص", coloredText: "نص ملوّن" },
    hi: { color: "पाठ रंग", coloredText: "रंगीन पाठ" },
    pa: { color: "ਟੈਕਸਟ ਰੰਗ", coloredText: "ਰੰਗੀਨ ਟੈਕਸਟ" },
    vi: { color: "Màu chữ", coloredText: "văn bản màu" },
    id: { color: "Warna teks", coloredText: "teks berwarna" },
    ur: { color: "متن کا رنگ", coloredText: "رنگین متن" },
    mn: { color: "Текстний өнгө", coloredText: "өнгөт бичвэр" },
  };
  function colorI18n() { return COLOR_I18N[curLang] || COLOR_I18N.en; }
  // Mermaid 图查看器（点击放大弹窗）的本地化文案。回退 en（与 COLOR_I18N/NAV_I18N 同策略）。
  const MERMAID_I18N = {
    zh: { title: "Mermaid 图", imageTitle: "图片", center: "居中（保持缩放）", zoomIn: "放大", zoomOut: "缩小", reset: "重置缩放", fullscreen: "全屏", exitFullscreen: "退出全屏", close: "关闭", hint: "滚轮缩放 · 拖拽平移" },
    en: { title: "Mermaid Diagram", imageTitle: "Image", center: "Center (keep zoom)", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset zoom", fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen", close: "Close", hint: "Scroll to zoom · Drag to pan" },
    fr: { title: "Diagramme Mermaid", imageTitle: "Image", center: "Centrer (zoom constant)", zoomIn: "Agrandir", zoomOut: "Réduire", reset: "Réinitialiser le zoom", fullscreen: "Plein écran", exitFullscreen: "Quitter le plein écran", close: "Fermer", hint: "Molette pour zoomer · Glisser pour déplacer" },
    de: { title: "Mermaid-Diagramm", imageTitle: "Bild", center: "Zentrieren (Zoom behalten)", zoomIn: "Vergrößern", zoomOut: "Verkleinern", reset: "Zoom zurücksetzen", fullscreen: "Vollbild", exitFullscreen: "Vollbild beenden", close: "Schließen", hint: "Scrollen zum Zoomen · Ziehen zum Verschieben" },
    ru: { title: "Диаграмма Mermaid", imageTitle: "Изображение", center: "Центрировать (без изменения масштаба)", zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Сбросить масштаб", fullscreen: "Во весь экран", exitFullscreen: "Выйти из полноэкранного режима", close: "Закрыть", hint: "Колесо для масштаба · Перетаскивание для сдвига" },
    it: { title: "Diagramma Mermaid", imageTitle: "Immagine", center: "Centra (mantieni zoom)", zoomIn: "Ingrandisci", zoomOut: "Riduci", reset: "Reimposta zoom", fullscreen: "Schermo intero", exitFullscreen: "Esci da schermo intero", close: "Chiudi", hint: "Scorri per zoom · Trascina per spostare" },
    ja: { title: "Mermaid 図", imageTitle: "画像", center: "中央に配置（ズーム維持）", zoomIn: "拡大", zoomOut: "縮小", reset: "ズームをリセット", fullscreen: "全画面", exitFullscreen: "全画面を終了", close: "閉じる", hint: "スクロールでズーム · ドラッグで移動" },
    ko: { title: "Mermaid 다이어그램", imageTitle: "이미지", center: "가운데 (확대 유지)", zoomIn: "확대", zoomOut: "축소", reset: "확대 초기화", fullscreen: "전체 화면", exitFullscreen: "전체 화면 종료", close: "닫기", hint: "스크롤로 확대 · 드래그로 이동" },
    es: { title: "Diagrama Mermaid", imageTitle: "Imagen", center: "Centrar (mantener zoom)", zoomIn: "Acercar", zoomOut: "Alejar", reset: "Restablecer zoom", fullscreen: "Pantalla completa", exitFullscreen: "Salir de pantalla completa", close: "Cerrar", hint: "Rueda para zoom · Arrastrar para mover" },
    pt: { title: "Diagrama Mermaid", imageTitle: "Imagem", center: "Centralizar (manter zoom)", zoomIn: "Ampliar", zoomOut: "Reduzir", reset: "Redefinir zoom", fullscreen: "Tela cheia", exitFullscreen: "Sair da tela cheia", close: "Fechar", hint: "Roda para zoom · Arrastar para mover" },
    ar: { title: "مخطط Mermaid", imageTitle: "صورة", center: "توسيط (مع الحفاظ على التكبير)", zoomIn: "تكبير", zoomOut: "تصغير", reset: "إعادة ضبط التكبير", fullscreen: "ملء الشاشة", exitFullscreen: "إنهاء ملء الشاشة", close: "إغلاق", hint: "العجلة للتقريب · السحب للتحريك" },
    hi: { title: "Mermaid आरेख", imageTitle: "छवि", center: "केंद्रित करें (ज़ूम बनाए रखें)", zoomIn: "बड़ा करें", zoomOut: "छोटा करें", reset: "ज़ूम रीसेट", fullscreen: "पूर्ण स्क्रीन", exitFullscreen: "पूर्ण स्क्रीन से बाहर", close: "बंद करें", hint: "ज़ूम के लिए स्क्रॉल · खिसकाने के लिए खींचें" },
    pa: { title: "Mermaid ਚਿੱਤਰ", imageTitle: "ਚਿੱਤਰ", center: "ਕੇਂਦਰਿਤ (ਜ਼ੂਮ ਬਰਕਰਾਰ)", zoomIn: "ਜ਼ੂਮ ਇਨ", zoomOut: "ਜ਼ੂਮ ਆਉਟ", reset: "ਜ਼ੂਮ ਰੀਸੈਟ", fullscreen: "ਪੂਰੀ ਸਕਰੀਨ", exitFullscreen: "ਪੂਰੀ ਸਕਰੀਨ ਬੰਦ", close: "ਬੰਦ ਕਰੋ", hint: "ਜ਼ੂਮ ਲਈ ਸਕ੍ਰੋਲ · ਹਿਲਾਉਣ ਲਈ ਖਿੱਚੋ" },
    vi: { title: "Sơ đồ Mermaid", imageTitle: "Hình ảnh", center: "Căn giữa (giữ zoom)", zoomIn: "Phóng to", zoomOut: "Thu nhỏ", reset: "Đặt lại zoom", fullscreen: "Toàn màn hình", exitFullscreen: "Thoát toàn màn hình", close: "Đóng", hint: "Cuộn để zoom · Kéo để di chuyển" },
    id: { title: "Diagram Mermaid", imageTitle: "Gambar", center: "Tengah (pertahankan zoom)", zoomIn: "Perbesar", zoomOut: "Perkecil", reset: "Reset zoom", fullscreen: "Layar penuh", exitFullscreen: "Keluar layar penuh", close: "Tutup", hint: "Gulir untuk zoom · Seret untuk geser" },
    ur: { title: "Mermaid خاکہ", imageTitle: "تصویر", center: "مرکز (زوم برقرار)", zoomIn: "زوم اِن", zoomOut: "زوم آؤٹ", reset: "زوم ری سیٹ", fullscreen: "پوری اسکرین", exitFullscreen: "پوری اسکرین سے نکلیں", close: "بند کریں", hint: "زوم کے لیے اسکرول · منتقل کرنے کے لیے گھسیٹیں" },
    mn: { title: "Mermaid диаграмм", imageTitle: "Зураг", center: "Төвлөрөх (томруулалт хадгалах)", zoomIn: "Томруулах", zoomOut: "Жижиглэх", reset: "Хэмжээ шинэчлэх", fullscreen: "Бүтэн дэлгэц", exitFullscreen: "Бүтэн дэлгэцээс гарах", close: "Хаах", hint: "Жолоогоор томруул · Чирж шилжүүл" },
  };
  function mermaidI18n() { return MERMAID_I18N[curLang] || MERMAID_I18N.en; }
  // 编辑区/预览区字体缩放控件的本地化文案。回退 en（与 COLOR_I18N/NAV_I18N 同策略）。
  const ZOOM_I18N = {
    zh: { zoomIn: "放大", zoomOut: "缩小", reset: "重置字号" },
    en: { zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset font size" },
    fr: { zoomIn: "Agrandir", zoomOut: "Réduire", reset: "Réinitialiser la taille" },
    de: { zoomIn: "Vergrößern", zoomOut: "Verkleinern", reset: "Schriftgröße zurücksetzen" },
    ru: { zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Сбросить размер шрифта" },
    it: { zoomIn: "Ingrandisci", zoomOut: "Riduci", reset: "Reimposta dimensione" },
    ja: { zoomIn: "拡大", zoomOut: "縮小", reset: "文字サイズをリセット" },
    ko: { zoomIn: "확대", zoomOut: "축소", reset: "글자 크기 초기화" },
    es: { zoomIn: "Acercar", zoomOut: "Alejar", reset: "Restablecer tamaño" },
    pt: { zoomIn: "Ampliar", zoomOut: "Reduzir", reset: "Redefinir tamanho" },
    ar: { zoomIn: "تكبير", zoomOut: "تصغير", reset: "إعادة ضبط حجم الخط" },
    hi: { zoomIn: "बड़ा करें", zoomOut: "छोटा करें", reset: "फ़ॉन्ट आकार रीसेट" },
    pa: { zoomIn: "ਜ਼ੂਮ ਇਨ", zoomOut: "ਜ਼ੂਮ ਆਉਟ", reset: "ਫੌਂਟ ਆਕਾਰ ਰੀਸੈਟ" },
    vi: { zoomIn: "Phóng to", zoomOut: "Thu nhỏ", reset: "Đặt lại cỡ chữ" },
    id: { zoomIn: "Perbesar", zoomOut: "Perkecil", reset: "Reset ukuran font" },
    ur: { zoomIn: "زوم اِن", zoomOut: "زوم آؤٹ", reset: "فونٹ سائز ری سیٹ" },
    mn: { zoomIn: "Томруулах", zoomOut: "Жижиглэх", reset: "Фонтын хэмжээ шинэчлэх" },
  };
  function zoomI18n() { return ZOOM_I18N[curLang] || ZOOM_I18N.en; }
  // 图片文件夹重名自动改名时的提示。{n}=新文件夹名。回退 en。
  const IMG_I18N = {
    zh: { renamed: "目标已有同名文件夹，图片文件夹已改名为 {n}" },
    en: { renamed: "A folder with the same name already exists; image folder renamed to {n}" },
    fr: { renamed: "Un dossier de même nom existait déjà ; dossier d'images renommé en {n}" },
    de: { renamed: "Ein Ordner gleichen Namens existierte bereits; Bildordner umbenannt in {n}" },
    ru: { renamed: "Папка с таким именем уже существовала; папка изображений переименована в {n}" },
    it: { renamed: "Esisteva già una cartella con lo stesso nome; cartella immagini rinominata in {n}" },
    ja: { renamed: "同名フォルダが既存のため、画像フォルダを {n} に変更しました" },
    ko: { renamed: "같은 이름의 폴더가 있어 이미지 폴더 이름을 {n}(으)로 바꿨습니다" },
    es: { renamed: "Ya existía una carpeta con el mismo nombre; carpeta de imágenes renombrada a {n}" },
    pt: { renamed: "Já existia uma pasta com o mesmo nome; pasta de imagens renomeada para {n}" },
    ar: { renamed: "كانت هناك مجلدات بنفس الاسم؛ تمت إعادة تسمية مجلد الصور إلى {n}" },
    hi: { renamed: "उसी नाम का फ़ोल्डर पहले से था; छवि फ़ोल्डर का नाम बदलकर {n} कर दिया गया" },
    pa: { renamed: "ਉਹੀ ਨਾਮ ਵਾਲਾ ਫੋਲਡਰ ਪਹਿਲਾਂ ਸੀ; ਚਿੱਤਰ ਫੋਲਡਰ ਦਾ ਨਾਮ {n} ਕਰ ਦਿੱਤਾ ਗਿਆ" },
    vi: { renamed: "Đã có thư mục cùng tên; thư mục hình ảnh đã đổi thành {n}" },
    id: { renamed: "Folder dengan nama yang sama sudah ada; folder gambar diubah namanya menjadi {n}" },
    ur: { renamed: "اسی نام کا فولڈر پہلے سے تھا؛ تصویر فولڈر کا نام {n} کر دیا گیا" },
    mn: { renamed: "Ижил нэртэй хавтас байсан тул зургийн хавтасыг {n} болгов" },
  };
  function imgI18n() { return IMG_I18N[curLang] || IMG_I18N.en; }
  // 返回/前进按钮的本地化标题。
  const NAV_I18N = {
    zh: { back: "返回", fwd: "前进" },
    en: { back: "Back", fwd: "Forward" },
    fr: { back: "Retour", fwd: "Suivant" },
    de: { back: "Zurück", fwd: "Vor" },
    ru: { back: "Назад", fwd: "Вперёд" },
    it: { back: "Indietro", fwd: "Avanti" },
    ja: { back: "戻る", fwd: "進む" },
    ko: { back: "뒤로", fwd: "앞으로" },
    es: { back: "Atrás", fwd: "Adelante" },
    pt: { back: "Voltar", fwd: "Avançar" },
    ar: { back: "رجوع", fwd: "للأمام" },
    hi: { back: "पीछे", fwd: "आगे" },
    pa: { back: "ਪਿੱਛੇ", fwd: "ਅੱਗੇ" },
    vi: { back: "Lùi", fwd: "Tiến" },
    id: { back: "Mundur", fwd: "Maju" },
    ur: { back: "پیچھے", fwd: "آگے" },
    mn: { back: "Буцах", fwd: "Урагш" },
  };
  function navI18n() { return NAV_I18N[curLang] || NAV_I18N.en; }
  function buildHelp(s) {
    const ll = LINK_LABELS[curLang] || LINK_LABELS.en;
    const pairs = (arr) => "<ul>" + arr.map((f) => "<li><strong>" + f.b + "</strong>" + f.t + "</li>").join("") + "</ul>";
    const lis = (arr) => "<ul>" + arr.map((x) => "<li>" + x + "</li>").join("") + "</ul>";
    const rows = (arr) => arr.map((r) => "<tr><td><code>" + r.k + "</code></td><td>" + r.a + "</td></tr>").join("");
    return [
      "<p class=\"pron-line\"><strong>MDeX</strong> · " + s.pPron + "</p>",
      "<p>" + s.pIntro.replace("{ver}", appVersion || "1.4.0") + "</p>",
      "<h2>" + s.hFeatures + "</h2>", pairs(s.features),
      "<h2>" + s.hShortcuts + "</h2>", "<p>" + s.pShortcut + "</p>",
      "<table><tr><th>" + s.thKey + "</th><th>" + s.thAction + "</th></tr>" + rows(s.shortcuts) + "</table>",
      "<h2>" + s.hMd + "</h2>", lis(s.md),
      "<h2>" + s.hMath + "</h2>", lis(s.math),
      "<h2>" + s.hCite + "</h2>", lis(s.cite),
      "<h2>" + s.hExport + "</h2>", "<p>" + s.pExport + "</p>", pairs(s.export),
      "<h2>" + s.hLicense + "</h2>", "<p>" + s.pLicense + "</p>",
      "<h2>" + s.hContact + "</h2>", "<p>" + s.pContact + "</p>",
      "<div class=\"contact\"><span class=\"name\">" + s.contactName + "</span><br><a href=\"mailto:fwzheng@bit.edu.cn\">fwzheng@bit.edu.cn</a></div>",
    ].join("");
  }
  // 文献引用帮助：按「情形」分组介绍，中英两版；其余界面语言复用英文版
  const CITE_HELP_ZH = [
    "<strong>一、引用写法（按情形）</strong>",
    "<strong>单条引用</strong>：<code>[@key]</code> → [1]",
    "<strong>多条并列</strong>：<code>[@a; @b]</code> → [1, 2]（用分号分隔，可多于两条）",
    "<strong>带定位符</strong>：<code>[@key, p. 12]</code> → [1, p. 12]；也支持 <code>ch. 5</code>（章）、<code>fig. 2</code>（图）、<code>§3</code>（节）等任意文本。定位符只能加在<strong>整组末尾</strong>，作用于整组：<code>[@a; @b, p. 12]</code> → [1, 2, p. 12]",
    "<strong>LaTeX 兼容</strong>：<code>\\cite{key}</code>、<code>\\citep{a,b}</code>、<code>\\citet{key}</code> 等（任意 <code>\\cite*{...}</code> 形式均识别）→ [1] / [1, 2]。注意：此写法<strong>不支持定位符</strong>，逗号仅用于分隔多 key",
    "<strong>未知 key</strong>：库中无此条目时渲染为 [?]（类似 LaTeX 的 [?]），且不会出现在文末文献表中",
    "<strong>二、文献库来源</strong>",
    "<strong>自包含（推荐）</strong>：在文档内写 <code>```bibtex ... ```</code> 代码块即可，无需外部 .bib。块体会被抽走去建库，预览区不显示",
    "<strong>外挂 .bib</strong>：工具栏「文献」按钮，或菜单「文件 → 加载文献库」；按钮上显示已加载条目数，可「更换 / 卸载」",
    "<strong>两路合并</strong>：内嵌 bibtex 块与外挂 .bib 同时存在时合并为一座库；卸载外挂库不影响内嵌块",
    "<strong>三、编号与文献表</strong>",
    "<strong>编号规则</strong>：numeric / unsrt 风格——按正文中<strong>首次出现</strong>的顺序编号（不按字母、不按 .bib 顺序）",
    "<strong>参考文献表</strong>：文末自动生成，仅列出<strong>被引用且库中存在</strong>的条目；未被引用的条目不会出现",
    "<strong>双向跳转</strong>：点正文 [n] 跳到文献表条目；点条目前的 [n] 跳回引用处（同一文献多处引用时可选择跳哪一处）",
    "<strong>四、排版细节</strong>",
    "<strong>作者列表</strong>：1 人单列；2 人用「A and B」；≥3 人用 <code>et al.</code>；团体作者原样输出",
    "<strong>大小写保护</strong>：花括号 <code>{RNA}</code> 保留原大写，不被小写化",
    "<strong>页码与转义</strong>：<code>--</code> 自动转 en-dash（816--821 → 816–821）；LaTeX 转义字符由库解码为 unicode",
    "<strong>五、导出</strong>",
    "<strong>PDF / HTML</strong>：含正文引用标记与文末文献表",
    "<strong>LaTeX</strong>：<code>[@key]</code> → <code>\\cite{key}</code>；<code>[@a; @b]</code> → <code>\\cite{a,b}</code>；原有的 <code>\\cite{}</code> 命令原样保留（定位符在 LaTeX 导出中会丢弃）",
    "<strong>示例</strong>：菜单「帮助 → 文献引用示例」可载入一份完整示例到新标签",
  ];
  const CITE_HELP_EN = [
    "<strong>1. Citation syntax (by case)</strong>",
    "<strong>Single</strong>: <code>[@key]</code> → [1]",
    "<strong>Multiple</strong>: <code>[@a; @b]</code> → [1, 2] (separate with semicolons; more than two allowed)",
    "<strong>Locator</strong>: <code>[@key, p. 12]</code> → [1, p. 12]; also <code>ch. 5</code> (chapter), <code>fig. 2</code>, <code>§3</code>, etc. The locator may only appear at the <strong>end of the whole group</strong> and applies to the group: <code>[@a; @b, p. 12]</code> → [1, 2, p. 12]",
    "<strong>LaTeX compat</strong>: <code>\\cite{key}</code>, <code>\\citep{a,b}</code>, <code>\\citet{key}</code> — any <code>\\cite*{...}</code> form is recognized → [1] / [1, 2]. Note: this form <strong>does not support locators</strong>; the comma only separates keys",
    "<strong>Unknown key</strong>: renders as [?] when the entry is absent from the library (like LaTeX's [?]) and is excluded from the reference list",
    "<strong>2. Library sources</strong>",
    "<strong>Self-contained (recommended)</strong>: write a <code>```bibtex ... ```</code> code block in the doc — no external .bib needed. The block is extracted to build the library and hidden from the preview",
    "<strong>External .bib</strong>: the toolbar Bibliography button, or menu File → Load Bibliography; the count is shown on the button, with Replace / Unload options",
    "<strong>Merged</strong>: an embedded block and an external .bib are merged into one library; unloading the external library does not affect the embedded block",
    "<strong>3. Numbering & list</strong>",
    "<strong>Numbering</strong>: numeric / unsrt style — numbered by <strong>first appearance</strong> in the text (not alphabetical, not by .bib order)",
    "<strong>Reference list</strong>: generated at the end, listing only entries that are <strong>cited and present in the library</strong>; uncited entries are omitted",
    "<strong>Two-way jump</strong>: click [n] in the text to jump to the entry; click [n] before an entry to jump back (choose which occurrence when cited in multiple places)",
    "<strong>4. Formatting</strong>",
    "<strong>Authors</strong>: 1 listed alone; 2 as &quot;A and B&quot;; ≥3 use <code>et al.</code>; corporate authors kept as-is",
    "<strong>Case protection</strong>: braces <code>{RNA}</code> preserve original capitalization",
    "<strong>Pages & escapes</strong>: <code>--</code> becomes an en-dash (816--821 → 816–821); LaTeX escapes are decoded to unicode",
    "<strong>5. Export</strong>",
    "<strong>PDF / HTML</strong>: include in-text citations and the reference list",
    "<strong>LaTeX</strong>: <code>[@key]</code> → <code>\\cite{key}</code>; <code>[@a; @b]</code> → <code>\\cite{a,b}</code>; existing <code>\\cite{}</code> commands are kept as-is (locators are dropped in LaTeX export)",
    "<strong>Example</strong>: menu Help → Citation Example loads a full sample into a new tab",
  ];
  const HELP_STRINGS = {
    zh: {
      hIntro: "简介",
      pIntro: "MDeX v{ver} — 一款专为离线、内网及隐私保护场景设计的 Markdown 阅读与编辑器。所有文件均在本地处理，不联网、不上传、无云端同步。源代码：github.com/fwzheng/mdex；下载站点：spinss.cn。 界面支持 17 种语言。 兼顾数据安全：原子化保存（崩溃/断电不丢数据）、检测文件外部修改、支持打开 GBK / Latin-1 / UTF-16 等旧编码文件。",
      pPron: "读作 “em-dex”（/ˌemˈdɛks/）—— 字母 M 接 “dex”，共两个音节。",
      hFeatures: "核心功能",
      features: [
        { b: "多标签页", t: "：同时打开多个文件；未保存的修改用圆点标记，关闭时询问是否保存；中键点击标签可快速关闭。" },
        { b: "实时分屏预览", t: "：拖动中间分隔条调整比例；工具栏按钮轮换「分屏 / 仅编辑 / 仅预览」。" },
        { b: "点击定位", t: "：点击编辑器某处，预览自动滚到对应位置；点击预览某处，编辑器光标跳到对应位置。" },
        { b: "搜索替换", t: "：查找、逐个替换、全部替换，显示匹配数；⌘F / ⌘H 唤起。" },
        { b: "数学公式", t: "：行内 <code>$...$</code> 与块级 <code>$$...$$</code>（也支持 <code>\\(...\\)</code>、<code>\\[...\\]</code>），由 KaTeX 渲染；超长公式自动按运算符折行，无法折行的等比缩小。" },
        { b: "代码高亮", t: "：自动识别语言着色；大文档按视口懒加载，避免卡顿。" },
        { b: "图片", t: "：粘贴 / 拖拽 / 选择，自动保存到文档同目录的 <code>&lt;文件名&gt;_images/</code> 文件夹并插入相对引用（源码干净、不再 base64）；草稿先存临时目录、保存时迁移；另存为时把图片扁平拷到目标；图片默认居中。" },
        { b: "表格", t: "：GFM 表格；窄表按内容居中，宽表在容器内横向滚动，不被裁切。" },
        { b: "Mermaid 图", t: "：<code>```mermaid</code> 代码块渲染为流程图 / 时序图 / 类图 / 状态图 / 甘特图 / 饼图等；点击预览区的 mermaid 图可弹出独立窗口放大查看（缩放 / 平移 / 居中 / 全屏），并跟随编辑实时更新；菜单「帮助 → Mermaid 图示例」载入完整示例。" },
        { b: "字体缩放", t: "：编辑区、预览区各自独立放大 / 缩小（pane-head 的 −/百分比/+ 或快捷键 ⌘=/−/0），点百分比重置；倍率持久化。" },
        { b: "文献引用", t: "：BibTeX numeric 风格，文末自动生成「参考文献」表，正文 [n] 与条目双向跳转（详见下文）。" },
        { b: "HTML 支持", t: "：可直接打开 <code>.html</code> 渲染预览；支持 HTML ↔ Markdown 互转（菜单「文件」→「转为 Markdown / HTML」）。" },
        { b: "主题 / 语言", t: "：深色 / 浅色主题，17 种界面语言；阿拉伯语、乌尔都语自动右到左。" },
        { b: "自动草稿", t: "：内容定时暂存，意外关闭 / 崩溃后可恢复。" },
        { b: "字数统计", t: "：状态栏实时显示字数 / 行数 / 词数 / 字符数，及当前行列号。" },
        { b: "拖拽打开", t: "：拖拽 <code>.md</code> 文件到窗口直接打开；拖拽图片直接插入。" },
        { b: "多格式导出", t: "：另存为 Markdown / HTML / PDF（矢量 + 位图）/ LaTeX。" },
      ],
      hShortcuts: "快捷键",
      pShortcut: "macOS 用 <code>⌘</code>，Windows / Linux 用 <code>Ctrl</code>。拖拽 <code>.md</code> 到窗口可直接打开；中键点击标签可关闭。",
      thKey: "快捷键", thAction: "功能",
      shortcuts: sc(["新建","打开","保存","另存为","关闭标签页","关闭窗口","查找","替换","加粗","斜体","行内代码","链接","缩进 2 空格","矩形（列）选取","扩展列选取","取消列选取"]),
      hMd: "Markdown 语法速查",
      md: [
        "标题：<code># H1</code>、<code>## H2</code>、<code>### H3</code>",
        "加粗：<code>**文本**</code>；斜体：<code>*文本*</code>；删除线：<code>~~文本~~</code>",
        "行内代码：<code>`代码`</code>",
        "代码块：用三个反引号围起，可在开头标注语言（如 <code>python</code>）",
        "引用：<code>&gt; 文本</code>",
        "无序列表：<code>-</code> / <code>*</code> / <code>+</code> 开头；有序列表：<code>1.</code> 开头",
        "任务列表：<code>- [ ]</code> 或 <code>- [x]</code>",
        "链接：<code>[文字](URL)</code>；图片：<code>![描述](URL)</code> 或直接粘贴 / 拖拽",
        "分割线：<code>---</code>",
        "表格：<code>| 列1 | 列2 |</code> 换行后 <code>| --- | --- |</code>",
        "转义：反斜杠转义特殊字符，如 <code>\\*</code> 显示字面星号",
        "内联 HTML：可直接写 HTML 标签（预览前会做安全过滤）",
      ],
      hMath: "数学公式",
      math: [
        "行内：<code>$E = mc^2$</code>（也支持 <code>\\(E = mc^2\\)</code>）",
        "块级：用 <code>$$</code> 围起，可跨行，如 <code>$$\\int_0^1 x\\,dx$$</code>（也支持 <code>\\[...\\]</code>）",
        "使用 LaTeX 语法，由 KaTeX 渲染。代码块内的 <code>$</code> 不会被当作公式分隔符。",
        "超长公式自动在 <code>= + -</code> 处折行重渲为多行；无法折行的等比缩小以适应宽度。",
        "支持 <code>align</code> / <code>aligned</code>、矩阵、分段函数 <code>cases</code> 等常用环境。",
      ],
       hCite: "文献引用（BibTeX）", cite: CITE_HELP_ZH,hExport: "导出（另存为）",
      pExport: "点击「另存为」后选择格式：",
      export: [
        { b: "Markdown (.md)", t: "：保存源文件，并更新当前标签的文件名与路径。" },
        { b: "HTML (.html)", t: "：导出独立 HTML 文件，内联排版 CSS + 代码高亮；数学公式保留 <code>$...$</code> 字面量，由内联 KaTeX 自动渲染。" },
        { b: "PDF 矢量打印", t: "：调用系统打印对话框，文字与公式矢量输出，任意放大清晰。选「存储为 PDF」即可保存。" },
        { b: "LaTeX (.tex)", t: "：转换为可编译的 <code>.tex</code> 源（含 documentclass 与宏包，数学公式原样保留），导出副本。" },
      ],
      hLicense: "开源许可",
      pLicense: "MDeX 自身代码依据 <strong>Apache License 2.0</strong> 开源，Copyright © 2026 郑法伟 (Fawei Zheng)。内置组件（marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown 及 Tauri 等）各自遵循其原始许可证（MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0）。",
      hContact: "联系我们",
      pContact: "欢迎使用 MDeX！如果您在使用中遇到问题，或有任何意见与建议，欢迎联系：",
      contactName: "郑法伟",
    },
    en: {
      hIntro: "Overview",
      pIntro: "MDeX v{ver} — a Markdown reader & editor designed for offline, intranet, and privacy-conscious use. All files are processed locally — no network, no uploads, no cloud sync. Source code: github.com/fwzheng/mdex; Download: spinss.cn. UI available in 17 languages. It also safeguards your data: atomic (crash-proof) saves, external file-change detection, and opens legacy GBK / Latin-1 / UTF-16 files.",
      pPron: "Pronounced “em-dex” (/ˌemˈdɛks/) — the letter M followed by “dex”, two syllables.",
      hFeatures: "Features",
      features: [
        { b: "Multi-tab", t: ": open several files at once; unsaved changes are marked with a dot, and you are asked before closing; middle-click a tab to close it." },
        { b: "Live split preview", t: ": drag the divider to resize; the toolbar button cycles Split / Editor / Preview." },
        { b: "Click-to-position", t: ": click in the editor to scroll the preview; click in the preview to jump the cursor in the editor." },
        { b: "Search & replace", t: ": find, replace one or all, with match count; ⌘F / ⌘H." },
        { b: "Math", t: ": inline <code>$...$</code> and block <code>$$...$$</code> (also <code>\\(...\\)</code>, <code>\\[...\\]</code>), rendered by KaTeX; long equations wrap at operators or auto-shrink." },
        { b: "Code highlighting", t: ": language auto-detected; large docs lazy-highlight by viewport to stay smooth." },
        { b: "Images", t: ": paste / drop / pick — saved to a <code>&lt;filename&gt;_images/</code> folder next to the doc with a clean relative reference (no more inline base64); drafts use a temp folder migrated on save; Save As flattens images into the target; images are centered by default." },
        { b: "Tables", t: ": GFM tables; narrow tables are centered to content, wide ones scroll horizontally without clipping." },
        { b: "Mermaid diagrams", t: ": a <code>```mermaid</code> code block renders as flowchart / sequence / class / state / Gantt / pie, etc.; click a diagram in the preview to open a standalone zoom/pan/fullscreen viewer window that updates live as you edit; menu Help → Mermaid Examples loads a full sample." },
        { b: "Font zoom", t: ": zoom the editor and preview fonts independently (the −/percentage/+ controls, or ⌘=/−/0); click the percentage to reset; the level persists." },
        { b: "Citations", t: ": BibTeX numeric style; a References list is generated at the end, with two-way jumps between in-text [n] and the entry (see below)." },
        { b: "HTML support", t: ": open <code>.html</code> files for rendering; convert between HTML and Markdown (menu File → Convert)." },
        { b: "Theme / language", t: ": dark / light, 17 UI languages; Arabic & Urdu auto right-to-left." },
        { b: "Auto-draft", t: ": content is saved periodically and restored after an unexpected close / crash." },
        { b: "Word count", t: ": the status bar shows characters / lines / words live, plus the current row & column." },
        { b: "Drag-and-drop", t: ": drop a <code>.md</code> file onto the window to open it; drop an image to insert it." },
        { b: "Export", t: ": save as Markdown / HTML / PDF (vector + raster) / LaTeX." },
        { b: "Text color", t: ": toolbar palette colors the selected text (12 common colors)." },
        { b: "Back / Forward", t: ": unified history across documents and cursor positions; ◀ ▶ buttons, Alt+←/→." },
        { b: "Follow links", t: ": click a link in the preview to open the target in a <strong>new tab</strong> (http in the system browser); the current document is never replaced." },
      ],
      hShortcuts: "Shortcuts",
      pShortcut: "Use <code>⌘</code> on macOS, <code>Ctrl</code> on Windows / Linux. Drop a <code>.md</code> onto the window to open; middle-click a tab to close it.",
      thKey: "Shortcut", thAction: "Action",
      shortcuts: sc(["New","Open","Save","Save As","Close Tab","Close Window","Find","Replace","Bold","Italic","Inline code","Link","Indent 2 spaces","Rectangular (column) select","Extend column select","Cancel column select"]),
      hMd: "Markdown cheat sheet",
      md: [
        "Headings: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Bold: <code>**text**</code>; italic: <code>*text*</code>; strikethrough: <code>~~text~~</code>",
        "Inline code: <code>`code`</code>",
        "Code block: fenced with triple backticks; add a language (e.g. <code>python</code>) on the opening line",
        "Quote: <code>&gt; text</code>",
        "Bullet list: <code>-</code> / <code>*</code> / <code>+</code>; numbered list: <code>1.</code>",
        "Task list: <code>- [ ]</code> or <code>- [x]</code>",
        "Link: <code>[text](url)</code>; image: <code>![alt](url)</code> or paste / drop",
        "Divider: <code>---</code>",
        "Table: <code>| A | B |</code> then <code>| --- | --- |</code>",
        "Escaping: backslash escapes special chars, e.g. <code>\\*</code> for a literal asterisk",
        "Inline HTML: raw HTML tags are allowed (sanitized before preview)",
      ],
      hMath: "Math",
      math: [
        "Inline: <code>$E = mc^2$</code> (also <code>\\(E = mc^2\\)</code>)",
        "Block: wrap with <code>$$</code>, may span lines, e.g. <code>$$\\int_0^1 x\\,dx$$</code> (also <code>\\[...\\]</code>)",
        "Uses LaTeX syntax, rendered by KaTeX. <code>$</code> inside code blocks is not treated as a math delimiter.",
        "Long equations auto-wrap at <code>= + -</code> into multiple lines; those that cannot wrap are scaled down to fit.",
        "Supports <code>align</code> / <code>aligned</code>, matrices, <code>cases</code> and other common environments.",
      ],
       hCite: "Citations (BibTeX)", cite: CITE_HELP_EN,hExport: "Export (Save As)",
      pExport: "Click \"Save As\" and pick a format:",
      export: [
        { b: "Markdown (.md)", t: ": save the source and update the current tab's name / path." },
        { b: "HTML (.html)", t: ": self-contained HTML with inlined CSS + code highlighting; math kept as <code>$...$</code> literal, auto-rendered by inlined KaTeX." },
        { b: "PDF vector", t: ": system print dialog, vector output, crisp at any zoom. Choose Save as PDF." },
        { b: "LaTeX (.tex)", t: ": converted to a compilable <code>.tex</code> source (with documentclass and packages; math kept as-is). Exports a copy." },
      ],
      hLicense: "License",
      pLicense: "MDeX is open-sourced under the <strong>Apache License 2.0</strong>, Copyright © 2026 郑法伟 (Fawei Zheng). Bundled components (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown and Tauri, etc.) remain under their original licenses (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Contact",
      pContact: "Thanks for using MDeX! For problems or suggestions, feel free to reach out:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    fr: {
      hIntro: "Présentation",
      pIntro: "MDeX v{ver} — un lecteur et éditeur Markdown conçu pour un usage hors ligne, intranet et orienté confidentialité. Tous les fichiers sont traités localement — sans réseau, sans upload, sans synchro cloud. Code source : github.com/fwzheng/mdex ; Téléchargement : spinss.cn. Interface disponible en 17 langues. Il protège aussi vos données : enregistrement atomique (anti-crash), détection des modifications externes, et ouverture des anciens fichiers GBK / Latin-1 / UTF-16.",
      pPron: "Se prononce « em-dex » (/ˌemˈdɛks/) — la lettre M suivie de « dex », deux syllabes.",
      hFeatures: "Fonctionnalités",
      features: [
        { b: "Multi-onglets", t: " : ouvrez plusieurs fichiers à la fois ; les modifications non enregistrées sont marquées d'un point, et une confirmation est demandée avant fermeture." },
        { b: "Aperçu scindé en direct", t: " : glissez le séparateur pour redimensionner ; le bouton de la barre cycle Scindé / Éditeur / Aperçu." },
        { b: "Formules", t: " : en ligne <code>$...$</code> et en bloc <code>$$...$$</code>, rendues par KaTeX." },
        { b: "Coloration du code", t: " : langue détectée automatiquement." },
        { b: "Images", t: ": coller / glisser-déposer / choisir - enregistrées dans un dossier <code>&lt;filename&gt;_images/</code> à côté du doc (plus de base64) ; brouillons en dossier temporaire migré à l'enregistrement ; centrées par défaut." },
        { b: "Zoom police", t: " : zoom indépendant éditeur / aperçu (−/%/+ ou ⌘=/−/0) ; persistant." },
        { b: "Diagrammes Mermaid", t: " : un bloc <code>```mermaid</code> rendu en organigramme / séquence / classe / état / Gantt / camembert, etc. ; cliquez sur un diagramme pour ouvrir une fenêtre de visualisation indépendante (zoom / pan / plein écran), mise à jour en direct." },
        { b: "Thème / langue", t: " : sombre / clair, 17 langues d'interface." },
        { b: "Brouillon auto", t: " : le contenu est sauvegardé périodiquement et restauré après une fermeture inattendue." },
        { b: "Export", t: " : enregistrer en Markdown / PDF / LaTeX." },
        { b: "Couleur du texte", t: ": la palette de la barre colore le texte sélectionné (12 couleurs)." },
        { b: "Précédent / Suivant", t: ": historique unifié des documents et positions du curseur ; boutons ◀ ▶, Alt+←/→." },
        { b: "Suivre les liens", t: ": un clic sur un lien de l'aperçu ouvre la cible dans un <strong>nouvel onglet</strong> (http dans le navigateur) ; le document courant n'est pas remplacé." },
      ],
      hShortcuts: "Raccourcis",
      pShortcut: "Utilisez <code>⌘</code> sur macOS, <code>Ctrl</code> sur Windows / Linux.",
      thKey: "Raccourci", thAction: "Action",
      shortcuts: sc(["Nouveau","Ouvrir","Enregistrer","Enregistrer sous","Fermer l'onglet","Fermer la fenêtre","Rechercher","Remplacer","Gras","Italique","Code en ligne","Lien","Indenter 2 espaces","Sélection rectangulaire (colonne)","Étendre la sélection","Annuler la sélection"]),
      hMd: "Aide-mémoire Markdown",
      md: [
        "Titres : <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Gras : <code>**texte**</code> ; italique : <code>*texte*</code> ; barré : <code>~~texte~~</code>",
        "Code en ligne : <code>`code`</code>",
        "Bloc de code : encadré par trois accents graves ; ajoutez une langue (ex. <code>python</code>) sur la première ligne",
        "Citation : <code>&gt; texte</code>",
        "Liste à puces : <code>-</code> / <code>*</code> / <code>+</code> ; liste numérotée : <code>1.</code>",
        "Liste de tâches : <code>- [ ]</code> ou <code>- [x]</code>",
        "Lien : <code>[texte](url)</code> ; image : <code>![alt](url)</code> ou coller / glisser-déposer",
        "Séparateur : <code>---</code>",
        "Tableau : <code>| A | B |</code> puis <code>| --- | --- |</code>",
      ],
      hMath: "Formules",
      math: [
        "En ligne : <code>$E = mc^2$</code>",
        "En bloc : encadrer par <code>$$</code>, peut s'étendre sur plusieurs lignes, ex. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Utilise la syntaxe LaTeX, rendue par KaTeX. Le <code>$</code> dans les blocs de code n'est pas traité comme délimiteur de formule.",
      ],
       hCite: "Citations (BibTeX)", cite: CITE_HELP_EN,hExport: "Export (Enregistrer sous)",
      pExport: "Cliquez « Enregistrer sous » et choisissez un format :",
      export: [
        { b: "Markdown (.md)", t: " : enregistre la source et met à jour le nom / chemin de l'onglet courant." },
        { b: "PDF (.pdf)", t: " : pagination aux frontières de blocs afin de ne jamais couper formules, titres, blocs de code et lignes de tableau ; un bloc qui ne tient pas passe entièrement à la page suivante." },
        { b: "LaTeX (.tex)", t: " : converti en source <code>.tex</code> compilable (avec documentclass et paquets ; formules conservées). Exporte une copie sans modifier le document courant." },
      ],
      hLicense: "Licence",
      pLicense: "MDeX est open-source sous <strong>Apache License 2.0</strong>, copyright the author. Les composants intégrés (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro et Tauri, etc.) restent sous leurs licences d'origine (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Contact",
      pContact: "Merci d'utiliser MDeX ! Pour tout problème ou suggestion, n'hésitez pas à contacter :",
      contactName: "Fawei Zheng (郑法伟)",
    },
    de: {
      hIntro: "Überblick",
      pIntro: "MDeX v{ver} — ein Markdown-Reader & Editor für Offline-, Intranet- und datenschutzbewussten Einsatz. Alle Dateien werden lokal verarbeitet — kein Netzwerk, keine Uploads, keine Cloud-Synchronisation. Quellcode: github.com/fwzheng/mdex; Download: spinss.cn. Oberfläche in 17 Sprachen. Schützt auch Ihre Daten: atomares (absturzsicheres) Speichern, Erkennung externer Änderungen, öffnet veraltete GBK / Latin-1 / UTF-16-Dateien.",
      pPron: "Wird „em-dex“ gesprochen (/ˌemˈdɛks/) — der Buchstabe M gefolgt von „dex“, zwei Silben.",
      hFeatures: "Funktionen",
      features: [
        { b: "Mehrfach-Tabs", t: ": mehrere Dateien gleichzeitig öffnen; ungespeicherte Änderungen werden mit einem Punkt markiert, vor dem Schließen wird gefragt." },
        { b: "Live geteilte Vorschau", t: ": Trenner ziehen zum Skalieren; die Toolbar-Schaltfläche schaltet Geteilt / Editor / Vorschau um." },
        { b: "Formeln", t: ": inline <code>$...$</code> und Block <code>$$...$$</code>, gerendert durch KaTeX." },
        { b: "Code-Hervorhebung", t: ": Sprache wird automatisch erkannt." },
        { b: "Bilder", t: ": einfügen / ablegen / auswählen - in <code>&lt;dateiname&gt;_images/</code> Ordner gespeichert (kein Base64); Entwürfe in temporärem Ordner, bei Speichern migriert; zentriert." },
        { b: "Schrift-Zoom", t: ": Editor / Vorschau unabhängig zoomen (−/%/+ oder ⌘=/−/0); bleibt erhalten." },
        { b: "Mermaid-Diagramme", t: ": ein <code>```mermaid</code>-Block als Flussdiagramm / Sequenz / Klasse / Zustand / Gantt / Tortendiagramm usw.; klicken Sie ein Diagram an für ein eigenständiges Zoom-/Pan-/Vollbild-Fenster, live aktualisiert." },
        { b: "Design / Sprache", t: ": Dunkel / Hell, 17 UI-Sprachen." },
        { b: "Auto-Entwurf", t: ": Inhalt wird regelmäßig gespeichert und nach unerwartetem Schließen wiederhergestellt." },
        { b: "Export", t: ": speichern als Markdown / PDF / LaTeX." },
        { b: "Textfarbe", t: ": die Paletten-Schaltfläche färbt den ausgewählten Text (12 Farben)." },
        { b: "Zurück / Vor", t: ": vereinigte History über Dokumente und Cursorpositionen; ◀ ▶-Buttons, Alt+←/→." },
        { b: "Links folgen", t: ": ein Klick auf einen Link in der Vorschau öffnet das Ziel in einem <strong>neuen Tab</strong> (http im Systembrowser); das aktuelle Dokument bleibt erhalten." },
      ],
      hShortcuts: "Tastenkürzel",
      pShortcut: "<code>⌘</code> auf macOS, <code>Ctrl</code> auf Windows / Linux.",
      thKey: "Kürzel", thAction: "Aktion",
      shortcuts: sc(["Neu","Öffnen","Speichern","Speichern unter","Tab schließen","Fenster schließen","Suchen","Ersetzen","Fett","Kursiv","Inline-Code","Link","2 Leerzeichen einrücken","Rechteckige (Spalten-) Auswahl","Auswahl erweitern","Auswahl abbrechen"]),
      hMd: "Markdown-Spickzettel",
      md: [
        "Überschriften: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Fett: <code>**Text**</code>; kursiv: <code>*Text*</code>; durchgestrichen: <code>~~Text~~</code>",
        "Inline-Code: <code>`code`</code>",
        "Code-Block: mit drei Backticks umschließen; Sprachangabe (z. B. <code>python</code>) in der ersten Zeile",
        "Zitat: <code>&gt; Text</code>",
        "Aufzählung: <code>-</code> / <code>*</code> / <code>+</code>; nummerierte Liste: <code>1.</code>",
        "Aufgabenliste: <code>- [ ]</code> oder <code>- [x]</code>",
        "Link: <code>[Text](url)</code>; Bild: <code>![alt](url)</code> oder einfügen / ablegen",
        "Trennlinie: <code>---</code>",
        "Tabelle: <code>| A | B |</code> dann <code>| --- | --- |</code>",
      ],
      hMath: "Formeln",
      math: [
        "Inline: <code>$E = mc^2$</code>",
        "Block: mit <code>$$</code> umschließen, kann mehrere Zeilen umfassen, z. B. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Verwendet LaTeX-Syntax, gerendert durch KaTeX. <code>$</code> in Code-Blöcken wird nicht als Formelbegrenzer behandelt.",
      ],
       hCite: "Zitierungen (BibTeX)", cite: CITE_HELP_EN,hExport: "Export (Speichern unter)",
      pExport: "Klicken Sie „Speichern unter\" und wählen Sie ein Format:",
      export: [
        { b: "Markdown (.md)", t: ": speichert die Quelle und aktualisiert Name / Pfad des aktuellen Tabs." },
        { b: "PDF (.pdf)", t: ": paginiert an Blockgrenzen, sodass Formeln, Überschriften, Code-Blöcke und Tabellenzeilen nie getrennt werden; ein Block, der nicht passt, rückt komplett auf die nächste Seite." },
        { b: "LaTeX (.tex)", t: ": in eine kompilierbare <code>.tex</code>-Quelle konvertiert (mit documentclass und Paketen; Formeln bleiben erhalten). Exportiert eine Kopie, ohne das aktuelle Dokument zu ändern." },
      ],
      hLicense: "Lizenz",
      pLicense: "MDeX ist unter <strong>Apache License 2.0</strong> Open Source, Copyright Fawei Zheng. Mitgelieferte Komponenten (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro und Tauri usw.) bleiben unter ihren ursprünglichen Lizenzen (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0). Die App arbeitet vollständig offline — kein Netzwerk, keine Uploads.",
      hContact: "Kontakt",
      pContact: "Danke für die Nutzung von MDeX! Bei Problemen oder Vorschlägen erreichen Sie uns unter:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    ru: {
      hIntro: "Обзор",
      pIntro: "MDeX v{ver} — редактор и просмотрщик Markdown для автономной, интрасетевой и приватной работы. Все файлы обрабатываются локально — без сети, без загрузок, без облачной синхронизации. Исходный код: github.com/fwzheng/mdex; Скачать: spinss.cn. Интерфейс на 17 языках. Также заботится о ваших данных: атомарное (устойчивое к сбоям) сохранение, обнаружение внешних изменений, открытие старых файлов GBK / Latin-1 / UTF-16.",
      pPron: "Произносится «em-dex» (/ˌemˈdɛks/) — буква M и «dex», два слога.",
      hFeatures: "Возможности",
      features: [
        { b: "Вкладки", t: ": открывайте несколько файлов сразу; несохранённые изменения помечаются точкой, при закрытии спрашивается подтверждение." },
        { b: "Живой разделённый предпросмотр", t: ": перетаскивайте разделитель для изменения размера; кнопка панели переключает Разделено / Редактор / Предпросмотр." },
        { b: "Формулы", t: ": строчные <code>$...$</code> и блочные <code>$$...$$</code>, рендер KaTeX." },
        { b: "Подсветка кода", t: ": язык определяется автоматически." },
        { b: "Изображения", t: ": вставка / перетаскивание / выбор - в папку <code>&lt;filename&gt;_images/</code> (без base64); черновики во временной папке, мигрируемой при сохранении; по центру." },
        { b: "Масштаб шрифта", t: ": независимый масштаб редактора / предпросмотра (−/%/+ или ⌘=/−/0); сохраняется." },
        { b: "Диаграммы Mermaid", t: ": блок <code>```mermaid</code> — блок-схема / последовательность / класс / состояние / Гант / круговая и т.д. ; нажмите на диаграмму для отдельного окна просмотра (масштаб / пан / полный экран), обновляемого в реальном времени." },
        { b: "Тема / язык", t: ": тёмная / светлая, 17 языков интерфейса." },
        { b: "Автосохранение", t: ": содержимое периодически сохраняется и восстанавливается после неожиданного закрытия." },
        { b: "Экспорт", t: ": сохранить как Markdown / PDF / LaTeX." },
        { b: "Цвет текста", t: ": палитра на панели окрашивает выделенный текст (12 цветов)." },
        { b: "Назад / Вперёд", t: ": единая история по документам и позициям курсора; кнопки ◀ ▶, Alt+←/→." },
        { b: "Переход по ссылкам", t: ": клик по ссылке в предпросмотре открывает цель в <strong>новой вкладке</strong> (http — в системном браузере); текущий документ не заменяется." },
      ],
      hShortcuts: "Горячие клавиши",
      pShortcut: "<code>⌘</code> на macOS, <code>Ctrl</code> на Windows / Linux.",
      thKey: "Клавиша", thAction: "Действие",
      shortcuts: sc(["Создать","Открыть","Сохранить","Сохранить как","Закрыть вкладку","Закрыть окно","Найти","Заменить","Полужирный","Курсив","Код","Ссылка","Отступ 2 пробела","Прямоугольное (колоночное) выделение","Расширить выделение","Отменить выделение"]),
      hMd: "Шпаргалка по Markdown",
      md: [
        "Заголовки: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Полужирный: <code>**текст**</code>; курсив: <code>*текст*</code>; зачёркнутый: <code>~~текст~~</code>",
        "Код в строке: <code>`код`</code>",
        "Блок кода: обрамлён тремя обратными апострофами; укажите язык (напр. <code>python</code>) в первой строке",
        "Цитата: <code>&gt; текст</code>",
        "Маркированный список: <code>-</code> / <code>*</code> / <code>+</code>; нумерованный: <code>1.</code>",
        "Список задач: <code>- [ ]</code> или <code>- [x]</code>",
        "Ссылка: <code>[текст](url)</code>; изображение: <code>![alt](url)</code> или вставка / перетаскивание",
        "Разделитель: <code>---</code>",
        "Таблица: <code>| A | B |</code> затем <code>| --- | --- |</code>",
      ],
      hMath: "Формулы",
      math: [
        "Строчные: <code>$E = mc^2$</code>",
        "Блочные: обрамить <code>$$</code>, может занимать несколько строк, напр. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Использует синтаксис LaTeX, рендер KaTeX. <code>$</code> в блоках кода не считается разделителем формул.",
      ],
       hCite: "Цитирование (BibTeX)", cite: CITE_HELP_EN,hExport: "Экспорт (Сохранить как)",
      pExport: "Нажмите «Сохранить как» и выберите формат:",
      export: [
        { b: "Markdown (.md)", t: ": сохраняет исходник и обновляет имя / путь текущей вкладки." },
        { b: "PDF (.pdf)", t: ": постранично по границам блоков — формулы, заголовки, блоки кода и строки таблиц не разрезаются; блок, не помещающийся на странице, целиком переносится на следующую." },
        { b: "LaTeX (.tex)", t: ": преобразуется в компилируемый источник <code>.tex</code> (с documentclass и пакетами; формулы сохраняются). Экспортирует копию, не меняя текущий документ." },
      ],
      hLicense: "Лицензия",
      pLicense: "MDeX распространяется под <strong>Apache License 2.0</strong>, авторское право Fawei Zheng. Встроенные компоненты (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro и Tauri и др.) остаются под своими исходными лицензиями (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0). Приложение полностью офлайн — без сети, без загрузок.",
      hContact: "Контакты",
      pContact: "Спасибо за использование MDeX! С вопросами и предложениями обращайтесь:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    it: {
      hIntro: "Panoramica",
      pIntro: "MDeX v{ver} — un lettore ed editor Markdown pensato per uso offline, intranet e privacy. Tutti i file sono elaborati localmente — niente rete, niente upload, niente cloud. Codice sorgente: github.com/fwzheng/mdex; Download: spinss.cn. Interfaccia in 17 lingue. Protegge anche i tuoi dati: salvataggio atomico (anti-crash), rilevamento delle modifiche esterne, apertura dei vecchi file GBK / Latin-1 / UTF-16.",
      pPron: "Si pronuncia «em-dex» (/ˌemˈdɛks/) — la lettera M seguita da «dex», due sillabe.",
      hFeatures: "Funzionalità",
      features: [
        { b: "Schede multiple", t: ": apri più file contemporaneamente; le modifiche non salvate sono marcate con un punto, viene chiesta conferma prima della chiusura." },
        { b: "Anteprima divisa live", t: ": trascina il divisore per ridimensionare; il pulsante della barra cicla Diviso / Editor / Anteprima." },
        { b: "Formule", t: ": inline <code>$...$</code> e blocco <code>$$...$$</code>, renderizzate da KaTeX." },
        { b: "Evidenziazione codice", t: ": lingua rilevata automaticamente." },
        { b: "Immagini", t: ": incolla / trascina / scegli - salvate in cartella <code>&lt;nomefile&gt;_images/</code> (niente base64); bozze in cartella temporanea migrata al salvataggio; centrate." },
        { b: "Zoom caratteri", t: ": zoom indipendente editor / anteprima (−/%/+ o ⌘=/−/0); persistente." },
        { b: "Diagrammi Mermaid", t: ": un blocco <code>```mermaid</code> renderizzato come flowchart / sequenza / classe / stato / Gantt / torta, ecc.; clicca un diagramma per aprire una finestra di visualizzazione indipendente (zoom / pan / schermo intero), aggiornata in tempo reale." },
        { b: "Tema / lingua", t: ": scuro / chiaro, 17 lingue dell'interfaccia." },
        { b: "Bozza automatica", t: ": il contenuto è salvato periodicamente e ripristinato dopo una chiusura imprevista." },
        { b: "Esportazione", t: ": salva come Markdown / PDF / LaTeX." },
        { b: "Colore del testo", t: ": la paletta della barra colora il testo selezionato (12 colori)." },
        { b: "Indietro / Avanti", t: ": cronologia unificata di documenti e posizioni del cursore; pulsanti ◀ ▶, Alt+←/→." },
        { b: "Segui i link", t: ": un clic su un link nell'anteprima apre la destinazione in una <strong>nuova scheda</strong> (http nel browser di sistema); il documento corrente non viene sostituito." },
      ],
      hShortcuts: "Scorciatoie",
      pShortcut: "Usa <code>⌘</code> su macOS, <code>Ctrl</code> su Windows / Linux.",
      thKey: "Scorciatoia", thAction: "Azione",
      shortcuts: sc(["Nuovo","Apri","Salva","Salva con nome","Chiudi scheda","Chiudi finestra","Trova","Sostituisci","Grassetto","Corsivo","Codice in linea","Collegamento","Rientro 2 spazi","Selezione rettangolare (colonna)","Estendi selezione","Annulla selezione"]),
      hMd: "Riferimento Markdown",
      md: [
        "Titoli: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Grassetto: <code>**testo**</code>; corsivo: <code>*testo*</code>; barrato: <code>~~testo~~</code>",
        "Codice in linea: <code>`codice`</code>",
        "Blocco di codice: delimitato da tre backtick; aggiungi una lingua (es. <code>python</code>) sulla prima riga",
        "Citazione: <code>&gt; testo</code>",
        "Elenco puntato: <code>-</code> / <code>*</code> / <code>+</code>; elenco numerato: <code>1.</code>",
        "Elenco attività: <code>- [ ]</code> o <code>- [x]</code>",
        "Collegamento: <code>[testo](url)</code>; immagine: <code>![alt](url)</code> o incolla / trascina",
        "Separatore: <code>---</code>",
        "Tabella: <code>| A | B |</code> poi <code>| --- | --- |</code>",
      ],
      hMath: "Formule",
      math: [
        "In linea: <code>$E = mc^2$</code>",
        "Blocco: racchiudi con <code>$$</code>, può occupare più righe, es. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Usa la sintassi LaTeX, renderizzata da KaTeX. <code>$</code> nei blocchi di codice non è trattato come delimitatore di formula.",
      ],
       hCite: "Citazioni (BibTeX)", cite: CITE_HELP_EN,hExport: "Esporta (Salva con nome)",
      pExport: "Clicca «Salva con nome» e scegli un formato:",
      export: [
        { b: "Markdown (.md)", t: ": salva la sorgente e aggiorna nome / percorso della scheda corrente." },
        { b: "PDF (.pdf)", t: ": impaginato ai confini dei blocchi così formule, titoli, blocchi di codice e righe di tabella non vengono mai tagliati; un blocco che non sta passa interamente alla pagina successiva." },
        { b: "LaTeX (.tex)", t: ": convertito in sorgente <code>.tex</code> compilabile (con documentclass e pacchetti; formule mantenute). Esporta una copia senza modificare il documento corrente." },
      ],
      hLicense: "Licenza",
      pLicense: "MDeX è open-source sotto <strong>Apache License 2.0</strong>, copyright the author. I componenti inclusi (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro e Tauri, ecc.) restano sotto le loro licenze originali (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Contatti",
      pContact: "Grazie per usare MDeX! Per problemi o suggerimenti, contattaci:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    ja: {
      hIntro: "概要",
      pIntro: "MDeX v{ver} — オフライン・社内ネットワーク・プライバシー保護向けの Markdown リーダー＆エディタ。すべてのファイルはローカルで処理され、通信・アップロード・クラウド同期なし。ソースコード：github.com/fwzheng/mdex；ダウンロード：spinss.cn。 インターフェイスは17言語に対応。 データ保護も強化：原子的保存（クラッシュ・停電でデータ消失しない）、外部変更の検出、GBK / Latin-1 / UTF-16 などの旧エンコードファイルを開けます。",
      pPron: "「em-dex」と発音します（/ˌemˈdɛks/）—— 文字 M に続けて「dex」の2音節です。",
      hFeatures: "機能",
      features: [
        { b: "マルチタブ", t: "：複数ファイルを同時に開けます。未保存の変更は点で示され、閉じる際に確認します。" },
        { b: "ライブ分割プレビュー", t: "：区切り線をドラッグして比率を調整。ツールバーボタンで「分割 / エディタ / プレビュー」を切り替え。" },
        { b: "数式", t: "：インライン <code>$...$</code> とブロック <code>$$...$$</code>、KaTeX が描画。" },
        { b: "コードハイライト", t: "：言語を自動検出。" },
        { b: "画像", t: ": 貼り付け / ドロップ / 選択 - <code>&lt;filename&gt;_images/</code> フォルダに保存（base64 廃止）; 下書きは一時フォルダ->保存時に移行; 中央寄せ。" },
        { b: "フォントズーム", t: ": エディタ / プレビュー各自独立ズーム（−/%/+ または ⌘=/−/0）; 永続。" },
        { b: "Mermaid 図", t: ": <code>```mermaid</code> ブロックがフローチャート / シーケンス / クラス / 状態 / ガント / パイなどに描画；図をクリックすると独立したズーム/パン/全画面の表示ウィンドウが開き、リアルタイム更新。" },
        { b: "テーマ / 言語", t: "：ダーク / ライト、17 言語の UI。" },
        { b: "自動下書き", t: "：内容を定期的に保存し、異常終了後に復元。" },
        { b: "エクスポート", t: "：Markdown / PDF / LaTeX で保存。" },
        { b: "文字色", t: ": ツールバーのパレットが選択テキストを着色します（12 色）。" },
        { b: "戻る / 進む", t: ": ドキュメントとカーソル位置の統合履歴；◀ ▶ ボタン、Alt+←/→。" },
        { b: "リンクをたどる", t: ": プレビュー内のリンクをクリックすると<strong>新しいタブ</strong>で開きます（http はシステムブラウザ）。現在のドキュメントは置き換わりません。" },
      ],
      hShortcuts: "ショートカット",
      pShortcut: "macOS は <code>⌘</code>、Windows / Linux は <code>Ctrl</code>。",
      thKey: "ショートカット", thAction: "機能",
      shortcuts: sc(["新規","開く","保存","名前を付けて保存","タブを閉じる","ウィンドウを閉じる","検索","置換","太字","斜体","インラインコード","リンク","2スペース字下げ","矩形（列）選択","選択を拡張","選択をキャンセル"]),
      hMd: "Markdown チートシート",
      md: [
        "見出し：<code># H1</code>、<code>## H2</code>、<code>### H3</code>",
        "太字：<code>**テキスト**</code>；斜体：<code>*テキスト*</code>；取り消し線：<code>~~テキスト~~</code>",
        "インラインコード：<code>`code`</code>",
        "コードブロック：三連バッククォートで囲む。先頭行に言語（例 <code>python</code>）を指定可。",
        "引用：<code>&gt; テキスト</code>",
        "箇条書き：<code>-</code> / <code>*</code> / <code>+</code>；番号付き：<code>1.</code>",
        "タスクリスト：<code>- [ ]</code> または <code>- [x]</code>",
        "リンク：<code>[テキスト](URL)</code>；画像：<code>![alt](URL)</code> または貼り付け / ドラッグ",
        "区切り線：<code>---</code>",
        "表：<code>| A | B |</code> 次行 <code>| --- | --- |</code>",
      ],
      hMath: "数式",
      math: [
        "インライン：<code>$E = mc^2$</code>",
        "ブロック：<code>$$</code> で囲む、複数行可、例 <code>$$\\int_0^1 x\\,dx$$</code>",
        "LaTeX 構文、KaTeX が描画。コードブロック内の <code>$</code> は数式区切りとして扱いません。",
      ],
       hCite: "文献引用（BibTeX）", cite: CITE_HELP_EN,hExport: "エクスポート（名前を付けて保存）",
      pExport: "「名前を付けて保存」をクリックしフォーマットを選択：",
      export: [
        { b: "Markdown (.md)", t: "：ソースを保存し、現在のタブの名前 / パスを更新。" },
        { b: "PDF (.pdf)", t: "：ブロック境界でページ分割し、数式 / 見出し / コードブロック / 表の行を切断しません。収まらないブロックは次ページへ全体移動。" },
        { b: "LaTeX (.tex)", t: "：コンパイル可能な <code>.tex</code> ソースに変換（documentclass とパッケージ込み、数式はそのまま）。現在のドキュメントを変えずコピーをエクスポート。" },
      ],
      hLicense: "ライセンス",
      pLicense: "MDeX は <strong>Apache License 2.0</strong> でオープンソース、著作権 Fawei Zheng。同梱コンポーネント（marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro および Tauri 等）は各々の元ライセンス（MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0）に従います。アプリは完全オフラインで動作します。",
      hContact: "お問い合わせ",
      pContact: "MDeX をご利用いただきありがとうございます！問題やご要望はこちらまで：",
      contactName: "Fawei Zheng (郑法伟)",
    },
    ko: {
      hIntro: "개요",
      pIntro: "MDeX v{ver} — 오프라인·인트라넷·개인정보 보호 환경을 위한 Markdown 리더 및 에디터. 모든 파일은 로컬에서 처리되며, 통신·업로드·클라우드 동기화 없음. 소스 코드: github.com/fwzheng/mdex; 다운로드: spinss.cn. 인터페이스 17개 언어 지원. 데이터도 안전하게 보호: 원자적 저장(크래시에도 손실 없음), 외부 변경 감지, 구형 GBK / Latin-1 / UTF-16 파일 열기 지원.",
      pPron: "“em-dex”로 발음합니다 (/ˌemˈdɛks/) — 문자 M 뒤에 “dex”가 오는 두 음절입니다.",
      hFeatures: "기능",
      features: [
        { b: "다중 탭", t: ": 여러 파일을 동시에 열 수 있습니다; 저장되지 않은 변경 사항은 점으로 표시되며, 닫기 전에 확인합니다." },
        { b: "실시간 분할 미리보기", t: ": 구분선을 드래그해 비율 조정; 도구모음 버튼으로 분할 / 편집기 / 미리보기를 순환." },
        { b: "수식", t: ": 인라인 <code>$...$</code>와 블록 <code>$$...$$</code>, KaTeX가 렌더링." },
        { b: "코드 하이라이트", t: ": 언어 자동 인식." },
        { b: "이미지", t: ": 붙여넣기 / 드롭 / 선택 - <code>&lt;filename&gt;_images/</code> 폴더에 저장 (base64 폐지); 초안은 임시 폴더->저장 시 이동; 중앙 정렬." },
        { b: "글자 확대", t: ": 편집기 / 미리보기 독립 확대 (−/%/+ 또는 ⌘=/−/0); 유지." },
        { b: "Mermaid 다이어그램", t: ": <code>```mermaid</code> 블록이 순서도 / 시퀀스 / 클래스 / 상태 / 간트 / 파이 등으로 렌더링; 다이어그램 클릭 시 독립된 확대/이동/전체화면 보기 창이 열리고 실시간 업데이트." },
        { b: "테마 / 언어", t: ": 다크 / 라이트, 17개 UI 언어." },
        { b: "자동 임시저장", t: ": 내용이 주기적으로 저장되어 예기치 않은 종료 후 복원됩니다." },
        { b: "내보내기", t: ": Markdown / PDF / LaTeX로 저장." },
        { b: "글자 색", t: ": 도구 모음 팔레트가 선택한 글자를 색칠합니다(12색)." },
        { b: "뒤로 / 앞으로", t: ": 문서와 커서 위치의 통합 기록; ◀ ▶ 버튼, Alt+←/→." },
        { b: "링크 따라가기", t: ": 미리보기에서 링크를 클릭하면 <strong>새 탭</strong>으로 엽니다(http는 시스템 브라우저). 현재 문서는 바뀌지 않습니다." },
      ],
      hShortcuts: "단축키",
      pShortcut: "macOS는 <code>⌘</code>, Windows / Linux는 <code>Ctrl</code>.",
      thKey: "단축키", thAction: "기능",
      shortcuts: sc(["새로 만들기","열기","저장","다른 이름으로 저장","탭 닫기","창 닫기","찾기","바꾸기","굵게","기울임","인라인 코드","링크","2칸 들여쓰기","사각형(열) 선택","선택 확장","선택 취소"]),
      hMd: "Markdown 요약",
      md: [
        "제목: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "굵게: <code>**텍스트**</code>; 기울임: <code>*텍스트*</code>; 취소선: <code>~~텍스트~~</code>",
        "인라인 코드: <code>`code`</code>",
        "코드 블록: 세 개 백틱으로 감싸기; 첫 줄에 언어(예 <code>python</code>) 지정 가능",
        "인용: <code>&gt; 텍스트</code>",
        "글머리 목록: <code>-</code> / <code>*</code> / <code>+</code>; 번호 목록: <code>1.</code>",
        "작업 목록: <code>- [ ]</code> 또는 <code>- [x]</code>",
        "링크: <code>[텍스트](url)</code>; 이미지: <code>![alt](url)</code> 또는 붙여넣기 / 드롭",
        "구분선: <code>---</code>",
        "표: <code>| A | B |</code> 다음 <code>| --- | --- |</code>",
      ],
      hMath: "수식",
      math: [
        "인라인: <code>$E = mc^2$</code>",
        "블록: <code>$$</code>로 감싸기, 여러 줄 가능, 예 <code>$$\\int_0^1 x\\,dx$$</code>",
        "LaTeX 구문, KaTeX가 렌더링. 코드 블록 안의 <code>$</code>는 수식 구분자로 취급하지 않습니다.",
      ],
       hCite: "인용 (BibTeX)", cite: CITE_HELP_EN,hExport: "내보내기 (다른 이름으로 저장)",
      pExport: "「다른 이름으로 저장」을 클릭하고 포맷을 선택:",
      export: [
        { b: "Markdown (.md)", t: ": 소스를 저장하고 현재 탭의 이름 / 경로를 업데이트." },
        { b: "PDF (.pdf)", t: ": 블록 경계에서 페이지를 나누어 수식 / 제목 / 코드 블록 / 표 행이 잘리지 않습니다; 들어가지 않는 블록은 다음 페이지로 전체 이동." },
        { b: "LaTeX (.tex)", t: ": 컴파일 가능한 <code>.tex</code> 소스로 변환(documentclass와 패키지 포함, 수식 유지). 현재 문서를 바꾸지 않고 사본을 내보냅니다." },
      ],
      hLicense: "라이선스",
      pLicense: "MDeX는 <strong>Apache License 2.0</strong>로 오픈소스, 저작권 Fawei Zheng. 번들된 구성 요소(marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro 및 Tauri 등)는 각각의 원래 라이선스(MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0)를 따릅니다. 앱은 완전 오프라인으로 작동합니다.",
      hContact: "연락처",
      pContact: "MDeX를 사용해 주셔서 감사합니다! 문제나 제안 사항이 있으면 연락 주세요:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    es: {
      hIntro: "Descripción",
      pIntro: "MDeX v{ver} — un lector y editor de Markdown diseñado para entornos offline, intranet y privacidad. Todos los archivos se procesan localmente — sin red, sin subidas, sin sincronización en la nube. Código fuente: github.com/fwzheng/mdex; Descarga: spinss.cn. Interfaz en 17 idiomas. También protege tus datos: guardado atómico (a prueba de caídas), detección de cambios externos, y abre archivos antiguos GBK / Latin-1 / UTF-16.",
      pPron: "Se pronuncia «em-dex» (/ˌemˈdɛks/) — la letra M seguida de «dex», dos sílabas.",
      hFeatures: "Funciones",
      features: [
        { b: "Pestañas múltiples", t: ": abre varios archivos a la vez; los cambios sin guardar se marcan con un punto y se pide confirmación al cerrar." },
        { b: "Vista previa dividida en vivo", t: ": arrastra el divisor para redimensionar; el botón de la barra alterna Dividido / Editor / Vista previa." },
        { b: "Fórmulas", t: ": en línea <code>$...$</code> y en bloque <code>$$...$$</code>, renderizadas por KaTeX." },
        { b: "Resaltado de código", t: ": idioma detectado automáticamente." },
        { b: "Imágenes", t: ": pegar / soltar / elegir - guardadas en carpeta <code>&lt;nombrearchivo&gt;_images/</code> (sin base64); borradores en carpeta temporal migrada al guardar; centradas." },
        { b: "Zoom de fuente", t: ": zoom independiente editor / vista (−/%/+ o ⌘=/−/0); persistente." },
        { b: "Diagramas Mermaid", t: ": un bloque <code>```mermaid</code> se renderiza como diagrama de flujo / secuencia / clase / estado / Gantt / pastel, etc.; haz clic en un diagrama para abrir una ventana de visualización independiente (zoom / pan / pantalla completa), actualizada en vivo." },
        { b: "Tema / idioma", t: ": oscuro / claro, 17 idiomas de interfaz." },
        { b: "Borrador automático", t: ": el contenido se guarda periódicamente y se restaura tras un cierre inesperado." },
        { b: "Exportar", t: ": guardar como Markdown / PDF / LaTeX." },
        { b: "Color del texto", t: ": la paleta de la barra colorea el texto seleccionado (12 colores)." },
        { b: "Atrás / Adelante", t: ": historial unificado de documentos y posiciones del cursor; botones ◀ ▶, Alt+←/→." },
        { b: "Seguir enlaces", t: ": un clic en un enlace de la vista previa abre el destino en una <strong>nueva pestaña</strong> (http en el navegador del sistema); el documento actual no se reemplaza." },
      ],
      hShortcuts: "Atajos",
      pShortcut: "Usa <code>⌘</code> en macOS, <code>Ctrl</code> en Windows / Linux.",
      thKey: "Atajo", thAction: "Acción",
      shortcuts: sc(["Nuevo","Abrir","Guardar","Guardar como","Cerrar pestaña","Cerrar ventana","Buscar","Reemplazar","Negrita","Cursiva","Código en línea","Enlace","Sangrar 2 espacios","Selección rectangular (columna)","Extender selección","Cancelar selección"]),
      hMd: "Referencia Markdown",
      md: [
        "Títulos: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Negrita: <code>**texto**</code>; cursiva: <code>*texto*</code>; tachado: <code>~~texto~~</code>",
        "Código en línea: <code>`código`</code>",
        "Bloque de código: delimitado por tres acentos graves; añade un lenguaje (p. ej. <code>python</code>) en la primera línea",
        "Cita: <code>&gt; texto</code>",
        "Lista con viñetas: <code>-</code> / <code>*</code> / <code>+</code>; lista numerada: <code>1.</code>",
        "Lista de tareas: <code>- [ ]</code> o <code>- [x]</code>",
        "Enlace: <code>[texto](url)</code>; imagen: <code>![alt](url)</code> o pegar / soltar",
        "Separador: <code>---</code>",
        "Tabla: <code>| A | B |</code> luego <code>| --- | --- |</code>",
      ],
      hMath: "Fórmulas",
      math: [
        "En línea: <code>$E = mc^2$</code>",
        "En bloque: envolver con <code>$$</code>, puede abarcar varias líneas, p. ej. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Usa sintaxis LaTeX, renderizada por KaTeX. <code>$</code> dentro de bloques de código no se trata como delimitador de fórmula.",
      ],
       hCite: "Citas (BibTeX)", cite: CITE_HELP_EN,hExport: "Exportar (Guardar como)",
      pExport: "Haz clic en «Guardar como» y elige un formato:",
      export: [
        { b: "Markdown (.md)", t: ": guarda el origen y actualiza el nombre / ruta de la pestaña actual." },
        { b: "PDF (.pdf)", t: ": paginado en los límites de bloque para que fórmulas, títulos, bloques de código y filas de tabla nunca se corten; un bloque que no cabe pasa entero a la siguiente página." },
        { b: "LaTeX (.tex)", t: ": convertido en fuente <code>.tex</code> compilable (con documentclass y paquetes; fórmulas intactas). Exporta una copia sin cambiar el documento actual." },
      ],
      hLicense: "Licencia",
      pLicense: "MDeX es de código abierto bajo <strong>Apache License 2.0</strong>, copyright the author. Los componentes incluidos (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro y Tauri, etc.) permanecen bajo sus licencias originales (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Contacto",
      pContact: "¡Gracias por usar MDeX! Para problemas o sugerencias, contáctanos en:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    pt: {
      hIntro: "Visão geral",
      pIntro: "MDeX v{ver} — um leitor e editor de Markdown feito para uso offline, intranet e privacidade. Todos os arquivos são processados localmente — sem rede, sem uploads, sem sincronização na nuvem. Código-fonte: github.com/fwzheng/mdex; Download: spinss.cn. Interface em 17 idiomas. Também protege seus dados: salvamento atômico (à prova de falhas), detecção de alterações externas, e abre arquivos antigos GBK / Latin-1 / UTF-16.",
      pPron: "Pronuncia-se «em-dex» (/ˌemˈdɛks/) — a letra M seguida de «dex», duas sílabas.",
      hFeatures: "Recursos",
      features: [
        { b: "Abas múltiplas", t: ": abra vários arquivos ao mesmo tempo; alterações não salvas são marcadas com um ponto e há confirmação antes de fechar." },
        { b: "Pré-visualização dividida ao vivo", t: ": arraste o divisor para redimensionar; o botão da barra alterna Dividido / Editor / Pré-visualização." },
        { b: "Fórmulas", t: ": em linha <code>$...$</code> e em bloco <code>$$...$$</code>, renderizadas por KaTeX." },
        { b: "Destaque de código", t: ": idioma detectado automaticamente." },
        { b: "Imagens", t: ": colar / soltar / escolher - salvas em pasta <code>&lt;nomearquivo&gt;_images/</code> (sem base64); rascunhos em pasta temporária migrada ao salvar; centralizadas." },
        { b: "Zoom de fonte", t: ": zoom independente editor / preview (−/%/+ ou ⌘=/−/0); persistente." },
        { b: "Diagramas Mermaid", t: ": um bloco <code>```mermaid</code> renderizado como fluxograma / sequência / classe / estado / Gantt / pizza, etc.; clique num diagrama para abrir uma janela de visualização independente (zoom / pan / tela cheia), atualizada ao vivo." },
        { b: "Tema / idioma", t: ": escuro / claro, 17 idiomas de interface." },
        { b: "Rascunho automático", t: ": o conteúdo é salvo periodicamente e restaurado após um fechamento inesperado." },
        { b: "Exportar", t: ": salvar como Markdown / PDF / LaTeX." },
        { b: "Cor do texto", t: ": a paleta da barra colore o texto selecionado (12 cores)." },
        { b: "Voltar / Avançar", t: ": histórico unificado de documentos e posições do cursor; botões ◀ ▶, Alt+←/→." },
        { b: "Seguir links", t: ": clicar num link da pré-visualização abre o destino numa <strong>nova aba</strong> (http no navegador do sistema); o documento atual não é substituído." },
      ],
      hShortcuts: "Atalhos",
      pShortcut: "Use <code>⌘</code> no macOS, <code>Ctrl</code> no Windows / Linux.",
      thKey: "Atalho", thAction: "Ação",
      shortcuts: sc(["Novo","Abrir","Salvar","Salvar como","Fechar guia","Fechar janela","Buscar","Substituir","Negrito","Itálico","Código em linha","Link","Recuar 2 espaços","Seleção retangular (colona)","Estender seleção","Cancelar seleção"]),
      hMd: "Referência Markdown",
      md: [
        "Títulos: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Negrito: <code>**texto**</code>; itálico: <code>*texto*</code>; tachado: <code>~~texto~~</code>",
        "Código em linha: <code>`código`</code>",
        "Bloco de código: delimitado por três acentos graves; adicione uma linguagem (ex. <code>python</code>) na primeira linha",
        "Citação: <code>&gt; texto</code>",
        "Lista com marcadores: <code>-</code> / <code>*</code> / <code>+</code>; lista numerada: <code>1.</code>",
        "Lista de tarefas: <code>- [ ]</code> ou <code>- [x]</code>",
        "Link: <code>[texto](url)</code>; imagem: <code>![alt](url)</code> ou colar / soltar",
        "Divisor: <code>---</code>",
        "Tabela: <code>| A | B |</code> depois <code>| --- | --- |</code>",
      ],
      hMath: "Fórmulas",
      math: [
        "Em linha: <code>$E = mc^2$</code>",
        "Em bloco: envolver com <code>$$</code>, pode ocupar várias linhas, ex. <code>$$\\int_0^1 x\\,dx$$</code>",
        "Usa sintaxe LaTeX, renderizada por KaTeX. <code>$</code> dentro de blocos de código não é tratado como delimitador de fórmula.",
      ],
       hCite: "Citações (BibTeX)", cite: CITE_HELP_EN,hExport: "Exportar (Salvar como)",
      pExport: "Clique em «Salvar como» e escolha um formato:",
      export: [
        { b: "Markdown (.md)", t: ": salva a origem e atualiza o nome / caminho da aba atual." },
        { b: "PDF (.pdf)", t: ": paginado nas fronteiras de bloco para que fórmulas, títulos, blocos de código e linhas de tabela nunca sejam cortados; um bloco que não cabe passa inteiro para a próxima página." },
        { b: "LaTeX (.tex)", t: ": convertido em fonte <code>.tex</code> compilável (com documentclass e pacotes; fórmulas mantidas). Exporta uma cópia sem alterar o documento atual." },
      ],
      hLicense: "Licença",
      pLicense: "MDeX é de código aberto sob <strong>Apache License 2.0</strong>, copyright the author. Os componentes incluídos (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro e Tauri, etc.) permanecem sob suas licenças originais (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Contato",
      pContact: "Obrigado por usar o MDeX! Para problemas ou sugestões, entre em contato:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    ar: {
      hIntro: "نظرة عامة",
      pIntro: "MDeX v{ver} — قارئ ومحرر Markdown مصمم للاستخدام دون اتصال والشبكات الداخلية وحماية الخصوصية. تُعالَج جميع الملفات محليًا — دون شبكة ولا رفع ولا مزامنة سحابية. الكود المصدري: github.com/fwzheng/mdex؛ التنزيل: spinss.cn. الواجهة بـ 17 لغة. يحمي بياناتك أيضًا: حفظ ذري (مقاوم للأعطال)، وكشف التعديلات الخارجية، وفتح ملفات GBK / Latin-1 / UTF-16 القديمة.",
      pPron: "يُنطق «em-dex» (/ˌemˈdɛks/) — الحرف M متبوعًا بـ «dex»، مقطعان لفظيان.",
      hFeatures: "الميزات",
      features: [
        { b: "تبويبات متعددة", t: ": افتح عدة ملفات دفعة واحدة؛ التغييرات غير المحفوظة تُعلَّم بنقطة ويُطلب التأكيد قبل الإغلاق." },
        { b: "معاينة مقسمة حية", t: ": اسحب الفاصل لتغيير الحجم؛ زر الشريط يبدّل مقسم / المحرر / المعاينة." },
        { b: "الصيغ", t: ": سطرية <code>$...$</code> وكتلية <code>$$...$$</code>، تُعرض بـ KaTeX." },
        { b: "تلوين الكود", t: ": يُكتشف اللغة تلقائيًا." },
        { b: "الصور", t: ": لصق / سحب / اختيار - تُحفظ في <code>&lt;filename&gt;_images/</code> (بدون base64)؛ المسودات في مجلد مؤقت يُنقل عند الحفظ؛ توسيط." },
        { b: "تكبير الخط", t: ": تكبير مستقل للمحرر / المعاينة (−/%/+ أو ⌘=/−/0)؛ دائم." },
        { b: "مخططات Mermaid", t: ": يُعرض كتلة <code>```mermaid</code> كمخطط انسيابي / تسلسل / فئة / حالة / غانت / دائري، إلخ؛ انقر على مخطط لفتح نافذة عرض مستقلة (تكبير / تحريك / ملء الشاشة)، تتحدث مباشرة." },
        { b: "السمة / اللغة", t: ": داكنة / فاتحة، 17 لغة واجهة؛ العربية والأردية تلقائيًا من اليمين لليسار." },
        { b: "مسودة تلقائية", t: ": يُحفظ المحتوى دوريًا ويُستعاد بعد إغلاق غير متوقع." },
        { b: "التصدير", t: ": حفظ بصيغة Markdown / PDF / LaTeX." },
        { b: "لون النص", t: ": لوحة الشريط تُلوِّن النص المحدد (12 لونًا)." },
        { b: "رجوع / للأمام", t: ": سجل موحد للمستندات ومواضع المؤشر؛ زرّا ◀ ▶، Alt+←/→." },
        { b: "اتباع الروابط", t: ": النقر على رابط في المعاينة يفتح الهدف في <strong>تبويب جديد</strong> (http في متصفح النظام)؛ لا يُستبدل المستند الحالي." },
      ],
      hShortcuts: "اختصارات",
      pShortcut: "استخدم <code>⌘</code> على macOS، و<code>Ctrl</code> على Windows / Linux.",
      thKey: "الاختصار", thAction: "الإجراء",
      shortcuts: sc(["جديد","فتح","حفظ","حفظ باسم","إغلاق التبويب","إغلاق النافذة","بحث","استبدال","عريض","مائل","كود سطري","رابط","إزاحة مسافتين","تحديد مستطيل (عمود)","توسيع التحديد","إلغاء التحديد"]),
      hMd: "مرجع Markdown",
      md: [
        "العناوين: <code># H1</code>، <code>## H2</code>، <code>### H3</code>",
        "عريض: <code>**نص**</code>؛ مائل: <code>*نص*</code>؛ مشطوب: <code>~~نص~~</code>",
        "كود سطري: <code>`كود`</code>",
        "كتلة كود: محاطة بثلاث علامات عكسية؛ أضف لغة (مثل <code>python</code>) في السطر الأول",
        "اقتباس: <code>&gt; نص</code>",
        "قائمة نقطية: <code>-</code> / <code>*</code> / <code>+</code>؛ قائمة مرقمة: <code>1.</code>",
        "قائمة مهام: <code>- [ ]</code> أو <code>- [x]</code>",
        "رابط: <code>[نص](url)</code>؛ صورة: <code>![alt](url)</code> أو لصق / سحب",
        "فاصل: <code>---</code>",
        "جدول: <code>| A | B |</code> ثم <code>| --- | --- |</code>",
      ],
      hMath: "الصيغ",
      math: [
        "سطرية: <code>$E = mc^2$</code>",
        "كتلية: أحطها بـ <code>$$</code>، قد تمتد لأسطر، مثل <code>$$\\int_0^1 x\\,dx$$</code>",
        "يستخدم صياغة LaTeX، يُعرض بـ KaTeX. <code>$</code> داخل كتل الكود لا يُعامل كفاصل صيغة.",
      ],
       hCite: "الاستشهادات (BibTeX)", cite: CITE_HELP_EN,hExport: "تصدير (حفظ باسم)",
      pExport: "انقر «حفظ باسم» واختر صيغة:",
      export: [
        { b: "Markdown (.md)", t: ": يحفظ المصدر ويحدّث اسم / مسار التبويب الحالي." },
        { b: "PDF (.pdf)", t: ": تُقسَّم الصفحات عند حدود الكتل حتى لا تُقطع الصيغ والعناوين وكتل الكود وصفوف الجداول؛ الكتلة التي لا تتسع تنتقل كاملة للصفحة التالية." },
        { b: "LaTeX (.tex)", t: ": يُحوَّل إلى مصدر <code>.tex</code> قابل للترجمة (مع documentclass والحزم؛ تُحفظ الصيغ). يُصدِّر نسخة دون تغيير المستند الحالي." },
      ],
      hLicense: "الترخيص",
      pLicense: "MDeX مفتوح المصدر تحت <strong>Apache License 2.0</strong>، حقوق النشر Fawei Zheng. المكونات المضمَّنة (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro و Tauri إلخ) تبقى تحت رخصها الأصلية (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0). التطبيق يعمل دون اتصال بالكامل — بدون شبكة ولا رفع.",
      hContact: "تواصل",
      pContact: "شكرًا لاستخدام MDeX! للمشاكل أو الاقتراحات، تواصل معنا:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    hi: {
      hIntro: "परिचय",
      pIntro: "MDeX v{ver} — ऑफ़लाइन, इंट्रानेट तथा गोपनीयता सुरक्षा के लिए डिज़ाइन किया गया Markdown पाठक व संपादक। सभी फ़ाइलेँ स्थानीय रूप से संसाधित होती हैं — बिना नेटवर्क, बिना अपलोड, बिना क्लाउड सिंक। स्रोत कोड: github.com/fwzheng/mdex; डाउनलोड: spinss.cn. इंटरफ़ेस 17 भाषाओं में। आपके डेटा की भी रक्षा करता है: परमाणु (क्रैश-सुरक्षित) सहेजना, बाहरी बदलावों का पता लगाना, और पुरानी GBK / Latin-1 / UTF-16 फ़ाइलें खोलना।",
      pPron: "उच्चारण “em-dex” (/ˌemˈdɛks/) — अक्षर M के बाद “dex”, दो अक्षर।",
      hFeatures: "विशेषताएँ",
      features: [
        { b: "मल्टी-टैब", t: ": एक साथ कई फ़ाइलें खोलें; असहेजे परिवर्तन बिंदु से चिह्नित, बंद करने से पहले पुष्टि; टैब बंद करने मध्य-क्लिक करें।" },
        { b: "लाइव विभाजित पूर्वावलोकन", t: ": आकार बदलने विभाजक खींचें; टूलबार बटन विभाजित / संपादक / पूर्वावलोकन चक्रित करता है।" },
        { b: "क्लिक-से-स्थिति", t: ": संपादक में क्लिक कर पूर्वावलोकन स्क्रॉल करें; पूर्वावलोकन में क्लिक कर संपादक में कर्सर ले जाएँ।" },
        { b: "खोज व प्रतिस्थापन", t: ": खोजें, एक या सभी बदलें, मिलान संख्या सहित; ⌘F / ⌘H।" },
        { b: "गणित", t: ": इनलाइन <code>$...$</code> व ब्लॉक <code>$$...$$</code> (<code>\\(...\\)</code>, <code>\\[...\\]</code> भी), KaTeX द्वारा; लंबे समीकरण संकारकों पर लपेटते या स्वतः सिकुड़ते हैं।" },
        { b: "कोड हाइलाइटिंग", t: ": भाषा स्वतः पहचानी; बड़े दस्तावेज़ चिकने रहने व्यूपोर्ट से आलसी-हाइलाइट।" },
        { b: "चित्र", t: ": पेस्ट / ड्रॉप / चुनें - <code>&lt;filename&gt;_images/</code> फ़ोल्डर में सहेजा (base64 नहीं); ड्राफ्ट अस्थायी->सहेजने पर माइग्रेट; केंद्रित।" },
        { b: "फ़ॉन्ट ज़ूम", t: ": संपादक / पूर्वावलोकन स्वतंत्र ज़ूम (−/%/+ या ⌘=/−/0); बना रहता।" },
        { b: "तालिकाएँ", t: ": GFM तालिकाएँ; सँकरी तालिकाएँ केंद्रित, चौड़ी क्षैतिज स्क्रॉल बिना कटे।" },
        { b: "Mermaid आरेख", t: ": <code>```mermaid</code> ब्लॉक फ़्लोचार्ट / अनुक्रम / वर्ग / अवस्था / गैंट / पाई आदि; मेन्यू सहायता → Mermaid उदाहरण पूर्ण नमूना लोड करता है। ; आरेख क्लिक करें अलग ज़ूम/पैन/फुलस्क्रीन व्यूअर विंडो खोलने के लिए, वास्तविक समय अपडेट" },
        { b: "उद्धरण", t: ": BibTeX संख्यात्मक शैली; अंत में संदर्भ सूची बनती है, [n] व प्रविष्टि में द्वि-दिशा कूद।" },
        { b: "HTML समर्थन", t: ": <code>.html</code> फ़ाइलें रेंडर कर खोलें; HTML ↔ Markdown रूपांतरण (मेन्यू फ़ाइल → रूपांतरण)।" },
        { b: "थीम / भाषा", t: ": डार्क / लाइट, 17 UI भाषाएँ; अरबी व उर्दू स्वतः दाएँ-से-बाएँ।" },
        { b: "स्वतः ड्राफ़्ट", t: ": सामग्री समय-समय सहेजी जाती व अप्रत्याशित बंद / क्रैश पर पुनर्स्थापित।" },
        { b: "शब्द गणन", t: ": स्टेटस बार अक्षर / पंक्तियाँ / शब्द वर्तमान पंक्ति-स्तंभ सहित दिखाता है।" },
        { b: "ड्रैग-एंड-ड्रॉप", t: ": <code>.md</code> फ़ाइल खोलने विंडो पर ड्रॉप; चित्र डालने ड्रॉप करें।" },
        { b: "निर्यात", t: ": Markdown / HTML / PDF (वेक्टर + रास्टर) / LaTeX सहेजें।" },
        { b: "पाठ रंग", t: ": टूलबार पैलेट चयनित पाठ को रंगता है (12 रंग)।" },
        { b: "पीछे / आगे", t: ": दस्तावेज़ों व कर्सर स्थितियों का एकीकृत इतिहास; ◀ ▶ बटन, Alt+←/→।" },
        { b: "लिंक खोलें", t: ": पूर्वावलोकन में लिंक पर क्लिक से लक्ष्य <strong>नई टैब</strong> में खुलता है (http सिस्टम ब्राउज़र में); मौजूदा दस्तावेज़ नहीं बदलता।" },
      ],
      hShortcuts: "शॉर्टकट",
      pShortcut: "macOS पर <code>⌘</code>, Windows / Linux पर <code>Ctrl</code>। खोलने विंडो पर <code>.md</code> ड्रॉप करें; टैब बंद मध्य-क्लिक।",
      thKey: "शॉर्टकट", thAction: "क्रिया",
      shortcuts: sc(["नया","खोलें","सहेजें","नाम से सहेजें","टैब बंद","विंडो बंद","खोजें","बदलें","बोल्ड","तिरछा","इनलाइन कोड","लिंक","2 रिक्त जगह इंडेंट","आयताकार (कॉलम) चयन","कॉलम चयन बढ़ाएँ","चयन रद्द"]),
      hMd: "Markdown संदर्भ",
      md: [
        "शीर्षक: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "बोल्ड: <code>**पाठ**</code>; तिरछा: <code>*पाठ*</code>; strike: <code>~~पाठ~~</code>",
        "इनलाइन कोड: <code>`कोड`</code>",
        "कोड ब्लॉक: तीन backtick से घिरा; पहली पंक्ति में भाषा (जैसे <code>python</code>) जोड़ें",
        "उद्धरण: <code>&gt; पाठ</code>",
        "बुलेट सूची: <code>-</code> / <code>*</code> / <code>+</code>; क्रमांकित: <code>1.</code>",
        "कार्य सूची: <code>- [ ]</code> या <code>- [x]</code>",
        "लिंक: <code>[पाठ](url)</code>; चित्र: <code>![alt](url)</code> या पेस्ट / ड्रॉप",
        "विभाजक: <code>---</code>",
        "तालिका: <code>| A | B |</code> फिर <code>| --- | --- |</code>",
      ],
      hMath: "गणित",
      math: [
        "इनलाइन: <code>$E = mc^2$</code> (<code>\\(E = mc^2\\)</code> भी)",
        "ब्लॉक: <code>$$</code> से घिरा, कई पंक्तियाँ, जैसे <code>$$\\int_0^1 x\\,dx$$</code> (<code>\\[...\\]</code> भी)",
        "LaTeX सिंटैक्स, KaTeX द्वारा। कोड ब्लॉक के अंदर <code>$</code> गणित विभाजक नहीं।",
      ],
       hCite: "उद्धरण (BibTeX)", cite: CITE_HELP_EN,hExport: "निर्यात (नाम से सहेजें)",
      pExport: "\"नाम से सहेजें\" चुनें और प्रारूप चुनें:",
      export: [
        { b: "Markdown (.md)", t: ": स्रोत सहेजता व टैब का नाम / पथ अद्यतन करता है।" },
        { b: "PDF (.pdf)", t: ": ब्लॉक सीमाओं पर पृष्ठ-विभाजन — सूत्र / शीर्षक / कोड-ब्लॉक कटते नहीं; बड़ा ब्लॉक पूरा अगले पृष्ठ पर।" },
        { b: "LaTeX (.tex)", t: ": संकलन-योग्य <code>.tex</code> में बदलता (documentclass व पैकेज सहित; गणित यथावत)। प्रतिलिपि निर्यात करता।" },
      ],
      hLicense: "लाइसेंस",
      pLicense: "MDeX <strong>Apache License 2.0</strong> के अंतर्गत मुक्त-स्रोत, कॉपीराइट Fawei Zheng। बंडल घटक (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown व Tauri आदि) अपनी मूल लाइसेंस (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0) में।",
      hContact: "संपर्क",
      pContact: "MDeX चुनने के लिए धन्यवाद! समस्याओं या सुझावों के लिए संपर्क करें:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    pa: {
      hIntro: "ਜਾਣ-ਪਛਾਣ",
      pIntro: "MDeX v{ver} — ਆਫਲਾਈਨ, ਇੰਟ੍ਰਾਨੈੱਟ ਤੇ ਨਿੱਜਤਾ ਸੁਰੱਖਿਆ ਲਈ ਬਣਾਇਆ Markdown ਰੀਡਰ ਤੇ ਐਡੀਟਰ। ਸਭ ਫ਼ਾਈਲਾਂ ਸਥਾਨਕ ਵਰਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ — ਬਿਨਾਂ ਨੈੱਟਵਰਕ, ਬਿਨਾਂ ਅੱਪਲੋਡ, ਬਿਨਾਂ ਕਲਾਊਡ ਸਿੰਕ। ਸਰੋਤ ਕੋਡ: github.com/fwzheng/mdex; ਡਾਊਨਲੋਡ: spinss.cn. ਇੰਟਰਫੇਸ 17 ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ। ਤੁਹਾਡੇ ਡਾਟੇ ਦੀ ਵੀ ਰੱਖਿਆ ਕਰਦਾ ਹੈ: ਪ੍ਰਮਾਣੂ (ਕ੍ਰੈਸ਼-ਸੁਰੱਖਿਅਤ) ਸੰਭਾਲਣਾ, ਬਾਹਰੀ ਬਦਲਾਵਾਂ ਦੀ ਪਛਾਣ, ਅਤੇ ਪੁਰਾਣੀਆਂ GBK / Latin-1 / UTF-16 ਫ਼ਾਈਲਾਂ ਖੋਲ੍ਹਣਾ।",
      pPron: "ਉਚਾਰਨ “em-dex” (/ˌemˈdɛks/) — ਅੱਖਰ M ਮਗਰੋਂ “dex”, ਦੋ ਅੱਖਰ।",
      hFeatures: "ਖਾਸੀਅਤਾਂ",
      features: [
        { b: "ਮਲਟੀ-ਟੈਬ", t: ": ਇੱਕੋ ਵੇਲੇ ਕਈ ਫ਼ਾਈਲਾਂ ਖੋਲ੍ਹੋ; ਨਾ-ਸੰਭਾਲੀਆਂ ਤਬਦੀਲੀਆਂ ਬਿੰਦੂ ਨਾਲ ਅੰਕਿਤ, ਬੰਦ ਤੋਂ ਪਹਿਲਾਂ ਪੁਸ਼ਟੀ।" },
        { b: "ਲਾਈਵ ਵੰਡੀ ਝਲਕ", t: ": ਆਕਾਰ ਲਈ ਵਿਭਾਜਕ ਘਸੀਟੋ; ਟੂਲਬਾਰ ਬਟਨ ਵੰਡੀ / ਐਡੀਟਰ / ਝਲਕ ਬਦਲਦਾ ਹੈ।" },
        { b: "ਕਲਿੱਕ-ਤੋਂ-ਸਥਿਤੀ", t: ": ਐਡੀਟਰ ਵਿੱਚ ਕਲਿੱਕ ਝਲਕ ਸਕ੍ਰੌਲ; ਝਲਕ ਵਿੱਚ ਕਲਿੱਕ ਐਡੀਟਰ ਕਰਸਰ ਲੈ ਜਾਂਦਾ।" },
        { b: "ਖੋਜ ਤੇ ਬਦਲ", t: ": ਖੋਜੋ, ਇੱਕ ਜਾਂ ਸਭ ਬਦਲੋ, ਮਿਲਾਨ ਗਿਣਤੀ ਸਹਿਤ; ⌘F / ⌘H।" },
        { b: "ਗਣਿਤ", t: ": ਇਨਲਾਈਨ <code>$...$</code> ਤੇ ਬਲਾਕ <code>$$...$$</code>, KaTeX ਰਾਹੀਂ; ਲੰਮੇ ਸਮੀਕਰਨ ਆਪਣੇ-ਆਪ ਸਮੇਟਦੇ ਜਾਂ ਸਕੁੰਚਿਤ।" },
        { b: "ਕੋਡ ਹਾਈਲਾਈਟ", t: ": ਭਾਸ਼ਾ ਆਪਣੇ-ਆਪ ਪਛਾਣੀ; ਵੱਡੇ ਦਸਤਾਵੇਜ਼ ਵਿਊਪੋਰਟ ਤੋਂ ਆਲਸੀ-ਹਾਈਲਾਈਟ।" },
        { b: "ਚਿੱਤਰ", t: ": ਪੇਸਟ / ਡਰੌਪ / ਚੁਣੋ - <code>&lt;filename&gt;_images/</code> ਫੋਲਡਰ ਵਿੱਚ ਸੰਭਾਲੇ (base64 ਨਹੀਂ); ਡਰਾਫਟ ਅਸਥਾਈ->ਸੰਭਾਲਣ ਵੇਲੇ ਮਾਈਗ੍ਰੇਟ; ਕੇਂਦਰਿਤ।" },
        { b: "ਫੌਂਟ ਜ਼ੂਮ", t: ": ਸੰਪਾਦਕ / ਝਲਕ ਸੁਤੰਤਰ ਜ਼ੂਮ (−/%/+ ਜਾਂ ⌘=/−/0); ਸਥਾਈ।" },
        { b: "ਸਾਰਣੀਆਂ", t: ": GFM ਸਾਰਣੀਆਂ; ਤੰਗ ਕੇਂਦਰਿਤ, ਚੌੜੀਆਂ ਕੱਟੇ ਬਿਨਾਂ ਖਿਤਿਜ਼ ਸਕ੍ਰੌਲ।" },
        { b: "Mermaid ਚਾਰਟ", t: ": <code>```mermaid</code> ਫ਼ਲੋਚਾਰਟ / ਸੀਕੁਐਂਸ / ਕਲਾਸ / ਸਟੇਟ / ਗੈਂਟ / ਪਾਈ ਆਦਿ; ਮੀਨੂ ਮਦਦ → Mermaid ਨਮੂਨਾ ਲੋਡ ਕਰਦਾ। ; ਚਾਰਟ ਤੇ ਕਲਿੱਕ ਕਰੋ ਵੱਖਰਾ ਜ਼ੂਮ/ਪੈਨ/ਫੁੱਲਸਕਰੀਨ ਵਿਊਅਰ ਵਿੰਡੋ ਖੋਲ੍ਹਣ ਲਈ, ਰੀਅਲ-ਟਾਈਮ ਅੱਪਡੇਟ" },
        { b: "ਹਵਾਲੇ", t: ": BibTeX ਅੰਕੀ ਸ਼ੈਲੀ; ਅੰਤ ਵਿੱਚ ਹਵਾਲਾ ਸੂਚੀ, [n] ਤੇ ਐਂਟਰੀ ਵਿੱਚ ਦੋ-ਪਾਸੇ ਛਾਲ।" },
        { b: "HTML ਸਮਰਥਨ", t: ": <code>.html</code> ਰੈਂਡਰ ਖੋਲ੍ਹੋ; HTML ↔ Markdown ਬਦਲੋ (ਮੀਨੂ ਫ਼ਾਈਲ → ਬਦਲੋ)।" },
        { b: "ਥੀਮ / ਭਾਸ਼ਾ", t: ": ਡਾਰਕ / ਲਾਈਟ, 17 UI ਭਾਸ਼ਾਵਾਂ; ਅਰਬੀ ਤੇ ਉਰਦੂ ਆਪਣੇ-ਆਪ ਸੱਜੇ-ਤੋਂ-ਖੱਬੇ।" },
        { b: "ਆਟੋ-ਡਰਾਫ਼ਟ", t: ": ਸਮਗਰੀ ਸਮੇਂ-ਸਮੇਂ ਸੰਭਾਲੀ ਤੇ ਅਚਾਨਕ ਬੰਦ / ਕ੍ਰੈਸ਼ ਉੱਤੇ ਮੁੜ-ਸਥਾਪਤ।" },
        { b: "ਸ਼ਬਦ ਗਿਣਤੀ", t: ": ਸਟੇਟਸ ਬਾਰ ਅੱਖਰ / ਸਤਰਾਂ / ਸ਼ਬਦ ਤੇ ਮੌਜੂਦਾ ਸਤਰ-ਕਾਲਮ ਵਿਖਾਉਂਦਾ।" },
        { b: "ਡਰੈਗ-ਐਂਡ-ਡਰੌਪ", t: ": <code>.md</code> ਖੋਲ੍ਹਣ ਵਿੰਡੋ ਉੱਤੇ ਡਰੌਪ; ਚਿੱਤਰ ਪਾਉਣ ਡਰੌਪ।" },
        { b: "ਨਿਰਯਾਤ", t: ": Markdown / HTML / PDF (ਵੈਕਟਰ + ਰਾਸਟਰ) / LaTeX ਸੰਭਾਲੋ।" },
        { b: "ਟੈਕਸਟ ਰੰਗ", t: ": ਟੂਲਬਾਰ ਪੈਲੇਟ ਚੁਣੇ ਟੈਕਸਟ ਨੂੰ ਰੰਗਦਾ ਹੈ (12 ਰੰਗ)।" },
        { b: "ਪਿੱਛੇ / ਅੱਗੇ", t: ": ਦਸਤਾਵੇਜ਼ਾਂ ਤੇ ਕਰਸਰ ਸਥਿਤੀਆਂ ਦਾ ਇਕਸਾਰ ਇਤਿਹਾਸ; ◀ ▶ ਬਟਨ, Alt+←/→।" },
        { b: "ਲਿੰਕ ਖੋਲ੍ਹੋ", t: ": ਝਲਕ ਵਿੱਚ ਲਿੰਕ ਉੱਤੇ ਕਲਿੱਕ ਨਾਲ ਨਿਸ਼ਾਨਾ <strong>ਨਵੀਂ ਟੈਬ</strong> ਵਿੱਚ ਖੁੱਲ੍ਹਦਾ ਹੈ (http ਸਿਸਟਮ ਬਰਾਊਜ਼ਰ ਵਿੱਚ); ਮੌਜੂਦਾ ਦਸਤਾਵੇਜ਼ ਨਹੀਂ ਬਦਲਦਾ।" },
      ],
      hShortcuts: "ਸ਼ਾਰਟਕੱਟ",
      pShortcut: "macOS ਉੱਤੇ <code>⌘</code>, Windows / Linux ਉੱਤੇ <code>Ctrl</code>। ਖੋਲ੍ਹਣ ਵਿੰਡੋ ਉੱਤੇ <code>.md</code> ਡਰੌਪ; ਟੈਬ ਬੰਦ ਮੱਧ-ਕਲਿੱਕ।",
      thKey: "ਸ਼ਾਰਟਕੱਟ", thAction: "ਕਾਰਵਾਈ",
      shortcuts: sc(["ਨਵਾਂ","ਖੋਲ੍ਹੋ","ਸੰਭਾਲੋ","ਨਾਮ ਨਾਲ ਸੰਭਾਲੋ","ਟੈਬ ਬੰਦ","ਵਿੰਡੋ ਬੰਦ","ਖੋਜੋ","ਬਦਲੋ","ਬੋਲਡ","ਤਿਰਛਾ","ਇਨਲਾਈਨ ਕੋਡ","ਲਿੰਕ","2 ਸਪੇਸ ਇੰਡੈਂਟ","ਆਇਤਾਕਾਰ (ਕਾਲਮ) ਚੋਣ","ਕਾਲਮ ਚੋਣ ਵਧਾਓ","ਚੋਣ ਰੱਦ"]),
      hMd: "Markdown ਹਵਾਲਾ",
      md: [
        "ਸਿਰਲੇਖ: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "ਬੋਲਡ: <code>**ਪਾਠ**</code>; ਤਿਰਛਾ: <code>*ਪਾਠ*</code>; strike: <code>~~ਪਾਠ~~</code>",
        "ਇਨਲਾਈਨ ਕੋਡ: <code>`ਕੋਡ`</code>",
        "ਕੋਡ ਬਲਾਕ: ਤਿੰਨ backtick ਨਾਲ ਘਿਰਿਆ; ਪਹਿਲੀ ਸਤਰ ਵਿੱਚ ਭਾਸ਼ਾ (ਜਿਵੇਂ <code>python</code>) ਜੋੜੋ",
        "ਹਵਾਲਾ: <code>&gt; ਪਾਠ</code>",
        "ਬੁਲੈਟ ਸੂਚੀ: <code>-</code> / <code>*</code> / <code>+</code>; ਅੰਕਿਤ: <code>1.</code>",
        "ਕੰਮ ਸੂਚੀ: <code>- [ ]</code> ਜਾਂ <code>- [x]</code>",
        "ਲਿੰਕ: <code>[ਪਾਠ](url)</code>; ਚਿੱਤਰ: <code>![alt](url)</code> ਜਾਂ ਪੇਸਟ / ਡਰੌਪ",
        "ਵਿਭਾਜਕ: <code>---</code>",
        "ਸਾਰਣੀ: <code>| A | B |</code> ਫਿਰ <code>| --- | --- |</code>",
      ],
      hMath: "ਗਣਿਤ",
      math: [
        "ਇਨਲਾਈਨ: <code>$E = mc^2$</code> (<code>\\(E = mc^2\\)</code> ਵੀ)",
        "ਬਲਾਕ: <code>$$</code> ਨਾਲ ਘਿਰਿਆ, ਕਈ ਸਤਰਾਂ, ਜਿਵੇਂ <code>$$\\int_0^1 x\\,dx$$</code> (<code>\\[...\\]</code> ਵੀ)",
        "LaTeX ਸਿੰਟੈਕਸ, KaTeX ਰਾਹੀਂ। ਕੋਡ ਬਲਾਕ ਅੰਦਰ <code>$</code> ਗਣਿਤ ਵਿਭਾਜਕ ਨਹੀਂ।",
      ],
       hCite: "ਹਵਾਲੇ (BibTeX)", cite: CITE_HELP_EN,hExport: "ਨਿਰਯਾਤ (ਨਾਮ ਨਾਲ ਸੰਭਾਲੋ)",
      pExport: "\"ਨਾਮ ਨਾਲ ਸੰਭਾਲੋ\" ਚੁਣੋ ਤੇ ਫਾਰਮੈਟ ਚੁਣੋ:",
      export: [
        { b: "Markdown (.md)", t: ": ਸਰੋਤ ਸੰਭਾਲਦਾ ਤੇ ਟੈਬ ਦਾ ਨਾਮ / ਰਾਹ ਅੱਪਡੇਟ ਕਰਦਾ।" },
        { b: "PDF (.pdf)", t: ": ਬਲਾਕ ਹੱਦਾਂ ਉੱਤੇ ਸਫ਼ਾ-ਵੰਡ — ਸੂਤਰ / ਸਿਰਲੇਖ / ਕੋਡ-ਬਲਾਕ ਨਹੀਂ ਕੱਟਦੇ; ਵੱਡਾ ਬਲਾਕ ਪੂਰਾ ਅਗਲੇ ਸਫ਼ੇ ਉੱਤੇ।" },
        { b: "LaTeX (.tex)", t: ": ਕੰਪਾਇਲ-ਯੋਗ <code>.tex</code> ਵਿੱਚ ਬਦਲਦਾ (documentclass ਤੇ ਪੈਕੇਜ; ਗਣਿਤ ਯਥਾਵਤ)। ਨਕਲ ਨਿਰਯਾਤ ਕਰਦਾ।" },
      ],
      hLicense: "ਲਾਈਸੈਂਸ",
      pLicense: "MDeX <strong>Apache License 2.0</strong> ਹੇਠ ਓਪਨ-ਸ੍ਰੋਤ, ਕਾਪੀਰਾਈਟ Fawei Zheng। ਬੰਡਲ ਭਾਗ (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown ਤੇ Tauri ਆਦਿ) ਆਪਣੀ ਮੂਲ ਲਾਈਸੈਂਸ (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0) ਹੇਠ।",
      hContact: "ਸੰਪਰਕ",
      pContact: "MDeX ਵਰਤਣ ਲਈ ਧੰਨਵਾਦ! ਸਮੱਸਿਆਵਾਂ ਜਾਂ ਸੁਝਾਅ ਲਈ ਸੰਪਰਕ ਕਰੋ:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    vi: {
      hIntro: "Tổng quan",
      pIntro: "MDeX v{ver} — một trình đọc & soạn thảo Markdown dành cho môi trường ngoại tuyến, nội bộ và bảo mật. Mọi tệp xử lý tại máy — không mạng, không tải lên, không đồng bộ đám mây. Mã nguồn: github.com/fwzheng/mdex; Tải xuống: spinss.cn. Giao diện 17 ngôn ngữ. Cũng bảo vệ dữ liệu của bạn: lưu nguyên tử (chống sập), phát hiện thay đổi bên ngoài, và mở các tệp cũ GBK / Latin-1 / UTF-16.",
      pPron: "Đọc là “em-dex” (/ˌemˈdɛks/) — chữ M theo sau là “dex”, hai âm tiết.",
      hFeatures: "Tính năng",
      features: [
        { b: "Đa thẻ", t: ": mở nhiều tệp cùng lúc; thay đổi chưa lưu được đánh dấu chấm, hỏi trước khi đóng; bấm chuột giữa thẻ để đóng." },
        { b: "Xem trước chia đôi trực tiếp", t: ": kéo vạch chia để đổi kích thước; nút thanh công cụ xoay Chia đôi / Soạn thảo / Xem trước." },
        { b: "Bấm để định vị", t: ": bấm trong trình soạn thảo để cuộn xem trước; bấm trong xem trước để nhảy con trỏ." },
        { b: "Tìm & thay", t: ": tìm, thay một hoặc tất cả, kèm số kết quả; ⌘F / ⌘H." },
        { b: "Toán học", t: ": nội dòng <code>$...$</code> và khối <code>$$...$$</code> (cả <code>\\(...\\)</code>, <code>\\[...\\]</code>), bởi KaTeX; phương trình dài tự ngắt tại toán tử hoặc tự thu nhỏ." },
        { b: "Tô sáng mã", t: ": tự nhận diện ngôn ngữ; tài liệu lớn tô sáng lười theo vùng nhìn." },
        { b: "Ảnh", t: ": dán / kéo / chọn - lưu vào <code>&lt;filename&gt;_images/</code> (không base64); bản nháp tạm->di chuyển khi lưu; căn giữa." },
        { b: "Thu phóng chữ", t: ": zoom độc lập trình soạn / xem trước (−/%/+ hoặc ⌘=/−/0); lưu lại." },
        { b: "Bảng", t: ": bảng GFM; bảng hẹp căn giữa, bảng rộng cuộn ngang không bị cắt." },
        { b: "Sơ đồ Mermaid", t: ": khối <code>```mermaid</code> vẽ lưu đồ / tuần tự / lớp / trạng thái / Gantt / bánh; menu Trợ giúp → Ví dụ Mermaid tải mẫu đầy đủ. ; nhấp sơ đồ để mở cửa sổ xem độc lập (zoom / pan / toàn màn hình), cập nhật trực tiếp" },
        { b: "Trích dẫn", t: ": phong cách số BibTeX; danh sách Tài liệu tham khảo tạo ở cuối, nhảy hai chiều giữa [n] và mục." },
        { b: "Hỗ trợ HTML", t: ": mở <code>.html</code> để kết xuất; chuyển đổi HTML ↔ Markdown (menu Tệp → Chuyển đổi)." },
        { b: "Giao diện / ngôn ngữ", t: ": tối / sáng, 17 ngôn ngữ UI; Ả Rập & Urdu tự động phải-sang-trái." },
        { b: "Tự động nháp", t: ": nội dung lưu định kỳ và khôi phục sau khi đóng bất thường." },
        { b: "Đếm từ", t: ": thanh trạng thái hiển thị ký tự / dòng / từ cùng dòng-cột hiện tại." },
        { b: "Kéo-thả", t: ": thả tệp <code>.md</code> vào cửa sổ để mở; thả ảnh để chèn." },
        { b: "Xuất", t: ": lưu thành Markdown / HTML / PDF (vector + raster) / LaTeX." },
        { b: "Màu chữ", t: ": bảng màu trên thanh công cụ tô màu chữ được chọn (12 màu)." },
        { b: "Lùi / Tiến", t: ": lịch sử thống nhất qua tài liệu và vị trí con trỏ; nút ◀ ▶, Alt+←/→." },
        { b: "Mở liên kết", t: ": nhấp liên kết trong xem trước sẽ mở đích trong <strong>tab mới</strong> (http trong trình duyệt hệ thống); tài liệu hiện tại không bị thay thế." },
      ],
      hShortcuts: "Phím tắt",
      pShortcut: "Dùng <code>⌘</code> trên macOS, <code>Ctrl</code> trên Windows / Linux. Thả <code>.md</code> vào cửa sổ để mở; bấm giữa thẻ để đóng.",
      thKey: "Phím tắt", thAction: "Hành động",
      shortcuts: sc(["Mới","Mở","Lưu","Lưu thành","Đóng thẻ","Đóng cửa sổ","Tìm","Thay","Đậm","Nghiêng","Mã nội dòng","Liên kết","Thụt 2 dấu cách","Chọn cột chữ nhật","Mở rộng chọn cột","Hủy chọn"]),
      hMd: "Tham chiếu Markdown",
      md: [
        "Tiêu đề: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Đậm: <code>**chữ**</code>; nghiêng: <code>*chữ*</code>; gạch ngang: <code>~~chữ~~</code>",
        "Mã nội dòng: <code>`mã`</code>",
        "Khối mã: bọc bằng ba dấu huyền; thêm ngôn ngữ (vd. <code>python</code>) ở dòng đầu",
        "Trích dẫn: <code>&gt; chữ</code>",
        "Danh sách đầu mục: <code>-</code> / <code>*</code> / <code>+</code>; danh sách số: <code>1.</code>",
        "Danh sách việc: <code>- [ ]</code> hoặc <code>- [x]</code>",
        "Liên kết: <code>[chữ](url)</code>; ảnh: <code>![alt](url)</code> hoặc dán / thả",
        "Dòng phân cách: <code>---</code>",
        "Bảng: <code>| A | B |</code> rồi <code>| --- | --- |</code>",
      ],
      hMath: "Toán học",
      math: [
        "Nội dòng: <code>$E = mc^2$</code> (cả <code>\\(E = mc^2\\)</code>)",
        "Khối: bọc bằng <code>$$</code>, có thể nhiều dòng, vd. <code>$$\\int_0^1 x\\,dx$$</code> (cả <code>\\[...\\]</code>)",
        "Dùng cú pháp LaTeX, kết xuất bởi KaTeX. <code>$</code> trong khối mã không là dấu phân cách công thức.",
      ],
       hCite: "Trích dẫn (BibTeX)", cite: CITE_HELP_EN,hExport: "Xuất (Lưu thành)",
      pExport: "Bấm \"Lưu thành\" và chọn định dạng:",
      export: [
        { b: "Markdown (.md)", t: ": lưu nguồn và cập nhật tên / đường dẫn thẻ hiện tại." },
        { b: "PDF (.pdf)", t: ": phân trang theo ranh giới khối — không cắt công thức / tiêu đề / khối mã; khối lớn chuyển nguyên sang trang kế." },
        { b: "LaTeX (.tex)", t: ": chuyển thành mã nguồn <code>.tex</code> có thể biên dịch (kèm documentclass và gói; giữ nguyên công thức). Xuất bản sao." },
      ],
      hLicense: "Giấy phép",
      pLicense: "MDeX là mã nguồn mở theo <strong>Apache License 2.0</strong>, bản quyền Fawei Zheng. Các thành phần đi kèm (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown và Tauri, v.v.) giữ giấy phép gốc (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Liên hệ",
      pContact: "Cảm ơn bạn dùng MDeX! Mọi vấn đề hoặc góp ý, liên hệ:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    id: {
      hIntro: "Ikhtisar",
      pIntro: "MDeX v{ver} — pembaca & editor Markdown yang dirancang untuk mode luring, intranet, dan privasi. Semua berkas diproses secara lokal — tanpa jaringan, tanpa unggahan, tanpa sinkronisasi cloud. Kode sumber: github.com/fwzheng/mdex; Unduh: spinss.cn. Antarmuka 17 bahasa. Juga melindungi data Anda: penyimpanan atomik (tahan crash), deteksi perubahan eksternal, dan membuka file lama GBK / Latin-1 / UTF-16.",
      pPron: "Dibaca “em-dex” (/ˌemˈdɛks/) — huruf M diikuti “dex”, dua suku kata.",
      hFeatures: "Fitur",
      features: [
        { b: "Multi-tab", t: ": buka beberapa berkas sekaligus; perubahan belum tersimpan ditandai titik, dikonfirmasi sebelum ditutup; klik tengah tab untuk menutup." },
        { b: "Pratinjau terbagi langsung", t: ": seret pembatas untuk mengubah ukuran; tombol bar siklus Bagi / Editor / Pratinjau." },
        { b: "Klik-ke-posisi", t: ": klik di editor untuk menggulir pratinjau; klik di pratinjau untuk meloncatkan kursor." },
        { b: "Cari & ganti", t: ": cari, ganti satu atau semua, dengan jumlah cocok; ⌘F / ⌘H." },
        { b: "Matematika", t: ": sebaris <code>$...$</code> dan blok <code>$$...$$</code> (juga <code>\\(...\\)</code>, <code>\\[...\\]</code>), oleh KaTeX; persamaan panjang otomatis melipat atau mengecil." },
        { b: "Penyorotan kode", t: ": bahasa dideteksi otomatis; dokumen besar disorot malas per viewport." },
        { b: "Gambar", t: ": tempel / seret / pilih - ke <code>&lt;filename&gt;_images/</code> (tanpa base64); draf folder sementara->dipindahkan saat disimpan; rata tengah." },
        { b: "Zoom font", t: ": zoom editor / preview independen (−/%/+ atau ⌘=/−/0); tersimpan." },
        { b: "Tabel", t: ": tabel GFM; tabel sempit di tengah, tabel lebar menggulir horizontal tanpa terpotong." },
        { b: "Diagram Mermaid", t: ": blok <code>```mermaid</code> menjadi flowchart / sequence / class / state / Gantt / pie; menu Bantuan → Contoh Mermaid memuat sampel penuh. ; klik diagram untuk jendela viewer independen (zoom / pan / layar penuh), diperbarui langsung" },
        { b: "Kutipan", t: ": gaya numerik BibTeX; daftar Referensi dibuat di akhir, lompat dua arah antara [n] dan entri." },
        { b: "Dukungan HTML", t: ": buka <code>.html</code> untuk dirender; konversi HTML ↔ Markdown (menu Berkas → Konversi)." },
        { b: "Tema / bahasa", t: ": gelap / terang, 17 bahasa UI; Arab & Urdu otomatis kanan-ke-kiri." },
        { b: "Draf otomatis", t: ": konten disimpan berkala dan dipulihkan setelah tutup mendadak." },
        { b: "Hitung kata", t: ": bilah status menampilkan karakter / baris / kata plus baris-kolom kini." },
        { b: "Seret & jatuhkan", t: ": jatuhkan <code>.md</code> ke jendela untuk membuka; jatuhkan gambar untuk menyisipkan." },
        { b: "Ekspor", t: ": simpan sebagai Markdown / HTML / PDF (vektor + raster) / LaTeX." },
        { b: "Warna teks", t: ": palet pada bilah alat mewarnai teks terpilih (12 warna)." },
        { b: "Mundur / Maju", t: ": riwayat terpadu lintas dokumen dan posisi kursor; tombol ◀ ▶, Alt+←/→." },
        { b: "Ikuti tautan", t: ": klik tautan di pratinjau membuka target di <strong>tab baru</strong> (http di peramban sistem); dokumen saat ini tidak diganti." },
      ],
      hShortcuts: "Pintasan",
      pShortcut: "Gunakan <code>⌘</code> di macOS, <code>Ctrl</code> di Windows / Linux. Jatuhkan <code>.md</code> ke jendela untuk membuka; klik tengah tab untuk menutup.",
      thKey: "Pintasan", thAction: "Aksi",
      shortcuts: sc(["Baru","Buka","Simpan","Simpan Sebagai","Tutup Tab","Tutup Jendela","Cari","Ganti","Tebal","Miring","Kode sebaris","Tautan","Indentasi 2 spasi","Pilihan kolom (persegi)","Perluas pilihan kolom","Batal pilihan"]),
      hMd: "Ringkasan Markdown",
      md: [
        "Judul: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Tebal: <code>**teks**</code>; miring: <code>*teks*</code>; coret: <code>~~teks~~</code>",
        "Kode sebaris: <code>`kode`</code>",
        "Blok kode: dibungkus tiga backtick; tambahkan bahasa (mis. <code>python</code>) di baris pertama",
        "Kutipan: <code>&gt; teks</code>",
        "Daftar poin: <code>-</code> / <code>*</code> / <code>+</code>; daftar bernomor: <code>1.</code>",
        "Daftar tugas: <code>- [ ]</code> atau <code>- [x]</code>",
        "Tautan: <code>[teks](url)</code>; gambar: <code>![alt](url)</code> atau tempel / jatuhkan",
        "Pemisah: <code>---</code>",
        "Tabel: <code>| A | B |</code> lalu <code>| --- | --- |</code>",
      ],
      hMath: "Matematika",
      math: [
        "Sebaris: <code>$E = mc^2$</code> (juga <code>\\(E = mc^2\\)</code>)",
        "Blok: bungkus <code>$$</code>, bisa beberapa baris, mis. <code>$$\\int_0^1 x\\,dx$$</code> (juga <code>\\[...\\]</code>)",
        "Memakai sintaks LaTeX, dirender KaTeX. <code>$</code> di dalam blok kode bukan pembatas matematika.",
      ],
       hCite: "Kutipan (BibTeX)", cite: CITE_HELP_EN,hExport: "Ekspor (Simpan Sebagai)",
      pExport: "Klik \"Simpan Sebagai\" dan pilih format:",
      export: [
        { b: "Markdown (.md)", t: ": menyimpan sumber dan memperbarui nama / path tab kini." },
        { b: "PDF (.pdf)", t: ": dipaginasi pada batas blok — rumus / judul / blok kode tak terpotong; blok besar pindah utuh ke halaman berikut." },
        { b: "LaTeX (.tex)", t: ": dikonversi ke sumber <code>.tex</code> yang dapat dikompilasi (dengan documentclass dan paket; matematika tetap). Mengekspor salinan." },
      ],
      hLicense: "Lisensi",
      pLicense: "MDeX bersumber terbuka di bawah <strong>Apache License 2.0</strong>, hak cipta Fawei Zheng. Komponen yang dibundel (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown dan Tauri dll.) tetap di bawah lisensi aslinya (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).",
      hContact: "Kontak",
      pContact: "Terima kasih memakai MDeX! Untuk masalah atau saran, hubungi:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    ur: {
      hIntro: "تعارف",
      pIntro: "MDeX v{ver} — آف لائن، انٹرانیٹ اور رازداری کی حفاظت کے لیے بنایا گیا Markdown قاری و ایڈیٹر۔ تمام فائلیں مقامی طور پر پروسیس ہوتی ہیں — بغیر نیٹ ورک، بغیر اپ لوڈ، بغیر کلاؤڈ سنک۔ سورس کوڈ: github.com/fwzheng/mdex؛ ڈاؤن لوڈ: spinss.cn۔ انٹرفیس 17 زبانوں میں۔ آپ کے ڈیٹا کی بھی حفاظت کرتا ہے: ایٹمک (کریش محفوظ) محفوظ کرنا، بیرونی تبدیلیوں کا پتہ لگانا، اور پرانی GBK / Latin-1 / UTF-16 فائلیں کھولنا۔",
      pPron: "تلفظ “em-dex” (/ˌemˈdɛks/) — حرف M کے بعد “dex”， دو حصے۔",
      hFeatures: "خصوصیات",
      features: [
        { b: "ملٹی ٹیب", t: ": ایک ساتھ کئی فائلیں کھولیں؛ غیر محفوظ تبدیلیاں نقطے سے نشان زد، بند کرنے سے پہلے تصدیق؛ ٹیب بند کے لیے درمیان کلک۔" },
        { b: "لائیو تقسیم پیش نظارہ", t: ": سائز بدلنے تقسیم کار کو گھسیٹیں؛ ٹول بار بٹن تقسیم / ایڈیٹر / پیش نظارہ بدلتا ہے۔" },
        { b: "کلک-سے-مقام", t: ": ایڈیٹر میں کلک کر پیش نظارہ اسکرول؛ پیش نظارہ میں کلک کر کرسر لے جائیں۔" },
        { b: "تلاش و تبدیلی", t: ": تلاش، ایک یا سب تبدیل، میچ تعداد کے ساتھ؛ ⌘F / ⌘H۔" },
        { b: "ریاضی", t: ": ان لائن <code>$...$</code> اور بلاک <code>$$...$$</code> (<code>\\(...\\)</code>، <code>\\[...\\]</code> بھی)، KaTeX کے ذریعے؛ لمبے مساوات آپریٹرز پر لپیٹتے یا خود سکڑتے ہیں۔" },
        { b: "کوڈ ہائی لائٹ", t: ": زبان خود سمجھی جاتی؛ بڑے دستاویزات Viu port سے سست ہائی لائٹ۔" },
        { b: "تصاویر", t: ": پیسٹ / ڈراپ / منتخب - <code>&lt;filename&gt;_images/</code> میں محفوظ (base64 نہیں)؛ ڈرافٹ عارضی->محفوظ کرنے پر منتقل؛ مرکز۔" },
        { b: "فونٹ زوم", t: ": ایڈیٹر / پیش نظارہ آزاد زوم (−/%/+ یا ⌘=/−/0); مستقل۔" },
        { b: "جداول", t: ": GFM جداول؛ تنگ جداول درمیان، چوڑی افقی اسکرول بغیر کٹائی۔" },
        { b: "Mermaid خاکے", t: ": <code>```mermaid</code> بلاک فلو چارٹ / سلسلہ / کلاس / حالت / گینٹ / پائی وغیرہ؛ مینیو مدد → Mermaid نمونہ مکمل نمونہ لود کرتا ہے۔ ; خاکے پر کلک کریں آزاد زوم/پین/فل اسکرین ویور ونڈو کھولنے کے لیے، حقیقی وقت اپ ڈیٹ" },
        { b: "حوالے", t: ": BibTeX عددی انداز؛ حوالہ جات فہرست آخر میں بنتی، [n] اور اندراج کے درمیان دو طرفہ چھلانگ۔" },
        { b: "HTML معاونت", t: ": <code>.html</code> رینڈر کے لیے کھولیں؛ HTML ↔ Markdown تبدیلی (مینیو فائل → تبدیلی)۔" },
        { b: "تھیم / زبان", t: ": گہرا / ہلکا، 17 UI زبانیں؛ عربی و اردو خود دائیں-سے-بائیں۔" },
        { b: "خود مسودہ", t: ": مواد وقتاً فوقتاً محفوظ اور اچانک بند / کریش کے بعد بحال۔" },
        { b: "لفظ گنتی", t: ": اسٹیٹس بار حروف / سطریں / الفاظ کے ساتھ موجودہ سطر-کالم دکھاتا ہے۔" },
        { b: "ڈریگ اینڈ ڈراپ", t: ": <code>.md</code> کھولنے ونڈو پر ڈراپ؛ تصویر شامل کرنے ڈراپ کریں۔" },
        { b: "برآمد", t: ": Markdown / HTML / PDF (ویکٹر + راسٹر) / LaTeX محفوظ کریں۔" },
        { b: "متن کا رنگ", t: ": ٹول بار کی پلیٹ منتخب متن کو رنگتی ہے (12 رنگ)۔" },
        { b: "پیچھے / آگے", t: ": دستاویزات و کرسر مقامات کی متفقہ تاریخ؛ ◀ ▶ بٹن، Alt+←/→۔" },
        { b: "ربط کھولیں", t: ": پیش نظارہ میں ربط پر کلک سے ہدف <strong>نئی ٹیب</strong> میں کھلتا ہے (http سسٹم براؤزر میں)؛ موجودہ دستاویز تبدیل نہیں ہوتی۔" },
      ],
      hShortcuts: "شارٹ کٹ",
      pShortcut: "macOS پر <code>⌘</code>، Windows / Linux پر <code>Ctrl</code>۔ کھولنے ونڈو پر <code>.md</code> ڈراپ؛ ٹیب بند درمیان کلک۔",
      thKey: "شارٹ کٹ", thAction: "عمل",
      shortcuts: sc(["نیا","کھولیں","محفوظ","اس نام سے محفوظ","ٹیب بند","ونڈو بند","تلاش","تبدیل","موٹا","ترچھا","ان لائن کوڈ","ربط","2 اسپیس انڈینٹ","مستطیل (کالم) انتخاب","کالم انتخاب بڑھائیں","انتخاب منسوخ"]),
      hMd: "Markdown حوالہ",
      md: [
        "سرخیاں: <code># H1</code>، <code>## H2</code>، <code>### H3</code>",
        "موٹا: <code>**متن**</code>؛ ترچھا: <code>*متن*</code>؛ strike: <code>~~متن~~</code>",
        "ان لائن کوڈ: <code>`کوڈ`</code>",
        "کوڈ بلاک: تین backtick سے گھرا؛ پہلی سطر میں زبان (جیسے <code>python</code>) شامل کریں",
        "اقتباس: <code>&gt; متن</code>",
        "نقطہ فہرست: <code>-</code> / <code>*</code> / <code>+</code>؛ ترقیم: <code>1.</code>",
        "کام فہرست: <code>- [ ]</code> یا <code>- [x]</code>",
        "ربط: <code>[متن](url)</code>؛ تصویر: <code>![alt](url)</code> یا پیسٹ / ڈراپ",
        "تقسیم کار: <code>---</code>",
        "جدول: <code>| A | B |</code> پھر <code>| --- | --- |</code>",
      ],
      hMath: "ریاضی",
      math: [
        "ان لائن: <code>$E = mc^2$</code> (<code>\\(E = mc^2\\)</code> بھی)",
        "بلاک: <code>$$</code> سے گھرا، کئی سطریں، جیسے <code>$$\\int_0^1 x\\,dx$$</code> (<code>\\[...\\]</code> بھی)",
        "LaTeX نحوی استعمال، KaTeX رینڈر۔ کوڈ بلاک کے اندر <code>$</code> ریاضی تقسیم کار نہیں۔",
      ],
       hCite: "حوالے (BibTeX)", cite: CITE_HELP_EN,hExport: "برآمد (اس نام سے محفوظ)",
      pExport: "\"اس نام سے محفوظ\" چنیں اور فارمیٹ منتخب کریں:",
      export: [
        { b: "Markdown (.md)", t: ": ماخذ محفوظ اور ٹیب کا نام / راستہ اپ ڈیٹ کرتا ہے۔" },
        { b: "PDF (.pdf)", t: ": بلاک حدوں پر صفحہ بندی — صیغے / سرخیاں / کوڈ بلاک نہیں کٹتے؛ بڑا بلاک مکمل اگلے صفحے پر۔" },
        { b: "LaTeX (.tex)", t: ": مرتب-قابل <code>.tex</code> میں بدلتا (documentclass اور پیکجز؛ ریاضی یثابت)۔ ایک کاپی برآمد کرتا۔" },
      ],
      hLicense: "لائسنس",
      pLicense: "MDeX <strong>Apache License 2.0</strong> کے تحت اوپن سورس، کاپی رائٹ Fawei Zheng۔ بنڈل شدہ اجزاء (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown اور Tauri وغیرہ) اپنی اصل لائسنس (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0) میں رہتے۔",
      hContact: "رابطہ",
      pContact: "MDeX چننے کا شکریہ! مسائل یا تجاویز کے لیے رابطہ کریں:",
      contactName: "Fawei Zheng (郑法伟)",
    },
    mn: {
      hIntro: "Тойм",
      pIntro: "MDeX v{ver} — Офлайн, интранет ба нууцлал хамгаалалтад зориулсан Markdown уншигч ба засварлагч. Бүх файл орон нутагтаа боловсруулагдана — сүлжээгүй, байршуулалтгүй, үүлэн синкгүй. Эх код: github.com/fwzheng/mdex; Татаж авах: spinss.cn. Интерфейс 17 хэлээр. Таны мэдээллийг бас хамгаалдаг: атомын (гацалтад тэсвэртэй) хадгалалт, гадаад өөрчлөлтийг илрүүлэх, мөн хуучин GBK / Latin-1 / UTF-16 файлуудыг нээх.",
      pPron: "«em-dex» гэж дуудна (/ˌemˈdɛks/) — M үсгийн ард «dex», хоёр үе.",
      hFeatures: "Боломжууд",
      features: [
        { b: "Олон таб", t: ": нэгэн зэрэг хэд хэдэн файл нээ; хадгалаагүй өөрчлөлт цэгээр тэмдэглэгдэж, хаахын өмнө баталгаажуулна; табыг хаахын тулд дунд товчийг дар." },
        { b: "Шууд хуваасан урьдчилан харах", t: ": хэмжээ өөрчлөхдөө хуваагчийг чир; багажны товч Хуваасан / Засварлагч / Урьдчилан харах-г ээлжлэнэ." },
        { b: "Дарж байрлуулах", t: ": засварлагч дээр дарж урьдчилан харахыг гүйлгэ; урьдчилан харах дээр дарж курсорыг засварлагч руу шилжүүл." },
        { b: "Хайх ба солих", t: ": хайх, нэгийг эсвэл бүгдийг солих, тааралтын тооны хамт; ⌘F / ⌘H." },
        { b: "Математик", t: ": шугаман <code>$...$</code> ба блок <code>$$...$$</code> (<code>\\(...\\)</code>, <code>\\[...\\]</code> бас), KaTeX-ээр; урт тэгшитгэл оператор дээр хугарах эсвэл автоматаар жижигрэнэ." },
        { b: "Кодоор өнгөлөх", t: ": хэл автоматаар танигдана; том баримт дэлгэцийн бүсээр удаашралтай өнгөлнө." },
        { b: "Зураг", t: ": буулгах / чирэх / сонгох - <code>&lt;filename&gt;_images/</code> хавтсанд (base64 биш); ноорог түр->хадгалах үед шилжүүлнэ; төвлөрсөн." },
        { b: "Фонтын масштаб", t: ": засварлагч / урьдчилан харах тус тус (−/%/+ эсвэл ⌘=/−/0); хадгалагдана." },
        { b: "Хүснэгт", t: ": GFM хүснэгт; нарийн хүснэгт агуулгаар төвдөг, өргөн нь хэвтээгээр гүйлгэхэд таслагдахгүй." },
        { b: "Mermaid диаграмм", t: ": <code>```mermaid</code> блок урсгалын / дарааллын / ангийн / төлөвийн / Ганттын / бөөрөнхий диаграмм болно; цэс Тусламж → Mermaid жишээ бүрэн дээжийг ачаална. ; диаграмм дээр дарж бие даасан zoom/pan/бүтэн дэлгэц цонх нээх, шууд шинэчлэгдэнэ" },
        { b: "Эшлэл", t: ": BibTeX тоон хэв маяг; төгсгөлд Эх сурвалжийн жагсаалт үүсэх бөгөөд [n] болон бичлэг хооронд хоёр чиглэлийн үсрэлт." },
        { b: "HTML дэмжлэг", t: ": <code>.html</code> файлыг хөрвүүлж нээ; HTML ↔ Markdown хооронд хөрвүүлэх (цэс Файл → Хөрвүүлэх)." },
        { b: "Загвар / хэл", t: ": бараан / цайвар, 17 UI хэл; Араб, Урдү автоматаар баруунаас зүүн." },
        { b: "Автомат ноорог", t: ": агуулга тогтмол хадгалагдаж, гэнэтийн хаагдах / гацахад сэргээгдэнэ." },
        { b: "Үг тоолох", t: ": төлөвийн мөр тэмдэгт / мөр / үг болон одоогийн мөр-багныг харуулна." },
        { b: "Чирж буулгах", t: ": <code>.md</code> файлыг цонх руу буулгаж нээ; зураг буулгаж оруул." },
        { b: "Экспорт", t: ": Markdown / HTML / PDF (вектор + растр) / LaTeX болгох." },
        { b: "Текстний өнгө", t: ": багажны самбар сонгосон текстийг өнгөлнө (12 өнгө)." },
        { b: "Буцах / Урагш", t: ": баримт ба курсорын байрлалын нэгдмэл түүх; ◀ ▶ товч, Alt+←/→." },
        { b: "Холбоос дагах", t: ": урьдчилан харах дотор холбоос даран зорьтыг <strong>шинэ табед</strong> нээнэ (http системийн хөтөч дотор); одоогийн баримт солигдохгүй." },
      ],
      hShortcuts: "Богино товчлол",
      pShortcut: "macOS дээр <code>⌘</code>, Windows / Linux дээр <code>Ctrl</code>. Нээхийн тулд <code>.md</code>-г цонх руу буулга; табыг хаахын тулд дунд товч.",
      thKey: "Богино товчлол", thAction: "Үйлдэл",
      shortcuts: sc(["Шинэ","Нээх","Хадгалах","Өөр нэрээр хадгалах","Таб хаах","Цонх хаах","Хайх","Солих","Тод","Налуу","Шугаман код","Холбоос","2 зайгаар нүүх","Тэгш өнцөгт (баган) сонголт","Баган сонголтыг өргөтгөх","Сонголтыг цуцлах"]),
      hMd: "Markdown лавлах",
      md: [
        "Гарчиг: <code># H1</code>, <code>## H2</code>, <code>### H3</code>",
        "Тод: <code>**текст**</code>; налуу: <code>*текст*</code>; дундуур зураас: <code>~~текст~~</code>",
        "Шугаман код: <code>`код`</code>",
        "Кодын блок: гурван backtick-ээр хүрээлэгдсэн; эхний мөрөнд хэл (жишээ нь <code>python</code>) нэм",
        "Ишлэл: <code>&gt; текст</code>",
        "Цэгт жагсаалт: <code>-</code> / <code>*</code> / <code>+</code>; дугаарласан: <code>1.</code>",
        "Даалгаврын жагсаалт: <code>- [ ]</code> эсвэл <code>- [x]</code>",
        "Холбоос: <code>[текст](url)</code>; зураг: <code>![alt](url)</code> эсвэл буулгах / чирэх",
        "Хуваагч: <code>---</code>",
        "Хүснэгт: <code>| A | B |</code> дараа нь <code>| --- | --- |</code>",
      ],
      hMath: "Математик",
      math: [
        "Шугаман: <code>$E = mc^2$</code> (<code>\\(E = mc^2\\)</code> бас)",
        "Блок: <code>$$</code>-ээр хүрээлэх, хэд хэдэн мөр болно, жишээ нь <code>$$\\int_0^1 x\\,dx$$</code> (<code>\\[...\\]</code> бас)",
        "LaTeX бичиглэл ашиглана, KaTeX-ээр хөрвүүлнэ. Кодын блок дотор <code>$</code> нь математик тусгаарлагч биш.",
      ],
       hCite: "Эшлэл (BibTeX)", cite: CITE_HELP_EN,hExport: "Экспорт (Өөр нэрээр хадгалах)",
      pExport: "\"Өөр нэрээр хадгалах\"-г дарж форматыг сонго:",
      export: [
        { b: "Markdown (.md)", t: ": эхийг хадгалж одоогийн табын нэр / замыг шинэчилнэ." },
        { b: "PDF (.pdf)", t: ": блокийн хил дээр хуудасладаг — томьёо / гарчиг / кодын блок таслагдахгүй; багтаагүй блок бүхлээрээ дараагийн хуудас руу шилжинэ." },
        { b: "LaTeX (.tex)", t: ": эмхэтгэх боломжтой <code>.tex</code> эх болгон хөрвүүлнэ (documentclass болон багцуудтай; математик хадгалагдана). Хуулбарыг экспортлоно." },
      ],
      hLicense: "Лиценз",
      pLicense: "MDeX нь <strong>Apache License 2.0</strong>-ийн дор нээлттэй эхийн, зохиогч Fawei Zheng. Багцалсан бүрэлдэхүүнүүд (marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown болон Tauri гэх мэт) анхны лицензээрээ (MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0) үлдэнэ.",
      hContact: "Холбоо",
      pContact: "MDeX-г сонгосонд баярлалаа! Асуудал эсвэл санал хүсэлт байвал холбоо барина уу:",
      contactName: "Fawei Zheng (郑法伟)",
    },
  };
  function helpContent() { return buildHelp(HELP_STRINGS[curLang] || HELP_STRINGS.en); }
  function openHelp() {
    $("help-title").textContent = t("helpIntro");
    $("help-body").innerHTML = helpContent();
    $("help-body").scrollTop = 0;
    $("help-mask").hidden = false;
  }
  function closeHelp() { $("help-mask").hidden = true; }
  $("help-close").onclick = closeHelp;
  $("help-mask").addEventListener("click", (e) => { if (e.target === $("help-mask")) closeHelp(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("help-mask").hidden) closeHelp(); });

  /* ---------- 图查看器（mermaid 矢量图 / markdown 普通图片，独立 OS 窗口或页内弹窗）----------
     点击预览区的 mermaid 图或 <img> → 新建独立窗口（Tauri）或页内弹窗（浏览器）显示，支持缩放/平移/居中/全屏。
     缩放走【改元素 width/height】（SVG 矢量重绘不糊；IMG 位图放大仍糊，故初始 fit 封顶 1× 不放大）。
     平移用 transform:translate。mermaid 图支持 live update：编辑区重渲后按 data-src-offset 匹配块，经后端
     emit_viewer_update 定向推新 SVG，本窗口监听 viewer-update 热替换（保留缩放、居中）。全屏走 Tauri setFullscreen。 */
  let openViewer = null; // 由下方 IIFE 赋值；preview click 委托调用（点击发生在初始化之后，无 TDZ 风险）
  (function () {
    const mask = $("mermaid-viewer");
    if (!mask) return;
    const card = mask.querySelector(".mv-card");
    const stage = $("mv-stage");
    const content = $("mv-content");
    const zoomLabel = $("mv-zoom");
    const fsBtn = $("mv-fullscreen");
    if (!stage || !content || !card) return;

    let scale = 1, tx = 0, ty = 0;   // 缩放倍率 + 平移偏移
    let cw = 0, ch = 0;              // 内容自然尺寸（px，未缩放）
    let curEl = null;                // 当前内容元素（svg 或 img，缩放改其 width/height）
    let contentIsImg = false;        // 位图：初始 fit 封顶 1（放大糊）
    let fitScale = 1;
    let drag = null;                 // {x,y,tx,ty}
    const titleEl = $("mv-title");

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const setTitle = (s) => { if (titleEl) titleEl.textContent = s; };

    // 仅平移：拖拽高频调用，只改 transform（compositor，不触发布局回流）
    function applyPan() {
      content.style.transform = "translate(" + tx + "px," + ty + "px)";
    }
    // 缩放：改元素的 width/height → SVG 矢量重绘（放大不糊）；IMG 位图放大仍糊（固有）
    function applySize() {
      const w = cw * scale, h = ch * scale;
      if (curEl) { curEl.setAttribute("width", w); curEl.setAttribute("height", h); }
      content.style.width = w + "px";
      content.style.height = h + "px";
      zoomLabel.textContent = Math.round(scale * 100) + "%";
    }
    function renderView() { applySize(); applyPan(); }
    function computeFit() {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      if (!cw || !ch || !sw || !sh) { fitScale = 1; return; }
      // contain：整图可见且尽量填满舞台。矢量不封顶；位图封顶 1× 避免放大糊。
      fitScale = Math.min(sw / cw, sh / ch);
      if (contentIsImg && fitScale > 1) fitScale = 1;
      if (fitScale < 0.05) fitScale = 0.05;
    }
    function recenter() {                  // 重置缩放到 fit 并居中（打开/重置用）
      const sw = stage.clientWidth, sh = stage.clientHeight;
      scale = fitScale;
      tx = Math.max(0, (sw - cw * scale) / 2);
      ty = Math.max(0, (sh - ch * scale) / 2);
      renderView();
    }
    function centerView() {                // 保持当前缩放、仅重新居中（居中按钮 / live update 用）
      const sw = stage.clientWidth, sh = stage.clientHeight;
      tx = Math.max(0, (sw - cw * scale) / 2);
      ty = Math.max(0, (sh - ch * scale) / 2);
      renderView();
    }
    function zoomAt(factor, cx, cy) {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      if (cx == null) { cx = sw / 2; cy = sh / 2; }
      const ns = clamp(scale * factor, 0.1, 16);
      if (ns === scale) return;
      // 光标锚点：保持屏幕点 (cx,cy) 下的内容点不动。p=((cx-tx)/scale,(cy-ty)/scale)；新平移=cx-p*ns
      // （width/height 缩放下内容点 screen = tx + p*scale，与 transform:scale 同构，故公式不变）
      const px = (cx - tx) / scale, py = (cy - ty) / scale;
      tx = cx - px * ns; ty = cy - py * ns;
      scale = ns;
      renderView();
    }
    // 设置内容：svg 立即测尺寸（viewBox）；img 等 load 测 naturalWidth/Height。onReady 在 cw/ch 就绪后回调。
    function setupContent(el, onReady) {
      content.innerHTML = "";
      curEl = null;
      if (!el) { if (onReady) onReady(); return; }
      const tag = el.tagName.toLowerCase();
      if (tag === "svg") {
        contentIsImg = false;
        const clone = el.cloneNode(true);
        // 求自然尺寸：仅认纯数字像素的 width/height。mermaid 的 svg 常写 width="100%"+viewBox，
        // parseFloat("100%")=100 会误判且不回退 viewBox → 宽高比错乱、图被缩很小。故非像素值当 0 回退 viewBox。
        const pxAttr = (name) => {
          const v = (clone.getAttribute(name) || "").trim();
          return /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : 0;
        };
        let nw = pxAttr("width"), nh = pxAttr("height");
        const vb = (clone.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
        if (vb.length === 4) { if (!nw) nw = vb[2]; if (!nh) nh = vb[3]; }
        if (!nw || nw < 1) nw = 800;
        if (!nh || nh < 1) nh = 600;
        cw = nw; ch = nh;
        clone.removeAttribute("style");
        clone.setAttribute("width", nw); clone.setAttribute("height", nh);
        content.appendChild(clone);
        curEl = clone;
        setTitle(mermaidI18n().title);
        if (onReady) onReady();
      } else if (tag === "img") {
        contentIsImg = true;
        const img = document.createElement("img");
        const src = el.getAttribute("src") || el.src || "";
        const ready = (nw, nh) => {
          cw = nw || 800; ch = nh || 600;
          img.setAttribute("width", String(cw)); img.setAttribute("height", String(ch));
          img.style.maxWidth = "none"; img.style.maxHeight = "none";
          content.appendChild(img);
          curEl = img;
          setTitle(mermaidI18n().imageTitle);
          if (onReady) onReady();
        };
        img.onload = () => ready(img.naturalWidth, img.naturalHeight);
        img.onerror = () => ready(800, 600);
        img.src = src;
      } else {
        if (onReady) onReady();
      }
    }
    openViewer = function (el) {
      if (!el) return;
      mask.hidden = false;   // 先显示舞台，确保 rAF 时 clientWidth 有值
      setupContent(el, () => { requestAnimationFrame(() => { computeFit(); recenter(); }); });
    };
    // live update：交换内容，保留当前缩放、仅居中（避免编辑时缩放跳动）
    function updateContent(el) {
      const keep = scale;
      setupContent(el, () => { scale = keep; centerView(); });
    }
    function closeViewer() {
      exitFs();
      // 独立窗口模式：关闭窗口（而非仅隐藏遮罩）
      if (document.documentElement.classList.contains("mv-win")) {
        const w = getWin();
        if (w && w.close) { try { w.close(); } catch (_) {} }
        return;
      }
      mask.hidden = true;
      content.innerHTML = ""; content.style.transform = "";
      curEl = null; scale = 1; tx = 0; ty = 0;
    }

    // ---- 全屏：优先 Tauri 窗口 setFullscreen（系统级；WKWebView 下 Element.requestFullscreen 不可靠）----
    // isFullscreen 读权限在 core:default 内（默认允许）；setFullscreen 需 capabilities 另加 allow-set-fullscreen。
    let fsActive = false, fsPrior = false, fsUsingDom = false;
    function getWin() {
      if (!isTauri || !T) return null;
      try {
        const m = T.window || (T.webviewWindow || {});
        if (m.getCurrentWindow) return m.getCurrentWindow();
        if (m.getCurrentWebviewWindow) return m.getCurrentWebviewWindow();
      } catch (_) {}
      return null;
    }
    function syncFsTitle() { if (typeof refreshDynamicLabels === "function") refreshDynamicLabels(); }
    async function enterFs() {
      fsActive = true; mask.classList.add("mv-fs"); syncFsTitle();
      const w = getWin();
      if (w && w.setFullscreen) {
        try { fsPrior = w.isFullscreen ? await w.isFullscreen() : false; } catch (_) { fsPrior = false; }
        if (!fsPrior) {
          try { await w.setFullscreen(true); }
          catch (_) { fsActive = false; mask.classList.remove("mv-fs"); syncFsTitle(); } // 调用失败回滚状态
        }
        return;
      }
      // 回退：DOM Fullscreen API（浏览器/dev 环境）
      const req = /** @type {any} */ (card).requestFullscreen || /** @type {any} */ (card).webkitRequestFullscreen;
      if (req) { fsUsingDom = true; try { await req.call(card); } catch (_) { fsUsingDom = false; } }
    }
    async function exitFs() {
      if (!fsActive) return;
      fsActive = false; mask.classList.remove("mv-fs"); syncFsTitle();
      const w = getWin();
      if (w && w.setFullscreen && !fsPrior) { try { await w.setFullscreen(false); } catch (_) {} }
      if (fsUsingDom && document.exitFullscreen) { try { await document.exitFullscreen(); } catch (_) {} }
      fsUsingDom = false;
    }

    // 工具栏按钮
    $("mv-in").onclick = () => zoomAt(1.2);
    $("mv-out").onclick = () => zoomAt(1 / 1.2);
    $("mv-reset").onclick = () => { computeFit(); recenter(); };
    $("mv-center").onclick = centerView;          // 保持缩放、仅居中
    $("mv-close").onclick = closeViewer;
    fsBtn.onclick = () => { if (fsActive) exitFs(); else enterFs(); };
    // 点遮罩空白处关闭
    mask.addEventListener("click", (e) => { if (e.target === mask) closeViewer(); });
    // DOM 全屏状态变化联动标题（回退路径）
    document.addEventListener("fullscreenchange", syncFsTitle);
    document.addEventListener("webkitfullscreenchange", syncFsTitle);

    // 滚轮缩放（光标锚点）
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    // 指针拖拽平移（鼠标/触摸通用）
    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, tx, ty };
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      stage.classList.add("mv-dragging");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      tx = drag.tx + (e.clientX - drag.x);
      ty = drag.ty + (e.clientY - drag.y);
      applyPan();
    });
    const endDrag = (e) => {
      if (!drag) return;
      drag = null; stage.classList.remove("mv-dragging");
      try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", endDrag);
    // 阻止查看器内 svg 节点链接冒泡到全局 opener 处理（mermaid 节点可能含 <a>）
    stage.addEventListener("click", (e) => e.stopPropagation(), true);

    // Escape 关闭（同时退出全屏；macOS 原生全屏下首次 Escape 可能被系统拦截退全屏，再按一次关闭）
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || mask.hidden) return;
      e.preventDefault();
      closeViewer();
    });
    // 窗口尺寸变化时重算 fit 上限（不强制重置，保留用户当前视图）
    window.addEventListener("resize", () => { if (!mask.hidden) computeFit(); });
    // live update：接收主窗口定向推送的新内容（emit_to 仅投递给本查看器窗口，主窗口收不到）
    if (isTauri && T && T.event && T.event.listen) {
      T.event.listen("viewer-update", (e) => {
        const html = e && e.payload;
        if (typeof html !== "string" || !html) return;
        const tpl = document.createElement("template");
        tpl.innerHTML = html.trim();
        const el = tpl.content.firstElementChild;
        if (el) updateContent(el);
      });
    }
  })();

  /* ---------- 编辑区/预览区字体缩放（各自独立，持久化）----------
     编辑器 #editor 基准 14px、预览 #preview 基准 16px，各以倍率缩放。
     编辑器侧必须同步 #editor-hl 覆盖层字号（bug_history BUG-056：覆盖层须与 textarea 逐项对齐），
     并重测 measureEditorFont+computeEditorMap（BUG-060：折行映射依赖字体尺寸，ResizeObserver 不监听字号）。
     预览侧刷 buildPreviewBlockY 缓存（BUG-062：块顶 Y 在渲染时测一次缓存，字号变需重测；虚拟化靠 vprefix 自校正）。
     内部变量与外层可能冲突，整体包 IIFE 内仅暴露 initFontZoom（由 init() 调用）。 */
  let initFontZoom = null;
  (function () {
    const EZ_BASE = 14, PZ_BASE = 16;   // 基准字号（px），与 #editor/#preview CSS 一致
    const STEP = 0.1, ZMIN = 0.5, ZMAX = 2.5;
    let ez = 1, pz = 1;                 // 编辑器/预览 倍率
    const clampZ = (v) => (v < ZMIN ? ZMIN : v > ZMAX ? ZMAX : v);

    function applyEditor() {
      const px = EZ_BASE * ez;
      editor.style.fontSize = px + "px";
      if (editorHl) editorHl.style.fontSize = px + "px";   // BUG-056：覆盖层同步
      const lvl = $("ez-lvl"); if (lvl) lvl.textContent = Math.round(ez * 100) + "%";
      measureEditorFont();           // 重测单字符宽/行高（measureEditorFont 已改为读 #editor 实际字号）
      computeEditorMap();            // 重算每行字符数/视觉行映射，否则滚动同步偏
      try { localStorage.setItem("md-editor-zoom", String(ez)); } catch (_) {}
    }
    function applyPreview() {
      preview.style.fontSize = (PZ_BASE * pz) + "px";
      const lvl = $("pz-lvl"); if (lvl) lvl.textContent = Math.round(pz * 100) + "%";
      buildPreviewBlockY();          // 非虚拟化：重测块顶 Y 缓存；虚拟化由 scheduleRenderVisible 刷新
      if (vblocks.length) scheduleRenderVisible();
      try { localStorage.setItem("md-preview-zoom", String(pz)); } catch (_) {}
    }
    initFontZoom = function () {
      try { ez = clampZ(parseFloat(localStorage.getItem("md-editor-zoom")) || 1); } catch (_) { ez = 1; }
      try { pz = clampZ(parseFloat(localStorage.getItem("md-preview-zoom")) || 1); } catch (_) { pz = 1; }
      applyEditor(); applyPreview();
    };

    // 按钮事件
    const ezIn = $("ez-in"), ezOut = $("ez-out"), ezLvl = $("ez-lvl");
    const pzIn = $("pz-in"), pzOut = $("pz-out"), pzLvl = $("pz-lvl");
    if (ezIn) ezIn.onclick = () => { ez = clampZ(+(ez + STEP).toFixed(2)); applyEditor(); };
    if (ezOut) ezOut.onclick = () => { ez = clampZ(+(ez - STEP).toFixed(2)); applyEditor(); };
    if (ezLvl) ezLvl.onclick = () => { ez = 1; applyEditor(); };          // 点百分比标签 → 重置
    if (pzIn) pzIn.onclick = () => { pz = clampZ(+(pz + STEP).toFixed(2)); applyPreview(); };
    if (pzOut) pzOut.onclick = () => { pz = clampZ(+(pz - STEP).toFixed(2)); applyPreview(); };
    if (pzLvl) pzLvl.onclick = () => { pz = 1; applyPreview(); };
  })();
  // Tauri webview 不会自动用系统浏览器打开外部 http(s) 链接（且 CSP 禁止 webview 内导航）。
  // 拦截 http(s) 链接点击 → 走 opener 插件交给系统浏览器（应用本体仍离线）。mailto 由 webview 原生处理。
  document.addEventListener("click", (e) => {
    const et = /** @type {Element} */ (e.target);
    const a = et && et.closest ? et.closest("a[href]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (isTauri && /^https?:\/\//i.test(href)) { e.preventDefault(); invoke("plugin:opener|open_url", { url: href }).catch(() => {}); }
  });

  /* ---------- 默认文档（按当前语言取示例模板，回退 zh）---------- */
  let appIconPath = ""; // MDeX 示例图片引用占位 @ICON@ 的解析目标(应用图标绝对路径, init 时由后端 app_icon_path 落盘)
  function getSampleDoc(kind) {
    const lang = I18N[curLang] ? curLang : "zh";
    const el = document.getElementById(kind + "-example-tpl-" + lang)
            || document.getElementById(kind + "-example-tpl-zh");
    let s = el ? el.textContent.trim() : "";
    // MDeX 示例图片段占位 @ICON@ → 相对文件名 mdex_icon.png；图标目录由 openMdexExample/init 设到 tab.dir,
    // resolveImages 按 tab.dir 解析相对路径渲染(草稿无目录则不渲染, 故必须设 dir)；保存时 placeImagesOnSave 拷贝改相对
    if (kind === "mdex" && s) s = s.replace(/@ICON@/g, "mdex_icon.png");
    return s;
  }
  /* ---------- 初始化 ---------- */
  // 图查看器独立窗口模式：隐藏编辑器 UI，取后端暂存内容（svg/img）渲染查看器（铺满整个窗口）
  function initViewerWindow(contentHtml) {
    isViewerWindow = true; // 标记为查看器窗口：关窗拦截据此放行（不依赖 winLabel 检测）
    document.documentElement.classList.add("mv-win");
    const mv = mermaidI18n();
    const setT = (id, v) => { const el = $(id); if (el) el.title = v; };
    setT("mv-in", mv.zoomIn); setT("mv-out", mv.zoomOut); setT("mv-reset", mv.reset);
    setT("mv-center", mv.center); setT("mv-fullscreen", mv.fullscreen); setT("mv-close", mv.close);
    const h = $("mv-hint"); if (h) h.textContent = mv.hint;
    const tpl = document.createElement("template");
    tpl.innerHTML = String(contentHtml).trim();
    const el = tpl.content.firstElementChild;   // svg 或 img
    if (el && openViewer) openViewer(el);
  }

  async function init() {
    let theme = "light";
    try { theme = localStorage.getItem("md-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (_) {}
    if (theme === "dark") document.documentElement.classList.add("dark");

    // 界面语言（持久化）
    try { curLang = localStorage.getItem("md-lang") || "zh"; } catch (_) {}
    if (!I18N[curLang]) curLang = "zh";
    try { appIconPath = await invoke("app_icon_path"); } catch (_) {} // 落盘应用图标, 供 MDeX 示例图片引用 @ICON@ 解析

    // 多窗口：询问后端本窗口是否为某个 OS 双击文件而开。是→只开这一个文件（不恢复会话/欢迎文档）。
    if (isTauri) invoke("app_version").then((v) => { if (v) appVersion = String(v); }).catch(() => {});
    // 多窗口：本窗口是否为图查看器窗口（后端 open_viewer_window 已存内容）→ 是则只渲染查看器
    const vc = isTauri ? await invoke("take_viewer_content").catch(() => null) : null;
    if (vc) { initViewerWindow(vc); return; }
    // viewer 窗口（mermaid-*）即便 vc 异常取空，也绝不恢复主窗口会话——否则恢复出的 dirty 标签会阻塞其关闭
    if (winLabel.startsWith("mermaid-")) { isViewerWindow = true; return; }
    const wf = isTauri ? await invoke("take_window_file").catch(() => null) : null;
    if (wf) {
      isFileWindow = true;
      await openPath(wf);
    } else {
      // 恢复上次会话（多标签），否则首次启动载入欢迎文档
      let restored = null;
      // 取 IDB / localStorage 中较新者（IDB 容量大；localStorage 保 pagehide 同步刷的新鲜度）。
      let idbVal = null;
      try { idbVal = await idbGet(IDB_KEY); } catch (_) {}
      const a = typeof idbVal === "string" && idbVal ? idbVal : null;
      const b = localStorage.getItem("md-session");
      const pick = (a && b)
        ? (((() => { try { return JSON.parse(a).ts || 0; } catch (_) { return 0; } })()
            >= (() => { try { return JSON.parse(b).ts || 0; } catch (_) { return 0; } })()) ? a : b)
        : (a || b || null);
      try { restored = pick ? JSON.parse(pick) : null; }
      catch (_) { restored = null; toast(t("sessionLost")); } // D13：会话损坏不再静默丢弃，提示用户
      if (restored && Array.isArray(restored.tabs) && restored.tabs.length === 0) {
        // 用户上次关闭了所有标签 → 保持空状态（显示「请打开或创建…」），不自动载入欢迎文档。
        // tabs 已为 []、activeId 已为 null，由 renderTabs→updateEmptyState 接管显示。
      } else if (restored && Array.isArray(restored.tabs) && restored.tabs.length) {
        tabs = restored.tabs.map((x) => {
          const sample = (x.sample && x.sample.kind) ? { kind: x.sample.kind, ver: x.sample.ver || 0 } : null;
          // 版本门控：示例模板更新后（SAMPLE_VER 升），自动刷新过期且【未另存为文件】的示例标签内容
          let content = x.content || "";
          if (sample && !x.path && !x.dirty && sample.ver < SAMPLE_VER) {
            const fresh = getSampleDoc(sample.kind);
            if (fresh) { content = fresh; sample.ver = SAMPLE_VER; }
          }
          return {
            id: x.id || nextId++, name: x.name || t("untitled"), path: x.path || "",
            dir: x.dir || "", content, type: x.type || fileTypeOf(x.name) || "md",
            bibText: x.bibText || "",
            sample,
            imgDir: x.imgDir || null, imgSub: x.imgSub || null,
            dirty: false,
            scrollTop: x.scrollTop || 0, selStart: x.selStart || 0, selEnd: x.selEnd || 0,
          };
        });
        nextId = tabs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
        activeId = (restored.activeId != null && tabs.some((x) => x.id === restored.activeId))
          ? restored.activeId : tabs[0].id;
        // 会话恢复后向后端重新登记已打开文件（D5）：否则重启后双击同一文件时，
        // 后端 open 映射为空 → 走 route_file 开新窗口 → 同文件两窗口并发存盘互相覆盖（D4）。
        if (isTauri) {
          for (const t of tabs) {
            if (t.path) {
              invoke("register_file", { path: t.path }).catch(() => {});
              recordMtime(t); // D8: 恢复的标签以当前磁盘 mtime 为基线
            }
          }
        }
      } else {
        // 迁移旧版单文档草稿
        let oldDraft = null;
        try { oldDraft = localStorage.getItem("md-draft"); } catch (_) {}
        if (oldDraft && oldDraft.trim()) {
          // 旧版用户草稿：视为自有内容，不打 sample 标记
          const tab = createTab({ content: oldDraft });
          activeId = tab.id;
        } else {
          // 首次启动：载入欢迎文档（标记为示例，模板更新后可自动刷新）
          const tab = createTab({ content: getSampleDoc("mdex"), sample: { kind: "mdex", ver: SAMPLE_VER }, dir: appIconPath ? appIconPath.replace(/[\/\\][^\/\\]*$/, "") : "" });
          activeId = tab.id;
        }
      }
    }

    const cur = activeTab();
    if (cur) {
      editor.value = cur.content;
      if (cur.selStart || cur.selEnd) editor.setSelectionRange(cur.selStart, cur.selEnd);
    }
    applyLang();            // 应用界面语言（含工具栏/状态栏/占位符/主题按钮文字）
    if (initFontZoom) initFontZoom(); // 应用编辑区/预览区字体缩放（须在首帧 render 前，否则首测字号错）
    initMermaid();          // 初始化 mermaid（主题跟随当前深浅）
    if (cur && cur.scrollTop) editor.scrollTop = cur.scrollTop;
    renderTabs();
    if (isTauri && curLang !== "zh") invoke("change_language", { lang: curLang }).catch(() => {});
    requestAnimationFrame(() => render()); // 延后一帧，先绘编辑器再渲预览（大文件启动更顺畅）
    updateCursor();
    setTimeout(() => { if (window.katex) render(); }, 400);
  }
  init();
})();
