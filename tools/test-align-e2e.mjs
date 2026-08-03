// 端到端对齐测试：加载真实 dist/index.html（含修复），注入 test 文件，
// 验证 (1) 预览块 data-src-offset 与 marked 顶层块一一对应；(2) 滚动同步不累积偏移。
import { chromium } from 'playwright-core';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const marked = require('../vendor/marked.min.js');
marked.setOptions({ gfm: true, breaks: false });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MD = readFileSync(join(ROOT, 'test/AI_教学赛道.md'), 'utf8');
const SRC_LINES = MD.split('\n');

// marked lexer 的“正确”顶层块起始 offset 序列（与新 srcBlockOffsets 同源）
const correctOffs = [];
{
  let s = 0;
  for (const tk of marked.lexer(MD).filter(x => x.type !== 'space')) {
    if (!tk.raw) continue;
    const probe = tk.raw.replace(/\n+$/, '');
    let idx = probe ? MD.indexOf(probe, s) : s;
    if (idx < 0) idx = s;
    correctOffs.push(idx);
    s = idx + tk.raw.length;
  }
}
const lineOf = (off) => MD.slice(0, off).split('\n').length;

const HTML = process.argv[2] || 'dist/index.html';
const LABEL = process.argv[3] || '';
const fileUrl = HTML.startsWith('/') ? 'file://' + HTML : 'file://' + join(ROOT, HTML);

// 浏览器路径：优先 CHROME_PATH 环境变量，默认 macOS 的 Google Chrome；
// Linux/Windows/CI 请 `export CHROME_PATH=/path/to/chrome`（playwright-core 不自带浏览器）。
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text().slice(0, 160)); });
await page.goto(fileUrl);
await page.waitForSelector('#editor');

// 切分屏 + 注入内容
await page.evaluate((md) => {
  const splitBtn = document.querySelector('[data-mode="split"], [data-view="split"]');
  if (splitBtn) splitBtn.click();
  const ed = document.getElementById('editor');
  ed.value = md;
  ed.dispatchEvent(new Event('input', { bubbles: true }));
}, MD);
await page.waitForTimeout(600);

// ---- 测试 1：块对应 ----
const dom = await page.evaluate(() => {
  const pv = document.getElementById('preview');
  const kids = Array.from(pv.children);
  return {
    mode: document.body.getAttribute('data-mode') || document.body.className || '?',
    editorLen: document.getElementById('editor').value.length,
    pvScrollH: pv.scrollHeight,
    blocks: kids.map(k => ({
      off: parseInt(k.getAttribute('data-src-offset') || '-1', 10),
      tag: k.tagName, h: k.offsetHeight,
      text: (k.textContent || '').replace(/\s+/g, ' ').slice(0, 22),
    })),
  };
});

console.log('============================================================' + (LABEL ? `  [${LABEL}]` : ''));
console.log('视图模式:', dom.mode, '| editor 长度:', dom.editorLen, '| preview scrollH:', dom.pvScrollH);
console.log('DOM 预览块数:', dom.blocks.length, '| marked 正确块数:', correctOffs.length);
console.log('------------------------------------------------------------');
console.log('测试1: 预览块 data-src-offset 是否与 marked 顶层块一一对应');
let bad = 0, monotonic = 0;
for (let i = 0; i < dom.blocks.length; i++) {
  const ok = dom.blocks[i].off === correctOffs[i];
  if (!ok) bad++;
  if (i > 0 && dom.blocks[i].off <= dom.blocks[i - 1].off) monotonic++;
}
// 抽样打印：前3、错位点周围、后3
const showIdx = new Set([0, 1, 2, dom.blocks.length - 3, dom.blocks.length - 2, dom.blocks.length - 1]);
for (let i = 0; i < dom.blocks.length; i++) if (dom.blocks[i].off !== correctOffs[i]) { showIdx.add(i); showIdx.add(Math.max(0,i-1)); }
for (const i of [...showIdx].sort((a,b)=>a-b)) {
  if (i >= dom.blocks.length) continue;
  const b = dom.blocks[i];
  const ok = b.off === correctOffs[i];
  const srcAt = MD.slice(b.off, b.off + 22).replace(/\s+/g, ' ');
  console.log(`  ${ok?'✓':'✗'} [${String(i).padStart(2)}] ${b.tag.padEnd(5)} off=${String(b.off).padStart(4)} 正确=${String(correctOffs[i]).padStart(4)} | 块文:"${b.text}" | 源码@off:"${srcAt}"`);
}
console.log(`  → 块对应错位: ${bad} 处 | offset 非严格递增: ${monotonic} 处`);
console.log(bad === 0 && monotonic === 0 ? '  ✅ 测试1 通过：每个预览块都标对了源码起始偏移' : '  ❌ 测试1 失败');

