// 预览驱动滚 content 段复现：mouse.wheel 滚预览，抓 editor 跟随状态(卡/跳/错位)。
// 检测：卡住(pv 进、ed 不进)、跳动(回退)、错位(比例发散)。
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
// content 段行范围（CONTENTS 起始 ~ CHAPTER 1 前）
const CONTENT_START_LINE = 78, CHAPTER1_LINE = 224;

const BROWSER = process.env.BROWSER || 'webkit';
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
await page.waitForTimeout(2800);

// 清空日志，预览滚到 content 段开头
await page.evaluate(() => { const pv = document.getElementById('preview'); pv.scrollTop = 0; });
await page.waitForTimeout(500);

const pvBox = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; });
await page.mouse.move(pvBox.x, pvBox.y);

const trace = [];
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel(0, 70);
  await page.waitForTimeout(160);
  const t = await page.evaluate(() => {
    const v = window.__cm, sd = v.scrollDOM, pv = document.getElementById('preview');
    const r = sd.getBoundingClientRect();
    let eOff = -1; const p = v.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 }); if (p != null) eOff = p;
    return {
      ed: Math.round(sd.scrollTop), edMax: Math.round(sd.scrollHeight - sd.clientHeight),
      eOff,
      pv: Math.round(pv.scrollTop), pvMax: Math.round(pv.scrollHeight - pv.clientHeight),
    };
  });
  trace.push({ i, ...t });
}

let stuck = 0, jumped = 0;
console.log(`=== ${BROWSER} | content 段预览驱动滚动 ===`);
console.log('步 | pvSt(ratio) | edSt(ratio) | eOff(行) | 标志');
for (const t of trace) {
  const prev = trace[t.i - 1];
  const pvAdv = prev ? t.pv - prev.pv : 0;
  const edAdv = prev ? t.ed - prev.ed : 0;
  const edJump = prev && t.ed < prev.ed - 150;
  const isStuck = prev && pvAdv > 40 && Math.abs(edAdv) < 8 && t.i > 1;   // 预览在进、编辑器不动(跳过首帧 rAF 启动伪卡)
  if (isStuck) stuck++;
  if (edJump) jumped++;
  const flag = edJump ? '⚠ed跳' : (isStuck ? '⚠卡' : '');
  console.log(`${String(t.i).padStart(2)} | ${String(t.pv).padStart(6)}(${((t.pvMax ? t.pv / t.pvMax : 0) * 100).toFixed(0).padStart(2)}%) | ${String(t.ed).padStart(6)}(${((t.edMax ? t.ed / t.edMax : 0) * 100).toFixed(0).padStart(2)}%) | ${String(t.eOff).padStart(7)}(行${String(lineOf(t.eOff)).padStart(3)}) | ${flag}`);
}
console.log('------------------------------------------------------------');
console.log(`卡住步=${stuck}  跳动步=${jumped}`);
console.log(jumped > 0 ? '❌ 复现：预览滚 content 时 editor 跳' : '✓ 未复现');
await browser.close();
process.exit(jumped > 0 ? 1 : 0);
