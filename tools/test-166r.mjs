// BUG-166r/s 回归：拖滚动条场景的巨大选区 + 失控自动滚动。
// 三用例：
//  A. mouseSelectionStyle 保险丝：mousedown 落内容区→视口被搬 3 行+→get() 返回折叠 cursor(anchor)，
//     巨大选区不再产生（正常小拖选不受影响）。
//  B. 50ms 循环看门狗：触发边缘自动滚动后停止 mousemove >300ms → 循环自停（scrollTop 不再增长）。
//  C. 正常拖选不受影响：无滚动搬动时 select 范围=拖过字符数。
import { webkit } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const MD = await readFile('example/Quantum_Many-Particle_Systems_Negele_Orland_1998.md', 'utf8');
const APP = 'file://' + process.cwd() + '/dist/index.html';
const log = (...a) => console.log('[166r]', ...a);
let fail = 0;

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => { log('PAGEERROR:', e.message.slice(0, 300)); fail++; });

await page.goto(APP);
await page.click('#editor');
await page.keyboard.press('Meta+a');
await page.keyboard.insertText(MD);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  hasCm: !!window.__cm, len: window.__cm?.state.doc.length || 0,
  hasFacet: typeof window.CM?.mouseSelectionStyle === 'function' || !!window.CM?.mouseSelectionStyle,
}));
log('doc:', info);
if (!info.hasCm || info.len < 500000 || !info.hasFacet) { log('FATAL: preconditions failed'); await browser.close(); process.exit(1); }

// ---------- 用例 A：保险丝 ----------
// mousedown 落在内容区中部（可见视口坐标）→ 程序搬视口 500px（模拟失控滚动）→ mousemove → mouseup
const a = await page.evaluate(() => {
  const v = window.__cm;
  const sd = v.scrollDOM;
  const sr = sd.getBoundingClientRect(); // 可视区（不是 contentDOM——滚动后其 top 为负）
  const down = { x: sr.left + 300, y: sr.top + 200 };
  v.contentDOM.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: down.x, clientY: down.y, view: window,
  }));
  sd.scrollTop += 500; // 模拟 50ms 循环失控滚动（>3 行）
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, buttons: 1, clientX: down.x, clientY: down.y + 50, view: window }));
  const selDuring = { from: v.state.selection.main.from, to: v.state.selection.main.to };
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: down.x, clientY: down.y + 50, view: window }));
  const selAfter = { from: v.state.selection.main.from, to: v.state.selection.main.to };
  return { selDuring, selAfter, span: selAfter.to - selAfter.from };
});
log('A: after viewport heist + mousemove, sel span =', a.span);
if (a.span > 20000) { log('FAIL A: 巨大选区未拦截（span>20000）'); fail++; } else log('PASS A: 选区被保险丝折叠/限制');

// ---------- 用例 B：50ms 循环看门狗 ----------
const b = await page.evaluate(async () => {
  const v = window.__cm;
  const sd = v.scrollDOM;
  const sr = sd.getBoundingClientRect(); // 可见视口坐标
  const down = { x: sr.left + 100, y: sr.top + 150 };
  v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: down.x, clientY: down.y, view: window }));
  const vpBot = sr.top + sr.height; // scrollParents.y rect bottom ≈ scroller bottom
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, buttons: 1, clientX: down.x, clientY: vpBot - 2, view: window }));
  await new Promise(rs => setTimeout(rs, 100)); // 循环已启动
  const t1 = sd.scrollTop;
  await new Promise(rs => setTimeout(rs, 600)); // >300ms 无 mousemove → 看门狗应停
  const t2 = sd.scrollTop;
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: down.x, clientY: vpBot - 2, view: window }));
  return { t1, t2, drifted: t2 - t1 };
});
log('B: watchdog drift after 600ms no-move =', b.drifted, 'px');
if (b.drifted > 60) { log('FAIL B: 50ms 循环未在看门狗处停止（漂移>60px）'); fail++; } else log('PASS B: 循环已停');

