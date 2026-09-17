#!/usr/bin/env node
/**
 * C2′ · 从 ASCII 交接包拷贝 arm64 libcocos.so（及 libc++_shared.so）到本机 libs。
 * 不进 git。默认源见 docs/05 §7.3 / entry/libs/arm64-v8a/README.md。
 *
 * Usage:
 *   node scripts/copy_cocos_native_libs.mjs
 *   node scripts/copy_cocos_native_libs.mjs --dest cocos_engine/libs/arm64-v8a
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const DEFAULT_SRC = 'E:\\Cocos\\projects\\LiarBarHarmonyNative\\handoff-arm64-v8a';
const DEFAULT_DEST = path.join(root, 'entry', 'libs', 'arm64-v8a');
const FILES = ['libcocos.so', 'libc++_shared.so'];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const srcDir = argValue('--src') || process.env.LIARBAR_COCOS_HANDOFF || DEFAULT_SRC;
const destDir = path.resolve(root, argValue('--dest') || DEFAULT_DEST);

if (!fs.existsSync(srcDir)) {
  console.error(`[copy_cocos_native_libs] source missing: ${srcDir}`);
  console.error('  Set --src or LIARBAR_COCOS_HANDOFF to the handoff-arm64-v8a folder.');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

let ok = 0;
for (const name of FILES) {
  const from = path.join(srcDir, name);
  const to = path.join(destDir, name);
  if (!fs.existsSync(from)) {
    console.error(`[copy_cocos_native_libs] missing file: ${from}`);
    process.exit(1);
  }
  const st = fs.statSync(from);
  process.stdout.write(`[copy_cocos_native_libs] ${name} (${(st.size / (1024 * 1024)).toFixed(1)} MiB) → ${to}\n`);
  fs.copyFileSync(from, to);
  ok += 1;
}

console.log(`[copy_cocos_native_libs] done · ${ok} files → ${destDir}`);
console.log('[copy_cocos_native_libs] remember: LINK_LIBCOCOS / USE_COCOS_TABLE stay false in git; flip locally for smoke only.');
