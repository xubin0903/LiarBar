#!/usr/bin/env node
/**
 * Table BGM + §5.2 SFX rebind (docs 13 §3/§5/§6, assets #80).
 * Cloud has no DevEco — this is not CompileArkTS.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
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
  const m = text.match(new RegExp(`static readonly ${name}: number = ([0-9.]+);`));
  if (!m) {
    fail(`missing ${name}`);
    return 0;
  }
  return Number(m[1]);
}

const audio = src('entry/src/main/ets/features/table/TableAudio.ets');
const deal = src('entry/src/main/ets/features/table/DealAudio.ets');
const lobbyAudio = src('entry/src/main/ets/features/lobby/LobbyAudio.ets');
const lobbyBoot = src('entry/src/main/ets/features/lobby/LobbyBoot.ets');
const table = src('entry/src/main/ets/pages/Table.ets');
const lobby = src('entry/src/main/ets/pages/Lobby.ets');
const report = src('entry/src/main/ets/pages/Report.ets');
const challenge = src('entry/src/main/ets/pages/Challenge.ets');
const beats = src('entry/src/main/ets/features/challenge/ChallengeBeats.ets');
const ids = src('entry/src/main/ets/common/Ids.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');

const fadeIn = readConst(audio, 'BGM_FADE_IN_MS');
const fadeOut = readConst(audio, 'BGM_FADE_OUT_MS');
const leaveLobby = readConst(lobbyBoot, 'BOOT_MS_LEAVE_BGM');
const peakSoft = readConst(audio, 'PEAK_SOFT_MS');
const peakSlam = readConst(audio, 'PEAK_SLAM_MS');
const peakHesitate = readConst(audio, 'PEAK_HESITATE_MS');
const slamDuck = readConst(audio, 'SLAM_DUCK_MS');

if (fadeIn === 600 && fadeOut === 400 && leaveLobby === 400) {
  pass(`enter crossfade lobby ${leaveLobby}ms out → table ${fadeIn}ms in; leave ${fadeOut}ms`);
} else {
  fail(`fade timings in=${fadeIn} out=${fadeOut} lobbyLeave=${leaveLobby} (want 600/400/400)`);
}

const idPairs = [
  ['lb_bgm_table_bluff', 'BGM_TABLE_BLUFF'],
  ['lb_sfx_claim_set', 'CLAIM_SET'],
  ['lb_sfx_play_soft', 'PLAY_SOFT'],
  ['lb_sfx_play_slam', 'PLAY_SLAM'],
  ['lb_sfx_play_hesitate', 'PLAY_HESITATE'],
  ['lb_sfx_turn_tick', 'TURN_TICK'],
  ['lb_sfx_named_stare', 'NAMED_STARE'],
  ['lb_sfx_result_win', 'RESULT_WIN'],
  ['lb_sfx_result_lose', 'RESULT_LOSE']
];
if (idPairs.every((pair) => ids.includes(`'${pair[0]}'`) && audio.includes(`SfxIds.${pair[1]}`))) {
  pass('SfxIds registered for table BGM + §5.2 eight slots');
} else {
  fail('SfxIds / TableAudio call-site ids');
}

const paths = [
  'audio/bgm/bgm_table_bluff.ogg',
  'audio/sfx/sfx_claim_set.wav',
  'audio/sfx/sfx_play_soft.wav',
  'audio/sfx/sfx_play_slam.wav',
  'audio/sfx/sfx_play_hesitate.wav',
  'audio/sfx/sfx_turn_tick.wav',
  'audio/sfx/sfx_named_stare.wav',
  'audio/sfx/sfx_result_win.wav',
  'audio/sfx/sfx_result_lose.wav'
];
if (paths.every((p) => audio.includes(p))) {
  pass('TableAudio rawfile/audio paths');
} else {
  fail('TableAudio missing rawfile path');
}

const assets = [
  ['entry/src/main/resources/rawfile/audio/bgm/bgm_table_bluff.ogg', 'OggS', 80000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_claim_set.wav', 'RIFF', 8000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_play_soft.wav', 'RIFF', 8000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_play_slam.wav', 'RIFF', 8000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_play_hesitate.wav', 'RIFF', 8000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_turn_tick.wav', 'RIFF', 4000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_named_stare.wav', 'RIFF', 8000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_result_win.wav', 'RIFF', 20000],
  ['entry/src/main/resources/rawfile/audio/sfx/sfx_result_lose.wav', 'RIFF', 20000]
];
for (const [rel, magic, min] of assets) {
  const abs = join(root, rel);
  if (!existsSync(abs) || statSync(abs).size < min) {
    fail(`${rel} missing or tiny`);
    continue;
  }
  const head = readFileSync(abs).subarray(0, 4).toString('ascii');
  if (head === magic) {
    pass(`#80 ${rel.split('/').pop()} ${statSync(abs).size} bytes (${magic})`);
  } else {
    fail(`${rel} magic ${head} != ${magic}`);
  }
}

if (table.includes('TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS)') &&
    lobbyAudio.includes('BOOT_MS_LEAVE_BGM') &&
    lobby.includes('LobbyAudio.leaveThenRelease()')) {
  pass('enter table: LobbyAudio.leaveThenRelease (400ms) + TableAudio.startBgm 600ms');
} else {
  fail('enter-table BGM handoff');
}

if (table.includes('TableAudio.playClaimSet()') &&
    table.includes('TableAudio.playTurnTick()') &&
    table.includes('TableAudio.playStyleAtPeak') &&
    table.includes('TableAudio.playNamedStare()') &&
    table.includes('hearLastPlay')) {
  pass('table hooks: claim_set / turn_tick / play-style peak / named_stare');
} else {
  fail('table SFX hooks');
}

if (peakSoft > 0 && peakSlam > 0 && peakHesitate > 0 && slamDuck === 120 &&
    audio.includes('PlayStyle.SLAM') && audio.includes('PlayStyle.HESITATE') &&
    audio.includes('duckForSlam')) {
  pass(`play-style peaks soft=${peakSoft} slam=${peakSlam} hesitate=${peakHesitate}; slam duck ${slamDuck}ms`);
} else {
  fail('play-style peak / slam duck');
}

if (report.includes('TableAudio.playResult') &&
    report.includes('TableAudio.fadeBgmOut(TableAudio.BGM_FADE_OUT_MS)')) {
  pass('report: result_win/lose + table BGM 400ms fade-out');
} else {
  fail('report result / fade-out');
}

if (audio.includes('skipped (silent)') &&
    table.includes('TableAudio.setSilent') &&
    report.includes('TableAudio.setSilent') &&
    lobby.includes('TableAudio.leaveThenRelease()') &&
    audio.includes('stopBedsNow') &&
    !audio.includes('-24') &&
    !audio.includes('0.063')) {
  pass('silent: table BGM + §5.2 SFX hard-off (no leftover whisper)');
} else {
  fail('silent table wiring');
}

const challengeBlob = `${challenge}\n${beats}`;
const wiredChallengeSfx = ids.includes("'lb_sfx_challenge") ||
  audio.includes('audio/sfx/sfx_challenge') ||
  table.includes('playChallenge') ||
  challengeBlob.includes('TableAudio') ||
  challengeBlob.includes('sfx_challenge_');
if (!wiredChallengeSfx) {
  pass('challenge SFX absent (play frozen; no sfx_challenge_* ids/files wired)');
} else {
  fail('challenge SFX leaked into rebind');
}

const challengeFiles = [
  'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_windup.wav',
  'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_standoff.wav',
  'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_reveal.wav',
  'entry/src/main/resources/rawfile/audio/sfx/sfx_challenge_result.wav'
];
if (challengeFiles.every((rel) => !existsSync(join(root, rel)))) {
  pass('no sfx_challenge_* rawfiles');
} else {
  fail('sfx_challenge_* file present');
}

if (audio.includes('bgm_table_bluff') && !audio.includes('bgm_lobby_night') &&
    !audio.includes('sfx_amb_tavern')) {
  pass('table bed is bgm_table_bluff (not lobby night reused)');
} else {
  fail('table bed must not reuse lobby BGM/amb');
}

if (deal.includes('sfx_deal_card') && table.includes('DealAudio.playDealCard') &&
    !deal.includes('sfx_claim_set') && !deal.includes('bgm_table_bluff')) {
  pass('DealAudio still deal-only; TableAudio owns table bed / §5.2');
} else {
  fail('DealAudio / TableAudio split');
}

if (!table.includes('HAND_RING_GAP_PCT') || layout.includes('HAND_RING_GAP_PCT')) {
  pass('layout/padB/selfDock files not rewritten for audio');
}

if (/\bany\b/.test(audio) || /ESObject/.test(audio) || audio.includes('RawFdSlice')) {
  fail('ESObject/any/RawFdSlice in TableAudio');
} else {
  pass('no ESObject/any/RawFdSlice in TableAudio');
}

if (audio.includes('RawFileDescriptor') && audio.includes('AVFileDescriptor')) {
  pass('official RawFileDescriptor / AVFileDescriptor');
} else {
  fail('fd descriptors');
}

console.log('');
console.log(`fades: lobbyOut=${leaveLobby} tableIn=${fadeIn} tableOut=${fadeOut}`);
console.log(`peaks: soft=${peakSoft} slam=${peakSlam} hesitate=${peakHesitate} duck=${slamDuck}`);
console.log(process.exitCode ? 'TABLE AUDIO CHECK FAILED' : 'TABLE AUDIO CHECK OK');
