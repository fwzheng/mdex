// 诊断：srcBlockOffsets（按 \n\n 切）vs marked 实际顶层块 —— 是否一一对应
const marked = require("../vendor/marked.min.js");
marked.setOptions({ gfm: true, breaks: false });
const fs = require("fs");
const t = fs.readFileSync(process.argv[2] || "../test/AI_教学赛道.md", "utf8");

// ① app.js 的 srcBlockOffsets 切分
const srcBlocks = [];
let _pos = 0;
for (const part of t.split(/(\n\n+)/)) {
  if (part.trim()) srcBlocks.push({ off: _pos, snip: t.slice(_pos, _pos + 30).replace(/\n/g, "⏎") });
  _pos += part.length;
}

// ② marked lexer 顶层块，顺序定位起始 offset
const toks = marked.lexer(t).filter(tk => tk.type !== "space"); // space 不产生顶层 DOM 元素
const markedBlocks = [];
let searchFrom = 0;
for (const tok of toks) {
  if (!tok.raw) continue;
  const probe = tok.raw.replace(/\n+$/, "");
  const idx = probe ? t.indexOf(probe, searchFrom) : searchFrom;
  const off = idx < 0 ? searchFrom : idx;
  markedBlocks.push({ off, type: tok.type, snip: t.slice(off, off + 30).replace(/\n/g, "⏎") });
  searchFrom = off + tok.raw.length;
}

console.log("srcBlockOffsets 块数:", srcBlocks.length, "| marked 顶层 token 数:", markedBlocks.length);
console.log("\n i | SRC(按空行切) [off]               | MD(marked 实际) [off/type]");
console.log("-".repeat(90));
let firstDiverge = -1;
const N = Math.max(srcBlocks.length, markedBlocks.length);
for (let i = 0; i < N; i++) {
  const a = srcBlocks[i], b = markedBlocks[i];
  const ok = a && b && a.off === b.off;
  if (!ok && firstDiverge < 0) firstDiverge = i;
  const al = a ? `off=${String(a.off).padStart(4)} ${a.snip}` : "—— 无";
  const bl = b ? `off=${String(b.off).padStart(4)} [${b.type}] ${b.snip}` : "—— 无";
  console.log(`${ok ? " " : "⚠"}${String(i).padStart(2)}| ${al.padEnd(36)}| ${bl}`);
}
console.log("\n首个分歧 i =", firstDiverge,
  firstDiverge >= 0 ? "→ 此后 children[i]↔srcBlockOffsets[i] 下标错位，越往后滚动同步偏得越厉害" : "");
