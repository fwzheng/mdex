// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>
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

  // ===== 应用脚本（从 src/app.js 内联到 <!--APP:js-->，模块化但不引入打包器，保持单文件离线产物）=====
  const appJs = await readFile(join(ROOT, "src", "app.js"), "utf8");

  // ===== CSS =====
  const hljsLight = await read("highlight.js/github.css");
  const hljsDark = scopeTheme(await read("highlight.js/github-dark.css"), "html.dark");
  const katex = await inlineKatexFonts(await read("katex/katex.min.css"));
  const vendorCss = `\n<!--VENDOR CSS (highlight.js + KaTeX, fonts inlined as base64) -->\n<style>\n${hljsLight}\n${hljsDark}\n${katex}\n</style>\n`;

  // ===== JS (顺序很重要：库在前，应用脚本在后) =====
  const purify = await read("purify.min.js");
  const marked = await read("marked.min.js");
  const katexJs = await read("katex/katex.min.js");
  const autoRender = await read("katex/auto-render.min.js");
  const hljsJs = await read("highlight.js/highlight.min.js");
  // 仅用于「另存为 → PDF」导出（离线渲染预览为 PDF）。不在普通编辑/渲染路径加载逻辑里使用。
  // 用 html2canvas-pro（支持 oklch/color-mix/color() 等现代 CSS 颜色），
  // 原版 html2canvas 1.4.1 在 WKWebView 下遇 color(srgb…) 计算色会抛 "unsupported color function"。
  const jspdfJs = await read("jspdf.umd.min.js");
  const svg2pdfJs = await read("svg2pdf.umd.min.js");
  const html2canvasJs = await read("html2canvas-pro.min.js");
  // HTML→Markdown 转换（档位二）。turndown + GFM 插件（表格/任务列表/删除线）。
  const turndownJs = await read("turndown.js");
  const turndownGfmJs = await read("turndown-plugin-gfm.js");
  const bibtexJs = await read("bibtex-parser.min.js");
  const mermaidJs = await read("mermaid.min.js");
  const vendorJs =
    `\n<!--VENDOR JS (DOMPurify, marked, KaTeX, auto-render, highlight.js, jsPDF, html2canvas-pro, turndown, bibtex-parser, mermaid) -->\n` +
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
    .replace("<!--APP:js-->", () => appJs);

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
