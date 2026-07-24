# Changelog

## v1.4.0

> 本版为"硬化 + 架构升级"大版本：集中修复代码审查报告中的数据完整性 / 并发 / 安全 / 性能缺陷，
> 首次引入自动化测试（CI + 前后端单测），并将前端模块化、加 TypeScript 类型护栏、会话持久化迁移到 IndexedDB 混合。

### 修复 / Fixes（数据完整性）

- **保存写入改为原子写**（崩溃/断电/磁盘满不再留半截文件丢原内容）。**Save writes atomically (crash-safe).**
- **跨盘另存为不再丢图片**：草稿首存到 U 盘/网络盘，复制失败中止并保留源（此前静默跳过后删源致两处皆失）。
- **两窗口草稿图片不再互相覆盖**：草稿目录按窗口隔离。
- **同一文件不再能在两窗口同时打开**：已被别的窗口持有时置顶该窗口，杜绝并发存盘互相覆盖。
- **重启后双击同一文件不再开重复窗口**：会话恢复后重新登记已打开文件。
- **GBK / Latin-1 / UTF-16 等非 UTF-8 文件可正常打开**（兜底解码 + 剥 BOM）。
- **"已保存"不再掩盖图片断链**：图片迁移/引用回写失败时保持未保存并提示。
- **外部修改检测**：保存时若文件已被别的程序改过，弹"覆盖/从磁盘重载/取消"，不再静默覆盖。

### 修复 / Fixes（安全 / 并发 / 性能）

- **构造 `<img src=敏感文件>` 不再泄露本地文件**：后端按 magic bytes + 扩展名白名单仅放行真实图片（含 AVIF/HEIF）。
- **mermaid SVG 输出加纵深消毒**（DOMPurify SVG profile，失败安全回退）；KaTeX 显式 `trust:false`。
- **关标签用对象引用重定位**（不再 splice 错标签）；确认弹窗加重入锁；切换/关闭取消待渲染。
- **撤销栈 / 图片缓存 / 导航历史内存封顶**（撤销 48MB 字节预算、imgCache LRU 200、navStack 500）。
- **关闭窗口前确认未保存标签**（onCloseRequested 拦截；viewer 窗口排除）。
- **关闭前同步刷盘**（pagehide/visibilitychange）挽回 ≤500ms 编辑。
- **会话过大/损坏不再静默失败**：IDB 主存突破 5MB 配额 + localStorage 回退 + 一次性提示。
- **另存为找不到源图时不再改写引用为断链路径**（保留原引用 + 提示"保存失败 images"）。
- **修复 mermaid Viewer 窗口无法关闭**（关窗拦截误注册到 viewer 窗口）；进一步改为**结构性门控**：viewer 窗口根本不注册关窗拦截。
- **修复 mermaid 图节点标签消失**（过度消毒剥掉了 `foreignObject` 标签）——回退冗余的 SVG 消毒，安全门回到 mermaid `strict` / KaTeX `trust:false`。
- **修复蒙古语"MDeX简介"末尾混入乌尔都语**（既有翻译错）。

### 新增 / Added

- **自动化测试**：20 个前端纯函数测试（`npm test`）+ 15 个 Rust 单测（`cargo test`）+ GitHub Actions CI（push/PR 自动跑）。
- **前端模块化**：应用逻辑抽到 `src/app.js`，构建期内联（不引入打包器，保持单文件离线产物）。
- **TypeScript 类型护栏**：`tsconfig.json` + `// @ts-check` + JSDoc（`@typedef Tab` 等），`tsc --noEmit` 零错误。

### 修复 / Fixes（公式渲染，1.4.0 后续 hotfix）

- **超长 LaTeX 公式超宽时按运算符折行**，不再出现横向滚动条：单行公式按 `=/+/-` 折行；`align`/`gather` 等多行环境**逐行折行**（`align` 保留 `=` 对齐、续行 `\notag` 不重复编号）；`cases`/`matrix` 等无可折点的回退等比缩小。**折行位置随预览栏宽度实时重排**（`ResizeObserver` 监听、debounce 重算）。
- **编号不被折行公式覆盖**：迭代实测第一行内容右边界 vs 编号左边界（绕过 KaTeX 离屏量宽与实际渲染的偏差）；`\begin{env}...\end{env} \tag{x}` 中环境外的 `\tag` 不再被丢弃。