// ---------- 用例 C：正常拖选不受影响 ----------
const c = await page.evaluate(() => {
  const v = window.__cm;
  const sr = v.scrollDOM.getBoundingClientRect(); // 可见视口坐标（不受滚动影响）
  const y = sr.top + 250;
  v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: sr.left + 100, clientY: y, view: window }));
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, buttons: 1, clientX: sr.left + 300, clientY: y + 30, view: window }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: sr.left + 300, clientY: y + 30, view: window }));
  const m = v.state.selection.main;
  return { from: m.from, to: m.to, span: m.to - m.from };
});
log('C: normal drag span =', c.span);
if (c.span === 0) { log('WARN C: 拖选被折叠成光标（可能误杀）'); fail++; }
else if (c.span > 30000) { log('FAIL C: 正常拖选产生异常大跨度', c.span); fail++; }
else log('PASS C: 正常拖选保留');

await browser.close();

// ---------- 用例 D：自绘滚动条（166v）----------
const d = await (async () => {
  const browser2 = await webkit.launch();
  const page2 = await browser2.newPage({ viewport: { width: 1440, height: 900 } });
  let fail2 = 0;
  try {
    await page2.goto(APP);
    await page2.click('#editor');
    await page2.keyboard.press('Meta+a');
    await page2.keyboard.insertText(MD);
    await page2.waitForTimeout(1500);
    const info = await page2.evaluate(() => ({
      bar: !!document.querySelector('.mdex-sb'),
      thumb: !!document.querySelector('.mdex-sb-thumb'),
      visible: document.querySelector('.mdex-sb')?.style.display !== 'none',
      nativeHidden: false,
    }));
    console.log('[166r] D: bar/thumb exist =', info.bar, info.thumb, 'visible =', info.visible);
    if (!info.bar || !info.thumb || !info.visible) { console.log('FAIL D1: 自绘滚动条未挂载/未显示'); fail2++; }
    // D2：拖动 thumb 到 60% 深度 → scrollTop 应同步、探针无 ED 跳变行（无原生条）
    const box = await page2.locator('.mdex-sb').boundingBox();
    const thumbTop = await page2.evaluate(() => {
      const t = document.querySelector('.mdex-sb-thumb');
      return t ? t.getBoundingClientRect().top : 0;
    });
    await page2.mouse.move(box.x + 5, thumbTop + 5);
    await page2.mouse.down();
    await page2.mouse.move(box.x + 5, box.y + box.height * 0.6, { steps: 10 });
    await page2.waitForTimeout(120);
    const st1 = await page2.evaluate(() => window.__cm.scrollDOM.scrollTop);
    await page2.mouse.move(box.x + 5, box.y + box.height * 0.6, { steps: 2 });
    await page2.waitForTimeout(120);
    const st2 = await page2.evaluate(() => window.__cm.scrollDOM.scrollTop);
    await page2.mouse.up();
    await page2.waitForTimeout(400);
    const after = await page2.evaluate(() => ({
      st: window.__cm.scrollDOM.scrollTop,
      sel: window.__cm.state.selection.main.to - window.__cm.state.selection.main.from,
      paused: undefined,
    }));
    console.log('[166r] D2: drag mid → scrollTop', Math.round(st1), '→', Math.round(st2), '→ after up:', Math.round(after.st), 'sel span =', after.sel);
    const total = await page2.evaluate(() => window.__cm.scrollDOM.scrollHeight - window.__cm.scrollDOM.clientHeight);
    const frac = after.st / total;
    if (frac < 0.3 || frac > 0.9) { console.log('FAIL D2: 拖到 60% 但落点', (frac * 100).toFixed(1) + '%'); fail2++; }
    if (after.sel > 100) { console.log('FAIL D2: 拖动产生选区 span=' + after.sel); fail2++; }
    // D3：拖动后点击编辑区 → 光标应落在视口内行（不跳远处）
    await page2.mouse.click(400, 450);
    await page2.waitForTimeout(300);
    const clickPos = await page2.evaluate(() => {
      const v = window.__cm, m = v.state.selection.main;
      const blk = v.lineBlockAt(m.head);
      return { head: m.head, top: blk.top, st: v.scrollDOM.scrollTop, ch: v.scrollDOM.clientHeight };
    });
    const inVp = clickPos.top >= clickPos.st - 100 && clickPos.top <= clickPos.st + clickPos.ch + 100;
    console.log('[166r] D3: click after drag → head', clickPos.head, 'block top', Math.round(clickPos.top), 'viewport', Math.round(clickPos.st), '-', Math.round(clickPos.st + clickPos.ch), inVp ? '(in viewport ✓)' : '(OUT OF VIEWPORT ✗)');
    if (!inVp) fail2++;
    // D4：轨道空白点击 = 翻页
    const before = await page2.evaluate(() => window.__cm.scrollDOM.scrollTop);
    const box2 = await page2.locator('.mdex-sb').boundingBox();
    await page2.mouse.click(box2.x + 5, box2.y + box2.height * 0.8);
    await page2.waitForTimeout(200);
    const paged = await page2.evaluate(() => window.__cm.scrollDOM.scrollTop);
    console.log('[166r] D4: track click paged', Math.round(before), '→', Math.round(paged), '(Δ' + Math.round(paged - before) + ')');
    if (paged - before < 100) { console.log('FAIL D4: 轨道点击未翻页'); fail2++; }
  } catch (err) {
    console.log('[166r] D ERROR:', err.message); fail2++;
  }
  await browser2.close();
  return fail2;
})();
if (d > 0) { log('❌ D 组 ' + d + ' 项失败'); fail += d; } else log('PASS D: 自绘滚动条 拖动/点击/翻页 全通过');

