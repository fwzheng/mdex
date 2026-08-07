// CM AI 选区/光标可视化回归测试：验证 buildAiSel/aiSelRect 走 CM Decoration（替代 #editor-hl）。
// 光标模式(零宽)→.cm-content .ai-sel:empty 闪烁竖线；选区模式→.cm-content .ai-sel 高亮；清除→消失；位置与 coordsAtPos 对齐。
import { chromium } from 'playwright-core';
const ROOT = '/Users/z/temp/markdown';
const fileUrl = 'file://' + ROOT + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; pg.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,160)); });
await pg.goto(fileUrl); await pg.waitForSelector('.cm-editor');
const MD = "标题一行\n\n这是第二段普通文字用于测试 AI 选区可视化功能。\n\n第三段内容 here。\n";
await pg.evaluate(md => { const v=window.__cm; v.dispatch({changes:{from:0,to:v.state.doc.length,insert:md}}); }, MD);
await pg.waitForTimeout(400);

const r = await pg.evaluate(() => {
  const v = window.__cm; const out = {};
  // 1. 光标模式：在偏移 30 处画零宽闪烁竖线
  window.__aiSelTest(30, 30);
  let el = v.contentDOM.querySelector('.ai-sel');
  out.cursor_appears = !!el;
  out.cursor_empty = el ? el.children.length === 0 && el.textContent === '' : false; // :empty 须无子节点
  // 位置应在 coordsAtPos(30) 附近
  const c = v.coordsAtPos(30);
  out.cursor_rect_match = el ? Math.abs(el.getBoundingClientRect().right - c.left) < 2 : false; // widget 画在光标左侧(side:-1)，右边缘对齐 coordsAtPos
  // 2. 选区模式：偏移 12..40 高亮
  window.__aiSelTest(12, 40);
  el = v.contentDOM.querySelector('.ai-sel');
  out.sel_appears = !!el;
  out.sel_has_text = el ? el.textContent.length > 0 : false; // 选区 mark 包裹文字(非空)
  // 3. 清除
  window.__aiSelTest(null);
  out.cleared = !v.contentDOM.querySelector('.ai-sel');
  // 4. #editor-hl 不再被写入(CM 下已不对齐，应保持空)
  out.editorHl_empty = document.getElementById('editor-hl').innerHTML === '';
  return out;
});
console.log(JSON.stringify(r, null, 2));
let fail = 0;
for (const k of ['cursor_appears','cursor_empty','cursor_rect_match','sel_appears','sel_has_text','cleared']) {
  if (!r[k]) { console.log('  ✗', k); fail++; } else console.log('  ✓', k);
}
console.log(r.editorHl_empty ? '  ✓ editor-hl 不再写入(CM 下废弃)' : '  (editor-hl 仍被写入，非阻塞)');
console.log(fail === 0 ? '✅ 通过' : `❌ 失败 ${fail}`);
if (errs.length) console.log('页面错误:', errs.slice(0,3).join(' | '));
await b.close(); process.exit(fail===0?0:1);
