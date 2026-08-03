// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>
//
// 前端纯逻辑层回归测试（E1 测试护栏）。
// 背景：应用逻辑现位于 src/app.js（由 build-html.mjs 构建期内联回 app-shell.html）。
// 为锁住高风险纯函数（路径处理 BUG-080 家族、撤销字节封顶 C4 等），本文件直接从 src/app.js
// 源码本体按【花括号匹配】抽取目标函数，在干净作用域 eval 后跑断言——测试的是【真实源码】而非副本。
//
// 运行：npm test
// 退出码：全过 0，有失败 1。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "src", "app.js"), "utf8");

// ---- 源码抽取 ----

// 字符串/正则/注释感知的括号扫描：openIdx 指向起始 {，返回匹配 } 的索引（-1 未闭合）。
// 朴素花括号计数会把字符串/正则/注释里的 { } 误计（如 LaTeX 函数体里的 "\\textbf{...}"、
// 引用正则 /\{([^}]*)\}/、TEX_ESC_MAP 值 "\\textasciitilde{}"），故必须跳过这些上下文。
function matchBrace(src, openIdx) {
  let depth = 0, prev = "(", j = openIdx;   // prev 初始 ( 使首个 / 不误判为除法
  while (j < src.length) {
    const c = src[j], c2 = src[j + 1];
    if (c === "/" && c2 === "/") { j += 2; while (j < src.length && src[j] !== "\n") j++; continue; }
    if (c === "/" && c2 === "*") { j += 2; while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++; j += 2; prev = "x"; continue; }
    if (c === '"' || c === "'") { const q = c; j++; while (j < src.length && src[j] !== q) { if (src[j] === "\\") j++; j++; } j++; prev = "x"; continue; }
    if (c === "`") { j++; while (j < src.length && src[j] !== "`") { if (src[j] === "\\") j++; j++; } j++; prev = "x"; continue; }
    if (c === "/" && isRegexPrev(prev)) {              // / 在表达式起始位置 → 正则字面量
      j++; let inCls = false;
      while (j < src.length) { const r = src[j]; if (r === "\\") { j += 2; continue; } if (r === "[") inCls = true; else if (r === "]") inCls = false; else if (r === "/" && !inCls) break; else if (r === "\n") break; j++; }
      j++; while (j < src.length && /[A-Za-z]/.test(src[j])) j++; prev = "x"; continue;
    }
    if (c === "{") { depth++; prev = "{"; j++; continue; }
    if (c === "}") { depth--; if (depth === 0) return j; prev = "}"; j++; continue; }
    if (!/\s/.test(c)) prev = c;
    j++;
  }
  return -1;
}
// / 是否起正则字面量：前一有意义字符属于这些（或无前驱）即正则，否则按除法处理。
function isRegexPrev(p) { if (p === "(" || p === "") return true; return "(),=:[!&|?{;+-*/%<>^~".includes(p); }
// 按 `function name(` 定位起点，用 matchBrace（字符串/正则/注释感知）找函数体结束。
function extractFn(name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(SRC);
  if (!m) throw new Error(`未找到函数 ${name}`);
  const ob = SRC.indexOf("{", m.index);
  if (ob < 0) throw new Error(`${name}: 找不到函数体起始 {`);
  const cb = matchBrace(SRC, ob);
  if (cb < 0) throw new Error(`${name}: 函数体未闭合`);
  return SRC.slice(m.index, cb + 1);
}

// 抽取单行常量声明（如 const UNDO_BYTE_BUDGET = ...;）。
function extractConst(name) {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[^;\\n]+;`);
  const m = re.exec(SRC);
  if (!m) throw new Error(`未找到常量 ${name}`);
  return m[0];
}

// 抽取多行 const 块（对象字面量 / 箭头函数），如 TEX_ESC_MAP（多行对象，值含 "{}"）、texEsc（箭头+含 { } 的正则）。
// { 起始的用 matchBrace；非 { 起始（箭头/字面量）按单行读到 ;。
function extractConstBlock(name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\b\\s*=`).exec(SRC);
  if (!m) throw new Error(`未找到 const ${name}`);
  let i = m.index + m[0].length;
  while (i < SRC.length && /\s/.test(SRC[i])) i++;
  if (SRC[i] === "{") {
    const cb = matchBrace(SRC, i);
    if (cb < 0) throw new Error(`${name}: 块未闭合`);
    return SRC.slice(m.index, cb + 1) + ";";
  }
  const semi = SRC.indexOf(";", i);
  return SRC.slice(m.index, semi + 1);
}