// ---------- 用例 E：拖动实时同步 + 点击对齐（166v 补）----------
const e = await (async () => {
  const b3 = await webkit.launch();
  const p3 = await b3.newPage({ viewport: { width: 1440, height: 900 } });
  let f3 = 0;
  try {
    await p3.goto(APP);
    await p3.click('#editor');
    await p3.keyboard.press('Meta+a');
    await p3.keyboard.insertText(MD);
    await p3.waitForTimeout(1500);
    // E1: 拖动过程中预览应实时跟随（拖到 50% 中途采样，preview scrollTop 应已明显离开起点比例）
    const box = await p3.locator('.mdex-sb').boundingBox();
    const thumbTop = await p3.evaluate(() => document.querySelector('.mdex-sb-thumb').getBoundingClientRect().top);
    await p3.mouse.move(box.x + 5, thumbTop + 5);
    await p3.mouse.down();
    await p3.mouse.move(box.x + 5, box.y + box.height * 0.5, { steps: 8 });
    await p3.waitForTimeout(300); // rAF 跟随窗口
    const mid = await p3.evaluate(() => ({
      ed: window.__cm.scrollDOM.scrollTop,
      edMax: window.__cm.scrollDOM.scrollHeight - window.__cm.scrollDOM.clientHeight,
      pv: document.getElementById('preview').scrollTop,
      pvMax: document.getElementById('preview').scrollHeight - document.getElementById('preview').clientHeight,
    }));
    const rEdM = mid.ed / mid.edMax, rPvM = mid.pv / (mid.pvMax || 1);
    console.log('[166r] E1: mid-drag ed ratio', rEdM.toFixed(2), 'pv ratio', rPvM.toFixed(2));
    if (rEdM > 0.2 && rPvM < 0.05) { console.log('FAIL E1: 拖动中预览未跟随'); f3++; }
    // E2: 松手后（不滚轮）预览应已对齐
    await p3.mouse.move(box.x + 5, box.y + box.height * 0.55, { steps: 4 });
    await p3.mouse.up();
    await p3.waitForTimeout(500);
    const afterUp = await p3.evaluate(() => ({
      ed: window.__cm.scrollDOM.scrollTop,
      pv: document.getElementById('preview').scrollTop,
      edMax: window.__cm.scrollDOM.scrollHeight - window.__cm.scrollDOM.clientHeight,
      pvMax: document.getElementById('preview').scrollHeight - document.getElementById('preview').clientHeight,
    }));
    const rEd = afterUp.ed / afterUp.edMax, rPv = afterUp.pv / (afterUp.pvMax || 1);
    console.log('[166r] E2: after release ed ratio', rEd.toFixed(2), 'pv ratio', rPv.toFixed(2));
    if (Math.abs(rEd - rPv) > 0.15) { console.log('FAIL E2: 松手后预览未对齐'); f3++; }
    // E3: 点击编辑区（无滚动）→ 预览对齐保持（不再需要滚轮唤醒）
    await p3.mouse.click(400, 450);
    await p3.waitForTimeout(400);
    const afterClick = await p3.evaluate(() => ({
      ed: window.__cm.scrollDOM.scrollTop,
      pv: document.getElementById('preview').scrollTop,
      edMax: window.__cm.scrollDOM.scrollHeight - window.__cm.scrollDOM.clientHeight,
      pvMax: document.getElementById('preview').scrollHeight - document.getElementById('preview').clientHeight,
    }));
    const rEd2 = afterClick.ed / afterClick.edMax, rPv2 = afterClick.pv / (afterClick.pvMax || 1);
    console.log('[166r] E3: after click ed ratio', rEd2.toFixed(2), 'pv ratio', rPv2.toFixed(2));
    if (Math.abs(rEd2 - rPv2) > 0.15) { console.log('FAIL E3: 点击后预览失步'); f3++; }
  } catch (err) { console.log('[166r] E ERROR:', err.message); f3++; }
  await b3.close();
  return f3;
})();
if (e > 0) { log('❌ E 组 ' + e + ' 项失败'); fail += e; } else log('PASS E: 拖动实时跟随 + 松手/点击对齐 全通过');