---

## v1.3.4

### 调整 / Changed
- **底部状态栏改为显示当前文件的绝对路径**：原状态栏左侧的「行 / 词 / 字符」计数改为显示当前打开文件的绝对路径（草稿未存盘时退化为文件名 / 未命名），长路径自动省略、悬停可看完整路径；切换标签、首存、另存为后即时刷新。
  **Bottom status bar now shows the current file's absolute path**: The "lines / words / characters" counts on the left of the status bar are replaced with the absolute path of the open file (drafts fall back to the filename / "Untitled"); long paths are ellipsized with the full path on hover, and refresh instantly on tab switch / first save / save-as.
- **编辑区右上字数单位「字」改为「词」**：编辑区右上角的实时计数由「N 字」改为「N 词」，与底部统计口径一致。
  **Editor word-count unit "字" → "词"**: The live counter at the editor's top-right now reads "N 词" (words) instead of "N 字" (characters), matching the bottom-bar wording.
- **精简预览区状态标识**：移除预览区右上角的「已渲染」状态指示、右下角的「UTF-8 · Markdown」编码标识，减少视觉干扰。
  **Trimmed preview-area status labels**: Removed the "Rendered" indicator at the preview's top-right and the "UTF-8 · Markdown" encoding label at its bottom-right for less visual clutter.

### 修复 / Fixes
- **编辑模式下底部状态栏的文件路径不刷新**：仅编辑模式（隐藏预览窗格）下打开/切换文件，底部状态栏的文件绝对路径不显示（只停留在文件名或旧值）。根因是删除「已渲染」状态指示 `<span id="rs">` 时漏删了 `render()` 编辑模式分支里的一处 `$("rs")` 赋值，`$("rs")` 返回 null 抛 TypeError 中断了渲染流程（BUG-081）。已清理该残留，并在切换标签时立即刷新状态栏。
  **Status-bar file path didn't refresh in editor-only mode**: With the preview pane hidden, opening/switching files left the bottom status bar stuck on the filename or a stale value instead of the absolute path. Root cause: a leftover `$("rs")` assignment in `render()`'s editor-mode branch (the element had been removed) threw a TypeError that aborted rendering (BUG-081). The reference is now removed and the status bar refreshes immediately on tab switch.
- **菜单「另存为」后底部状态栏路径不刷新**：通过菜单「另存为」把文档（含内置 MDeX 示例）存到某目录（如 Downloads）后，底部状态栏仍显示文件名而非新的完整路径。根因是 `saveAs` 函数设置了文件路径却未刷新状态栏（BUG-082）。已修复。
  **Status-bar path didn't refresh after "Save As"**: Saving a document (incl. the built-in MDeX sample) via the menu "Save As" left the status bar showing the filename instead of the new absolute path. The saveAs function set the path but didn't refresh the status bar (BUG-082). Fixed.

---

## v1.3.3

### 移除 / Removed
- **移除「高清位图 PDF」导出**：「PDF（矢量打印）」已能覆盖 PDF 导出需求（文字/公式任意放大清晰），故移除与之重叠的「PDF（高清位图）」选项，简化导出菜单（现为 Markdown / HTML / PDF（矢量打印）/ LaTeX）；顺带消除 macOS WKWebView 下位图路径末尾内容丢失（BUG-078）的根源。
  **Removed "PDF (high-res raster)" export**: "PDF (vector print)" already covers PDF export (text/formulas stay crisp at any zoom), so the overlapping "PDF (high-res raster)" option is removed to simplify the export menu (now Markdown / HTML / PDF (vector print) / LaTeX); this also eliminates the root cause of the trailing-content loss in the WKWebView raster path (BUG-078).

