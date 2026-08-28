// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 <fw@spinss.cn>
//
// 把 CodeMirror 6 + Lezer markdown 等多包经 esbuild 打成单 IIFE → vendor/codemirror.js，
// 入口 src/cm-entry.js 内已赋 window.CM = {...}，故无需 globalName。
//
// vendor/codemirror.js 提交进库；tools/build-html.mjs 只内联、不需要 esbuild。
// 仅升级 CM 版本（或 cm-entry.js 增删 API）时跑 `npm run build:cm` 重生成并提交。
//
// 思路仿 tools/fetch-vendor.mjs 的 ESM→IIFE（bibtex），但用 esbuild 做多包合并/摇树/压缩（更干净）。
import { build } from "esbuild";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENTRY = join(ROOT, "src", "cm-entry.js");
const OUT = join(ROOT, "vendor", "codemirror.js");
const INTEGRITY = join(ROOT, "vendor", "integrity.json");

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "iife",          // 包成 (function(){...})(); 入口内 window.CM=... 暴露全局
  target: "es2017",        // 与其它 vendor / fetch-vendor 的 bibtex 一致
  minify: true,
  legalComments: "none",
  sourcemap: false,
  write: false,
  logLevel: "warning",
});

const code = result.outputFiles[0].text;
await writeFile(OUT, code, "utf8");
const kb = (Buffer.byteLength(code, "utf8") / 1024).toFixed(1);
console.log(`✓ vendor/codemirror.js (${kb} KB, minified IIFE, global window.CM)`);

// 刷新 vendor/integrity.json 里的 SHA-256 锁（与 fetch-vendor.mjs 一致的供应链校验）
try {
  const raw = await readFile(INTEGRITY, "utf8");
  const lock = JSON.parse(raw);
  lock["codemirror.js"] = createHash("sha256").update(code, "utf8").digest("hex");
  await writeFile(INTEGRITY, JSON.stringify(lock, null, 2) + "\n", "utf8");
  console.log("✓ vendor/integrity.json 已更新 codemirror.js 哈希");
} catch (e) {
  console.warn("  ⚠ 未能更新 integrity.json（不影响 build:html，仅供应链校验）:", e.message);
}
