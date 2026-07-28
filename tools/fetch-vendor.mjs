// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>
//
// 一次性下载前端依赖到 vendor/（构建时内联，运行时完全离线）。
// 仅在准备阶段需要网络；之后所有构建都不再联网。
import { mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VENDOR = join(ROOT, "vendor");

// 版本固定，保证可复现
const VERSIONS = {
  marked: "12.0.2",
  katex: "0.16.11",
  highlightjs: "11.9.0",
  dompurify: "3.1.6",
  jspdf: "2.5.2",
  "svg2pdf.js": "2.7.0",
  "html2canvas-pro": "1.5.3",
  turndown: "7.2.0",
  "turndown-plugin-gfm": "1.0.2",
  "@retorquere/bibtex-parser": "10.0.0",
  mermaid: "10.9.3",
};
const CDN = "https://cdn.jsdelivr.net/npm";

const force = process.argv.includes("--force");
if (existsSync(VENDOR) && force) await rm(VENDOR, { recursive: true, force: true });

await mkdir(join(VENDOR, "katex", "fonts"), { recursive: true });
await mkdir(join(VENDOR, "highlight.js"), { recursive: true });

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  return res.text();
}
async function fetchBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}
async function saveText(url, rel) {
  const txt = await fetchText(url);
  await writeFile(join(VENDOR, rel), txt, "utf8");
  console.log("  ✓", rel, `(${txt.length} bytes)`);
  return txt;
}
async function saveBin(url, rel) {
  const buf = await fetchBin(url);
  await writeFile(join(VENDOR, rel), buf);
  console.log("  ✓", rel, `(${buf.length} bytes)`);
  return buf;
}

console.log("→ 下载前端依赖…");

// 1) marked
await saveText(`${CDN}/marked@${VERSIONS.marked}/marked.min.js`, "marked.min.js");

// 2) DOMPurify
await saveText(`${CDN}/dompurify@${VERSIONS.dompurify}/dist/purify.min.js`, "purify.min.js");

// 3) KaTeX (js + css + auto-render)
await saveText(`${CDN}/katex@${VERSIONS.katex}/dist/katex.min.js`, "katex/katex.min.js");
await saveText(
  `${CDN}/katex@${VERSIONS.katex}/dist/contrib/auto-render.min.js`,
  "katex/auto-render.min.js",
);
const katexCss = await saveText(
  `${CDN}/katex@${VERSIONS.katex}/dist/katex.min.css`,
  "katex/katex.min.css",
);

// 3a) KaTeX 字体：通过 jsdelivr flat API 枚举 dist/fonts/*.woff2
const fontListUrl = `${CDN.replace("cdn.jsdelivr.net/npm", "data.jsdelivr.com/v1/package/npm")}/katex@${VERSIONS.katex}/flat`;
console.log("  枚举 KaTeX 字体…");
const listRes = await fetch(fontListUrl);
if (!listRes.ok) throw new Error(`字体列表获取失败 ${listRes.status}`);
const listJson = await listRes.json();
const fontFiles = listJson.files
  .filter((f) => f.name.startsWith(`/dist/fonts/`) && f.name.endsWith(".woff2"))
  .map((f) => f.name.replace("/dist/fonts/", ""));
console.log(`  发现 ${fontFiles.length} 个 woff2 字体`);
for (const f of fontFiles) {
  await saveBin(`${CDN}/katex@${VERSIONS.katex}/dist/fonts/${f}`, `katex/fonts/${f}`);
}

