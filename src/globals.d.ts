// 外部全局声明（vendor 库 + Tauri 桥），供 src/app.js 的 // @ts-check 使用。
// 这些库由 tools/build-html.mjs 在构建期内联，运行时确存在于全局；类型暂以 any 标注
// （不校验 vendor 内部实现），目的是消除"未声明名"噪音，并让 src/app.js 的 DOM/Tab 校验生效。

declare const marked: any;
declare const DOMPurify: any;
declare const katex: any;
declare const hljs: any;
declare const mermaid: any;
declare const renderMathInElement: any;
declare const TurndownService: any;
declare const turndownPluginGfm: any;
declare const BibTeXParser: any;

interface Window {
  __TAURI__: any;
  marked?: any;
  DOMPurify?: any;
  katex?: any;
  hljs?: any;
  mermaid?: any;
  renderMathInElement?: any;
  TurndownService?: any;
  turndownPluginGfm?: any;
  BibTeXParser?: any;
  jspdf?: any;
  html2canvas?: any;
  svg2pdf?: any;
}