### 修复 / Fixes
- **Windows 下相对路径图片不再无法渲染**：Windows 安装版打开/新建含相对路径图片（如 `![](pic.png)`）的文档、或粘贴/拖入图片时，渲染区图片此前一律不显示（macOS/Linux 正常）。根因是前端 `dirOf`/`baseName` 用 `lastIndexOf("/")`、`relPath` 用 `split("/")`，只认 Unix `/`；而 Rust 在 Windows 返回的是反斜杠绝对路径（`C:\Users\…`），导致 `tab.dir` 被算成空，`resolveImages` 的"无目录则跳过"守卫误杀所有相对路径图，粘贴图片的落盘目录还会拼成 `/stem_images` 写到盘符根目录。现让这三个函数同时认 `/` 与 `\`，Windows 下相对/绝对路径图片均正常渲染。该问题与编译工具链（MSVC / 交叉编译 GNU）无关，属纯前端逻辑，所有 Windows 运行版皆受影响（BUG-080）。
  **Relative-path images now render on Windows**: On the Windows build, opening/creating a document with relative-path images (e.g. `![](pic.png)`), or pasting/dropping an image, left the render area blank (macOS/Linux were fine). Root cause: `dirOf`/`baseName` used `lastIndexOf("/")` and `relPath` used `split("/")` — Unix `/` only — but Rust returns backslash absolute paths on Windows (`C:\Users\…`), so `tab.dir` computed to empty and the "skip if no dir" guard in `resolveImages` killed every relative-path image (pasted images even landed in the drive root via `/stem_images`). These three helpers now accept both `/` and `\`, so relative and absolute images render correctly on Windows. This is a pure-frontend issue independent of the toolchain (MSVC / cross-compiled GNU) and affects every Windows build (BUG-080).

### 调整 / Changed
- **另存为格式弹窗:底部"取消"键改为右上角 ×**:「另存为」时选择导出格式(Markdown / HTML / PDF / LaTeX)的自绘弹窗,原本在底部排一个"取消"按钮,现改为卡片右上角的 × 关闭按钮(与帮助、Mermaid 查看器等弹窗统一)。取消途径仍为三种等价:点右上角 ×、点遮罩空白、按 Esc。× 位置用 `inset-inline-end`,在阿拉伯/乌尔都等 RTL 语言下自动落到左上角。
  **Save-as format dialog: bottom "Cancel" → top-right ×**: The self-drawn format-picker (Markdown / HTML / PDF / LaTeX) shown on "Save As" previously placed a "Cancel" button in the bottom row; it's now a × close button in the card's top-right corner (consistent with the Help and Mermaid-viewer dialogs). Cancellation still works three equivalent ways: click ×, click the backdrop, or press Esc. The × uses `inset-inline-end` so it flips to the top-left under RTL languages (Arabic/Urdu/etc.).

---

## v1.3.2

### 修复 / Fixes
- **矢量 PDF 导出图片不再变问号**：含相对路径图片的文档（如「MDeX 示例」的图标）在「另存为 PDF（矢量打印）」时，图片在生成的 PDF 里显示为问号（broken）；敲空格触发重渲后图标恢复、再导出又变问号，反复横跳。根因是导出前 `preview.innerHTML = lastFullHtml` 把预览重置回原始相对路径后直接打印，未把图片 resolve 成 data URL；而 `lastFullHtml` 快照里 `<img>` 始终是相对路径（`resolveImages` 只改 DOM 不回写字符串）。现打印前补 `resolveImagesForExport`（与导出同源处理），图片正常渲染。
  **Vector-PDF images no longer show as broken**: A document with relative-path images (e.g. the MDeX sample icon) rendered images as broken (?-icons) when saved via "Save as PDF (vector print)"; typing a space to re-render fixed it temporarily, but re-exporting broke it again. The export reset the preview to `lastFullHtml` (which always holds raw relative paths — `resolveImages` mutates only the DOM, not the snapshot) and printed without resolving images to data URLs. A `resolveImagesForExport` step is now run before printing, so images render correctly.
- **位图 PDF 导出不再丢失图片之后的末尾内容**：含图片的文档导出「PDF（高清位图）」时，图片之后的文字（及末尾若干页）会从 PDF 末尾消失、末页大片空白；macOS WKWebView 下即便已把图片 resolve 成 data URL，仍可能只丢「最后一行」。根因有二：① 测量文档总高 `totalH` 早于图片加载完成，`totalH` 漏算图片高度；② **WKWebView 引擎差异**——即便 resolve 图片并等待加载，JS 测得的 `offsetHeight` 仍与 html2canvas 实际渲染高度相差几像素到一行（Chrome 下两者一致，故不复现），此前用 `totalH` 预设离屏容器 `cap.style.height` 限高后再截图，末页切片越过 canvas 真实内容边界，末行落在空白区被裁掉。现改为：测量前 resolve 图片为 data URL 并 `await img.decode()`；且不再用 `offsetHeight` 限高切片，而是不限高直接渲染整篇，以 html2canvas 实际输出的 canvas 高度（`full.height/scale`）作为切片上界，末页永远落在 canvas 真实内容范围内，末行不再丢失。
  **Raster-PDF export no longer drops trailing content after images**: When exporting "PDF (high-res raster)", text (and trailing pages) after an image disappeared from the end of the PDF, leaving the last page mostly blank; on macOS WKWebView even after resolving images to data URLs, just the last line could still vanish. Two root causes: (1) the total-height `totalH` was measured before images finished loading, under-counting image height; (2) **WKWebView engine quirk** — even after resolving images and awaiting load, the JS-measured `offsetHeight` still differs from html2canvas's actual render height by a few pixels up to a line (Chrome agrees, so it never reproduces there). Setting `cap.style.height = totalH` to clamp the offscreen container before capture made the last slice overrun the canvas's real content edge, dropping the last line into the blank margin. Fix: resolve images to data URLs and `await img.decode()` before measuring; and instead of clamping/slicing by `offsetHeight`, render the whole document unclamped and slice by html2canvas's actual canvas height (`full.height/scale`), so the last slice always falls within the real canvas content and the trailing line is preserved.

---

## v1.3.1

### 新功能 / New Features
- **导出 LaTeX 三项增强**：① **多语言字符自动适配**——导出 `.tex` 时检测正文里的中文/日韩(CJK)、阿拉伯、希伯来、西里尔(俄语等)、希腊、印地(天城体)、泰等字符，自动在导言区加入对应宏包，使编译出的 PDF 能正确显示（CJK/阿拉伯/希伯来/印地/泰等复杂脚本自动切到 **XeLaTeX + `fontspec`/`ctex`/`polyglossia`**，西里尔/希腊用 pdfTeX + `babel`）。② **表格转真正的 LaTeX 表格**——管道表格不再以 `verbatim` 原样保留，而是转为 `tabular` 环境，列对齐按对齐行 `:--`/`:-:`/`--:` 解析为左 / 居中 / 右。③ **带颜色文字导出**——`<span style="color:…">` 颜色文字转为 `\textcolor{…}{…}`（`#RRGGBB` → `\textcolor[HTML]{...}`，命名色如 `red` 原样），并在导言区加入 `xcolor`。
  **Three export-to-LaTeX enhancements**: ① **Auto multilingual support** — when exporting `.tex`, the body is scanned for CJK / Arabic / Hebrew / Cyrillic / Greek / Devanagari / Thai characters and the matching packages are added to the preamble so the compiled PDF renders them (CJK/Arabic/Hebrew/Devanagari/Thai switch to **XeLaTeX + `fontspec`/`ctex`/`polyglossia`**; Cyrillic/Greek use pdfTeX + `babel`). ② **Tables become real LaTeX tables** — pipe tables are no longer kept verbatim; they convert to a `tabular` environment with per-column alignment parsed from `:--`/`:-:`/`--:` (left / center / right). ③ **Colored text export** — `<span style="color:…">` converts to `\textcolor{…}{…}` (`#RRGGBB` → `\textcolor[HTML]{...}`, named colors like `red` used as-is), with `xcolor` added to the preamble.
