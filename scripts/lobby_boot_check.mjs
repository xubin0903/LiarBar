#!/usr/bin/env node
/**
 * Spec check for lobby v3 cold-start
 * (docs/04-设计/04-开场声场与大厅氛围-v3.md §7 /
 *  docs/04-设计/05-开场大厅v3-UI动效挂点.md I.2 Hm1–Hm8).
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

const boot = src('entry/src/main/ets/features/lobby/LobbyBoot.ets');
const machine = src('entry/src/main/ets/features/lobby/DealerIdleMachine.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');
const panel = src('entry/src/main/ets/features/lobby/LobbyPanel.ets');
const audio = src('entry/src/main/ets/features/lobby/LobbyAudio.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const strings = src('entry/src/main/resources/base/element/string.json');
const pages = src('entry/src/main/resources/base/profile/main_pages.json');

const TOTAL = readConst(boot, 'BOOT_MS_TOTAL');
const MIN = readConst(boot, 'BOOT_MS_MIN');
const MAX = readConst(boot, 'BOOT_MS_MAX');
const T0 = readConst(boot, 'BOOT_MS_T0');
const T1 = readConst(boot, 'BOOT_MS_T1');
const T2 = readConst(boot, 'BOOT_MS_T2');
const T3 = readConst(boot, 'BOOT_MS_T3');
const T4_AT = readConst(boot, 'BOOT_MS_T4_AT');
const T5 = readConst(boot, 'BOOT_MS_T5');
const T5_AT = readConst(boot, 'BOOT_MS_T5_AT');
const T6 = readConst(boot, 'BOOT_MS_T6');
const T6_AT = readConst(boot, 'BOOT_MS_T6_AT');
const CLICK = readConst(boot, 'BOOT_MS_CLICKABLE_AT');
const HIT_AT = readConst(boot, 'BOOT_MS_HIT_AT');
const AMB_AT = readConst(boot, 'BOOT_MS_AMB_AT');
const AMB_FADE = readConst(boot, 'BOOT_MS_AMB_FADE');
const BGM_AT = readConst(boot, 'BOOT_MS_BGM_AT');
const BGM_FADE = readConst(boot, 'BOOT_MS_BGM_FADE');
const VO_DEF = readConst(boot, 'BOOT_MS_VO_DEFAULT');
const VO_MIN = readConst(boot, 'BOOT_MS_VO_MIN');
const VO_MAX = readConst(boot, 'BOOT_MS_VO_MAX');
const GAP = readConst(boot, 'BOOT_MS_STAGGER_GAP');
const LAYER = readConst(boot, 'BOOT_MS_LAYER');
const CTA_PRESS = readConst(boot, 'BOOT_MS_CTA_PRESS');
const RET = readConst(boot, 'BOOT_MS_RETURN_ENTER');
const ANN_CROSS = readConst(boot, 'BOOT_MS_ANNOUNCE_CROSS');
const ANN_HOLD = readConst(boot, 'BOOT_MS_ANNOUNCE_HOLD');
const IDLE_BACK = readConst(boot, 'BOOT_MS_IDLE_BACK');

if (TOTAL === 3800 && MIN === 3000 && MAX === 4500) {
  pass('BOOT_MS_TOTAL 3800 clamp 3000–4500');
} else {
  fail(`BOOT_MS_* total/clamp ${TOTAL}/${MIN}/${MAX}`);
}

if (T0 === 80 && T1 === 520 && T2 === 800 && T3 === 800 && T5 === 800 && T6 === 500) {
  pass('T0–T6 windows 80/520/800/800 + T5 800 + T6 500');
} else {
  fail(`T0–T6 ${T0}/${T1}/${T2}/${T3}/${T5}/${T6}`);
}

if (T4_AT === 2200 && T5_AT === 2500 && T6_AT === 3300 && CLICK === 3800 && HIT_AT === 180) {
  pass('absolute marks T4=2200 T5=2500 T6=3300 click=3800 hit=180');
} else {
  fail(`absolute marks ${T4_AT}/${T5_AT}/${T6_AT}/${CLICK}/${HIT_AT}`);
}

if (AMB_AT === 600 && AMB_FADE === 400 && BGM_AT === 800 && BGM_FADE === 600) {
  pass('amb@600 fade400 / bgm@800 fade600');
} else {
  fail(`bed marks ${AMB_AT}/${AMB_FADE}/${BGM_AT}/${BGM_FADE}`);
}

if (VO_DEF === 2100 && VO_MIN === 1800 && VO_MAX === 2400) {
  pass('VO clock 2100 (silent) clamp 1800–2400');
} else {
  fail(`VO ${VO_DEF}/${VO_MIN}/${VO_MAX}`);
}

if (GAP >= 90 && GAP <= 110 && LAYER >= 240 && LAYER <= 280) {
  pass(`stagger gap ${GAP}ms layer ${LAYER}ms`);
} else {
  fail(`stagger gap/layer ${GAP}/${LAYER}`);
}

if (CTA_PRESS <= 80 && RET === 400 && ANN_CROSS === 350 && ANN_HOLD === 250 && IDLE_BACK === 400) {
  pass('CTA 80 / return 400 / announce 350+250 / idle-back 400');
} else {
  fail('CTA/return/announce constants');
}

function plan(totalMs) {
  const total = clampTotal(totalMs, MIN, MAX);
  let t0Ms = T0;
  let t1Ms = T1;
  let t2Ms = T2;
  let t3Ms = T3;
  let t4Lead = T5_AT - T4_AT;
  let t5Ms = T5;
  if (total < TOTAL) {
    const scale = total / TOTAL;
    t0Ms = Math.round(T0 * scale);
    t1Ms = Math.round(T1 * scale);
    t2Ms = Math.round(T2 * scale);
    t3Ms = Math.round(T3 * scale);
    t4Lead = Math.round((T5_AT - T4_AT) * scale);
    t5Ms = Math.round(T5 * scale);
  } else if (total > TOTAL) {
    const extra = total - TOTAL;
    const half = Math.floor(extra / 2);
    t2Ms = T2 + half;
    t3Ms = T3 + (extra - half);
  }
  const t1At = t0Ms;
  const t2At = t1At + t1Ms;
  const t3At = t2At + t2Ms;
  const t4At = t3At + t3Ms;
  const t5At = t4At + t4Lead;
  const t6At = t5At + t5Ms;
  const t6Ms = total - t6At;
  const clickableAt = total;
  const hitAt = t1At + Math.round((HIT_AT - T0) * (t1Ms / T1));
  const ambAt = t2At;
  const bgmAt = t2At + Math.round((BGM_AT - AMB_AT) * (t2Ms / T2));
  return { t0Ms, t1Ms, t2Ms, t3Ms, t5Ms, t6Ms, t1At, t2At, t3At, t4At, t5At, t6At, clickableAt, hitAt, ambAt, bgmAt };
}

const def = plan(3800);
if (def.t1At === 80 && def.t2At === 600 && def.t3At === 1400 && def.t4At === 2200 &&
    def.t5At === 2500 && def.t6At === 3300 && def.clickableAt === 3800 &&
    def.hitAt === 180 && def.ambAt === 600 && def.bgmAt === 800) {
  pass('plan(3800) T0–T6 0/80/600/1400/2200/2500/3300/3800 + hit180 amb600 bgm800');
} else {
  fail(`plan(3800) ${JSON.stringify(def)}`);
}

const short = plan(3000);
const long = plan(4500);
if (short.clickableAt >= 3000 && short.clickableAt <= 4500 &&
    long.clickableAt >= 3000 && long.clickableAt <= 4500) {
  pass(`scaled totals ${short.clickableAt} / ${long.clickableAt} stay in 3000–4500`);
} else {
  fail('scaled totals left clamp window');
}
if (short.t0Ms > 0 && short.t1Ms > 0 && short.t2Ms > 0 && short.t3Ms > 0 &&
    short.t5Ms > 0 && short.t6Ms > 0) {
  pass('short axis keeps every beat');
} else {
  fail('short axis dropped a beat');
}
if (long.t2Ms > T2 && long.t3Ms > T3 && long.t1Ms === T1 && long.t5Ms === T5) {
  pass('long axis stretches only T2 + T3');
} else {
  fail(`long axis stretch ${long.t2Ms}/${long.t3Ms} t1=${long.t1Ms} t5=${long.t5Ms}`);
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
if (lobby.includes("app.media.art_dealer_idle_blink") &&
    lobby.includes("app.media.art_dealer_idle_nod") &&
    lobby.includes("app.media.art_dealer_idle_cup") &&
    lobby.includes("app.media.art_dealer_idle_mask")) {
  pass('four idle action frames bound');
} else {
  fail('missing idle action $r');
}
if (lobby.includes("app.media.art_fx_candle")) {
  pass('art_fx_candle bound');
} else {
  fail('art_fx_candle');
}
if (lobby.includes("app.media.art_fx_dust") || lobby.includes('pulseDust')) {
  pass('dust layer (art_fx_dust or procedural)');
} else {
  fail('dust missing');
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
if (lobby.includes('takeColdStart') && lobby.includes('startReturnEnter') &&
    lobby.includes('BOOT_MS_RETURN_ENTER')) {
  pass('return 0.4s short enter (no second cold axis)');
} else {
  fail('return enter');
}
const returnFn = lobby.match(/private startReturnEnter\(\)[\s\S]*?\n  private /);
if (returnFn && !returnFn[0].includes('playVoGreet') && !returnFn[0].includes('playBootHit') &&
    returnFn[0].includes('greetOpacity = 0')) {
  pass('return enter does not replay VO / greet');
} else {
  fail('return enter still greets');
}

const newAudioIds = [
  ['lb_bgm_lobby_night', 'SfxIds.BGM_LOBBY_NIGHT'],
  ['lb_sfx_amb_tavern', 'SfxIds.AMB_TAVERN'],
  ['lb_sfx_boot_hit', 'SfxIds.BOOT_HIT'],
  ['lb_sfx_cta_tap', 'SfxIds.CTA_TAP'],
  ['lb_vo_dealer_greet', 'SfxIds.VO_DEALER_GREET']
];
if (newAudioIds.every((pair) => ids.includes(`'${pair[0]}'`) && audio.includes(pair[1]))) {
  pass('player ids lb_bgm_lobby_night / lb_sfx_amb_tavern / lb_sfx_boot_hit / lb_sfx_cta_tap / lb_vo_dealer_greet');
} else {
  fail('new audio call-site ids');
}

const idBlob = `${ids}\n${audio}\n${lobby}`;
const bannedExact = [
  "static readonly BOOT: string = 'lb_sfx_boot'",
  "static readonly LOBBY_AMB: string = 'lb_sfx_lobby_amb'",
  "static readonly CTA: string = 'lb_sfx_cta'",
  'sfx/sfx_boot.wav',
  'sfx/sfx_lobby_amb.wav',
  'sfx/sfx_cta.wav',
  'lb_sfx_lobby_amb'
];
const bannedHit = bannedExact.filter((s) => idBlob.includes(s));
if (bannedHit.length === 0 &&
    !ids.includes("'lb_sfx_lobby_amb'") &&
    !audio.includes('PATH_BOOT') &&
    !audio.includes('playBoot()')) {
  pass('old sfx_boot / sfx_lobby_amb / sfx_cta and lb_sfx_* aliases gone');
} else {
  fail(`old sfx names still bound: ${bannedHit.join(',')}`);
}

if (audio.includes('audio/bgm/bgm_lobby_night.ogg') &&
    audio.includes('audio/sfx/sfx_amb_tavern.ogg') &&
    audio.includes('audio/sfx/sfx_boot_hit.wav') &&
    audio.includes('audio/sfx/sfx_cta_tap.wav') &&
    audio.includes('audio/vo/vo_dealer_greet.wav')) {
  pass('v3 rawfile/audio paths');
} else {
  fail('v3 audio paths');
}

if (audio.includes('skipped (silent)') && lobby.includes('LobbyAudio.setSilent') &&
    audio.includes('stopBedsNow') && !audio.includes('-24') && !audio.includes('0.063')) {
  pass('silent match hard-off (no −24 dB leftover)');
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
if (audio.includes('AVFileDescriptor') && audio.includes('media.AVFileDescriptor')) {
  pass('BGM/amb use official AVFileDescriptor');
} else {
  fail('AVFileDescriptor');
}

if (lobby.includes("app.string.lb_str_dlr_lobby_greet") && lobby.includes('greetOpacity') &&
    lobby.includes('showGreet') && lobby.includes('playVoGreet')) {
  pass('greet subtitle + VO same T4 beat');
} else {
  fail('greet subtitle / VO');
}
if (lobby.includes('voClockMs') && lobby.includes('crossToAnnounce') &&
    lobby.includes('crossBackIdle') && lobby.includes('BOOT_MS_ANNOUNCE_HOLD')) {
  pass('announce↔idle: T4 350ms + VO + 250ms hold + 400ms back');
} else {
  fail('announce state machine');
}

if (ids.includes("lb_btn_peek_table") && lobby.includes('ControlIds.PEEK_TABLE')) {
  pass('lb_btn_peek_table');
} else {
  fail('peek id');
}
if (lobby.includes('playCtaTap(false)') && lobby.includes('playCtaTap(true)') &&
    lobby.includes('ctaPressScale = 0.96') && lobby.includes('peekPressScale = 0.98')) {
  pass('CTA 0.96 + peek 0.98 / −3 dB tap');
} else {
  fail('CTA press feel');
}

if (machine.includes('0.40') && machine.includes('0.25') &&
    machine.includes('0.20') && machine.includes('0.15') &&
    machine.includes("BLINK") && machine.includes("NOD") &&
    machine.includes("CUP") && machine.includes("MASK") &&
    lobby.includes('playIdleAction') && lobby.includes('art_dealer_idle_blink')) {
  pass('idle SM weights blink0.40/nod0.25/cup0.20/mask0.15 + four-state loop');
} else {
  fail('idle state machine');
}
if (machine.includes('lastMajor') && machine.includes('cupActive') &&
    boot.includes('BOOT_MS_BLINK_CD') && boot.includes('BOOT_MS_CUP_CD')) {
  pass('idle cooldown + mutex');
} else {
  fail('idle mutex/cooldown');
}
if (machine.includes('CROSS_MS: number = 150') || boot.includes('BOOT_MS_IDLE_CROSS: number = 150')) {
  pass('idle crossfade 150ms (120–180)');
} else {
  fail('idle crossfade');
}

const etsBlob = [boot, lobby, panel, audio, machine].join('\n');
if (/\bany\b/.test(etsBlob) || /\bunknown\b/.test(etsBlob) || /ESObject/.test(etsBlob) || /lb_art_/.test(etsBlob)) {
  fail('any/unknown/ESObject/lb_art_ in lobby v3 ets');
} else {
  pass('no any/unknown/ESObject/lb_art_');
}
if (etsBlob.includes("decks[") || etsBlob.includes("decks['")) {
  fail('indexed deck bag access');
} else {
  pass('no indexed deck keys');
}

const assets = [
  ['entry/src/main/resources/rawfile/audio/bgm/bgm_lobby_night.ogg', 'OggS'],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_amb_tavern.ogg', 'OggS'],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_boot_hit.wav', 'RIFF'],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_cta_tap.wav', 'RIFF'],
  ['entry/src/main/resources/rawfile/audio/vo/vo_dealer_greet.wav', 'RIFF'],
  ['entry/src/main/resources/base/media/art_dealer_idle_blink.png', '\x89PNG'],
  ['entry/src/main/resources/base/media/art_dealer_idle_nod.png', '\x89PNG'],
  ['entry/src/main/resources/base/media/art_dealer_idle_cup.png', '\x89PNG'],
  ['entry/src/main/resources/base/media/art_dealer_idle_mask.png', '\x89PNG'],
  ['entry/src/main/resources/base/media/art_fx_candle.png', '\x89PNG']
];
for (const [rel, magic] of assets) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    fail(`missing ${rel}`);
    continue;
  }
  const buf = readFileSync(abs);
  const head = magic === '\x89PNG' ? buf.subarray(0, 4).toString('latin1') : buf.toString('ascii', 0, 4);
  if (head === magic) {
    pass(`${rel} present`);
  } else {
    fail(`${rel} bad magic ${JSON.stringify(head)}`);
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

if (panel.includes('tavern_panel') && lobby.includes("width('86%')")) {
  pass('narrow settings card (panel token, not full-bleed felt)');
} else {
  fail('settings card not narrowed');
}

if (lobby.includes('pulseBreath') && lobby.includes('pulseCandle') && lobby.includes('playIdleAction')) {
  pass('dealer breath + candle + real idle actions (not scale-only)');
} else {
  fail('idle motion missing');
}

if (lobby.includes('ControlIds.DEALER_BANNER') || lobby.includes('lb_cmp_dealer_banner')) {
  fail('lobby touched dealer banner');
} else {
  pass('lb_cmp_dealer_banner left in table');
}

console.log(process.exitCode ? 'LOBBY BOOT CHECK FAILED' : 'LOBBY BOOT CHECK OK');
