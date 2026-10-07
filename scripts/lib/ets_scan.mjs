/**
 * Shared ArkTS source scanner for scripts/*_check.mjs.
 *
 * Why: the old gates ran /\bany\b/ and /ESObject/ over raw .ets text, so an
 * English comment such as "before any play" (Table.ets, e1c1d21) turned three
 * gates red without any real `any` type in code. Here we blank out
 * // line comments, /* block comments *\/ and string / template literal text
 * (template ${...} expressions are kept as code) before matching, while
 * preserving every newline so reported line numbers stay exact.
 *
 * Not a full ArkTS lexer: regex literals are not recognised. Hits are always
 * reported as file:line so a false positive can be checked by eye.
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Return `text` with comments and string-literal contents replaced by spaces. */
export function stripCommentsAndStrings(text) {
  const out = [];
  const n = text.length;
  // Stack of template-literal brace depths: when we enter `${`, push 0 and
  // count nested braces; the matching `}` returns to template text.
  const tplStack = [];
  let i = 0;
  let mode = 'code'; // code | line | block | sq | dq | tpl
  const blank = (ch) => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : '';
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out.push('  '); i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out.push('  '); i += 2; continue; }
      if (c === "'") { mode = 'sq'; out.push(c); i++; continue; }
      if (c === '"') { mode = 'dq'; out.push(c); i++; continue; }
      if (c === '`') { mode = 'tpl'; out.push(c); i++; continue; }
      if (tplStack.length > 0) {
        if (c === '{') { tplStack[tplStack.length - 1]++; }
        if (c === '}') {
          if (tplStack[tplStack.length - 1] === 0) {
            tplStack.pop();
            mode = 'tpl';
            out.push(c);
            i++;
            continue;
          }
          tplStack[tplStack.length - 1]--;
        }
      }
      out.push(c); i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out.push('\n'); } else { out.push(' '); }
      i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = 'code'; out.push('  '); i += 2; continue; }
      out.push(blank(c)); i++; continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      const q = mode === 'sq' ? "'" : '"';
      if (c === '\\' && i + 1 < n) { out.push(' ', blank(d)); i += 2; continue; }
      if (c === q) { mode = 'code'; out.push(c); i++; continue; }
      if (c === '\n') { mode = 'code'; out.push('\n'); i++; continue; } // unterminated: recover
      out.push(' '); i++; continue;
    }
    // tpl
    if (c === '\\' && i + 1 < n) { out.push(' ', blank(d)); i += 2; continue; }
    if (c === '`') { mode = 'code'; out.push(c); i++; continue; }
    if (c === '$' && d === '{') { tplStack.push(0); mode = 'code'; out.push('${'); i += 2; continue; }
    out.push(blank(c)); i++;
  }
  return out.join('');
}

/** Code-only matches of `res` (RegExp[]) in each { path, text }; returns [{ path, line, code }]. */
export function findInCode(files, res) {
  const hits = [];
  for (const f of files) {
    const stripped = stripCommentsAndStrings(f.text).split('\n');
    const raw = f.text.split('\n');
    for (let ln = 0; ln < stripped.length; ln++) {
      if (res.some((re) => re.test(stripped[ln]))) {
        hits.push({ path: f.path, line: ln + 1, code: raw[ln].trim() });
      }
    }
  }
  return hits;
}

export const ANY_ESOBJECT = [/\bany\b/, /\bESObject\b/];

/** Human-readable hit list for FAIL messages. */
export function formatHits(hits) {
  return hits.map((h) => `${h.path}:${h.line}: ${h.code}`).join('\n  ');
}

/** All .ets files under `<root>/entry/src/main/ets`, as repo-relative posix paths (sorted). */
export function listEts(root) {
  const base = join(root, 'entry/src/main/ets');
  const out = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.name.endsWith('.ets')) {
        out.push(relative(root, abs).split(sep).join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

/**
 * Body text of `name(...)…{ … }` (first match) in comment/string-stripped code,
 * or null. Brace-matched, so nested blocks are included.
 */
export function methodBody(text, name) {
  const code = stripCommentsAndStrings(text);
  const re = new RegExp(`(?:^|[\\s;}])(?:private |public |protected |static |async )*${name}\\s*\\([^)]*\\)\\s*(?::\\s*[\\w<>\\[\\]| ]+)?\\s*\\{`, 'm');
  const m = re.exec(code);
  if (!m) {
    return null;
  }
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < code.length && depth > 0) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') depth--;
    i++;
  }
  // Return the ORIGINAL text slice so log strings stay readable for includes().
  return text.slice(start, i - 1);
}
