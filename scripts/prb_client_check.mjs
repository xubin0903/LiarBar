#!/usr/bin/env node
/**
 * PR-B static gate (负责人分派单 v1 · 2026-10-07 + #293 打回追加项 + 策划 21 v0.1):
 *  ① AudioSettings 乘子层（四路音频运行时生效）
 *  ② RecordStore：RECAP 写一次；离局确认写「中退」一次（观战非中退）；isDemo 不入账；两路同键去重
 *  ③ 引擎/导演 pause/resume：4 deadline + thinkUntilMs 平移；待停态；切后台硬冻结；PENDING_CAP_MS
 *  ④ 恢复缓冲 RESUME_GRACE_MS = 600（21 §3.4）：deadline/thinkUntil/页面定时器下限 + 导演 hold
 *  ⑤ 离局弹窗：打开走同一暂停路径，取消/返回键走常规恢复；离局锁（确认后到路由完成不复位）
 *  ⑥ EntryAbility.onBackground 自动暂停；调试暂停只在 DebugBuild（fail-closed）
 *  ⑦ string：PR-B 只引用 21 §6 / PR-A 已有键，不新增临时键
 *  ⑧ 离局路由兜底：replace 失败 → back() → 仍失败才解锁（error 日志），中退仍只写一次
 *  ⑨ 战绩存储照 21 §2.1/§2.2（recent_v1 / summary_v1 / last_match_id；MatchRecordV1 字段）；时长扣暂停
 *  ⑩ LifeCandles / CardFace 定时器只做表现（不碰引擎/导演/路由、不回调父层），新增定时器须重新分级
 *  ⑪ 名次一条规则：离场时刻存活座数（含自己），胜者 1；node 里直接跑 MatchRank（4 人局 + 中退）
 *  ⑫ 单条记录 ≤ 400 B：满载镜像 JSON.stringify 后按 UTF-8 量字节（不做运行时截断）；汇总带 v
 *  ⑬ S21-17：node 里跑真 RecordStore（假 Preferences）：中退 → RECAP → RECAP（含重启后 RECAP）只记一条
 * No git, no diff against origin/develop (负责人规则). Box has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANY_ESOBJECT, findInCode, formatHits, stripCommentsAndStrings } from './lib/ets_scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const pass = (m) => console.log('PASS', m);
const ok = (c, m) => (c ? pass(m) : fail(m));
/** Method body from `sig` to the closing brace at 2-space indent (raw text). */
function body(text, sig) {
  const at = text.indexOf(sig);
  if (at < 0) return '';
  const rest = text.slice(at);
  const end = rest.search(/\n  [}]\n/);
  return end < 0 ? rest : rest.slice(0, end);
}
const code = (t) => stripCommentsAndStrings(t);
const count = (t, re) => (t.match(new RegExp(re.source, 'g')) || []).length;

const E = 'entry/src/main/ets/';
const engine = src(E + 'engine/MatchEngine.ets');
const dir = src(E + 'common/MatchDirector.ets');
const table = src(E + 'pages/Table.ets');
const ability = src(E + 'entryability/EntryAbility.ets');
const settings = src(E + 'persist/AudioSettings.ets');
const records = src(E + 'persist/RecordStore.ets');
const sched = src(E + 'common/PausableScheduler.ets');
const debugBuild = src(E + 'common/DebugBuild.ets');
const lbRouter = src(E + 'common/LbRouter.ets');
const types = src(E + 'engine/MatchTypes.ets');
const candles = src(E + 'features/table/LifeCandles.ets');
const cardFace = src(E + 'features/table/CardFace.ets');

