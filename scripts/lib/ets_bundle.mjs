/**
 * Load a set of REAL .ets modules (engine / AI / config / director — plain ArkTS classes, no @Component) into node
 * for behavioural gates. Not a compiler: a type eraser tuned to this repo's ArkTS subset.
 *
 * - Matching runs on a comments+strings-masked copy (same length), edits are applied to the comment-stripped source,
 *   so string / template text is never rewritten.
 * - Erases: interfaces / type aliases, `: Type` on const/let, class fields, signature params and return types,
 *   `as Type`, generic args on `new X<...>(`, `implements`, access modifiers / readonly, `x!` non-null.
 * - enums → frozen objects; each file → one IIFE scope; relative imports resolved inside the bundle,
 *   anything else ('@kit.*', or paths listed in `stubs`) comes from the caller's stub map.
 * A module that fails to erase cleanly throws at import time (the gate then FAILs) — it never passes silently.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { stripComments, stripCommentsAndStrings } from './ets_scan.mjs';
import { importFresh } from './ets_sim.mjs';

const ID = '[A-Za-z_$][\\w$]*';
const GEN = '<(?:[^<>;{}=()]|<(?:[^<>;{}=()]|<[^<>;{}=()]*>)*>)*>';
const ATOM = `(?:${ID}(?:\\.${ID})*(?:${GEN})?(?:\\[\\])*|'[^']*'|\\((?:[^()]|\\([^()]*\\))*\\)\\s*=>\\s*${ID}(?:\\.${ID})*(?:${GEN})?(?:\\[\\])*)`;
const TYPE = `${ATOM}(?:\\s*\\|\\s*${ATOM})*`;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'new', 'in', 'of', 'else', 'do', 'void', 'delete', 'throw', 'case']);

function matchParen(m, open) {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitTop(s) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
    else if (c === ',' && depth === 0) { parts.push([start, i]); start = i + 1; }
  }
  parts.push([start, s.length]);
  return parts;
}

/** Erase types from one module's text; returns { js, exports, imports }. */
export function eraseModule(raw) {
  let src = stripComments(raw);
  const edits = [];
  const mask0 = stripCommentsAndStrings(raw);
  const add = (s, e, r) => edits.push([s, e, r]);
  // 1. interfaces / type aliases (balanced braces), enums
  const exportsSet = new Set();
  const blockEnd = (m, at) => { let d = 0; for (let i = at; i < m.length; i++) { if (m[i] === '{') d++; else if (m[i] === '}') { d--; if (d === 0) return i + 1; } } return m.length; };
  for (const mt of mask0.matchAll(/^(export\s+)?(?:declare\s+)?interface\s+(\w+)[^{]*\{/gm)) {
    add(mt.index, blockEnd(mask0, mt.index + mt[0].length - 1), '');
  }
  for (const mt of mask0.matchAll(/^(export\s+)?type\s+(\w+)\s*=[^;]*;/gm)) add(mt.index, mt.index + mt[0].length, '');
  for (const mt of mask0.matchAll(/^(export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{/gm)) {
    const end = blockEnd(mask0, mt.index + mt[0].length - 1);
    const body = src.slice(mt.index + mt[0].length, end - 1);
    let next = 0;
    const props = [];
    for (const ent of body.split(',').map((x) => x.trim()).filter(Boolean)) {
      const m2 = /^(\w+)\s*(?:=\s*([\s\S]+))?$/.exec(ent);
      if (!m2) throw new Error(`enum ${mt[2]}: cannot parse ${ent}`);
      let v = m2[2];
      if (v === undefined) { v = String(next); next++; } else if (/^-?\d+$/.test(v.trim())) { next = Number(v) + 1; }
      props.push(`${m2[1]}: ${v}`);
    }
    if (mt[1]) exportsSet.add(mt[2]);
    add(mt.index, end, `const ${mt[2]} = Object.freeze({ ${props.join(', ')} });`);
  }
  // 2. imports
  const imports = [];
  for (const mt of mask0.matchAll(/^import\s+\{([^}]*)\}\s+from\s+'/gm)) {
    const fm = /from\s+'([^']+)';?/.exec(src.slice(mt.index));
    const from = fm[1];
    const names = mt[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/^type\s+/, ''));
    imports.push({ from, names });
    add(mt.index, mt.index + fm.index + fm[0].length, '');
  }
  // 3a. export lists  export { A, B };  /  export { A } from './x';
  for (const mt of mask0.matchAll(/^export\s*\{([^}]*)\}\s*(from\s*'[^']*')?\s*;?/gm)) {
    const names = mt[1].split(',').map((x) => x.trim()).filter(Boolean);
    if (mt[2]) {
      const from = /'([^']+)'/.exec(src.slice(mt.index, mt.index + mt[0].length))[1];
      imports.push({ from, names });
    }
    for (const n of names) exportsSet.add(n);
    add(mt.index, mt.index + mt[0].length, '');
  }
  // 3. export keywords
  for (const mt of mask0.matchAll(/^export\s+(?:default\s+)?(?=(?:abstract\s+)?(class|function|const|let|async\s+function)\s+(\w+))/gm)) {
    exportsSet.add(/(?:class|function|const|let)\s+(\w+)/.exec(mask0.slice(mt.index, mt.index + 200))[1]);
    add(mt.index, mt.index + mt[0].length, '');
  }
  // 4. const / let annotations
  for (const mt of mask0.matchAll(new RegExp(`\\b(const|let|var)\\s+(${ID})\\s*(:\\s*${TYPE})\\s*(?==(?![=>])|;)`, 'g'))) {
    const at = mt.index + mt[0].indexOf(mt[3], mt[1].length + mt[2].length);
    add(at, at + mt[3].length, '');
  }
  // 5. class members: modifiers / readonly / field annotations (line-anchored; not case/default labels)
  for (const mt of mask0.matchAll(new RegExp(`^([ \\t]+)((?:(?:static|readonly|private|public|protected|abstract)\\s+)*)(${ID})(\\??)(!?)\\s*(:\\s*${TYPE})\\s*(?==(?![=>])|;)`, 'gm'))) {
    if (mt[3] === 'default' || mt[3] === 'case') continue;
    const s0 = mt.index + mt[1].length;
    const mods = mt[2].replace(/\b(readonly|private|public|protected|abstract)\s+/g, '');
    add(s0, mt.index + mt[0].length, `${mods}${mt[3]}`);
  }
  // method modifiers without a field annotation (methods / getters)
  for (const mt of mask0.matchAll(/^([ \t]+)((?:(?:static|private|public|protected|async|readonly|abstract)\s+)+)(?=[\w$]+\s*[(<])/gm)) {
    const mods = mt[2].replace(/\b(readonly|private|public|protected|abstract)\s+/g, '');
    add(mt.index + mt[1].length, mt.index + mt[0].length, mods);
  }
  // 6. signatures: (params)[: Ret] { | =>
  for (let i = 0; i < mask0.length; i++) {
    if (mask0[i] !== '(') continue;
    const close = matchParen(mask0, i);
    if (close < 0) continue;
    const after = mask0.slice(close + 1, close + 400);
    const ret = new RegExp(`^\\s*(:\\s*${TYPE})?\\s*(\\{|=>)`).exec(after);
    if (!ret) continue;
    const before = mask0.slice(Math.max(0, i - 40), i);
    const pm = /([\w$]+)\s*(?:<[^<>()]*>)?\s*$/.exec(before);
    if (pm && KEYWORDS.has(pm[1]) && pm[1] !== 'function') continue;
    if (!pm && ret[2] === '{') continue;
    // params
    const inner = mask0.slice(i + 1, close);
    for (const [a, b] of splitTop(inner)) {
      const seg = inner.slice(a, b);
      const pmm = new RegExp(`^(\\s*(?:\\.\\.\\.)?${ID})(\\??)(\\s*:\\s*${TYPE})?(\\s*=[\\s\\S]*)?\\s*$`).exec(seg);
      if (!pmm) { if (seg.trim() === '') continue; throw new Error(`param erase failed: (${inner.slice(0, 120)})`); }
      const s0 = i + 1 + a + pmm[1].length;
      const typeEnd = s0 + pmm[2].length + (pmm[3] ? pmm[3].length : 0);
      if (typeEnd > s0) add(s0, typeEnd, '');
    }
    if (ret[1]) {
      const rs = close + 1 + after.indexOf(ret[1]);
      add(rs, rs + ret[1].length, '');
    }
    // generic method type params  name<T>(
    const gm = /<[^<>()]*>\s*$/.exec(before);
    if (gm && pm) add(i - gm[0].length, i, '');
  }
  // 7. `as Type`
  for (const mt of mask0.matchAll(new RegExp(`\\s+as\\s+(${TYPE})(?=\\s*[)\\];,.:}?\\n]|\\s*$)`, 'g'))) add(mt.index, mt.index + mt[0].length, '');
  // 8. new X<...>(  /  implements / class generics
  for (const mt of mask0.matchAll(new RegExp(`\\bnew\\s+${ID}(?:\\.${ID})*(${GEN})\\s*\\(`, 'g'))) {
    const at = mt.index + mt[0].indexOf(mt[1]);
    add(at, at + mt[1].length, '');
  }
  for (const mt of mask0.matchAll(new RegExp(`\\bclass\\s+${ID}(${GEN})?(\\s+extends\\s+${ID}(?:${GEN})?)?(\\s+implements\\s+[^{]+)?\\{`, 'g'))) {
    if (mt[1]) { const at = mt.index + mt[0].indexOf(mt[1]); add(at, at + mt[1].length, ''); }
    if (mt[3]) { const at = mt.index + mt[0].lastIndexOf(mt[3]); add(at, at + mt[3].length, ' '); }
  }
  // 9. non-null x!  (not !=)
  for (const mt of mask0.matchAll(/([\w$)\]])!(?=[.\[;,)\s])/g)) add(mt.index + 1, mt.index + 2, '');
  // apply (drop overlapping edits nested inside a larger earlier one)
  edits.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  let out = '', pos = 0;
  for (const [s, e, r] of edits) {
    if (s < pos) continue;
    out += src.slice(pos, s) + r;
    pos = e;
  }
  out += src.slice(pos);
  return { js: out, exports: [...exportsSet], imports };
}

