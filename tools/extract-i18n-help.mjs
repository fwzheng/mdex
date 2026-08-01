// 从 src/app.js 抽取 I18N 与 HELP_STRINGS（含依赖 SK/sc/CITE_HELP_*）到独立文件。
// 边界用「锚点 + 下一行特征」定位（不靠大括号计数——字符串里的 {ver}/{n} 会干扰）。
// 生成后 node --check 三个文件，任一失败则不覆盖原 app.js。
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';

const SRC = 'src/app.js';
const BAK = 'src/app.js.bak';
const lines = readFileSync(SRC, 'utf8').split('\n');
const findIdx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };

// ---- 定位边界 ----
const i18nStart = findIdx(/^\s*const I18N = \{$/);
let i18nEnd = -1;
for (let i = i18nStart + 1; i < lines.length; i++) {
  if (/^\s*};\s*$/.test(lines[i]) && /curLang/.test(lines[i + 1] || '')) { i18nEnd = i; break; }
}
const skStart = findIdx(/^\s*const SK = \[/);
const scLine = skStart + 1; // sc 紧随 SK
const citeStart = findIdx(/^\s*const CITE_HELP_ZH = \[/);
let helpEnd = -1;
for (let i = citeStart + 1; i < lines.length; i++) {
  if (/^\s*};\s*$/.test(lines[i]) && /function helpContent/.test(lines[i + 1] || '')) { helpEnd = i; break; }
}

const anchors = { i18nStart, i18nEnd, skStart, scLine, citeStart, helpEnd };
console.log('边界:', anchors);
if (Object.values(anchors).some(v => v < 0) || scLine !== skStart + 1 || !/const sc =/.test(lines[scLine])) {
  console.error('✗ 锚点定位失败或 SK/sc 不相邻，中止（未改动任何文件）');
  process.exit(1);
}
// 安全检查：citeStart 应在 buildHelp 之后、helpEnd 应为 HELP_STRINGS 结束
const helpStringsLine = findIdx(/^\s*const HELP_STRINGS = \{$/, citeStart);
if (!(citeStart < helpStringsLine && helpStringsLine < helpEnd)) {
  console.error('✗ CITE_HELP/HELP_STRINGS 相对顺序异常，中止');
  process.exit(1);
}

// ---- 生成 i18n.js ----
// lines[i18nStart] = '  const I18N = {' → 'window.I18N = {'
const i18nBody = lines.slice(i18nStart + 1, i18nEnd + 1).join('\n'); // 含结尾 '  };'
const i18nJs =
`// 抽自 src/app.js：界面文案 17 语言字符串（纯数据，零依赖）。
// build-html.mjs 在 app.js(IIFE) 之前内联注入；app.js 用 "const I18N = window.I18N" 接回。
window.I18N = {
${i18nBody}
`;

// ---- 生成 help.js ----
// SK + sc（去原 2 空格缩进→IIFE 内 2 空格，保留）+ CITE_HELP_* + HELP_STRINGS（citeStart..helpEnd，原样）
const skSc = lines.slice(skStart, scLine + 1).join('\n');
const citeHelp = lines.slice(citeStart, helpEnd + 1).join('\n'); // CITE_HELP_ZH/EN + HELP_STRINGS，含结尾 '  };'
const helpJs =
`// 抽自 src/app.js：帮助文档数据 HELP_STRINGS 及其构造依赖 SK/sc/CITE_HELP_ZH/CITE_HELP_EN。
// build-html.mjs 在 app.js(IIFE) 之前内联注入；app.js 用 "const HELP_STRINGS = window.HELP_DATA.HELP_STRINGS" 接回。
window.HELP_DATA = (() => {
${skSc}
${citeHelp}
  return { HELP_STRINGS };
})();
`;

// ---- 生成新 app.js ----
const before = lines.slice(0, i18nStart);                       // ..行96（i18n 注释）
const mid1 = lines.slice(i18nEnd + 1, skStart);                 // 行588..行4905（curLang…help 节注释）
const mid2 = lines.slice(scLine + 1, citeStart);                // 行4908..行5053（LINK_LABELS…buildHelp）
const after = lines.slice(helpEnd + 1);                         // 行6136..（helpContent…init）
const newApp =
  before.join('\n') + '\n' +
  '  const I18N = window.I18N;\n' +
  mid1.join('\n') + '\n' +
  mid2.join('\n') +
  '  const HELP_STRINGS = window.HELP_DATA.HELP_STRINGS;\n' +
  after.join('\n');

// ---- 语法检查（new Function 只编译不执行；window 未定义是运行时错误，不影响语法检查）----
function syntaxOk(code, label) {
  try { new Function(code); console.log(`  ✓ ${label} 语法 OK`); return true; }
  catch (e) { console.error(`  ✗ ${label} 语法错误: ${e.message}`); return false; }
}
console.log('语法检查:');
const ok = syntaxOk(i18nJs, 'i18n.js') && syntaxOk(helpJs, 'help.js') && syntaxOk(newApp, 'app.js(新)');
if (!ok) { console.error('✗ 语法检查失败，未写任何文件'); process.exit(1); }

// ---- 备份 + 写入 ----
copyFileSync(SRC, BAK);
writeFileSync('src/i18n.js', i18nJs);
writeFileSync('src/help.js', helpJs);
writeFileSync(SRC, newApp);

const oldLines = lines.length, newLines = newApp.split('\n').length;
console.log(`\n✅ 抽取完成：app.js ${oldLines} → ${newLines} 行（-${oldLines - newLines}）`);
console.log(`   i18n.js ${i18nJs.split('\n').length} 行, help.js ${helpJs.split('\n').length} 行`);
console.log(`   备份: ${BAK}（出错可恢复）`);
