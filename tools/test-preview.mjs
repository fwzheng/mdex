// 预览区驱动滚动复现：mouse.wheel 滚预览(模拟用户拖预览)，采集 editor/preview 状态，检测跳回。
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

// 连续滚（从顶经 content 进 chapter1+），不做程序化跳转（程序化设 scrollTop 无用户输入，
// lastPreviewUser gate 使 editor 不跟随→首 wheel 才大跳同步=测试伪影，非真实连续滚动）。
await page.evaluate(() => { document.getElementById('preview').scrollTop = 0; });
await page.waitForTimeout(400);

// mouse 移到预览中心，连续 wheel 下滚
const pvBox = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; });
await page.mouse.move(pvBox.x, pvBox.y);

const trace = [];
for (let i = 0; i < 150; i++) {
  await page.mouse.wheel(0, 80);
  await page.waitForTimeout(140);
  const t = await page.evaluate(() => {
    const v = window.__cm, sd = v.scrollDOM, pv = document.getElementById('preview');
    const r = sd.getBoundingClientRect();
    let eOff = -1; const p = v.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 }); if (p != null) eOff = p;
    const vt = pv.children[0], vc = pv.children[1], vb = pv.children[2];
    const kids = vc ? vc.children : []; const first = kids[0], last = kids[kids.length - 1];
    return {
      ed: Math.round(sd.scrollTop), eOff,
      pv: Math.round(pv.scrollTop), pvMax: Math.round(pv.scrollHeight - pv.clientHeight),
      vtH: vt ? (parseInt(vt.style.height) || 0) : -1,
      vbH: vb ? (parseInt(vb.style.height) || 0) : -1,
      vcN: kids.length,
      firstOff: first ? parseInt(first.getAttribute('data-src-offset')) : -1,
      lastOff: last ? parseInt(last.getAttribute('data-src-offset')) : -1,
    };
  });
  trace.push({ i, ...t });
}

let jumped = false;
console.log('步 | edScroll | eOff(行) | pvScroll(ratio) | vtH vbH vcN | firstOff lastOff');
for (const t of trace) {
  const prev = trace[t.i - 1];
  const edJump = prev && t.ed < prev.ed - 200;
  const pvJump = prev && t.pv < prev.pv - 200;
  if (edJump || pvJump) jumped = true;
  const flag = edJump ? '⚠ed跳' : (pvJump ? '⚠pv跳' : '');
  console.log(`${String(t.i).padStart(2)} | ${String(t.ed).padStart(7)} | ${String(t.eOff).padStart(7)}(行${String(lineOf(t.eOff)).padStart(3)}) | ${String(t.pv).padStart(6)}(${((t.pvMax ? t.pv / t.pvMax : 0) * 100).toFixed(0).padStart(2)}%) | ${String(t.vtH).padStart(6)} ${String(t.vbH).padStart(6)} ${t.vcN} | ${t.firstOff} ${t.lastOff} ${flag}`);
}
console.log('------------------------------------------------------------');
console.log(jumped ? '❌ 复现：预览滚动中出现 editor/preview 回退（跳回）' : '✓ 未复现：预览滚动 editor/preview 单调递增');
await browser.close();
process.exit(jumped ? 1 : 0);