- **导出 LaTeX：Mermaid 图 / 文献引用 / 图片**：① **Mermaid 图**——导出 `.tex` 时由 MDeX 用 html2canvas 把每个 mermaid 图截成 PNG 落盘到 `<文件名>_figs/` 子文件夹，LaTeX 用 `\includegraphics{<文件名>_figs/mermaid_N.png}` 嵌入（宽度 0.8\linewidth 居中、超高自动压缩到页高）；编译只需 `graphicx`，**无需 mmdc / mermaid 包**。② **文献引用**——`[@key]` 转 `\cite{key}`；内嵌 `bibtex` 块 + 已加载 `.bib` 解析成 `thebibliography` 环境（`\bibitem{key}`）**内嵌 .tex 文末**，无需另建 .bib、无需跑 BibTeX。③ **普通图片**——文档里的 `![](path)` 普通图片（如示例图标）拷到 `<文件名>_figs/` + 引用改写。导言区首行按内容用 `% !TEX program` 标注编译引擎（pdfLaTeX / XeLaTeX）。内置「MDeX 示例」更新：标题改「MDeX 编辑器」、图片存 `<文件名>_images/`（不再 base64）、新增图片引用段（MDeX 图标，相对路径跨系统可移植）。
  **Export to LaTeX: Mermaid / citations / images**: ① **Mermaid** — each mermaid diagram is captured to PNG via html2canvas, saved to `<filename>_figs/`, embedded via `\includegraphics` (0.8\linewidth centered, auto-shrink if taller than a page); only `graphicx` needed — **no mmdc / mermaid package**. ② **Citations** — `[@key]`→`\cite{key}`; the embedded `bibtex` block + loaded `.bib` are parsed into a `thebibliography` environment inlined at the end of `.tex` — **no separate .bib, no BibTeX run**. ③ **Images** — `![](path)` images (e.g. the sample icon) are copied to `<filename>_figs/` with references rewritten. The preamble flags the engine (`% !TEX program`: pdfLaTeX / XeLaTeX). The "MDeX" sample is refreshed: title "MDeX Editor", images to `<filename>_images/` (no base64), icon section with portable relative path.

