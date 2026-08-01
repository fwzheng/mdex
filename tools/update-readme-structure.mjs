// 批量更新 17 个 README 的文件结构树：在 app.js 行后插入 i18n.js/help.js，
// 并把 build-html.mjs 描述行的 "src/app.js" 扩成 "src/app.js + i18n.js + help.js"。
// 代码名跨语言一致，新增注释用英文（文件树为代码结构文档）。
import { readdirSync, readFileSync, writeFileSync } from 'fs';

const files = readdirSync('.').filter(f => /^README.*\.md$/.test(f));
const INSERT = [
  '│   ├── i18n.js            # 17-language UI strings (pure data; window.I18N, split from app.js)',
  '│   ├── help.js            # help-document data (HELP_STRINGS + SK/sc/CITE_HELP_*, window.HELP_DATA)',
];

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  let changed = false;

  // 1) 文件树：在 `│   ├── app.js` 行后插入 i18n.js / help.js（仅一次）
  for (let i = 0; i < lines.length; i++) {
    if (/^│   ├── app\.js\s/.test(lines[i]) && !lines[i + 1]?.includes('i18n.js')) {
      lines.splice(i + 1, 0, ...INSERT);
      changed = true;
      break;
    }
  }

  // 2) build-html.mjs 描述行：src/app.js → src/app.js + i18n.js + help.js
  for (let i = 0; i < lines.length; i++) {
    if (/build-html\.mjs/.test(lines[i]) && /src\/app\.js/.test(lines[i]) && !/i18n\.js/.test(lines[i])) {
      lines[i] = lines[i].replace('src/app.js', 'src/app.js + i18n.js + help.js');
      changed = true;
      break;
    }
  }

  if (changed) { writeFileSync(f, lines.join('\n')); console.log('✓', f); }
  else console.log('· SKIP（无匹配）', f);
}