// ---------- 用例 F：预览点击定位对称性（166w）----------
const f = await (async () => {
  const b4 = await webkit.launch();
  const p4 = await b4.newPage({ viewport: { width: 1440, height: 900 } });
  let f4 = 0;
  try {
    await p4.goto(APP);
    await p4.click('#editor');
    await p4.keyboard.press('Meta+a');
    await p4.keyboard.insertText(MD);
    await p4.waitForTimeout(1500);
    // 先滚预览到中部（滑预览 = 用户语义），停稳
    await p4.evaluate(() => {
      const pv = document.getElementById('preview');
      pv.scrollTop = (pv.scrollHeight - pv.clientHeight) * 0.4;
    });
    await p4.waitForTimeout(800);
    // 点预览中部某内容块
    const pvBox = await p4.locator('#preview').boundingBox();
    await p4.mouse.click(pvBox.x + pvBox.width / 2, pvBox.y + pvBox.height / 2);
    await p4.waitForTimeout(1200); // 等 editor 滚动+锚定窗
    const r = await p4.evaluate(() => {
      const v = window.__cm, pv = document.getElementById('preview');
      // 点击的预览中心 Y 对应源 off：读预览中心块
      const pr = pv.getBoundingClientRect();
      const midAbs = pr.top + pv.clientHeight / 2;
      const vc = pv.querySelector('.vcontent') || pv;
      let pOff = -1;
      for (const k of vc.children) {
        const rr = k.getBoundingClientRect();
        if (rr.top > midAbs) break;
        const o = parseInt(k.getAttribute('data-src-offset') || '', 10);
        if (!isNaN(o)) pOff = o;
      }
      // editor 视口中心对应源 off
      const sd = v.scrollDOM;
      const sr = sd.getBoundingClientRect();
      const eOff = v.posAtCoords({ x: sr.left + 30, y: sr.top + sd.clientHeight / 2 }) ?? -1;
      return { pOff, eOff, edSt: Math.round(sd.scrollTop), pvSt: Math.round(pv.scrollTop) };
    });
    // 166w③：居中验证——视口中心源 off 与点击 off 差（金标准，下面 F 主断言）。
    // 注：lineBlockAt/coordsAtPos 在 1.38MB 未收敛区都测出过 -125% 假阴性，不可用作
    // 贴边探针；"视口中心=点击位置"即等价于"点击内容居中"（视口中心对着它）。
    const diff = Math.abs(r.pOff - r.eOff);
    console.log('[166r] F: 预览点击后 中心 off: pv=' + r.pOff + ' ed=' + r.eOff + ' |Δ|=' + diff + (diff < 4000 ? ' ✓' : ' ✗ 不齐'));
    if (diff >= 4000) f4++;
  } catch (err) { console.log('[166r] F ERROR:', err.message); f4++; }
  await b4.close();
  return f4;
})();
if (f > 0) { log('❌ F 组 ' + f + ' 项失败'); fail += f; } else log('PASS F: 预览点击定位与编辑器中心对齐（对称）');

log(fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