### 修复 / Fixes
- **另存为 LaTeX 行间公式不再被转义**：`$$` 独占行（跨多行）的行间公式（如高斯积分 `\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`）另存为 `.tex` 时，原本会被错误转义成 `\$\$` + `\textbackslash{}int\_\{…\}`（`$`→`\$`、`\`→`\textbackslash{}`、`_`→`\_`、`^`→`\textasciicircum{}`），公式全毁；现逐行转换时按块识别 `$$…$$` / `\[ … \]` 行间公式并原样保留，公式体不再被当普通文本转义。
  **Save-as-LaTeX no longer escapes display math**: A `$$…$$` display equation on its own lines (e.g. the Gaussian integral `\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`) was wrongly escaped into `\$\$` + `\textbackslash{}…` when saved to `.tex` (`$`→`\$`, `\`→`\textbackslash{}`, `_`→`\_`, `^`→`\textasciicircum{}`), destroying the formula. Display-math blocks (`$$…$$` / `\[ … \]`) are now recognized as blocks during the per-line conversion and kept verbatim, so the formula body is no longer escaped as plain text.
- **双击打开含图片的文件不再首屏空白**：双击 `.md`（或恢复会话）打开含本地图片的文档时，渲染区首次不显示图片，要敲一下空格等任意编辑才出现；根因是打开过程连触多次渲染、`innerHTML` 替换了 `<img>` 元素，图片异步读取的回调设到了已脱离 DOM 的旧 img、新 img 又被「处理中」缓存标记跳过。改用 Promise 缓存：每个 img 各自从共享 Promise 取结果并设自身 `src`（`isConnected` 守卫），不再漏设。
  **Images no longer blank on first render when opening a file**: Opening (double-click or session restore) a `.md` with local images left the preview blank until you typed a character; back-to-back renders replaced the `<img>` nodes via `innerHTML`, so the async image-load callback set the detached old img while the new one was skipped by an in-progress cache flag. The cache now stores a Promise — each img reads the shared result and sets its own `src` (guarded by `isConnected`).

---

## v1.3.0

### 新功能 / New Features
- **Mermaid 图 / 图片独立查看器窗口**：点击渲染区的 mermaid 图（流程图/时序图等）或普通 markdown 图片，弹出**可自由移动的独立 OS 窗口**查看（不再是页内弹窗）。支持滚轮/按钮缩放（光标锚点）、拖拽平移、**居中按钮**（保持缩放、拉回居中）、一键系统级全屏。矢量 SVG 放大不糊（改 width/height 触发矢量重绘）；位图初始不放大（避免糊）。**mermaid 图跟随编辑实时更新**——编辑区改动时已开的查看器窗口同步刷新（保留当前缩放）。错误回退的代码块不触发。
  **Mermaid / image standalone viewer window**: Click a mermaid diagram or a markdown image in the render area to open a freely-movable standalone OS window (no longer an in-page popup). Supports wheel/button zoom (cursor-anchored), drag-to-pan, a center button (re-center keeping the current zoom), and one-click system-level fullscreen. Vector SVG stays crisp when zoomed (zoom via width/height to trigger vector re-render); bitmaps aren't upscaled initially (avoid blur). Mermaid diagrams update live with the editor — open viewer windows refresh as you edit (preserving the current zoom). Error-fallback code blocks do not trigger it.
- **编辑区 / 预览区独立字体缩放**：两区 pane-head 右侧各加 −/百分比/+ 控件，各自独立放大缩小（±10%，50%–250%），点百分比重置；倍率持久化（重启恢复）。改编辑器字号自动同步搜索高亮覆盖层并重算折行映射，改预览字号刷新块高缓存，保证滚动同步仍准。
  **Independent font zoom for editor & preview**: Each pane's header gets a −/percentage/+ control to zoom its font independently (±10%, 50%–250%); click the percentage to reset; the zoom level persists across restarts. Changing the editor font auto-syncs the search-highlight overlay and recomputes the wrap map; changing the preview font refreshes the block-height cache — so scroll sync stays accurate.
- **缩放快捷键**：`Cmd/Ctrl + =/−/0` 放大 / 缩小 / 重置——默认作用编辑区字体，加 `Shift` 作用预览区字体；图查看器（独立窗口或页内弹窗）打开时则作用查看器图（自动接管）。
  **Zoom shortcuts**: `Cmd/Ctrl + =/−/0` to zoom in / out / reset — targets the editor font by default, the preview font with `Shift`, and the image viewer (standalone window or in-page popup) when it is open (takes over automatically).
- **粘贴/选择图片改为保存到 `<文件名>_images/` 文件夹**：不再内嵌冗长 base64。已保存文档：图片存到文档同目录的 `<文件名>_images/`，插入相对引用 `![name](<文件名>_images/name)`；未命名草稿：先存到 MDeX 缓存目录下的临时文件夹（多草稿各自独立），**保存文档时自动迁移**到 `<文件名>_images/`；**另存为**时把引用到的每张图片扁平拷到目标的 `<文件名>_images/`（不拷整个源文件夹），同名图片自动改名为 `_2/_3`，markdown 引用同步改为 `<文件名>_images/<名>`。支持中文等任意 UTF-8 文件/文件夹名。浏览器模式仍用 base64。
  **Pasted/selected images now save to a `<filename>_images/` folder**: No more long inline base64. In a saved document, images go to a `<filename>_images/` folder next to the document with a relative reference. In an unsaved draft, images are first stored in a per-draft temporary folder under MDeX's cache directory, then **migrated** to `<filename>_images/` when saved. **Save As** flattens every referenced image into the target's `<filename>_images/` (no source folders copied), auto-renaming duplicates to `_2/_3` and rewriting the references to `<filename>_images/<name>`. Supports any UTF-8 (e.g. Chinese) file/folder names. Browser mode still uses base64.

### 修复 / Fixes
- **Mermaid 语法错误不再在窗口底部累加**：写错的 mermaid 图不再在 MDeX 底部反复堆积「Syntax error / mermaid version」残留（每次出错加一行、关文档消不掉、仅重启清除）；错误改为在预览内联显示、随重渲自动清除。
  **Mermaid syntax errors no longer accumulate at the bottom**: A malformed mermaid diagram no longer repeatedly piles up "Syntax error / mermaid version" lines at the bottom of MDeX (one per error, surviving tab close, cleared only on restart); the error now shows inline in the preview and auto-clears on re-render.
- **中文等 UTF-8 文件 / 文件夹名可正常渲染**：文档名含中文（如「未命名_images」「笔记_images」）时，图片之前在预览不显示；现修正 marked 对非 ASCII 图片 URL 的编码问题，UTF-8 路径正常解析。
  **UTF-8 (e.g. Chinese) file/folder names now render**: Images in folders with non-ASCII names (e.g. 未命名_images, 笔记_images) previously didn't show in the preview; fixed marked's encoding of non-ASCII image URLs so UTF-8 paths resolve correctly.

### 升级 / Notes
- 仍是**完全离线**单文件前端 + Tauri v2 外壳，无任何运行时联网。
  Still a **fully offline** single-file frontend + Tauri v2 shell, with no runtime networking.
- 许可证不变：Apache-2.0。
  License unchanged: Apache-2.0.

---

## v1.2.0

### 新功能 / New Features
- **界面语言扩充至 17 种**：新增印地语(हिन्दी)、旁遮普语(ਪੰਜਾਬੀ)、越南语(Tiếng Việt)、印尼语(Bahasa Indonesia)、乌尔都语(اردو，自动 RTL)、蒙语(Монгол，西里尔)。界面、帮助文档、示例文档、README 全部跟随。
  **UI languages expanded to 17**: Added Hindi (हिन्दी), Punjabi (ਪੰਜਾਬੀ), Vietnamese (Tiếng Việt), Indonesian (Bahasa Indonesia), Urdu (اردو, auto RTL), Mongolian (Монгол, Cyrillic). The UI, help docs, sample docs, and README all follow suit.
- **工具栏「文字颜色」选择器**：12 种常用颜色，一键把选区包成 `<span style="color: …">`（行内富文本，预览/导出均显色）。图标为红->蓝双色渐变"A"。
  **Toolbar "Text Color" picker**: 12 common colors; one click wraps the selection in `<span style="color: …">` (inline rich text, colored in both preview and export). The icon is a red->blue gradient "A".
- **撤销 / 重做按钮**：自建快照栈（200ms 粒度），`Ctrl+Z`/`Ctrl+Y` 与按钮共享；每标签独立 undo 上下文；SVG 圆弧箭头图标。
  **Undo / Redo buttons**: A self-built snapshot stack (200ms granularity), shared between `Ctrl+Z`/`Ctrl+Y` and the buttons; each tab has its own undo context; SVG arc-arrow icons.
- **导航后退 / 前进**（`Alt+←` / `Alt+->`）：跨文档/标签 + 文件内光标/编辑位置跳转，按行粒度记录编辑历史。
  **Navigation back / forward** (`Alt+←` / `Alt+->`): Jumps across documents/tabs and to in-file cursor/edit positions, recording edit history at line granularity.
- **渲染区点链接开新标签**：本地文件链接（`other.md` / `./a.html` 等）在新标签页打开，**不再替换当前文档**；`http(s)` 链接由系统浏览器打开；`#锚点` 滚动定位；目录或失效链接静默忽略。
  **Render-area links open in a new tab**: Local file links (`other.md`, `./a.html`, etc.) open in a new tab **instead of replacing the current document**; `http(s)` links are opened by the system browser; `#anchor` links scroll to position; directories or broken links are silently ignored.
