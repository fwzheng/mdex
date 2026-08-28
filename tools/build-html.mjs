// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 <fw@spinss.cn>
//
// 把 vendor/ 内联进 app-shell.html → dist/index.html，产出完全离线的单文件。
// KaTeX 字体以 base64 内嵌（无任何远程字体请求）。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VENDOR = join(ROOT, "vendor");
const DIST = join(ROOT, "dist");

if (!existsSync(VENDOR)) {
  console.error("✗ 未找到 vendor/。请先运行:  npm run fetch");
  process.exit(1);
}

const read = (rel) => readFile(join(VENDOR, rel), "utf8");

// ---- 把 highlight.js 深色主题的选择器加 html.dark 前缀，便于主题切换 ----
function scopeTheme(css, scope) {
  return css.replace(/([^{}]+)\{/g, (_m, sel) => {
    const scoped = sel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${scope} ${s}`)
      .join(", ");
    return scoped + " {";
  });
}

// ---- 把 KaTeX CSS 中的 @font-face 改写为 base64 内嵌（仅 woff2）----
async function inlineKatexFonts(css) {
  const fontsDir = join(VENDOR, "katex", "fonts");
  const woff2Map = {};
  if (existsSync(fontsDir)) {
    const { readdir } = await import("node:fs/promises");
    for (const f of await readdir(fontsDir)) {
      if (!f.endsWith(".woff2")) continue;
      const buf = await readFile(join(fontsDir, f));
      woff2Map[f] = buf.toString("base64");
    }
  }
  const missing = [];
  const out = css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const m = block.match(/url\(fonts\/([^)]+\.woff2)\)/);
    if (!m) return block;
    const fname = m[1];
    const b64 = woff2Map[fname];
    if (!b64) {
      missing.push(fname);
      return block.replace(/src:[^;]+;/, "src: local('serif');");
    }
    const family = block.match(/font-family:\s*([^;]+);/);
    const weight = block.match(/font-weight:\s*([^;]+);/);
    const style = block.match(/font-style:\s*([^;]+);/);
    return (
      "@font-face{font-family:" + (family ? family[1] : "KaTeX") +
      ";src:url(data:font/woff2;base64," + b64 + ") format('woff2')" +
      ";font-weight:" + (weight ? weight[1] : "normal") +
      ";font-style:" + (style ? style[1] : "normal") + ";}"
    );
  });
  if (missing.length) console.warn("  ⚠ 缺少字体（已回退 local）:", missing.join(", "));
  return out;
}

async function build() {
  console.log("→ 组装离线 index.html …");
  let shell = await readFile(join(ROOT, "app-shell.html"), "utf8");

  // ===== 应用脚本（从 src/*.js 内联到 <!--APP:js-->，模块化但不引入打包器，保持单文件离线产物）=====
  // i18n.js / help.js 是纯数据（挂 window.I18N / window.HELP_DATA），必须在 app.js(IIFE) 之前执行，
  // app.js 用 "const X = window.X" 接回（抽离自 app.js，见 tools/extract-i18n-help.mjs）。
  // 顺序：i18n → help → app；app.js 自带的顶层 "use strict" 拼接后不在首行，由前缀统一启用 strict。
  const appJs = await readFile(join(ROOT, "src", "app.js"), "utf8");
  const i18nJs = await readFile(join(ROOT, "src", "i18n.js"), "utf8");
  const helpJs = await readFile(join(ROOT, "src", "help.js"), "utf8");
  // 编辑器后端开关：默认 CodeMirror（CM，精准同步；Phase 0-3 已验），MDEX_EDITOR=textarea 用旧 textarea。
  // app.js 启动时读 window.__MDEX_EDITOR__（运行时可用 localStorage["mdex-editor"] 覆盖，Cmd/Ctrl+Shift+E 切换）。
  const editorMode = process.env.MDEX_EDITOR === "textarea" ? "textarea" : "cm";
  const combinedApp = `"use strict";\nwindow.__MDEX_EDITOR__=${JSON.stringify(editorMode)};\n${i18nJs}\n${helpJs}\n${appJs}`;

  // ===== CSS =====（并行读取 #性能12；转换仍串行，因依赖读取结果）
  const [hljsLightRaw, hljsDarkRaw, katexCssRaw] = await Promise.all([
    read("highlight.js/github.css"),
    read("highlight.js/github-dark.css"),
    read("katex/katex.min.css"),
  ]);
  const hljsLight = hljsLightRaw;
  const hljsDark = scopeTheme(hljsDarkRaw, "html.dark");
  const katex = await inlineKatexFonts(katexCssRaw);
  const vendorCss = `\n<!--VENDOR CSS (highlight.js + KaTeX, fonts inlined as base64) -->\n<style>\n${hljsLight}\n${hljsDark}\n${katex}\n</style>\n`;

  // ===== JS (顺序很重要：库在前，应用脚本在后) =====（并行读取 #性能12）
  // 说明：jsPDF/html2canvas-pro 仅供「另存为→PDF」导出；html2canvas-pro 支持 oklch/color-mix/color()
  //   （原版 1.4.1 在 WKWebView 下遇 color(srgb…) 计算色会抛 "unsupported color function"）。
  //   turndown + GFM 插件用于 HTML→Markdown 转换（表格/任务列表/删除线）。
  const [cmJs, purify, marked, katexJs, autoRender, hljsJs, jspdfJs, svg2pdfJs, html2canvasJs, turndownJs, turndownGfmJs, bibtexJs, mermaidJs] = await Promise.all([
    read("codemirror.js"),
    read("purify.min.js"),
    read("marked.min.js"),
    read("katex/katex.min.js"),
    read("katex/auto-render.min.js"),
    read("highlight.js/highlight.min.js"),
    read("jspdf.umd.min.js"),
    read("svg2pdf.umd.min.js"),
    read("html2canvas-pro.min.js"),
    read("turndown.js"),
    read("turndown-plugin-gfm.js"),
    read("bibtex-parser.min.js"),
    read("mermaid.min.js"),
  ]);
  const vendorJs =
    `\n<!--VENDOR JS (CodeMirror 6 → window.CM; DOMPurify, marked, KaTeX, auto-render, highlight.js, jsPDF, html2canvas-pro, turndown, bibtex-parser, mermaid) -->\n` +
    `<script>${cmJs}</script>\n` +
    `<script>${purify}</script>\n` +
    `<script>${marked}</script>\n` +
    `<script id="katex-src">${katexJs}</script>\n` +
    `<script id="katex-autorender-src">${autoRender}</script>\n` +
    `<script>${hljsJs}</script>\n` +
    `<script>${jspdfJs}</script>\n` +
    `<script>${svg2pdfJs}</script>\n` +
    `<script>${html2canvasJs}</script>\n` +
    `<script>${turndownJs}</script>\n` +
    `<script>${turndownGfmJs}</script>\n` +
    `<script>${bibtexJs}</script>\n` +
    `<script id="mermaid-src">${mermaidJs}</script>\n`;

  if (!shell.includes("<!--VENDOR:css-->") || !shell.includes("<!--VENDOR:js-->") || !shell.includes("<!--APP:js-->")) {
    console.error("✗ app-shell.html 缺少 <!--VENDOR:css--> / <!--VENDOR:js--> / <!--APP:js--> 标记");
    process.exit(1);
  }
  // 必须用函数替换：若用字符串，vendor 代码里的 $& $` $' $n 会被当成 replace 的特殊模式
  // （例如 katex 的 "$&" 会被替换成匹配串 "<!--VENDOR:js-->"，导致脚本损坏、公式无法渲染）。
  shell = shell
    .replace("<!--VENDOR:css-->", () => vendorCss)
    .replace("<!--VENDOR:js-->", () => vendorJs)
    .replace("<!--APP:js-->", () => combinedApp);

  await mkdir(DIST, { recursive: true });
  await writeFile(join(DIST, "index.html"), shell, "utf8");

  const sizeMB = (Buffer.byteLength(shell) / 1024 / 1024).toFixed(2);
  console.log(`✅ 已生成 dist/index.html  (${sizeMB} MB)`);

  // 自检：不应出现任何 http(s) 外链
  const httpMatches = shell.match(/https?:\/\/[^"')\s]+/g) || [];
  const external = httpMatches.filter((u) => !/^https?:\/\/www\.w3\.org/.test(u));
  if (external.length) {
    console.warn("  ⚠ 发现可能的外链:");
    external.slice(0, 10).forEach((u) => console.warn("    " + u));
  } else {
    console.log("  ✓ 自检通过：无外部 http(s) 链接");
  }
}

build().catch((e) => {
  console.error("✗ 构建失败:", e);
  process.exit(1);
});