// 把若干已抽取片段拼成 IIFE 并 eval，返回其中指定名字。
// 间接 eval（(0, eval)）在全局作用域执行；片段为项目自有源码，安全。
function evalFns(snippetList, names) {
  const code = `(function(){ "use strict";\n${snippetList.join("\n")}\nreturn { ${names.join(", ")} };\n})()`;
  const obj = (0, eval)(code);
  for (const n of names) if (typeof obj[n] === "undefined") throw new Error(`eval 后取不到 ${n}`);
  return obj;
}

// ---- 极简断言 ----
let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
  ok ? passed++ : failed++;
}
function truthy(v, label) {
  console.log(`${v ? "✓" : "✗"} ${label}`);
  v ? passed++ : failed++;
}

// ---- 测试：路径工具（dirOf / baseName / relPath，BUG-080 家族）----
const pathFns = evalFns([extractFn("dirOf"), extractFn("baseName"), extractFn("relPath")], ["dirOf", "baseName", "relPath"]);

eq(pathFns.dirOf("/a/b/c.md"), "/a/b", "dirOf: Unix 绝对路径取目录");
eq(pathFns.dirOf("c.md"), "", "dirOf: 无目录返回空");
eq(pathFns.dirOf("a\\b\\c.md"), "a\\b", "dirOf: Windows 反斜杠取目录（BUG-080）");
eq(pathFns.dirOf("/a/b\\c.md"), "/a/b", "dirOf: 混合分隔符取最后分隔符之前");

eq(pathFns.baseName("/a/b/c.md"), "c.md", "baseName: Unix 取文件名");
eq(pathFns.baseName("c.md"), "c.md", "baseName: 无目录原样返回");
eq(pathFns.baseName("a\\b\\c.md"), "c.md", "baseName: Windows 反斜杠取文件名");

eq(pathFns.relPath("/a/b", "/a/b/c.png"), "c.png", "relPath: 同目录直接文件名");
eq(pathFns.relPath("/a/b", "/a/c.png"), "../c.png", "relPath: 父级一次 ../");
eq(pathFns.relPath("/a/b", "/x/y/c.png"), "../../x/y/c.png", "relPath: 跨分支双 ../");
eq(pathFns.relPath("", "/a/b/c.png"), "/a/b/c.png", "relPath: 无 fromDir 返回绝对路径");
eq(pathFns.relPath("/a/b", "/a/b"), ".", "relPath: 相同路径返回 .");
eq(pathFns.relPath("C:\\docs", "C:\\docs\\img\\a.png"), "img/a.png", "relPath: Windows 路径混合分隔符输出正斜杠（BUG-080）");

// ---- 测试：撤销栈字节预算封顶（C4）----
const undoFns = evalFns(
  [extractConst("UNDO_BYTE_BUDGET"), extractFn("trimUndoBytes")],
  ["UNDO_BYTE_BUDGET", "trimUndoBytes"],
);
{
  const { UNDO_BYTE_BUDGET, trimUndoBytes } = undoFns;
  // 模拟大文档快照：单条约 5MB，11 条 ≈ 55MB > 48MB 预算
  const big = "x".repeat(5 * 1024 * 1024);
  const stack = [];
  for (let i = 0; i < 11; i++) stack.push({ v: big, s: 0, e: 0 });
  trimUndoBytes(stack);
  let total = stack.reduce((a, e) => a + e.v.length, 0);
  truthy(total <= UNDO_BYTE_BUDGET, `trimUndoBytes: 封顶后总字节 ${total} ≤ 预算 ${UNDO_BYTE_BUDGET}`);
  truthy(stack.length >= 1, `trimUndoBytes: 至少保留 1 条（实际 ${stack.length}）`);

  // 小栈不动
  const small = [{ v: "hi", s: 0, e: 0 }];
  trimUndoBytes(small);
  eq(small.length, 1, "trimUndoBytes: 小栈不裁剪");
  eq(small[0].v, "hi", "trimUndoBytes: 小栈内容不变");
}

