// 验证 syncAnchors/renderWindow 的 posAtCoords 异常守卫：mock posAtCoords 返回"开头 off"(模拟 WKWebView content/大段区偶发把视口中段错映射成段首 off)，
// 断言预览不跳回开头、编辑器不被 reset 到开头。
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = process.argv[2] || 'dist/index.html';
const fileUrl = 'file://' + join(ROOT, HTML);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function genDoc() {
  const parts = []; let n = 0;
  while (parts.join('\n').length < 280000) {
    n++;
    parts.push(`# 第 ${n} 章\n`);
    parts.push(`普通散文测试编辑器与预览滚动同步精度。`.repeat(6) + `\n`);
    parts.push(`行内 $a^2+b^2=c^2$ 与 display：\n\n$$\\int_0^\\infty e^{-x^2}dx=\\frac{\\sqrt\\pi}{2}$$\n`);
    parts.push("```python\ndef fib(n):\n    a,b=0,1\n    for _ in range(n): a,b=b,a+b\n    return a\n```\n");
    parts.push(`- 项 A ${n}\n- 项 B ${n}\n- 项 C ${n}\n`);
    parts.push(`| c1 | c2 | c3 |\n|---|---|---|\n| ${n} | foo | bar |\n`);
    parts.push(`再一段散文填充确保每块有足够高度便于对齐测量。`.repeat(4) + `\n`);
  }
  return parts.join('\n');
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(fileUrl);
await page.waitForSelector('.cm-editor');
const MD = genDoc();
await page.evaluate((md) => {
  const view = window.__cm;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: md } });
}, MD);
await page.waitForTimeout(2000);

// 滚到中段
await page.evaluate(() => {
  const sd = window.__cm.scrollDOM;
  sd.scrollTop = (sd.scrollHeight - sd.clientHeight) * 0.5;
});
await page.waitForTimeout(600);

const before = await page.evaluate(() => ({
  ed: window.__cm.scrollDOM.scrollTop,
  pv: document.getElementById('preview').scrollTop,
  edMax: window.__cm.scrollDOM.scrollHeight - window.__cm.scrollDOM.clientHeight,
  pvMax: document.getElementById('preview').scrollHeight - document.getElementById('preview').clientHeight,
}));
console.log('mock 前(中段): edScroll=%d/%d (%.0f%%)  pvScroll=%d/%d (%.0f%%)',
  Math.round(before.ed), Math.round(before.edMax), before.ed / before.edMax * 100,
  Math.round(before.pv), Math.round(before.pvMax), before.pvMax ? before.pv / before.pvMax * 100 : 0);

// mock posAtCoords：视口中段坐标 -> 返回开头 off(0)，模拟 WKWebView 偶发异常
await page.evaluate(() => {
  const v = window.__cm;
  v._origPosAtCoords = v.posAtCoords.bind(v);
  v.posAtCoords = () => 0; // 异常：把中段映射成开头 off
});

// 触发若干次编辑器滚动同步（每次微滚一格触发 scroll 监听 -> scheduleSync + scheduleWindowRecenter）
for (let i = 0; i < 5; i++) {
  await page.evaluate((d) => {
    const sd = window.__cm.scrollDOM;
    sd.scrollTop += d;
    sd.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, 20);
  await page.waitForTimeout(160); // rAF + 窗口重渲
}

const after = await page.evaluate(() => ({
  ed: window.__cm.scrollDOM.scrollTop,
  pv: document.getElementById('preview').scrollTop,
}));
const edJumped = after.ed < before.ed * 0.5;       // 编辑器跳回开头(中段 -> 接近 0)
const pvJumped = before.pvMax ? after.pv < before.pv * 0.5 : false; // 预览跳回开头
console.log('mock 后: edScroll=%d (%.0f%%)  pvScroll=%d',
  Math.round(after.ed), before.edMax ? after.ed / before.edMax * 100 : 0, Math.round(after.pv));
console.log('------------------------------------------------------------');
console.log(edJumped ? '❌ 编辑器被 reset 回开头' : '✓ 编辑器未被 reset');
console.log(pvJumped ? '❌ 预览被推回开头' : '✓ 预览未跳开头');
console.log('============================================================');
await browser.close();
process.exit((edJumped || pvJumped) ? 1 : 0);
