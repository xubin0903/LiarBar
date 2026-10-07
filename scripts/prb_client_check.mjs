#!/usr/bin/env node
/**
 * PR-B static gate (负责人分派单 v1 · 2026-10-07 + #293 打回追加项 + 策划 21 v0.1):
 *  ① AudioSettings 乘子层（四路音频运行时生效）
 *  ② RecordStore：RECAP 写一次；离局确认写「中退」一次（观战非中退）；isDemo 不入账；两路同键去重
 *  ③ 引擎/导演 pause/resume：4 deadline + thinkUntilMs 平移；待停态；切后台硬冻结；PENDING_CAP_MS
 *  ④ 恢复缓冲 RESUME_GRACE_MS = 600（21 §3.4）：引擎/导演/页面所有挂起 deadline 统一平移 max(Δ, 最早项 ≥ now+600 所需) + 导演 hold
 *  ⑤ 离局弹窗：打开走同一暂停路径，取消/返回键走常规恢复；离局锁（确认后到路由完成不复位）
 *  ⑥ EntryAbility.onBackground 自动暂停；调试暂停只在 DebugBuild（fail-closed）
 *  ⑦ string：PR-B 只引用 21 §6 / PR-A 已有键，不新增临时键
 *  ⑧ 离局路由兜底：replace 失败 → back() → 仍失败才解锁（error 日志），中退仍只写一次
 *  ⑨ 战绩存储照 21 §2.1/§2.2（recent_v1 / summary_v1 / last_match_id；MatchRecordV1 字段）；时长扣暂停
 *  ⑩ LifeCandles / CardFace 定时器只做表现（不碰引擎/导演/路由、不回调父层），新增定时器须重新分级
 *  ⑪ 名次一条规则：离场时刻存活座数（含自己），胜者 1；node 里直接跑 MatchRank（4 人局 + 中退）
 *  ⑫ 单条记录 ≤ 400 B：满载镜像 JSON.stringify 后按 UTF-8 量字节（不做运行时截断）；汇总带 v
 *  ⑬ S21-17：node 里跑真 RecordStore（假 Preferences）：中退 → RECAP → RECAP（含重启后 RECAP）只记一条
 *  ⑭ 修复轮（负责人 2026-10-07）真跑：统一平移 ResumeShift + PausableScheduler（顺序不变、最早 ≥ 600）、PAU-3 发牌、
 *     Table 真方法离局待停两入口 / 启动竞态 / 路由双失败与 3000ms 超时、S21-47 坏档（读不写存档）、lb.settings 逐键、
 *     迟到成功收尾、离桌音频释放、release 后才返回的异步 prepare（代际号作废）
 * No git, no diff against origin/develop (负责人规则). Box has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANY_ESOBJECT, findInCode, formatHits, stripCommentsAndStrings } from './lib/ets_scan.mjs';
import { clockStubs, drainMicrotasks, importFresh, makeClock, stripEts } from './lib/ets_sim.mjs';

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
const resume = code(body(engine, '  resumeClock(wallMs: number, shiftMs: number): number {'));
ok(resume.length > 0, 'engine.resumeClock(wallMs, shiftMs) present (shift computed once by the director, 21 §3.4)');
for (const d of ['turnEndsAtMs', 'ritualEndsAtMs', 'beatEndsAtMs', 'penaltyEndsAtMs']) {
  ok(resume.includes(`this.${d} = this.${d} + shift`) && !resume.includes(`Math.max(this.${d}`),
    `resumeClock: ${d} += the one uniform shift (no per-deadline max)`);
}
ok(/const shift: number = shiftMs > delta \? shiftMs : delta;/.test(resume), 'resumeClock: shift never below the paused Δ');
const ed = code(body(engine, '  earliestDeadline(): number {'));
ok(['turnEndsAtMs', 'ritualEndsAtMs', 'beatEndsAtMs', 'penaltyEndsAtMs'].every((d) => ed.includes(`this.${d}`)),
  'engine.earliestDeadline() covers all 4 deadlines (fed into the shift)');
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
ok(/const pending: number\[\] = \[this\.engine\.earliestDeadline\(\), this\.thinkUntilMs\];/.test(rs) &&
  rs.includes('pending.push(probe(pausedAt))') &&
  rs.includes('const want: number = ResumeShift.compute(pausedAt, now, RESUME_GRACE_MS, pending);') &&
  rs.includes('const shift: number = this.engine.resumeClock(now, want);'),
  'resume: ONE shift = ResumeShift.compute(engine 4 deadlines + thinkUntil + page earliest, RESUME_GRACE_MS)');
ok(rs.includes('this.thinkUntilMs = this.thinkUntilMs + shift') && !/Math\.max\(this\.thinkUntilMs/.test(rs) &&
  rs.includes('this.notifyPause(shift)'), 'resume: thinkUntilMs += same shift (not redrawn); page gets the same shift');
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
ok(tableCode.includes('this.timers.pause()') && tableCode.includes('this.timers.resume(shiftMs)') && !tableCode.includes('RESUME_GRACE_MS)'),
  'Table freezes one-shot timers; resume shifts them by the director\'s shift (no own floor)');
ok(count(tableCode, /if \(this\.timers\.isPaused\(\)\) \{\s*return;/) >= 3,
  'Table poll + 2 challenge tick intervals suspended while paused');
ok(tableCode.includes('TableAudio.pauseForGame()') && tableCode.includes('TableAudio.resumeForGame()'), 'BGM frozen/resumed with pause');
ok(tableCode.includes('this.challengeDeadlineMs = this.challengeDeadlineMs + shiftMs'),
  'human 质疑|相信 countdown += the same shift on resume');
const bp = code(body(table, '  private bindPause(): void {'));
ok(bp.includes('AppRuntime.director.setPendingDeadlineProbe(') && bp.includes('this.pageEarliestDeadline(pausedAtMs)'),
  'page earliest deadline (held timers + challenge countdown) feeds the director shift');
ok(/if \(AppRuntime\.director\.isPaused\(\)\) \{\s*this\.onPauseState\(PauseState\.PAUSED, 0\);/.test(bp) &&
  bp.indexOf('AppRuntime.director.isPaused()') > bp.indexOf('AppRuntime.director.addPauseListener(fn)'),
  'startup race: bindPause replays PAUSED if the director paused before the listener existed');
const ops = code(body(table, '  private onPauseState(state: PauseState, shiftMs: number): void {'));
const pausedBranch = ops.slice(0, ops.indexOf('return;'));
ok(pausedBranch.includes('this.timers.pause()') && pausedBranch.includes('TableAudio.pauseForGame()') &&
  pausedBranch.indexOf('this.timers.pause()') < pausedBranch.indexOf('pauseReasonNow()'),
  'PAUSED freezes timers+BGM for every reason (leave-confirm uses the same path)');
const sr = code(body(sched, '  resume(shiftMs: number = 0): number {'));
ok(sched.includes('pause(): void') && sr.length > 0 && sched.includes('e.remainMs') &&
  sr.includes('this.entries[i].remainMs = this.entries[i].remainMs + extra') && !/Math\.max|< floor/.test(sr),
  'PausableScheduler keeps remaining time; resume adds the uniform shift (shift − held) to every held entry');

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
const oc = code(body(table, '  private openLeaveConfirm(): void {'));
const pauseAt = req.indexOf('AppRuntime.director.requestPause(PauseReasons.LEAVE_CONFIRM)');
ok(req.indexOf('if (this.leaving)') >= 0 && req.indexOf('if (this.leaveConfirmOpen || this.leavePending)') >= 0 &&
  req.indexOf('if (this.leaving)') < pauseAt && req.indexOf('if (this.leaveConfirmOpen || this.leavePending)') < pauseAt,
  'requestLeave: leaving lock + open/pending guard before anything (repeat presses count once)');
ok(pauseAt > 0 && /if \(st === PauseState\.PENDING\) \{\s*this\.leavePending = true;[\s\S]*?return;\s*\}\s*this\.openLeaveConfirm\(\);/.test(req) &&
  !req.includes('showAlertDialog('), 'leave → director.requestPause(LEAVE_CONFIRM) first; PENDING records intent only, dialog later (21 §3.1 P06 / S21-45)');
ok(/if \(this\.leaving \|\| this\.leaveConfirmOpen\) \{\s*return;/.test(oc) && oc.indexOf('this.leaveConfirmOpen = true') < oc.indexOf('showAlertDialog('),
  'openLeaveConfirm: single dialog guard, then showAlertDialog');
ok(/primaryButton:[\s\S]*?this\.onLeaveCancel\(\)/.test(oc) && /cancel: \(\): void => \{\s*this\.onLeaveCancel\(\);/.test(oc),
  'dialog 取消 button and back/dismiss (cancel) → onLeaveCancel');
ok(/catch \(err\) \{[\s\S]*?this\.resumeIfLeavePause\(\)/.test(oc), 'dialog show failure → resume (never stuck paused)');
const opsAll = code(body(table, '  private onPauseState(state: PauseState, shiftMs: number): void {'));
ok(/if \(this\.leavePending\) \{\s*this\.leavePending = false;\s*this\.openLeaveConfirm\(\);/.test(opsAll.slice(0, opsAll.indexOf('PauseState.PENDING'))),
  'PAUSED (sequence ended or PENDING_CAP_MS) opens the deferred leave dialog exactly once');
ok(count(tableCode, /this\.openLeaveConfirm\(\)/) === 2, 'openLeaveConfirm callers = requestLeave (idle) + onPauseState(PAUSED) (pending)');
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
ok(!/toLobby\(\)|director\.stop\(\)|cancelAll\(\)|resetPlayFlyUi/.test(gh) && gh.includes('void this.unlockLobbyThenRoute()'),
  'goHome tears nothing down before routing (state kept if routing fails)');
// ⑧ routing fallback chain: replace → back → (or 3000 ms timeout) unlock + keep state (the ONLY lock reset).
const ur = code(body(table, '  private async unlockLobbyThenRoute(): Promise<void> {'));
ok(/const routed: boolean = await LbRouter\.toLobbyOrBack\(\);\s*if \(!routed\) \{\s*this\.releaseLeaveLock\(\);\s*return;\s*\}\s*this\.teardownAfterRoute\(\);/.test(ur) &&
  !/(leaving|homeRouting|leaveConfirmOpen) = false/.test(ur), 'goHome routing: await toLobbyOrBack(); false → unlock only; true → teardown');
const tda = code(body(table, '  private teardownAfterRoute(): void {'));
const flo = code(body(table, '  private finishLeaveOnce(why: string): boolean {'));
ok(/if \(!this\.finishLeaveOnce\(/.test(tda) && tda.indexOf('this.finishLeaveOnce(') < tda.indexOf('this.timers.cancelAll()') &&
  count(tableCode, /this\.teardownAfterRoute\(\)/) === 1, 'teardown only after a successful route, through finishLeaveOnce (second success = no side effect)');
ok(/if \(this\.leaveFinished\) \{\s*return false;\s*\}\s*this\.leaveFinished = true;/.test(flo) && flo.includes('AppRuntime.director.stop()') &&
  flo.includes('AppRuntime.engine.toLobby()') && flo.indexOf('TableAudio.clearGamePause()') < flo.indexOf('TableAudio.leaveThenRelease()') &&
  !/resumeForGame|startBgm/.test(flo) && count(tableCode, /AppRuntime\.director\.stop\(\)/) === 1 && count(tableCode, /AppRuntime\.engine\.toLobby\(\)/) === 1 &&
  count(tableCode, /this\.finishLeaveOnce\(/) === 2,
  'finishLeaveOnce: once-only (leaveFinished) director.stop + engine LOBBY + audio leaveThenRelease (no BGM resume); the only stop/toLobby in Table');
const tlb = body(lbRouter, '  static toLobbyOrBack(timeoutMs: number = LbRouter.LEAVE_ROUTE_TIMEOUT_MS): Promise<boolean> {');
ok(/private static leaveInFlight: Promise<void> \| null = null;/.test(lbRouter) && /let nav: Promise<void> \| null = LbRouter\.leaveInFlight;\s*if \(nav === null\) \{/.test(tlb) &&
  count(lbRouter, /router\.replaceUrl\(\{ url: PageUrls\.LOBBY \}\)/) === 1, 'toLobbyOrBack reuses a still-in-flight leave replace (one navigation even after a timeout retry)');
ok(/static readonly LEAVE_ROUTE_TIMEOUT_MS: number = 3000;/.test(lbRouter) && tlb.includes('router.replaceUrl({ url: PageUrls.LOBBY })') &&
  tlb.includes("once.settle(true, 'replace')") && tlb.includes("once.settle(LbRouter.tryBack(), 'back')") && tlb.includes("once.settle(false, 'timeout')"),
  'LbRouter.toLobbyOrBack: replace → (reject / throw) tryBack → 3000 ms timeout = failure; RouteOnce settles once');
ok(/catch \(e\) \{\s*const be: BusinessError = e as BusinessError;/.test(code(lbRouter)) && /\(err: BusinessError\): void =>/.test(lbRouter) &&
  /Number\(router\.getLength\(\)\) <= 1/.test(code(body(lbRouter, '  private static tryBack(): boolean {'))),
  'LbRouter errors typed as BusinessError; back() with no page underneath counts as failure');
// 迟到的路由成功（超时判失败之后）→ 页面被移走：aboutToDisappear 收尾，停导演 + 引擎 LOBBY（负责人 #12 / #6）。
const atd = code(body(table, '  aboutToDisappear(): void {'));
const flr = code(body(table, '  private finishLeaveIfRouted(): void {'));
ok(atd.includes('this.finishLeaveIfRouted()') && atd.indexOf('this.finishLeaveIfRouted()') > atd.indexOf('this.unbindPause()') &&
  count(tableCode, /this\.finishLeaveIfRouted\(\)/) === 1, 'aboutToDisappear → finishLeaveIfRouted (after unbindPause, only caller)');
ok(/if \(!this\.leaveRouteIssued\) \{\s*return;/.test(flr) && /snap\.phase === Phase\.LOBBY \|\| snap\.phase === Phase\.RECAP \|\| snap\.phase === Phase\.END\) \{\s*return;/.test(flr) &&
  flr.includes("this.finishLeaveOnce(") &&
  !/commitOnce|commitLeaveRecord|showAlertDialog|openLeaveConfirm/.test(flr),
  'finishLeaveIfRouted: only if a leave route was issued and the match is still live → finishLeaveOnce; no record write, no dialog');
ok(count(tableCode, /this\.leaveRouteIssued = true/) === 1 && gh.includes('this.leaveRouteIssued = true') && !/this\.leaveRouteIssued = false/.test(tableCode),
  'leaveRouteIssued set once in goHome, never reset (survives the timeout unlock)');
const rel = code(body(table, '  private releaseLeaveLock(): void {'));
const relErr = rel.indexOf('Logger.error(TAG,');
ok(relErr > 0 && ['this.homeRouting = false', 'this.leaving = false', 'this.leaveConfirmOpen = false', 'this.leavePending = false', 'this.resumeIfLeavePause()']
  .every((x) => rel.indexOf(x) > relErr), 'releaseLeaveLock: hilog error, releases locks, resumes the leave pause (match continues as is)');
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
ok(/snap\.phase === Phase\.LOBBY/.test(clrRaw) && /if \(snap\.matchId === RecordStore\.lastMatchId/.test(code(records)),
  'retry after unlock cannot write 中退 twice: commitOnce dedups by last_match_id (behavioural run below)');

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
const BIG = 99999; // per-match counter ceiling (= RecordStore.MAX_COUNT, far above any real match)
ok(/private static readonly MAX_COUNT: number = 99999;/.test(records), 'record counters validated against the same ceiling (MAX_COUNT 99999)');
// The 400 B measurement itself runs on the REAL RecordStore.build() further down (after the module is loaded).

// ⑬ S21-17 (behavioural): 中退 written exactly once; a later / duplicate RECAP callback for the same match
// cannot add a second record — also after an app restart (last_match_id reloaded from storage).
// Loads the REAL RecordStore.ets in node: types stripped, imports replaced by stubs (fake Preferences,
// real MatchRank + real SeatRole/SeatStatus enums from Phase.ets).
const phaseSrc = src(E + 'engine/Phase.ets');
const enumObj = (name) => {
  const m = new RegExp(`export enum ${name} \\{([\\s\\S]*?)\\}`).exec(phaseSrc);
  return m ? Object.freeze(Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*'([^']*)'/g)].map((x) => [x[1], x[2]]))) : null;
};
const REC_TYPES = ['preferences.Preferences | null', 'preferences.Preferences', 'preferences.ValueType', 'common.UIAbilityContext',
  'Promise<void>', 'MatchRecordV1[]', 'MatchRecordV1 | null', 'MatchRecordV1', 'RecordSummaryV1 | null', 'RecordSummaryV1', 'RecordCommit',
  'MatchSnapshot', 'SeatModel | null', 'SeatModel', 'RecapRow | null', 'RecapRow', 'RecentParse', 'Record<string, Object> | null',
  'Record<string, Object>', 'Object | null | undefined', 'Object | undefined', 'Object | null', 'Object[]', 'Object',
  'string[]', 'string', 'number', 'boolean'];
const REC_AS = ['Record<string, Object>', 'MatchRecordV1[]', 'RecordSummaryV1', 'Object[]', 'Object'];
const recordsJs = stripEts(records, REC_TYPES, REC_AS);
/** Fake Preferences: every get / put / delete / clear / flush is logged so read paths can prove they never write. */
const makePrefStore = (init) => {
  const data = new Map(Object.entries(init || {}));
  const st = { data, ops: [], flushes: 0 };
  st.get = async (k, d) => { st.ops.push(`get:${k}`); return data.has(k) ? data.get(k) : d; };
  st.put = async (k, v) => { st.ops.push(`put:${k}`); data.set(k, v); };
  st.delete = async (k) => { st.ops.push(`delete:${k}`); data.delete(k); };
  st.deleteSync = (k) => { st.ops.push(`delete:${k}`); data.delete(k); };
  st.clear = async () => { st.ops.push('clear'); data.clear(); };
  st.flush = async () => { st.ops.push('flush'); st.flushes++; };
  st.writes = () => st.ops.filter((o) => !o.startsWith('get:'));
  st.dump = () => JSON.stringify([...data.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  return st;
};
let curPrefStore = makePrefStore();
const prefData = { get: (k) => curPrefStore.data.get(k) };
const recStubs = () => ({
  preferences: { getPreferences: async () => curPrefStore },
  AiPersonaRegistry: { personaIdForSeat: () => 'AI_TIMID' },
  PersistNs: { RECORDS: 'lb.records' },
  Logger: { info: () => {}, warn: () => {}, error: () => {} },
  MatchRank: MR, SeatRole: enumObj('SeatRole'), SeatStatus: enumObj('SeatStatus')
});
globalThis.__prbStub = recStubs();
const loadRecordStore = async () => (await importFresh(recordsJs, recStubs())).RecordStore; // fresh statics = app restart
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
  // Report.aboutToAppear backstop for the same match (same commitOnce, same shape as the director).
  const wReport = RS.commitOnce(mkSnap(MID, SS.GHOST, 1), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  await tickIo();
  // 4) app restart: fresh statics, last_match_id reloaded from the fake store, RECAP once more.
  const RS2 = await loadRecordStore();
  await RS2.init({});
  const wRecapAfterRestart = RS2.commitOnce(mkSnap(MID, SS.GHOST, 1), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
  await tickIo();
  const stored = JSON.parse(prefData.get('recent_v1') || '[]');
  const sum = JSON.parse(prefData.get('summary_v1') || '{}');
  const mem = RS2.summaryNow();
  const out = `writes leave=${wLeave} recap=${wRecap1} recap2=${wRecap2} reportBackstop=${wReport} recapAfterRestart=${wRecapAfterRestart}; ` +
    `recent_v1=${stored.length} total=${sum.total} quits=${sum.quits} last_match_id=${prefData.get('last_match_id')} ` +
    `rec.quit=${stored[0] && stored[0].quit} rec.result=${stored[0] && stored[0].result} rec.rank=${stored[0] && stored[0].rank}`;
  ok(wLeave === true && wRecap1 === false && wRecap2 === false && wReport === false && wRecapAfterRestart === false &&
    stored.length === 1 && sum.total === 1 && sum.quits === 1 && mem.total === 1 && mem.quits === 1 && RS2.recent().length === 1 &&
    prefData.get('last_match_id') === MID && stored[0].quit === true && stored[0].result === 'LOSE' && stored[0].rank === 3 && curPrefStore.flushes >= 1,
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
  // ⑫ 400 B on the REAL RecordStore.build(): fully loaded snapshot (max seats, longest persona, every counter at MAX_COUNT,
  // 13-digit timestamps, longest matchId) → JSON.stringify → UTF-8 bytes. No runtime truncation exists to hide an overflow.
  const nMax = md.max_players;
  const bigSnap = {
    matchId: `m-${Number.MAX_SAFE_INTEGER}`, startedAt: 1, endedAt: 9999999999999, roundIndex: BIG, winnerSeatId: -1, eventLog: [],
    seats: Array.from({ length: nMax }, (_, i) => ({ seatId: i, role: i === 0 ? SR.HUMAN : SR.AI, aiPersona: i === 0 ? '' : longestPersona,
      lives: md.lives_default, status: SS.ALIVE })),
    recap: Array.from({ length: nMax }, (_, i) => row(i, { playCount: BIG, fakeHandCount: BIG, challengeCount: BIG, challengeHits: BIG,
      doubtedCount: BIG, caughtCount: BIG }))
  };
  const built = RS2.build(bigSnap, { quit: true, isDemo: false, ff: false, pausedMs: 0 });
  const builtBytes = Buffer.byteLength(JSON.stringify(built), 'utf8');
  ok(JSON.stringify(Object.keys(built)) === JSON.stringify(recFields.map((f) => f.split(':')[0])) && built.opponents.length === nMax - 1 &&
    built.opponents.every((x) => x === longestPersona) && built.plays === BIG && results.includes(built.result) && builtBytes <= 400,
    `real RecordStore.build() fully loaded = ${builtBytes} B UTF-8 ≤ 400 B (21 §2.1; ${nMax} seats, ${nMax - 1}×${longestPersona}, hands=${built.hands})`);
  // Worst case also on the longest result spelling (WIN/LOSE) — build picks LOSE for a quit; LOSE is the longer one.
  ok(results.reduce((x, y) => (y.length > x.length ? y : x), '') === built.result, `measured with the longest result value (${built.result})`);
}
// Both entry points go through commitOnce; no other writer of the three keys.
const reportSrc = src(E + 'pages/Report.ets');
const rpa = code(body(reportSrc, '  aboutToAppear(): void {'));
ok(/if \(snap\.phase === Phase\.RECAP\) \{[\s\S]*?quit: false,\s*isDemo: AppRuntime\.engine\.isDemoMatch\(\),\s*ff: false,\s*pausedMs: AppRuntime\.engine\.pausedTotalAt\(/.test(rpa) &&
  rpa.includes('RecordStore.commitOnce(snap, recapCommit)') && count(code(reportSrc), /RecordStore\.commitOnce\(/) === 1,
  'Report.aboutToAppear backstop: RECAP → commitOnce with the director\'s shape (idempotent via last_match_id)');
ok(count(code(dir), /RecordStore\.commitOnce\(/) === 1 && count(code(table), /RecordStore\.commitOnce\(/) === 1 &&
  count(code(records), /store\.put\(/) === 3 && count(code(body(records, '  private static async persist(): Promise<void> {')), /store\.put\(/) === 3,
  'S21-17: RECAP (director) + Report backstop + leave (Table) are the only writers, all via commitOnce; only persist() puts');
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
const rcl = code(body(engine, '  resumeClock(wallMs: number, shiftMs: number): number {'));
ok(rcl.includes('this.pausedTotalMs = this.pausedTotalMs + delta'), 'engine accumulates every pause Δ (user / background / leave dialog)');
ok(count(engine, /this\.pausedTotalMs = 0;/) === 2, 'pausedTotalMs reset at startMatch + resetToLobby');
ok(/pausedTotalAt\(wallMs: number\): number \{[\s\S]*?this\.clockPausedAt > 0 && wallMs > this\.clockPausedAt[\s\S]*?return this\.pausedTotalMs \+ ongoing;/.test(engine),
  'pausedTotalAt includes a pause still in progress (leave confirmed while dialog-paused)');

// ---------------------------------------------------------------- ⑭ S21-47 bad save files (real RecordStore, read never writes)
// 21 §2.6 (16476d5 / v0.1 补5) + PM 2026-10-07: every repair lives in memory only. Loading never put / flush / delete / clear;
// the stored bytes stay identical; the next normal commitOnce overwrites with the repaired state.
if (MR) {
  const goodRec = (id, over) => ({ v: 1, matchId: id, endedAt: 1759840000000, durationMs: 60000, rounds: 2, hands: 10, playerCount: 4, rank: 2,
    result: 'LOSE', quit: false, ff: false, livesLeft: 0, plays: 3, fakeHands: 1, doubts: 2, doubtHits: 1, doubted: 1, caught: 0,
    opponents: ['AI_SHARK', 'AI_KAREN', 'AI_TIMID'], ...over });
  const A = goodRec('m-a', { result: 'WIN', rank: 1, livesLeft: 2 });
  const C = goodRec('m-c', { quit: true });
  const SUM_OK = { v: 1, total: 10, wins: 3, quits: 1, doubts: 20, doubtHits: 8 };
  const noKey = (o, k) => { const x = { ...o }; delete x[k]; return x; };
  const runLoad = async (init) => {
    curPrefStore = makePrefStore(init);
    const before = curPrefStore.dump();
    let R = null;
    let err = '';
    try {
      R = await loadRecordStore();
      await R.init({});
      await tickIo();
    } catch (e) {
      err = e.message;
    }
    return { R, err, writes: curPrefStore.writes(), same: curPrefStore.dump() === before };
  };
  const S = (o) => JSON.stringify(o);
  const sumOf = (R) => R.summaryNow();
  const cases = [
    { name: 'one bad record (missing field) → only it dropped', init: { recent_v1: S([A, noKey(goodRec('m-b'), 'doubts'), C]), summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'record v missing / v=2 → dropped', init: { recent_v1: S([A, noKey(goodRec('m-v0'), 'v'), goodRec('m-v2', { v: 2 }), C]), summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'record negative / non-integer / string count → dropped', init: { recent_v1: S([goodRec('m-n', { doubts: -1 }), goodRec('m-f', { plays: 2.5 }), goodRec('m-s', { rounds: '2' }), A]), summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: 'm-a', total: 10, last: 'm-a' } },
    { name: 'summary negative count → recomputed from valid records (not zeroed)', init: { recent_v1: S([A, C]), summary_v1: S({ ...SUM_OK, wins: -1 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'summary v missing → recomputed', init: { recent_v1: S([A, C]), summary_v1: S(noKey(SUM_OK, 'v')), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'summary v=2 → recomputed', init: { recent_v1: S([A, C]), summary_v1: S({ ...SUM_OK, v: 2 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, last: 'm-a' } },
    { name: 'summary non-integer / string count → recomputed', init: { recent_v1: S([A, C]), summary_v1: S({ ...SUM_OK, total: 7.5, doubts: '20' }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, last: 'm-a' } },
    { name: 'summary not JSON → recomputed', init: { recent_v1: S([A, C]), summary_v1: '{oops', last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, last: 'm-a' } },
    { name: 'summary valid + recent all bad → keep summary, clear details (memory)', init: { recent_v1: S([{}, 5, 'x', noKey(A, 'matchId')]), summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: '', total: 10, wins: 3, last: '' } },
    { name: 'summary valid + recent not JSON → keep summary', init: { recent_v1: '[{', summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: '', total: 10, last: '' } },
    { name: 'summary + recent both bad → new player (memory)', init: { recent_v1: S([{}, null]), summary_v1: S({ v: 1, total: -3 }), last_match_id: 'm-a' },
      want: { ids: '', total: 0, wins: 0, quits: 0, doubts: 0, last: '' } },
    { name: 'last_match_id not a string → newest valid matchId', init: { recent_v1: S([A, C]), summary_v1: S(SUM_OK), last_match_id: 42 },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'last_match_id empty → newest valid matchId', init: { recent_v1: S([A, C]), summary_v1: S(SUM_OK), last_match_id: '' },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'last_match_id unknown → newest valid matchId', init: { recent_v1: S([A, C]), summary_v1: S(SUM_OK), last_match_id: 'm-zzz' },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'last_match_id missing → newest valid matchId', init: { recent_v1: S([A, C]), summary_v1: S(SUM_OK) },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'last_match_id bad + no valid record → empty', init: { recent_v1: S([]), summary_v1: S(SUM_OK), last_match_id: 7 },
      want: { ids: '', total: 10, last: '' } }
  ];
  let allNoWrite = true;
  let allSame = true;
  for (const c of cases) {
    const r = await runLoad(c.init);
    if (r.R === null) {
      fail(`S21-47 ${c.name}: threw ${r.err}`);
      continue;
    }
    const sm = sumOf(r.R);
    const ids = r.R.recent().map((x) => x.matchId).join(',');
    const w = c.want;
    const good = ids === w.ids && sm.total === w.total && sm.v === 1 && r.R.lastMatchId === w.last &&
      (w.wins === undefined || sm.wins === w.wins) && (w.quits === undefined || sm.quits === w.quits) && (w.doubts === undefined || sm.doubts === w.doubts) &&
      [sm.total, sm.wins, sm.quits, sm.doubts, sm.doubtHits].every((n) => Number.isInteger(n) && n >= 0);
    allNoWrite = allNoWrite && r.writes.length === 0;
    allSame = allSame && r.same;
    ok(good && r.writes.length === 0 && r.same,
      `S21-47 ${c.name}: recent=[${ids}] total=${sm.total} wins=${sm.wins} quits=${sm.quits} last=${r.R.lastMatchId || '∅'}; writes=${r.writes.join('/') || 'none'} bytesSame=${r.same}`);
  }
  ok(allNoWrite, `S21-47 read never writes: ${cases.length} bad-file loads → 0 put / flush / delete / clear`);
  ok(allSame, `S21-47 read never writes: every key/value of the fake store byte-identical before vs after load (${cases.length} fixtures)`);
  // Next normal commitOnce persists the repaired state (valid summary + new record), no crash.
  const after = async (init, expectTotal, expectRecent) => {
    const r = await runLoad(init);
    const snap = { matchId: 'm-next', startedAt: 1759840000000, endedAt: 1759840060000, roundIndex: 2, winnerSeatId: 0, eventLog: [],
      seats: [{ seatId: 0, role: globalThis.__prbStub.SeatRole.HUMAN, aiPersona: '', lives: 1, status: globalThis.__prbStub.SeatStatus.ALIVE },
        { seatId: 1, role: globalThis.__prbStub.SeatRole.AI, aiPersona: 'AI_SHARK', lives: 0, status: globalThis.__prbStub.SeatStatus.GHOST }],
      recap: [{ seatId: 0, nickname: 's0', playCount: 3, fakeHandCount: 0, challengeCount: 1, challengeHits: 1, doubtedCount: 0, caughtCount: 0, aliveAtExit: 0 },
        { seatId: 1, nickname: 's1', playCount: 3, fakeHandCount: 1, challengeCount: 0, challengeHits: 0, doubtedCount: 1, caughtCount: 1, aliveAtExit: 2 }] };
    const wrote = r.R.commitOnce(snap, { quit: false, isDemo: false, ff: false, pausedMs: 0 });
    await tickIo();
    const sum = JSON.parse(curPrefStore.data.get('summary_v1'));
    const rec = JSON.parse(curPrefStore.data.get('recent_v1'));
    return { wrote, sum, rec, last: curPrefStore.data.get('last_match_id'), writes: curPrefStore.writes() };
  };
  const p1 = await after(cases[3].init, 3, 3);
  ok(p1.wrote && p1.sum.v === 1 && p1.sum.total === 3 && p1.sum.wins === 2 && p1.sum.quits === 1 && p1.rec.length === 3 &&
    p1.rec[0].matchId === 'm-next' && p1.last === 'm-next' && p1.writes.includes('flush'),
    `S21-47 bad summary → next commitOnce writes repaired state: summary total=${p1.sum.total} wins=${p1.sum.wins} quits=${p1.sum.quits} v=${p1.sum.v}, recent=${p1.rec.length}`);
  const p2 = await after(cases[8].init, 11, 1);
  ok(p2.wrote && p2.sum.v === 1 && p2.sum.total === 11 && p2.sum.wins === 4 && p2.rec.length === 1 && p2.rec[0].matchId === 'm-next',
    `S21-47 summary kept + details cleared → next commitOnce: summary total=${p2.sum.total} (10 + 1), recent=${p2.rec.length} (bad details overwritten)`);
  const p3 = await after(cases[1].init, 0, 0);
  ok(p3.wrote && p3.rec.length === 3 && p3.rec.every((x) => x.v === 1) && p3.sum.total === 11,
    `S21-47 dropped records → next commitOnce persists only valid ones (recent=${p3.rec.map((x) => x.matchId).join(',')})`);
}
ok(!/persist\(\)/.test(code(body(records, '  static loadFrom(rawRecent: preferences.ValueType, rawSummary: preferences.ValueType, rawLast: preferences.ValueType): boolean {'))) &&
  !/\.(?:delete|deleteSync|clear|clearSync)\(/.test(code(records)), 'RecordStore: loadFrom never persists; no delete / clear anywhere');

// ---------------------------------------------------------------- ⑭ lb.settings per key (real AudioSettings, read never writes)
const AS_TYPES = ['preferences.Preferences | null', 'preferences.Preferences', 'preferences.ValueType', 'common.UIAbilityContext', 'Promise<void>',
  'AudioSettingsListener[]', 'AudioSettingsListener', 'number', 'boolean', 'string'];
const settingsJs = stripEts(settings, AS_TYPES);
let asStore = makePrefStore();
let asFailOpen = false;
const loadAudioSettings = async () => (await importFresh(settingsJs, {
  preferences: { getPreferences: async () => { if (asFailOpen) throw new Error('corrupt lb.settings'); return asStore; } },
  PersistNs: { AUDIO: 'lb.settings' },
  Logger: { info: () => {}, warn: () => {}, error: () => {} }
})).AudioSettings;
const asCase = async (init) => {
  asStore = makePrefStore(init);
  const before = asStore.dump();
  const AS = await loadAudioSettings();
  await AS.init({});
  return { AS, v: [AS.bgm, AS.sfx, AS.muted], writes: asStore.writes(), same: asStore.dump() === before };
};
const AUDIO_CASES = [
  [{ vol_bgm: 37, vol_sfx: 38, mute_all: true }, [35, 40, true], 'in-range non-multiple of 5 → nearest 5 (37→35, 38→40)'],
  [{ vol_bgm: 37.5, vol_sfx: 40, mute_all: true }, [100, 40, true], 'non-integer 37.5 → that key 100 (no rounding), others kept'],
  [{ vol_bgm: 50, vol_sfx: 105, mute_all: false }, [50, 100, false], '105 → that key 100 (out of range, not truncated), others kept'],
  [{ vol_bgm: -5, vol_sfx: 2.5, mute_all: true }, [100, 100, true], '-5 / 2.5 → 100'],
  [{ vol_bgm: '50', vol_sfx: true, mute_all: false }, [100, 100, false], 'non-number → 100'],
  [{ vol_bgm: NaN, vol_sfx: Infinity, mute_all: false }, [100, 100, false], 'NaN / Infinity → 100'],
  [{ vol_bgm: 0, vol_sfx: 100, mute_all: false }, [0, 100, false], 'bounds 0 / 100 kept'],
  [{ vol_bgm: 20, vol_sfx: 60, mute_all: 'true' }, [20, 60, false], "mute_all 'true' (not boolean) → false, volumes kept"],
  [{ vol_bgm: 20, vol_sfx: 60, mute_all: 1 }, [20, 60, false], 'mute_all 1 → false'],
  [{}, [100, 100, false], 'missing keys → 100 / 100 / false']
];
let asNoWrite = true;
for (const [init, want, name] of AUDIO_CASES) {
  const r = await asCase(init);
  asNoWrite = asNoWrite && r.writes.length === 0 && r.same;
  ok(JSON.stringify(r.v) === JSON.stringify(want) && r.writes.length === 0 && r.same,
    `lb.settings ${name}: got ${JSON.stringify(r.v)}; writes=${r.writes.join('/') || 'none'}`);
}
{
  asFailOpen = true;
  asStore = makePrefStore({ vol_bgm: 40 });
  const AS = await loadAudioSettings();
  AS.setBgmLevel(40);
  AS.setSfxLevel(20);
  AS.setMuted(true);
  await AS.init({});
  asFailOpen = false;
  ok(AS.bgm === 100 && AS.sfx === 100 && AS.muted === false && asStore.writes().length === 0,
    `lb.settings whole read fails → all three back to 100 / 100 / false (got ${AS.bgm}/${AS.sfx}/${AS.muted}); no write`);
  const r = await asCase({ vol_bgm: 37.5, vol_sfx: 105, mute_all: 'x' });
  r.AS.setBgmLevel(37);
  await tickIo();
  ok(r.AS.bgm === 35 && asStore.data.get('vol_bgm') === 35 && asStore.data.get('vol_sfx') === 100 && asStore.data.get('mute_all') === false &&
    asStore.writes().includes('flush'), 'control: the player\'s next set (slider release) is what persists the repaired values (37 → 35)');
}
ok(asNoWrite, `lb.settings read never writes: ${AUDIO_CASES.length} loads → 0 put / flush / delete, bytes identical`);
ok(!/persist\(\)/.test(code(body(settings, '  static async init(context: common.UIAbilityContext): Promise<void> {'))), 'AudioSettings.init never persists');

// ---------------------------------------------------------------- ⑭ unified resume shift (real ResumeShift + real PausableScheduler)
const shiftSrc = src(E + 'engine/ResumeShift.ets');
let RSh = null;
let PSched = null;
const clk = makeClock(10000);
try {
  RSh = (await importFresh(stripEts(shiftSrc, ['number[]', 'number']), {})).ResumeShift;
  PSched = (await importFresh(stripEts(sched, ['TimerEntry[]', 'TimerEntry | null', 'TimerEntry', 'number', 'boolean']), clockStubs(clk))).PausableScheduler;
} catch (e) {
  fail(`ResumeShift / PausableScheduler did not load in node: ${e.message}`);
}
if (RSh && PSched) {
  // Pure: page timer 10200 < engine turn 10350 < AI think 12000; paused at 10000.
  const P = 10000;
  const dl = [10200, 10350, 12000];
  const shortS = RSh.compute(P, 10100, 600, dl); // Δ=100: grace binds
  const sh = dl.map((d) => d + shortS);
  ok(shortS === 500 && sh[0] - 10100 === 600 && sh[1] - sh[0] === 150 && sh[2] - sh[1] === 1650,
    `ResumeShift short pause: shift=${shortS} → earliest at now+${sh[0] - 10100} (≥ 600), gaps 150 / 1650 kept (order unchanged)`);
  const longS = RSh.compute(P, 20000, 600, dl);
  ok(longS === 10400 && dl[0] + longS - 20000 === 600, `ResumeShift long pause: shift=${longS} ≥ Δ=10000; earliest at now+${dl[0] + longS - 20000}`);
  ok(RSh.compute(P, 10100, 600, [15000]) === 100 && RSh.compute(P, 10100, 600, []) === 100 && RSh.compute(P, 10100, 600, [0, -1]) === 100,
    'ResumeShift: far deadlines / none → shift = Δ (no extra wait)');
  const perItem = dl.map((d) => Math.max(d + 100, 10100 + 600));
  ok(perItem[0] === perItem[1], `(evidence) old per-deadline max would collapse 10200 / 10350 to the same instant ${perItem[0]} — uniform shift keeps them 150 ms apart`);
  // Real scheduler + real ResumeShift: same contract end to end.
  const s1 = new PSched();
  const log = [];
  s1.schedule(() => log.push(['A', clk.now]), 200);
  s1.schedule(() => log.push(['B', clk.now]), 350);
  clk.advance(50);
  s1.pause();
  const pAt = clk.now;
  clk.advance(5000);
  const frozen = log.length;
  const sShift = RSh.compute(pAt, clk.now, 600, [s1.earliestHeldDueAt()]);
  const resumeAt = clk.now;
  s1.resume(sShift);
  clk.advance(3000);
  ok(frozen === 0 && log.length === 2 && log[0][0] === 'A' && log[0][1] - resumeAt === 600 && log[1][1] - log[0][1] === 150,
    `PausableScheduler + ResumeShift: nothing fires while paused; after resume A at +${log[0] && log[0][1] - resumeAt} ms, B ${log[1] && log[1][1] - log[0][1]} ms later (order + gap kept)`);
  // PAU-3 deal: the card in flight lands during pause; the next card waits; resumes ≥ 600 ms after resume.
  const s2 = new PSched();
  const ev = [];
  const t0 = clk.now;
  const land = (k) => () => {
    ev.push([`land${k}`, clk.now - t0]);
    s2.schedule(() => { ev.push([`fly${k + 1}`, clk.now - t0]); if (k < 3) s2.scheduleAtomic(land(k + 1), 120); }, 80);
  };
  ev.push(['fly1', 0]);
  s2.scheduleAtomic(land(1), 120);
  clk.advance(40);
  s2.pause();
  const p2At = clk.now;
  clk.advance(3000);
  const duringPause = ev.map((x) => x[0]).join(',');
  const s2Shift = RSh.compute(p2At, clk.now, 600, [s2.earliestHeldDueAt()]);
  const r2At = clk.now - t0;
  s2.resume(s2Shift);
  clk.advance(5000);
  const fly2 = ev.find((x) => x[0] === 'fly2');
  ok(duringPause === 'fly1,land1' && fly2 && fly2[1] - r2At === 600 && ev.map((x) => x[0]).join(',') === 'fly1,land1,fly2,land2,fly3,land3,fly4',
    `PAU-3 deal sim (real scheduler): during pause [${duringPause}] (in-flight card landed, next held); next card ${fly2 && fly2[1] - r2At} ms after resume; order ${ev.map((x) => x[0]).join(',')}`);
}

// ---------------------------------------------------------------- ⑭ Table harness: REAL Table methods in node
// requestLeave / openLeaveConfirm / onLeaveCancel / onLeaveConfirmed / commitLeaveRecord / onPauseState / bindPause /
// goHome / unlockLobbyThenRoute / teardownAfterRoute / releaseLeaveLock are extracted from Table.ets and run against the REAL
// LbRouter (fake router + fake clock), REAL RecordStore (fake Preferences) and REAL PausableScheduler. The director is a small
// fake that follows the asserted MatchDirector contract (RUNNING → PENDING while a sequence is busy → PAUSED when it ends / cap;
// resume = ResumeShift); its real transitions are covered by the structural checks above.
const TABLE_SIGS = ['  private requestLeave(): void {', '  private openLeaveConfirm(): void {', '  private onLeaveCancel(): void {',
  '  private onLeaveConfirmed(): void {', '  private commitLeaveRecord(): void {', '  private humanIsGhost(snap: MatchSnapshot | null): boolean {',
  '  private resumeIfLeavePause(): void {', '  private bindPause(): void {', '  private pageEarliestDeadline(pausedAtMs: number): number {',
  '  private unbindPause(): void {', '  private onPauseState(state: PauseState, shiftMs: number): void {', '  private requestUserPause(): void {',
  '  private resumeFromPauseLayer(): void {', '  private goHome(): void {', '  private teardownAfterRoute(): void {',
  '  private async unlockLobbyThenRoute(): Promise<void> {', '  private releaseLeaveLock(): void {', '  aboutToDisappear(): void {',
  '  private finishLeaveIfRouted(): void {', '  private finishLeaveOnce(why: string): boolean {'];
const missingSigs = TABLE_SIGS.filter((sg) => body(table, sg).length === 0);
ok(missingSigs.length === 0, `Table harness: all ${TABLE_SIGS.length} methods found (${missingSigs.join(' | ') || 'ok'})`);
const TABLE_TYPES = ['AlertDialogParamWithButtons', 'MatchSnapshot | null', 'RecordCommit', 'PauseListener', 'PauseState', 'common.UIAbilityContext',
  'boolean', 'number', 'string'];
const tableMethodsJs = stripEts(TABLE_SIGS.map((sg) => body(table, sg) + '\n  }\n').join('\n'), TABLE_TYPES, ['common.UIAbilityContext']);
const harnessJs = `class TableHarness {
  constructor() {
    this.leaving = false; this.leaveConfirmOpen = false; this.leavePending = false; this.homeRouting = false;
    this.pauseLayerOn = false; this.pauseFromBackground = false; this.lastHudStamp = ''; this.debugPauseOn = false;
    this.challengeTickId = -1; this.challengeDeadlineMs = 0; this.pauseListener = null; this.revealTimer = -1; this.choiceActTimer = -1;
    this.revealForChallengeId = ''; this.choiceActForChallengeId = ''; this.leaveRouteIssued = false; this.leaveFinished = false; this.pollId = -1; this.hintTimer = -1;
    this.timers = new PausableScheduler(); this.dialogs = []; this.calls = [];
  }
  getUIContext() { return { showAlertDialog: (o) => { this.dialogs.push({ at: Date.now(), busy: AppRuntime.director.busy, opts: o }); } }; }
  pull() {}
  lockTableWindow() { this.calls.push('lockTableWindow'); return Promise.resolve(); }
  resetPlayFlyUi() { this.calls.push('teardown'); }
  resetRevealUi() {} retractChoiceAct() {} clearChoiceAwait() {} closeChallengeEntry() {}
  cancelDealTimers() {} cancelPlayFlyTimer() {} cancelRoundWinTimer() {} cancelRevealTimer() {} cancelChallengeTimer() {}
  cancelNpcBubbleTimer() {} cancelChoiceActTimer() {} unbindAvoid() { this.calls.push('unbindAvoid'); }
${tableMethodsJs}
}
export { TableHarness };`;
const PSt = (() => { const m = /export enum PauseState \{([\s\S]*?)\}/.exec(dir); return m ? Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*'(\w+)'/g)].map((x) => [x[1], x[2]])) : {}; })();
const PRs = Object.fromEntries([...dir.matchAll(/static readonly (USER|BACKGROUND|LEAVE_CONFIRM): string = '(\w+)';/g)].map((x) => [x[1], x[2]]));
const capMs = Number((/export const PENDING_CAP_MS: number = (\d+);/.exec(dir) || [0, 0])[1]);
const graceMs = Number((/export const RESUME_GRACE_MS: number = (\d+);/.exec(dir) || [0, 0])[1]);
class FakeDirector {
  constructor(clock) { Object.assign(this, { clock, state: PSt.RUNNING, reason: '', busy: false, listeners: [], resumes: 0, pausedAt: 0, stopped: 0,
    probe: null, seqProbe: null, pendingSince: 0, capLogs: 0 }); }
  requestPause(r) {
    const hard = r === PRs.BACKGROUND;
    if (hard && this.state === PSt.PENDING) { this.enter(); return PSt.PAUSED; }
    if (this.state !== PSt.RUNNING) return this.state;
    this.reason = r;
    if (!hard && this.busy) { this.state = PSt.PENDING; this.pendingSince = this.clock.now; this.notify(0); return PSt.PENDING; }
    this.enter();
    return PSt.PAUSED;
  }
  /** One director tick: PENDING → PAUSED once the sequence is over or PENDING_CAP_MS elapsed (MatchDirector.tick). */
  tick() {
    if (this.state !== PSt.PENDING) return;
    const capped = this.clock.now - this.pendingSince >= capMs;
    if (!this.busy || capped) { if (capped) this.capLogs++; this.enter(); }
  }
  /** Sequence ended the match (→ RECAP): PENDING cancelled without pausing. */
  endMatchDuringSequence() { this.busy = false; if (this.state === PSt.PENDING) { this.state = PSt.RUNNING; this.reason = ''; this.notify(0); } }
  enter() { this.state = PSt.PAUSED; this.pausedAt = this.clock.now; this.notify(0); }
  resumeFromPause() {
    if (this.state === PSt.PENDING) { this.state = PSt.RUNNING; this.reason = ''; this.notify(0); return 0; }
    if (this.state !== PSt.PAUSED) return 0;
    const pending = this.probe ? [this.probe(this.pausedAt)] : [];
    const shift = RSh.compute(this.pausedAt, this.clock.now, graceMs, pending);
    this.state = PSt.RUNNING; this.reason = ''; this.resumes++;
    this.notify(shift);
    return shift;
  }
  notify(shift) { for (const l of [...this.listeners]) l(this.state, shift); }
  pauseReasonNow() { return this.reason; }
  isPaused() { return this.state === PSt.PAUSED; }
  addPauseListener(fn) { this.listeners.push(fn); }
  removePauseListener(fn) { this.listeners = this.listeners.filter((x) => x !== fn); }
  setSequenceBusyProbe(p) { this.seqProbe = p; }
  setPendingDeadlineProbe(p) { this.probe = p; }
  stop() { this.stopped++; }
}
if (RSh && PSched && MR) {
  const SRole = enumObj('SeatRole');
  const SStat = enumObj('SeatStatus');
  const PhaseE = enumObj('Phase');
  const routerLog = { replace: 0, back: 0, errors: [] };
  let routeMode = 'ok';
  let stackLen = 2;
  const fakeRouter = {
    replaceUrl: (opt) => {
      routerLog.replace++;
      routerLog.urls = (routerLog.urls || []).concat([opt && opt.url]);
      if (routeMode === 'ok') return Promise.resolve();
      if (routeMode === 'reject') return Promise.reject({ code: 100001, message: 'replace failed' });
      if (routeMode === 'hang') return new Promise(() => {});
      if (routeMode === 'lateReject') return new Promise((_, rej) => { routeHang.rej = rej; });
      if (routeMode === 'lateResolve') return new Promise((res) => { routeHang.res = res; });
      throw { code: 100002, message: 'sync throw' };
    },
    back: () => { routerLog.back++; },
    getLength: () => String(stackLen)
  };
  const routeHang = { rej: null, res: null };
  const routerJs = stripEts(lbRouter, ['Promise<void> | null', 'Promise<void>', 'RouteOnce', 'BusinessError', 'Error', 'number', 'boolean', 'string'], ['BusinessError']);
  let audio = null;
  const makeWorld = async () => {
    const wclk = makeClock(50000);
    const director = new FakeDirector(wclk);
    curPrefStore = makePrefStore();
    const RSx = await loadRecordStore();
    await RSx.init({});
    const LbR = (await importFresh(routerJs, { router: fakeRouter, PageUrls: { LOBBY: 'pages/Lobby', TABLE: 'pages/Table', REPORT: 'pages/Report' },
      Logger: { info: () => {}, warn: () => {}, error: (t, m) => routerLog.errors.push(m) }, ...clockStubs(wclk) })).LbRouter;
    const Sch = (await importFresh(stripEts(sched, ['TimerEntry[]', 'TimerEntry | null', 'TimerEntry', 'number', 'boolean']), clockStubs(wclk))).PausableScheduler;
    audio = { paused: 0, resumed: 0, cleared: 0, leaveRelease: 0, spRelease: 0, daRelease: 0, log: [] };
    const engine = {
      toLobbyCalls: 0,
      snap: { matchId: 'm-777', startedAt: 49000, endedAt: 0, roundIndex: 2, winnerSeatId: -1, phase: PhaseE.TURN, eventLog: [],
        seats: [{ seatId: 0, role: SRole.HUMAN, aiPersona: '', lives: 2, status: SStat.ALIVE }, { seatId: 1, role: SRole.AI, aiPersona: 'AI_SHARK', lives: 1, status: SStat.ALIVE },
          { seatId: 2, role: SRole.AI, aiPersona: 'AI_KAREN', lives: 1, status: SStat.ALIVE }],
        recap: [0, 1, 2].map((i) => ({ seatId: i, nickname: `s${i}`, playCount: 2, fakeHandCount: 0, challengeCount: 0, challengeHits: 0, doubtedCount: 0, caughtCount: 0, aliveAtExit: 0 })) },
      current() { return this.snap; }, toLobby() { this.toLobbyCalls++; this.snap.phase = PhaseE.LOBBY; },
      isDemoMatch: () => false, pausedTotalAt: () => 0
    };
    const mod = await importFresh(harnessJs, {
      AppRuntime: { director, engine }, PauseState: PSt, PauseReasons: PRs, PENDING_CAP_MS: capMs, Phase: PhaseE, SeatRole: SRole, SeatStatus: SStat,
      TableAudio: { pauseForGame: () => { audio.paused++; audio.log.push('pause'); }, resumeForGame: () => { audio.resumed++; audio.log.push('resume'); },
        clearGamePause: () => { audio.cleared++; audio.log.push('clearPause'); }, leaveThenRelease: () => { audio.leaveRelease++; audio.log.push('leaveRelease'); } },
      Logger: { info: () => {}, warn: () => {}, error: () => {} }, LbRouter: LbR, RecordStore: RSx, WindowOrientation: { lockPortrait: async () => {} },
      getContext: () => ({}), DialogAlignment: { Center: 'Center' }, $r: (k) => k, TAG: 'Table', PausableScheduler: Sch, ...clockStubs(wclk),
      clearInterval: () => {}, DealAudio: { release: () => { audio.daRelease++; } }, SoundPlayer: { release: () => { audio.spRelease++; } }
    });
    const t = new mod.TableHarness();
    t.bindPause();
    return { t, director, engine, clk: wclk, RSx };
  };
  let w = null;
  try {
    w = await makeWorld();
  } catch (e) {
    fail(`Table harness did not load in node: ${e.message}`);
  }
  if (w) {
    // (0) no sequence running: leave → pause + dialog at once.
    {
      const { t, director } = await makeWorld();
      t.requestLeave();
      ok(t.dialogs.length === 1 && director.state === PSt.PAUSED && director.reason === PRs.LEAVE_CONFIRM && audio.paused === 1 && t.timers.isPaused(),
        `leave-idle: dialog shown immediately, director PAUSED(${director.reason}), timers + BGM frozen`);
    }
    // (a) entry A — not pending yet, sequence (reveal / candle) running: press home → intent recorded, PENDING, no dialog until it ends.
    {
      const { t, director, clk: c } = await makeWorld();
      director.busy = true;
      t.requestLeave();
      const mid = t.dialogs.length;
      for (let i = 0; i < 4; i++) { c.advance(300); t.requestLeave(); director.tick(); }
      const stillMid = t.dialogs.length;
      c.advance(500);
      director.busy = false;
      const endAt = c.now;
      director.tick();
      director.tick();
      const afterEnd = t.dialogs.length; // opened by the sequence end itself, not by a new press
      t.requestLeave(); // a press while the dialog is open does not add a second one
      ok(mid === 0 && stillMid === 0 && afterEnd === 1 && t.dialogs.length === 1 && t.dialogs[0].busy === false && t.dialogs[0].at === endAt && director.state === PSt.PAUSED,
        `leave-pending-entryA (not yet pending, sequence busy): 0 dialogs during the sequence (5 presses), exactly ${t.dialogs.length} after it ended (busy=${t.dialogs[0] && t.dialogs[0].busy})`);
    }
    // (b) entry B — already PENDING (another pause request waiting on the same sequence) when home is pressed, then pressed again.
    {
      const { t, director } = await makeWorld();
      director.busy = true;
      director.requestPause(PRs.USER);
      t.requestLeave();
      t.requestLeave();
      const mid = t.dialogs.length;
      director.busy = false;
      director.tick();
      ok(mid === 0 && t.leavePending === false && t.dialogs.length === 1 && t.dialogs[0].busy === false,
        `leave-pending-entryB (already PENDING): 0 dialogs mid-sequence, exactly ${t.dialogs.length} after it ended`);
      // and the variant where the pending one is our own first press
      const w2 = await makeWorld();
      w2.director.busy = true;
      w2.t.requestLeave();
      const pend1 = w2.director.state;
      w2.t.requestLeave();
      w2.t.requestLeave();
      w2.director.busy = false;
      w2.director.tick();
      ok(pend1 === PSt.PENDING && w2.t.dialogs.length === 1, `leave-pending-entryB' (own press already pending, pressed twice more): ${w2.t.dialogs.length} dialog after the sequence`);
    }
    // (c) PENDING_CAP_MS: sequence never ends → forced pause at the cap opens the one dialog (logged).
    {
      const { t, director, clk: c } = await makeWorld();
      director.busy = true;
      t.requestLeave();
      for (let i = 0; i < 5; i++) { c.advance(1000); t.requestLeave(); director.tick(); }
      const before = t.dialogs.length;
      c.advance(capMs - 5000);
      director.tick();
      ok(before === 0 && t.dialogs.length === 1 && director.capLogs === 1 && t.dialogs[0].at - (50000) === capMs,
        `leave-pending-cap: mash 5×, no dialog before ${capMs} ms; forced stop at +${t.dialogs[0] && t.dialogs[0].at - 50000} ms opens exactly 1 (cap logged)`);
    }
    // (d) the sequence ended the match → pending dropped, no dialog, no 中退.
    {
      const { t, director } = await makeWorld();
      director.busy = true;
      t.requestLeave();
      director.endMatchDuringSequence();
      ok(t.dialogs.length === 0 && t.leavePending === false && curPrefStore.writes().length === 0, 'leave-pending-match-ended: request dropped, no dialog, no record');
    }
    // (e) cancel → normal resume (uniform shift ≥ grace), timers resume.
    {
      const { t, director, clk: c } = await makeWorld();
      const fired = [];
      t.timers.schedule(() => fired.push(c.now), 100);
      c.advance(20);
      t.requestLeave();
      c.advance(4000);
      const resumeAt = c.now;
      t.dialogs[0].opts.primaryButton.action();
      c.advance(2000);
      ok(director.state === PSt.RUNNING && director.resumes === 1 && fired.length === 1 && fired[0] - resumeAt === graceMs && audio.resumed === 1 && !t.leaveConfirmOpen,
        `leave-cancel: resumed via director, held page timer fired ${fired[0] - resumeAt} ms after resume (= RESUME_GRACE_MS), BGM resumed`);
    }
    // (④) startup race: background before Table listened → bindPause shows the paused layer at once.
    {
      const wr = await makeWorld();
      wr.t.unbindPause();
      wr.director.requestPause(PRs.BACKGROUND);
      const pausedBefore = audio.paused;
      wr.t.bindPause();
      ok(wr.t.pauseLayerOn === true && wr.t.pauseFromBackground === true && wr.t.timers.isPaused() && audio.paused === pausedBefore + 1,
        'startup-race: director PAUSED(background) before bindPause → Table appears paused (layer + bg note, timers + BGM frozen)');
      wr.t.resumeFromPauseLayer();
      ok(wr.director.state === PSt.RUNNING && wr.t.pauseLayerOn === false && !wr.t.timers.isPaused(), 'startup-race: 继续 resumes normally');
    }
    // (E) routing fails twice (replace rejects, no page to go back to) → state kept, unlocked, game resumes; retry writes no 2nd 中退.
    {
      const { t, director, engine, clk: c, RSx } = await makeWorld();
      routeMode = 'reject'; stackLen = 1; routerLog.back = 0;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      const kept = engine.toLobbyCalls === 0 && director.stopped === 0 && !t.calls.includes('teardown') && engine.snap.phase === PhaseE.TURN;
      ok(kept && !t.leaving && !t.homeRouting && !t.leaveConfirmOpen && director.state === PSt.RUNNING && RSx.recent().length === 1 && RSx.recent()[0].quit === true,
        `route-double-fail: replace ✗ + back ✗ → match kept (no teardown / no LOBBY), locks released, director ${director.state}; 中退 records=${RSx.recent().length}`);
      t.requestLeave();
      t.dialogs[1].opts.secondaryButton.action();
      await drainMicrotasks();
      ok(t.dialogs.length === 2 && RSx.recent().length === 1 && RSx.summaryNow().quits === 1, `route-double-fail retry: second confirm still ${RSx.recent().length} 中退 record (commitOnce dedup)`);
      routeMode = 'ok'; stackLen = 2;
      t.requestLeave();
      t.dialogs[2].opts.secondaryButton.action();
      await drainMicrotasks();
      ok(engine.toLobbyCalls === 1 && director.stopped === 1 && t.calls.includes('teardown') && t.leaving === true && RSx.recent().length === 1,
        'route-success after failures: teardown once (director stop, engine LOBBY), lock held, still 1 record');
      void c;
    }
    // (⑦) toLobbyOrBack hangs → 3000 ms timeout = failure → same fallback; a late rejection does not trigger back().
    {
      const { t, director, engine, clk: c } = await makeWorld();
      routeMode = 'lateReject'; stackLen = 2; routerLog.back = 0;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      c.advance(2999);
      await drainMicrotasks();
      const lockedAt2999 = t.leaving && t.homeRouting;
      c.advance(1);
      await drainMicrotasks();
      const releasedAt3000 = !t.leaving && !t.homeRouting && director.state === PSt.RUNNING && engine.toLobbyCalls === 0;
      routeHang.rej({ code: 1, message: 'late' });
      await drainMicrotasks();
      ok(lockedAt2999 && releasedAt3000 && routerLog.back === 0 && routerLog.errors.some((m) => m.includes('timed out')),
        `route-timeout: locked at 2999 ms, released at 3000 ms (state kept, game resumed); late rejection → back() calls=${routerLog.back}`);
      routeMode = 'ok';
    }
    // (⑫/⑥) timeout → unlocked & resumed → the router's late SUCCESS still removes the page → aboutToDisappear finishes the leave.
    {
      const { t, director, engine, clk: c, RSx } = await makeWorld();
      routeMode = 'lateResolve'; stackLen = 2; routerLog.back = 0;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      c.advance(3000);
      await drainMicrotasks();
      const timedOut = !t.leaving && director.state === PSt.RUNNING && engine.toLobbyCalls === 0 && director.stopped === 0;
      c.advance(1500); // player keeps playing; then the navigation lands late
      routeHang.res();
      await drainMicrotasks();
      const lateIgnored = engine.toLobbyCalls === 0 && director.stopped === 0; // RouteOnce: late success is not a second settlement
      t.aboutToDisappear(); // the page is being removed by that late navigation
      await tickIo();
      ok(timedOut && lateIgnored && director.stopped === 1 && engine.toLobbyCalls === 1 && engine.snap.phase === PhaseE.LOBBY &&
        RSx.recent().length === 1 && RSx.recent()[0].quit === true && RSx.summaryNow().quits === 1 && t.dialogs.length === 1 &&
        director.listeners.length === 0,
        `route-late-success: timeout unlock → late success → aboutToDisappear: director stopped=${director.stopped}, engine ${engine.snap.phase}, ` +
        `中退 records=${RSx.recent().length}, dialogs=${t.dialogs.length}`);
      routeMode = 'ok';
    }
    // Controls: page removed without any leave route → untouched; RECAP → Report after a timed-out leave → untouched.
    {
      const n1 = await makeWorld();
      n1.t.aboutToDisappear();
      const n2 = await makeWorld();
      routeMode = 'hang';
      n2.t.requestLeave();
      n2.t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      n2.clk.advance(3000);
      await drainMicrotasks();
      n2.engine.snap.phase = PhaseE.RECAP;
      n2.t.aboutToDisappear();
      routeMode = 'ok';
      ok(n1.director.stopped === 0 && n1.engine.toLobbyCalls === 0 && n2.director.stopped === 0 && n2.engine.toLobbyCalls === 0 && n2.engine.snap.phase === PhaseE.RECAP,
        'aboutToDisappear unchanged for normal page exits (no leave route; RECAP → Report after a timed-out leave)');
    }
    // (a) timeout unlock → player confirms again → the first (late) route lands: ONE navigation, ONE stop, ONE 中退; second success inert.
    for (const order of ['route-then-disappear', 'disappear-then-route']) {
      const { t, director, engine, clk: c, RSx } = await makeWorld();
      routeMode = 'lateResolve'; stackLen = 2; routerLog.replace = 0; routerLog.urls = []; routerLog.back = 0;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      c.advance(3000);
      await drainMicrotasks();
      t.requestLeave(); // unlocked → leave again
      t.dialogs[1].opts.secondaryButton.action();
      await drainMicrotasks();
      const replaceAfterRetry = routerLog.replace;
      if (order === 'route-then-disappear') {
        routeHang.res();
        await drainMicrotasks();
        t.aboutToDisappear();
      } else {
        t.aboutToDisappear();
        routeHang.res();
        await drainMicrotasks();
      }
      await tickIo();
      ok(replaceAfterRetry === 1 && routerLog.replace === 1 && routerLog.urls.every((u) => u === 'pages/Lobby') && routerLog.back === 0 &&
        director.stopped === 1 && engine.toLobbyCalls === 1 && RSx.recent().length === 1 && RSx.summaryNow().quits === 1 &&
        t.dialogs.length === 2 && audio.leaveRelease === 1,
        `route-retry-late-success (${order}): replace calls=${routerLog.replace} (no 2nd route, no Report), director.stop=${director.stopped}, ` +
        `engine.toLobby=${engine.toLobbyCalls}, 中退 records=${RSx.recent().length}, dialogs=${t.dialogs.length}, audio leave-release=${audio.leaveRelease}`);
      routeMode = 'ok';
    }
    // (b) a normal finish → RECAP → Report: no leave flag → new path skipped; record bytes and rank untouched; no extra 中退.
    {
      const { t, director, engine, RSx } = await makeWorld();
      engine.snap.phase = PhaseE.RECAP;
      engine.snap.endedAt = 60000;
      engine.snap.winnerSeatId = 1;
      engine.snap.seats[0].status = SStat.GHOST;
      engine.snap.seats[0].lives = 0;
      engine.snap.recap[0].aliveAtExit = 3;
      const wrote = RSx.commitOnce(engine.snap, { quit: false, isDemo: false, ff: false, pausedMs: 0 }); // director RECAP write
      await tickIo();
      const bytesBefore = curPrefStore.dump();
      const rankBefore = RSx.recent()[0].rank;
      t.aboutToDisappear();
      await tickIo();
      ok(wrote && t.leaveRouteIssued === false && curPrefStore.dump() === bytesBefore && RSx.recent().length === 1 && RSx.recent()[0].rank === rankBefore &&
        rankBefore === 3 && RSx.recent()[0].quit === false && RSx.summaryNow().quits === 0 && director.stopped === 0 && engine.toLobbyCalls === 0 &&
        engine.snap.phase === PhaseE.RECAP && audio.leaveRelease === 0,
        `recap-normal-exit: aboutToDisappear with no leave route → skipped; record bytes identical, rank ${rankBefore} unchanged, quits=0, director/engine untouched`);
    }
    // (c) audio on the late-success exit while paused: SFX players released, BGM released via leaveThenRelease, never resumed.
    {
      const { t, director, clk: c } = await makeWorld();
      routeMode = 'lateResolve'; stackLen = 2;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      c.advance(3000);
      await drainMicrotasks(); // timeout → resumed (BGM back in: game goes on)
      t.requestLeave(); // dialog #2 open → paused again (BGM fading out)
      const mark = audio.log.length;
      routeHang.res(); // the first route lands late while paused
      await drainMicrotasks();
      t.aboutToDisappear();
      const after = audio.log.slice(mark);
      ok(audio.spRelease === 1 && audio.daRelease === 1 && audio.leaveRelease === 1 && !after.includes('resume') &&
        after.indexOf('clearPause') < after.indexOf('leaveRelease'),
        `audio-exit-paused: SoundPlayer/DealAudio released, TableAudio.leaveThenRelease once, no resumeForGame after the pause (log after pause: ${after.join('>')})`);
      routeMode = 'ok';
    }
    // replace rejects but back() works → success path.
    {
      const { t, engine } = await makeWorld();
      routeMode = 'reject'; stackLen = 2; routerLog.back = 0;
      t.requestLeave();
      t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      ok(routerLog.back === 1 && engine.toLobbyCalls === 1 && t.leaving, 'route-back-fallback: replace ✗ → back() ✓ → teardown');
      routeMode = 'throw'; stackLen = 1;
      const w3 = await makeWorld();
      w3.t.requestLeave();
      w3.t.dialogs[0].opts.secondaryButton.action();
      await drainMicrotasks();
      ok(!w3.t.leaving && w3.engine.toLobbyCalls === 0, 'route-sync-throw + no back page → failure → unlocked, state kept');
      routeMode = 'ok';
    }
  }
}

// ---------------------------------------------------------------- ⑭ audio exit on the REAL TableAudio (fake SoundPool / AVPlayer / clock)
// Leaving: pendings cleared, BGM + SFX pool released; a loadComplete arriving after leaving replays nothing;
// paused before leaving → BGM never resumed / faded in.
const TA_TYPES = ['media.AVPlayer | null', 'media.SoundPool | null', 'common.UIAbilityContext | null', 'resourceManager.RawFileDescriptor',
  'media.AVPlayer', 'media.SoundPool', 'media.PlayParameters', 'media.AVFileDescriptor', 'common.UIAbilityContext', 'audio.AudioRendererInfo',
  'Promise<void>', 'Promise<number>', 'BusinessError', 'PlayStyle', 'number', 'void', 'string', 'boolean'];
const taJs = stripEts(src(E + 'features/table/TableAudio.ets'), TA_TYPES, []);
const makeFakeMedia = () => {
  // hold.pool / hold.player = true → the next create* stays pending until m.resolveHeld() (async prepare hanging).
  const m = { pools: [], players: [], hold: { pool: false, player: false }, held: [] };
  const gate = (kind, make) => {
    if (!m.hold[kind]) return Promise.resolve(make());
    m.hold[kind] = false;
    return new Promise((res) => { m.held.push(() => res(make())); });
  };
  m.resolveHeld = () => { const h = m.held.splice(0); for (const f of h) f(); };
  m.untilHeld = async () => { for (let i = 0; i < 2000 && m.held.length === 0; i++) await Promise.resolve(); return m.held.length; };
  m.live = () => m.pools.filter((x) => !x.released).length + m.players.filter((x) => !x.released).length;
  m.createSoundPool = () => gate('pool', () => {
    const p = { handlers: {}, nextId: 1, loaded: [], plays: [], released: false, releases: 0 };
    p.on = (ev, fn) => { p.handlers[ev] = fn; };
    p.load = async () => { const id = p.nextId++; p.loaded.push(id); return id; };
    p.play = async (id, prm) => { p.plays.push({ id, vol: prm.leftVolume }); return 1; };
    p.release = async () => { p.released = true; p.releases++; };
    p.emitAll = () => { for (const id of p.loaded) if (p.handlers.loadComplete) p.handlers.loadComplete(id); };
    m.pools.push(p);
    return p;
  });
  m.createAVPlayer = () => gate('player', () => {
    const pl = { handlers: {}, plays: 0, pauses: 0, vols: [], released: false, releases: 0, loop: false, _fd: null };
    pl.on = (ev, fn) => { pl.handlers[ev] = fn; };
    Object.defineProperty(pl, 'fdSrc', { set(v) { pl._fd = v; queueMicrotask(() => pl.handlers.stateChange && pl.handlers.stateChange('initialized')); }, get() { return pl._fd; } });
    pl.prepare = async () => { queueMicrotask(() => pl.handlers.stateChange && pl.handlers.stateChange('prepared')); };
    pl.play = async () => { pl.plays++; };
    pl.pause = async () => { pl.pauses++; };
    pl.setVolume = (v) => { pl.vols.push(v); };
    pl.release = async () => { pl.released = true; pl.releases++; };
    m.players.push(pl);
    return pl;
  });
  return m;
};
const loadTableAudio = async () => {
  const tclk = makeClock(1000);
  const fm = makeFakeMedia();
  const TA = (await importFresh(taJs, {
    media: fm, audio: { StreamUsage: { STREAM_USAGE_MUSIC: 1 }, AudioRendererRate: { RENDER_RATE_NORMAL: 0 } },
    SfxIds: new Proxy({}, { get: (_, k) => String(k) }), PlayStyle: enumObj('PlayStyle') || {},
    AudioSettings: { sfx01: (v) => v, bgm01: (v) => v, voice01: (v) => v, addListener: () => {} },
    Logger: { info: () => {}, warn: () => {}, error: () => {} }, ...clockStubs(tclk)
  })).TableAudio;
  const ctx = { resourceManager: { getRawFd: async () => ({ fd: 1, offset: 0, length: 10 }), closeRawFd: async () => {} } };
  TA.bind(ctx);
  return { TA, fm, tclk };
};
let taOk = true;
try {
  // Control: the deferred-replay mechanism really replays when we stay (so "no replay after leaving" is meaningful).
  {
    const { TA, fm } = await loadTableAudio();
    TA.playClaimSet(); // pool not ready → pending
    await TA.prepare();
    await drainMicrotasks();
    fm.pools[0].emitAll();
    ok(fm.pools[0].plays.length === 1, `audio control: staying on the table, a pending SFX replays on loadComplete (plays=${fm.pools[0].plays.length})`);
  }
  // Leave with a pending SFX: pendings cleared, pool + BGM player released; loadComplete after leaving → nothing.
  {
    const { TA, fm, tclk } = await loadTableAudio();
    TA.playClaimSet();
    await TA.prepare();
    await drainMicrotasks();
    TA.startBgm(TA.BGM_FADE_IN_MS);
    tclk.advance(2000);
    TA.leaveThenRelease();
    const pendingAfterLeave = TA.pendingClaim || TA.pendingBgm;
    tclk.advance(TA.BGM_FADE_OUT_MS + 100);
    await drainMicrotasks();
    fm.pools[0].emitAll(); // late loadComplete from the released pool
    const pl = fm.players[0];
    ok(!pendingAfterLeave && fm.pools[0].plays.length === 0 && fm.pools[0].released && pl.released && TA.bgmPlayer === null && TA.pool === null,
      `audio-exit-release: pendings cleared on leave; SFX pool released=${fm.pools[0].released}, BGM player released=${pl.released}; late loadComplete replays ${fm.pools[0].plays.length}`);
  }
  // Paused before leaving: BGM stays paused / at 0 — no play(), no volume > 0 after the pause, even if a stray resume arrives.
  {
    const { TA, fm, tclk } = await loadTableAudio();
    await TA.prepare();
    await drainMicrotasks();
    TA.startBgm(TA.BGM_FADE_IN_MS);
    tclk.advance(2000);
    const pl = fm.players[0];
    TA.pauseForGame();
    tclk.advance(TA.PAUSE_FADE_OUT_MS + 50);
    const plays0 = pl.plays;
    const vols0 = pl.vols.length;
    TA.clearGamePause(); // unbindPause on disappear
    TA.leaveThenRelease(); // finishLeaveOnce
    TA.resumeForGame(); // stray resume after leaving must be inert
    tclk.advance(3000);
    await drainMicrotasks();
    const later = pl.vols.slice(vols0);
    ok(plays0 >= 1 && pl.plays === plays0 && later.every((v) => v === 0) && pl.released,
      `audio-exit-paused-no-resume: paused BGM not resumed / faded in on leave (play() calls ${plays0}→${pl.plays}, volumes after pause ${JSON.stringify(later.slice(0, 4))}…), released`);
  }
  // ---- 负责人第 3 条遗留：async prepare 在 release 之后才返回 → 新建播放器 / 池立刻 release，不登记、不播放。
  // Control: the hold mechanism itself — a held createAVPlayer that resolves WITHOUT a release registers normally.
  {
    const { TA, fm, tclk } = await loadTableAudio();
    fm.hold.player = true;
    const pr = TA.prepare();
    const heldN = await fm.untilHeld();
    fm.resolveHeld();
    await pr;
    await drainMicrotasks();
    TA.startBgm(TA.BGM_FADE_IN_MS);
    tclk.advance(1000);
    await drainMicrotasks();
    const pl = fm.players[0];
    ok(heldN === 1 && pl !== undefined && TA.bgmPlayer === pl && pl.releases === 0 && pl.plays >= 1,
      `stale-prepare control: held createAVPlayer resolved without release → registered (held=${heldN}, plays=${pl ? pl.plays : -1}, releases=${pl ? pl.releases : -1})`);
  }
  // prepare hangs in createAVPlayer → release → createAVPlayer returns: that player released exactly once, 0 live, silent.
  {
    const { TA, fm, tclk } = await loadTableAudio();
    fm.hold.player = true;
    const pr = TA.prepare();
    const heldN = await fm.untilHeld();
    TA.startBgm(TA.BGM_FADE_IN_MS); // BGM wanted before the player exists → pendingBgm
    TA.release(); // page left while prepare is still hanging
    fm.resolveHeld(); // createAVPlayer returns after release
    await pr;
    await drainMicrotasks();
    tclk.advance(3000);
    await drainMicrotasks();
    const pl = fm.players[0];
    const sfxPlays = fm.pools.reduce((n, p) => n + p.plays.length, 0); // nothing after release
    ok(heldN === 1 && fm.players.length === 1 && pl.releases === 1 && fm.live() === 0 && pl.plays === 0 && sfxPlays === 0 &&
      TA.bgmPlayer === null && Object.keys(pl.handlers).length === 0 && pl._fd === null,
      `stale-prepare AVPlayer: prepare hung → release → createAVPlayer returns: player.release()=${pl ? pl.releases : -1} (exactly 1), live players=${fm.live()}, ` +
      `bgm play()=${pl ? pl.plays : -1}, sfx plays=${sfxPlays}, registered=${TA.bgmPlayer !== null}, handlers=${pl ? Object.keys(pl.handlers).length : -1}`);
    // No regression: the next prepare (new table) builds and registers a fresh player.
    await TA.prepare();
    await drainMicrotasks();
    ok(fm.players.length === 2 && TA.bgmPlayer === fm.players[1] && fm.players[1].releases === 0,
      'stale-prepare AVPlayer: next prepare after the stale one registers a fresh player (no regression)');
  }
  // prepare hangs in createSoundPool → release → pool returns: pool released once, no loads / listener, no AVPlayer made.
  {
    const { TA, fm, tclk } = await loadTableAudio();
    fm.hold.pool = true;
    const pr = TA.prepare();
    await fm.untilHeld();
    TA.playClaimSet();
    TA.release();
    fm.resolveHeld();
    await pr;
    await drainMicrotasks();
    tclk.advance(2000);
    const p = fm.pools[0];
    ok(fm.pools.length === 1 && p.releases === 1 && p.loaded.length === 0 && !p.handlers.loadComplete && fm.players.length === 0 &&
      fm.live() === 0 && TA.pool === null,
      `stale-prepare SoundPool: prepare hung → release → createSoundPool returns: pool.release()=${p.releases}, loads=${p.loaded.length}, AVPlayers created=${fm.players.length}, live=${fm.live()}`);
  }
} catch (e) {
  taOk = false;
  fail(`real TableAudio did not run in node: ${e.message}`);
}
// DealAudio (real file): same rule for its SoundPool.
{
  const DA_TYPES = ['media.SoundPool | null', 'common.UIAbilityContext | null', 'resourceManager.RawFileDescriptor', 'media.SoundPool',
    'media.PlayParameters', 'common.UIAbilityContext', 'audio.AudioRendererInfo', 'Promise<void>', 'Promise<number>', 'BusinessError',
    'number', 'void', 'string', 'boolean'];
  let daOk = true;
  try {
    const daJs = stripEts(src(E + 'features/table/DealAudio.ets'), DA_TYPES, []);
    const run = async (release) => {
      const fm = makeFakeMedia();
      const DA = (await importFresh(daJs, {
        media: fm, audio: { StreamUsage: { STREAM_USAGE_MUSIC: 1 }, AudioRendererRate: { RENDER_RATE_NORMAL: 0 } },
        SfxIds: new Proxy({}, { get: (_, k) => String(k) }), TableAudio: { isGamePaused: () => false },
        AudioSettings: { sfx01: (v) => v }, Logger: { info: () => {}, warn: () => {}, error: () => {} }
      })).DealAudio;
      DA.bind({ resourceManager: { getRawFd: async () => ({ fd: 1, offset: 0, length: 10 }), closeRawFd: async () => {} } });
      fm.hold.pool = true;
      const pr = DA.prepare();
      await fm.untilHeld();
      DA.playDealCard(); // pool not ready → pending
      if (release) DA.release();
      fm.resolveHeld();
      await pr;
      await drainMicrotasks();
      const p = fm.pools[0];
      if (p && p.handlers.loadComplete) p.emitAll();
      return { DA, fm, p };
    };
    const ctl = await run(false);
    ok(ctl.p.releases === 0 && ctl.p.plays.length === 1, `stale-prepare DealAudio control: held pool resolved without release → registered, pending deal replays (plays=${ctl.p.plays.length})`);
    const st = await run(true);
    ok(st.p.releases === 1 && st.fm.live() === 0 && st.p.plays.length === 0 && st.p.loaded.length === 0 && st.DA.pool === null,
      `stale-prepare DealAudio: prepare hung → release → createSoundPool returns: pool.release()=${st.p.releases}, live=${st.fm.live()}, plays=${st.p.plays.length}`);
  } catch (e) {
    daOk = false;
    fail(`real DealAudio did not run in node: ${e.message}`);
  }
  ok(daOk, 'real DealAudio.ets loaded in node (types stripped, fake media)');
}
// SoundPlayer / LobbyAudio: same generation rule (structural — release bumps gen; every awaited create checks it before registering).
{
  const sp = src(E + 'features/table/SoundPlayer.ets');
  const la = src(E + 'features/lobby/LobbyAudio.ets');
  const spRelB = code(body(sp, '  static release(): void {'));
  const laRelB = code(body(la, '  static release(): void {'));
  const spPrep = code(body(sp, '  private static async doPrepare(): Promise<void> {'));
  const spRend = code(body(sp, '  private static async prepareRenderers(gen: number): Promise<void> {'));
  const laBed = code(body(la, '  private static async prepareBed(isBgm: boolean, gen: number): Promise<void> {'));
  const laPrep = code(body(la, '  static async prepare(): Promise<void> {'));
  ok(/void \{\s*SoundPlayer\.gen = SoundPlayer\.gen \+ 1;\s*SoundPlayer\.inFlight = null;/.test(spRelB) &&
    /await media\.createSoundPool\([^)]*\);\s*if \(SoundPlayer\.gen !== gen\) \{[^}]*pool\.release\(\)/.test(spPrep) &&
    (spRend.match(/await SoundPlayer\.createSlotRenderer\([^)]*\);\s*if \(SoundPlayer\.gen !== gen\) \{\s*SoundPlayer\.releaseOneRenderer\(/g) || []).length === 2,
    'SoundPlayer: release() bumps gen + drops the in-flight prepare; a pool / renderer created after release is released, not registered');
  ok(/void \{\s*LobbyAudio\.gen = LobbyAudio\.gen \+ 1;/.test(laRelB) &&
    /await media\.createAVPlayer\(\);\s*if \(LobbyAudio\.gen !== gen\) \{\s*LobbyAudio\.dropStalePlayer\(player\);\s*return;/.test(laBed) &&
    /await media\.createSoundPool\([^)]*\);\s*if \(LobbyAudio\.gen !== gen\) \{[^}]*pool\.release\(\)/.test(laPrep),
    'LobbyAudio: release() bumps gen; an AVPlayer / pool created after release is released, not registered');
}
ok(taOk, 'real TableAudio.ets loaded in node (types stripped, fake media)');
const spRel = code(body(src(E + 'features/table/SoundPlayer.ets'), '  static release(): void {'));
const daSrc = src(E + 'features/table/DealAudio.ets');
ok(spRel.includes('SoundPlayer.pendingFlip = 0') && spRel.includes('SoundPlayer.pendingExt = 0') &&
  code(body(daSrc, '  static release(): void {')).includes('DealAudio.pending = 0') && /DealAudio\.pending > 0/.test(code(daSrc)),
  'SoundPlayer / DealAudio release() zero their deferred counters → a loadComplete after leaving replays nothing');
ok(/this\.unbindPause\(\);[\s\S]*?this\.finishLeaveIfRouted\(\);[\s\S]*?DealAudio\.release\(\);\s*SoundPlayer\.release\(\);/.test(atd),
  'aboutToDisappear order: unbindPause (clears pause flag, no resume) → finishLeaveIfRouted → DealAudio / SoundPlayer release');

// ---------------------------------------------------------------- ⑥ background + debug pause
ok(/onBackground\(\): void \{[\s\S]*?requestPause\(PauseReasons\.BACKGROUND\)/.test(ability), 'onBackground → auto pause');
ok(ability.includes('AudioSettings.init(this.context)') && ability.includes('RecordStore.init(this.context)'),
  'AudioSettings/RecordStore loaded at bootstrap');
const dps = code(body(debugBuild, '  static debugPauseShown(): boolean {'));
ok(dps.includes('info.appInfo.debug === true') && /catch \(err\) \{[\s\S]*?return false;/.test(dps),
  'DebugBuild.debugPauseShown = ApplicationInfo.debug, fail-closed');
const panel = body(table, '  debugLifePanel() {');
const pauseBtn = panel.indexOf("$r('app.string.lb_str_pause')");
ok(pauseBtn > 0 && panel.lastIndexOf('if (this.debugPauseOn)', pauseBtn) > 0 && !panel.includes('DebugBuild.debugPauseShown()'),
  'debug pause button mounted only under the cached debugPauseOn (Builder never calls getBundleInfoForSelfSync)');
const ata = code(body(table, '  aboutToAppear(): void {'));
ok(count(tableCode, /DebugBuild\.debugPauseShown\(\)/) === 1 && ata.includes('this.debugPauseOn = DebugBuild.debugPauseShown()') &&
  /private debugPauseOn: boolean = false;/.test(table), 'DebugBuild.debugPauseShown() read once in aboutToAppear into a private field (fail-closed default false)');
ok(count(tableCode, /PauseReasons\.USER/) === 1 &&
  /requestUserPause\(\): void \{\s*if \(!this\.debugPauseOn/.test(tableCode), 'USER pause only via guarded debug entry');
const ctlIds = src(E + 'common/Ids.ets');
const ID4 = { DEBUG_PAUSE: 'lb_btn_debug_pause', PAUSE_LAYER: 'lb_cmp_pause_layer', PAUSE_RESUME: 'lb_btn_pause_resume', PAUSE_BG_NOTE: 'lb_txt_pause_bg_note' };
for (const [k, v] of Object.entries(ID4)) {
  ok(ctlIds.includes(`static readonly ${k}: string = '${v}';`) && count(tableCode, new RegExp(`\\.id\\(ControlIds\\.${k}\\)`)) === 1,
    `ControlIds.${k} = '${v}' bound once in Table`);
}
const plIdx = panel.indexOf("$r('app.string.lb_str_pause')");
ok(/\.id\(ControlIds\.DEBUG_PAUSE\)/.test(panel.slice(plIdx, plIdx + 600)), 'debug pause Text carries .id(ControlIds.DEBUG_PAUSE)');
// ⑧ pause layer z-order: above every fly / chrome layer; mounted only while paused (no layout change otherwise).
const zNums = [...tableCode.matchAll(/\.zIndex\((\d+)\)/g)].map((m) => Number(m[1]));
const flyBase = /this\.flyZ = (\d+) \+ beat\.index;/.exec(tableCode);
const maxBeats = md.max_players * md.hand_size_default;
const flyMax = flyBase ? Number(flyBase[1]) + maxBeats : Infinity;
const plz = /const PAUSE_LAYER_Z: number = (\d+);/.exec(table);
ok(plz !== null && Number(plz[1]) > Math.max(flyMax, ...zNums) && /\.zIndex\(PAUSE_LAYER_Z\)/.test(code(body(table, '  pauseLayer() {'))) &&
  count(tableCode, /zIndex\(PAUSE_LAYER_Z\)/) === 1,
  `PAUSE_LAYER_Z=${plz && plz[1]} > every other zIndex (fly max ${flyMax} = ${flyBase && flyBase[1]} + ${md.max_players}×${md.hand_size_default}; literals ${zNums.join('/')})`);
ok(/if \(this\.pauseLayerOn\) \{\s*this\.pauseLayer\(\)\s*\}/.test(tableCode),
  'pause layer only mounted while pauseLayerOn (no layout / hit-test change when not paused)');
ok(/REVEAL_HOLD_MS\(3000\)/.test(table) && !/REVEAL_HOLD_MS\(5000\)/.test(table) &&
  /static readonly REVEAL_HOLD_MS: number = 3000;/.test(src(E + 'features/table/PlayFlyFx.ets')), 'REVEAL_HOLD_MS comment matches code (3000)');

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

// lb.settings (21 §4.2): namespace + keys, 0..100 step 5, default 100 / 100 / false.
const idsSrc = src(E + 'common/Ids.ets');
ok(/static readonly AUDIO: string = 'lb\.settings';/.test(idsSrc) && !idsSrc.includes("'lb.audio'"), "PersistNs.AUDIO = 'lb.settings' (no 'lb.audio', no migration)");
ok(settings.includes("static readonly KEY_BGM: string = 'vol_bgm';") && settings.includes("static readonly KEY_SFX: string = 'vol_sfx';") &&
  settings.includes("static readonly KEY_MUTED: string = 'mute_all';"), 'lb.settings keys vol_bgm / vol_sfx / mute_all');
ok(/DEFAULT_BGM: number = 100;/.test(settings) && /DEFAULT_SFX: number = 100;/.test(settings) && /LEVEL_STEP: number = 5;/.test(settings) &&
  /DEFAULT_MUTED: boolean = false;/.test(settings) && settings.includes('AudioSettings.bgm / AudioSettings.LEVEL_MAX'),
  'volume 0..100 step 5, defaults 100 / 100 / false; gain = level / 100');
ok(!/静默/.test(idsSrc.split('\n').slice(190, 215).join('\n')) && !/静默/.test(settings), '「静默」→「静音」 in Ids (settings block) / AudioSettings comments');
ok(/static readonly SILENT: string = 'lb_tog_silent';/.test(idsSrc), "ControlIds.SILENT = 'lb_tog_silent' unchanged (only the comments changed 静默→静音)");
{
  const recCode = code(records);
  const staticInitCalls = recCode.match(/^\s*(?:private |public )?static (?:readonly )?\w+\s*:[^=;\n]+=\s*[^;\n]*\w\s*\(/gm) || [];
  ok(staticInitCalls.length === 0 && /private static summary: RecordSummaryV1 \| null = null;/.test(recCode) &&
    /private static summaryRef\(\): RecordSummaryV1 \{\s*if \(RecordStore\.summary === null\) \{\s*RecordStore\.summary = RecordStore\.zeroSummary\(\);/.test(recCode),
    `RecordStore: no method call in any static initializer; summary lazy (null → summaryRef() on first use) (static-init calls=${staticInitCalls.length})`);
}
// Pause audio (负责人 G/H/I): BGM fade-out 150 ms then pause; resume fade-in 300 ms; no SFX while paused; deferred shots dropped / gained.
const ta = src(E + 'features/table/TableAudio.ets');
const sp2 = src(E + 'features/table/SoundPlayer.ets');
const da = src(E + 'features/table/DealAudio.ets');
const pfg = code(body(ta, '  static pauseForGame(): void {'));
ok(/static readonly PAUSE_FADE_OUT_MS: number = 150;/.test(ta) && pfg.includes('TableAudio.fadeBgm(TableAudio.bgmVol, 0, TableAudio.PAUSE_FADE_OUT_MS)') &&
  pfg.includes('TableAudio.clearPendingShots()') && pfg.includes('TableAudio.pendingBgm = false'),
  'pauseForGame: BGM fades to 0 over 150 ms (fadeBgm pauses at 0), pending shots cleared');
ok(/if \(toVol <= 0\) \{\s*player\.pause\(\)/.test(code(body(ta, '  private static fadeBgm(fromVol: number, toVol: number, fadeMs: number): void {'))),
  'fadeBgm to 0 ends in player.pause() (position kept, no stop / seek)');
ok(/static readonly RESUME_FADE_IN_MS: number = 300;/.test(ta) && code(body(ta, '  static resumeForGame(): void {')).includes('TableAudio.startBgm(TableAudio.RESUME_FADE_IN_MS)'),
  'resumeForGame: BGM fades back in over 300 ms');
const cps = code(body(ta, '  private static clearPendingShots(): void {'));
const pendFlags = [...new Set([...code(ta).matchAll(/private static (pending(?!Bgm)\w+): boolean = false;/g)].map((m) => m[1]))];
ok(pendFlags.length > 0 && pendFlags.every((f) => cps.includes(`TableAudio.${f} = false`)), `clearPendingShots resets all ${pendFlags.length} deferred-shot flags`);
ok(/if \(TableAudio\.gamePaused\) \{[\s\S]{0,120}return;/.test(code(body(ta, '  private static playShot(soundId: number, volume: number): void {'))) &&
  /if \(TableAudio\.gamePaused\) \{/.test(code(ta).slice(code(ta).indexOf('onLoaded'))) , 'TableAudio: playShot + onLoaded replay silent while paused');
ok(/if \(TableAudio\.isGamePaused\(\)\) \{[\s\S]{0,200}return;/.test(code(sp2)) && sp2.includes("import { TableAudio } from './TableAudio';"),
  'SoundPlayer.playNamed: no sound and no deferral while paused');
const dp = code(body(sp2, '  private static drainPending(isFlip: boolean): void {'));
ok(dp.includes('const paused: boolean = TableAudio.isGamePaused();') && dp.includes('AudioSettings.sfx01(SoundPlayer.VOL_FLIP)') &&
  dp.includes('AudioSettings.sfx01(SoundPlayer.VOL_EXTINGUISH)') && count(dp, /if \(paused \|\| \w+Gain <= 0\) \{\s*return;/) === 2 &&
  !/fireRenderer\(SoundPlayer\.VOL_|firePlay\([^)]*SoundPlayer\.VOL_/.test(dp),
  'SoundPlayer.drainPending: deferred flip / extinguish dropped while paused, replayed with SFX gain (no raw VOL_*)');
const ddc = code(body(da, '  static playDealCard(): void {'));
ok(/^[^{]*\{\s*if \(TableAudio\.isGamePaused\(\)\) \{\s*return;/.test(ddc) && /if \(TableAudio\.isGamePaused\(\)\) \{\s*return;\s*\}\s*for/.test(code(da)),
  'DealAudio: playDealCard + loadComplete replay silent while paused');

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
