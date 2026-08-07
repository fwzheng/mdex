// CM 滚动同步回归测试：长文档（>200KB 触发窗口化）下，编辑区滚动 -> 预览中心源码偏移应与编辑区中心源码偏移一致；且不跳回文档开头。
// 验证编辑区滚动监听是否恢复了 scheduleSync(editor,preview) + scheduleWindowRecenter()。
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = process.argv[2] || 'dist/index.html';
const fileUrl = 'file://' + join(ROOT, HTML);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 生成 ~280KB 多样长文档：标题/散文/代码块/列表/表格/公式
function genDoc() {
  const parts = [];
  let n = 0;
  while (parts.join('\n').length < 280000) {
    n++;
    parts.push(`# 第 ${n} 章 测试标题\n`);
    parts.push(`这是一段普通散文，用于测试编辑器与预览之间的滚动同步精度。`.repeat(6) + `\n`);
    parts.push(`行内公式 $a^2 + b^2 = c^2$ 与 display 公式：\n\n$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt\\pi}{2}$$\n`);
    parts.push("```python\n# 代码块 " + n + "\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n```\n");
    parts.push(`- 列表项 A ${n}\n- 列表项 B ${n}\n- 列表项 C ${n}\n`);
    parts.push(`| 列1 | 列2 | 列3 |\n|---|---|---|\n| ${n} | foo | bar |\n| ${n+1} | baz | qux |\n`);
    parts.push(`再一段散文填充，确保每个块有足够高度便于对齐测量。`.repeat(4) + `\n`);
  }
  return parts.join('\n');
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(fileUrl);
await page.waitForSelector('.cm-editor');

const MD = genDoc();
// 经 CM view dispatch 灌入内容（设 div#editor.value 是 expando，不进 CM）
await page.evaluate((md) => {
  const view = window.__cm;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: md } });
}, MD);
await page.waitForTimeout(2000); // 等首次窗口渲染（>200KB 走 renderWindow 异步）

const info = await page.evaluate(() => {
  const v = window.__cm;
  return {
    mainClass: (document.getElementById('main') || {}).className,
    editorLen: v.state.doc.length,
    pvScrollH: document.getElementById('preview').scrollHeight,
    edScrollH: v.scrollDOM.scrollHeight,
    edClientH: v.scrollDOM.clientHeight,
  };
});
console.log('视图:', info.mainClass, '| editorLen:', info.editorLen, '| previewH:', info.pvScrollH, '| edScrollH:', info.edScrollH);

async function measureAt(scrollFrac) {
  return await page.evaluate(async (frac) => {
    const v = window.__cm;
    const sd = v.scrollDOM;
    const pv = document.getElementById('preview');
    const maxE = sd.scrollHeight - sd.clientHeight;
    sd.scrollTop = Math.max(0, Math.min(maxE, frac * maxE));
    // 等同步 rAF + 窗口重渲
    await new Promise(r => setTimeout(r, 450));
    // 编辑区中心 -> 源偏移（posAtCoords 取客户端坐标）
    const r = sd.getBoundingClientRect();
    let eOff = -1;
    const p = v.posAtCoords({ x: r.left + 30, y: r.top + sd.clientHeight / 2 });
    if (p != null) eOff = p;
    // 预览中心 -> 源偏移：找中心 Y 之上最后一个顶层块（间隙归属上方块，避免块间 margin 落空），读其 data-src-offset
    const pr = pv.getBoundingClientRect();
    const midAbs = pr.top + pv.clientHeight / 2;
    let pOff = -1, pText = '', pTag = '';
    for (let k = 0; k < pv.children.length; k++) {
      const rr = pv.children[k].getBoundingClientRect();
      if (rr.top > midAbs) break;        // 已越过中心 -> 上一块即是
      pOff = parseInt(pv.children[k].getAttribute('data-src-offset') || '', 10);
      pTag = pv.children[k].tagName; pText = (pv.children[k].textContent || '').replace(/\s+/g, ' ').slice(0, 20);
    }
    return { eOff, pOff, pText, pTag, edScroll: sd.scrollTop, pvScroll: pv.scrollTop, maxE };
  }, scrollFrac);
}

const fracs = [0, 0.25, 0.5, 0.75, 0.95];
console.log('------------------------------------------------------------');
console.log('编辑区滚动 -> 编辑器中心偏移 vs 预览中心偏移（应接近；eOff 不应为 0 当滚到中后段）');
let fail = 0;
const lineOf = (off) => MD.slice(0, off).split('\n').length;
for (const f of fracs) {
  const m = await measureAt(f);
  const eLine = m.eOff >= 0 ? lineOf(m.eOff) : -1;
  // 容差：预览中心块与编辑器中心偏移应在同一块附近（< 6000 字符 ~ 一个中块）
  const sameBlock = m.eOff >= 0 && m.pOff >= 0 ? Math.abs(m.eOff - m.pOff) < 6000 : false;
  const jumpToStart = f > 0.2 && m.eOff >= 0 && m.eOff < 200;
  const ok = sameBlock && !jumpToStart;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} frac=${f} | edOff=${m.eOff}(行${eLine}) | pvOff=${m.pOff} | pv[${m.pTag}:${m.pOff}]" | edScroll=${Math.round(m.edScroll)}/${Math.round(m.maxE)}${jumpToStart ? ' ⚠跳回开头!' : ''}${!sameBlock ? ' ⚠偏移不一致' : ''}`);
}
console.log('------------------------------------------------------------');
console.log(fail === 0 ? '✅ 通过：编辑区滚动->预览跟随一致，无跳回开头' : `❌ 失败 ${fail}/${fracs.length}`);
if (errors.length) console.log('页面错误:', errors.slice(0, 5).join(' | '));
console.log('============================================================');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