// 4) highlight.js 预构建浏览器 bundle（npm 包内无 UMD，走 cdnjs）
const HLJS = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${VERSIONS.highlightjs}`;
await saveText(`${HLJS}/highlight.min.js`, "highlight.js/highlight.min.js");
await saveText(`${HLJS}/styles/github.min.css`, "highlight.js/github.css");
await saveText(`${HLJS}/styles/github-dark.min.css`, "highlight.js/github-dark.css");

// 5) jsPDF + html2canvas-pro：仅用于「另存为 → PDF」离线导出（预览 DOM → 图片 → 多页 PDF）
//    用 html2canvas-pro 而非原版：原版 1.4.1 在 WKWebView 遇 color(srgb…) 计算色会抛错。
await saveText(`${CDN}/jspdf@${VERSIONS.jspdf}/dist/jspdf.umd.min.js`, "jspdf.umd.min.js");
await saveText(`${CDN}/svg2pdf.js@${VERSIONS["svg2pdf.js"]}/dist/svg2pdf.umd.min.js`, "svg2pdf.umd.min.js");
await saveText(`${CDN}/html2canvas-pro@${VERSIONS["html2canvas-pro"]}/dist/html2canvas-pro.min.js`, "html2canvas-pro.min.js");

// 6) turndown + GFM 插件：HTML→Markdown 转换（档位二）
await saveText(`${CDN}/turndown@${VERSIONS.turndown}/dist/turndown.js`, "turndown.js");
await saveText(`${CDN}/turndown-plugin-gfm@${VERSIONS["turndown-plugin-gfm"]}/dist/turndown-plugin-gfm.js`, "turndown-plugin-gfm.js");

// 7) @retorquere/bibtex-parser —— .bib 文献引用渲染
//    库仅发 ESM/CJS、无 UMD 全局包；取 esm.sh 自包含 bundle（无外链 import），
//    去掉末尾 export{} 改写为 IIFE 全局 window.BibTeXParser（与其它 vendor 一致的内联 <script> 模式）。
//    用 sentenceCase:false 保留原始标题大小写（LaTeX 不自动小写标题）。
{
  const ESM = "https://esm.sh";
  const pkg = `@retorquere/bibtex-parser@${VERSIONS["@retorquere/bibtex-parser"]}`;
  // esm.sh 的 ?bundle 入口可能返回 "export * from '/<path>'" 的再导出，需解析到真实 bundle。
  let url = `${ESM}/${pkg}?bundle&target=es2017`;
  let txt = await fetchText(url);
  for (let i = 0; i < 5; i++) {
    const re = /^export\s+\*\s+from\s+"([^"]+)";/m;
    const m = txt.match(re);
    if (!m) break;
    url = m[1].startsWith("/") ? ESM + m[1] : m[1];
    txt = await fetchText(url);
  }
  const exp = txt.match(/export\{([^}]*)\};/);
  if (!exp) throw new Error("bibtex bundle 未找到 export{} 语句，无法转 IIFE 全局");
  const pairs = exp[1].split(",").map((s) => s.trim()).filter(Boolean);
  const assign =
    "{ " +
    pairs
      .map((p) => {
        const mm = p.match(/^(\w+)\s+as\s+(\w+)$/);
        if (!mm) throw new Error("无法解析 export 项: " + p);
        return `${mm[2]}:${mm[1]}`; // exportedName: localName
      })
      .join(", ") +
    " }";
  // 去掉 export{} 行与末尾 sourceMappingURL 注释，包进 IIFE 并暴露全局
  const body = txt.replace(/export\{[^}]*\};\s*(\/\/# sourceMappingURL=[^\n]*)?/, "");
  const wrapped = `(function(){\n${body}\nwindow.BibTeXParser=${assign};\n}).call(undefined);\n`;
  await writeFile(join(VENDOR, "bibtex-parser.min.js"), wrapped, "utf8");
  console.log(`  ✓ bibtex-parser.min.js (${wrapped.length} bytes) → global window.BibTeXParser { ${pairs.map((p) => p.match(/as\s+(\w+)/)[1]).join(", ")} }`);
}

// 8) mermaid —— ```mermaid 代码块渲染为流程图/时序图等（纯 JS，离线内联）
await saveText(`${CDN}/mermaid@${VERSIONS.mermaid}/dist/mermaid.min.js`, "mermaid.min.js");

// 9) 记录清单
const manifest = {
  versions: VERSIONS,
  generated: new Date().toISOString(),
  fonts: fontFiles,
};
await writeFile(join(VENDOR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// 10) 完整性锁（供应链加固 / S4）：遍历 vendor/ 算每个文件 sha256 → vendor/integrity.json。
//     首次下载为"信任即锁定"；之后若 integrity.json 已存在，比对本次下载的哈希，不一致则报错中止
//     （防 CDN 投毒 / 静默漂移：版本号没变但内容被篡改）。--force 重下载同样会校验旧锁。
async function walkFiles(dir, base = dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(await walkFiles(p, base));
    else out.push(p);
  }
  return out;
}
function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }
const INTEGRITY = join(VENDOR, "integrity.json");
let prev = null;
if (existsSync(INTEGRITY)) {
  try { prev = JSON.parse(await readFile(INTEGRITY, "utf8")); } catch (_) { prev = null; }
}
const files = (await walkFiles(VENDOR)).filter((p) => !p.endsWith("integrity.json"));
const integ = {};
let mismatched = 0;
for (const p of files) {
  const rel = relative(VENDOR, p).replace(/\\/g, "/");
  const h = sha256(await readFile(p));
  integ[rel] = h;
  if (prev && prev[rel] && prev[rel] !== h) {
    console.error(`  ✗ 完整性不符: ${rel}\n    旧 ${prev[rel]}\n    新 ${h}`);
    mismatched++;
  }
}
if (mismatched > 0) {
  console.error(`\n✗ 检测到 ${mismatched} 个依赖文件与上次记录的哈希不符（可能 CDN 投毒/内容漂移）。`);
  console.error(`  如确为有意升级，删除 vendor/integrity.json 后重跑。中止。`);
  process.exit(1);
}
await writeFile(join(VENDOR, "integrity.json"), JSON.stringify(integ, null, 2), "utf8");
console.log(`   完整性锁: ${files.length} 个文件 sha256 已记录到 vendor/integrity.json${prev ? "（与上次一致 ✓）" : "（首次锁定）"}`);

console.log(`\n✅ 完成。依赖已缓存到 vendor/`);
console.log(`   KaTeX CSS 引用的字体: ${(katexCss.match(/url\(fonts\//g) || []).length} 处`);