- **查找/替换高亮**：编辑区（透明覆盖层）+ 渲染区（文本节点 `<mark>`）标记所有匹配，当前条闪一闪；点↑↓轮换、边查边改均刷新。
  **Find/Replace highlighting**: The edit area (transparent overlay) and the render area (text-node `<mark>`) mark every match, and the current item flashes; clicking ↑/↓ cycles through them, and editing while searching refreshes the marks.
- **编辑↔预览双向定位大幅改进**：测量式锚点表 + 分段线性插值（替代旧"块级字符比例"），代码块按行插值、编辑器折行感知、`requestAnimationFrame` 滚动同步--绝大多数文档既准又丝滑。
  **Greatly improved Edit↔Preview bidirectional positioning**: A measurement-based anchor table plus piecewise-linear interpolation (replacing the old "block-level character-ratio" approach), per-line interpolation for code blocks, editor word-wrap awareness, and `requestAnimationFrame` scroll syncing - for the vast majority of documents it is now both accurate and silky-smooth.
- **外链在系统浏览器打开**：接入 `tauri-plugin-opener`，帮助文档里的 GitHub / 下载站点等链接可点击打开（应用本体仍完全离线）。
  **External links open in the system browser**: Integrated `tauri-plugin-opener`, so links such as GitHub or download sites in the help docs are clickable (the app itself remains fully offline).
