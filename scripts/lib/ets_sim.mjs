/**
 * Behavioural sims for static gates: run REAL .ets sources in node with types stripped.
 * Not a compiler — the stripper only removes the annotations each gate lists explicitly
 * (no generic `: X` removal, so object literals / ternaries are never touched).
 * Fake clock replaces setTimeout / clearTimeout / Date.now inside the loaded module only.
 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param text   .ets source (whole file or extracted methods)
 * @param types  type spellings to drop after ':' (longest first is handled here)
 * @param asTypes type spellings to drop after ' as '
 */
export function stripEts(text, types = [], asTypes = []) {
  const ts = [...types].sort((a, b) => b.length - a.length).map(esc);
  const as = [...asTypes].sort((a, b) => b.length - a.length).map(esc);
  let out = text
    .replace(/^import .*$/gm, '')
    .replace(/^export (?:interface|type) \w+[^\n]*\{[\s\S]*?\n\}\s*$/gm, '')
    .replace(/^export type \w+ = [^\n]*;$/gm, '')
    .replace(/\breadonly\s+/g, "")
    .replace(/\b(?:private|public|protected)\s+/g, '')
    // arrow / method return types:  ): T =>   ): T {
    .replace(/\)\s*:\s*[\w.<>\[\]| ]+?\s*=>/g, ') =>')
    .replace(/\)\s*:\s*[\w.<>\[\]| ]+?\s*\{/g, ') {')
    // function-typed annotations:  x: (a: T) => void
    .replace(/:\s*\((?:[^()]|\([^()]*\))*\)\s*=>\s*[\w.<>\[\]]+(?=\s*[=,;)])/g, '');
  if (as.length > 0) out = out.replace(new RegExp(`\\s+as\\s+(?:${as.join('|')})(?![\\w\\[.])`, 'g'), '');
  if (ts.length > 0) out = out.replace(new RegExp(`:\\s*(?:${ts.join('|')})(?=\\s*[=,;){])`, 'g'), '');
  // generic call args like new Promise<boolean>(
  out = out.replace(/new Promise<\w+>\(/g, 'new Promise(');
  return out;
}

/** Deterministic clock: timers fire in due order when advance() is called. */
export function makeClock(t0 = 1_000_000) {
  const c = { now: t0, seq: 0, q: new Map(), fired: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.seq; c.q.set(id, { at: c.now + Math.max(0, Number(ms) || 0), fn }); return id; };
  c.clearTimeout = (id) => { c.q.delete(id); };
  c.setInterval = (fn, ms) => {
    const id = ++c.seq;
    const every = Math.max(1, Number(ms) || 0);
    const tick = () => { if (!c.q.has(id)) { c.q.set(id, { at: c.now + every, fn: run }); } };
    const run = () => { tick(); fn(); };
    c.q.set(id, { at: c.now + every, fn: run });
    return id;
  };
  c.advance = (ms) => {
    const end = c.now + ms;
    for (;;) {
      let best = null;
      for (const [id, e] of c.q) {
        if (e.at <= end && (best === null || e.at < best[1].at || (e.at === best[1].at && id < best[0]))) best = [id, e];
      }
      if (best === null) break;
      c.q.delete(best[0]);
      c.now = Math.max(c.now, best[1].at);
      // interval entries re-arm themselves inside fn (run → tick) unless cleared during the callback
      c.fired++;
      best[1].fn();
    }
    c.now = end;
  };
  return c;
}

let seq = 0;
/** Import JS text as a fresh module (fresh statics). `header` may bind names from globalThis.__etsSim[key]. */
export async function importFresh(js, stubs) {
  seq++;
  const key = `s${seq}`;
  globalThis.__etsSim = globalThis.__etsSim || {};
  globalThis.__etsSim[key] = stubs;
  const names = Object.keys(stubs);
  const header = names.length > 0 ? `const { ${names.join(', ')} } = globalThis.__etsSim.${key};\n` : '';
  return import('data:text/javascript,' + encodeURIComponent(`${header}${js}\n// fresh ${seq}`));
}

/** Clock-bound stubs for a module: setTimeout / clearTimeout / Date (only Date.now is used by the sims). */
export function clockStubs(clock) {
  return {
    setTimeout: (f, m) => clock.setTimeout(f, m),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (f, m) => clock.setInterval(f, m),
    clearInterval: (id) => clock.clearTimeout(id),
    Date: { now: () => clock.now }
  };
}

/** Let pending promise callbacks run. */
export async function drainMicrotasks(n = 20) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}