// ---- 测试：另存为时图片引用改写决策（运行时反馈回归点）----
const imgFns = evalFns([extractFn("imgRefAfterSave")], ["imgRefAfterSave"]);
eq(
  imgFns.imgRefAfterSave(true, "doc_images", "a.jpg", "images/a.jpg"),
  "doc_images/a.jpg",
  "imgRefAfterSave: 拷贝成功 → 改写为 <stem>_images/<名>",
);
eq(
  imgFns.imgRefAfterSave(false, "doc_images", "a.jpg", "images/a.jpg"),
  "images/a.jpg",
  "imgRefAfterSave: 拷贝失败 → 保留原引用（不伪造新路径）",
);
eq(
  imgFns.imgRefAfterSave(false, "doc_images", "a.jpg", "BN14888_images/a.jpg"),
  "BN14888_images/a.jpg",
  "imgRefAfterSave: 失败时不改写成断链 <stem>_images/ 路径（回归点）",
);

// ---- 测试：LaTeX 导出核心（texInline / texColor / detectTexLangs，BUG-075/037 家族）----
// texInline 依赖 texEsc(箭头常量) + TEX_ESC_MAP(多行对象) + texEscText + texColor + parseCiteInner；
// 这些函数体含 { } 字面量（\textbf{} 等）与引用正则 /\{([^}]*)\}/，须用字符串/正则感知抽取。
const texFns = evalFns([
  extractConstBlock("TEX_ESC_MAP"), extractConstBlock("texEsc"),
  extractFn("texEscText"), extractFn("texColor"), extractFn("parseCiteInner"),
  extractFn("texInline"), extractFn("detectTexLangs"),
], ["texInline", "texColor", "detectTexLangs"]);
// texInline：行内 Markdown → LaTeX（加粗/斜体/代码/删除线/数学/链接/引用）
eq(texFns.texInline("**bold**"), "\\textbf{bold}", "texInline: **加粗** → \\textbf{}");
eq(texFns.texInline("*it*"), "\\textit{it}", "texInline: *斜体* → \\textit{}");
eq(texFns.texInline("`code`"), "\\texttt{code}", "texInline: `代码` → \\texttt{}（经 texEsc）");
eq(texFns.texInline("$x_2$"), "$x_2$", "texInline: 行内数学原样保留（不转义，BUG-075）");
eq(texFns.texInline("~~s~~"), "\\sout{s}", "texInline: ~~删除线~~ → \\sout{}");
eq(texFns.texInline("[t](u)"), "\\href{u}{t}", "texInline: [文本](链接) → \\href{}{}");
eq(texFns.texInline("[@smith2020]"), "\\cite{smith2020}", "texInline: [@key] 引用 → \\cite{}");
eq(texFns.texInline("plain text"), "plain text", "texInline: 纯文本原样（无 markdown 语法）");
// texColor：CSS 颜色 → xcolor 参数
eq(texFns.texColor("#ff0000"), "[HTML]{FF0000}", "texColor: #rrggbb → [HTML]{大写}");
eq(texFns.texColor("#abc"), "[HTML]{AABBCC}", "texColor: #rgb 展开 → [HTML]{AABBCC}");
eq(texFns.texColor("rgb(1,2,3)"), "[RGB]{1,2,3}", "texColor: rgb() → [RGB]{}");
eq(texFns.texColor("red"), "{red}", "texColor: 命名色 → {name}");
// detectTexLangs：字符集检测决定导言区多语言包（CJK/复杂脚本 → xelatex）
truthy(texFns.detectTexLangs("中文文档").has("cjk"), "detectTexLangs: CJK 检测");
truthy(texFns.detectTexLangs("مرحبا").has("arabic"), "detectTexLangs: 阿拉伯检测");
truthy(texFns.detectTexLangs("Привет").has("cyrillic"), "detectTexLangs: 西里尔检测");
truthy(texFns.detectTexLangs("hello world").size === 0, "detectTexLangs: 纯拉丁 → 空（走 pdflatex）");

// ---- 汇总 ----
console.log(`\n${failed === 0 ? "✅ 全部通过" : "✗ 有失败"}：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
