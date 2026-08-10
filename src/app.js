// @ts-check
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  // 编辑器后端：textarea（旧）或 CodeMirror 6（新）。构建开关 window.__MDEX_EDITOR__ + 运行时 localStorage 覆盖。
  // CM 模式：cm=EditorView、editor=适配器 Proxy（对下游 ~180 处"像 textarea"）；textarea 模式：editor=原生 textarea。
  // CM 模式下同步仍走旧 yprobe（Phase 2 才换 cm.posAtCoords），故 Phase 1 同步精度同 textarea（预期）。
  const editorInputListeners = new Set();
  let cm = null;
  // CM 搜索高亮（Phase 3.2）：StateEffect 触发 + StateField 持有匹配区间 → Decoration.mark，画在 CM
  // 内容里（替代 #editor-hl 覆盖层）。覆盖层是独立 div、与 CM 的 .cm-content 折行/坐标有细微差，
  // 导致高亮块"差一两格"；CM 原生 Decoration 与文本像素对齐，根治。
  const setSearchMarks = window.CM && CM.StateEffect ? CM.StateEffect.define() : null;
  const searchMarkField = window.CM && CM.StateField ? CM.StateField.define({
    create: () => [],
    update: (val, tr) => { for (const e of tr.effects) if (e.is(setSearchMarks)) return e.value; return val; },
    provide: (f) => CM.EditorView.decorations.from(f, (marks) => {
      if (!marks || !marks.length) return CM.Decoration.set([]);
      return CM.Decoration.set(marks.map((m) => CM.Decoration.mark({ class: "search-mark" + (m.current ? " current" : "") }).range(m.start, m.end)), true);
    }),
  }) : null;
  // AI 选区/光标可视化（CM 原生 Decoration，替代 #editor-hl 覆盖层）：有选区→mark 高亮；
  // 无选区（插入模式）→widget 画零宽闪烁竖线（.ai-sel:empty）。画在 .cm-content 里、随内容滚动、像素对齐，
  // 不受 #editor-hl(textarea 几何) 与 CM 不一致影响（CM 迁移后 #editor-hl 已不对齐 CM，旧法失效）。
  const setAiSel = window.CM && CM.StateEffect ? CM.StateEffect.define() : null;
  const AiCaretWidget = window.CM && CM.WidgetType ? class extends CM.WidgetType {
    toDOM() { const s = document.createElement("span"); s.className = "ai-sel"; return s; }
    ignoreEvent() { return true; }
  } : null;
  const aiSelField = window.CM && CM.StateField ? CM.StateField.define({
    create: () => null,
    update: (val, tr) => { for (const e of tr.effects) if (e.is(setAiSel)) return e.value; return val; },
    provide: (f) => CM.EditorView.decorations.from(f, (sel) => {
      if (!sel) return CM.Decoration.set([]);
      if (sel.start !== sel.end) return CM.Decoration.set([CM.Decoration.mark({ class: "ai-sel" }).range(sel.start, sel.end)]);
      return CM.Decoration.set([CM.Decoration.widget({ widget: new AiCaretWidget(), side: -1 }).range(sel.start)]);
    }),
  }) : null;
  if (typeof window !== "undefined") window.__aiSelTest = (s, e) => { if (cm && setAiSel) cm.dispatch({ effects: setAiSel.of(s == null ? null : { start: s | 0, end: (e == null ? s : e) | 0 }) }); }; // 调试/测试：画/清 AI 光标选区可视化
  // CodeMirror 为唯一编辑器后端（Phase 4：textarea 路径已移除）。EDITOR_MODE 保留常量 "cm" 供各处分支判断。
  const EDITOR_MODE = "cm";
  /** @type {HTMLElement} */
  let editor;
  // 启动保护：CM 核心（vendor/codemirror.js → window.CM）必须先于 app.js 加载。
  // 若构建漏了 codemirror.js（如打包增量遗漏 / vendor 未同步），此处给出明确报错，
  // 而非让 createCMEditor 内部抛 "CM is not defined" 静默中断 IIFE → 工具栏绑定全不执行
  // → 表现为"工具栏点击全无反应"且控制台无任何提示，极难定位。
  if (!window.CM) {
    const box = document.getElementById("startup-fatal") || (() => {
      const d = document.createElement("div");
      d.id = "startup-fatal";
      d.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;background:#fff5f5;color:#9b1c1c;font:15px/1.7 -apple-system,'Segoe UI',sans-serif;text-align:center;z-index:2147483647;";
      document.body.appendChild(d);
      return d;
    })();
    box.innerHTML = "<b>MDeX 编辑器核心加载失败</b><br><br>CodeMirror (<code>vendor/codemirror.js</code>) 未加载 —— 安装包不完整（app.js 与 vendor/codemirror.js 版本不匹配）。<br>请重新下载安装包，或将此截图反馈给开发者。";
    return; // 中止 IIFE：阻止后续工具栏绑定（此时绑定也必失败），但已给用户明确反馈
  }
  cm = createCMEditor($("editor")); editor = cmAdapter(cm);
  const preview = $("preview");
  const main = $("main");
  /** @type {HTMLInputElement} */
  const fileInput = /** @type {HTMLInputElement} */ ($("file-input"));

  // Tauri 桥（构建后存在；浏览器中为 null，走降级）
  const T = window.__TAURI__;
  const invoke = (cmd, args) => (T && T.core && T.core.invoke ? T.core.invoke(cmd, args) : Promise.resolve(null));

  // ---- CodeMirror 6 编辑器（EDITOR_MODE==='cm' 时启用）----
  // 创建 CM：把 <textarea id=editor> 换成 <div id=editor> 挂入 CM；inline 覆盖 #editor 的 textarea 专属
  // CSS（padding/overflow），由 CM 的 .cm-scroller/.cm-content 自管布局，外观与 textarea 一致。
  function createCMEditor(host) {
    const div = document.createElement("div");
    div.id = "editor";                      // 复用 #editor 的 flex:1/width:100%/background 等布局 CSS
    div.setAttribute("spellcheck", "false");
    div.style.padding = "0";                // 覆盖 #editor{padding:20px 24px}（CM .cm-content 自带 padding）
    div.style.overflow = "visible";         // 覆盖 #editor{overflow-y:auto}（CM .cm-scroller 自管滚动）
    div.style.resize = "none";
    host.replaceWith(div);
    const theme = CM.EditorView.theme({
      "&": { height: "100%", backgroundColor: "transparent" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: "var(--mono)", fontSize: "14px", lineHeight: "1.7", overflowY: "auto", scrollbarGutter: "stable" },
      ".cm-content": { padding: "20px 24px", color: "var(--fg)", caretColor: "var(--fg)", tabSize: "2" },
      // CM6 drawSelection 把光标画成 .cm-cursor 元素，颜色取 border-left-color（CM 默认硬编码 black，
      // 不响应 caret-color）。项目深色模式靠 html.dark 切 CSS 变量、未启用 CM &dark theme，
      // 故深色下黑光标在 #0d1117 深底不可见。强制 border-left-color 跟 --fg（浅色模式深 / 深色模式浅）。
      "& .cm-cursor, & .cm-dropCursor": { borderLeftColor: "var(--fg)" },
      ".cm-gutters": { display: "none" },
    });
    const view = new CM.EditorView({
      state: CM.EditorState.create({
        doc: "",
        extensions: [
          CM.EditorView.lineWrapping,       // 软折行（关键：匹配预览 pre-wrap，否则折行不一致、同步失准）
          CM.EditorState.allowMultipleSelections.of(true), // 列选择需多选区（默认 false 会把多 range 折成主选区）
          CM.history(),                     // undo/redo（Phase 3 完整接入；先开以免 undo 失灵）
          CM.drawSelection(),
          theme,
          searchMarkField,                  // 搜索高亮（Phase 3.2：StateField→Decoration.mark，画在 CM 内容里）
          aiSelField,                       // AI 选区/光标可视化（mark 高亮 / widget 闪烁竖线）
          CM.EditorView.updateListener.of((vu) => { if (vu.docChanged) for (const fn of editorInputListeners) { try { fn({ type: "input" }); } catch (e) {} } }),
        ],
      }),
      parent: div,
    });
    // CM 列选择：Alt+左键拖拽 → 多光标矩形选区（每行一个 range，跨相同字符列）。capture 拦截先于
    // CM 原生拖选、stopPropagation 防止 CM 常规拖选；复制/剪切/删除/输入由 CM 多光标原生按列处理。
    view.contentDOM.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !e.altKey) return;
      e.preventDefault(); e.stopPropagation();
      cmColumnDrag(view, e);
    }, true);
    if (typeof window !== "undefined") window.__cm = view; // 调试/测试暴露（posAtCoords/coordsAtPos 供回归测试用）
    return view;
  }
  // CM 列选择拖拽：用拖拽像素矩形 (x0,y0)→(x1,y1)，按行高步进 Y，每【视觉行】用 posAtCoords 在
  // 左/右列(x0/x1)取偏移→一个 range。posAtCoords 天然按视觉行解析，折行长行也能正确成列
  // （按逻辑行算会把折行长行当一行、范围横跨整行——用户反馈的"碰折行末就整行选取"）。
  function cmColumnDrag(view, e) {
    const start = { x: e.clientX, y: e.clientY };
    const apply = (cx, cy) => {
      const x0 = Math.min(start.x, cx), x1 = Math.max(start.x, cx);
      const y0 = Math.min(start.y, cy), y1 = Math.max(start.y, cy);
      const lh = view.defaultLineHeight || 24;
      const ranges = [];
      let lastFrom = -1;
      for (let y = y0; y <= y1 + lh; y += lh) {          // 按视觉行步进；+lh 兜底覆盖末行
        const a = view.posAtCoords({ x: x0, y });
        const b = view.posAtCoords({ x: x1, y });
        if (a == null || b == null) continue;             // 视口外行跳过
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (lo !== lastFrom) { ranges.push(CM.EditorSelection.range(lo, hi)); lastFrom = lo; } // 去重同行
      }
      if (ranges.length) view.dispatch({ selection: CM.EditorSelection.create(ranges, 0) });
    };
    apply(e.clientX, e.clientY);
    let dragging = true;
    const move = (ev) => { if (dragging) apply(ev.clientX, ev.clientY); };
    const up = () => { dragging = false; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
  // CM→textarea 适配器：以 cm.scrollDOM（.cm-scroller）为基元素，在其上 defineProperty 几个 textarea
  // 专属属性转发到 cm。scrollDOM 原生就是 CM 的滚动容器 → scrollTop/clientHeight/scrollHeight/
  // getBoundingClientRect/style/ResizeObserver/getComputedStyle 全部原生正确（无需 Proxy，避免
  // "ResizeObserver.observe(Proxy) 不是 Element" 之类品牌检查失败）。
  function cmAdapter(cmv) {
    const el = cmv.scrollDOM;
    const defs = {
      // value: 读 cm 文档；写 dispatch 全量替换（loadTab/undo/AI 编辑等都走这里）
      value: { configurable: true, get: () => cmv.state.doc.toString(), set: (v) => cmv.dispatch({ changes: { from: 0, to: cmv.state.doc.length, insert: String(v) } }) },
      selectionStart: { configurable: true, get: () => cmv.state.selection.main.from },
      selectionEnd: { configurable: true, get: () => cmv.state.selection.main.to },
      setSelectionRange: { configurable: true, value: (s, e) => cmv.dispatch({ selection: CM.EditorSelection.single(s | 0, (e == null ? s : e) | 0), scrollIntoView: true }) },
      focus: { configurable: true, value: () => cmv.focus() },
      // 'input' 走 updateListener 维护的 editorInputListeners（CM 不发原生 input 事件）；其余事件用原生
      // （scroll/click/keydown/paste 等冒泡到 scrollDOM）。注意：必须调 EventTarget.prototype 原生方法，
      // 否则 el.addEventListener 已被本 override 覆盖→自调用无限递归。
      addEventListener: { configurable: true, value: (type, fn, opts) => { if (type === "input") editorInputListeners.add(fn); else EventTarget.prototype.addEventListener.call(el, type, fn, opts); } },
      removeEventListener: { configurable: true, value: (type, fn, opts) => { if (type === "input") editorInputListeners.delete(fn); else EventTarget.prototype.removeEventListener.call(el, type, fn, opts); } },
      dispatchEvent: { configurable: true, value: (ev) => { if (ev && ev.type === "input") for (const fn of editorInputListeners) { try { fn(ev); } catch (e) {} } return EventTarget.prototype.dispatchEvent.call(el, ev); } },
    };
    for (const k in defs) Object.defineProperty(el, k, defs[k]);
    return el;
  }
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
  const I18N = window.I18N;
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
  let srcBlockOffsets = []; // 每源码块在 editor.value 中的起始字符偏移（点击定位/滚动同步/左右对应）
  let winStart = -1, winEnd = -1; // 大文档窗口化：当前渲染窗口 [winStart, winEnd)；-1=非窗口模式
  let winRecenterRaf = 0;
  let winRenderActive = 0; // 正在异步重渲窗口的计数器；>0 时冻结 syncAnchors（防用旧窗口偏移把预览定位错）
  // 窗口化全文 spacer 骨架（Phase1 MVP）：让 >200KB 大文档预览滚动条覆盖全文、能连续滚到文末。
  // winSkel=全文块骨架[{off,end,raw,est,measured}]；winPrefix=累积前缀和（同 vprefix 语义）；
  // winDriver=当前窗口驱动方（"editor"默认/"preview"用户拖预览）。全程 if(winSkel.length) 守卫，
  // 注释掉 buildWinSkelByLines 调用即退回"无 spacer 窗口化"（滚动条只覆盖窗口，但同步不坏）。
  let winSkel = [];
  let winPrefix = [0];
  let winSkelDocLen = -1; // 骨架对应文档长度，复用守卫（文档没变不重建）
  let winLazyRaf = 0;

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
    // 进入新渲染：清窗口化状态（防大→小文档 / MD↔HTML 切换残留 winStart≥0 误走窗口化分支；
    // 大文档 787 renderWindow reset 会立即 buildWinSkelByLines 重建，渐进 renderWindow(false) 由 scroll
    // 监听直接调、不经 render，winStart 不受影响）
    winStart = -1; winEnd = -1; winSkel = []; winPrefix = [0];
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
    // 大文档窗口化渲染（浏览时只渲染编辑区中心一段窗口；force=导出时仍走整篇，见下方）
    if (text.length > 200000 && !force) { await renderWindow(true); return; }
    // srcBlockOffsets（每源码块在原文起始偏移，滚动同步/点击定位/左右对应用）+ marked→html 一起在
    // 下方变换后计算，让偏移与渲染块同源 → srcBlockOffsets[i] 与预览第 i 块严格一一对应。
    // rawText = post-bibtex 原文（偏移基准；bibtex 等长空白替换，offset 仍映射源码）。
    srcBlockOffsets = [];
    const rawText = text;
    const bigDoc = text.length > 200000;
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
    // 大文件：转义散文里的 < >（书里的 bra-ket <ψ|>、OCR 尖括号会被 marked 当 HTML 标签去匹配，
    // 在 JavaScriptCore 上正则回溯极慢）。代码块已还原、由 marked 自行转义；公式/代码占位符无 <>。
    if (text.length > 200000) src = src.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let html;
    try {
      // 大文件：JavaScriptCore 下 marked.lexer/marked.parse 对整篇大文本正则灾难性慢且超线性（实测
      // 整篇 lex 66s、parse 9.6s）。按 \n\n 把 rawText 与 src 同步切、累积成 ~20KB 批，逐批
      // lex(raw批)取每块偏移 + parse(src批)取 html——批内保留 \n\n 结构（松散列表等仍算一块），
      // 故【偏移】与【html 顶层块】同源、严格一一对应（左右对应准）；小块让 JSC 超线性坍塌（→秒级）；
      // 批间 yield 保 UI 响应。raw 与 src 的 \n\n 序列一致（代码/公式/引用/转义均为行内变换），
      // 若遇 display 数学/代码内含空行导致切块数不一致，退回整篇 lex（慢但准，罕见）。
      const rawParts = rawText.split(/(\n\n+)/);
      const srcParts = src.split(/(\n\n+)/);
      if (bigDoc && !force && rawParts.length === srcParts.length) {
        const g = ++renderGen;
        html = ""; let rawBatch = "", srcBatch = "", rawPos = 0, batchStart = 0;
        for (let i = 0; i < rawParts.length; i++) {
          if (!rawBatch) batchStart = rawPos;
          rawBatch += rawParts[i]; srcBatch += srcParts[i]; rawPos += rawParts[i].length;
          if (rawBatch.length >= 20000 || i === rawParts.length - 1) {
            if (rawBatch.trim()) {
              if (window.marked && marked.lexer) {
                let s = 0;
                for (const tk of marked.lexer(rawBatch).filter(t => t.type !== "space")) {
                  if (!tk.raw) continue;
                  const probe = tk.raw.replace(/\n+$/, "");
                  let idx = probe ? rawBatch.indexOf(probe, s) : s;
                  if (idx < 0) idx = s;
                  srcBlockOffsets.push(batchStart + idx);
                  s = idx + tk.raw.length;
                }
              } else srcBlockOffsets.push(batchStart);
              html += marked.parse(srcBatch, { gfm: false });
            }
            rawBatch = ""; srcBatch = "";
            if (g !== renderGen) return;            // 新渲染到达→丢弃本次
            await new Promise(r => setTimeout(r, 0)); // 让出主线程，UI 可响应
            if (g !== renderGen) return;
          }
        }
      } else {
        // 小文件 / 兜底：整篇 lex 取偏移 + 整篇 parse
        if (window.marked && marked.lexer) {
          let search = 0;
          for (const tk of marked.lexer(rawText).filter(t => t.type !== "space")) {
            if (!tk.raw) continue;
            const probe = tk.raw.replace(/\n+$/, "");
            let idx = probe ? rawText.indexOf(probe, search) : search;
            if (idx < 0) idx = search;
            srcBlockOffsets.push(idx);
            search = idx + tk.raw.length;
          }
        } else {
          let pos = 0;
          for (const part of rawText.split(/(\n\n+)/)) { if (part.trim()) srcBlockOffsets.push(pos); pos += part.length; }
        }
        html = marked.parse(src);
      }
    }
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
          out = katex.renderToString(s.tex, { displayMode: s.display, throwOnError: false, trust: false, strict: false }); // strict:false 关闭 OCR 数学（零宽字符等）的 warning 洪水
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

  /* ---------- 大文档窗口化渲染（方案A）----------
     WKWebView(JavaScriptCore) 下 marked 对整篇大文本灾难性慢（lex 66s、parse 9.6s）且不可分块加速。
     改为只渲染"编辑区中心附近一段源码窗口"：marked 在小窗口上几十毫秒、精确、自洽（偏移与 html 同源
     于该窗口→左右对应天然准）。预览只显示该窗口，状态栏显示位置百分比。仅文本 >200KB 启用；
     force(导出) 走整篇（慢但全）。 */
  function expandToBlockBounds(text, a, b) { // 把 [a,b) 向外扩到相邻 \n\n 段落边界（不切碎块）
    a = Math.max(0, Math.min(text.length, a));
    b = Math.max(a, Math.min(text.length, b));
    let s = text.lastIndexOf("\n\n", a); s = s < 0 ? 0 : s + 2;
    let e = text.indexOf("\n\n", b); e = e < 0 ? text.length : e;
    return { start: s, end: e };
  }
  function lineOfOffset(off) { let l = 0; for (let i = 0; i < editorLineStarts.length; i++) { if (editorLineStarts[i] <= off) l = i; else break; } return l; }
  // 窗口管线：对 ev.slice(start,end) 跑完整 markdown→html，返回 { html, offsets(绝对偏移) }
  async function runWindowPipeline(ev, start, end) {
    const sliceRaw = ev.slice(start, end);
    const at = activeTab();
    const { text: textNoBib, embedded } = extractEmbeddedBib(sliceRaw);
    const bibDB = buildBibDB(at, embedded);
    const rawWin = textNoBib; // post-bibtex（等长替换→偏移映射回 sliceRaw/ev）
    let text = textNoBib;
    const codeStore = [];
    const CPH = (i) => "​CODE" + i + "​";
    text = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (m) => { codeStore.push(m); return CPH(codeStore.length - 1); });
    text = text.replace(/`[^`\n]+`/g, (m) => { codeStore.push(m); return CPH(codeStore.length - 1); });
    const { src, store } = extractMath(text);
    const { src: src2, citeList } = scanCitations(src);
    const s = src2.replace(/​CODE(\d+)​/g, (_m, i) => codeStore[+i] || "");
    // 偏移（绝对 = start + 块内偏移）：lex 窗口原文取每块起点；html：parse 窗口 src。同源→严格对齐。
    const offsets = [];
    if (window.marked && marked.lexer) {
      let search = 0;
      for (const tk of marked.lexer(rawWin).filter(t => t.type !== "space")) {
        if (!tk.raw) continue;
        const probe = tk.raw.replace(/\n+$/, "");
        let idx = probe ? rawWin.indexOf(probe, search) : search;
        if (idx < 0) idx = search;
        offsets.push(start + idx);
        search = idx + tk.raw.length;
      }
    } else {
      let pos = 0; for (const part of rawWin.split(/(\n\n+)/)) { if (part.trim()) offsets.push(start + pos); pos += part.length; }
    }
    let html;
    try { html = marked.parse(s); } catch (e) { html = '<p style="color:red">渲染错误: ' + escapeHtml(String(e)) + '</p>'; }
    if (window.DOMPurify) html = DOMPurify.sanitize(html, { ADD_ATTR: ["target", "colspan", "rowspan", "align", "loading", "aria-hidden", "encoding"] });
    if (window.katex && store.length) {
      const rendered = store.map((x) => {
        let out;
        try { out = katex.renderToString(x.tex, { displayMode: x.display, throwOnError: false, trust: false, strict: false }); }
        catch (e) { out = '<span style="color:#d33">' + escapeHtml(x.tex) + '</span>'; }
        if (x.display) out = '<span class="mdmath" data-tex="' + encodeURIComponent(x.tex) + '">' + out + '</span>';
        return out;
      });
      html = html.replace(/​MATH(\d+)​/g, (_m, i) => rendered[+i] || "");
    }
    html = renderCitations(html, citeList, bibDB);
    html = await renderMermaidInHtml(html);
    return { html, offsets };
  }
  // 滑动式窗口：把一个切片的 html 挂进预览（append 末尾 / prepend 开头），不打散已有块。
  // offsets=切片内各块起点（绝对偏移）；endOff=切片末尾（最后一块的 end）。块打 data-src-offset/end 标签。
  function mountSliceBlocks(html, offsets, mode, endOff) {
    if (html.indexOf("<table") !== -1)
      html = html.replace(/<table(\s[^>]*)?>[\s\S]*?<\/table>/g, (m) => '<div class="table-wrap">' + m + "</div>");
    const tpl = document.createElement("template"); tpl.innerHTML = html;
    const kids = Array.from(tpl.content.children);
    for (let i = 0; i < kids.length && i < offsets.length; i++) {
      const so = offsets[i], eo = i + 1 < offsets.length ? offsets[i + 1] : endOff;
      kids[i].setAttribute("data-src-offset", so);
      kids[i].setAttribute("data-src-end", eo);
      tagFineInBlock(kids[i], so, eo);
    }
    // 窗口化（winStart≥0 且已建 spacer 骨架）挂进 vContent；否则（小文档全量）挂 preview。
    const host = (winStart >= 0 && winSkel.length && vContent) ? vContent : preview;
    if (mode === "prepend") { const f = host.firstChild; for (const k of kids) host.insertBefore(k, f); }
    else { for (const k of kids) host.appendChild(k); }
    highlightCodeLazy(); wrapDisplayMath(host);
    const at = activeTab();
    if (at && at.type === "html") renderMathAuto(host);
    if (isTauri && at) resolveImages(host, at.dir || "");
    if (searchBar && !searchBar.hidden) highlightPreview();
    if (host === vContent) { winMeasuresFill(); updateWindowSpacers(); } // 扩窗后实测回填 + 同步 spacer 高度
  }
  // 滑动式窗口：裁掉远离 cLine 的整块（保 cLine 两侧 ~2×halfWin 行），避免窗口无限增长。
  function trimWindowFar(cLine, halfWin) {
    const ls = editorLineStarts, ev = editor.value, buf = halfWin * 2;
    const trimLineTop = cLine - buf, trimLineBot = cLine + buf;
    const host = vContent || preview; // 窗口化块挂在 vContent 里（spacer 三段结构）
    if (trimLineTop > 0) {
      const trimOff = ls[trimLineTop] || 0;
      if (trimOff > winStart) {
        const kids = Array.from(host.children);
        for (const k of kids) if ((parseInt(k.getAttribute("data-src-offset")) || 0) < trimOff) host.removeChild(k);
        srcBlockOffsets = srcBlockOffsets.filter((o) => o >= trimOff);
        if (srcBlockOffsets.length) winStart = srcBlockOffsets[0];
      }
    }
    if (trimLineBot < ls.length) {
      const trimOff = ls[trimLineBot] || ev.length;
      if (trimOff < winEnd) {
        const kids = Array.from(host.children);
        let firstRemoved = null;
        for (const k of kids) { const o = parseInt(k.getAttribute("data-src-offset")) || 0; if (o >= trimOff) { if (firstRemoved === null) firstRemoved = o; host.removeChild(k); } }
        srcBlockOffsets = srcBlockOffsets.filter((o) => o < trimOff);
        if (firstRemoved !== null) winEnd = firstRemoved;
      }
    }
    updateWindowSpacers(); // 裁剪后窗口起止变 → 重设 spacer 高度
  }
  // 浏览：渲染编辑区中心窗口
  async function renderWindow(alwaysRender) {
    if (!editorLineStarts.length) return;
    const ev = editor.value, ls = editorLineStarts;
    const center = editor.scrollTop + editor.clientHeight / 2;
    const centerOff = editorYToOff(center);
    const cLine = lineOfOffset(centerOff);
    if (centerOff < 0) return; // editorYToOff 失败（posAtCoords null）-> 不重渲，避免误判大跳转重置到文档开头
    // posAtCoords 异常校验：cm.lineBlockAtHeight 算视口真实行偏移范围 [topOff,botOff]——基于 CM 行块树(高度→行块，
    // 不依赖 DOM hit-test)，比 posAtCoords/coordsAtPos 稳定(后两者 WKWebView 下都走 hit-test/measure，深处可能同时
    // 异常使 coordsAtPos 守卫失效)。centerOff 出范围(±1 视口余量)→posAtCoords 把中段错映射到偏前/开头 off→不 reset 到开头。
    // lineBlockAtHeight 含折行高度精确，折行文档不误判（旧 cLine×editorLh 靠逻辑行估高，折行低估→误判不扩窗→预览卡/跳）。
    if (cm && cm.lineBlockAtHeight) {
      const topOff = cm.lineBlockAtHeight(editor.scrollTop).from;
      const botOff = cm.lineBlockAtHeight(editor.scrollTop + editor.clientHeight).from;
      if (centerOff < topOff - editor.clientHeight || centerOff > botOff + editor.clientHeight) return;
    }
    const visibleLines = Math.max(20, Math.round((editor.clientHeight || 600) / editorLH));
    const halfWin = Math.min(400, Math.round(visibleLines * 3)); // 窗口 ~6 视口
    // 大跳转/首渲/强制：重置（重新居中、替换）--中心远离当前窗口（>3 窗口距）
    const farJump = halfWin * editorLH * 3;
    if (alwaysRender || winStart < 0 || centerOff < winStart - farJump || centerOff > winEnd + farJump) {
      const a0 = ls[Math.max(0, cLine - halfWin)] || 0;
      const b0 = (cLine + halfWin + 1 < ls.length) ? ls[cLine + halfWin + 1] : ev.length;
      const wb = expandToBlockBounds(ev, a0, b0);
      winStart = wb.start; winEnd = wb.end;
      buildWinSkelByLines(); // 构建全文骨架（reset/大跳转时一次；渐进扩窗不重建）
      winRenderActive++;
      try { const g = ++renderGen; const { html, offsets } = await runWindowPipeline(ev, winStart, winEnd);
        if (g !== renderGen) return; srcBlockOffsets = offsets; renderIntoPreview(html); positionWindow(centerOff); updateWindowPos(cLine);
      } catch (e) { console.log("renderWindow", e); } finally { winRenderActive--; }
      return;
    }
    // 渐进：中心在窗口安全区 -> 不重渲（syncAnchors 跟随）；接近边沿 -> 扩展窗口（保留对侧）
    const innerMargin = (winEnd - winStart) * 0.25;
    if (centerOff >= winStart + innerMargin && centerOff <= winEnd - innerMargin) { updateWindowPos(cLine); return; }
    winRenderActive++;
    try {
      const g = ++renderGen;
      if (centerOff > winEnd - innerMargin) {
        // 往下：扩展 winEnd（保留 winStart），append 新块。eOff 上方不动 -> Y 不变 -> 不跳。
        const wantB = (cLine + halfWin + 1 < ls.length) ? ls[cLine + halfWin + 1] : ev.length;
        const wb = expandToBlockBounds(ev, winEnd, wantB);
        if (wb.end > winEnd) {
          const { html, offsets } = await runWindowPipeline(ev, winEnd, wb.end);
          if (g !== renderGen) return;
          mountSliceBlocks(html, offsets, "append", wb.end);
          srcBlockOffsets = srcBlockOffsets.concat(offsets);
          winEnd = wb.end;
        }
      } else {
        // 往上：扩展 winStart（保留 winEnd），prepend 新块。
        const wantA = ls[Math.max(0, cLine - halfWin)] || 0;
        const wb = expandToBlockBounds(ev, wantA, winStart);
        if (wb.start < winStart) {
          const { html, offsets } = await runWindowPipeline(ev, wb.start, winStart);
          if (g !== renderGen) return;
          mountSliceBlocks(html, offsets, "prepend", winStart);
          srcBlockOffsets = offsets.concat(srcBlockOffsets);
          winStart = wb.start;
        }
      }
      trimWindowFar(cLine, halfWin);
      buildPreviewBlockY();
      positionWindow(centerOff); // eOff 钉预览中央（扩展/裁剪后统一重设，画面稳定不跳）
      updateWindowPos(cLine);
    } catch (e) { console.log("renderWindow", e); } finally { winRenderActive--; }
  }
  function positionWindow(forceOff) { // 把编辑区中心对应的预览块居中
    if (scrollSrc === "preview") return; // 预览驱动（编辑器正被同步滚动）→ 不强制居中，否则把预览 yank 回编辑器中心
    scrollSrc = "editor"; // 防预览滚动回环
    const centerOff = forceOff != null ? forceOff : editorYToOff(editor.scrollTop + editor.clientHeight / 2);
    if (centerOff < 0) return;
    const y = previewOffsetToY(centerOff); // vContent 覆盖时实测；不覆盖时 offToPreviewY 钳窗口内(vContent 末,实测,不空白)，renderWindow 完成后 positionWindow(centerOff) 精确对齐
    if (y != null && isFinite(y)) preview.scrollTop = Math.max(0, y - (preview.clientHeight || 600) / 2);
  }
  function updateWindowPos(centerLine) { // 状态栏位置指示（窗口模式）
    const el = $("s-winpos"); if (!el) return;
    if (winStart < 0) { el.textContent = ""; return; }
    const total = editorLineStarts.length || 1;
    el.textContent = (centerLine + 1) + " / " + total + " · " + Math.round(((centerLine + 1) / total) * 100) + "%";
  }
  // 滚动触发：编辑区中心移出当前窗口内圈 → 防抖重渲新窗口（不依赖 scrollSrc，故预览驱动编辑器越过窗口边也触发）
  function scheduleWindowRecenter() {
    if (winStart < 0 || !editorLineStarts.length) return;
    if (winRecenterRaf) return;
    winRecenterRaf = requestAnimationFrame(() => { winRecenterRaf = 0; renderWindow(false); });
  }

  // HTML 模式：用 KaTeX auto-render 渲染 $...$ / $$...$$（HTML 里公式是字面量，不像 MD 模式已预渲染）
  function renderMathAuto(root) {
    if (window.renderMathInElement) {
      try {
        renderMathInElement(root, {
          delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
          throwOnError: false,
          trust: false, // 显式禁用 \href/\url/\includegraphics 等（默认即 false；显式标注防未来误开，S2）
          strict: false, // 同上：关闭 warning 洪水（OCR 数学里大量零宽字符等）
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
      const eo = i + 1 < srcBlockOffsets.length ? srcBlockOffsets[i + 1] : (winStart >= 0 ? winEnd : editor.value.length); // 窗口化最后块 end=winEnd（实际窗口末），非文末——否则该块 off..文末 跨整篇，previewOffsetToY 命中时插值分母=百万→y≈块顶，预览死钉该块顶不动（目录/大段后尤其明显）
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
      // 复用上方已解析并标记好 data-src-offset/end（含 tagFineInBlock 的 li/tr 细粒度偏移）的
      // template：cloneNode(true) 保留属性，appendChild 直接挂载，避免对同一 html 二次 innerHTML
      // 解析（原"二次解析 + 二次标注"循环随之删除）。
      if (winStart >= 0 && winSkel.length) {
        // 窗口化：建 spacer 三段，块挂 vContent（vClear 已清 preview 并把 vSpacerTop/Content/Bottom 置 null）
        winSetup();
        vContent.appendChild(tpl.content.cloneNode(true));
        highlightCodeLazy(); wrapDisplayMath(vContent);
        const at = activeTab();
        if (at && at.type === "html") renderMathAuto(vContent);
        if (isTauri && at) resolveImages(vContent, at.dir || "");
        winMeasuresFill(); updateWindowSpacers();
      } else {
        preview.appendChild(tpl.content.cloneNode(true));
        // 代码高亮：懒加载——只高亮进入视口的代码块（IntersectionObserver）。
        highlightCodeLazy();
        wrapDisplayMath(preview);
        // HTML 模式：渲染 $...$ 数学公式（MD 模式已在 html 字符串里预渲染，不需要）
        const at = activeTab();
        if (at && at.type === "html") renderMathAuto(preview);
        if (isTauri && at) resolveImages(preview, at.dir || "");
      }
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
    if (tag === "PRE") {
      // 折行粗估：基线 nl(源码换行数) + 超宽源码行补视觉行。显示宽度 CJK/全角=2、约 60 宽度/行
      // （仅虚拟化初始估算；滚入视口后 offsetHeight 实测覆盖，见 renderVisible）。
      const text = el.textContent || "";
      const nl = (text.match(/\n/g) || []).length;
      let extra = 0;
      for (const ln of text.split("\n")) {
        const cjk = (ln.match(/[　-鿿가-힯＀-￯]/g) || []).length;
        const w = ln.length + cjk;              // CJK/全角按 2 宽度
        if (w > 60) extra += Math.ceil(w / 60) - 1;
      }
      return 40 + (Math.max(1, nl) + extra) * 18;
    }
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
    // 注意：不清 winSkel/winPrefix（全文骨架独立于 DOM 挂载；render 非窗口化路径已负责清，避免
    // 这里清掉后 renderIntoPreview 的 winStart>=0&&winSkel.length 守卫瞬时失效）
  }

  /* ---------- 窗口化全文 spacer 骨架（大文档预览连续滚到文末，Phase1 MVP）----------
     窗口化(>200KB)原本只挂编辑器中心窗口的块、preview 无全文高度 → 滚动条只覆盖窗口、滚不到文末。
     这里给窗口化加 vSpacerTop+vContent+vSpacerBottom 三段（复用虚拟化的 spacer 变量），vContent 只挂
     当前窗口已 parse 块（保留窗口化性能），spacer 用全文骨架 winSkel/winPrefix 撑起。骨架 MVP 按 \n\n
     切块 + estBlockByRaw 估高（零 lexer 成本，规避 BUG-141 全文 parse 慢）。全程 if(winSkel.length) 守卫。 */
  // 按源码 raw 文本估块高（不依赖 DOM，常量与 estimateFromNode 对齐）。供 buildWinSkelByLines 用。
  function estBlockByRaw(raw) {
    const s = raw.trim();
    if (!s) return 20;
    const lines = s.split("\n");
    if (/^# /.test(s)) return 52;
    if (/^## /.test(s)) return 42;
    if (/^### /.test(s)) return 34;
    if (/^#{4,6} /.test(s)) return 30;
    if (/^```|^~~~/.test(s)) {                       // 代码块：nl + CJK 折行（同 estimateFromNode PRE 分支）
      const nl = (s.match(/\n/g) || []).length;
      let extra = 0;
      for (const ln of lines) {
        const cjk = (ln.match(/[　-鿿가-힯＀-￯]/g) || []).length;
        const w = ln.length + cjk;
        if (w > 60) extra += Math.ceil(w / 60) - 1;
      }
      return 40 + (Math.max(1, nl) + extra) * 18;
    }
    if (/^\|.*\|/.test(s) && lines.length > 1) return 20 + Math.max(1, lines.length) * 30;  // 表格
    if (/^[ \t]*([-*+]|\d+\.)[ \t]/.test(s)) {       // 列表：项数×28
      const items = lines.filter((t) => /^[ \t]*([-*+]|\d+\.)[ \t]/.test(t)).length;
      return 20 + Math.max(1, items) * 28;
    }
    if (/^> /.test(s)) {                             // 引用
      const ps = Math.max(1, lines.filter((t) => t.trim()).length);
      return 36 + ps * 28;
    }
    if (/^!\[.*\]\(|<img/i.test(s)) return 312;      // 图片块：MVP 占位 300+margin，滚入实测回填修正
    const tlen = s.length;                           // 散文：行数×26 + 长文补偿
    return 28 + Math.max(1, lines.length) * 26 + (tlen > 200 ? Math.floor((tlen - 200) / 40) * 24 : 0);
  }
  // 构建全文块骨架（MVP：按 \n\n 切块 + estBlockByRaw 估高）。切块基准与 runWindowPipeline split 兜底、
  // render 批化 split(/(\n\n+)/) 一致（绝对偏移）。注：窗口 parse 用 marked.lexer 切块可能比 \n\n 略细
  // （松散列表），故骨架块边界与窗口块非严格一一对应——仅影响 spacer 精度（滚入实测回填修正），不影响滚到文末。
  function buildWinSkelByLines() {
    const v = editor.value;
    // 文档没变则复用骨架（保留 measured 实测值），避免连续滚动每次 reset 全文重算（1.2MB ~几百 ms，
    // 是超长文本连续滚动中段预览空白的瓶颈）。文档变（编辑/换文档）才重建。
    if (winSkel.length && winSkelDocLen === v.length) return;
    winSkel = []; winPrefix = [0];
    let pos = 0;
    for (const part of v.split(/(\n\n+)/)) {
      if (part.trim()) {
        const est = estBlockByRaw(part);
        winSkel.push({ off: pos, end: pos + part.length, raw: part, est, measured: null });
      }
      pos += part.length;
    }
    for (let i = 0; i < winSkel.length; i++) winPrefix.push(winPrefix[i] + (winSkel[i].measured || winSkel[i].est));
    winSkelDocLen = v.length;
  }
  // 源偏移 off 所在骨架块的前缀高度（该块顶部在全文的 Y）。
  function winPrefixOf(off) {
    if (!winSkel.length) return 0;
    let lo = 0, hi = winSkel.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (winSkel[mid].off <= off) lo = mid + 1; else hi = mid; }
    return winPrefix[Math.max(0, lo - 1)] || 0;
  }
  // 全文 Y → 源偏移（预览驱动用；不依赖 posAtCoords，规避 BUG-144 "重置到开头"级联）。
  function winYToOff(y) {
    if (!winSkel.length) return 0;
    let lo = 0, hi = winSkel.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((winPrefix[mid + 1] || winPrefix[mid]) <= y) lo = mid + 1; else hi = mid; }
    const i = Math.max(0, Math.min(winSkel.length - 1, lo));
    const b = winSkel[i], top = winPrefix[i], h = (b.measured || b.est) || 1;
    return Math.round(b.off + Math.max(0, Math.min(1, (y - top) / h)) * (b.end - b.off));
  }
  // 源偏移 → 全文 Y（编辑器驱动定位 spacer 下窗口 / spacer 高度计算用）。
  function winOffToY(off) {
    if (!winSkel.length) return 0;
    let lo = 0, hi = winSkel.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (winSkel[mid].off <= off) lo = mid + 1; else hi = mid; }
    const i = Math.max(0, lo - 1);
    const b = winSkel[i], top = winPrefix[i], h = (b.measured || b.est) || 1;
    const frac = b.end > b.off ? Math.max(0, Math.min(1, (off - b.off) / (b.end - b.off))) : 0;
    return top + frac * h;
  }
  // 建窗口化 spacer 三段（复用虚拟化的 vSpacerTop/vContent/vSpacerBottom 变量，结构一致）。
  function winSetup() {
    vSpacerTop = document.createElement("div");
    vContent = document.createElement("div");
    vContent.className = "vcontent";
    vSpacerBottom = document.createElement("div");
    preview.appendChild(vSpacerTop);
    preview.appendChild(vContent);
    preview.appendChild(vSpacerBottom);
  }
  // 实测 vContent 内已挂块的渲染高度，回填 winSkel.measured，重算 winPrefix（修正 spacer 精度，仿
  // renderVisible offsetHeight 实测回填）。srcBlockOffsets（窗口内块偏移）与 vContent 子节点一一对应。
  function winMeasuresFill() {
    if (!winSkel.length || !vContent) return;
    const kids = vContent.children;
    let changed = false;
    for (let k = 0; k < kids.length && k < srcBlockOffsets.length; k++) {
      const so = srcBlockOffsets[k];
      let lo = 0, hi = winSkel.length;            // 二分找 off≤so 的骨架块（lexer vs \n\n 切块错位时取最近）
      while (lo < hi) { const mid = (lo + hi) >> 1; if (winSkel[mid].off <= so) lo = mid + 1; else hi = mid; }
      const idx = Math.max(0, lo - 1);
      const h = kids[k].offsetHeight;
      if (h && Math.abs(h - (winSkel[idx].measured || winSkel[idx].est)) > 1) { winSkel[idx].measured = h; changed = true; }
    }
    if (changed) { winPrefix = [0]; for (let i = 0; i < winSkel.length; i++) winPrefix.push(winPrefix[i] + (winSkel[i].measured || winSkel[i].est)); }
  }
  // 设窗口化三段 spacer 高度：top=窗口起点前缀；bottom=全文总高 - 窗口终点 Y（winEnd=文末时 bottom→0，能滚到文末）。
  function updateWindowSpacers() {
    if (!winSkel.length || !vSpacerTop) return;
    const total = winPrefix[winPrefix.length - 1] || 0;
    vSpacerTop.style.height = winPrefixOf(winStart) + "px";
    vSpacerBottom.style.height = Math.max(0, total - winOffToY(winEnd)) + "px";
  }
  // 预览驱动：滚到未 parse 区时懒解析该段。是否需要解析以「视口中心是否已被 vContent 覆盖」为准
  // （DOM 实测，准），而非骨架 off 判断（累积误差会误判已在窗口内 → 视口停在空白 spacer）。
  // 替换 vContent 后用 previewOffsetToY 实测 Y 重定位（非骨架 winOffToY），保证视口对齐实际内容。
  async function renderWindowLazy() {
    if (!winSkel.length || !vContent) return;
    const ev = editor.value, ls = editorLineStarts;
    if (!ls.length) return;
    const ch = preview.clientHeight || 600;
    const pvRect = preview.getBoundingClientRect();
    const midAbs = pvRect.top + ch / 2;
    // 视口中心是否已被 vContent 块覆盖（实测，不受骨架估高累积误差影响）
    let inVc = false;
    for (const k of vContent.children) { const r = k.getBoundingClientRect(); if (midAbs >= r.top && midAbs < r.bottom) { inVc = true; break; } }
    if (inVc) return; // 视口已有内容，无需懒解析（细粒度同步由 syncAnchors 处理）
    const targetOff = winYToOff(preview.scrollTop + ch / 2); // 骨架估算目标 off（仅决定解析哪段，偏差由实测重定位吸收）
    const cLine = lineOfOffset(targetOff);
    const visibleLines = Math.max(20, Math.round(ch / editorLH));
    const halfWin = Math.min(200, Math.round(visibleLines * 2)); // 预览驱动用较小窗口(~4视口)：parse 快、拖动跟手少空白；编辑器驱动走 renderWindow 用 ~6 视口
    const a0 = ls[Math.max(0, cLine - halfWin)] || 0;
    const b0 = (cLine + halfWin + 1 < ls.length) ? ls[cLine + halfWin + 1] : ev.length;
    const wb = expandToBlockBounds(ev, a0, b0);
    winRenderActive++;
    try {
      const g = ++renderGen;
      const { html, offsets } = await runWindowPipeline(ev, wb.start, wb.end);
      if (g !== renderGen) return;
      winStart = wb.start; winEnd = wb.end; srcBlockOffsets = offsets;
      vContent.innerHTML = "";
      mountSliceBlocks(html, offsets, "append", wb.end); // 复用：标记+挂 vContent+实测回填+更新 spacer
      scrollSrc = "preview"; // renderWindowLazy 只在 preview 驱动触发(preview scroll 监听 scrollSrc!=="editor")，须保持 preview 驱动状态：preview scroll→preview→editor(editor 跟重定位)，editor scroll→scrollSrc="preview"→不触发 editor→preview。旧设"editor"会让 editor(被 preview→editor 推着滚)的 scroll 事件触发 editor→preview，把 preview 反向拉回 editor 位置(content)=跳回。
      // 重定位须基于"preview 当前位置"而非 enter 时骨架估算的 anchorOff：renderWindowLazy 是 async，await runWindowPipeline 期间用户继续滚 preview→preview.scrollTop 已变；
      // 且骨架 winMeasuresFill 在 marked.lexer 切块(窗口内 content 被切成中末段)与 \n\n 骨架块(全 content)不对齐时把"部分实测高"回填给"全块"→骨架 content 高严重偏差→winYToOff 偏→enter targetOff/anchorOff 偏→重定位把 preview 拉回偏前位置(用户感"跳回")。
      // 改实测：previewYToOffDom 读 preview 中心当前 DOM 命中的源 off（替换 vContent 后新内容已挂），重定位到该 off 实测 Y（≈当前 preview 位置，不跳）；未命中(已滚出 parse 段)则不重定位(保持 preview，下次 renderWindowLazy 重新 parse)。
      const curOff = previewYToOffDom(preview.scrollTop + ch / 2);
      if (curOff >= 0 && curOff >= winStart && curOff <= winEnd) {
        // 仅用实测 realY 重定位，且偏差<1视口才设：替换 vContent 后同 off 的 Y≈原位，大偏差说明 curOff 落窗口边/已滚出
        // (realY=null：curOff=winE 边界无块含此 off)。旧回退 winOffToY(骨架)在 chapter1(公式/代码)严重低估 off→Y
        // (off20770 骨架估9706 vs 实际12772，低24%)→preview 回跳3000px→触发 editor→preview 级联(用户感"跳回")。
        // realY 无效/偏差大→不重定位，保持 preview，下帧 renderWindowLazy 重新 parse 正确段。
        const realY = previewOffsetToY(curOff);
        if (realY != null && isFinite(realY)) {
          const newPv = Math.max(0, realY - ch / 2);
          if (Math.abs(newPv - preview.scrollTop) < ch) preview.scrollTop = newPv;
        }
      }
      updateWindowPos(cLine);
    } catch (e) { console.log("renderWindowLazy", e); } finally { winRenderActive--; }
  }
  function scheduleWindowLazyParse() {
    if (winLazyRaf) return;
    winLazyRaf = requestAnimationFrame(() => { winLazyRaf = 0; renderWindowLazy(); });
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
    const prev = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
    const s = editor.selectionStart, e = editor.selectionEnd;
    const raw = editor.value.slice(s, e);
    // 把选区首尾空白移到标记外：Markdown 行内标记(* ` ~)须紧贴文字，否则 * 文本 * 形式斜体/加粗失效。
    const rest = raw.replace(/^\s+/, "");        // 去首部空白
    const lead = raw.slice(0, raw.length - rest.length);
    const core = rest.replace(/\s+$/, "");        // 再去尾部空白 = 文本核心
    const trail = rest.slice(core.length);
    const inner = core || ph;                     // 空选区 / 纯空白 → 占位文本
    editor.value = editor.value.slice(0, s) + lead + before + inner + (after || "") + trail + editor.value.slice(e);
    const cs = s + lead.length + before.length;   // 选区核心（标记之内）
    editor.setSelectionRange(cs, cs + inner.length);
    commitUndo(prev);
    editor.focus(); scheduleRender();
  }
  function linePrefix(prefix) {
    const prev = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
    const s = editor.selectionStart, v = editor.value;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    editor.value = v.slice(0, ls) + prefix + v.slice(ls);
    editor.setSelectionRange(s + prefix.length, s + prefix.length);
    commitUndo(prev);
    editor.focus(); scheduleRender();
  }
  function insertBlock(text, f, t) {
    const prev = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
    const s = editor.selectionStart, v = editor.value;
    const nl = s > 0 && v[s - 1] !== "\n" ? "\n" : "";
    editor.value = v.slice(0, s) + nl + text + v.slice(s);
    const base = s + nl.length;
    editor.setSelectionRange(base + (f || 0), base + (t || 0));
    commitUndo(prev);
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
  // 把当前编辑器状态立即入撤销栈。程序化编辑(wrapSelection/insertBlock/linePrefix)直接调用——
  // 它们改 editor.value 不触发 input 事件，而 undoSnapshot 绑在 input 上，导致工具栏格式化(加粗/链接/表格等)
  // 不入栈、Ctrl+Z 与回退按钮撤销不了。pushUndo 先清掉待触发的防抖定时，立即落栈。
  function pushUndo() {
    clearTimeout(undoTimer);
    const v = editor.value; // editor.value 是 textarea getter，缓存一次复用（#性能4）
    if (v !== undoLast.v) {
      undoStack.push(undoLast);
      if (undoStack.length > 500) undoStack.shift();
      trimUndoBytes(undoStack); // C4: 按字节预算封顶
      redoStack = [];
    }
    undoLast = { v, s: editor.selectionStart, e: editor.selectionEnd };
  }
  // 用户输入触发：200ms 防抖合并（连续输入=一步）；定时到再 pushUndo。
  function undoSnapshot() {
    clearTimeout(undoTimer);
    undoTimer = setTimeout(pushUndo, 200); // 200ms 合并：连续快速输入=一步，停顿>200ms=新的一步（细粒度）
  }
  // 程序化编辑(wrapSelection/insertBlock/linePrefix)专用：把调用方在【编辑前】捕获的快照 prev 入栈，
  // undoLast 设为编辑后。直接用 prev 而非全局 undoLast——后者可能因文档载入/切换未同步而过时(如空值)，
  // 入栈会导致 Ctrl+Z 把文档清空。用 prev 保证撤销目标=真实编辑前内容。
  function commitUndo(prev) {
    clearTimeout(undoTimer);
    if (prev.v !== editor.value) { // 有实质变化才入栈
      undoStack.push(prev);
      if (undoStack.length > 500) undoStack.shift();
      trimUndoBytes(undoStack); // C4: 按字节预算封顶
      redoStack = [];
    }
    undoLast = { v: editor.value, s: editor.selectionStart, e: editor.selectionEnd };
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

  /* ---------- AI 改写（选区下方指令框 → 流式改写 → 预览式应用）----------
   * 配置存 localStorage（md-ai-*）；Key 单独存 md-ai-key，且【不纳入】会话自动保存
   * （writeDraftNow 只把 {ts,tabs,activeId} 序列化进 md-session，不 dump localStorage → Key 天然隔离）。
   * 选区像素定位用 #ai-mirror 镜像 div（见 verify-selection-pos.html，已验证软换行对齐）。
   * 网络由 Rust ai_rewrite 命令承担（SSE）；前端只监听 ai-token/ai-done/ai-cancelled/ai-error。
   */
  (function AiModule() {
    const cfg = () => ({
      provider: localStorage.getItem("md-ai-provider") || "openai",
      endpoint: localStorage.getItem("md-ai-endpoint") || "",
      model:    localStorage.getItem("md-ai-model") || "",
      temp:     parseFloat(localStorage.getItem("md-ai-temp")) || 0.7,
      key:      localStorage.getItem("md-ai-key") || "",
    });
    const hasCfg = () => { const c = cfg(); return !!(c.endpoint && c.key && c.model); };

    const pop = $("ai-pop");
    // AI 独立窗口模式：本窗口是否为 ai-panel-* 独立 OS 窗口。是→不读 editor、apply 走 IPC、关浮层=关OS窗口。
    const isAiPanelWindow = winLabel.startsWith("ai-panel-");
    let cursorMode = false; // 光标处（无选区）打开模式：显示编辑区占位 + "在光标处插入"按钮（生成内容后可用）
    let manualEditH = 0; // A 区手动拖动(分隔条)设的高度；0=未手动。layoutEditBody 取 max(manualEditH, 内容高)
    let aiCtxBefore = "", aiCtxAfter = ""; // AI 窗口模式：打开时主窗口传入的上下文（替代 editor.value 切片）
    let jobSeq = 0, job = null, testing = false;
    let selRange = null, acc = "";
    let pendingRange = null; // 右键时于 contextmenu 捕获的选区（彼时编辑区聚焦、选区完整）
    let messages = [];        // 多轮历史 [{role:"user"|"assistant", content}]（assistant 含 EDIT: 前缀）
    let editText = "";        // 编辑区当前文本（多轮演进）
    let origSelText = "";     // 原选区文本（diff 基准）；无选区时为空
    let cursorPos = 0;        // 无选区（插入模式）时的光标位置
    let routeMode = "unknown";// 本回合路由：unknown|edit|chat
    let curInstruction = "";  // 本回合用户指令（onDone 入历史用）
    let curBubble = null;     // 对话区当前流式气泡 DOM
    let editHistory = [], editFuture = []; // 编辑区文本的回退/前进栈（多轮改写状态）
    let editViewMode = "diff"; // 编辑区视图："diff"（源码+diff 高亮）| "render"（渲染预览）
    let editBodyGen = 0; // 编辑区渲染态的代际守卫（mermaid 异步，切视图时作废旧的）
    let editingId = null, deleteConfirmTimer = null; // 预设列表：当前编辑项 id；删除二次确认定时器（v2.1.0）

    // —— A/B 内容定高 + 窗口贴合：仅面板窗口 ai-panel-* 生效 ——
    // 安全不变量(BUG-130)：onResized 回调绝不调 setSize；仅 maybeFitWindow(内容事件/分隔条拖动触发)才 setSize。
    //   A/B 均 flex:none 内容驱动、与窗口尺寸解耦 → setSize 引起的 resize 不改变 A/B 内容 → 反馈循环无法形成。
    let userResized = false; // 用户手拖过 OS 窗口→永久关自动贴合
    let progResize = false;  // 自家 setSize 在飞→其 onResized 回声不算用户拖动
    let sepDragging = false; // 正在拖 A-B 分隔条：期间跳过 maybeFitWindow 的 setSize(由拖动自己 setSize 改窗口)，但 min-size 仍更新
    let sepProgTimer = 0;    // 分隔条拖动中 progResize 的清除句柄(连续 mousemove 不断重置，拖完 300ms 后清)
    let fitArmed = false;    // 初始保护期：挂 onResized 后 1s 内置 true 之前，resize 视为 OS/布局沉淀(非用户拖动)，不锁自动贴合
    let bGrowTimer = 0;      // maybeFitWindow 防抖句柄
    let _fitRAFPending = false;   // scheduleFit 的 rAF 节流标志
    // 防御(BUG-154)：Windows WebView2 上 maybeFitWindow 的 setSize 会触发 ResizeObserver 回声(布局未稳定时
    // A/输入/状态行高度波动)，RO→scheduleFit→maybeFitWindow→setSize 形成反馈循环淹没主线程→AI 窗白屏+卡死。
    // macOS WKWebView 上 BUG-130 的 progResize/"flex:none 解耦"假设有效、循环不形成；Windows 时序不同，需额外冷却闸门。
    let _fitCooldown = 0;             // setSize 后的冷却截止时间戳：此窗口内 scheduleFit(RO 回声)直接忽略
    const FIT_COOLDOWN_MS = 220;      // 冷却时长(ms)：覆盖一次 setSize→resize→RO 回声(通常 1~2 帧)
    // 收敛兜底(BUG-154 根因加固)：冷却闸门只降频不破环——若 winChrome 探测失败/偏差(Windows WebView2 时序)，
    // setSize(needH) 后 inner 永远 <needH→maybeFitWindow 永远 grow→死循环。此处记录连续"setSize 后 inner 卡住不变"次数，
    // 连续 2 次即放弃自动贴合(_fitGiveUp=true)。窗口尺寸略偏(差标题栏高)远好过卡死。新窗口=新页面实例，变量自然重置。
    let _fitGiveUp = false;                  // true→maybeFitWindow 直接 return(已判定 setSize 无法收敛)
    let _fitStallInner = 0, _fitStallCount = 0;  // 上次 setSize 后的 innerHeight / 连续卡住(同一 inner<needH)次数
    // rAF 节流触发 maybeFitWindow：流式输出(B1 逐渐增高)/A 区异步长高/RO 都用它，每帧最多 1 次，窗口紧跟内容。
    function scheduleFit() { if (_fitRAFPending) return; _fitRAFPending = true; requestAnimationFrame(() => { _fitRAFPending = false; if (Date.now() < _fitCooldown) return; maybeFitWindow(); }); }
    let bResizeObs = null;   // A 区+B 区 ResizeObserver→重贴合(捕获异步增高)
    let _fitLogged = 0;      // 诊断：maybeFitWindow 前 N 次显示实测值(定位贴合问题后删)
    // 取当前 Tauri 窗口对象（同 closePop 的取法，集中一处复用）
    function aiWin() {
      try {
        const wm = T && (T.window || (T.webviewWindow || {}));
        const cw = wm.getCurrentWindow ? wm.getCurrentWindow() : (wm.getCurrentWebviewWindow ? wm.getCurrentWebviewWindow() : null);
        return cw || null;
      } catch (_) { return null; }
    }
    // 逻辑尺寸构造器：withGlobalTauri 下挂在全局；位置因版本而异，逐个探测
    function getLogicalSizeCtor() {
      try {
        if (T && T.window && typeof T.window.LogicalSize === "function") return T.window.LogicalSize;
        if (T && T.webviewWindow && typeof T.webviewWindow.LogicalSize === "function") return T.webviewWindow.LogicalSize;
        if (T && T.core && typeof T.core.LogicalSize === "function") return T.core.LogicalSize;
      } catch (_) {}
      return null;
    }

    const aiEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 把 AI 选区渲成 <mark class="ai-sel"> 进 #editor-hl（复用搜索高亮的对齐机制：同字体/内边距/行高 + 同步滚动）。
    // hl 与 textarea 已逐项对齐且同步滚动 → mark 的 getBoundingClientRect 即真实选区在屏幕上的位置，
    // 选区高亮与浮层定位共用此 rect（之前用独立 #ai-mirror 测量会因换行/滚动条细微差异错位）。
    // buildAiSel 只在开浮层时建一次；滚动时 aiSelRect 仅同步滚动+重测，不重建 innerHTML（大文档不卡）。
    function buildAiSel() {
      if (!cm || !setAiSel) return;
      // 有选区→mark 高亮选区；无选区（插入模式）→widget 在光标处画零宽闪烁竖线（CM Decoration 画在 .cm-content）
      let s, e;
      if (selRange) { s = selRange.start; e = selRange.end; }
      else { s = cursorPos; e = cursorPos; }
      const len = cm.state.doc.length;
      s = Math.max(0, Math.min(s, len)); e = Math.max(0, Math.min(e, len));
      cm.dispatch({ effects: setAiSel.of({ start: s, end: e }) });
    }
    // AI 目标的视口矩形（供 placePop 定位浮层）：CM coordsAtPos 取起止偏移的客户端坐标，零宽(光标)返 2px 宽竖条矩形
    function aiSelRect() {
      if (!cm) return null;
      let s, e;
      if (selRange) { s = selRange.start; e = selRange.end; }
      else { s = cursorPos; e = cursorPos; }
      const len = cm.state.doc.length;
      s = Math.max(0, Math.min(s, len)); e = Math.max(0, Math.min(e, len));
      const c1 = cm.coordsAtPos(s);
      if (!c1) return null;
      if (s === e) return { vLeft: c1.left, vTop: c1.top, width: 2, height: c1.bottom - c1.top };
      const c2 = cm.coordsAtPos(e);
      if (!c2) return { vLeft: c1.left, vTop: c1.top, width: c1.right - c1.left, height: c1.bottom - c1.top };
      return { vLeft: Math.min(c1.left, c2.left), vTop: Math.min(c1.top, c2.top),
        width: Math.max(c1.right, c2.right) - Math.min(c1.left, c2.left),
        height: Math.max(c1.bottom, c2.bottom) - Math.min(c1.top, c2.top) };
    }

    function placePop() {
      const R = aiSelRect();
      if (!R) return null;
      // 浮层 position:fixed → 用视口坐标；按 选区下方/上方/贴底 顺序安置，绝不超出视口
      const vw = window.innerWidth, vh = window.innerHeight;
      const popW = pop.offsetWidth || 360;
      const popH = Math.min(pop.offsetHeight || 160, vh - 16);
      const left = Math.max(8, Math.min(R.vLeft, vw - popW - 8));
      let top;
      if (R.vTop + R.height + 6 + popH <= vh) top = R.vTop + R.height + 6;   // 选区下方放得下
      else if (R.vTop - 6 - popH >= 0) top = R.vTop - 6 - popH;               // 选区上方放得下
      else top = Math.max(8, vh - popH - 8);                                  // 都放不下→贴底
      top = Math.max(8, Math.min(top, vh - popH - 8));                        // 兜底夹在视口内
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      return R;
    }

    const setStatus = (msg) => { const s = $("ai-status"); if (s) s.textContent = msg || ""; };
    // 显式控制底栏按钮显隐（编辑区的 apply/insert 由 renderEditZone 按是否有选区管理）
    function setBar(o) {
      const s = $("ai-send"); if (s) s.hidden = o.send === false;
      // 「关闭」按钮已移除（改用右上角 ×）；discard 参数保留以兼容既有调用，不再生效。
    }
    // 对话区追加一条消息；返回该 DOM（供流式更新）
    function appendChat(role, text, note) {
      const el = document.createElement("div");
      el.className = "ai-msg " + (note ? "ai-msg-note" : (role === "user" ? "ai-msg-user" : "ai-msg-ai"));
      el.textContent = text;
      const c = $("ai-chat");
      c.appendChild(el); c.scrollTop = c.scrollHeight;
      return el;
    }
    // 给一条 AI 对话回复加「→ 用作编辑区内容」按钮：点击把该回复设为 editText（替换编辑区、重算 diff）
    function addEditBtn(el, text) {
      const btn = document.createElement("button");
      btn.className = "ai-to-edit";
      btn.textContent = t("aiToEdit");
      btn.addEventListener("click", () => {
        editHistory.push(editText); editFuture = [];                 // 搬运前状态入回退栈
        editText = text;
        renderEditZone();
        $("ai-edit-zone").hidden = false;
        toast(t("aiMovedToEdit"));
      });
      el.appendChild(btn);
    }
    // 轻量 markdown 渲染：marked → DOMPurify → mermaid（async）→ KaTeX 公式。
    // balanceMathDelims 在渲染前补齐未成对的 $/$$（仅渲染过程，不改源文本/编辑区）。
    // isCurrent 可选：mermaid 异步完成前若已过期（编辑区切了视图）则放弃写入，防竞态。
    function balanceMathDelims(text) {
      if ((text.match(/\$\$/g) || []).length % 2 === 1) text = text + "$$";           // $$ 未成对→补 $$
      if ((text.replace(/\$\$/g, "").match(/\$/g) || []).length % 2 === 1) text = text + "$"; // 单 $ 未成对→补 $
      return text;
    }
    async function renderMdInto(el, text, isCurrent) {
      text = balanceMathDelims(text);
      let html;
      try { html = window.marked ? marked.parse(text) : aiEsc(text); } catch (_) { html = aiEsc(text); }
      if (window.DOMPurify) { try { html = DOMPurify.sanitize(html, {}); } catch (_) {} }
      if (typeof renderMermaidInHtml === "function") { try { html = await renderMermaidInHtml(html); } catch (_) {} }
      if (isCurrent && !isCurrent()) return; // 已过期，放弃写入
      el.innerHTML = html;
      el.classList.add("ai-md");
      if (typeof renderMathAuto === "function") renderMathAuto(el);
    }
    // 编辑区：有选区 或 已有编辑内容 时显示；diff 高亮（与原选区比）；按是否有选区决定 apply/insert
    function renderEditZone() {
      const zone = $("ai-edit-zone"), body = $("ai-edit-body");
      const show = !!selRange || !!editText || cursorMode;
      zone.hidden = false;                      // 标签行常驻：纯提问时也显示(AI 名 + ×)
      zone.classList.toggle("has-edit", show);  // 有编辑内容才显示正文 + 编辑动作按钮
      if (show) {
        if (editViewMode === "render") {
          const g = ++editBodyGen;
          renderMdInto(body, editText, () => g === editBodyGen); // 渲染预览（mermaid 异步，gen 守卫防切视图竞态）
        } else {
          body.classList.remove("ai-md");
          body.innerHTML = (selRange && origSelText) ? renderDiff(aiDiff(origSelText, editText)) : aiEsc(editText); // 源码 + diff
        }
        $("ai-apply").hidden = !selRange;
        $("ai-insert").hidden = !!selRange;
        $("ai-insert").disabled = !editText;   // 光标处模式：未生成内容前禁用"在光标处插入"
        const vb = $("ai-edit-view"); if (vb) vb.textContent = (editViewMode === "render") ? t("aiViewSrc") : t("aiViewRender");
      }
      updateUndoRedoBtns();
      layoutEditBody();   // A 区内容驱动高度(到 10 行)
      relayout();         // B 区重排：面板→layoutB(B1+B2)，页内→layoutInput(A 区变→可用 B 变)
    }
    // 编辑区回退/前进：在多轮改写状态间切换
    function updateUndoRedoBtns() {
      const u = $("ai-edit-undo"), r = $("ai-edit-redo");
      if (u) u.disabled = editHistory.length === 0;
      if (r) r.disabled = editFuture.length === 0;
    }
    function undoEdit() {
      if (!editHistory.length) return;
      editFuture.push(editText);
      editText = editHistory.pop();
      renderEditZone();
    }
    function redoEdit() {
      if (!editFuture.length) return;
      editHistory.push(editText);
      editText = editFuture.pop();
      renderEditZone();
    }

    // AI 独立窗口：用主窗口传入的选区数据初始化浮层（不读 editor、不画 mark、不 placePop）。
    function applyAiPanelData(data) {
      if (data && typeof data === "object") {
        if (data.start != null && data.end != null && data.start !== data.end) {
          selRange = { start: data.start, end: data.end }; cursorPos = 0;
          origSelText = data.selText || ""; cursorMode = false;
        } else { selRange = null; cursorPos = data.cursorPos || 0; origSelText = ""; cursorMode = true; }
        aiCtxBefore = data.ctxBefore || ""; aiCtxAfter = data.ctxAfter || "";
      }
      messages = []; editText = origSelText; acc = ""; job = null;
      routeMode = "unknown"; curInstruction = ""; curBubble = null;
      editHistory = []; editFuture = []; editViewMode = "diff";
      const inp = $("ai-input"); if (inp) inp.value = "";
      const chat = $("ai-chat"); if (chat) chat.innerHTML = "";
      renderEditZone(); setBar({ send: true }); setStatus("");
      const _an = $("ai-active-name"); if (_an) _an.textContent = currentApiLabel();
      if (inp) inp.focus();
      const _eb = $("ai-edit-body"); if (_eb) { _eb.style.height = ""; _eb.style.maxHeight = ""; } manualEditH = 0;
      relayout();         // B 区重排(面板 B1+B2 / 页内 B2)
    }

    // B2(输入)内容高度测量：1~10 行(BUG-122 上限含 padding；BUG-126 空 textarea 的 scrollHeight 不含
    // 1 行→用 max(1行, scrollHeight) 兜底)。抽出让 layoutInput(页内浮层) 与 layoutB(面板窗口) 复用。
    // 注意：临时 height:auto 测 scrollHeight 后恢复原值，不污染调用方。
    function measureInputContent(inp) {
      const prev = inp.style.height;
      inp.style.height = "auto";
      const scrollH = inp.scrollHeight;
      const cs = getComputedStyle(inp);
      const lineH = parseFloat(cs.lineHeight) || 20;
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const minH = parseFloat(cs.minHeight) || 0;   // CSS min-height(如 calc(1.5em+14px))：空内容时输入框的【实际渲染高】，必须计入——否则 b2c 偏小→阈值偏小→窗口缩过头→dialog 装不下 input-row 被 overflow:hidden 裁成一条缝
      inp.style.height = prev;
      return Math.max(minH, lineH + pad, Math.min(scrollH, lineH * 10 + pad));   // max(CSS 最小高, 1 行, 内容)，上限 10 行
    }
    // B2(输入)高度：内容驱动(页内浮层模式用)。面板窗口改由 layoutB 统一分配 B1+B2。
    function layoutInput() {
      const inp = $("ai-input");
      if (!inp) return;
      inp.style.height = measureInputContent(inp) + "px";
    }

    // A 区(edit-body)高度：内容驱动，到 10 行止，第 11 行出滚动条
    function layoutEditBody() {
      const body = $("ai-edit-body");
      if (!body) return;
      body.style.height = "auto";
      const scrollH = body.scrollHeight;
      const cs = getComputedStyle(body);
      const lineH = parseFloat(cs.lineHeight) || 20;
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      body.style.height = Math.max(manualEditH, Math.min(scrollH, lineH * 10 + pad)) + "px";   // max(手动高度, 内容高)，上限 10 行：内容不满手动高度时保留手动，超过则 auto 增高
    }

    // —— A 区内容定高(flex:none,在顶部,label 永不裁)；B 区(dialog) flex:1 吃窗口剩余(拖大窗口 B 长) ——
    //   B 内：chat flex:1(随窗口长/空时缩到 0/超出滚动) + input flex:none(内容 1~10 行)。
    //   layoutB 只设 input 高(chat 走 CSS flex)；maybeFitWindow 把窗口贴合到 A+输入+chat 地板(min{10行,内容})。
    // 循环安全(BUG-130)：A(flex:none)与 input 内容不随窗口变；setSize 引起的 resize 不改它们→RO 不会因自家 setSize 重触发。
    function layoutB() {
      if (!isAiPanelWindow) return;
      const inp = $("ai-input");
      const chat = $("ai-chat");
      if (!inp) return;
      inp.style.height = measureInputContent(inp) + "px";   // B2 输入：内容驱动 1~10 行
      // B1(chat)：无消息时直接 display:none → B1 恒 0，不依赖窗口尺寸量准(根治"B1 初始非 0")；有消息时恢复显示、flex:1 生长
      if (chat) chat.style.display = (chat.children.length > 0) ? "" : "none";
    }

    // 派发：面板→layoutB(设 input 高)，页内→layoutInput(同义，B1 走 CSS)
    function relayout() { if (isAiPanelWindow) layoutB(); else layoutInput(); }

    // 内容事件入口：先按内容定 A/B 高，再让窗口贴合。debounce 150ms 合并连续输入。
    function onBContentChange() {
      relayout();
      if (!isAiPanelWindow) return;
      clearTimeout(bGrowTimer);
      bGrowTimer = setTimeout(maybeFitWindow, 150);
    }
    // 直接【量】内容高：临时让 dialog 按内容定高(flex:none)、chat 按 mode 表现，然后【求和各子元素外高】。
    // 不用 pop.offsetHeight——它在面板布局下被父/flex 撑成窗口高、不返回真实内容高(曾导致 need 恒=窗口高)。
    // offsetHeight 天然含 border+padding，再加 margin；display:none 的子元素计 0。所有边距/按钮高度自动算准。
    // mode: "min"=chat 计 0(B=输入行,窗口最小高/拖拽下限)；"fit"=chat 计 min(内容,10行)(贴合)。
    function measureContentHeight(mode) {
      const dlg = /** @type {HTMLElement|null} */ (pop.querySelector(".ai-dialog"));
      const chat = $("ai-chat");
      const editZone = $("ai-edit-zone");
      const resizer = /** @type {HTMLElement|null} */ (pop.querySelector(".ai-resizer"));
      if (!dlg) return 0;
      const sf = dlg.style.flex, sm = dlg.style.minHeight;
      const cm = chat ? chat.style.maxHeight : "", cd = chat ? chat.style.display : "", cf = chat ? chat.style.flex : "";
      try {
        dlg.style.flex = "none";        // dialog 按内容定高(=chat+status+input-row 自然和)
        dlg.style.minHeight = "0";
        const chatHasContent = !!(chat && chat.children.length > 0);
        if (chat && (mode === "min" || !chatHasContent)) chat.style.display = "none";          // chat 计 0：min 模式 或 空对话
        else if (chat) {
          // 有内容：chat 改 flex:none(内容定高，否则 flex:1 1 0 在内容定高 dialog 里 basis=0 塌成 0→needH 不含 chat→窗口不长)
          chat.style.flex = "none";
          const cs = getComputedStyle(chat); const lh = parseFloat(cs.lineHeight) || 20; const pd = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
          chat.style.maxHeight = (lh * 10 + pd) + "px";   // chat 内容定高，上限 10 行(超出滚动)
        }
        void dlg.offsetHeight;          // 触发 reflow，让上面 style 生效后再读
        const outer = (el) => { if (!el) return 0; const cs = getComputedStyle(el); if (cs.display === "none") return 0; return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0); };
        const popCS = getComputedStyle(pop);
        const popPadV = (parseFloat(popCS.paddingTop) || 0) + (parseFloat(popCS.paddingBottom) || 0);
        const popBdrV = (parseFloat(popCS.borderTopWidth) || 0) + (parseFloat(popCS.borderBottomWidth) || 0);
        return outer(editZone) + outer(resizer) + outer(dlg) + popPadV + popBdrV;
      } finally {
        dlg.style.flex = sf; dlg.style.minHeight = sm;
        if (chat) { chat.style.maxHeight = cm; chat.style.display = cd; chat.style.flex = cf; }
      }
    }
    // 窗口贴合/最小：needH=measureContentHeight("fit")，minWinH=measureContentHeight("min")。
    // userResized(手拖过窗口)后不再自动贴合(但 min 仍更新)；sepDragging(拖分隔条)期间由拖动自己 setSize。
    async function maybeFitWindow(forceShrink) {
      if (!isAiPanelWindow) return;
      if (_fitGiveUp) return;                // BUG-154 收敛兜底：setSize 已判定无法收敛(卡住)，放弃自动贴合避免死循环
      const dlg = /** @type {HTMLElement|null} */ (pop.querySelector(".ai-dialog"));
      if (!dlg) return;
      const cw = aiWin();
      // dialog 最小高 = 实测输入行 + dialog 自身边框：拖窗口变小时 dialog 停在此→clientHeight≥输入行→B2 一行不被裁。
      const row = /** @type {HTMLElement|null} */ (dlg.querySelector(".ai-input-row"));
      if (row) { const _db = (parseFloat(getComputedStyle(dlg).borderTopWidth) || 0) + (parseFloat(getComputedStyle(dlg).borderBottomWidth) || 0); dlg.style.minHeight = (row.offsetHeight + _db) + "px"; }
      // (a) 窗口最小高 = A + 输入行 + 边距(chat=0)。不受 userResized 影响——拖窗口下缘向上时 OS 在「A 不变+B 一行」拦截。
      const minWinH = measureContentHeight("min");
      // 窗口最小尺寸：宽度用固定小值(300，允许横向缩窄；勿用当前宽——否则只能拉宽不能缩窄)，高度=needH(动态)。
      if (cw) setWinMinSize(cw, 300, minWinH).catch(() => {});
      // (b) 自动贴合：撑大始终生效，缩回仅"未手动拖窗口"时(含 init)。
      //   - 撑大(needH>curH)：始终——内容(A/B2/chat)超过窗口就长，即使用户手拖过(B2 增多行也长)。
      //   - 缩回(needH<curH)：仅 !userResized——init/未拖时缩到内容(→B1=0)；用户手动调大过的尺寸予以尊重。
      if (sepDragging) return;                                  // 分隔条拖动期间由其自己 setSize
      const needH = measureContentHeight("fit");
      const curH = window.innerHeight;
      // 诊断拆解：看 need 由什么组成(aH=A区, row=输入行, chatKids=chat子元素数, status=状态行, dlgMin=dialog最小高)
      const _ez = $("ai-edit-zone"), _chat = $("ai-chat"), _st = $("ai-status");
      const aHd = (_ez && _ez.offsetParent !== null) ? _ez.offsetHeight : 0;
      const chatKids = _chat ? _chat.children.length : -1;
      const statusHd = (_st && _st.offsetParent !== null) ? _st.offsetHeight : 0;
      _fitDbg(`need=${needH} min=${minWinH} cur=${curH} aH=${aHd} row=${row ? row.offsetHeight : 0} chatKids=${chatKids} status=${statusHd} dlgMin=${dlg.style.minHeight} uR=${userResized ? 1 : 0}`);
      if (!cw || typeof cw.setSize !== "function") return;
      const grow = needH > curH + 1;
      const shrink = (forceShrink || !userResized) && needH < curH - 1;   // forceShrink: init 强制缩回(B1=0)，不受 userResized 影响
      if (!grow && !shrink) return;                             // 已贴合 或 用户手动定了更大尺寸(尊重)
      const newW = Math.round(window.innerWidth);                                            // 宽不变(仅贴合高)
      progResize = true;
      setTimeout(() => { progResize = false; }, 300);            // 300ms 内的 onResized 视为自家 setSize 回声
      _fitCooldown = Date.now() + FIT_COOLDOWN_MS;               // BUG-154：冷却闸门——此窗口内 RO 触发的 scheduleFit 直接忽略，堵 RO→setSize→RO 回声循环
      const res = await setWinSize(cw, newW, needH);             // 多路径重试 + 日志(见 setWinSize)，返回结果
      // 验证 setSize 设的是内尺寸还是外尺寸：读 setSize 后的 innerHeight，若 < needH 一截，说明设的是外尺寸(含标题栏)
      const afterInner = window.innerHeight;
      _fitDbg(`need=${needH} cur=${curH}→${needH} afterInner=${afterInner} aH=${aHd} row=${row ? row.offsetHeight : 0} dlgMin=${dlg.style.minHeight} ${grow ? "grow" : "shrink"} ${res}`);
      // 收敛兜底(BUG-154)：grow 后 inner 仍 <needH(外尺寸语义差标题栏) 且与上次 setSize 的 inner 完全相同(setSize 已无法再增=卡住)
      // → 连续 2 次即判定 winChrome 探测失准、放弃自动贴合。彻底打破 winChrome=0/偏差时的死循环(卡死≫差几px)。
      if (grow && afterInner < needH - 1) {
        if (_fitStallInner === afterInner) {
          if (++_fitStallCount >= 2) { _fitGiveUp = true; if (typeof console !== "undefined") console.warn("[AI panel] maybeFitWindow give up: setSize not converging (inner stuck at", afterInner, "< need", needH, ", winChrome mis-detected?) — auto-fit disabled to avoid freeze"); }
        } else { _fitStallInner = afterInner; _fitStallCount = 1; }
      } else { _fitStallInner = 0; _fitStallCount = 0; }
    }

    // (诊断可见覆盖条已移除——问题定位完成。_fitDbg 保留为空实现，调用点暂留，后续可清。)
    function _fitDbg(_msg) { /* no-op */ }

    // setSize 实际调用(3 路径)。h 是【传给 setSize 的目标值】(调用方负责加 offset 补偿)。
    let _setSizeOkLogged = false;
    async function doSetSizeRaw(cw, w, h) {
      const log = typeof console !== "undefined" ? console : null;
      const Ctor = getLogicalSizeCtor();
      if (Ctor) { try { await cw.setSize(new Ctor(w, h)); if (!_setSizeOkLogged && log) { log.info("[AI panel] setSize OK via LogicalSize"); _setSizeOkLogged = true; } return "ok:LogicalSize"; } catch (e) { if (log) log.warn("[AI panel] setSize(LogicalSize) failed:", e); } }
      try { await invoke("plugin:window|set_size", { label: cw.label, value: { Logical: { width: w, height: h } } }); if (!_setSizeOkLogged && log) { log.info("[AI panel] setSize OK via invoke-Logical"); _setSizeOkLogged = true; } return "ok:invoke-Logical"; } catch (e) { if (log) log.warn("[AI panel] invoke set_size(Logical) failed:", e); }
      const dpr = window.devicePixelRatio || 1;
      try { await invoke("plugin:window|set_size", { label: cw.label, value: { Physical: { width: Math.round(w * dpr), height: Math.round(h * dpr) } } }); if (!_setSizeOkLogged && log) { log.info("[AI panel] setSize OK via invoke-Physical"); _setSizeOkLogged = true; } return "ok:invoke-Physical"; } catch (e) { if (log) log.warn("[AI panel] invoke set_size(Physical) failed:", e); }
      return "FAIL";
    }
    // Tauri setSize/setMinSize 实测让 webview 内尺寸 = 目标 − offset(标题栏 ~32px；outerSize/innerSize 都报 webview 测不出)。
    // ensureChrome 用锁探测一次(setSize(当前+80)→等3帧→读 innerHeight→offset)，避免并发探测竞态(曾测成 0 覆盖 32)。
    let winChrome = -1, _chromeP = null;
    function ensureChrome(cw) {
      if (winChrome >= 0) return Promise.resolve();
      if (_chromeP) return _chromeP;
      _chromeP = (async () => {
        const w0 = Math.round(window.innerWidth), h0 = window.innerHeight;
        try {
          await doSetSizeRaw(cw, w0, h0 + 80);                         // 探测：撑大 80
          // BUG-154：3 帧 rAF 加超时兜底——Windows WebView2 渲染卡住时 rAF 可能迟迟不回调，
          // 导致 ensureChrome 永久 pending → setWinSize/maybeFitWindow 整条链卡死。500ms 等不到就用默认 offset。
          await Promise.race([
            new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))),
            new Promise(r => setTimeout(r, 500)),
          ]);
        } catch (_) {}
        const inner1 = window.innerHeight;
        // 探测成功(inner1>h0=撑大生效)用实测 offset；失败/超时(inner1≤h0)→用平台默认 chrome(32≈Windows/macOS 标题栏)而非 0。
        // 用 0 会让 setWinSize 按 needH 设、但 Tauri setSize 是外尺寸语义(inner=needH-标题栏)→inner 永远 <needH→maybeFitWindow
        // 永远判 grow→无限 setSize 死循环淹没主线程→AI 窗白屏卡死(BUG-154 根因)。默认 32 让多数情况一次到位；残余偏差由
        // maybeFitWindow 的收敛兜底(_fitGiveUp)兜底。macOS 探测通常成功(WKWebView rAF 及时)，此分支极少走到。
        winChrome = (inner1 > h0) ? Math.max(0, (h0 + 80) - inner1) : 32;
        if (typeof console !== "undefined") console.info("[AI panel] setSize/min offset measured =", winChrome, "(probe", h0 + 80, "→ inner", inner1, ")");
      })();
      return _chromeP;
    }
    // setSize 包装：加 offset，让 webview 内尺寸 = h。
    async function setWinSize(cw, w, h) {
      await ensureChrome(cw);
      return await doSetSizeRaw(cw, w, Math.round(h + Math.max(0, winChrome)));
    }
    // setMinSize 包装：同样加 offset(set_min_size 也是外尺寸语义)，让最小内尺寸 = h。
    async function setWinMinSize(cw, w, h) {
      await ensureChrome(cw);
      const off = Math.max(0, winChrome), hh = Math.round(h + off);
      const Ctor = getLogicalSizeCtor();
      if (Ctor && typeof cw.setMinSize === "function") {
        try { await cw.setMinSize(new Ctor(w, hh)); return; } catch (e) { if (typeof console !== "undefined") console.warn("[AI panel] setMinSize failed:", e); }
      }
      try { await invoke("plugin:window|set_min_size", { label: cw.label, value: { Logical: { width: w, height: hh } } }); return; } catch (e) { if (typeof console !== "undefined") console.warn("[AI panel] invoke set_min_size failed:", e); }
    }

    function openPop(rangeOverride) {
      if (curViewMode === "preview") { toast(t("aiPreviewOnly")); return; }
      if (!hasCfg()) { toast(t("aiNotConfigured")); openSettings(); return; }
      // 优先用传入范围（右键捕获）；否则取编辑区当前选区/光标。有选区→改写该选区；无选区→光标处插入。
      const r = (rangeOverride && rangeOverride.start !== rangeOverride.end)
        ? rangeOverride
        : { start: editor.selectionStart, end: editor.selectionEnd };
      if (r.start !== r.end) {
        selRange = { start: r.start, end: r.end }; cursorPos = 0;
        origSelText = editor.value.slice(r.start, r.end);
      } else {
        selRange = null; cursorPos = r.start; origSelText = "";
      }
      // 重置多轮对话状态
      messages = []; editText = origSelText; acc = ""; job = null;
      routeMode = "unknown"; curInstruction = ""; curBubble = null;
      editHistory = []; editFuture = []; editViewMode = "diff";
      pop.hidden = false;
      const inp = $("ai-input"); inp.value = "";
      $("ai-chat").innerHTML = "";
      renderEditZone();
      setBar({ send: true, discard: false });
      setStatus(""); // 不再在头部显示提示；输入框 placeholder 仍由 aiPh 提供
      buildAiSel();
      placePop();
      const _an = $("ai-active-name"); if (_an) _an.textContent = currentApiLabel();
      inp.focus();
    }
    function closePop() {
      if (job && !testing) { invoke("ai_cancel", { jobId: job }).catch(() => {}); }
      job = null; acc = ""; selRange = null; curInstruction = ""; curBubble = null; routeMode = "unknown";
      if (isAiPanelWindow) {
        // 独立窗口：× / Esc → 关闭整个 OS 窗口（后端 Destroyed 清理 pending）
        try {
          const wm = T.window || (T.webviewWindow || {});
          const cw = wm.getCurrentWindow ? wm.getCurrentWindow() : (wm.getCurrentWebviewWindow ? wm.getCurrentWebviewWindow() : null);
          if (cw && cw.close) { cw.close(); return; }
        } catch (_) {}
      }
      if (typeof renderEditorHighlight === "function") renderEditorHighlight(); // 清掉 hl 里的 AI 选区 mark（无搜索则置空）
      if (cm && setAiSel) cm.dispatch({ effects: setAiSel.of(null) }); // 清 AI 选区/光标可视化（CM Decoration）
      try { const _c = editor.selectionEnd; editor.setSelectionRange(_c, _c); } catch (_) {} // AI 结束→折叠选区，清除"处理中"高亮
      pop.hidden = true;
    }

    // 主窗口：打开/聚焦 AI 独立窗口（Tauri，单例由后端 open_ai_panel 保证）；浏览器降级走页内 openPop。
    async function openAiPanelWindow(rangeOverride) {
      if (curViewMode === "preview") { toast(t("aiPreviewOnly")); return; }
      if (!hasCfg()) { toast(t("aiNotConfigured")); openSettings(); return; }
      const r = (rangeOverride && rangeOverride.start !== rangeOverride.end)
        ? rangeOverride
        : { start: editor.selectionStart, end: editor.selectionEnd };
      // 设 selRange/cursorPos 并画标记到主窗口 hl——AI 独立窗口打开后编辑器失焦、原生 caret 消失，
      // 用 hl 上的标记(选区高亮 / 光标闪烁竖线)让用户看清 AI 将改写/插入的位置。
      if (r.start !== r.end) { selRange = { start: r.start, end: r.end }; cursorPos = 0; }
      else { selRange = null; cursorPos = r.start; }
      buildAiSel();
      let payload;
      if (r.start !== r.end) {
        const v = editor.value;
        payload = { start: r.start, end: r.end, selText: v.slice(r.start, r.end),
          ctxBefore: v.slice(Math.max(0, r.start - 600), r.start), ctxAfter: v.slice(r.end, r.end + 600) };
      } else { payload = { cursorPos: r.start, ctxBefore: "", ctxAfter: "" }; }
      try { await invoke("open_ai_panel", { payload: JSON.stringify(payload), dark: document.documentElement.classList.contains("dark") }); }
      catch (e) { toast(t("aiErrPrefix") + String(e)); }
    }
    // 统一入口：AI 窗口内 no-op；Tauri 主窗口 → 独立窗口；浏览器/dev → 页内浮层。
    function openAiEntryPoint(rangeOverride) {
      if (isAiPanelWindow) return;
      if (isTauri) openAiPanelWindow(rangeOverride);
      else openPop(rangeOverride);
    }

    async function send() {
      const instruction = $("ai-input").value.trim();
      if (!instruction) return;
      $("ai-input").value = ""; relayout();   // 新一轮：B2 清空→重排(面板 B1+B2 / 页内 B2)
      curInstruction = instruction;
      appendChat("user", instruction);
      onBContentChange();   // 用户消息入对话区→B1c 变→重排+按需撑高
      acc = ""; routeMode = "unknown"; curBubble = null; job = "ai-" + (++jobSeq);
      setBar({ send: false, discard: true });
      setStatus(t("aiThinking"));
      const c = cfg();
      let ctxBefore, ctxAfter;
      if (isAiPanelWindow) { ctxBefore = selRange ? aiCtxBefore : ""; ctxAfter = selRange ? aiCtxAfter : ""; }
      else {
        const v = editor.value;
        ctxBefore = selRange ? v.slice(Math.max(0, selRange.start - 600), selRange.start) : "";
        ctxAfter = selRange ? v.slice(selRange.end, selRange.end + 600) : "";
      }
      try {
        await invoke("ai_rewrite", {
          jobId: job, provider: c.provider, endpoint: c.endpoint, apiKey: c.key, model: c.model, temperature: c.temp,
          selected: editText, instruction, contextBefore: ctxBefore, contextAfter: ctxAfter, history: messages,
        });
      } catch (err) {
        setStatus(t("aiErrPrefix") + String(err));
        setBar({ send: true, discard: true });
      }
    }

    // 词级 diff（Latin 按词、CJK 按字），改写模式用来高亮修改处
    const aiTok = (s) => s.match(/\s+|[A-Za-z0-9]+|[一-鿿　-〿＀-￯]|./gu) || [];
    function aiDiff(a, b) {
      const A = aiTok(a), B = aiTok(b), m = A.length, n = B.length;
      const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
      for (let i = m - 1; i >= 0; i--)
        for (let j = n - 1; j >= 0; j--)
          dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      const out = [];
      let i = 0, j = 0;
      while (i < m && j < n) {
        if (A[i] === B[j]) { out.push({ t: "eq", v: A[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", v: A[i] }); i++; }
        else { out.push({ t: "ins", v: B[j] }); j++; }
      }
      while (i < m) out.push({ t: "del", v: A[i++] });
      while (j < n) out.push({ t: "ins", v: B[j++] });
      return out;
    }
    function renderDiff(d) {
      let h = "";
      for (const x of d) {
        const v = aiEsc(x.v);
        h += x.t === "ins" ? "<ins>" + v + "</ins>" : x.t === "del" ? "<del>" + v + "</del>" : v;
      }
      return h;
    }

    // 应用到文档：替换原选区（一次 AI 编辑 = 一次 ⌘Z 撤销）
    function applyResult() {
      if (!selRange || !editText) return;
      if (isAiPanelWindow) {
        invoke("apply_ai_edit", { payload: JSON.stringify({ kind: "apply", start: selRange.start, end: selRange.end, newText: editText }) });
        toast(t("aiApplied"));
        editHistory = []; editFuture = []; editText = ""; selRange = null; origSelText = "";
        renderEditZone(); setStatus("");
        return;
      }
      const s = selRange.start, e = selRange.end, text = editText;
      undoStack.push({ v: editor.value, s, e });
      if (undoStack.length > 500) undoStack.shift();
      try { trimUndoBytes(undoStack); } catch (_) {}
      redoStack = [];
      editor.value = editor.value.slice(0, s) + text + editor.value.slice(e);
      undoLast = { v: editor.value, s, e: s + text.length };
      editor.setSelectionRange(s, s + text.length);
      editor.focus(); scheduleRender();
      closePop(); toast(t("aiApplied"));
    }
    // 在光标处插入（无选区模式）
    function insertResult() {
      if (!editText) return;
      if (isAiPanelWindow) {
        invoke("apply_ai_edit", { payload: JSON.stringify({ kind: "insert", pos: cursorPos, text: editText }) });
        toast(t("aiApplied"));
        editHistory = []; editFuture = []; editText = ""; renderEditZone(); setStatus("");
        return;
      }
      const p = cursorPos, text = editText;
      undoStack.push({ v: editor.value, s: p, e: p });
      if (undoStack.length > 500) undoStack.shift();
      try { trimUndoBytes(undoStack); } catch (_) {}
      redoStack = [];
      editor.value = editor.value.slice(0, p) + text + editor.value.slice(p);
      undoLast = { v: editor.value, s: p, e: p + text.length };
      editor.setSelectionRange(p, p + text.length);
      editor.focus(); scheduleRender();
      closePop(); toast(t("aiApplied"));
    }

    // —— 流式事件（按 job_id 过滤；testing 时只累积 acc 不动浮层 UI）——
    // 路由：累积前 5 字符判断是否 EDIT: 前缀 → edit(进编辑区，实时 diff) 或 chat(进对话区气泡)
    function onToken(ev) {
      const p = ev && ev.payload; if (!p || p.job_id !== job) return;
      acc += p.delta || "";
      if (testing) return;
      if (routeMode === "unknown") {
        if (acc.length < 5 && "EDIT:".startsWith(acc)) return;          // 还可能是 EDIT:，静默缓冲
        routeMode = acc.startsWith("EDIT:") ? "edit" : "chat";
        if (routeMode === "edit") { editHistory.push(editText); editFuture = []; } // 改写前状态入回退栈
      }
      if (routeMode === "edit") {
        editText = acc.slice(5).replace(/^\n/, "");
        renderEditZone();
        setStatus(t("aiThinking"));
      } else {
        if (!curBubble) curBubble = appendChat("assistant", "");
        curBubble.textContent = acc;
        setStatus("");
        scheduleFit();   // 流式输出 B1 逐渐增高→rAF 节流让窗口随之长(到 10 行止，之后 chat 内部滚动)
      }
    }
    async function onDone(ev) {
      const p = ev && ev.payload; if (!p || p.job_id !== job) return;
      if (testing) { testing = false; return; }
      // 入历史（本轮 user + assistant 原文，assistant 含 EDIT: 前缀）
      if (curInstruction) {
        messages.push({ role: "user", content: curInstruction });
        messages.push({ role: "assistant", content: acc });
      }
      if (!acc.trim()) appendChat("assistant", t("aiEmptyResult"), true);
      else if (routeMode === "edit") appendChat("assistant", t("aiEditedNote"), true); // 改写类在对话区记一笔
      else if (routeMode === "chat" && curBubble) { await renderMdInto(curBubble, acc); addEditBtn(curBubble, acc); } // 问答回复渲染 markdown（含 mermaid）+ 可一键搬进编辑区
      curInstruction = ""; curBubble = null;
      setStatus("");
      setBar({ send: true, discard: true });
      onBContentChange();   // 回复完成→B1c 变(含 chat 路由 renderMdInto 渲染)→重排+按需撑高
    }
    function onCancelled(ev) {
      const p = ev && ev.payload; if (!p || p.job_id !== job) return;
      if (testing) { testing = false; return; }
      curInstruction = ""; curBubble = null;
      setStatus(t("aiCancelled"));
      setBar({ send: true, discard: true });
    }
    function onError(ev) {
      const p = ev && ev.payload; if (!p || p.job_id !== job) return;
      if (testing) { testing = false; toast(t("aiTestFail") + (p.message || "")); return; }
      curInstruction = ""; curBubble = null;
      setStatus(t("aiErrPrefix") + (p.message || ""));
      setBar({ send: true, discard: true });
    }

    // —— 设置面板 ——
    function openSettings() {
      migrateIfNeeded();
      const a = loadPresets();
      if (!a.length) { editingId = null; clearForm(); renderPresetList(); }
      else {
        const aid = getActiveId();
        if (!aid || !findPreset(aid)) selectPreset(a[0].id);
        else selectPreset(aid);
      }
      $("ai-settings-mask").hidden = false;
    }
    function closeSettings() { $("ai-settings-mask").hidden = true; }

    // —— 预设列表（多 API 切换，v2.1.0）——
    // md-ai-presets: [{id,name,provider,endpoint,model,temp,key}]；md-ai-active: 当前激活 id。
    // md-ai-* 5 key 仍是“当前在用配置”镜像，cfg()/ai_rewrite 零改动；切换/保存预设时同步镜像。
    const PRESETS_KEY = "md-ai-presets", ACTIVE_KEY = "md-ai-active";
    function pid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function loadPresets() {
      try { const a = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); return Array.isArray(a) ? a : []; }
      catch (_) { return []; }
    }
    function savePresets(a) { localStorage.setItem(PRESETS_KEY, JSON.stringify(a || [])); }
    function getActiveId() { return localStorage.getItem(ACTIVE_KEY) || null; }
    function setActiveId(id) { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); }
    function findPreset(id) { return id ? loadPresets().find(p => p.id === id) || null : null; }
    function currentApiLabel() { // 浮层头部展示的“当前 API”：优先激活预设名，降级用 model/endpoint
      const p = findPreset(getActiveId());
      if (p && p.name) return p.name;
      const c = cfg();
      return c.model || c.endpoint || "";
    }
    function syncMirror(p) { // 把预设字段写回 md-ai-* 镜像，使 cfg() 立即反映所选 API
      if (!p) return;
      localStorage.setItem("md-ai-provider", p.provider || "openai");
      localStorage.setItem("md-ai-endpoint", (p.endpoint || "").trim());
      localStorage.setItem("md-ai-model", (p.model || "").trim());
      localStorage.setItem("md-ai-temp", String(isNaN(p.temp) ? 0.7 : Math.max(0, Math.min(2, p.temp))));
      localStorage.setItem("md-ai-key", p.key || "");
    }
    // 老用户迁移：首次开设置时若无预设、但有旧 md-ai-endpoint，把当前 cfg() 导为「默认」预设
    function migrateIfNeeded() {
      let presets = loadPresets();
      if (!presets.length) {
        // 新装：默认两个预设（均不含 key，用户自行填入）：OpenAI + deepseek（都用 OpenAI 兼容接口）。
        // ai_rewrite 自动拼 {endpoint}/chat/completions → OpenAI base 含 /v1，deepseek base 用根域。
        const cur = cfg();
        const openai = { id: pid(), name: "OpenAI", provider: "openai",
          endpoint: cur.endpoint || "https://api.openai.com/v1",
          model: cur.model || "gpt-4o-mini", temp: isNaN(cur.temp) ? 0.7 : cur.temp, key: cur.key || "" };
        const deepseek = { id: pid(), name: "deepseek", provider: "openai",
          endpoint: "https://api.deepseek.com", model: "deepseek-v4-flash", temp: 0.7, key: "" };
        savePresets([openai, deepseek]); setActiveId(openai.id);
        syncMirror(openai);
        return;
      }
      // 老用户迁移（幂等——已有对应预设则不动，故每次 openSettings 跑也安全）：
      // ① 只有一个、未填 key、名字仍是「默认」(任一语言翻译) → 视为未改动：改名 OpenAI + 补 deepseek
      // ② 否则（已填 key 或多个预设=已配置过 API）→ 缺 OpenAI 补 OpenAI、缺 deepseek 补 deepseek，不动用户已有
      const DEFAULT_NAMES = new Set(Object.values(I18N).map((l) => l && l.aiPresetDefault).filter(Boolean));
      const p0 = presets[0];
      const onlyDefault = presets.length === 1 && DEFAULT_NAMES.has(p0.name) && !(p0.key && String(p0.key).trim());
      const mkOpenAI = () => ({ id: pid(), name: "OpenAI", provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", temp: 0.7, key: "" });
      const mkDeepseek = () => ({ id: pid(), name: "deepseek", provider: "openai", endpoint: "https://api.deepseek.com", model: "deepseek-v4-flash", temp: 0.7, key: "" });
      let changed = false;
      if (onlyDefault) {
        p0.name = "OpenAI"; p0.provider = p0.provider || "openai";
        if (!p0.endpoint) p0.endpoint = "https://api.openai.com/v1";
        if (!p0.model) p0.model = "gpt-4o-mini";
        presets.push(mkDeepseek());
        changed = true;
      } else {
        const hasAI = (name, dom) => presets.some((p) => p.name === name || (p.endpoint || "").includes(dom));
        if (!hasAI("OpenAI", "openai.com")) { presets.push(mkOpenAI()); changed = true; }
        if (!hasAI("deepseek", "deepseek.com")) { presets.push(mkDeepseek()); changed = true; }
      }
      if (changed) savePresets(presets);
    }
    function renderPresetList() {
      const list = $("ai-preset-list"); if (!list) return;
      const a = loadPresets(), aid = getActiveId();
      list.innerHTML = "";
      a.forEach(p => {
        const el = document.createElement("div");
        el.className = "ai-preset-item" + (p.id === aid ? " active" : "");
        el.textContent = p.name || t("aiPresetDefault");
        el.title = p.name || ""; el.dataset.id = p.id;
        list.appendChild(el);
      });
    }
    function fillForm(p) {
      $("ai-set-name").value = (p && p.name) || "";
      $("ai-set-provider").value = (p && p.provider) || "openai";
      $("ai-set-endpoint").value = (p && p.endpoint) || "";
      $("ai-set-model").value = (p && p.model) || "";
      $("ai-set-temp").value = (p && p.temp != null) ? p.temp : 0.7;
      $("ai-set-key").value = (p && p.key) || "";
    }
    function clearForm() { fillForm(null); }
    function selectPreset(id) {            // 选中 = 设为 active + 填表单 + 同步镜像（选哪个用哪个）
      const p = findPreset(id); if (!p) return;
      setActiveId(id); editingId = id; fillForm(p); syncMirror(p); renderPresetList();
    }
    function newPreset() {                 // 新建草稿（不改 active，保存时才生效）
      editingId = null; clearForm();
      const list = $("ai-preset-list");
      if (list) list.querySelectorAll(".ai-preset-item.active").forEach(el => el.classList.remove("active"));
      $("ai-set-name").focus();
    }
    function commitFormToActive() {        // 保存：写回当前编辑预设（或新建），设为 active 并同步镜像
      const name = $("ai-set-name").value.trim() || t("aiPresetDefault");
      const provider = $("ai-set-provider").value;
      const endpoint = $("ai-set-endpoint").value.trim();
      const model = $("ai-set-model").value.trim();
      const tp = parseFloat($("ai-set-temp").value);
      const temp = isNaN(tp) ? 0.7 : Math.max(0, Math.min(2, tp));
      const key = $("ai-set-key").value;
      const a = loadPresets();
      if (editingId) {
        const p = a.find(x => x.id === editingId);
        if (p) { p.name = name; p.provider = provider; p.endpoint = endpoint; p.model = model; p.temp = temp; p.key = key; }
      } else {
        const p = { id: pid(), name, provider, endpoint, model, temp, key };
        a.push(p); editingId = p.id;
      }
      savePresets(a); setActiveId(editingId);
      syncMirror({ provider, endpoint, model, temp, key });
    }
    function deletePreset() {
      const a = loadPresets();
      const id = editingId || getActiveId();
      if (!id) return;
      const idx = a.findIndex(x => x.id === id);
      if (idx < 0) return;
      a.splice(idx, 1); savePresets(a);
      if (a.length) selectPreset(a[Math.min(idx, a.length - 1)].id); // 切到相邻项（同步 active+镜像+表单+列表）
      else { setActiveId(null); editingId = null; clearForm(); renderPresetList(); }
    }

    function saveSettings() {
      commitFormToActive();
      renderPresetList();
      closeSettings();
      toast(t("saved"));
    }
    async function testConn() {
      const endpoint = $("ai-set-endpoint").value.trim();
      const model = $("ai-set-model").value.trim();
      const key = $("ai-set-key").value;
      const provider = $("ai-set-provider").value;
      if (!endpoint || !model || !key) { toast(t("aiTestFillFirst")); return; }
      const tb = $("ai-test-btn");
      tb.disabled = true; tb.textContent = t("aiTesting");
      testing = true; acc = ""; job = "ai-test-" + (++jobSeq);
      try {
        await invoke("ai_rewrite", {
          jobId: job, provider, history: [], endpoint, apiKey: key, model, temperature: 0,
          selected: "hello", instruction: "Reply with exactly: ok", contextBefore: "", contextAfter: "",
        });
        toast(acc.trim() ? t("aiTestOk") : t("aiTestEmpty"));
      } catch (err) {
        toast(t("aiTestFail") + String(err));
      } finally {
        testing = false; job = null; acc = "";
        tb.disabled = false; tb.textContent = t("aiTest");
      }
    }

    // —— 绑定（DOM 已就绪：本脚本在 body 末尾内联执行）——
    const rb = document.querySelector('[data-act="ai-rewrite"]');
    if (rb) rb.addEventListener("click", () => openAiEntryPoint());
    $("ai-pop-close").addEventListener("click", closePop); // 右上角 × 关闭（底部「关闭」已移除）
    $("ai-send").addEventListener("click", send);
    $("ai-apply").addEventListener("click", applyResult);
    $("ai-insert").addEventListener("click", insertResult);
    $("ai-edit-undo").addEventListener("click", undoEdit);
    $("ai-edit-redo").addEventListener("click", redoEdit);
    $("ai-edit-view").addEventListener("click", () => { editViewMode = (editViewMode === "render") ? "diff" : "render"; renderEditZone(); });
    // 「关闭」按钮已移除；关闭走右上角 × 或 Esc。
    // 浮层可拖动：原顶部头部行已移除，改按住「编辑区标签条」拖动定位（点其上按钮不触发拖动），并夹在视口内
    const popHead = pop.querySelector("#ai-edit-zone .ai-zone-label");
    if (popHead) {
      popHead.style.cursor = "move";
      let dragging = false, ox = 0, oy = 0;
      popHead.addEventListener("mousedown", (e) => {
        if (e.target.closest("button")) return;          // 标签上的按钮（回退/前进/渲染/应用/插入）不触发拖动
        if (isAiPanelWindow) {
          // 独立窗口：拖动整个 OS 窗口（startDragging，权限 core:window:allow-start-dragging 已在）
          try {
            const wm = T.window || (T.webviewWindow || {});
            const cw = wm.getCurrentWindow ? wm.getCurrentWindow() : (wm.getCurrentWebviewWindow ? wm.getCurrentWebviewWindow() : null);
            if (cw && cw.startDragging) { e.preventDefault(); cw.startDragging(); }
          } catch (_) {}
          return;
        }
        dragging = true;
        const pr = pop.getBoundingClientRect();
        ox = e.clientX - pr.left; oy = e.clientY - pr.top;
        e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const nl = Math.max(0, Math.min(e.clientX - ox, vw - 40));   // 至少留 40px 可见
        const nt = Math.max(0, Math.min(e.clientY - oy, vh - 40));
        pop.style.left = nl + "px";
        pop.style.top = nt + "px";
      });
      document.addEventListener("mouseup", () => { dragging = false; });
    }

    $("ai-settings-cancel").addEventListener("click", closeSettings);
    $("ai-settings-save").addEventListener("click", saveSettings);
    $("ai-preset-new").addEventListener("click", newPreset);
    $("ai-preset-list").addEventListener("click", (e) => {
      const it = e.target.closest(".ai-preset-item");
      if (it) selectPreset(it.dataset.id);
    });
    // 删除：二次确认（首次点击变红“确认删除?”，3s 内再点才真删）——避免原生 confirm()（BUG-006）
    $("ai-preset-delete").addEventListener("click", () => {
      const btn = $("ai-preset-delete");
      if (!btn.classList.contains("confirming")) {
        btn.classList.add("confirming"); btn.textContent = t("aiPresetConfirmDelete");
        clearTimeout(deleteConfirmTimer);
        deleteConfirmTimer = setTimeout(() => { btn.classList.remove("confirming"); btn.textContent = t("aiPresetDelete"); }, 3000);
      } else {
        clearTimeout(deleteConfirmTimer);
        btn.classList.remove("confirming"); btn.textContent = t("aiPresetDelete");
        deletePreset();
      }
    });
    $("ai-test-btn").addEventListener("click", testConn);
    $("ai-settings-mask").addEventListener("click", (e) => { if (e.target === $("ai-settings-mask")) closeSettings(); });
    // 指令框：Enter 发送 / Esc 关闭
    $("ai-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
      else if (e.key === "Escape") { e.preventDefault(); closePop(); }
    });
    // 输入框随内容变化：页内模式仅 B2 内容驱动增高；面板模式走 onBContentChange(layoutB 重分配 B1+B2 + 按需撑高窗口)
    $("ai-input").addEventListener("input", () => { onBContentChange(); });
    // 面板模式 B1/B2 由 layoutB(ResizeObserver 驱动)分配；页内模式仍走纯 CSS flex。均不在 resize 回调里 setSize(BUG-130)
    // 点对话框(chat/状态/输入行)任意位置 → 聚焦输入框并把光标置末尾，不必精确点到 textarea 本身；
    // 不阻止默认行为，保留对 AI 回复文字的正常选中复制。
    const dlg = pop.querySelector(".ai-dialog");
    if (dlg) dlg.addEventListener("mousedown", (e) => {
      if (e.target.id === "ai-input" || e.target.closest("#ai-send")) return; // 点输入框/发送按钮自身不重复处理
      const inp = $("ai-input");
      // preventDefault 必需：WebKit 点 div(chat) 时 mousedown 默认会把焦点转到 body，覆盖 inp.focus()。
      // 代价是 chat 内文字无法用鼠标选中（点击只为聚焦输入框）；如需复制可改用键盘或后续加精细判断。
      if (inp) { e.preventDefault(); inp.focus(); const v = inp.value || ""; inp.setSelectionRange(v.length, v.length); }
    });
    // 编辑器：Cmd/Ctrl+I 开关浮层；Esc 关闭
    editor.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "j") { e.preventDefault(); openAiEntryPoint(); }
      else if (e.key === "Escape" && !pop.hidden) { e.preventDefault(); closePop(); }
    });
    // 右键迷你菜单（有选区才弹，仅 AI 改写；无选区不拦截，保留原生复制/粘贴）
    const ctx = $("ai-ctx");
    const showCtx = (x, y) => { ctx.style.left = x + "px"; ctx.style.top = y + "px"; ctx.hidden = false; };
    const hideCtx = () => { ctx.hidden = true; };
    // 滚动编辑区（含拖滚动条）只收起右键菜单，【不关浮层】——浮层 position:fixed 保持在原位、可拖动。
    // （此前 mousedown→closePop 会因拖滚动条误关浮层。）
    editor.addEventListener("scroll", () => { hideCtx(); });
    editor.addEventListener("contextmenu", (e) => {
      if (editor.selectionStart !== editor.selectionEnd) {
        pendingRange = { start: editor.selectionStart, end: editor.selectionEnd }; // 失焦前先捕获完整选区
        e.preventDefault();
        showCtx(e.clientX, e.clientY);
      }
    });
    $("ai-ctx-item").addEventListener("click", () => { hideCtx(); openAiEntryPoint(pendingRange); });
    document.addEventListener("mousedown", (e) => { if (!ctx.hidden && !ctx.contains(e.target)) hideCtx(); });
    window.addEventListener("blur", hideCtx);
    // Esc 关闭设置面板
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("ai-settings-mask").hidden) closeSettings(); });

    // Tauri 事件：流式 token / 结束 / 取消 / 出错
    if (T && T.event && T.event.listen) {
      T.event.listen("ai-token", onToken);
      T.event.listen("ai-done", onDone);
      T.event.listen("ai-cancelled", onCancelled);
      T.event.listen("ai-error", onError);
      // 原生菜单「AI 设置」→ 打开设置面板（handleMenu 不识别此 id，由本模块自行处理）
      T.event.listen("menu-action", (e) => { if (String(e && e.payload) === "ai-settings") openSettings(); });
      // 主窗口模式：接收 AI 独立窗口点"应用/插入"的请求，写回 editor（复用 applyResult/insertResult 的 editor 操作）
      if (!isAiPanelWindow) {
        // AI 辅助窗口关闭 → 清掉 hl 上的选区/光标标记(防残留)
        T.event.listen("ai-panel-closed", () => {
          if (typeof renderEditorHighlight === "function") renderEditorHighlight();
          if (cm && setAiSel) cm.dispatch({ effects: setAiSel.of(null) }); // 清 AI 选区/光标可视化（CM Decoration）
        });
        T.event.listen("apply-ai-edit", (e) => {
          let d = null; try { d = JSON.parse(String(e && e.payload)); } catch (_) {}
          if (!d || typeof d !== "object") return;
          if (d.kind === "apply" && typeof d.start === "number" && typeof d.end === "number") {
            const s = d.start, en = d.end, text = String(d.newText != null ? d.newText : "");
            undoStack.push({ v: editor.value, s, e: en });
            if (undoStack.length > 500) undoStack.shift();
            try { trimUndoBytes(undoStack); } catch (_) {}
            redoStack = [];
            editor.value = editor.value.slice(0, s) + text + editor.value.slice(en);
            undoLast = { v: editor.value, s, e: s + text.length };
            editor.setSelectionRange(s, s + text.length);
            editor.focus(); scheduleRender();
            toast(t("aiApplied"));
          } else if (d.kind === "insert" && typeof d.pos === "number") {
            const p = d.pos, text = String(d.text != null ? d.text : "");
            undoStack.push({ v: editor.value, s: p, e: p });
            if (undoStack.length > 500) undoStack.shift();
            try { trimUndoBytes(undoStack); } catch (_) {}
            redoStack = [];
            editor.value = editor.value.slice(0, p) + text + editor.value.slice(p);
            undoLast = { v: editor.value, s: p, e: p + text.length };
            editor.setSelectionRange(p, p + text.length);
            editor.focus(); scheduleRender();
            toast(t("aiApplied"));
          }
        });
      }
      // AI 独立窗口模式：启动时取选区数据初始化浮层 + 监听主窗口推来的新选区（单例聚焦时更新）
      if (isAiPanelWindow) {
        // #ai-pop 原嵌套在 .main>.editor-area 内，html.ai-panel-win 隐藏 .main 会连它一起 display:none
        // （position:fixed 能逃逸 overflow 裁剪，但逃不掉祖先 display:none）→ 故先 reparent 到 body。
        if (pop.parentElement && pop.parentElement !== document.body) document.body.appendChild(pop);
        // 编辑区↔对话区分隔条：拖动直接改 .ai-edit-body 的 max-height（编辑区可见高度），
        // 内容超出则内部滚动；.ai-dialog(flex:1) 自动吃剩余 → 两区同时变化
        const editZone = $("ai-edit-zone");
        if (editZone) {
          const resizer = document.createElement("div");
          resizer.className = "ai-resizer";
          editZone.after(resizer);
          const rzBody = () => editZone.querySelector(".ai-edit-body");
          let rz = false, sy = 0, sh = 0, startWinH = 0, startEZ = 0;
          resizer.addEventListener("mousedown", (e) => {
            rz = true; sy = e.clientY; const b = rzBody(); sh = b ? b.offsetHeight : 100; startWinH = window.innerHeight; startEZ = editZone ? editZone.offsetHeight : 0; sepDragging = true; e.preventDefault();
          });
          document.addEventListener("mousemove", (e) => {
            if (!rz) return; const b = rzBody(); const delta = e.clientY - sy;
            // 改 body 固定 height（非 max-height，内容不足也能拉高 A）
            if (b) { const h = Math.max(0, sh + delta); b.style.height = h + "px"; b.style.maxHeight = "none"; manualEditH = h; }
            // 窗口跟 A 的【实际】缩放量(读 editZone.offsetHeight，受 edit-body min-height 钳位)，非原始 delta：
            //   否则 A 缩到 min 后窗口仍按 delta 继续缩 → 窗口比 A+B 还小 → B 被下缘遮盖/弹窗消失。
            //   window = startWinH + (newA - startEZ) → dialog = startDialog(恒定) → B 不变。
            const cw = aiWin();
            if (cw && typeof cw.setSize === "function") {
              const newA = editZone ? editZone.offsetHeight : 0;
              progResize = true;
              setWinSize(cw, Math.round(window.innerWidth), Math.round(startWinH + (newA - startEZ))).catch(() => {});
              clearTimeout(sepProgTimer); sepProgTimer = setTimeout(() => { progResize = false; }, 300);
            }
          });
          // 松开分隔条：A 区高度已定 → 更新窗口 min(=新 A+B2 一行) + 贴合
          document.addEventListener("mouseup", () => { if (rz) { rz = false; sepDragging = false; maybeFitWindow(); } });
        }
        document.documentElement.classList.add("ai-panel-win");
        pop.hidden = false;
        // A 区(flex:none)内容会异步增高(diff/mermaid)——初始 maybeFitWindow 可能测偏小。用 RO 监听 A 区，增高时重贴合。
        // 监听 A 区 + 输入行 + 状态行(均为 flex:none/与窗口解耦)，内容/按钮渲染增高时重贴合。
        // 关键(BUG-130)：【绝不监听 dialog】——dialog 现为 flex:1 随窗口变，监听它会在每次 setSize 后重触发→反馈循环。
        if (typeof ResizeObserver !== "undefined") {
          // 用模块级 scheduleFit(rAF 节流)：A 区异步长高/流式 B1 增高时窗口紧跟。
          bResizeObs = new ResizeObserver(scheduleFit);
          const _ez = $("ai-edit-zone"); if (_ez) bResizeObs.observe(_ez);
          const _row = pop.querySelector(".ai-input-row"); if (_row) bResizeObs.observe(_row);   // 发送按钮渲染/输入行高变→重贴合
          const _st = $("ai-status"); if (_st) bResizeObs.observe(_st);                          // 状态行显隐→重贴合
        }
        // 用户手拖 OS 窗口 → 永久关自动贴合。fitArmed 保护期(挂后 1s)：arm 前的 resize(OS 居中/DPI/布局沉淀)不算用户拖动。
        const cw0 = aiWin();
        if (cw0 && typeof cw0.onResized === "function") {
          try { cw0.onResized(() => { if (fitArmed && !progResize) userResized = true; }); } catch (_) {}
        }
        setTimeout(() => { fitArmed = true; }, 1000);   // 保护期结束：此后未由自家 setSize 引起的 resize 才算用户拖动
        // 右键菜单：设为主/取消主 AI 窗口(主窗口跟随新选区替换上下文；非主窗口独立保内容、Ctrl+J 弹新窗)
        pop.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (typeof console !== "undefined") console.info("[AI panel] contextmenu fired at", e.clientX, e.clientY);
          const old = document.getElementById("__aiCtx"); if (old) old.remove();
          // 先弹菜单(不等 invoke)，再异步查状态更新文字
          const m = document.createElement("div"); m.id = "__aiCtx";
          m.style.cssText = "position:fixed;z-index:99999;background:var(--bg-alt);border:1px solid var(--border);border-radius:6px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,.2);font:13px system-ui;min-width:170px;";
          m.style.left = e.clientX + "px"; m.style.top = e.clientY + "px";
          const item = document.createElement("div");
          item.textContent = "设为主AI窗口";
          item.style.cssText = "padding:7px 16px;cursor:pointer;color:var(--fg);";
          item.addEventListener("mouseenter", () => { item.style.background = "var(--bg)"; });
          item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });
          let curMain = false;
          item.addEventListener("click", async () => { m.remove(); await invoke("set_ai_panel_main", { label: winLabel, isMain: !curMain }); });
          m.appendChild(item); document.body.appendChild(m);
          // 异步查状态更新文字(invoke 失败则保持默认"设为")
          invoke("is_ai_panel_main", { label: winLabel }).then((isMain) => { curMain = !!isMain; item.textContent = curMain ? "✓ 主AI窗口（点击取消）" : "设为主AI窗口"; }).catch((e) => { if (typeof console !== "undefined") console.warn("[AI panel] is_ai_panel_main failed:", e); });
          // 点击外部关闭
          setTimeout(() => { const c = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("mousedown", c); } }; document.addEventListener("mousedown", c); }, 0);
        });
        (async () => {
          let data = null;
          try { const raw = await invoke("take_ai_panel_content"); data = raw ? JSON.parse(raw) : null; } catch (_) {}
          if (data) { applyAiPanelData(data); }
          else { renderEditZone(); setBar({ send: true }); setStatus(""); const inp = $("ai-input"); if (inp) inp.focus(); }
          relayout(); maybeFitWindow(true);   // 初始：立即按内容定 A/B 高 + 强制缩回贴合(forceShrink，确保 B1=0，不受 userResized 影响)
        })();
        T.event.listen("ai-panel-payload", (e) => {
          try { applyAiPanelData(JSON.parse(String(e && e.payload))); } catch (_) {}
        });
      }
    }
  })();

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
  // 同步滚动开关（工具栏按钮已移除，由菜单「同步滚动」调用）
  function toggleSync() {
    syncScroll = !syncScroll;
    refreshDynamicLabels();
  }

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
    if (!tab) { editor.value = ""; updateStats(); updateCursor(); return; }
    editor.value = tab.content;
    editor.setSelectionRange(tab.selStart || 0, tab.selEnd || 0);
    resetUndo(); // 切标签→重置撤销/重做栈；必须在载入内容之后，否则 undoLast 基线为空/旧值，
                 // 程序化编辑(如 Ctrl+K 链接)的 pushUndo 会把空基线入栈，Ctrl+Z 把文档清空
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
      '<script>renderMathInElement(document.getElementById("preview"),{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false,trust:false,strict:false});<\/script>\n' +
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
  let lastPvSnapSt = -1; // syncAnchors 预览驱动方向感知防抖：上次 preview 中心(判断前进/后退)
  let lastPreviewH = 0; // 上次预览 scrollHeight；图片/mermaid 等异步渲染改变高度会使 Y 缓存过期 → syncAnchors 检测变化则重测
  let imgLoadT = 0; // 图片 load 后重测 Y 缓存的防抖定时器
  /* ---- 编辑↔预览 双向定位（点击 + 滚动同步）----
     预览侧用"块顶 Y"：非虚拟化时每次渲染测一次缓存（buildPreviewBlockY）；虚拟化时直接用 vprefix
     （虚拟化自维护、滚动时自动校正）。滚动只查缓存、零 DOM 测量 → 丝滑。代码块按行插值。 */
  let previewBlockY = [];
  let fineYCache = []; // 渲染时测的细粒度（块+li/tr）Y 缓存；滚动查它、零 DOM 测量（避免反馈，见 bug 2）
  let editorLineStarts = [0];   // 每个源码行的起始偏移（renderWindow 窗口边界 / lineOfOffset / updateWindowPos 用）
  let editorLH = 23.8;          // 编辑器实际行高（px，renderWindow 算可见行数用）
  let editorFontMeasured = false;
  // 量编辑器行高（隐藏 span，供 renderWindow 算可见行数/窗口大小）。字号取 #editor 当前计算值。
  function measureEditorFont() {
    let m = $("editor-measure");
    const fs = getComputedStyle(editor).fontSize || "14px";
    if (!m) {
      m = document.createElement("span"); m.id = "editor-measure";
      m.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-family:var(--mono);line-height:1.7;";
      document.body.appendChild(m);
    }
    m.style.fontSize = fs;
    m.textContent = Array(11).join("M\n"); editorLH = m.getBoundingClientRect().height / 10 || 23.8;
  }
  // 源码行起始偏移 + 每行折行数（等宽字体确定性：视觉行数=ceil(字数/每行字符数)）
  // 编辑器源码行起点偏移表（供 renderWindow 窗口边界 / lineOfOffset / updateWindowPos 用）。
  // CM 下像素↔偏移由 cm.posAtCoords/coordsAtPos 直接给（editorYToOff/offToEditorY），无需折行估算，
  // 故本函数不再算 visLineStart/editorCharsPerRow 等（旧 textarea 折行估算已随 Phase 4 移除）。
  function computeEditorMap() {
    if (!editorFontMeasured) { measureEditorFont(); editorFontMeasured = true; }
    const v = editor.value;
    const ls = [0]; let i = 0;
    while ((i = v.indexOf("\n", i)) !== -1) ls.push(++i);
    editorLineStarts = ls;
  }
  // 预览块顶 Y：虚拟化用 vprefix（虚拟化自维护），非虚拟化每次渲染测一次（滚动不重测 → 丝滑）
  function pby(i) { const a = vblocks.length ? vprefix : previewBlockY; return a ? (a[i] || 0) : 0; }
  function pbyLen() { const a = vblocks.length ? vprefix : previewBlockY; return a ? a.length : 0; }
  function buildPreviewBlockY() {
    if (vblocks.length) { fineYCache = []; return; }   // 虚拟化：由 vprefix 提供，无需测
    if (winSkel.length && vContent) {                  // 窗口化：由 winPrefix 提供全文，fineYCache 重建自 vContent（含 spacer 偏移）
      winMeasuresFill(); updateWindowSpacers();
      const pvTop = preview.getBoundingClientRect().top, sts = preview.scrollTop, baseY = winPrefixOf(winStart);
      const fine = [];
      const all = vContent.querySelectorAll("[data-src-offset]");
      for (let i = 0; i < all.length; i++) {
        const el = /** @type {HTMLElement} */ (all[i]);
        const o = parseInt(el.getAttribute("data-src-offset") || "", 10);
        if (isNaN(o)) continue;
        const en = parseInt(el.getAttribute("data-src-end") || "", 10);
        const r = el.getBoundingClientRect();
        fine.push({ off: o, end: isNaN(en) ? null : en, top: baseY + (r.top - pvTop + sts), h: r.height });
      }
      fineYCache = fine; previewBlockY = [];
      return;
    }
    if (!srcBlockOffsets.length) { previewBlockY = []; fineYCache = []; return; }
    const pvTop = preview.getBoundingClientRect().top, sts = preview.scrollTop;
    const arr = [], kids = preview.children;
    for (let i = 0; i < kids.length && i < srcBlockOffsets.length; i++) {
      const r = kids[i].getBoundingClientRect();
      arr.push(r.top - pvTop + sts);
    }
    previewBlockY = arr;
    // 细粒度 Y 缓存：所有 data-src-offset 单元（块 + li/tr）的 (off,end,top,h)；滚动查它，零 DOM 测量
    const fine = [];
    const all = preview.querySelectorAll("[data-src-offset]");
    for (let i = 0; i < all.length; i++) {
      const el = /** @type {HTMLElement} */ (all[i]);
      const o = parseInt(el.getAttribute("data-src-offset") || "", 10);
      if (isNaN(o)) continue;
      const en = parseInt(el.getAttribute("data-src-end") || "", 10);
      const r = el.getBoundingClientRect();
      fine.push({ off: o, end: isNaN(en) ? null : en, top: r.top - pvTop + sts, h: r.height });
    }
    fineYCache = fine;
  }
  function blockIsCode(bs) { return editor.value.slice(bs, bs + 3) === "```"; }
  function previewYToOff(y) { // 预览内容 Y → 源偏移（优先 fineYCache 实测细粒度，回退块顶分段线性）
    if (fineYCache.length) {
      let best = null;
      for (let i = 0; i < fineYCache.length; i++) {
        const u = fineYCache[i];
        if (y >= u.top && y < u.top + u.h) {
          if (!best || u.off > best.off || (u.off === best.off && u.end != null && best.end == null)) best = u;
        }
      }
      if (best) {
        const frac = best.h > 0 ? Math.max(0, Math.min(1, (y - best.top) / best.h)) : 0;
        return best.end != null ? Math.round(best.off + frac * (best.end - best.off)) : best.off;
      }
    }
    if (winSkel.length) return winYToOff(y); // 窗口化：fineYCache 未覆盖（窗口外）→ 全文骨架映射
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
  function offToPreviewY(off) { // 源偏移 → 预览内容 Y（优先 fineYCache 实测细粒度，回退块顶+字符比/行比）
    if (winSkel.length) { // 窗口化：窗口外钳到窗口内（vContent 覆盖，走下方 fineYCache/pby 实测），不回退骨架 winOffToY（否则视口落空白 spacer）
      if (off < winStart) off = winStart;
      else if (off > winEnd) off = winEnd;
    } else if (winStart >= 0 && srcBlockOffsets.length) {
      off = Math.max(srcBlockOffsets[0], Math.min(srcBlockOffsets[srcBlockOffsets.length - 1], off)); // 旧窗口钳（无骨架时防越界）
    }
    if (fineYCache.length) {
      let best = null;
      for (let i = 0; i < fineYCache.length; i++) {
        const u = fineYCache[i];
        if (u.off <= off && (u.end == null || off < u.end)) {
          if (!best || u.off > best.off || (u.off === best.off && u.end != null && best.end == null)) best = u;
        }
      }
      if (best) {
        const frac = (best.end != null && best.end > best.off && best.h > 0) ? (off - best.off) / (best.end - best.off) : 0;
        return best.top + frac * best.h;
      }
    }
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
  // 编辑点击→预览：优先 DOM 实测（精确到 li/tr/块顶），回退 offToPreviewY（虚拟化未挂载）。
  // 复用 BUG-057 的 data-src-offset/data-src-end 标记；点击低频，querySelectorAll 一次可接受。
  function previewOffsetToY(off) {
    const all = preview.querySelectorAll("[data-src-offset]");
    let best = null, bestSt = -1;
    for (let i = 0; i < all.length; i++) {
      const el = /** @type {HTMLElement} */ (all[i]);
      const st = parseInt(el.getAttribute("data-src-offset") || "", 10);
      if (isNaN(st) || st > off) continue;
      const en = parseInt(el.getAttribute("data-src-end") || "", 10);
      if (!isNaN(en) && off >= en) continue;
      if (st > bestSt) { bestSt = st; best = el; }   // st 最大 = 最细单元（li/tr 起点比父块靠后）
    }
    if (best) {
      const pvRect = preview.getBoundingClientRect();
      const r = best.getBoundingClientRect();
      let y = r.top - pvRect.top + preview.scrollTop;  // 单元顶的预览内容 Y
      const en = parseInt(best.getAttribute("data-src-end") || "", 10);
      if (!isNaN(en) && en > bestSt && r.height > 0) {  // li/tr：单元内字符比微调（小单元近似线性）
        y += ((off - bestSt) / (en - bestSt)) * r.height;
      }
      return y;
    }
    return offToPreviewY(off);
  }
  // 预览内容 Y → 源偏移（DOM 实测：elementFromPoint 命中该 Y 的最细单元；精确且 cheap）
  function previewYToOffDom(contentY) {
    const pvRect = preview.getBoundingClientRect();
    const viewY = contentY - preview.scrollTop + pvRect.top; // 内容 Y → 视口 Y
    // 水平多点探测：#preview 是 <article> 自带左右 padding，固定 left+8 落 padding → elementFromPoint 命中
    // #preview 自身(无 data-src-offset，closest 向上找祖先也无)→ 全程返 -1 → 回退 previewYToOff(骨架/fineYCache，
    // content 单大块估高抖动)→ editor 跳。改在中/1/4/3/4 探测，越过 padding 命中真实内容块；右 3/4 仍避滚动条。
    const xs = [pvRect.left + pvRect.width / 2, pvRect.left + pvRect.width * 0.25, pvRect.left + pvRect.width * 0.75];
    for (let xi = 0; xi < xs.length; xi++) {
      const el = document.elementFromPoint(xs[xi], viewY);
      if (!el) continue;
      const unit = el.closest("[data-src-offset]");
      if (unit && unit !== preview && preview.contains(unit)) {
        const r = unit.getBoundingClientRect();
        const st = parseInt(unit.getAttribute("data-src-offset") || "", 10);
        if (!isNaN(st)) {
          const en = parseInt(unit.getAttribute("data-src-end") || "", 10);
          const frac = r.height > 0 ? Math.max(0, Math.min(1, (viewY - r.top) / r.height)) : 0;
          return (!isNaN(en) && en > st) ? st + frac * (en - st) : st;
        }
      }
    }
    // 几何回退：块间隙(段落 margin)elementFromPoint 全落空 → 旧返 -1 回退骨架(估高抖→editor 跳)。
    // 实测各 [data-src-offset] 块 Y：含 viewY 的最细块内插值；间隙则上下块跨段线性插值。永不回退骨架，保证 off 单调。
    const all = preview.querySelectorAll("[data-src-offset]");
    let hit = null, above = null, below = null;
    for (let i = 0; i < all.length; i++) {
      const r = all[i].getBoundingClientRect();
      if (r.height <= 0) continue;
      const st = parseInt(all[i].getAttribute("data-src-offset") || "", 10);
      if (isNaN(st)) continue;
      const enRaw = parseInt(all[i].getAttribute("data-src-end") || "", 10);
      const rec = { st, en: (!isNaN(enRaw) && enRaw > st) ? enRaw : null, top: r.top, bot: r.bottom, h: r.height };
      if (viewY >= r.top && viewY < r.bottom) { if (!hit || st > hit.st) hit = rec; }
      else if (r.top <= viewY) { if (!above || r.top > above.top) above = rec; }
      else { if (!below || r.top < below.top) below = rec; }
    }
    if (hit) { const f = hit.h > 0 ? (viewY - hit.top) / hit.h : 0; return hit.en != null ? hit.st + f * (hit.en - hit.st) : hit.st; }
    if (above && below) { const aEnd = above.en != null ? above.en : above.st; const span = below.top - above.bot; const f = span > 0 ? (viewY - above.bot) / span : 0; return aEnd + f * (below.st - aEnd); }
    if (above) return above.en != null ? above.en : above.st;
    if (below) return below.st;
    return -1; // 无任何已挂载块（虚拟化未挂载/空预览）→ 调用方回退
  }
  function editorYToOff(y) { // 编辑器像素 Y → 源偏移（CM：posAtCoords 像素级精确）
    if (!cm) return 0;
    const sd = cm.scrollDOM, rect = sd.getBoundingClientRect();
    const vy = rect.top + (y - sd.scrollTop);
    let pos = cm.posAtCoords({ x: rect.left + 8, y: vy });
    if (pos == null) pos = cm.posAtCoords({ x: rect.left + 30, y: vy }); // 左 padding 内偶发 null -> 试文本区
    return pos == null ? -1 : pos;
  }
  function offToEditorY(off) { // 源偏移 -> 编辑器像素 Y
    if (!cm) return 0;
    const clamped = Math.max(0, Math.min(off, cm.state.doc.length));
    const sd = cm.scrollDOM;
    // lineBlockAt 高度树 Y（单调稳定，已 webkit 实测；屏外也准）：用于交叉校验 coordsAtPos
    let yL = -1;
    if (cm.lineBlockAt) {
      const blk = cm.lineBlockAt(clamped);
      if (blk && isFinite(blk.top)) {
        const frac = (blk.to > blk.from && blk.height > 0) ? (clamped - blk.from) / (blk.to - blk.from) : 0;
        yL = blk.top + frac * blk.height;
      }
    }
    const c = cm.coordsAtPos(clamped);
    if (c) {
      const yC = c.top - sd.getBoundingClientRect().top + sd.scrollTop;
      // coordsAtPos 视口边/行边界偶发非单调 glitch(跳邻行，实测中间帧 +469px=18行)→ editor 先被推高再拉回=跳动。
      // lineBlockAt 校验：偏差≥1 块高(coordsAtPos 落到别的块)取 lineBlockAt；<1 块高(块内一致)取 coordsAtPos 像素精确(保对齐)。
      if (yL >= 0 && Math.abs(yC - yL) >= (cm.lineBlockAt(clamped).height || 26)) return yL;
      return yC;
    }
    // 屏外（coordsAtPos null，CM 仅渲染视口±边距行）：lineBlockAt。旧版返 -1→预览驱动 editor 卡住(BUG-149 过度权衡)。
    // 安全：preview 驱动 scrollSrc="preview" 阻断 editor→preview 反拉；editor 跟到≈preview off，renderWindow 即便 reset 也居中同 off、不错位。
    if (yL >= 0) return yL;
    return -1;
  }
  // 锚点式滚动同步（替换原全局比例）：以各自中线偏移互映射；无锚点时回退比例
  function syncAnchors(src, dst) {
    if (!syncScroll) return;
    if (winRenderActive > 0 && src === editor) return; // 窗口重渲期间冻结 editor→preview：replace vContent 时 previewOffsetToY 用半换 DOM 会错。preview→editor 不冻结：用 previewYToOffDom(实时旧 vContent DOM)+CM lineBlockAt，不依赖 preview 缓存；旧冻结致 renderWindowLazy async parse(~150ms)期间 editor 卡住不跟、preview 继续滚→parse 完成 curOff 大跳→editor 一次性追上=用户感"卡后大跳"。
    // 图片/mermaid/KaTeX 等异步渲染会撑高预览 → fineYCache/previewBlockY 过期（预览偏上、越往后越偏）→ 检测 scrollHeight 变化则重测
    if (preview.scrollHeight !== lastPreviewH) { buildPreviewBlockY(); lastPreviewH = preview.scrollHeight; }
    if (!pbyLen() && !winSkel.length) { // 仅非窗口化且无块才比例回退；窗口化(winSkel 有)走下方锚点同步(vContent 未覆盖 eOff 则不推，绝不回退骨架/比例——否则把视口推到空白 spacer)
      const r = src.scrollTop / (src.scrollHeight - src.clientHeight || 1);
      dst.scrollTop = r * (dst.scrollHeight - dst.clientHeight); return;
    }
    const center = src.scrollTop + src.clientHeight / 2;
    let y = null, eOff = null;
    if (src === editor) {
      eOff = editorYToOff(center); if (eOff < 0) return;
      // posAtCoords 异常校验：cm.lineBlockAtHeight 算视口真实行偏移范围(基于行块树，不依赖 hit-test，比 posAtCoords/
      // coordsAtPos 稳定——后两者 WKWebView 下都走 hit-test，深处可能同时异常使 coordsAtPos 守卫失效)。
      // eOff 出范围(±1 视口余量)→posAtCoords 把中段错映射成偏前/开头 off→previewOffsetToY 命中偏前块→预览跳开头→跳过本帧。
      if (cm && cm.lineBlockAtHeight) {
        const topOff = cm.lineBlockAtHeight(editor.scrollTop).from;
        const botOff = cm.lineBlockAtHeight(editor.scrollTop + editor.clientHeight).from;
        if (eOff < topOff - editor.clientHeight || eOff > botOff + editor.clientHeight) return;
      }
      y = previewOffsetToY(eOff);
    } // 用实时 DOM 实测（同点击路径），而非缓存插值 offToPreviewY（滚动/换窗口期间会失真）
    else {
      // 预览驱动→编辑器：优先实测 DOM 命中(previewYToOffDom，elementFromPoint 精确，不受骨架估高/缓存影响)，回退 previewYToOff(fineYCache/骨架)。
      // 骨架 winYToOff 在 content 大段(纯文本合并 <p>)估高偏差 + winMeasuresFill 把 lexer 切的"部分实测高"错回填给 \n\n 全块→偏→editor 跟到偏前位置被拉回(用户感"跳回")。
      let off = previewYToOffDom(center);
      if (off < 0) {
        if (winRenderActive > 0) return; // 重渲期间滚出旧 vContent→previewYToOff(fineYCache)可能 stale→跳过(editor 保持，下帧 vContent 更新后跟)，不卡后大跳
        off = previewYToOff(center);
      }
      y = offToEditorY(off);
      // offToEditorY：视口内 coordsAtPos 精确；屏外回退 cm.lineBlockAt(高度树，单调稳定)→ editor 始终跟随 preview，不卡。
      // 安全：preview 驱动 scrollSrc="preview" 阻断 editor→preview 反拉；editor 跟到≈preview off，renderWindow 即便 reset 也居中同 off、preview 不错位。
    }
    if (y == null || !isFinite(y) || y < 0) return;
    const max = dst.scrollHeight - dst.clientHeight;
    // 预览驱动→编辑器 方向感知防抖：preview 单向滚动时 editor 目标应同向；深度滚动测量(previewYToOffDom/coordsAtPos)
    // 偶发非单调 glitch / 平滑滚动追上后过冲→editor 跳动。记 preview 方向，目标相对 editor【实际位】反向>80px 判 glitch 跳过
    // (吸收抖动、editor 单调跟)；比 lastEdSnapSt(上次目标)更准——editor 实际位可能因平滑滚动偏离目标，比实际位才能捕真实回拉。
    // 真换向(用户反向滚)首帧 lastDir 仍同向→判 glitch 跳过一帧、次帧 lastDir 更新后放行(代价:反向起步延迟1帧，可接受)。
    if (src === preview && dst === editor) {
      const adv = lastPvSnapSt < 0 || center >= lastPvSnapSt - 2; // preview 前进/静止(容 2px)
      const want = Math.max(0, Math.min(max || 0, y - dst.clientHeight / 2));
      const curEd = dst.scrollTop; // editor 实际当前位(可能因平滑滚动偏离上次目标)
      if (adv && want < curEd - 80) { lastPvSnapSt = center; return; }
      if (!adv && want > curEd + 80) { lastPvSnapSt = center; return; }
      lastPvSnapSt = center;
      dst.scrollTop = want;
      return;
    }
    if (dst === preview) scrollSrc = "editor"; // editor→preview 推预览前标记 editor 驱动：syncAnchors 设 preview.scrollTop 会触发 preview scroll 事件，若此时 scrollSrc 已被 scrollend(120ms)重置为 null，preview scroll 监工会误判"用户拖 preview"→设 scrollSrc="preview"→scheduleSync(preview,editor)→把 editor 拉回 preview 位置→editor scroll 守卫(scrollSrc!=="preview")无法恢复"editor"→死锁→editor 卡 content 被反复拉回(用户感"跳回开头")。positionWindow/renderWindowLazy/img load 推 preview 前都已标，唯独 syncAnchors 漏。
    dst.scrollTop = Math.max(0, Math.min(max || 0, y - dst.clientHeight / 2));
  }
  // 滚动同步用 requestAnimationFrame 合并（每帧最多一次），避免滚动卡顿
  let syncRaf = 0, syncDir = null;
  function scheduleSync(src, dst) {
    syncDir = { src, dst };
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => { syncRaf = 0; if (syncDir) { const d = syncDir; syncDir = null; syncAnchors(d.src, d.dst); } });
  }
  // 用户直接操作 preview(wheel/触控/拖滚动条 pointerdown)的最近时间戳：区分"用户拖 preview"vs"程序推 preview 的余波 scroll"。
  // 仅前者应触发 preview→editor。后者(editor 驱动时 syncAnchors/positionWindow 推 preview，其 scroll 事件在 WKWebView 下可能延迟到
  // scrollSrc 被 scrollend 重置为 null 后才到达)若误判为用户拖→preview→editor 把 editor 拉回 preview 位置→editor scroll 守卫(scrollSrc!=="preview")
  // 无法恢复"editor"→死锁→editor 卡 content 区被反复拉回(用户感"跳回开头")。scrollSrc 时序判断不可靠，故用用户交互时间戳兜底。
  let lastPreviewUser = 0;
  preview.addEventListener("wheel", () => { lastPreviewUser = performance.now(); }, { passive: true });
  preview.addEventListener("touchstart", () => { lastPreviewUser = performance.now(); }, { passive: true });
  preview.addEventListener("pointerdown", () => { lastPreviewUser = performance.now(); });
  preview.addEventListener("scroll", () => {
    if (performance.now() - lastPreviewUser < 600 && scrollSrc !== "editor") {
      scrollSrc = "preview"; scheduleSync(preview, editor);
      if (winSkel.length) scheduleWindowLazyParse(); // 窗口化：用户主动滚预览→懒解析未 parse 区
    }
    if (vblocks.length) scheduleRenderVisible(); // 虚拟化：滚动时按需切换可见块
  });
  // 图片异步加载会撑高预览，使 fineYCache/previewBlockY 过期（图片后内容偏上、文档后半部分累积偏差），
  // 且加载后预览内容位移、原本对齐错位 → img load 后防抖重测缓存，再以编辑区当前中心为准重新定位预览。
  preview.addEventListener("load", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") {
      clearTimeout(imgLoadT);
      imgLoadT = setTimeout(() => {
        buildPreviewBlockY();
        lastPreviewH = preview.scrollHeight;
        // 编辑区为锚（scrollSrc≠preview 时）→ 重定位预览到编辑区中心对应位置，消除图片加载造成的位移错位。
        // 标 scrollSrc="editor" 防止重定位触发 preview scroll → preview→editor 反馈。
        if (scrollSrc !== "preview") { scrollSrc = "editor"; syncAnchors(editor, preview); }
      }, 60);
    }
  }, true);
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
  // CM 模式：把搜索匹配作为 Decoration 推给 CM（画在内容里，替代 #editor-hl 覆盖层，根治"差一两格"）
  function pushSearchMarks() {
    if (!cm || !setSearchMarks) return;
    let marks;
    if (searchBar.hidden || !searchInput.value || !searchMatches.length) marks = [];
    else { const q = searchInput.value; marks = searchMatches.map((pos, i) => ({ start: pos, end: pos + q.length, current: i === searchIdx })); }
    cm.dispatch({ effects: setSearchMarks.of(marks) });
  }
  // 编辑器搜索高亮：CM 模式把匹配作为 Decoration 推给 CM（画在 .cm-content 里，Phase 3.2）。
  function renderEditorHighlight() { pushSearchMarks(); }
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
    // 滚动到可见：用 offToEditorY（编辑器 offset→像素 Y，经 #editor-yprobe 实测视觉行位置，已计入
    // 软折行与当前字号）。原实现用「逻辑行号 × 硬编码 14×1.7」——长段落的软折行与用户字号缩放
    // 均会让该值偏离真实像素位置，匹配越靠后（上方折行段落越多）偏差越大：首条能居中、后续大多
    // 落到视口下方甚至不可见。搜索时 textarea 未聚焦（避免按键灌入正文），浏览器原生「滚动选区
    // 到可见」不触发，故必须用实测 Y 手动滚到位（与编辑↔预览滚动同步同源，BUG-060/104）。
    { const _y = offToEditorY(pos); if (_y >= 0) editor.scrollTop = _y - editor.clientHeight / 2; }
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
  // 搜索输入 debounce（#性能2）：原每次按键都 doSearch→renderEditorHighlight 全量重建
  // editor.value 转义 innerHTML，连输 "hello" 触发 5 次。80ms trailing 合并：停顿才搜、连击只算一次。
  // 回车/上一条/下一条按钮仍即时响应（它们直接调 doSearch，不经此 debounce）。
  let searchInputTimer = 0;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchInputTimer);
    searchInputTimer = setTimeout(() => doSearch(1), 80);
  });
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
  // 用户直接操作 editor(wheel/触控/拖滚动条/键盘)的最近时间戳：区分"用户驱动 editor"vs"程序推 editor 的余波 scroll"。
  // WKWebView 下 syncAnchors(preview→editor) 推 editor 产生的 scroll 事件【异步延迟】到达，可能落在 wheel 间隙触发的
  // scrollend→scrollSrc=null 之后→裸 scrollSrc!=="preview" 误判为用户驱动→editor→preview 把 preview 反拉回 editor 滞后位
  // (深度预览滚动 line547+ 复现回跳)。scrollSrc 时序不可靠，故镜像 preview 侧(lastPreviewUser)用用户交互时间戳兜底。
  let lastEditorUser = 0;
  editor.addEventListener("wheel", () => { lastEditorUser = performance.now(); }, { passive: true });
  editor.addEventListener("touchstart", () => { lastEditorUser = performance.now(); }, { passive: true });
  editor.addEventListener("pointerdown", () => { lastEditorUser = performance.now(); });
  editor.addEventListener("keydown", () => { lastEditorUser = performance.now(); }, { passive: true }); // CM 键盘滚屏
  editor.addEventListener("scroll", () => {
    if (editorHl) { editorHl.scrollTop = editor.scrollTop; editorHl.scrollLeft = editor.scrollLeft; }
    // 窗口模式：编辑区中心移出当前窗口内圈 -> 防抖重渲新窗口。
    // 预览驱动(scrollSrc="preview")时跳过：此时 editor 被 syncAnchors(offToEditorY lineBlockAt 回退)推着跟随 preview，
    // 若触发 renderWindow reset 会以"进入时 editor off"为中心【异步】重 parse——await 期间 preview 继续滚→vContent 落在
    // stale off≠当前 preview→错位/回跳(深度预览滚动 line225+ 复现)。预览驱动的 vContent 重 parse 专由 renderWindowLazy
    // (scheduleWindowLazyParse，围绕 preview 实测 off)负责，renderWindow 仅服务 editor 驱动。editor 仍由 syncAnchors 跟随。
    const userEditor = performance.now() - lastEditorUser < 600;
    if (winStart >= 0 && scrollSrc !== "preview" && userEditor) scheduleWindowRecenter();
    // 编辑区滚动 -> 预览跟随：仅"近期有 editor 用户输入"且非 preview 驱动时触发；preview 推 editor 的余波 scroll(无用户输入)被 gate
    if (scrollSrc !== "preview" && userEditor) { scrollSrc = "editor"; scheduleSync(editor, preview); }
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
      const py = previewOffsetToY(pos);
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
    if (!srcBlockOffsets.length && !winSkel.length) return;
    if (winSkel.length) { // 窗口化：窗口外骨架定位+懒解析；窗口内 vContent 实测
      if (offset < winStart || offset > winEnd) {
        scrollSrc = "editor"; preview.scrollTop = Math.max(0, winOffToY(offset) - 20);
        scheduleWindowLazyParse(); return;
      }
      let lo = 0, hi = srcBlockOffsets.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (srcBlockOffsets[mid] <= offset) lo = mid + 1; else hi = mid; }
      const el = vContent && vContent.children[Math.max(0, lo - 1)];
      if (el) { const pvRect = preview.getBoundingClientRect(); preview.scrollTop = el.getBoundingClientRect().top - pvRect.top + preview.scrollTop - 20; return; }
      preview.scrollTop = Math.max(0, winOffToY(offset) - 20); return;
    }
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
      case "sync-scroll": toggleSync(); break;
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
    if (!winLabel.startsWith("mermaid-") && !winLabel.startsWith("ai-panel-")) {
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
          // 临时取消 AI 窗口置顶，否则 always_on_top 的 AI 窗会遮盖本未保存确认弹窗(请求：确认弹窗须在 AI 窗之上)
          try { await invoke("set_ai_panels_on_top", { onTop: false }); } catch (e) { console.warn("[close] set_ai_panels_on_top 不可用(需重新编译 Rust 二进制):", e); }
          const pending = tabs.filter((x) => x.dirty).slice();
          try {
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
          } finally {
            // 恢复 AI 窗口置顶（取消关窗时必要；确认关窗时 AI 窗随后被级联关闭，无副作用）
            try { await invoke("set_ai_panels_on_top", { onTop: true }); } catch (_) {}
          }
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
      "<p>" + s.pIntro.replace("{ver}", appVersion || "2.2.1") + "</p>",
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
  const HELP_STRINGS = window.HELP_DATA.HELP_STRINGS;
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
        tpl.innerHTML = sanitizeViewerContent(html.trim());
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
      if (editorHl) editorHl.style.fontSize = px + "px";   // BUG-056：AI 选区覆盖层同步
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
  // 查看器内容净化（S1）：mermaid <svg> 或用户 <img> 的 outerHTML 经 DOMPurify 过一道，
  // 剥除 <script>/on*= 事件处理器/javascript: URI 等，防御未来 DOMPurify/marked 等 CVE 导致
  // 的脚本注入在查看器窗口（CSP 之外的纵深防御）。保留 mermaid 所需 <style> 与 <foreignObject>
  // （含内嵌 HTML，流程图/类图/状态图标签）——svg+html 双 profile 显式放行 foreignObject，
  // 实测不破坏渲染、不破坏 <img> data URL。DOMPurify 作全局 vendor 内联；极端未加载时原样返回。
  function sanitizeViewerContent(html) {
    if (!window.DOMPurify) return String(html);
    return window.DOMPurify.sanitize(String(html), {
      USE_PROFILES: { svg: true, html: true },
      ADD_TAGS: ["foreignObject"],
    });
  }
  function initViewerWindow(contentHtml) {
    isViewerWindow = true; // 标记为查看器窗口：关窗拦截据此放行（不依赖 winLabel 检测）
    document.documentElement.classList.add("mv-win");
    const mv = mermaidI18n();
    const setT = (id, v) => { const el = $(id); if (el) el.title = v; };
    setT("mv-in", mv.zoomIn); setT("mv-out", mv.zoomOut); setT("mv-reset", mv.reset);
    setT("mv-center", mv.center); setT("mv-fullscreen", mv.fullscreen); setT("mv-close", mv.close);
    const h = $("mv-hint"); if (h) h.textContent = mv.hint;
    const tpl = document.createElement("template");
    tpl.innerHTML = sanitizeViewerContent(String(contentHtml).trim());
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
    // AI 独立窗口（ai-panel-*）：不恢复会话/不开文件；浮层初始化由 AiModule 自行处理（取 take_ai_panel_content）
    // 补调 applyLang()：init 在此处短路 return 会跳过后面的 applyLang()，导致 #ai-input 的 data-i18n-ph
    // placeholder（及文案）没被设置 → 输入框无浅色提示。此处 curLang 已于上方从 localStorage 读出。
    if (winLabel.startsWith("ai-panel-")) { try { applyLang(); } catch (_) {} return; }
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
      resetUndo(); // 首屏载入文档后重置撤销基线=当前内容；否则 undoLast 为初始空值，首次撤销会把文档清空
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
