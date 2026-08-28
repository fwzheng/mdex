// CodeMirror 6 聚合入口：把分散在多个 @codemirror/* 包的 API 聚到一个 window.CM 全局，
// 供 app.js（无 bundler 的单 IIFE）经 window.CM.* 使用。
// 由 tools/build-codemirror.mjs 经 esbuild 打包成单 IIFE → vendor/codemirror.js，
// 再由 tools/build-html.mjs 作首条 vendor <script> 内联。
//
// 仅升级 CM 版本时跑 `npm run build:cm` 重新生成 vendor/codemirror.js 并提交。
// 新增需要的 API：在这里 import 并加入 window.CM，然后重跑 build:cm。
import { EditorState, EditorSelection, Transaction, StateField, StateEffect } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, Decoration, ViewPlugin, WidgetType, drawSelection, mouseSelectionStyle } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, undo, redo, indentWithTab } from "@codemirror/commands";
import { search, openSearchPanel, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";

window.CM = {
  // state
  EditorState, EditorSelection, Transaction, StateField, StateEffect,
  // view
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, Decoration, ViewPlugin, WidgetType, drawSelection, mouseSelectionStyle,
  // commands
  history, historyKeymap, defaultKeymap, undo, redo, indentWithTab,
  // search
  search, openSearchPanel, searchKeymap, highlightSelectionMatches,
  // language (语法高亮)
  syntaxHighlighting, defaultHighlightStyle, HighlightStyle,
  // markdown (Lezer)
  markdown,
};
