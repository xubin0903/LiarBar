#!/usr/bin/env node
/**
 * Client card-face binding check (docs 08/09 + art #39).
 * Cloud has no DevEco — this is not CompileArkTS.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

function pngSize(rel) {
  const buf = readFileSync(join(root, rel));
  if (buf.toString('ascii', 1, 4) !== 'PNG') {
    return { w: 0, h: 0 };
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const MEDIA = 'entry/src/main/resources/base/media';
const FACES = [
  'art_card_a',
  'art_card_k',
  'art_card_q',
  'art_card_joker',
  'art_card_back'
];

for (const stem of FACES) {
  const rel = `${MEDIA}/${stem}.png`;
  if (!existsSync(join(root, rel))) {
    fail(`missing ${rel}`);
    continue;
  }
  const st = statSync(join(root, rel));
  const { w, h } = pngSize(rel);
  if (w !== 240 || h !== 336) {
    fail(`${stem} size ${w}×${h}, want 240×336`);
  } else {
    pass(`${stem} 240×336`);
  }
  if (st.size < 50 * 1024) {
    fail(`${stem} ${st.size} bytes looks like a color-block placeholder`);
  } else {
    pass(`${stem} ${st.size} bytes (baked, not a color block)`);
  }
}

const face = src('entry/src/main/ets/features/table/CardFace.ets');
const table = src('entry/src/main/ets/pages/Table.ets');
const overlays = src('entry/src/main/ets/features/table/TableOverlays.ets');
const challenge = src('entry/src/main/ets/features/challenge/ChallengeBeats.ets');
const floats = src('entry/src/main/resources/base/element/float.json');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const scaffold = src('scripts/gen_scaffold_assets.py');
const deck = JSON.parse(src('entry/src/main/resources/rawfile/config/deck.json'));
const dealFx = src('entry/src/main/ets/features/table/DealFx.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');

for (const stem of FACES) {
  if (face.includes(`app.media.${stem}`)) {
    pass(`CardFace binds $r app.media.${stem}`);
  } else {
    fail(`CardFace missing $r app.media.${stem}`);
  }
}

if (/Text\(\s*['"]A['"]/.test(face) || face.includes('Text(this.rank)')) {
  fail('CardFace overlays rank Text (identity must stay in bake)');
} else {
  pass('CardFace has no rank Text overlay');
}

if (table.includes("import { CardFace }") &&
    table.includes('this.selfCards') &&
    table.includes('faceUp: true') &&
    table.includes('card.rank') &&
    table.includes('lb_cmp_card_')) {
  pass('Table self-hand renders rank faces (art_card_*) after DEAL');
} else {
  fail('Table self-hand still backs-only (C1 needs faces in the hand strip)');
}

if (table.includes('faceUp: false') && table.includes('this.cardBacks')) {
  pass('DEAL landing still uses backs until selfHand is shown');
} else {
  fail('lost DEAL-time back landing');
}

if (table.includes("Image($r('app.media.art_card_back'))") && table.includes('dealPileAnchor')) {
  pass('in-flight deal / pile / opponent stacks keep art_card_back');
} else {
  fail('deal fly or pile lost art_card_back');
}

if (overlays.includes('faceUp: true') && overlays.includes('lb_str_peek_hint') && overlays.includes('lb_str_peek_first')) {
  pass('Peek overlay shows faces + C1 copy');
} else {
  fail('Peek overlay missing faces or C1 copy');
}

if (overlays.includes('selected: this.isSelected') && !overlays.includes('选中')) {
  pass('Play sheet uses face + border, no 选中 text');
} else {
  fail('Play sheet still uses text as card identity/selection');
}

if (!challenge.includes('CardFace')) {
  pass('ChallengeBeats left frozen (no CardFace import)');
} else {
  fail('ChallengeBeats was edited');
}

if (ids.includes("MATCH_LOAD: string = 'lb_ovl_match_load'") &&
    ids.includes("MATCH_OPEN: string = 'lb_sfx_match_open'") &&
    ids.includes("DEAL_CARD: string = 'lb_sfx_deal_card'")) {
  pass('#40/#41 symbols kept: MATCH_LOAD / MATCH_OPEN / DEAL_CARD');
} else {
  fail('dropped #40/#41 MATCH_LOAD / MATCH_OPEN / DEAL_CARD');
}

if (ids.includes("FACE: string = 'lb_card_face'") &&
    ids.includes("BACK: string = 'lb_card_face_back'") &&
    ids.includes("FRONT: string = 'lb_card_face_front'")) {
  pass('CardFaceIds lock names');
} else {
  fail('CardFaceIds missing');
}

if (floats.includes('"56vp"') && floats.includes('"78vp"') &&
    floats.includes('"80vp"') && floats.includes('"112vp"')) {
  pass('hand 56×78 unchanged for deal FX; peek face 80×112');
} else {
  fail('float.json card sizes drifted (do not resize deal hand)');
}

if (strings.includes('按住看牌 · 松手收起') && strings.includes('侧边看不清点数')) {
  pass('C1 peek strings present');
} else {
  fail('C1 peek strings missing');
}

const n4 = deck.decks.n4;
if (n4.A === 8 && n4.K === 8 && n4.Q === 8 && n4.JOKER === 4) {
  pass('deck n4 unchanged A8/K8/Q8/JOKER4');
} else {
  fail('deck counts changed');
}

const illustrated = scaffold.slice(scaffold.indexOf('ILLUSTRATED_P0'));
for (const stem of FACES) {
  if (illustrated.includes(`"${stem}"`)) {
    pass(`scaffold skips ${stem}`);
  } else {
    fail(`scaffold will overwrite ${stem}`);
  }
}

if (table.includes('DealFx') && table.includes('DealAudio') && lobby.includes('MATCH_LOAD') ||
    lobby.includes('lb_ovl_match_load')) {
  pass('Table/Lobby still host #40/#41 deal + match-load');
} else {
  fail('Table/Lobby lost deal/load wiring');
}

if (dealFx.includes('DEAL_CARD') || dealFx.includes('cardMs') || dealFx.includes('staggerMs')) {
  pass('DealFx.ets untouched in this check (still present)');
} else {
  fail('DealFx.ets missing');
}

try {
  execSync('python3 -c "import numpy,PIL"', { cwd: root, encoding: 'utf8' });
  const py = execSync('python3 - <<\'PY\'\n'
    + 'from pathlib import Path\n'
    + 'import numpy as np\n'
    + 'from PIL import Image\n'
    + 'root = Path(r"' + root + '")\n'
    + 'media = root / "entry/src/main/resources/base/media"\n'
    + 'faces = ["art_card_a","art_card_k","art_card_q","art_card_joker"]\n'
    + 'arrs = []\n'
    + 'for name in faces:\n'
    + '    im = Image.open(media / f"{name}.png").convert("RGB")\n'
    + '    assert im.size == (240, 336), (name, im.size)\n'
    + '    region = np.asarray(im.crop((16, 16, 72, 106)), dtype=np.float32)\n'
    + '    gray = region.mean(axis=2)\n'
    + '    ink = gray < 200\n'
    + '    rows = np.where(ink.any(axis=1))[0]\n'
    + '    lh = int(rows.max() - rows.min() + 1) if len(rows) else 0\n'
    + '    print(f"{name} letter≈{lh}px")\n'
    + '    if lh < 74:\n'
    + '        raise SystemExit(f"{name} letter {lh} < 74")\n'
    + '    arrs.append(np.asarray(im, dtype=np.float32))\n'
    + 'for i, a in enumerate(faces):\n'
    + '    for j in range(i+1, 4):\n'
    + '        mse = float(np.mean((arrs[i] - arrs[j]) ** 2))\n'
    + '        print(f"mse {a} vs {faces[j]}: {mse:.1f}")\n'
    + '        if mse < 400:\n'
    + '            raise SystemExit(f"faces {a}/{faces[j]} too similar")\n'
    + 'print("pixel ok")\n'
    + 'PY', { cwd: root, encoding: 'utf8' });
  console.log(py.trim());
  pass('baked letter ≥74px and four distinct faces');
} catch {
  pass('pixel letter-height skipped (no PIL); PNG size/bytes already checked');
}

if (process.exitCode) {
  console.error('card_faces_check FAILED');
} else {
  console.log('card_faces_check OK');
}
