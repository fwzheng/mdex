// 连续慢速滚动复现：从 content 中段步进滚过 CHAPTER 1，采集每步状态，检测 editor/preview 跳开头。
import { chromium, webkit } from 'playwright-core';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = process.argv[2] || 'dist/index.html';
const fileUrl = 'file://' + join(ROOT, HTML);
const MD = readFileSync(join(ROOT, 'example/Quantum_Many-Particle_Systems_Negele_Orland_1998.md'), 'utf8');
const lineOf = (off) => off >= 0 ? MD.slice(0, off).split('\n').length : -1;

// BROWSER=webkit 用 WKWebView 引擎复现 macOS Tauri 行为；默认 chromium
const BROWSER = process.env.BROWSER || 'chromium';
const engine = BROWSER === 'webkit' ? webkit : chromium;
const launchOpts = { headless: true };
if (BROWSER !== 'webkit') launchOpts.executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await engine.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(fileUrl);
await page.waitForSelector('.cm-editor');
await page.evaluate((md) => {
  window.__cm.dispatch({ changes: { from: 0, to: window.__cm.state.doc.length, insert: md } });
}, MD);
await page.waitForTimeout(2500);

const trace = await page.evaluate(async () => {
  const v = window.__cm, sd = v.scrollDOM, pv = document.getElementById('preview');
  const out = [];
  const maxE = sd.scrollHeight - sd.clientHeight;
  sd.scrollTop = maxE * (150 / 14846);  // content 中后段
  await new Promise(r => setTimeout(r, 600));
  for (let i = 0; i < 70; i++) {
    sd.scrollTop += 48;
    sd.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise(r => setTimeout(r, 130));
    const r = sd.getBoundingClientRect();
    let eOff = -1;
    const p = v.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 });
    if (p != null) eOff = p;
    let eY = -1;
    const c = v.coordsAtPos(Math.max(0, Math.min(eOff >= 0 ? eOff : 0, v.state.doc.length)));
    if (c) eY = c.top - sd.getBoundingClientRect().top + sd.scrollTop;
    const topOff = v.lineBlockAtHeight(sd.scrollTop).from;
    const botOff = v.lineBlockAtHeight(sd.scrollTop + sd.clientHeight).from;
    const vt = pv.children[0], vc = pv.children[1], vb = pv.children[2];
    const vcKids = vc ? vc.children : [];
    const first = vcKids[0], last = vcKids[vcKids.length - 1];
    out.push({
      i, ed: Math.round(sd.scrollTop), edMax: Math.round(maxE),
      eOff, eY: Math.round(eY), inView: (eOff >= topOff && eOff <= botOff) ? 1 : 0,
      pv: Math.round(pv.scrollTop), pvMax: Math.round(pv.scrollHeight - pv.clientHeight),
      vtH: vt ? (parseInt(vt.style.height) || 0) : -1,
      vbH: vb ? (parseInt(vb.style.height) || 0) : -1,
      vcN: vcKids.length,
      firstOff: first ? parseInt(first.getAttribute('data-src-offset')) : -1,
      firstEnd: first ? parseInt(first.getAttribute('data-src-end')) : -1,
      lastOff: last ? parseInt(last.getAttribute('data-src-offset')) : -1,
      lastEnd: last ? parseInt(last.getAttribute('data-src-end')) : -1,
    });
  }
  return out;
});

let jumped = false;
console.log('步 edScroll | eOff(行) eY inV | pvScroll(ratio) | vtH vbH vcN | first[off..end] last[off..end]');
for (const t of trace) {
  const prev = trace[t.i - 1];
  const edJump = prev && t.ed < prev.ed - 200;
  const pvJump = prev && t.pv < prev.pv - 200;
  if (edJump || pvJump) jumped = true;
  const flag = edJump ? '⚠ed跳' : (pvJump ? '⚠pv跳' : '');
  console.log(`${String(t.i).padStart(2)} ${String(t.ed).padStart(7)}/${t.edMax} | ${String(t.eOff).padStart(7)}(行${String(lineOf(t.eOff)).padStart(3)}) ${String(t.eY).padStart(7)} ${t.inView ? 'Y' : 'N'} | ${String(t.pv).padStart(6)}(${((t.pvMax ? t.pv / t.pvMax : 0) * 100).toFixed(0).padStart(2)}%) | ${String(t.vtH).padStart(6)} ${String(t.vbH).padStart(6)} ${t.vcN} | [${t.firstOff}..${t.firstEnd}] [${t.lastOff}..${t.lastEnd}] ${flag}`);
}
console.log('------------------------------------------------------------');
console.log(jumped ? '❌ 复现：滚动中出现 editor/preview 回退（跳开头）' : '✓ 未复现：editor/preview 单调递增，无跳开头');
await browser.close();
process.exit(jumped ? 1 : 0);