- **README 17 语言**：项目说明全部翻译为 17 种语言，标题标注 v1.2.0，双下载入口（GitHub Releases + 备用站点），许可证三段式说明。
  **README in 17 languages**: The project description is fully translated into 17 languages, the title is tagged v1.2.0, with dual download entries (GitHub Releases + mirror site) and a three-part license explanation.

### 修复 / Fixes
- **查找框焦点缺陷**：打开查找输入第 2 个字符时不再被插进正文--搜索过程不再抢焦点到编辑器。
  **Find-box focus bug**: Opening Find and typing a second character no longer inserts it into the body text - the search process no longer steals focus to the editor.
- **查找「下一条(↓)」无反应**：向后搜索从选区末尾（selectionEnd）而非起点查找，正确跳过当前匹配。
  **Find "Next (↓)" not responding**: Backward search now starts from `selectionEnd` rather than the start, correctly skipping the current match.
- **颜色按钮点击无反应（两处）**：①`.color-pop{display:grid}` 盖过 `[hidden]` -> 补 `.color-pop[hidden]{display:none}`；②按钮在 `.group-fmt{overflow-x:auto}` 内弹层被垂直裁剪 -> 移到独立 `.group`。
  **Color button click not responding (two spots)**: ① `.color-pop{display:grid}` was overriding `[hidden]` -> added `.color-pop[hidden]{display:none}`; ② the popup was vertically clipped because the button sat inside `.group-fmt{overflow-x:auto}` -> moved it into a standalone `.group`.
