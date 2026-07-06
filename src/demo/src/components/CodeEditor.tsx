import { useEffect, useRef } from 'react';
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  indentOnInput, syntaxHighlighting, HighlightStyle,
  bracketMatching, foldGutter, foldKeymap, StreamLanguage,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { yaml } from '@codemirror/lang-yaml';
import '../styles/components/CodeEditor.css';

// ── Light theme ───────────────────────────────────────────────────────────────
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#f6f8fa',
    color: '#1f2328',
  },
  '.cm-content': { caretColor: '#1f2328' },
  '.cm-cursor': { borderLeftColor: '#1f2328' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#b6d0f7 !important' },
  '.cm-activeLine': { backgroundColor: '#e8f0fe55' },
  '.cm-activeLineGutter': { backgroundColor: '#dce8fc' },
  '.cm-gutters': {
    backgroundColor: '#f0f2f5',
    color: '#6e7781',
    border: 'none',
    borderRight: '1px solid #d0d7de',
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '3em' },
  '.cm-foldGutter': { color: '#57606a' },
}, { dark: false });

const lightHighlight = HighlightStyle.define([
  { tag: t.keyword,            color: '#cf222e', fontWeight: 'bold' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#953800' },
  { tag: [t.function(t.variableName), t.labelName], color: '#8250df' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#0550ae' },
  { tag: [t.definition(t.name), t.separator], color: '#1f2328' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#0550ae' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#0a3069' },
  { tag: [t.meta, t.comment], color: '#6e7781', fontStyle: 'italic' },
  { tag: t.strong,             fontWeight: 'bold' },
  { tag: t.emphasis,           fontStyle: 'italic' },
  { tag: t.strikethrough,      textDecoration: 'line-through' },
  { tag: t.link,               color: '#0a3069', textDecoration: 'underline' },
  { tag: t.heading,            fontWeight: 'bold', color: '#0550ae' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#0550ae' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#0a3069' },
  { tag: t.invalid, color: '#82071e', borderBottom: '1px dotted #82071e' },
]);

// ── Custom StreamLanguage: .properties ───────────────────────────────────────
const propertiesLanguage = StreamLanguage.define({
  name: 'properties',
  token(stream, state) {
    if (stream.sol()) {
      state.inValue = false;
      if (stream.match(/^[#!]/)) { stream.skipToEnd(); return 'comment'; }
      if (stream.match(/^\[/))   { stream.match(/^[^\]]*\]?/); return 'keyword'; }
    }
    if (!state.inValue && stream.match(/^[^=:\s][^=:]*/)) {
      if (/[=:]/.test(stream.peek() || '')) { state.inValue = false; return 'propertyName'; }
    }
    if (!state.inValue && stream.match(/^[=:]/)) { state.inValue = true; return 'operator'; }
    if (state.inValue || stream.match(/^\s+/)) {
      if (stream.match(/^\s*/)) { /* skip */ }
      stream.skipToEnd();
      return 'string';
    }
    stream.next();
    return null;
  },
  startState: () => ({ inValue: false }),
});

// ── Custom StreamLanguage: TOML ───────────────────────────────────────────────
const tomlLanguage = StreamLanguage.define({
  name: 'toml',
  token(stream, state) {
    if (stream.match(/^#/))               { stream.skipToEnd(); return 'comment'; }
    if (stream.sol() && stream.match(/^\[\[?[^\]]*\]?\]?/)) return 'keyword';
    if (state.multiStr) {
      if (stream.match(/.*?"""/))  state.multiStr = false;
      else stream.skipToEnd();
      return 'string';
    }
    if (stream.match(/^"""/))             { state.multiStr = true; return 'string'; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^'[^']*'/))           return 'string';
    if (stream.match(/^(?:true|false)/))    return 'bool';
    if (stream.match(/^\d{4}-\d{2}-\d{2}/)) return 'number';
    if (stream.match(/^[+-]?[\d_]+(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?/)) return 'number';
    if (stream.sol() && stream.match(/^[A-Za-z0-9_."-]+(?=\s*=)/)) return 'propertyName';
    if (stream.match(/^[=\[\]{},.]/))       return 'operator';
    stream.next();
    return null;
  },
  startState: () => ({ multiStr: false }),
});

// ── Custom StreamLanguage: SNBT / NBT ─────────────────────────────────────────
const nbtLanguage = StreamLanguage.define({
  name: 'nbt',
  token(stream) {
    if (stream.match(/^#/))              { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^'[^']*'/))           return 'string';
    if (stream.match(/^-?[\d.]+[bBsSlLfFdD]?/)) return 'number';
    if (stream.match(/^(?:true|false|True|False)/)) return 'bool';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_.]*(?=\s*:)/)) return 'propertyName';
    if (stream.match(/^[:{},[\]]/))         return 'operator';
    stream.next();
    return null;
  },
});

// ── Custom StreamLanguage: .mcfunction ────────────────────────────────────────
const mcfunctionLanguage = StreamLanguage.define({
  name: 'mcfunction',
  token(stream, state) {
    if (stream.sol()) {
      state.firstToken = true;
      if (stream.match(/^#/)) { stream.skipToEnd(); return 'comment'; }
    }
    if (stream.match(/^\s+/)) return null;
    if (state.firstToken) {
      state.firstToken = false;
      if (stream.match(/^[a-z_:]+/)) return 'keyword';
    }
    if (stream.match(/^@[aeprs](?:\[[^\]]*\])?/)) return 'variableName';
    if (stream.match(/^[a-z0-9_.-]+:[a-z0-9_./-]+/)) return 'typeName';
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^[~^]?-?[\d.]+/)) return 'number';
    if (stream.match(/^(?:true|false)/)) return 'bool';
    if (stream.match(/^[{}\[\],=]/)) return 'operator';
    stream.next();
    return null;
  },
  startState: () => ({ firstToken: true }),
});

// ── Custom StreamLanguage: old MC .lang files ─────────────────────────────────
const mcLangLanguage = StreamLanguage.define({
  name: 'mcLang',
  token(stream, state) {
    if (stream.sol()) state.afterEq = false;
    if (!state.afterEq) {
      if (stream.match(/^#/)) { stream.skipToEnd(); return 'comment'; }
      if (stream.match(/^[^=\n]+(?==)/)) return 'propertyName';
      if (stream.match(/^=/)) { state.afterEq = true; return 'operator'; }
    }
    stream.skipToEnd();
    return 'string';
  },
  startState: () => ({ afterEq: false }),
});

// ── Language picker ───────────────────────────────────────────────────────────
function getLanguage(filename) {
  const name = (filename || '').toLowerCase();
  const ext  = name.includes('.') ? name.split('.').pop() : '';

  switch (ext) {
    case 'js': case 'jsx': case 'mjs': case 'cjs':
      return javascript({ jsx: true });
    case 'ts': case 'tsx':
      return javascript({ jsx: ext === 'tsx', typescript: true });
    case 'html': case 'htm':   return html();
    case 'css': case 'scss': case 'less': return css();
    case 'json':               return json();
    case 'xml':                return xml();
    case 'svg':                return xml();
    case 'yml': case 'yaml':   return yaml();
    case 'toml':               return tomlLanguage;
    case 'java':               return java();
    case 'py':                 return python();
    // Minecraft
    case 'properties':         return propertiesLanguage;
    case 'cfg': case 'conf':   return propertiesLanguage;
    case 'mcmeta':             return json();
    case 'nbt': case 'snbt':   return nbtLanguage;
    case 'mcfunction':         return mcfunctionLanguage;
    case 'lang':               return mcLangLanguage;
    default:                   return null;
  }
}

// ── Extensions builder ────────────────────────────────────────────────────────
function buildExtensions(filename, isDark, onChange) {
  const lang = getLanguage(filename);

  const themeExtensions = isDark
    ? [oneDark]
    : [lightTheme, syntaxHighlighting(lightHighlight)];

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    ...themeExtensions,
    ...(lang ? [lang] : []),
    EditorView.updateListener.of(update => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
        fontSize: '13px',
        lineHeight: '1.6',
      },
    }),
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CodeEditor({ filename, value, onChange, height = '62vh' }) {
  const containerRef = useRef(null);
  const viewRef      = useRef(null);
  const onChangeRef  = useRef(onChange);
  onChangeRef.current = onChange;

  const isDark = () =>
    document.documentElement.getAttribute('data-theme') !== 'light';

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value || '',
        extensions: buildExtensions(filename, isDark(), v => onChangeRef.current(v)),
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    const observer = new MutationObserver(() => {
      const doc = view.state.doc.toString();
      view.setState(EditorState.create({
        doc,
        extensions: buildExtensions(filename, isDark(), v => onChangeRef.current(v)),
      }));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, [filename]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value || '' } });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{ height, overflow: 'hidden', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}
    />
  );
}
