#!/usr/bin/env node
/**
 * Spec check for lobby v2 cold-start (docs/04-设计/03-开场与大厅交互-v2.md §2 / §7).
 * Cloud has no DevEco — this is not CompileArkTS.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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

function readConst(text, name) {
  const m = text.match(new RegExp(`static readonly ${name}: number = (\\d+);`));
  if (!m) {
    fail(`missing ${name}`);
    return 0;
  }
  return Number(m[1]);
}

function clampTotal(ms, min, max) {
  if (ms < min) {
    return min;
  }
  if (ms > max) {
    return max;
  }
  return ms;
}

function scaled(base, total, def, min, max) {
  return Math.round(base * (clampTotal(total, min, max) / def));
}

const boot = src('entry/src/main/ets/features/lobby/LobbyBoot.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');
const panel = src('entry/src/main/ets/features/lobby/LobbyPanel.ets');
const audio = src('entry/src/main/ets/features/lobby/LobbyAudio.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const pages = src('entry/src/main/resources/base/profile/main_pages.json');

const TOTAL = readConst(boot, 'BOOT_MS_TOTAL');
const MIN = readConst(boot, 'BOOT_MS_MIN');
const MAX = readConst(boot, 'BOOT_MS_MAX');
const SPLASH = readConst(boot, 'BOOT_MS_SPLASH');
const LOAD = readConst(boot, 'BOOT_MS_LOAD');
const DEALER = readConst(boot, 'BOOT_MS_DEALER');
const STAGGER = readConst(boot, 'BOOT_MS_STAGGER');
const STEADY = readConst(boot, 'BOOT_MS_STEADY');
const GAP = readConst(boot, 'BOOT_MS_STAGGER_GAP');
const CTA_PRESS = readConst(boot, 'BOOT_MS_CTA_PRESS');

if (TOTAL === 2000 && MIN === 1500 && MAX === 2500) {
  pass('BOOT_MS_TOTAL 2000 clamp 1500–2500');
} else {
  fail(`BOOT_MS_* total/clamp ${TOTAL}/${MIN}/${MAX}`);
}

const sum = SPLASH + LOAD + DEALER + STAGGER + STEADY;
if (sum === 2000 && SPLASH === 350 && LOAD === 550 && DEALER === 400 && STAGGER === 400 && STEADY === 300) {
  pass('default beats 350+550+400+400+300 = 2000');
} else {
  fail(`default beat sum ${sum}`);
}

if (GAP >= 80 && GAP <= 100) {
  pass(`stagger gap ${GAP}ms`);
} else {
  fail(`stagger gap ${GAP}`);
}

if (CTA_PRESS <= 80) {
  pass(`CTA press ${CTA_PRESS}ms ≤80`);
} else {
  fail(`CTA press ${CTA_PRESS}`);
}

function plan(totalMs) {
  const total = clampTotal(totalMs, MIN, MAX);
  const splashMs = scaled(SPLASH, total, TOTAL, MIN, MAX);
  const loadMs = scaled(LOAD, total, TOTAL, MIN, MAX);
  const dealerMs = scaled(DEALER, total, TOTAL, MIN, MAX);
  const staggerMs = scaled(STAGGER, total, TOTAL, MIN, MAX);
  const steadyMs = scaled(STEADY, total, TOTAL, MIN, MAX);
  const loadAt = splashMs;
  const dealerAt = loadAt + loadMs;
  const staggerAt = dealerAt + dealerMs;
  const steadyAt = clampTotal(staggerAt + staggerMs + steadyMs, MIN, MAX);
  return { splashMs, loadMs, dealerMs, staggerMs, steadyMs, loadAt, dealerAt, staggerAt, steadyAt };
}

const def = plan(2000);
if (def.steadyAt === 2000 && def.loadAt === 350 && def.dealerAt === 900 && def.staggerAt === 1300) {
  pass('plan(2000) marks 0/350/900/1300/2000');
} else {
  fail(`plan(2000) ${JSON.stringify(def)}`);
}

const short = plan(1500);
const long = plan(2500);
if (short.steadyAt >= 1500 && short.steadyAt <= 2500 && long.steadyAt >= 1500 && long.steadyAt <= 2500) {
  pass(`scaled totals ${short.steadyAt} / ${long.steadyAt} stay in 1500–2500`);
} else {
  fail('scaled totals left clamp window');
}
if (short.splashMs > 0 && short.loadMs > 0 && short.dealerMs > 0 && short.staggerMs > 0 && short.steadyMs > 0) {
  pass('short axis keeps every beat');
} else {
  fail('short axis dropped a beat');
}

if (strings.includes('"lb_str_dlr_lobby_greet"') && strings.includes('夜深了，位子给你留着。')) {
  pass('greet key + copy');
} else {
  fail('greet string');
}

if (lobby.includes("app.media.art_splash_still") && lobby.includes("app.media.art_lobby_bg")) {
  pass('independent splash + lobby bg slots');
} else {
  fail('missing splash or lobby bg $r');
}
if (lobby.includes("app.media.art_dealer_bust_idle") && lobby.includes("app.media.art_dealer_bust_announce")) {
  pass('dealer idle/announce crossfade sources');
} else {
  fail('dealer bust $r');
}
if (lobby.includes("app.media.art_btn_primary") && panel.includes("app.media.art_input_field")) {
  pass('CTA + input skins');
} else {
  fail('cta/input skins');
}

if (lobby.includes('ScreenIds.LOBBY') && !lobby.includes('lb_scr_home') && !pages.includes('Home')) {
  pass('single route lb_scr_lobby, no lb_scr_home');
} else {
  fail('home route leaked');
}

if (lobby.includes('enabled(this.bootReady)') && lobby.includes('if (!this.bootReady)')) {
  pass('CTA gated until bootReady');
} else {
  fail('CTA gate');
}
if (lobby.includes('startMatch(opts)') && lobby.includes('LbRouter.toTable()')) {
  pass('steady CTA still START_MATCH → table');
} else {
  fail('START_MATCH path');
}

if (audio.includes('SfxIds.BOOT') && audio.includes('sfx/sfx_boot.wav') &&
    audio.includes('sfx/sfx_lobby_amb.wav') && audio.includes('sfx/sfx_cta.wav')) {
  pass('boot + ambient + cta rawfile paths');
} else {
  fail('sfx paths');
}
if (audio.includes('skipped (silent)') && lobby.includes('LobbyAudio.setSilent')) {
  pass('silent match mutes non-essential audio');
} else {
  fail('silent mute wiring');
}
if (audio.includes('interface RawFdSlice') || audio.includes(': RawFdSlice')) {
  fail('local RawFdSlice structural stand-in (arkts-no-structural-typing)');
} else {
  pass('no RawFdSlice structural stand-in');
}
if (audio.includes('RawFileDescriptor') && audio.includes('getRawFd') &&
    audio.includes('rawFd.fd') && audio.includes('rawFd.offset') && audio.includes('rawFd.length')) {
  pass('SoundPool.load uses official RawFileDescriptor fields');
} else {
  fail('getRawFd / RawFileDescriptor field copy');
}
if (lobby.includes("app.string.lb_str_dlr_lobby_greet") && lobby.includes('greetOpacity')) {
  pass('greet subtitle still shown (opacity independent of silent)');
} else {
  fail('greet subtitle');
}

if (ids.includes("lb_btn_peek_table") && lobby.includes('ControlIds.PEEK_TABLE')) {
  pass('lb_btn_peek_table');
} else {
  fail('peek id');
}
if (ids.includes("lb_sfx_boot") && ids.includes("lb_sfx_lobby_amb") && ids.includes("lb_sfx_cta")) {
  pass('lb_sfx_* call sites');
} else {
  fail('sfx ids');
}

const etsBlob = [boot, lobby, panel, audio].join('\n');
if (/\bany\b/.test(etsBlob) || /\bunknown\b/.test(etsBlob) || /ESObject/.test(etsBlob) || /lb_art_/.test(etsBlob)) {
  fail('any/unknown/ESObject/lb_art_ in lobby v2 ets');
} else {
  pass('no any/unknown/ESObject/lb_art_');
}
if (etsBlob.includes("decks[") || etsBlob.includes("decks['")) {
  fail('indexed deck bag access');
} else {
  pass('no indexed deck keys');
}

const wavs = [
  'entry/src/main/resources/rawfile/sfx/sfx_boot.wav',
  'entry/src/main/resources/rawfile/sfx/sfx_lobby_amb.wav',
  'entry/src/main/resources/rawfile/sfx/sfx_cta.wav'
];
for (const rel of wavs) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    fail(`missing ${rel}`);
    continue;
  }
  const buf = readFileSync(abs);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    pass(`${rel} is WAVE`);
  } else {
    fail(`${rel} not WAVE`);
  }
}

const frozen = [
  'entry/src/main/ets/engine/MatchEngine.ets',
  'entry/src/main/ets/pages/Table.ets',
  'entry/src/main/ets/pages/Challenge.ets',
  'entry/src/main/ets/pages/Report.ets',
  'entry/src/main/ets/common/MatchDirector.ets',
  'entry/src/main/resources/rawfile/config/demo_seed.json',
  'entry/src/main/resources/rawfile/config/deck.json',
  'entry/src/main/resources/rawfile/config/match_defaults.json'
];
let frozenDirty = false;
for (const rel of frozen) {
  const diff = execSync(`git diff origin/develop -- ${rel}`, { cwd: root, encoding: 'utf8' });
  if (diff.trim().length > 0) {
    fail(`frozen file changed: ${rel}`);
    frozenDirty = true;
  }
}
if (!frozenDirty) {
  pass('MatchEngine / Table / Challenge / Report / demo_seed / decks / match_defaults untouched');
}

const engineCheck = src('entry/src/main/ets/engine/MatchEngine.ets');
if (engineCheck.includes('humanMustWait') || engineCheck.includes('HUMAN TURN')) {
  pass('engine still documents HUMAN wait (PR#19)');
}

if (panel.includes('tavern_panel') && lobby.includes('width(\'86%\')')) {
  pass('narrow settings card (panel token, not full-bleed felt)');
} else {
  fail('settings card not narrowed');
}

if (lobby.includes('pulseBreath') && lobby.includes('pulseCandle')) {
  pass('dealer breath + candle flicker');
} else {
  fail('idle motion missing');
}

console.log(process.exitCode ? 'LOBBY BOOT CHECK FAILED' : 'LOBBY BOOT CHECK OK');