- **撤销/重做"一次全退回"**：`execCommand("undo")` 在 WKWebView textarea 不可靠 -> 改自建快照栈（200ms 粒度）。
  **Undo/Redo "undoes everything at once"**: `execCommand("undo")` is unreliable in the WKWebView textarea -> replaced with a self-built snapshot stack (200ms granularity).
- **编辑↔预览滚动卡顿**：删除滚动时的 DOM 实测（`buildPosAnchors`），改用渲染时缓存 + `vprefix`；`syncAnchors` 走 rAF 合并。
  **Edit↔Preview scroll jank**: Removed DOM measurement during scrolling (`buildPosAnchors`); now uses render-time cache + `vprefix`, and `syncAnchors` is coalesced via rAF.
- **编辑↔预览滑动不准**：编辑器折行感知（等宽字体 `ceil(字数/每行字符数)`），代码块按行插值，虚拟化阈值调优。
  **Inaccurate Edit↔Preview sliding**: Editor word-wrap awareness (monospace font, `ceil(charCount / charsPerLine)`), per-line interpolation for code blocks, and tuned virtualization thresholds.
- RTL 语言（阿拉伯语、乌尔都语）排版与代码/公式双向孤岛稳定性。
  Typography and code/formula bidirectional-island stability for RTL languages (Arabic, Urdu).
- 其他稳定性与细节改进。
  Other stability and detail improvements.

### 升级 / Notes
- 仍是**完全离线**单文件前端 + Tauri v2 外壳，无任何运行时联网。
  Still a **fully offline** single-file frontend + Tauri v2 shell, with no runtime networking.
- 许可证不变：Apache-2.0。
  License unchanged: Apache-2.0.

---

## v1.1.0
- 多格式导出（Markdown / HTML / PDF 矢量打印 / LaTeX）、性能优化、帮助文档、Apache-2.0 开源。
  Multi-format export (Markdown / HTML / PDF vector+bitmap / LaTeX), performance optimizations, help docs, and Apache-2.0 open-sourcing.
