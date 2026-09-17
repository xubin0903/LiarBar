#!/usr/bin/env node
/**
 * Cocos engine purity gate (T2).
 * When cocos/assets/scripts/engine/*.ts exists:
 *   - ban import cc / UI / setTimeout
 *   - require Judge three-formula semantics (isLegal / handIsClean / isChallengeSuccess)
 * Path or sources missing → SKIP (not red). K3 may land later. 合入 ≠ 终验.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'cocos/assets/scripts/engine');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

function skip(msg) {
  console.log('SKIP', msg);
}

function listTsFiles(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
      } else if (/\.(ts|js|mts|mjs)$/i.test(name) && !name.endsWith('.d.ts')) {
        out.push(abs);
      }
    }
  };
  walk(dir);
  return out;
}

if (!existsSync(engineDir) || !statSync(engineDir).isDirectory()) {
  skip('cocos/assets/scripts/engine/ missing — await K3');
  process.exit(0);
}

const files = listTsFiles(engineDir);
if (files.length === 0) {
  skip('cocos/assets/scripts/engine/ has no .ts sources — await K3');
  process.exit(0);
}

pass(`found ${files.length} engine source file(s)`);

const joined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const relJoined = files.map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).join(', ');

// Ban Cocos / UI coupling inside pure engine.
if (/\bfrom\s+['"]cc['"]/.test(joined) || /\bimport\s*\(\s*['"]cc['"]/.test(joined) ||
  /\brequire\s*\(\s*['"]cc['"]/.test(joined)) {
  fail('engine/ must not import "cc"');
} else {
  pass('no import "cc" in engine/');
}

if (/\bfrom\s+['"]cc\/[^'"]+['"]/.test(joined)) {
  fail('engine/ must not import cc/*');
} else {
  pass('no import cc/* in engine/');
}

if (/\bfrom\s+['"][^'"]*\/(ui|UI|view|View|presenter|Presenter)[^'"]*['"]/.test(joined) ||
  /\bimport\s+.*\b(Node|Label|Button|Sprite|Canvas)\b/.test(joined) && /\bfrom\s+['"]cc/.test(joined)) {
  fail('engine/ must not import UI / view modules');
} else {
  pass('no UI module imports in engine/');
}

if (/\bsetTimeout\s*\(/.test(joined) || /\bsetInterval\s*\(/.test(joined)) {
  fail('engine/ must not use setTimeout/setInterval');
} else {
  pass('no setTimeout/setInterval in engine/');
}

// Three formulas — accept TS port of Judge.ets / docs §3.2.
const hasIsLegal =
  /function\s+isLegal\b/.test(joined) || /export\s+function\s+isLegal\b/.test(joined) ||
  /const\s+isLegal\s*=/.test(joined) || /isLegal\s*[:=]/.test(joined);
const hasHandClean =
  /function\s+handIsClean\b/.test(joined) || /export\s+function\s+handIsClean\b/.test(joined) ||
  /const\s+handIsClean\s*=/.test(joined);
const hasChallenge =
  /function\s+isChallengeSuccess\b/.test(joined) || /export\s+function\s+isChallengeSuccess\b/.test(joined) ||
  /const\s+isChallengeSuccess\s*=/.test(joined);

if (!hasIsLegal || !hasHandClean || !hasChallenge) {
  fail(`Judge three formulas missing in ${relJoined} (need isLegal / handIsClean / isChallengeSuccess)`);
} else {
  pass('Judge symbols present: isLegal / handIsClean / isChallengeSuccess');
}

// Semantic shape: claim||wild ; !handIsClean
const legalBodyOk =
  /cardRank\s*===\s*claim\s*\|\|\s*cardRank\s*===\s*wild/.test(joined) ||
  /cardRank\s*===\s*claim\s*\|\|\s*cardRank\s*===\s*\w*wild/i.test(joined) ||
  /===\s*claim\s*\|\|[\s\S]{0,80}===\s*wild/.test(joined);
const successBodyOk =
  /!\s*handIsClean\s*\(/.test(joined) ||
  /return\s+!\s*handIsClean/.test(joined);

if (!legalBodyOk) {
  fail('isLegal body must be claim || wild (docs 05 §3.2)');
} else {
  pass('isLegal ≈ claim || wild');
}
if (!successBodyOk) {
  fail('isChallengeSuccess must be !handIsClean(...)');
} else {
  pass('isChallengeSuccess ≈ !handIsClean');
}

console.log(process.exitCode ? 'COCOS ENGINE PURITY FAILED' : 'COCOS ENGINE PURITY OK');