/**
 * @param root    repo root
 * @param entries module paths relative to entry/src/main/ets without extension, e.g. 'common/MatchDirector'
 * @param stubs   { 'common/Logger': { Logger }, '@kit.ArkTS': { util } , ... } — stubbed modules are not loaded
 * @param globals extra names visible in every module (e.g. clock-bound setTimeout / Date)
 * @returns object: module path → exports
 */
export async function loadEtsBundle(root, entries, stubs = {}, globals = {}) {
  const base = join(root, 'entry/src/main/ets');
  const mods = new Map();
  const order = [];
  const visit = (key, stack) => {
    if (mods.has(key) || key in stubs) return;
    if (stack.includes(key)) throw new Error(`import cycle: ${[...stack, key].join(' → ')}`);
    const file = join(base, key + '.ets');
    if (!existsSync(file)) throw new Error(`module not found: ${key} (add a stub)`);
    const m = eraseModule(readFileSync(file, 'utf8'));
    m.key = key;
    mods.set(key, m);
    for (const im of m.imports) {
      im.key = im.from.startsWith('.') ? normalize(join(dirname(key), im.from)).split('\\').join('/') : im.from;
      if (!im.from.startsWith('.') && !(im.key in stubs)) throw new Error(`no stub for ${im.from} (imported by ${key})`);
      visit(im.key, [...stack, key]);
    }
    order.push(key);
  };
  for (const e of entries) visit(e, []);
  const stubKeys = Object.keys(stubs);
  let js = '';
  order.forEach((key, idx) => {
    const m = mods.get(key);
    const binds = m.imports.map((im) => {
      const src = im.key in stubs ? `__stubs[${JSON.stringify(im.key)}]` : `__m${order.indexOf(im.key)}`;
      return `const { ${im.names.join(', ')} } = ${src};`;
    }).join('\n');
    js += `const __m${idx} = (() => {\n${binds}\n${m.js}\nreturn { ${m.exports.join(', ')} };\n})();\n`;
  });
  js += `export default { ${order.map((k, i) => `${JSON.stringify(k)}: __m${i}`).join(', ')} };\n`;
  void stubKeys;
  void relative;
  if (process.env.ETS_BUNDLE_DUMP) (await import('node:fs')).writeFileSync(process.env.ETS_BUNDLE_DUMP, js);
  const mod = await importFresh(js, { __stubs: stubs, ...globals });
  return mod.default;
}
