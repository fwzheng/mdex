// 连续预览驱动滚动（从顶经 content 滚进 chapter1+），模拟真实用户连续拖预览。检测跳/卡。
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

const BROWSER = process.env.BROWSER || 'webkit';
const engine = BROWSER === 'webkit' ? webkit : chromium;
const launchOpts = { headless: true };
if (BROWSER !== 'webkit') launchOpts.executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await engine.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(fileUrl);
await page.waitForSelector('.cm-editor');
await page.evaluate((md) => { window.__cm.dispatch({ changes: { from: 0, to: window.__cm.state.doc.length, insert: md } }); }, MD);
await page.waitForTimeout(2800);

await page.evaluate(() => { document.getElementById('preview').scrollTop = 0; });
await page.waitForTimeout(400);
const pvBox = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; });
await page.mouse.move(pvBox.x, pvBox.y);

let jumps = 0, stuck = 0;
let prev = null;
const flags = [];
for (let i = 0; i < 130; i++) {
  await page.mouse.wheel(0, 70);
  await page.waitForTimeout(130);
  const t = await page.evaluate(() => {
    const sd = window.__cm.scrollDOM, pv = document.getElementById('preview');
    const r = sd.getBoundingClientRect();
    let eOff = -1; const p = window.__cm.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 }); if (p != null) eOff = p;
    return { ed: Math.round(sd.scrollTop), eOff, pv: Math.round(pv.scrollTop) };
  });
  if (prev) {
    const edJ = t.ed < prev.ed - 200, pvJ = t.pv < prev.pv - 200;
    const pvAdv = t.pv - prev.pv, stk = pvAdv > 40 && Math.abs(t.ed - prev.ed) < 6;
    if (edJ || pvJ) { jumps++; flags.push(`${i}:⚠${edJ ? 'ed跳' : 'pv跳'}(ed${prev.ed}->${t.ed} pv${prev.pv}->${t.pv} 行${lineOf(t.eOff)})`); }
    if (stk) stuck++;
  }
  prev = t;
}
console.log(`=== ${BROWSER} 连续预览滚动 130 步(顶→chapter1+) ===`);
console.log(`jumps=${jumps} stuck=${stuck}`);
if (flags.length) flags.slice(0, 10).forEach(f => console.log('  ' + f));
console.log(jumps > 0 ? '❌ 复现' : '✓ 未复现');
await browser.close();
process.exit(jumps > 0 ? 1 : 0);
