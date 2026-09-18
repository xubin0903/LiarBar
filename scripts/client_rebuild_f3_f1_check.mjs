#!/usr/bin/env node
/**
 * Rebuild F3+F1 static gates (局内返回 + 他座熄烛).
 * Cloud has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
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

const table = src('entry/src/main/ets/pages/Table.ets');
const router = src('entry/src/main/ets/common/LbRouter.ets');
const layout = src('entry/src/main/ets/features/table/TableLayout.ets');
const life = src('entry/src/main/ets/features/table/LifeCandles.ets');
const engine = src('entry/src/main/ets/engine/MatchEngine.ets');
const match = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const ids = src('entry/src/main/ets/common/Ids.ets');

if (layout.includes('HAND_RING_GAP_PCT: number = 24')) pass('HAND_RING_GAP_PCT frozen at 24');
else fail('HAND_RING_GAP_PCT changed');
if (match.lives_default === 3) pass('lives_default still 3');
else fail(`lives_default drifted to ${match.lives_default}`);
if (table.includes('floorHandPad') && table.includes('nextB: number = this.insetVp(box.bottom)')) pass('padB stays avoidArea inset');
else fail('padB path rewritten');

if (table.includes('homeExitChrome') && table.includes('ControlIds.HOME')) pass('F3 homeExitChrome mounts lb_btn_home');
else fail('F3 homeExitChrome / HOME missing');
if (table.includes('zIndex(40)') && table.includes('homeExitChrome()')) pass('F3 homeExitChrome above overlays (zIndex 40)');
else fail('F3 homeExitChrome zIndex not locked');
if (table.includes('onBackPress(): boolean') && table.includes('this.goHome()')) pass('F3 onBackPress → goHome');
else fail('F3 onBackPress missing');
if (table.includes('unlockLobbyThenRoute') && table.includes('WindowOrientation.lockPortrait')) pass('F3 goHome locks portrait before LbRouter.toLobby');
else fail('F3 portrait unlock path missing');
if (router.includes('static toLobby(): void') && router.includes('PageUrls.LOBBY')) pass('F3 LbRouter.toLobby → LOBBY');
else fail('F3 LbRouter.toLobby broken');
if (table.includes('playFlyOn ? HitTestMode.Default')) fail('F3 playFlyLayer still Default-blocks home while flying');
else if (table.includes('playFlyLayer()') && table.includes('HitTestMode.Transparent')) pass('F3 playFlyLayer always Transparent');
else fail('F3 playFlyLayer hitTest unknown');
if (table.includes('.margin({ top: 40, right: 4 })') && table.includes('debugLifeChrome')) pass('F3 debug chrome margin below home');
else fail('F3 debug chrome still overlaps home corner');
if (table.includes('.id(ControlIds.HOME)')) pass('F3 HOME id present');
else fail('F3 HOME id missing');

if (table.includes('lives: life') || table.includes('life: number, id: string')) fail('F1 seatBlock still passes @Builder life param to LifeCandles');
else pass('F1 seatBlock no longer uses life builder param');
if (table.includes('this.life1') && table.includes('this.life2') && table.includes('this.life3') && table.includes('TableCompass.RIGHT ? this.life1')) pass('F1 seat candles bind this.life1/2/3 directly');
else fail('F1 direct @State candle bind missing');
if (life.includes("@Prop @Watch('onLivesChanged') lives") && life.includes('playExtinguish')) pass('F1 LifeCandles watches lives → extinguish');
else fail('F1 LifeCandles Watch/extinguish missing');
if (engine.includes('debugDecLife(seatId: number)') && engine.includes('applyPenaltyExtinguish1')) pass('F1 engine debugDecLife / PenaltyExtinguish1 present');
else fail('F1 engine life path missing');
if (table.includes('this.fillSeats(snap.seats)') && table.includes('// F1: still sync seat.lives → candles')) pass('F1 ritual/judge pull still fillSeats');
else fail('F1 ritual early-return still skips fillSeats');
if (table.includes('lb_btn_debug_seat_') && table.includes('debugSeatChip')) pass('F1 debug seat chips have tappable ids');
else fail('F1 debug seat chip ids missing');
if (ids.includes("LIFE_SEAT_P1: string = 'lb_cmp_life_seat_p1'") && ids.includes("LIFE_SEAT_P2: string = 'lb_cmp_life_seat_p2'") && ids.includes("LIFE_SEAT_P3: string = 'lb_cmp_life_seat_p3'")) pass('F1 life seat control ids locked');
else fail('F1 life seat ids drifted');

if (process.exitCode) console.error('client_rebuild_f3_f1_check FAILED');
else console.log('client_rebuild_f3_f1_check OK');
