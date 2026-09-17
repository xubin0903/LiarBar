#!/usr/bin/env node
/**
 * Cocos scene node-id gate (T2).
 * Required lb_* names (docs 06 Cocos 清单 / ROLE):
 *   lb_cmp_hand, lb_cmp_pool, lb_txt_timer, lb_txt_judge,
 *   lb_btn_challenge_doubt, lb_btn_challenge_believe
 * Scene missing → SKIP.
 * Scene present but zero required lb_* (K2 skeleton) → SKIP (not red).
 * Partial set → FAIL. Full set → PASS. 合入 ≠ 终验.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenesDir = join(root, 'cocos/assets/scenes');

const REQUIRED = [
  'lb_cmp_hand',
  'lb_cmp_pool',
  'lb_txt_timer',
  'lb_txt_judge',
  'lb_btn_challenge_doubt',
  'lb_btn_challenge_believe'
];

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

function listScenes() {
  const preferred = [
    'cocos/assets/scenes/Table.scene',
    'cocos/assets/scenes/table.scene'
  ];
  const found = [];
  const seenAbs = new Set();
  for (const rel of preferred) {
    const abs = join(root, rel);
    if (existsSync(abs) && statSync(abs).isFile()) {
      const key = abs.toLowerCase();
      if (seenAbs.has(key)) {
        continue;
      }
      seenAbs.add(key);
      found.push(rel);
    }
  }
  if (found.length > 0) {
    return found;
  }
  if (!existsSync(scenesDir) || !statSync(scenesDir).isDirectory()) {
    return [];
  }
  for (const name of readdirSync(scenesDir)) {
    if (name.endsWith('.scene')) {
      const abs = join(scenesDir, name);
      const key = abs.toLowerCase();
      if (seenAbs.has(key)) {
        continue;
      }
      seenAbs.add(key);
      found.push(`cocos/assets/scenes/${name}`);
    }
  }
  return found;
}

const scenes = listScenes();
if (scenes.length === 0) {
  skip('no cocos/assets/scenes/*.scene — await K2/K4');
  process.exit(0);
}

const blob = scenes.map((rel) => readFileSync(join(root, rel), 'utf8')).join('\n');
pass(`scanning ${scenes.join(', ')}`);

const present = REQUIRED.filter((id) => {
  // Cocos JSON: "_name": "lb_cmp_hand"  (also tolerate plain string embeds)
  const re = new RegExp(`"_name"\\s*:\\s*"${id}"|"${id}"`);
  return re.test(blob);
});

if (present.length === 0) {
  skip(`scene skeleton has no required lb_* yet (${REQUIRED.join(', ')}) — await K4`);
  process.exit(0);
}

const missing = REQUIRED.filter((id) => !present.includes(id));
if (missing.length > 0) {
  fail(`partial lb_* layout: have [${present.join(', ')}] missing [${missing.join(', ')}]`);
} else {
  for (const id of REQUIRED) {
    pass(`node ${id}`);
  }
}

console.log(process.exitCode ? 'COCOS NODE IDS FAILED' : 'COCOS NODE IDS OK');
