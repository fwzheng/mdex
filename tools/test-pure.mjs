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

// 按 `function name(` 定位起点，花括号深度匹配找到函数体结束，返回完整函数源码。
// 注意：朴素花括号计数不识别字符串/注释内的括号，故仅用于【函数体内不含 { } 字面量】的纯函数
// （dirOf/baseName/relPath/trimUndoBytes 均满足）。新增被测函数前请确认此约束。
function extractFn(name) {
  const startRe = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = startRe.exec(SRC);
  if (!m) throw new Error(`未找到函数 ${name}`);
  let i = SRC.indexOf("{", m.index);
  if (i < 0) throw new Error(`${name}: 找不到函数体起始 {`);
  let depth = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") {
      depth--;
      if (depth === 0) return SRC.slice(m.index, j + 1);
    }
  }
  throw new Error(`${name}: 函数体未闭合`);
}

// 抽取单行常量声明（如 const UNDO_BYTE_BUDGET = ...;）。
function extractConst(name) {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[^;\\n]+;`);
  const m = re.exec(SRC);
  if (!m) throw new Error(`未找到常量 ${name}`);
  return m[0];
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

// ---- 汇总 ----
console.log(`\n${failed === 0 ? "✅ 全部通过" : "✗ 有失败"}：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
