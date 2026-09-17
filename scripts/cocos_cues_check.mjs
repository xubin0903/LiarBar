#!/usr/bin/env node
/**
 * Cocos Cues lock check (T2).
 * Assert DRAW_TO_FLIP=1000 / REVEAL_HOLD=3000 / HAND_RING_GAP=24 / FLY_MS=320
 * when Cues.ts (or doc-named equivalents) exists.
 * File missing → SKIP (not red). 合入 ≠ 终验.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'cocos/assets/scripts/game');
const preferred = [
  'cocos/assets/scripts/game/Cues.ts',
  'cocos/assets/scripts/game/cues.ts',
  'cocos/assets/scripts/Cues.ts'
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

function findCuesFile() {
  for (const rel of preferred) {
    const abs = join(root, rel);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return rel;
    }
  }
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
    return null;
  }
  for (const name of readdirSync(gameDir)) {
    if (/^cues\.(ts|js|mts|mjs)$/i.test(name)) {
      return `cocos/assets/scripts/game/${name}`;
    }
  }
  return null;
}

const rel = findCuesFile();
if (!rel) {
  skip('Cues.ts missing under cocos/assets/scripts/game/ — await K4 (doc locks 1000/3000/24/320)');
  process.exit(0);
}

const text = readFileSync(join(root, rel), 'utf8');
pass(`reading ${rel}`);

/** @type {{key: string, want: number, patterns: RegExp[]}[]} */
const locks = [
  {
    key: 'DRAW_TO_FLIP',
    want: 1000,
    patterns: [
      /DRAW_TO_FLIP(?:_MS)?\s*[:=]\s*1000\b/,
      /DRAW_TO_FLIP(?:_MS)?\s*[:=]\s*number\s*=\s*1000\b/
    ]
  },
  {
    key: 'REVEAL_HOLD',
    want: 3000,
    patterns: [
      /REVEAL_HOLD(?:_MS)?\s*[:=]\s*3000\b/,
      /REVEAL_HOLD(?:_MS)?\s*[:=]\s*number\s*=\s*3000\b/
    ]
  },
  {
    key: 'HAND_RING_GAP',
    want: 24,
    patterns: [
      /HAND_RING_GAP(?:_PCT)?\s*[:=]\s*24\b/,
      /HAND_RING_GAP(?:_PCT)?\s*[:=]\s*number\s*=\s*24\b/
    ]
  },
  {
    key: 'FLY_MS',
    want: 320,
    patterns: [
      /FLY_MS\s*[:=]\s*320\b/,
      /FLY_MS\s*[:=]\s*number\s*=\s*320\b/
    ]
  }
];

for (const lock of locks) {
  if (lock.patterns.some((re) => re.test(text))) {
    pass(`${lock.key}=${lock.want}`);
  } else {
    fail(`${rel} missing lock ${lock.key}=${lock.want} (docs 05 §4 / 18 R4)`);
  }
}

// Drift bans (common wrong historical values).
const bans = [
  [/DRAW_TO_FLIP(?:_MS)?\s*[:=]\s*(?:160|500)\b/, 'DRAW_TO_FLIP must not be 160/500'],
  [/REVEAL_HOLD(?:_MS)?\s*[:=]\s*(?:2000|3500|5000)\b/, 'REVEAL_HOLD must not be 2000/3500/5000']
];
for (const [re, msg] of bans) {
  if (re.test(text)) {
    fail(msg);
  }
}

console.log(process.exitCode ? 'COCOS CUES CHECK FAILED' : 'COCOS CUES CHECK OK');