// ---------------------------------------------------------------- ③ engine clock
const resume = code(body(engine, '  resumeClock(wallMs: number, graceMs: number): number {'));
ok(resume.length > 0, 'engine.resumeClock(wallMs, graceMs) present');
for (const d of ['turnEndsAtMs', 'ritualEndsAtMs', 'beatEndsAtMs', 'penaltyEndsAtMs']) {
  ok(resume.includes(`this.${d} = Math.max(this.${d} + delta, floor)`), `resumeClock: ${d} = max(old + Δ, now + grace)`);
}
ok(/const floor: number = wallMs \+ \(graceMs > 0 \? graceMs : 0\)/.test(resume), 'resumeClock floor = wall + graceMs');
ok(/pulse\(nowMs: number\): boolean \{\s*if \(this\.clockPausedAt > 0\) \{\s*return false;/.test(engine),
  'engine.pulse is a no-op while clock paused');
ok(count(engine, /this\.clockPausedAt = 0;/) >= 3, 'clockPausedAt reset in resume/startMatch/resetToLobby');
ok(/isDemoMatch\(\): boolean \{\s*return this\.demoOn;/.test(engine), 'engine.isDemoMatch() = demo_seed channel flag');

// ---------------------------------------------------------------- ③④ director
const dirCode = code(dir);
const bufDefs = count(dirCode, /export const RESUME_GRACE_MS: number = 600;/);
ok(bufDefs === 1, 'RESUME_GRACE_MS = 600 defined exactly once (MatchDirector)');
const allEts = [engine, table, sched, ability].map(code).join('\n');
ok(!/(?:const|let|readonly)\s+RESUME_GRACE_MS\b/.test(allEts) && !/RESUME_[A-Z]+_MS/.test((allEts + dirCode).replace(/RESUME_GRACE_MS/g, '')),
  'no second buffer constant elsewhere (single named constant)');
ok(/export const PENDING_CAP_MS: number = 8000;/.test(dirCode), 'PENDING_CAP_MS = 8000 (21 §3.1 P04)');
const tick = code(body(dir, '  tick(): void {'));
ok(/if \(this\.pauseState === PauseState\.PAUSED\) \{[\s\S]*?return;/.test(tick) &&
  tick.indexOf('PauseState.PAUSED') < tick.indexOf('this.engine.pulse('), 'tick returns before pulse/AI when PAUSED');
const pendAt = tick.indexOf('if (this.pauseState === PauseState.PENDING) {');
const armAt = tick.indexOf('this.armIfNeeded()');
const runAt = tick.indexOf('this.runAi()');
ok(pendAt > 0 && tick.includes('!this.sequenceBusy(snap) || capped') && tick.includes('this.enterPaused()') &&
  pendAt < armAt && pendAt < runAt, 'tick: PENDING → PAUSED once sequence ends / cap hit; never arms or runs AI while PENDING');
const tickRaw = body(dir, '  tick(): void {');
ok(/if \(capped\) \{\s*Logger\.warn\(TAG, `pending cap \$\{PENDING_CAP_MS\}ms hit[^`]*`\);\s*\}\s*this\.enterPaused\(\);/.test(tickRaw),
  'PENDING_CAP_MS forced stop writes a log line before entering PAUSED');
const holdAt = tick.indexOf('Date.now() < this.resumeHoldUntilMs');
ok(holdAt > 0 && holdAt < armAt && holdAt < runAt, 'tick: resume buffer hold blocks armIfNeeded/runAi');
ok(/quit: false,\s*isDemo: this\.engine\.isDemoMatch\(\),\s*ff: false,\s*pausedMs: this\.engine\.pausedTotalAt\(/.test(tick) &&
  tick.includes('RecordStore.commitOnce(snap, recapCommit)') && count(dirCode, /RecordStore\.commitOnce\(/) === 1,
  'RECAP writes record once via director (isDemo + pausedMs passed)');
const rp = code(body(dir, '  requestPause(reason: string): PauseState {'));
ok(rp.includes('this.pauseState !== PauseState.RUNNING') && rp.includes('PauseState.PENDING'),
  'requestPause ignores repeats while PENDING/PAUSED; enters PENDING when sequence busy');
ok(/const hard: boolean = reason === PauseReasons\.BACKGROUND;/.test(rp) && rp.includes('!hard && this.sequenceBusy(snap)') &&
  /if \(hard && this\.pauseState === PauseState\.PENDING\) \{[\s\S]*?this\.enterPaused\(\)/.test(rp),
  'background = hard freeze (no PENDING wait; PENDING upgraded to PAUSED) — 21 §3.1 P07');
const ignoreAt = rp.indexOf('if (this.pauseState !== PauseState.RUNNING) {');
const pendSetAt = rp.indexOf('this.pendingSinceMs = Date.now()');
ok(ignoreAt > 0 && pendSetAt > ignoreAt && count(dirCode, /this\.pendingSinceMs = Date\.now\(\)/) === 1,
  'mash-pause: repeats return before pendingSinceMs is set → PENDING_CAP_MS still counts from the first press');
const rs = code(body(dir, '  resumeFromPause(): number {'));
ok(rs.includes('this.engine.resumeClock(now, RESUME_GRACE_MS)'), 'resume: engine deadlines floored with RESUME_GRACE_MS');
ok(rs.includes('this.thinkUntilMs = Math.max(this.thinkUntilMs + shift, now + RESUME_GRACE_MS)'),
  'resume: thinkUntilMs = max(old + Δ, now + RESUME_GRACE_MS) (not redrawn)');
ok(rs.includes('this.resumeHoldUntilMs = now + RESUME_GRACE_MS'), 'resume: director hold = RESUME_GRACE_MS');
const pendCancel = rs.slice(0, rs.indexOf('this.engine.resumeClock('));
ok(!pendCancel.includes('resumeHoldUntilMs = now'), 'cancelling a PENDING (never frozen) adds no buffer');
const busy = code(body(dir, '  private sequenceBusy(snap: MatchSnapshot): boolean {'));
ok(busy.includes('Phase.CHALLENGE_RITUAL') && busy.includes('Phase.JUDGE') && busy.includes('Phase.PENALTY') &&
  busy.includes('this.playBusy'), 'sequenceBusy covers ritual/judge/penalty (开牌/燃烛) + play fly (21 §3.2)');

// ---------------------------------------------------------------- table freeze
const tableCode = code(table);
ok(!/(?<![\w.])setTimeout\(/.test(tableCode) && !/(?<![\w.])clearTimeout\(/.test(tableCode),
  'Table has no raw setTimeout/clearTimeout (all via PausableScheduler)');
ok(tableCode.includes('this.timers.pause()') && tableCode.includes('this.timers.resume(RESUME_GRACE_MS)'),
  'Table freezes one-shot timers; resume floors remaining with RESUME_GRACE_MS');
ok(count(tableCode, /if \(this\.timers\.isPaused\(\)\) \{\s*return;/) >= 3,
  'Table poll + 2 challenge tick intervals suspended while paused');
ok(tableCode.includes('TableAudio.pauseForGame()') && tableCode.includes('TableAudio.resumeForGame()'), 'BGM frozen/resumed with pause');
ok(tableCode.includes('this.challengeDeadlineMs = Math.max(this.challengeDeadlineMs + shiftMs, Date.now() + RESUME_GRACE_MS)'),
  'human 质疑|相信 countdown = max(old + Δ, now + RESUME_GRACE_MS) on resume');
const ops = code(body(table, '  private onPauseState(state: PauseState, shiftMs: number): void {'));
const pausedBranch = ops.slice(0, ops.indexOf('return;'));
ok(pausedBranch.includes('this.timers.pause()') && pausedBranch.includes('TableAudio.pauseForGame()') &&
  pausedBranch.indexOf('this.timers.pause()') < pausedBranch.indexOf('pauseReasonNow()'),
  'PAUSED freezes timers+BGM for every reason (leave-confirm uses the same path)');
const sr = code(body(sched, '  resume(floorMs: number = 0): number {'));
ok(sched.includes('pause(): void') && sr.length > 0 && sched.includes('e.remainMs') &&
  sr.includes('this.entries[i].remainMs < floor'), 'PausableScheduler keeps remaining time; resume floor');

// PAU-3 (21 §3.2): card fly (playBusy) finishes before pause (PENDING); during DEAL only the card in flight lands.
const sp = code(body(sched, '  pause(): void {'));
ok(/if \(e\.atomic\) \{\s*continue;\s*\}/.test(sp) && sp.indexOf('e.atomic') < sp.indexOf('clearTimeout(e.nativeId)'),
  'PausableScheduler.pause leaves atomic (in-flight) segments running');
ok(/if \(!this\.paused \|\| atomic\) \{\s*this\.arm\(e\);/.test(code(sched)),
  'segments scheduled while paused are held (only atomic arms) → follow-ups of the landed card wait for resume');
const pb = code(body(table, '  private playBeat(beats: DealBeat[], i: number, cardMs: number, staggerMs: number): void {'));
ok(pb.includes('this.armDealLanding(cardMs,') && /this\.armDeal\(staggerMs,/.test(pb) && /this\.armDeal\(DealFx\.DEAL_DONE_SETTLE_MS,/.test(pb) &&
  count(tableCode, /scheduleAtomic\(/) === 1 && count(tableCode, /this\.armDealLanding\(/) === 1,
  'DEAL: current card landing = atomic; stagger / next card / dealDone held by pause');
ok(/private armDealLanding\(ms: number, fn: \(\) => void\): void \{[\s\S]*?this\.timers\.scheduleAtomic\([\s\S]*?this\.dealTimers\.push\(id\);/.test(tableCode),
  'armDealLanding id tracked in dealTimers (cancelled on leave / redeal)');

// ---------------------------------------------------------------- ⑤ leave dialog + leaving lock
const req = code(body(table, '  private requestLeave(): void {'));
const pauseAt = req.indexOf('AppRuntime.director.requestPause(PauseReasons.LEAVE_CONFIRM)');
const dlgAt = req.indexOf('showAlertDialog(');
ok(req.indexOf('if (this.leaving)') >= 0 && req.indexOf('if (this.leaveConfirmOpen)') >= 0 &&
  req.indexOf('if (this.leaving)') < pauseAt && req.indexOf('if (this.leaveConfirmOpen)') < pauseAt,
  'requestLeave: leaving lock + open guard before anything (repeat presses ignored)');
ok(pauseAt > 0 && dlgAt > pauseAt, 'leave dialog open → director.requestPause(LEAVE_CONFIRM) before showAlertDialog (S21-45)');
ok(/primaryButton:[\s\S]*?this\.onLeaveCancel\(\)/.test(req) && /cancel: \(\): void => \{\s*this\.onLeaveCancel\(\);/.test(req),
  'dialog 取消 button and back/dismiss (cancel) → onLeaveCancel');
ok(/catch \(err\) \{[\s\S]*?this\.resumeIfLeavePause\(\)/.test(req), 'dialog show failure → resume (never stuck paused)');
const cancel = code(body(table, '  private onLeaveCancel(): void {'));
ok(cancel.includes('if (this.leaving || !this.leaveConfirmOpen)') && cancel.includes('this.resumeIfLeavePause()'),
  'onLeaveCancel: idempotent, resumes via resumeIfLeavePause');
const ril = code(body(table, '  private resumeIfLeavePause(): void {'));
ok(/pauseReasonNow\(\) === PauseReasons\.LEAVE_CONFIRM\) \{\s*AppRuntime\.director\.resumeFromPause\(\);/.test(ril),
  'cancel resumes through director.resumeFromPause (normal path incl. buffer), only the pause the dialog took');
const conf = code(body(table, '  private onLeaveConfirmed(): void {'));
const lockAt = conf.indexOf('this.leaving = true');
ok(conf.indexOf('if (this.leaving || !this.leaveConfirmOpen)') === conf.indexOf('if (') && lockAt > 0 &&
  conf.indexOf('this.commitLeaveRecord()') > lockAt && conf.indexOf('this.goHome()') > conf.indexOf('this.commitLeaveRecord()'),
  'onLeaveConfirmed: guard → lock → 中退 record → goHome');
ok(!conf.includes('this.leaveConfirmOpen = false'), 'confirm path never resets the anti-reentry flag');
const back = code(body(table, '  onBackPress(): boolean {'));
ok(/if \(this\.leaving\) \{\s*return true;\s*\}/.test(back) && back.indexOf('if (this.leaving)') < back.indexOf('this.requestLeave()'),
  'onBackPress while leaving: consumed, does nothing');
ok(/if \(this\.pauseLayerOn\) \{\s*this\.resumeFromPauseLayer\(\);\s*return true;/.test(back) &&
  back.indexOf('this.pauseLayerOn') < back.indexOf('this.requestLeave()'), 'onBackPress on pause layer = 继续 (21 P08)');
const gh = code(body(table, '  private goHome(): void {'));
ok(/^[^{]*\{\s*if \(this\.homeRouting\) \{\s*return;\s*\}\s*this\.homeRouting = true;/.test(gh), 'goHome idempotent (homeRouting guard first)');
// ⑧ routing fallback chain: replace → back → unlock + error log (the ONLY lock reset).
const ur = code(body(table, '  private async unlockLobbyThenRoute(): Promise<void> {'));
ok(/const routed: boolean = await LbRouter\.toLobbyOrBack\(\);\s*if \(!routed\) \{\s*this\.releaseLeaveLock\(\);\s*\}/.test(ur) &&
  !/(leaving|homeRouting|leaveConfirmOpen) = false/.test(ur), 'goHome routing: await toLobbyOrBack(); unlock only if it returned false');
const tlb = code(body(lbRouter, '  static async toLobbyOrBack(): Promise<boolean> {'));
const repAt = tlb.indexOf('await router.replaceUrl({ url: PageUrls.LOBBY })');
const repOk = tlb.indexOf('return true;', repAt);
const backAt = tlb.indexOf('router.back()');
const backOk = tlb.indexOf('return true;', backAt);
const errAt = tlb.indexOf('Logger.error(');
const falseAt = tlb.indexOf('return false;');
ok(repAt > 0 && repOk > repAt && backAt > repOk && backOk > backAt && errAt > backOk && falseAt > errAt,
  'LbRouter.toLobbyOrBack: replace lobby → (catch) router.back() → (catch) Logger.error + return false');
ok(/catch \(err\) \{\s*Logger\.warn\([^;]*replace lobby failed/.test(body(lbRouter, '  static async toLobbyOrBack(): Promise<boolean> {')) && /Number\(router\.getLength\(\)\) <= 1/.test(tlb),
  'replace failure is logged and falls through; back() with no page underneath counts as failure');
const rel = code(body(table, '  private releaseLeaveLock(): void {'));
const relErr = rel.indexOf('Logger.error(TAG,');
ok(relErr > 0 && ['this.homeRouting = false', 'this.leaving = false', 'this.leaveConfirmOpen = false'].every((x) => rel.indexOf(x) > relErr),
  'releaseLeaveLock: hilog error, then releases homeRouting / leaving / leaveConfirmOpen');
const resetOwners = (re) => {
  const owners = new Set();
  const sigRe = /^  (?:private |public |protected |static |async )*(\w+)\s*\([^)\n]*\)\s*(?::\s*[\w<>\[\]| ]+)?\s*\{\s*$/gm;
  const sigs = [];
  let m;
  while ((m = sigRe.exec(tableCode)) !== null) sigs.push({ at: m.index, name: m[1] });
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(tableCode)) !== null) {
    let owner = '?';
    for (const sg of sigs) { if (sg.at < m.index) owner = sg.name; else break; }
    owners.add(owner);
  }
  return [...owners];
};
const lockResets = resetOwners(/this\.(?:leaving|homeRouting) = false/);
ok(lockResets.length === 1 && lockResets[0] === 'releaseLeaveLock', `leaving/homeRouting reset only in releaseLeaveLock (${lockResets.join(',')})`);
ok(count(tableCode, /this\.releaseLeaveLock\(\)/) === 1, 'releaseLeaveLock has exactly one caller (routing failure)');
const clrRaw = code(body(table, '  private commitLeaveRecord(): void {'));
ok(/snap\.phase === Phase\.LOBBY/.test(clrRaw) && /AppRuntime\.engine\.toLobby\(\)/.test(gh) &&
  gh.indexOf('AppRuntime.engine.toLobby()') < gh.indexOf('this.unlockLobbyThenRoute()'),
  'retry after unlock cannot write 中退 twice: goHome sends engine to LOBBY before routing; commitLeaveRecord skips LOBBY (+ last_match_id dedup)');

// ---------------------------------------------------------------- ② records
const clr = code(body(table, '  private commitLeaveRecord(): void {'));
ok(count(tableCode, /RecordStore\.commitOnce\(/) === 1 && clr.includes('RecordStore.commitOnce(snap, leaveCommit)') &&
  /isDemo: AppRuntime\.engine\.isDemoMatch\(\),\s*ff: false,\s*pausedMs: AppRuntime\.engine\.pausedTotalAt\(Date\.now\(\)\)/.test(clr),
  'Table writes the leave record at exactly one call site (isDemo + pausedMs incl. the open dialog)');
ok(/snap\.phase === Phase\.RECAP \|\| snap\.phase === Phase\.END/.test(clr) && clr.includes('return;'),
  'leave record skipped once RECAP/END (director owns that write) → paths cannot both write');
ok(clr.includes('quit: !this.humanIsGhost(snap)'), '在局离开 = 中退; 观战离开 = 非中退 (21 §2.4)');
ok(count(tableCode, /this\.commitLeaveRecord\(\)/) === 1, 'commitLeaveRecord called once (confirm path only)');
// ⑨ 21 §2.1 storage keys + §2.2 / §2.3 schema, field for field.
ok(records.includes("static readonly KEY_RECENT: string = 'recent_v1'") && records.includes("static readonly KEY_SUMMARY: string = 'summary_v1'") &&
  records.includes("static readonly KEY_LAST_MATCH: string = 'last_match_id'"), 'RecordStore keys = recent_v1 / summary_v1 / last_match_id (21 §2.1)');
ok(!/records_v1|KEY_FILE|lastKey|hasKey|winnerName|outOrder|myHands|myChallenges|challengeHits:|startedAt:/.test(code(records).replace(/snap\.startedAt/g, '')), 'old records_v1 / field names gone (no migration)');
ok(/static readonly KEEP: number = 20;/.test(records) && /next\.length < RecordStore\.KEEP/.test(records), 'recent_v1 newest first, capped at 20');
const iface = (name) => {
  const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(code(records));
  return m ? [...m[1].matchAll(/^\s*(\w+):\s*([^;]+);/gm)].map((x) => `${x[1]}:${x[2].trim()}`) : [];
};
const REC21 = ['v:number', 'matchId:string', 'endedAt:number', 'durationMs:number', 'rounds:number', 'hands:number',
  'playerCount:number', 'rank:number', 'result:string', 'quit:boolean', 'ff:boolean', 'livesLeft:number', 'plays:number',
  'fakeHands:number', 'doubts:number', 'doubtHits:number', 'doubted:number', 'caught:number', 'opponents:string[]'];
const recFields = iface('MatchRecordV1');
ok(JSON.stringify(recFields) === JSON.stringify(REC21), `MatchRecordV1 fields = 21 §2.2 (${recFields.length})`);
const SUM21 = ['v:number', 'total:number', 'wins:number', 'quits:number', 'doubts:number', 'doubtHits:number'];
ok(JSON.stringify(iface('RecordSummaryV1')) === JSON.stringify(SUM21), 'RecordSummaryV1 fields = 21 §2.3 + v (PM 2026-10-07)');
ok(count(code(records), /const (?:s|out): RecordSummaryV1 = \{\s*v: 1,/) === 3,
  'every RecordSummaryV1 literal (zero / summaryNow / parse) carries v: 1');
ok(/const rec: MatchRecordV1 = \{\s*v: 1,/.test(code(records)), 'MatchRecordV1 literal carries v: 1');
ok(/static readonly WIN: string = 'WIN';/.test(records) && /static readonly LOSE: string = 'LOSE';/.test(records) &&
  records.includes('result: won ? RecordResult.WIN : RecordResult.LOSE') &&
  records.includes('const won: boolean = !opts.quit &&'), "result 'WIN'|'LOSE'; 中退 always LOSE");
ok(records.includes('ff: opts.ff') && records.includes('quit: opts.quit'), 'quit / ff carried separately (中退 = quit:true, ff:false)');
ok(/opponents\.push\(s\.aiPersona\.length > 0 \? s\.aiPersona : AiPersonaRegistry\.personaIdForSeat\(s\.seatId\)\)/.test(records) &&
  records.includes('s.role === SeatRole.AI'), 'opponents = AI aiPersona in seat order');
ok(records.includes('doubted: mine === null ? 0 : mine.doubtedCount') && records.includes('caught: mine === null ? 0 : mine.caughtCount') &&
  /doubtedCount: number;/.test(types) && /caughtCount: number;/.test(types), 'doubted / caught from engine per-seat counters (RecapRow)');
ok(/bumpSeatCount\(this\.doubtedCounts, this\.lastPlay\.actorSeatId\)/.test(engine) &&
  /bumpSeatCount\(this\.caughtCounts, this\.lastPlay\.actorSeatId\)/.test(engine), 'engine counts doubted at challenge, caught on SUCCESS (actor seat)');
// ⑪ rank (21 §1.5, PM 2026-10-07): one rule for everyone — rank = seats alive at the moment the seat
// leaves, counting itself; winner = 1. Eliminated and quitters alike. No 'n − elimination order'.
const rankSrc = src(E + 'engine/MatchRank.ets');
const rk = code(body(records, '  private static rankOf(snap: MatchSnapshot, mine: RecapRow | null, won: boolean, quit: boolean): number {'));
ok(rk.includes('return MatchRank.rankAtExit(won, aliveAtExit);') &&
  rk.includes('const aliveAtExit: number = !quit && exited > 0 ? exited : aliveNow;') &&
  rk.includes('const exited: number = mine === null ? 0 : mine.aliveAtExit;'),
  'RecordStore.rankOf → MatchRank.rankAtExit(aliveAtExit); 中退 = alive now, out = engine aliveAtExit');
ok(!/n - idx|outIds|EventKind\.OUT|indexOf\(humanId\)/.test(code(records)), "old 'n − elimination order' rank formula gone");
const pex = code(body(engine, '  private applyPenaltyExtinguish1(seatId: number, reason: LifeReason): void {'));
ok(pex.indexOf('this.recordAliveAtExit(seatId);') >= 0 && pex.indexOf('this.recordAliveAtExit(seatId);') < pex.indexOf('seat.status = SeatStatus.GHOST;') &&
  count(code(engine), /\.status = SeatStatus\.GHOST/) === 1, 'engine records aliveAtExit before the (only) ALIVE → GHOST flip');
const rae = code(body(engine, '  private recordAliveAtExit(seatId: number): void {'));
ok(rae.includes('this.aliveAtExits[seatId] = MatchRank.aliveIncludingSelf(alive);') && engine.includes('aliveAtExit: this.seatCount(this.aliveAtExits, i)') &&
  /aliveAtExit: number;/.test(types) && count(code(engine), /this\.aliveAtExits = \[\];/) === 1 && engine.includes('this.aliveAtExits.push(0);'),
  'aliveAtExit captured via MatchRank.aliveIncludingSelf, reset per match, exposed on RecapRow');
// Run the real MatchRank code in node (types stripped, same idea as the deal sim).
const rankJs = rankSrc.replace(/:\s*(?:boolean\[\]|number|boolean)(?=\s*[=,){])/g, '');
let MR = null;
try {
  MR = (await import('data:text/javascript,' + encodeURIComponent(rankJs))).MatchRank;
} catch (e) {
  fail(`MatchRank.ets did not load in node after type strip: ${e.message}`);
}
if (MR) {
  const alive = [true, true, true, true];
  const ranks = [0, 0, 0, 0];
  for (const seat of [2, 0, 3]) { // 4-seat match: seats 2, 0, 3 go out in that order; seat 1 wins
    ranks[seat] = MR.rankAtExit(false, MR.aliveIncludingSelf(alive));
    alive[seat] = false;
  }
  ranks[1] = MR.rankAtExit(true, MR.aliveIncludingSelf(alive));
  ok(ranks[2] === 4 && ranks[0] === 3 && ranks[3] === 2 && ranks[1] === 1,
    `4-player run of MatchRank: first out 4, second 3, third 2, winner 1 (got ${ranks[2]},${ranks[0]},${ranks[3]},${ranks[1]})`);
  const quitRank = MR.rankAtExit(false, MR.aliveIncludingSelf([true, true, false, true]));
  ok(quitRank === 3, `quitter with 3 alive (incl. self) = 3, same rule (got ${quitRank})`);
}
// ⑫ 21 §2.1 size: one record ≤ 400 B. No runtime truncation — prove the fully loaded record fits.
// Mirror of MatchRecordV1 with every field at its max; the mirror must cover the interface exactly.
const md = JSON.parse(src('entry/src/main/resources/rawfile/config/match_defaults.json'));
const personaIds = [...src(E + 'ai/PersonaId.ets').matchAll(/=\s*'(AI_[A-Z_]+)'/g)].map((x) => x[1]);
const longestPersona = personaIds.reduce((a, b) => (b.length > a.length ? b : a), '');
const results = [...records.matchAll(/static readonly (?:WIN|LOSE): string = '(\w+)';/g)].map((x) => x[1]);
ok(/this\.matchId = `m-\$\{this\.seed\}`;/.test(engine), 'matchId = m-<seed> (bounded by MAX_SAFE_INTEGER)');
const BIG = 99999; // per-match counter ceiling (far above any real match)
const maxRec = {
  v: 1, matchId: `m-${Number.MAX_SAFE_INTEGER}`, endedAt: 9999999999999, durationMs: 9999999999999,
  rounds: BIG, hands: BIG, playerCount: md.max_players, rank: md.max_players,
  result: results.reduce((a, b) => (b.length > a.length ? b : a), ''), quit: false, ff: false,
  livesLeft: md.lives_default, plays: BIG, fakeHands: BIG, doubts: BIG, doubtHits: BIG, doubted: BIG, caught: BIG,
  opponents: Array(md.max_players - 1).fill(longestPersona)
};
ok(JSON.stringify(Object.keys(maxRec)) === JSON.stringify(recFields.map((f) => f.split(':')[0])),
  'max-record mirror covers MatchRecordV1 field for field (new field → update the mirror)');
const maxBytes = Buffer.byteLength(JSON.stringify(maxRec), 'utf8');
ok(md.max_players > 0 && longestPersona.length > 0 && results.length === 2 && maxBytes <= 400,
  `fully loaded MatchRecordV1 = ${maxBytes} B UTF-8 ≤ 400 B (21 §2.1; ${md.max_players} seats, ${md.max_players - 1}×${longestPersona})`);
// ⑬ S21-17 (behavioural): 中退 written exactly once; a later / duplicate RECAP callback for the same match
// cannot add a second record — also after an app restart (last_match_id reloaded from storage).
// Loads the REAL RecordStore.ets in node: types stripped, imports replaced by stubs (fake Preferences,
// real MatchRank + real SeatRole/SeatStatus enums from Phase.ets).
const phaseSrc = src(E + 'engine/Phase.ets');
const enumObj = (name) => {
  const m = new RegExp(`export enum ${name} \\{([\\s\\S]*?)\\}`).exec(phaseSrc);
  return m ? Object.freeze(Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*'([^']*)'/g)].map((x) => [x[1], x[2]]))) : null;
};
const REC_TYPES = ['preferences\\.Preferences \\| null', 'preferences\\.Preferences', 'preferences\\.ValueType', 'common\\.UIAbilityContext',
  'Promise<void>', 'MatchRecordV1\\[\\]', 'MatchRecordV1', 'RecordSummaryV1', 'RecordCommit', 'MatchSnapshot', 'SeatModel \\| null', 'SeatModel',
  'RecapRow \\| null', 'RecapRow', 'string\\[\\]', 'string', 'number', 'boolean'];
const recordsJs = records
  .replace(/^import .*$/gm, '')
  .replace(/export interface \w+ \{[\s\S]*?\n\}/g, '')
  .replace(/\b(?:private|public|protected)\s+/g, '')
  .replace(/\breadonly\s+/g, '')
  .replace(/\s+as\s+(?:MatchRecordV1\[\]|RecordSummaryV1)(?![\w\[])/g, '')
  .replace(new RegExp(`:\\s*(?:${REC_TYPES.join('|')})(?=\\s*[=,;){])`, 'g'), '');
const prefData = new Map();
let flushes = 0;
const fakePrefStore = {
  get: async (k, d) => (prefData.has(k) ? prefData.get(k) : d),
  put: async (k, v) => { prefData.set(k, v); },
  flush: async () => { flushes++; }
};
globalThis.__prbStub = {
  preferences: { getPreferences: async () => fakePrefStore },
  AiPersonaRegistry: { personaIdForSeat: () => 'AI_TIMID' },
  PersistNs: { RECORDS: 'lb.records' },
  Logger: { info: () => {}, warn: () => {}, error: () => {} },
  MatchRank: MR, SeatRole: enumObj('SeatRole'), SeatStatus: enumObj('SeatStatus')
};
const stubHeader = 'const { preferences, AiPersonaRegistry, PersistNs, Logger, MatchRank, SeatRole, SeatStatus } = globalThis.__prbStub;\n';
let loadSeq = 0;
const loadRecordStore = async () => {
  loadSeq++; // fresh module instance = fresh statics (simulates an app restart)
  const mod = await import('data:text/javascript,' + encodeURIComponent(`${stubHeader}${recordsJs}\n// load ${loadSeq}`));
  return mod.RecordStore;
};
const tickIo = () => new Promise((r) => setTimeout(r, 0));
let RS = null;
try {
  RS = await loadRecordStore();
} catch (e) {
  fail(`S21-17: real RecordStore.ets did not load in node after type strip: ${e.message}`);
}
if (RS && MR) {
  const { SeatRole: SR, SeatStatus: SS } = globalThis.__prbStub;
  const row = (seatId, extra) => ({ seatId, nickname: `s${seatId}`, playCount: 4, fakeHandCount: 1, challengeCount: 2, challengeHits: 1,
    doubtedCount: 1, caughtCount: 0, aliveAtExit: 0, ...extra });
  const T0 = 1759840000000;
  const mkSnap = (matchId, humanStatus, winner) => ({
    matchId, startedAt: T0, endedAt: winner >= 0 ? T0 + 300000 : 0, roundIndex: 3, winnerSeatId: winner, eventLog: [],
    seats: [
      { seatId: 0, role: SR.HUMAN, aiPersona: '', lives: humanStatus === SS.ALIVE ? 2 : 0, status: humanStatus },
      { seatId: 1, role: SR.AI, aiPersona: 'AI_SHARK', lives: 1, status: SS.ALIVE },
      { seatId: 2, role: SR.AI, aiPersona: 'AI_KAREN', lives: 0, status: SS.GHOST },
      { seatId: 3, role: SR.AI, aiPersona: 'AI_TIMID', lives: 1, status: SS.ALIVE }
    ],
    recap: [row(0, { aliveAtExit: humanStatus === SS.ALIVE ? 0 : 3 }), row(1), row(2, { aliveAtExit: 4 }), row(3)]
  });
  const MID = `m-${T0}`;
  await RS.init({});
  // 1) leave-confirm 中退 (Table.commitLeaveRecord shape), 2) RECAP for the same match, 3) RECAP again.
  const wLeave = RS.commitOnce(mkSnap(MID, SS.ALIVE, -1), { quit: true, isDemo: false, ff: false, pausedMs: 0 });
  const wRecap1 = RS.commitOnce(mkSnap(MID, SS.GHOST, 1), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  const wRecap2 = RS.commitOnce(mkSnap(MID, SS.GHOST, 1), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  await tickIo();
  // 4) app restart: fresh statics, last_match_id reloaded from the fake store, RECAP once more.
  const RS2 = await loadRecordStore();
  await RS2.init({});
  const wRecapAfterRestart = RS2.commitOnce(mkSnap(MID, SS.GHOST, 1), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  await tickIo();
  const stored = JSON.parse(prefData.get('recent_v1') || '[]');
  const sum = JSON.parse(prefData.get('summary_v1') || '{}');
  const mem = RS2.summaryNow();
  const out = `writes leave=${wLeave} recap=${wRecap1} recap2=${wRecap2} recapAfterRestart=${wRecapAfterRestart}; ` +
    `recent_v1=${stored.length} total=${sum.total} quits=${sum.quits} last_match_id=${prefData.get('last_match_id')} ` +
    `rec.quit=${stored[0] && stored[0].quit} rec.result=${stored[0] && stored[0].result} rec.rank=${stored[0] && stored[0].rank}`;
  ok(wLeave === true && wRecap1 === false && wRecap2 === false && wRecapAfterRestart === false &&
    stored.length === 1 && sum.total === 1 && sum.quits === 1 && mem.total === 1 && mem.quits === 1 && RS2.recent().length === 1 &&
    prefData.get('last_match_id') === MID && stored[0].quit === true && stored[0].result === 'LOSE' && stored[0].rank === 3 && flushes >= 1,
    `S21-17 real RecordStore in node: leave → RECAP → RECAP (+ restart → RECAP) = one 中退 record (${out})`);
  // Premise behind rank=3: at the quit moment the leave snapshot has 4 seats, seat 2 already out (GHOST),
  // so 3 alive incl. the human. Rank must equal that alive-at-exit count (21 §1.5), not a hardcoded 3.
  const leaveSnap = mkSnap(MID, SS.ALIVE, -1);
  const aliveAtQuit = leaveSnap.seats.filter((x) => x.status === SS.ALIVE).length;
  const outBefore = leaveSnap.seats.filter((x) => x.status === SS.GHOST).length;
  ok(stored.length === 1 && stored[0].rank === aliveAtQuit && aliveAtQuit === 3 && outBefore === 1 && leaveSnap.seats.length === 4,
    `S21-17 fixture premise: ${leaveSnap.seats.length} seats, ${outBefore} out before the quit → ${aliveAtQuit} alive incl. self at quit; rank=${stored[0] && stored[0].rank} === aliveAtExit=${aliveAtQuit}`);
  // Control: a different match still writes (dedup is per match, not a blanket block).
  const wOther = RS2.commitOnce(mkSnap(`m-${T0 + 1}`, SS.ALIVE, 0), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  await tickIo();
  const sum2 = JSON.parse(prefData.get('summary_v1') || '{}');
  ok(wOther === true && sum2.total === 2 && sum2.quits === 1 && sum2.wins === 1,
    `S21-17 control: next match writes normally (total=${sum2.total} quits=${sum2.quits} wins=${sum2.wins})`);
  // Counter-check: same quit path with nobody out yet (4 alive incl. self) must give rank 4 — rank follows the alive count.
  const snap4 = mkSnap(`m-${T0 + 2}`, SS.ALIVE, -1);
  snap4.seats[2].status = SS.ALIVE;
  snap4.seats[2].lives = 1;
  const wQuit4 = RS2.commitOnce(snap4, { quit: true, isDemo: false, ff: false, pausedMs: 0 });
  const r4 = RS2.recent()[0];
  ok(wQuit4 === true && r4.matchId === `m-${T0 + 2}` && r4.quit === true && r4.rank === 4,
    `S21-17 counter-check: quit with 4 alive incl. self → rank=${r4 && r4.rank} (expects 4)`);
}
// Both entry points go through commitOnce; no other writer of the three keys.
ok(count(code(dir), /RecordStore\.commitOnce\(/) === 1 && count(code(table), /RecordStore\.commitOnce\(/) === 1 &&
  count(code(records), /store\.put\(/) === 3 && count(code(body(records, '  private static async persist(): Promise<void> {')), /store\.put\(/) === 3,
  'S21-17: RECAP (director) + leave (Table) are the only writers, both via commitOnce; only persist() puts');
const co = code(body(records, '  static commitOnce(snap: MatchSnapshot, opts: RecordCommit): boolean {'));
ok(/if \(snap\.matchId === RecordStore\.lastMatchId \|\| snap\.matchId === RecordStore\.demoClaim\) \{\s*return false;/.test(co),
  'commitOnce dedups via last_match_id before anything else (S21-17)');
ok(/if \(opts\.isDemo\) \{[\s\S]*?return false;/.test(co) && co.indexOf('if (opts.isDemo)') < co.indexOf('RecordStore.build(') &&
  !/if \(opts\.isDemo\) \{[^}]*lastMatchId/.test(co), 'demo matches are not written (no list / summary / last_match_id)');
ok(co.indexOf('RecordStore.lastMatchId = rec.matchId') > co.indexOf('RecordStore.build('), 'last_match_id updated on real write');
const ps = code(body(records, '  private static async persist(): Promise<void> {'));
ok(ps.includes('store.put(RecordStore.KEY_RECENT,') && ps.includes('store.put(RecordStore.KEY_SUMMARY,') &&
  ps.includes('store.put(RecordStore.KEY_LAST_MATCH,') && ps.indexOf('await store.flush()') > ps.indexOf('KEY_LAST_MATCH'),
  'persist writes the three keys then flush()');
// duration excludes pauses
ok(records.includes('durationMs: Math.max(0, endedAt - snap.startedAt - paused)'), 'durationMs = endedAt − startedAt − pausedTotalMs');
const rcl = code(body(engine, '  resumeClock(wallMs: number, graceMs: number): number {'));
ok(rcl.includes('this.pausedTotalMs = this.pausedTotalMs + delta'), 'engine accumulates every pause Δ (user / background / leave dialog)');
ok(count(engine, /this\.pausedTotalMs = 0;/) === 2, 'pausedTotalMs reset at startMatch + resetToLobby');
ok(/pausedTotalAt\(wallMs: number\): number \{[\s\S]*?this\.clockPausedAt > 0 && wallMs > this\.clockPausedAt[\s\S]*?return this\.pausedTotalMs \+ ongoing;/.test(engine),
  'pausedTotalAt includes a pause still in progress (leave confirmed while dialog-paused)');

// ---------------------------------------------------------------- ⑥ background + debug pause
ok(/onBackground\(\): void \{[\s\S]*?requestPause\(PauseReasons\.BACKGROUND\)/.test(ability), 'onBackground → auto pause');
ok(ability.includes('AudioSettings.init(this.context)') && ability.includes('RecordStore.init(this.context)'),
  'AudioSettings/RecordStore loaded at bootstrap');
const dps = code(body(debugBuild, '  static debugPauseShown(): boolean {'));
ok(dps.includes('info.appInfo.debug === true') && /catch \(err\) \{[\s\S]*?return false;/.test(dps),
  'DebugBuild.debugPauseShown = ApplicationInfo.debug, fail-closed');
const panel = body(table, '  debugLifePanel() {');
const pauseBtn = panel.indexOf("$r('app.string.lb_str_pause')");
ok(pauseBtn > 0 && panel.lastIndexOf('if (DebugBuild.debugPauseShown())', pauseBtn) > 0,
  'debug pause button mounted only under DebugBuild.debugPauseShown() (inside debug panel)');
ok(count(tableCode, /PauseReasons\.USER/) === 1 &&
  /requestUserPause\(\): void \{\s*if \(!DebugBuild\.debugPauseShown\(\)/.test(tableCode), 'USER pause only via guarded debug entry');

// ---------------------------------------------------------------- ① audio settings
ok(settings.includes('static voiceGain(): number {\n    return AudioSettings.sfxGain();'), 'voice follows SFX track');
ok(settings.includes('AudioSettings.muted ? 0 : AudioSettings.bgm') && settings.includes('AudioSettings.muted ? 0 : AudioSettings.sfx'),
  'mute zeroes both tracks');
const audioFiles = {
  LobbyAudio: E + 'features/lobby/LobbyAudio.ets',
  TableAudio: E + 'features/table/TableAudio.ets',
  SoundPlayer: E + 'features/table/SoundPlayer.ets',
  DealAudio: E + 'features/table/DealAudio.ets'
};
const audioTexts = [];
for (const [name, rel] of Object.entries(audioFiles)) {
  const t = src(rel);
  audioTexts.push({ path: rel, text: t });
  ok(t.includes('AudioSettings.sfx01(') || t.includes('AudioSettings.voice01('), `${name}: SFX via AudioSettings gain`);
  if (name === 'LobbyAudio' || name === 'TableAudio') {
    ok(t.includes('player.setVolume(AudioSettings.bgm01(vol))') && t.includes('applyAudioSettings'),
      `${name}: BGM bed via AudioSettings gain + live re-apply`);
  }
}

// ---------------------------------------------------------------- ⑩ LifeCandles / CardFace timers = presentation only
for (const [name, text, nTimeout] of [['LifeCandles', candles, 4], ['CardFace', cardFace, 3]]) {
  const c = code(text);
  ok(!/AppRuntime|MatchEngine|MatchDirector|LbRouter|RecordStore|\.engine\b|\.director\b/.test(c),
    `${name}: no engine / director / router / record access (timers cannot drive match state)`);
  ok(!/@Link|@Event|@ObjectLink|:\s*\([^)]*\)\s*=>\s*void\s*=/.test(c), `${name}: no callback / two-way props to the parent`);
  ok(count(c, /setTimeout\(/) === nTimeout && count(c, /setInterval\(/) === 0 && !/onFinish/.test(c),
    `${name}: ${nTimeout} setTimeout, 0 setInterval, 0 onFinish — classified in PR body (new timer ⇒ reclassify)`);
}

// ---------------------------------------------------------------- ⑦ strings (21 §6 keys, no PR-B temp keys)
const names = JSON.parse(src('entry/src/main/resources/base/element/string.json')).string.map((x) => x.name);
const prbKeys = ['lb_str_pause', 'lb_str_pause_title', 'lb_str_pause_resume', 'lb_str_pause_bg_note',
  'lb_str_leave_confirm_title', 'lb_str_leave_confirm_body', 'lb_str_leave_confirm_ok', 'lb_str_leave_confirm_cancel',
  'lb_str_confirm_lobby_ghost_body'];
for (const k of prbKeys) {
  ok(names.includes(k) && table.includes(`$r('app.string.${k}')`), `Table references existing key ${k}`);
}
ok(!names.includes('lb_str_debug_pause') && !table.includes('lb_str_debug_pause\''), 'no PR-B temp key lb_str_debug_pause');
const refs = new Set([...table.matchAll(/\$r\('app\.string\.(\w+)'\)/g)].map((m) => m[1]));
const missing = [...refs].filter((k) => !names.includes(k));
ok(missing.length === 0, `every app.string key referenced by Table exists (${missing.join(',') || 'all present'})`);

// ---------------------------------------------------------------- ArkTS strict hygiene (code only)
const hits = findInCode([
  { path: 'MatchDirector', text: dir }, { path: 'AudioSettings', text: settings }, { path: 'RecordStore', text: records },
  { path: 'PausableScheduler', text: sched }, { path: 'DebugBuild', text: debugBuild }, { path: 'Table', text: table },
  { path: 'MatchEngine', text: engine }, { path: 'EntryAbility', text: ability }, { path: 'MatchRank', text: rankSrc },
  { path: 'MatchTypes', text: types }, { path: 'LbRouter', text: lbRouter }, ...audioTexts
], [...ANY_ESOBJECT, /:\s*unknown\b/]);
ok(hits.length === 0, hits.length === 0 ? 'PR-B files: no any/unknown/ESObject in code' : `any/unknown/ESObject:\n  ${formatHits(hits)}`);

console.log(process.exitCode === 1 ? 'prb_client_check FAILED' : 'prb_client_check OK');