// ---- 测试 2：滚动同步（preview 居中各块 → editor 中线源码行 应与该块源码行接近，且不随位置累积）----
console.log('------------------------------------------------------------');
console.log('测试2: 滚动同步——预览逐块居中时，编辑器中线对应源码行 vs 该块源码行');
const samples = await page.evaluate(async () => {
  const ed = document.getElementById('editor');
  const pv = document.getElementById('preview');
  const probe = document.getElementById('editor-yprobe');
  const dbg = {
    mainClass: (document.getElementById('main') || {}).className,
    pvVis: pv.offsetParent !== null,
    pvH: pv.clientHeight,
    edH: ed.clientHeight,
    probeNodeType: probe.firstChild ? probe.firstChild.nodeType : null,
  };
  const v = ed.value;
  const ls = [0]; { let i = 0; while ((i = v.indexOf('\n', i)) !== -1) ls.push(++i); }
  // editor 视口中线 → probe 行起点 offset。
  // probe 不滚动（scrollTop=0），与 editor 同框/同 padding；editor 中线在 probe 坐标系里的
  // 目标 abs Y = rect.top + scrollTop + clientHeight/2（须含 scrollTop，否则滚动后仍读未滚动位置）。
  function midOff() {
    const midAbs = ed.getBoundingClientRect().top + ed.scrollTop + ed.clientHeight / 2;
    const tn = probe.firstChild;
    if (!tn || tn.nodeType !== 3) return -1;
    let best = 0, bestD = 1e9;
    for (const s of ls) {
      const r = document.createRange(); r.setStart(tn, s); r.setEnd(tn, Math.min(s + 1, tn.length));
      const rect = r.getBoundingClientRect();
      if (!rect.top && !rect.height) continue;
      const d = Math.abs(rect.top - midAbs);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  const kids = Array.from(pv.children);
  const picks = [];
  for (let i = 0; i < kids.length; i += Math.max(1, Math.floor(kids.length / 12))) picks.push(i);
  if (picks[picks.length - 1] !== kids.length - 1) picks.push(kids.length - 1);
  const out = [];
  for (const i of picks) {
    const r = kids[i].getBoundingClientRect();
    const pvRect = pv.getBoundingClientRect();
    const blockTopContent = r.top - pvRect.top + pv.scrollTop;
    pv.scrollTop = Math.max(0, blockTopContent - pv.clientHeight / 2 + r.height / 2);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 80));
    // preview 中线命中的顶层块索引（纯几何，不读 data-src-offset —— 旧版该属性错位，读了会"自洽"掩盖问题）
    const midAbs = pvRect.top + pv.clientHeight / 2;
    let pvBlockIdx = -1;
    for (let k = 0; k < kids.length; k++) {
      const rr = kids[k].getBoundingClientRect();
      if (midAbs >= rr.top && midAbs < rr.bottom) { pvBlockIdx = k; break; }
    }
    out.push({ i, pvBlockIdx, eOff: midOff() });
  }
  return { out, dbg };
}).catch(e => { console.log('  evaluate 异常:', e.message); return null; });

if (samples && samples.dbg) {
  console.log('  [调试] #main class:', samples.dbg.mainClass, '| preview 可见:', samples.dbg.pvVis,
    '| pvH:', samples.dbg.pvH, '| edH:', samples.dbg.edH, '| probe 节点类型:', samples.dbg.probeNodeType);
}
const sampleRows = samples ? samples.out : [];
// 失败汇总：任何一项不通过都让进程非零退出（此前无论结果都 exit 0,无法 gating）。
let test2Fail = !samples;   // evaluate 抛异常 → 无样本 → 判失败

// correctOffs 二分：off 落在哪个块号（独立基准，不依赖 DOM 的 data-src-offset）
function blockIdx(off) {
  if (off < correctOffs[0]) return 0;
  if (off >= correctOffs[correctOffs.length - 1]) return correctOffs.length - 1;
  let lo = 0, hi = correctOffs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (correctOffs[mid] <= off) lo = mid; else hi = mid - 1; }
  return lo;
}
if (sampleRows && sampleRows.length) {
  console.log('  设居中块 | 预览中线命中块 | 编辑器中线落在块(源码行) | 块号差(理想0)');
  const diffs = [];
  for (const s of sampleRows) {
    const eIdx = s.eOff >= 0 ? blockIdx(s.eOff) : -1;
    const pIdx = s.pvBlockIdx;
    const diff = (pIdx >= 0 && eIdx >= 0) ? (eIdx - pIdx) : null;
    if (diff !== null) diffs.push({ i: pIdx, d: diff });
    const eLine = s.eOff >= 0 ? lineOf(s.eOff) : -1;
    console.log(`  [居中${String(s.i).padStart(2)}] pv块=${String(pIdx).padStart(2)} | ed块=${String(eIdx).padStart(2)} (行${String(eLine).padStart(3)}) | 块号差=${diff === null ? '?' : (diff > 0 ? '+' : '') + diff}`);
  }
  const maxAbs = diffs.length ? Math.max(...diffs.map(x => Math.abs(x.d))) : 0;
  let accumVerdict = '（样本不足）';
  if (diffs.length >= 6) {
    const q = Math.floor(diffs.length / 4);
    const mid = diffs.slice(q, diffs.length - q);
    const mean = mid.reduce((a, b) => a + Math.abs(b.d), 0) / mid.length;
    const mi = mid.reduce((a, b) => a + b.i, 0) / mid.length;
    const md = mid.reduce((a, b) => a + b.d, 0) / mid.length;
    let num = 0, den = 0;
    for (const x of mid) { num += (x.i - mi) * (x.d - md); den += (x.i - mi) ** 2; }
    const slope = den ? num / den : 0;
    accumVerdict = `中段平均|块号差|=${mean.toFixed(2)}  斜率=${slope.toFixed(3)} 块/块  ` +
      (Math.abs(slope) > 0.2 && mean > 1 ? '⚠ 越往后越偏（累积错位）' : '✓ 无累积错位');
    test2Fail = test2Fail || (Math.abs(slope) > 0.2 && mean > 1);
  }
  console.log(`  → 最大|块号差|=${maxAbs}`);
  console.log(`  累积性: ${accumVerdict}`);
}

console.log('============================================================');
await browser.close();
// 测试1:块对应错位或 offset 非递增即失败;测试2:累积错位(斜率>0.2 且 平均|差|>1)即失败。
const failed = (bad > 0 || monotonic > 0) || test2Fail;
console.log(failed ? '❌ e2e 失败' : '✅ e2e 通过');
process.exit(failed ? 1 : 0);
