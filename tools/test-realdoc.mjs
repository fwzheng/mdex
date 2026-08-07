// 真实文档(1.38MB content 教材)滚动验证：编辑器滚过 content 大段区(行76-222)时，预览跟随且不跳回开头。
// Chrome 下 posAtCoords 正常，本测试验证"守卫不破坏 content 段正常滚动"；posAtCoords 异常场景由 test-posguard.mjs 的 mock 覆盖。
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = process.argv[2] || 'dist/index.html';
const fileUrl = 'file://' + join(ROOT, HTML);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MD = readFileSync(join(ROOT, 'example/Quantum_Many-Particle_Systems_Negele_Orland_1998.md'), 'utf8');
const lineOf = (off) => MD.slice(0, off).split('\n').length;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
await page.goto(fileUrl);
await page.waitForSelector('.cm-editor');
await page.evaluate((md) => {
  window.__cm.dispatch({ changes: { from: 0, to: window.__cm.state.doc.length, insert: md } });
}, MD);
await page.waitForTimeout(2500);

async function measureAt(frac) {
  return await page.evaluate(async (f) => {
    const v = window.__cm, sd = v.scrollDOM, pv = document.getElementById('preview');
    const maxE = sd.scrollHeight - sd.clientHeight;
    sd.scrollTop = Math.max(0, Math.min(maxE, f * maxE));
    await new Promise(r => setTimeout(r, 500));
    const r = sd.getBoundingClientRect();
    let eOff = -1;
    const p = v.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 });
    if (p != null) eOff = p;
    const pr = pv.getBoundingClientRect();
    const midAbs = pr.top + pv.clientHeight / 2;
    const proot = pv.querySelector('.vcontent') || pv;
    let pOff = -1;
    for (let k = 0; k < proot.children.length; k++) {
      const rr = proot.children[k].getBoundingClientRect();
      if (rr.top > midAbs) break;
      pOff = parseInt(proot.children[k].getAttribute('data-src-offset') || '', 10);
    }
    return { eOff, pOff, pvScroll: pv.scrollTop, pvMax: pv.scrollHeight - pv.clientHeight };
  }, frac);
}

// fracs 覆盖：content 中(0.006)、content 末(0.013)、刚过 content(0.02)、正文(0.06)、中段(0.5)、文末(0.95)
const fracs = [0.006, 0.013, 0.02, 0.06, 0.5, 0.95];
console.log('真实文档 1.38MB，content 在行 76-222（约 frac 0.005-0.015）');
console.log('------------------------------------------------------------');
let fail = 0;
for (const f of fracs) {
  const m = await measureAt(f);
  const eLine = m.eOff >= 0 ? lineOf(m.eOff) : -1;
  // 跳开头判定：滚到 content 之后(frac>0.02，对应行>250)但 edOff 落到开头(行<50)
  const jumpToStart = f > 0.02 && m.eOff >= 0 && eLine < 50;
  // 跟随判定：preview 中心块 off 与 editor 中心 off 在同一量级(误差 < 8000 字符；content 区块大，放宽)
  const aligned = m.eOff >= 0 && m.pOff >= 0 ? Math.abs(m.eOff - m.pOff) < 8000 : false;
  const pvRatio = m.pvMax ? (m.pvScroll / m.pvMax) : 0;
  const ok = !jumpToStart && aligned;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} frac=${f} | edOff=${m.eOff}(行${eLine}) | pvOff=${m.pOff} | pv比例=${(pvRatio * 100).toFixed(0)}%${jumpToStart ? ' ⚠跳回开头!' : ''}${!aligned ? ' ⚠预览未跟随' : ''}`);
}
console.log('------------------------------------------------------------');
console.log(fail === 0 ? '✅ 通过：滚动 content 段预览跟随，无跳回开头' : `❌ 失败 ${fail}/${fracs.length}`);
if (errors.length) console.log('页面错误:', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
