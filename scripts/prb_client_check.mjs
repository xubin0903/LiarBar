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
 *  ⑮ 补丁轮 2（负责人 2026-10-07 夜）真跑：离局令牌（两趟 replace 都落地、两个大厅实例都走 aboutToAppear）/ 暂停层挂载位置 /
 *     暂停关出牌面板 + 两道出牌暂停门 / RecordStore 读一半抛错不覆盖原档 / SoundPlayer 暂停清 pending / 静音与 SFX=0 实际增益 /
 *     快速恢复 BGM / 150ms 淡出步数 / 真 MatchDirector 待停-封顶-恢复 + 真 MatchEngine.resumeClock
 *  ⑯ 补丁轮 3（负责人 2026-10-07 夜）真跑：pageGone（老趟落地、新趟卡住，销毁后不锁横屏 / 不重绑 avoidArea / 不恢复导演）/ 连打两局离局 /
 *     toTable 在途离局 HiLog / 存档三缺口 / lb.settings 读一半抛错 / 增益 0.5 主路径（SoundPlayer / TableAudio / LobbyAudio / 快恢复）/
 *     只渲染大厅 LobbyAudio.playIfIdle（慢到重起、快到不重播）
 *  ⑰ 进桌后大厅 BGM 淡出票（负责人 2026-10-08）真跑：大厅页 onPageHide 400ms 淡出后 pause / onPageShow → playIfIdle 恢复（同一组播放器）/
 *     连打两局 BGM play() = 回大厅次数 / 同代 prepare 失败可重试（建池、建床）/ await 期间并发 prepare 守卫 / 3 秒内二次离局
 * 破坏测试：python3 scripts/prb_break_tests.py（不是闸，不进闸清单）。
 * No git, no diff against origin/develop (负责人规则). Box has no DevEco — not CompileArkTS. 合入 ≠ 终验.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANY_ESOBJECT, findInCode, formatHits, stripComments, stripCommentsAndStrings } from './lib/ets_scan.mjs';
import { clockStubs, drainMicrotasks, importFresh, makeClock, stripEts } from './lib/ets_sim.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawSrc = (rel) => readFileSync(join(root, rel), 'utf8');
// 补丁轮 2 第 6 条：结构断言一律读去掉注释后的 .ets（规则只留在注释里不算数）；只有专查注释的两条用 rawSrc。
const src = (rel) => (rel.endsWith('.ets') ? stripComments(rawSrc(rel)) : rawSrc(rel));
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
// Tally: real-run (REAL .ets code executed in node) vs structural (source pattern) assertions; RUN(true/false) brackets the sim regions.
let RUNMODE = false;
const tally = { run: 0, struct: 0 };
const RUN = (on) => { RUNMODE = on; };
const pass = (m) => { tally[RUNMODE ? 'run' : 'struct']++; console.log('PASS', m); };
const ok = (c, m) => (c ? pass(m) : fail(m));
// A sim that throws (e.g. under a break-test mutation) must still end red with a FAIL line, not just a stack trace.
process.on('uncaughtException', (e) => { fail(`gate crashed (uncaught): ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`); process.exit(1); });
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
ok(/const routed: boolean = await LbRouter\.toLobbyOrBack\(\);\s*if \(this\.pageGone\) \{[^{}]*return;\s*\}\s*if \(!routed\) \{\s*this\.releaseLeaveLock\(\);\s*return;\s*\}\s*this\.teardownAfterRoute\(\);/.test(ur) &&
  !/(leaving|homeRouting|leaveConfirmOpen) = false/.test(ur), 'goHome routing: await toLobbyOrBack(); false → unlock only; true → teardown');
const tda = code(body(table, '  private teardownAfterRoute(): void {'));
// ⑯ 补丁轮 3 第 1 条：pageGone——aboutToDisappear 置真、永不复位；await 之后 / releaseLeaveLock / teardownAfterRoute 开头各判一次（真跑见 leave-pageGone）。
{
  const atd0 = code(body(table, '  aboutToDisappear(): void {'));
  const rel0 = code(body(table, '  private releaseLeaveLock(): void {'));
  ok(/private pageGone: boolean = false;/.test(tableCode) && count(tableCode, /this\.pageGone = true/) === 1 && atd0.includes('this.pageGone = true') &&
    !/this\.pageGone = false/.test(tableCode) && /^[^{]*\{\s*if \(this\.pageGone\) \{[^{}]*return;\s*\}/.test(rel0) &&
    /^[^{]*\{\s*if \(this\.pageGone\) \{[^{}]*return;\s*\}/.test(tda) && count(tableCode, /if \(this\.pageGone\)/) === 3,
    'pageGone: set once in aboutToDisappear (never reset); guards right after the routing await and first in releaseLeaveLock / teardownAfterRoute');
}
const flo = code(body(table, '  private finishLeaveOnce(why: string): boolean {'));
ok(/if \(!this\.finishLeaveOnce\(/.test(tda) && tda.indexOf('this.finishLeaveOnce(') < tda.indexOf('this.timers.cancelAll()') &&
  count(tableCode, /this\.teardownAfterRoute\(\)/) === 1, 'teardown only after a successful route, through finishLeaveOnce (second success = no side effect)');
ok(/^[^{]*\{\s*if \(!LbRouter\.claimLeaveFinish\(\)\) \{\s*return false;\s*\}/.test(flo) && !/leaveFinished/.test(tableCode) && flo.includes('AppRuntime.director.stop()') &&
  flo.includes('AppRuntime.engine.toLobby()') && flo.indexOf('TableAudio.clearGamePause()') < flo.indexOf('TableAudio.leaveThenRelease()') &&
  !/resumeForGame|startBgm/.test(flo) && count(tableCode, /AppRuntime\.director\.stop\(\)/) === 1 && count(tableCode, /AppRuntime\.engine\.toLobby\(\)/) === 1 &&
  count(tableCode, /this\.finishLeaveOnce\(/) === 2,
  'finishLeaveOnce: once-only via LbRouter.claimLeaveFinish() (leave-session token, not a Table field) → director.stop + engine LOBBY + audio leaveThenRelease (no BGM resume); the only stop/toLobby in Table');
ok(/static toTable\(\): Promise<boolean> \{\s*if \(LbRouter\.tripsInFlight > 0\) \{\s*Logger\.warn\('LbRouter',[^;]*\);\s*\}\s*LbRouter\.beginLeaveSession\(\);/.test(lbRouter) &&
  count(code(lbRouter), /LbRouter\.tripsInFlight = /) === 2,
  'toTable: one HiLog warn when a leave replace is still in flight (tripsInFlight: +1 on issue, −1 when the router settles), then a new leave session');
{ // 页栈小修（负责人第 4 条）：不用 RouterMode.Single、不新增 router.back（仍是改前那 3 处：toLobbyOrBack 退路 / replace(LOBBY) 退路 / back()）；
  // router.clear() 只在 LbRouter.clearBelowLobby 一处，Lobby 只在 begin() 的非冷启动分支调它一次。
  const lobbyCode = code(src(E + 'pages/Lobby.ets'));
  const lrCode = code(lbRouter);
  const beginBody = body(src(E + 'pages/Lobby.ets'), '  private async begin(): Promise<void> {');
  ok(!/RouterMode/.test(lrCode + lobbyCode) && count(lrCode, /router\.back\(\)/) === 3 && !/router\.back\(/.test(lobbyCode) && count(lrCode, /router\.clear\(\)/) === 1 &&
    !/router\.clear\(/.test(lobbyCode) && count(lobbyCode, /LbRouter\.clearBelowLobby\(\)/) === 1 &&
    /\} else \{\s*this\.startReturnEnter\(\);[\s\S]*?LbRouter\.clearBelowLobby\(\);\s*\}/.test(beginBody),
    `pagestack: no RouterMode, router.back() in LbRouter stays ${count(lrCode, /router\.back\(\)/)} (pre-existing), none in Lobby; router.clear() ×${count(lrCode, /router\.clear\(\)/)} ` +
    `only in LbRouter.clearBelowLobby, called once from Lobby.begin() non-cold branch`);
}
const tlb = body(lbRouter, '  static toLobbyOrBack(timeoutMs: number = LbRouter.LEAVE_ROUTE_TIMEOUT_MS): Promise<boolean> {');
ok(/if \(trip !== null && now - trip\.issuedAtMs >= timeoutMs\) \{/.test(tlb) && count(lbRouter, /router\.replaceUrl\(\{ url: PageUrls\.LOBBY, params: params \}\)/) === 1 &&
  /params\.lbLeaveTicket = LbRouter\.leaveSeq;/.test(tlb),
  'toLobbyOrBack: in-flight leave replace ≥ 3000 ms is voided → the next confirmed leave issues a new replaceUrl carrying the next ticket (no auto re-send)');
ok(/static readonly LEAVE_ROUTE_TIMEOUT_MS: number = 3000;/.test(lbRouter) &&
  tlb.includes('once.settle(true, `replace #${ticket}`)') && tlb.includes("once.settle(LbRouter.tryBack(), 'back')") && tlb.includes("once.settle(false, 'timeout')"),
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
  /doubtedCount: number;/.test(types) && /caughtCount: number;/.test(types), 'doubted / caught from RecapRow (engine derives it from playLog)');
// 结算面板 PR（21 §1.3）：六个逐座计数器逐值对拍后删除，RecapRow 全部由 playLog.tally() 推出（被质疑 / 被识破 = 裁定写入时的出牌者座）。
ok(!/\b(?:playCounts|fakeHandCounts|challengeCounts|doubtedCounts|caughtCounts|bumpSeatCount)\b|this\.challengeHits\b/.test(code(engine)) &&
  /const t: PlayLogTally = this\.playLog\.tally\(this\.seats\[i\]\.seatId\);/.test(engine) &&
  /doubtedCount: t\.doubted,/.test(engine) && /caughtCount: t\.caught,/.test(engine) && /challengeHits: t\.doubtHits,/.test(engine),
  'engine: old per-seat counters removed; buildRecap reads playLog.tally() (doubted / caught at applyJudged, actor seat)');
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
RUN(true);
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
RUN(false);
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
RUN(true);
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
  // ⑮ 补丁轮 2 第 3 段：getPreferences 成功但某个 get 抛错 → store 不挂、未载入不写盘；下次 commitOnce 不拿 1 条列表覆盖原档。
  {
    const origData = new Map(curPrefStore.data);
    const origDump = curPrefStore.dump();
    const mkBroken = (throwKey) => {
      curPrefStore = makePrefStore(Object.fromEntries(origData));
      const get0 = curPrefStore.get;
      curPrefStore.get = async (k, d) => { if (k === throwKey) { throw new Error(`get ${k} failed`); } return get0(k, d); };
    };
    let allSame = true;
    const perKey = [];
    for (const key of ['recent_v1', 'summary_v1', 'last_match_id']) {
      mkBroken(key);
      const RSb = await loadRecordStore();
      await RSb.init({});
      const w = RSb.commitOnce(mkSnap(`m-${T0 + 77}`, SS.ALIVE, 0), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
      await tickIo();
      const same = curPrefStore.dump() === origDump && curPrefStore.writes().length === 0;
      allSame = allSame && same;
      perKey.push(`${key}:commit=${w},writes=${curPrefStore.writes().length}`);
    }
    // control: same data, no throw → the next commitOnce does write (so "no write" above is the fix, not a dead store)
    curPrefStore = makePrefStore(Object.fromEntries(origData));
    const RSc = await loadRecordStore();
    await RSc.init({});
    RSc.commitOnce(mkSnap(`m-${T0 + 78}`, SS.ALIVE, 0), { quit: false, isDemo: false, ff: false, pausedMs: 0 });
    await tickIo();
    const ctlRecent = JSON.parse(curPrefStore.data.get('recent_v1') || '[]');
    ok(allSame && ctlRecent.length === JSON.parse(origData.get('recent_v1') || '[]').length + 1,
      `RecordStore.init get throws → original save byte-identical after commitOnce (${perKey.join('; ')}); control without throw appends (recent ${ctlRecent.length})`);
  }
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
RUN(false);
// Both entry points go through commitOnce; no other writer of the three keys.
const reportSrc = src(E + 'pages/Report.ets');
const rpa = code(body(reportSrc, '  aboutToAppear(): void {'));
ok(/if \(snap\.phase === Phase\.RECAP\) \{[\s\S]*?quit: false,\s*isDemo: AppRuntime\.engine\.isDemoMatch\(\),\s*ff: false,\s*pausedMs: pausedMs\s*\}/.test(rpa) &&
  count(rpa, /AppRuntime\.engine\.pausedTotalAt\(/) === 1 &&
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

RUN(true);
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
      want: { ids: '', total: 10, last: '' } },
    // ⑮ 补丁轮 2 第 3 段追加（21:320 / 21:322，ed6dd0e）
    { name: 'record self-contradictory: WIN but rank≠1 → that record dropped (21:320)',
      init: { recent_v1: S([A, goodRec('m-w2', { result: 'WIN', rank: 2, livesLeft: 1 }), C]), summary_v1: S(SUM_OK), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 10, last: 'm-a' } },
    { name: 'summary impossible: total below recomputed from valid records → recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 1, wins: 1, quits: 0, doubts: 20, doubtHits: 8 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'summary impossible: wins / doubtHits below recomputed → recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 10, wins: 0, quits: 1, doubts: 20, doubtHits: 1 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'summary impossible: wins+quits > total → recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 5, wins: 3, quits: 3, doubts: 20, doubtHits: 8 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'no false kill: summary above recomputed (older matches beyond the 20-record window) → kept, not recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 40, wins: 12, quits: 5, doubts: 90, doubtHits: 30 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 40, wins: 12, quits: 5, doubts: 90, last: 'm-a' } },
    // ⑯ 补丁轮 3 第 3 条（测试小缺口）：quits、doubts 各自单独低于重算值也要重算（其余字段都合法、都不低）。
    { name: 'summary impossible: only quits below recomputed → recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 10, wins: 3, quits: 0, doubts: 20, doubtHits: 8 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } },
    { name: 'summary impossible: only doubts below recomputed → recomputed (21:322)',
      init: { recent_v1: S([A, C]), summary_v1: S({ v: 1, total: 10, wins: 3, quits: 1, doubts: 3, doubtHits: 2 }), last_match_id: 'm-a' },
      want: { ids: 'm-a,m-c', total: 2, wins: 1, quits: 1, doubts: 4, last: 'm-a' } }
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
  // ⑯ 补丁轮 3 第 3 条：汇总和明细都坏（内存清空 = 新玩家）之后的下一次 commitOnce 单独真跑：照常写 1 条、汇总 total=1、last_match_id 落成新局。
  {
    const bothBad = cases[10];
    const pre = await runLoad(bothBad.init);
    const preMem = pre.R ? { n: pre.R.recent().length, total: pre.R.summaryNow().total, last: pre.R.lastMatchId, loaded: pre.R.isLoaded() } : null;
    const p4 = await after(bothBad.init, 1, 1);
    ok(bothBad.name.startsWith('summary + recent both bad') && preMem !== null && preMem.n === 0 && preMem.total === 0 && preMem.last === '' && preMem.loaded === true &&
      pre.writes.length === 0 && p4.wrote && p4.writes.includes('flush') && p4.rec.length === 1 && p4.rec[0] !== null && p4.rec[0].matchId === 'm-next' && p4.sum.v === 1 &&
      p4.sum.total === 1 && p4.sum.wins === 1 && p4.sum.quits === 0 && p4.last === 'm-next',
      `S21-47 both bad → cleared in memory (recent=${preMem && preMem.n}, total=${preMem && preMem.total}, last='${preMem && preMem.last}', loaded=${preMem && preMem.loaded}, read writes=${pre.writes.length}) ` +
      `→ next commitOnce writes normally: recent=${p4.rec.length} [${p4.rec.map((x) => (x && x.matchId) || String(x)).join(',')}] summary total=${p4.sum.total} wins=${p4.sum.wins} last_match_id=${p4.last}`);
  }
  // S21-47 红例「last_match_id 坏导致写入崩」：坏 last_match_id 载入后下一次 commitOnce 照常写入、不抛、last_match_id 落成新局。
  const lastRows = [];
  let lastOk = true;
  for (const [lbl, lm] of [['42', 42], ['empty', ''], ['unknown', 'm-zzz'], ['missing', undefined], ['true', true]]) {
    const init = { recent_v1: S([A, C]), summary_v1: S(SUM_OK) };
    if (lm !== undefined) { init.last_match_id = lm; }
    let pr = null;
    let err = '';
    try { pr = await after(init, 11, 3); } catch (e) { err = e.message; }
    const good = pr !== null && pr.wrote && pr.writes.includes('flush') && pr.last === 'm-next' && pr.rec.length === 3 && pr.sum.total === 11;
    lastOk = lastOk && good;
    lastRows.push(`${lbl}:${pr === null ? 'threw ' + err : `wrote=${pr.wrote},last=${pr.last},recent=${pr.rec.length}`}`);
  }
  ok(lastOk, `S21-47 bad last_match_id → next commitOnce writes normally (no crash): ${lastRows.join(' | ')}`);
}
RUN(false);
ok(!/persist\(\)/.test(code(body(records, '  static loadFrom(rawRecent: preferences.ValueType, rawSummary: preferences.ValueType, rawLast: preferences.ValueType): boolean {'))) &&
  !/\.(?:delete|deleteSync|clear|clearSync)\(/.test(code(records)), 'RecordStore: loadFrom never persists; no delete / clear anywhere');

RUN(true);
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
// ⑯ 补丁轮 3 第 3 条：getPreferences 成功、某个 get 中途抛错 → 三键全回默认 100 / 100 / false，存档字节不变（不 put / flush / delete）。
{
  const rows = [];
  let good = true;
  for (const key of ['vol_bgm', 'vol_sfx', 'mute_all']) {
    asStore = makePrefStore({ vol_bgm: 40, vol_sfx: 20, mute_all: true });
    const before = asStore.dump();
    const get0 = asStore.get;
    asStore.get = async (k, d) => { if (k === key) { throw new Error(`get ${k} failed`); } return get0(k, d); };
    const AS = await loadAudioSettings();
    AS.setBgmLevel(40); AS.setSfxLevel(20); AS.setMuted(true); // stale in-memory values before init (no store yet → nothing written)
    await AS.init({});
    await tickIo();
    const r = AS.bgm === 100 && AS.sfx === 100 && AS.muted === false && asStore.writes().length === 0 && asStore.dump() === before;
    good = good && r;
    rows.push(`${key} throws: ${AS.bgm}/${AS.sfx}/${AS.muted} writes=${asStore.writes().length} bytesSame=${asStore.dump() === before}`);
  }
  ok(good, `lb.settings one get throws midway → all three back to 100/100/false, stored bytes unchanged: ${rows.join(' | ')}`);
}
ok(asNoWrite, `lb.settings read never writes: ${AUDIO_CASES.length} loads → 0 put / flush / delete, bytes identical`);
RUN(false);
ok(!/persist\(\)/.test(code(body(settings, '  static async init(context: common.UIAbilityContext): Promise<void> {'))), 'AudioSettings.init never persists');

RUN(true);
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

const makeFakeMedia = () => {
  // hold.pool / hold.player = true → the next create* stays pending until m.resolveHeld() (async prepare hanging).
  // fail.pool / fail.player = n → the next n create* reject (prepare failure); delay.pool / delay.player = ms → create* resolves that much
  // later on the world's fake clock (m.clock, set by makeLeaveWorld) — an await window for a concurrent prepare().
  const m = { pools: [], players: [], hold: { pool: false, player: false }, held: [], fail: { pool: 0, player: 0 }, delay: { pool: 0, player: 0 },
    clock: null, calls: { pool: 0, player: 0 }, failed: { pool: 0, player: 0 } };
  const gate = (kind, make) => {
    m.calls[kind]++;
    if (m.fail[kind] > 0) { m.fail[kind]--; m.failed[kind]++; return Promise.reject(new Error(`fake create ${kind} failed`)); }
    if (m.delay[kind] > 0 && m.clock) { const ms = m.delay[kind]; return new Promise((res) => { m.clock.setTimeout(() => res(make()), ms); }); }
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
    const pl = { handlers: {}, plays: 0, pauses: 0, vols: [], acts: [], released: false, releases: 0, loop: false, _fd: null };
    pl.on = (ev, fn) => { pl.handlers[ev] = fn; };
    Object.defineProperty(pl, 'fdSrc', { set(v) { pl._fd = v; queueMicrotask(() => pl.handlers.stateChange && pl.handlers.stateChange('initialized')); }, get() { return pl._fd; } });
    pl.prepare = async () => { queueMicrotask(() => pl.handlers.stateChange && pl.handlers.stateChange('prepared')); };
    pl.play = async () => { pl.plays++; pl.acts.push('play'); };
    pl.pause = async () => { pl.pauses++; pl.acts.push('pause'); };
    pl.stop = async () => { pl.acts.push('stop'); };
    pl.setVolume = (v) => { pl.vols.push(v); pl.acts.push(`vol:${v}`); };
    pl.seek = (ms) => { pl.acts.push(`seek:${ms}`); };
    pl.reset = async () => { pl.acts.push('reset'); };
    pl.release = async () => { pl.released = true; pl.releases++; };
    m.players.push(pl);
    return pl;
  });
  return m;
};
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
  '  private finishLeaveIfRouted(): void {', '  private finishLeaveOnce(why: string): boolean {', '  private cancelPlaySheet(): void {',
  '  private beginHumanPlay(style: PlayStyle, namedSeatId: number): void {', '  private async closePeek(): Promise<void> {'];
const missingSigs = TABLE_SIGS.filter((sg) => body(table, sg).length === 0);
ok(missingSigs.length === 0, `Table harness: all ${TABLE_SIGS.length} methods found (${missingSigs.join(' | ') || 'ok'})`);
const TABLE_TYPES = ['AlertDialogParamWithButtons', 'MatchSnapshot | null', 'RecordCommit', 'PauseListener', 'PauseState', 'common.UIAbilityContext',
  'PlayStyle', 'window.Window', 'boolean', 'number', 'string'];
const tableMethodsJs = stripEts(TABLE_SIGS.map((sg) => body(table, sg) + '\n  }\n').join('\n'), TABLE_TYPES, ['common.UIAbilityContext']);
const harnessJs = `class TableHarness {
  constructor() {
    this.leaving = false; this.leaveConfirmOpen = false; this.leavePending = false; this.homeRouting = false;
    this.pauseLayerOn = false; this.pauseFromBackground = false; this.lastHudStamp = ''; this.debugPauseOn = false;
    this.challengeTickId = -1; this.challengeDeadlineMs = 0; this.pauseListener = null; this.revealTimer = -1; this.choiceActTimer = -1;
    this.revealForChallengeId = ''; this.choiceActForChallengeId = ''; this.leaveRouteIssued = false; this.leaveFinished = false; this.pollId = -1; this.hintTimer = -1;
    this.timers = new PausableScheduler(); this.dialogs = []; this.calls = [];
    this.showPlay = false; this.showPeek = false; this.selectedIds = []; this.confirmBusy = false; this.challengeEntryOn = false;
    this.challengeCommitBusy = false; this.emptySafeEntryOn = false; this.playEnabled = true; this.confirmBarOn = false; this.roundWinOn = false;
    this.selfCards = []; this.namedSeatId = -1; this.hiddenCardIds = []; this.playFlyCount = 0; this.playFlySeat = 0; this.playFlyPlayId = '';
  }
  flashHint(k) { this.calls.push('hint' + k); } copyCards(x) { return [...x]; } copyIds(x) { return [...x]; } noteSfx() {}
  kickPlayFly() { this.calls.push('fly'); } onPlayRollback() { this.calls.push('rollback'); } refreshPlayMeta() {}
  getUIContext() { return { showAlertDialog: (o) => { this.dialogs.push({ at: Date.now(), busy: AppRuntime.director.busy, opts: o }); } }; }
  pull() { this.calls.push('pull'); }
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
  const routerLog = { replace: 0, back: 0, errors: [], warns: [] };
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
    getLength: () => String(stackLen),
    getParams: () => undefined,
    getState: () => ({ index: stackLen, name: 'Table', path: 'pages/' })
  };
  const routeHang = { rej: null, res: null };
  const routerJs = stripEts(lbRouter, ['Promise<void> | null', 'Promise<void>', 'RouteOnce', 'BusinessError', 'Error', 'LeaveTrip | null', 'LeaveTrip',
    'LeaveRouteParams', 'Object | undefined', 'router.RouterState', 'common.UIAbilityContext', 'number', 'boolean', 'string'],
    ['BusinessError', 'LeaveRouteParams', 'common.UIAbilityContext']);
  let audio = null;
  const makeWorld = async (rtr = fakeRouter) => {
    const wclk = makeClock(50000);
    const director = new FakeDirector(wclk);
    curPrefStore = makePrefStore();
    const RSx = await loadRecordStore();
    await RSx.init({});
    // 页栈小修：LbRouter 自己的竖屏锁（replace(TABLE) 失败回落）走 orient.lockPortrait（makeLeaveWorld 接到 lw.log），默认立即成功。
    const orient = { lockPortrait: null };
    const LbR = (await importFresh(routerJs, { router: rtr, PageUrls: { LOBBY: 'pages/Lobby', TABLE: 'pages/Table', REPORT: 'pages/Report' },
      Logger: { info: () => {}, warn: (t, m) => routerLog.warns.push(m), error: (t, m) => routerLog.errors.push(m) },
      WindowOrientation: { lockPortrait: (c) => (orient.lockPortrait ? orient.lockPortrait(c) : Promise.resolve()) }, getContext: () => ({}),
      ...clockStubs(wclk) })).LbRouter;
    const Sch = (await importFresh(stripEts(sched, ['TimerEntry[]', 'TimerEntry | null', 'TimerEntry', 'number', 'boolean']), clockStubs(wclk))).PausableScheduler;
    audio = { paused: 0, resumed: 0, cleared: 0, leaveRelease: 0, spRelease: 0, daRelease: 0, spPause: 0, launch: 0, log: [] };
    const engine = {
      toLobbyCalls: 0,
      snap: { matchId: 'm-777', startedAt: 49000, endedAt: 0, roundIndex: 2, winnerSeatId: -1, phase: PhaseE.TURN, eventLog: [],
        seats: [{ seatId: 0, role: SRole.HUMAN, aiPersona: '', lives: 2, status: SStat.ALIVE }, { seatId: 1, role: SRole.AI, aiPersona: 'AI_SHARK', lives: 1, status: SStat.ALIVE },
          { seatId: 2, role: SRole.AI, aiPersona: 'AI_KAREN', lives: 1, status: SStat.ALIVE }],
        recap: [0, 1, 2].map((i) => ({ seatId: i, nickname: `s${i}`, playCount: 2, fakeHandCount: 0, challengeCount: 0, challengeHits: 0, doubtedCount: 0, caughtCount: 0, aliveAtExit: 0 })) },
      current() { return this.snap; }, toLobby() { this.toLobbyCalls++; this.snap.phase = PhaseE.LOBBY; },
      isDemoMatch: () => false, pausedTotalAt: () => 0,
      cancelPlayCalls: 0, submitPlayCalls: 0, cancelPlay() { this.cancelPlayCalls++; return true; },
      submitPlay() { this.submitPlayCalls++; return true; }
    };
    engine.snap.config = { min_play_cards: 1, max_play_cards: 3 };
    engine.snap.lastPlay = null;
    const mod = await importFresh(harnessJs, {
      AppRuntime: { director, engine }, PauseState: PSt, PauseReasons: PRs, PENDING_CAP_MS: capMs, Phase: PhaseE, SeatRole: SRole, SeatStatus: SStat,
      TableAudio: { pauseForGame: () => { audio.paused++; audio.log.push('pause'); }, resumeForGame: () => { audio.resumed++; audio.log.push('resume'); },
        clearGamePause: () => { audio.cleared++; audio.log.push('clearPause'); }, leaveThenRelease: () => { audio.leaveRelease++; audio.log.push('leaveRelease'); },
        playPlayLaunch: () => { audio.launch++; } },
      Logger: { info: () => {}, warn: () => {}, error: () => {} }, LbRouter: LbR, RecordStore: RSx, WindowOrientation: { lockPortrait: async () => {} },
      getContext: () => ({}), DialogAlignment: { Center: 'Center' }, $r: (k) => k, TAG: 'Table', PausableScheduler: Sch, ...clockStubs(wclk),
      clearInterval: () => {}, DealAudio: { release: () => { audio.daRelease++; } },
      SoundPlayer: { release: () => { audio.spRelease++; }, pauseForGame: () => { audio.spPause++; } },
      window: { getLastWindow: async () => ({}) }, PeekPrivacyAdapter: { setEnabled: async (w, on) => { audio.log.push(`privacy:${on}`); } },
      SfxIds: new Proxy({}, { get: (_, k) => String(k) }), TableCompass: { BOTTOM: 'BOTTOM' }
    });
    const t = new mod.TableHarness();
    t.bindPause();
    return { t, director, engine, clk: wclk, RSx, LbR, orient };
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
    // ⑮ 补丁轮 2 · 离局令牌（负责人 A / 第 5 段）：两趟 replace 都真落地。router 模型维护页栈，每次落地都新建一个大厅实例：
    // 新大厅 aboutToAppear 与被换掉那页的 aboutToDisappear 两种先后都跑（ArkUI 文档两种说法都有，不赌顺序）。
    // 真 LbRouter + 真 Table 方法 + 真 Lobby 方法（aboutToAppear / begin / hydrate / startReturnEnter / renderOnly / aboutToDisappear）
    // + 真 LobbyAudio（假 media，数 BGM 播放器 play()）+ 真 RecordStore。只数实际效果（引擎 resetToLobby / LobbyAudio 建池 / BGM play()），不数回调。
    const lobbyText = src(E + 'pages/Lobby.ets');
    const LOBBY_SIGS = ['  aboutToAppear(): void {', '  aboutToDisappear(): void {', '  private async renderOnly(): Promise<void> {',
      '  private async lockPortraitSoft(): Promise<void> {', '  private async begin(): Promise<void> {', '  private startColdBoot(): void {',
      '  private startReturnEnter(): void {', '  private arm(delayMs: number, fn: () => void): void {', '  private clearTimers(): void {',
      '  private async hydrate(): Promise<void> {', '  private async hydrateView(): Promise<void> {', '  onPageHide(): void {', '  onPageShow(): void {',
      '  private tryEnterTable(): void {', '  private async rollbackTablePush(): Promise<void> {', '  private async lockThenPeekTable(): Promise<void> {'];
    const missingLobby = LOBBY_SIGS.filter((sg) => body(lobbyText, sg).length === 0);
    ok(missingLobby.length === 0, `Lobby harness: all ${LOBBY_SIGS.length} lifecycle methods found (${missingLobby.join(' | ') || 'ok'})`);
    const lobbyJs = stripEts(LOBBY_SIGS.map((sg) => body(lobbyText, sg) + '\n  }\n').join('\n'),
      ['common.UIAbilityContext', 'BootMarks', 'AnimateParam', 'LastTable', 'StartMatchOpts', 'number', 'boolean', 'string'], ['common.UIAbilityContext']);
    const lobbyHarnessJs = `class LobbyHarness {
  constructor(name) {
    Object.assign(this, { name, nickname: '', playerCount: 0, silent: false, bootReady: false, splashOpacity: 0, lobbyBgOpacity: 1, loadOpacity: 0,
      loadValue: 0, idleOpacity: 0, announceOpacity: 0, greetOpacity: 0, topbarOpacity: 0, topbarY: 12, topbarScale: 0.96, cardOpacity: 0, cardY: 12,
      cardScale: 0.96, ctaOpacity: 0, ctaY: 12, ctaEnterScale: 0.96, peekOpacity: 0, peekY: 12, peekScale: 0.96, timerIds: [], loopsAlive: false,
      idleLoopAlive: false, layerMs: 0, lobbyInit: true, lobbyKey: 0, appeared: false, matchLoading: false, matchBusy: false, matchLoadAxisDone: false,
      matchLoadPersistDone: false });
  }
  revealDealerIdle() {} crossToAnnounce() {} showGreet() {} crossBackIdle() {} playStagger() {}
  enableCta() { this.bootReady = true; } startIdleLoop() {} pulseBreath() {} pulseCandle() {} pulseDust() {} pulseCtaGlow() {} pulseTopbar() {}
${lobbyJs}
}
export { LobbyHarness };`;
    const LB = (await importFresh(stripEts(src(E + 'features/lobby/LobbyBoot.ets'), ['BootMarks', 'number', 'boolean']), {})).LobbyBoot;
    const LA_TYPES = ['media.AVPlayer | null', 'media.SoundPool | null', 'common.UIAbilityContext | null', 'resourceManager.RawFileDescriptor',
      'media.AVPlayer', 'media.SoundPool', 'media.PlayParameters', 'media.AVFileDescriptor', 'common.UIAbilityContext', 'audio.AudioRendererInfo',
      'Promise<void>', 'Promise<number>', 'BusinessError', 'number', 'void', 'string', 'boolean'];
    const laJs = stripEts(src(E + 'features/lobby/LobbyAudio.ets'), LA_TYPES, []);
    const rawCtx = { resourceManager: { getRawFd: async () => ({ fd: 1, offset: 0, length: 10 }), closeRawFd: async () => {} } };
    const settle = async () => { for (let k = 0; k < 6; k++) { await drainMicrotasks(60); await tickIo(); } };
    const makeRouterModel = () => {
      const m = { pages: [], trips: [], params: undefined, replaceCalls: 0, urls: [], pushCalls: 0, pushFail: false, clears: 0, backs: 0, depthAtClear: [], clearTops: [], onRoute: null };
      m.router = {
        replaceUrl: (opt) => { m.replaceCalls++; m.urls.push(opt.url); if (m.onRoute) m.onRoute(`replaceUrl:${opt.url}`); return new Promise((res, rej) => { m.trips.push({ opt, res, rej }); }); },
        pushUrl: () => { m.pushCalls++; return m.pushFail ? Promise.reject(new Error('push failed (sim)')) : Promise.resolve(); },
        // 页栈小修：router.clear() = 只留栈顶，下面每一页 aboutToDisappear（从栈底往上）。
        clear: () => {
          m.clears++;
          m.depthAtClear.push(m.pages.length);
          m.clearTops.push(m.pages.length > 0 ? m.pages[m.pages.length - 1].inst : null); // 谁在栈顶时 clear（= 调 clear 的大厅）
          const gone = m.pages.slice(0, -1);
          m.pages = m.pages.slice(-1);
          for (const p of gone) { if (p.inst && p.inst.aboutToDisappear) p.inst.aboutToDisappear(); }
        },
        back: () => { m.backs++; },
        getLength: () => String(m.pages.length),
        getParams: () => m.params,
        getState: () => ({ index: m.pages.length, name: m.pages[m.pages.length - 1].name, path: 'pages/' })
      };
      return m;
    };
    /** Table world on a router model + Lobby module sharing the same LbRouter / director / clock; real LobbyAudio on fake media. */
    const makeLeaveWorld = async (cold, AS = null) => {
      const rm = makeRouterModel();
      const w = await makeWorld(rm.router);
      const fm = makeFakeMedia();
      fm.clock = w.clk;
      const LA = (await importFresh(laJs, {
        media: fm, audio: { StreamUsage: { STREAM_USAGE_MUSIC: 1 }, AudioRendererRate: { RENDER_RATE_NORMAL: 0 } },
        SfxIds: new Proxy({}, { get: (_, k) => String(k) }), Logger: { info: () => {}, warn: () => {}, error: () => {} }, LobbyBoot: LB,
        MatchLoad: { VOL_MATCH_OPEN: 0.46 }, AudioSettings: AS || { sfx01: (v) => v, bgm01: (v) => v, voice01: (v) => v, addListener: () => {} },
        ...clockStubs(w.clk)
      })).LobbyAudio;
      const lw = { resets: 0, lobbyStops: 0, tableAudioRelease: 0, lobbies: [], cold: !!cold, log: [], portraitGate: null,
        la: { leave: 0, release: 0, watch: false, calls: [] } };
      // 页栈小修：LobbyAudio.leaveThenRelease / release 计数（lw.la）；lw.la.watch 打开时，大厅页对 LobbyAudio 的每次方法调用都记进 lw.la.calls。
      const laLeave0 = LA.leaveThenRelease;
      const laRelease0 = LA.release;
      LA.leaveThenRelease = function leaveThenRelease() { lw.la.leave++; return laLeave0.call(this); };
      LA.release = function release() { lw.la.release++; return laRelease0.call(this); };
      const laSeenByLobby = new Proxy(LA, { get: (tg, k) => { const v = tg[k]; if (lw.la.watch && typeof v === 'function') lw.la.calls.push(String(k)); return v; } });
      // 页栈小修：lockPortrait 可挂起（lw.portraitGate 返回一个由测试放行的 promise）→ 验「先锁竖屏再露出大厅」；lw.log 记导演 / 引擎 / 转屏顺序。
      const winOrient = {
        lockPortrait: () => { lw.log.push('portrait:req'); return (lw.portraitGate ? lw.portraitGate() : Promise.resolve()).then(() => { lw.log.push('portrait:done'); }); },
        lockLandscape: async () => { lw.log.push('landscape'); }
      };
      w.orient.lockPortrait = winOrient.lockPortrait;
      rm.onRoute = (x) => { lw.log.push(x); };
      const LM = (await importFresh(lobbyHarnessJs, {
        LbRouter: w.LbR, Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'Lobby', WindowOrientation: winOrient,
        getContext: () => rawCtx, LobbyAudio: laSeenByLobby, TableAudio: { leaveThenRelease: () => { lw.tableAudioRelease++; } },
        LobbySession: { takeColdStart: () => { const c = lw.cold; lw.cold = false; return c; } }, LobbyBoot: LB,
        animateTo: (o, f) => f(), Curve: new Proxy({}, { get: (_, k) => String(k) }), ConfigRepository: { isReady: () => false },
        LocalStore: { loadNickname: async () => 'nick', loadLastTable: async () => ({ playerCount: 4, lives: 3, silent: false }) },
        SmartFillAdapter: { systemSuggestion: () => '' },
        AppRuntime: { bootDirector: () => {},
          director: { stop: () => { lw.lobbyStops++; lw.log.push('director.stop'); w.director.stop(); }, start: () => { lw.log.push('director.start'); } },
          engine: { resetToLobby: () => { lw.resets++; lw.log.push('engine.resetToLobby'); }, startMatch: (o) => { lw.log.push(`engine.startMatch:${o.playerCount}`); return true; } } },
        ...clockStubs(w.clk)
      })).LobbyHarness;
      const newLobby = (name) => { const L = new LM(name); lw.lobbies.push(L); return L; };
      /** Router lands trip i: a NEW lobby instance replaces the top page (lifecycle order per `order`), then the promise resolves. */
      const land = async (i, order) => {
        const trip = rm.trips[i];
        if (trip === undefined) { lw.missingTrips = (lw.missingTrips || 0) + 1; return; } // no such replaceUrl was issued → assertions report it
        const old = rm.pages[rm.pages.length - 1];
        const L = newLobby(`L${i}`);
        rm.params = trip.opt.params;
        if (order === 'routeFirst') {
          // 追补：router 的 replace 先回成功（Table 先 settle → teardownAfterRoute 收尾），被换掉的旧页 aboutToDisappear 之后才到，新大厅再出现。
          trip.res();
          await settle();
          old.inst.aboutToDisappear(); L.aboutToAppear(); L.onPageShow();
        } else if (order === 'newFirst') { L.aboutToAppear(); L.onPageShow(); old.inst.aboutToDisappear(); } else { old.inst.aboutToDisappear(); L.aboutToAppear(); L.onPageShow(); }
        rm.pages[rm.pages.length - 1] = { name: 'Lobby', inst: L };
        if (order !== 'routeFirst') trip.res();
        await settle();
        w.clk.advance(2000);
        await settle();
      };
      return { ...w, rm, fm, LA, lw, newLobby, land };
    };
    const bgmOf = (fm) => fm.players[0];
    const poolsPlayers = (fm) => ({ pools: fm.pools.length, players: fm.players.length,
      livePools: fm.pools.filter((p) => !p.released).length, livePlayers: fm.players.filter((p) => !p.released).length });
    const confirmLeave = async (t, n) => { t.requestLeave(); t.dialogs[n].opts.secondaryButton.action(); await drainMicrotasks(); };
    const isPlaying = (p) => !p.released && p.acts.filter((a) => !a.startsWith('vol:')).pop() === 'play';
    // 进桌后大厅 BGM 淡出票：acts 从 from 起（大厅页 onPageHide 之后）有没有再 play()、送过的音量是不是全 0、最后停在 pause。
    const silentSince = (p, from) => {
      const tail = p.acts.slice(from);
      return { noPlay: !tail.includes('play'), vols0: tail.filter((a) => a.startsWith('vol:')).every((a) => a === 'vol:0'),
        lastPause: p.acts.filter((a) => !a.startsWith('vol:')).pop() === 'pause', lastVol: p.vols[p.vols.length - 1] };
    };
    const dupClear = []; // 裁定 3：只渲染的重复大厅不 clear —— 4 个变体各记一行，循环后一条真跑断言
    for (const lateOld of [true, false]) {
      for (const order of ['newFirst', 'oldFirst']) {
        const lw0 = await makeLeaveWorld(false);
        const { t, director, engine, clk: c, RSx, rm, fm, lw, LbR } = lw0;
        LbR.toTable(); // Lobby.tryEnterTable → new leave session
        rm.pages = [{ name: 'Lobby', inst: { aboutToDisappear: () => {} } }, { name: 'Table', inst: t }];
        await confirmLeave(t, 0);
        c.advance(3000);
        await drainMicrotasks();
        c.advance(10000); // no auto re-send while the player has not confirmed again
        await drainMicrotasks();
        const replaceBeforeRetry = rm.replaceCalls;
        await confirmLeave(t, 1); // player confirms again → in-flight trip ≥ 3000 ms is voided → new replaceUrl
        const tickets = rm.trips.map((x) => x.opt.params && x.opt.params.lbLeaveTicket);
        let k1 = null;
        if (lateOld) { await lw0.land(1, order); k1 = poolsPlayers(fm); c.advance(1500); await lw0.land(0, order); } else { await lw0.land(0, order); k1 = poolsPlayers(fm); await lw0.land(1, order); }
        c.advance(3000);
        await settle();
        const kEnd = poolsPlayers(fm);
        const bgm = bgmOf(fm);
        const initL = lw.lobbies.find((L) => L.lobbyInit);
        const dupL = lw.lobbies.find((L) => !L.lobbyInit);
        dupClear.push({ v: `${lateOld ? 'a' : 'b'}/${order}`, init: rm.clearTops.filter((x) => x === initL).length, dup: rm.clearTops.filter((x) => x === dupL).length,
          total: rm.clears, hasDup: dupL !== undefined, hasInit: initL !== undefined });
        const inits = lw.lobbies.filter((L) => L.lobbyInit).length;
        const tableStops = director.stopped - lw.lobbyStops;
        const label = lateOld ? '(a) old hangs, new lands, old lands late' : '(b) both land: old first, then new';
        ok(replaceBeforeRetry === 1 && rm.replaceCalls === 2 && JSON.stringify(tickets) === '[1,2]' && lw.lobbies.length === 2 &&
          lw.lobbies.every((L) => L.lobbyKey > 0) && rm.pages.length === 1 && rm.pages[0].name === 'Lobby' && rm.clears === 1 && rm.urls.every((u) => u === 'pages/Lobby') &&
          inits === 1 && lw.resets === 1 && lw.lobbyStops === 1 && fm.pools.length === 1 && bgm !== undefined && bgm.plays === 1 && !bgm.released &&
          bgm.vols.length > 0 && bgm.vols[bgm.vols.length - 1] > 0 && tableStops === 1 && engine.toLobbyCalls === 1 && audio.leaveRelease === 1 &&
          RSx.recent().length === 1 && RSx.summaryNow().quits === 1 &&
          kEnd.pools === 1 && kEnd.players === 2 && kEnd.livePools === 1 && kEnd.livePlayers === 2 && k1.pools === kEnd.pools && k1.players === kEnd.players &&
          lw.la.leave === 0 && lw.la.release === 0,
          `leave-token ${label} [${order === 'newFirst' ? 'new appear → old disappear' : 'old disappear → new appear'}]: replaceUrl=${rm.replaceCalls} ` +
          `(before re-confirm ${replaceBeforeRetry}) tickets=${JSON.stringify(tickets)}; lobby instances=${lw.lobbies.length} (both aboutToAppear), ` +
          `lobby init=${inits} (engine reset=${lw.resets}, LobbyAudio pools=${fm.pools.length}), BGM play()=${bgm ? bgm.plays : -1} released=${bgm ? bgm.released : '-'}; ` +
          `leave finish director.stop=${tableStops} (+ lobby init stop ${lw.lobbyStops}), engine LOBBY=${engine.toLobbyCalls}, 中退=${RSx.recent().length}; ` +
          `stack=[${rm.pages.map((p) => p.name).join(',')}] (no Report; init lobby router.clear()=${rm.clears} — 页栈小修); LobbyAudio pools/AVPlayers after 1st landing ` +
          `${k1.pools}/${k1.players} → end ${kEnd.pools}/${kEnd.players} (live ${kEnd.livePools}/${kEnd.livePlayers}), leaveThenRelease=${lw.la.leave} release=${lw.la.release}`);
      }
    }
    ok(dupClear.length === 4 && dupClear.every((d) => d.hasInit && d.hasDup && d.init === 1 && d.dup === 0 && d.total === 1),
      `pagestack render-only duplicate lobby never clears (leave-token a/b × both lifecycle orders): ` +
      dupClear.map((d) => `${d.v} init-lobby clear=${d.init} duplicate clear=${d.dup} (total ${d.total})`).join('; '));
    // (ii) re-send only if Table is still on top: the old trip already swapped the page (lifecycle not delivered yet) → no 2nd replace, finish.
    {
      const lw0 = await makeLeaveWorld(false);
      const { t, director, engine, clk: c, RSx, rm, LbR } = lw0;
      LbR.toTable();
      rm.pages = [{ name: 'Lobby', inst: { aboutToDisappear: () => {} } }, { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      c.advance(3000);
      await drainMicrotasks();
      rm.pages[1] = { name: 'Lobby', inst: { aboutToDisappear: () => {} } };
      await confirmLeave(t, 1);
      await drainMicrotasks();
      ok(rm.replaceCalls === 1 && director.stopped === 1 && engine.toLobbyCalls === 1 && RSx.recent().length === 1,
        `leave-retry-top-not-table: top page already Lobby → no second replaceUrl (calls=${rm.replaceCalls}), finishLeaveOnce ran (director.stop=${director.stopped}, engine LOBBY=${engine.toLobbyCalls}), 中退=${RSx.recent().length}`);
    }
    // ⑯ 补丁轮 3 第 1 条（负责人阻塞）：pageGone。顺序「老趟 #1 落地、新趟 #2 一直不回」——本页被老趟销毁、收尾一次之后，
    // 第二趟的 3000 ms 超时才到。真 Table.lockTableWindow / unbindAvoid（假窗口：数 lockLandscape 与 on/off('avoidAreaChange')）
    // 挂在同一个 Table 实例上；releaseLeaveLock / teardownAfterRoute 包一层计数后照常调真方法。
    const WIN_SIGS = ['  private async lockTableWindow(): Promise<void> {', '  private unbindAvoid(): void {'];
    const winJs = stripEts(WIN_SIGS.map((sg) => body(table, sg) + '\n  }\n').join('\n'), [...TABLE_TYPES, 'window.Window | null'], ['common.UIAbilityContext']);
    const winModel = { landscape: 0, avoidOn: 0, avoidOff: 0 };
    const fakeWin = { on: (ev) => { if (ev === 'avoidAreaChange') winModel.avoidOn++; }, off: (ev) => { if (ev === 'avoidAreaChange') winModel.avoidOff++; } };
    const WinM = (await importFresh(`class WinMethods {\n${winJs}\n}\nexport { WinMethods };`, {
      WindowOrientation: { lockLandscape: async () => { winModel.landscape++; }, mainWindow: async () => fakeWin, readSafeInsets: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) },
      getContext: () => ({}), Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'Table'
    })).WinMethods;
    const realWindow = (t) => {
      Object.assign(t, { winRef: null, avoidBound: false, applyInsets: () => {} });
      t.lockTableWindow = function lockTableWindow() { this.calls.push('lockTableWindow'); return WinM.prototype.lockTableWindow.call(this); };
      t.unbindAvoid = function unbindAvoid() { this.calls.push('unbindAvoid'); return WinM.prototype.unbindAvoid.call(this); };
      const proto = Object.getPrototypeOf(t);
      const spy = { rel: 0, tear: 0 };
      t.releaseLeaveLock = function releaseLeaveLock() { spy.rel++; return proto.releaseLeaveLock.call(this); };
      t.teardownAfterRoute = function teardownAfterRoute() { spy.tear++; return proto.teardownAfterRoute.call(this); };
      return spy;
    };
    const tableStub = () => ({ name: 'Lobby', inst: { aboutToDisappear: () => {} } });
    for (const order of ['newFirst', 'oldFirst']) {
      const lw0 = await makeLeaveWorld(false);
      const { t, director, engine, clk: c, RSx, rm, lw, LbR } = lw0;
      const spy = realWindow(t);
      const w0m = { landscape: winModel.landscape, on: winModel.avoidOn };
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      c.advance(3000);
      await settle(); // trip #1 timed out on a LIVE page → unlock + landscape + avoidArea bind (legit, premise of the test)
      const alive = { rel: spy.rel, landscape: winModel.landscape - w0m.landscape, on: winModel.avoidOn - w0m.on, calls: t.calls.filter((x) => x === 'lockTableWindow').length };
      c.advance(10000);
      await drainMicrotasks();
      await confirmLeave(t, 1); // player confirms again → trip #1 voided → trip #2 issued
      const mark = { calls: t.calls.length, landscape: winModel.landscape, on: winModel.avoidOn, resumes: director.resumes, rel: spy.rel, tear: spy.tear };
      await lw0.land(0, order); // the OLD trip #1 lands: Table destroyed, leave finished once; trip #2 never settles
      const gone = t.pageGone === true;
      c.advance(5000);
      await settle(); // trip #2's 3000 ms timeout fires after the destroy
      const after = t.calls.slice(mark.calls);
      const warns0 = routerLog.warns.filter((m) => m.startsWith('toTable:')).length;
      LbR.toTable(); // new match while trip #2 is still in flight → one HiLog line
      const warns1 = routerLog.warns.filter((m) => m.startsWith('toTable:')).length;
      const tableStops = director.stopped - lw.lobbyStops;
      ok(alive.rel === 1 && alive.landscape === 1 && alive.on === 1 && alive.calls === 1 && rm.replaceCalls === 2 && gone &&
        !after.includes('lockTableWindow') && winModel.landscape === mark.landscape && winModel.avoidOn === mark.on && winModel.avoidOff >= 1 &&
        director.resumes === mark.resumes && spy.rel === mark.rel && spy.tear === mark.tear && t.leaving === true && t.homeRouting === true &&
        tableStops === 1 && engine.toLobbyCalls === 1 && RSx.recent().length === 1 && warns1 === warns0 + 1,
        `leave-pageGone [${order === 'newFirst' ? 'new appear → old disappear' : 'old disappear → new appear'}] old #1 lands, new #2 hangs, +5000 ms: ` +
        `after destroy lockTableWindow=${after.filter((x) => x === 'lockTableWindow').length} landscape locks +${winModel.landscape - mark.landscape} ` +
        `avoidAreaChange re-bound +${winModel.avoidOn - mark.on}, director resumes +${director.resumes - mark.resumes}, releaseLeaveLock/teardown entered +${spy.rel - mark.rel}/+${spy.tear - mark.tear}, ` +
        `leaving=${t.leaving} homeRouting=${t.homeRouting} (not reset); finish once (director.stop=${tableStops}, engine LOBBY=${engine.toLobbyCalls}, 中退=${RSx.recent().length}); ` +
        `premise: live-page timeout unlock=${alive.rel} landscape=${alive.landscape} bind=${alive.on}; toTable with #2 in flight → HiLog +${warns1 - warns0}`);
    }
    // 补丁轮 3：有了 pageGone + 阶段判断后，端到端两趟落地流程里「只收尾一次」由多层保证；离局会话令牌本身（LbRouter.claimLeaveFinish，
    // Table.finishLeaveOnce 唯一入口）单独真跑：同一会话两次收尾请求（路由成功 + 页面被移走）→ 只执行 1 次；下一会话照常 1 次。
    {
      const tk = await makeLeaveWorld(false);
      const { t, director, engine, LbR } = tk;
      LbR.toTable();
      const a1 = t.finishLeaveOnce('route ok');
      const a2 = t.finishLeaveOnce('page removed by late route');
      const s1 = { stop: director.stopped, lobby: engine.toLobbyCalls, rel: audio.leaveRelease };
      LbR.toTable(); // next match = next leave session
      const b1 = t.finishLeaveOnce('route ok');
      const b2 = t.finishLeaveOnce('page removed by late route');
      ok(a1 === true && a2 === false && s1.stop === 1 && s1.lobby === 1 && s1.rel === 1 && b1 === true && b2 === false && director.stopped === 2 && engine.toLobbyCalls === 2,
        `leave-token finishLeaveOnce once per leave session (real Table.finishLeaveOnce + real LbRouter.claimLeaveFinish): session 1 → [${a1},${a2}] ` +
        `director.stop=${s1.stop} engine LOBBY=${s1.lobby} table audio release=${s1.rel}; session 2 → [${b1},${b2}] totals stop=${director.stopped} LOBBY=${engine.toLobbyCalls}`);
    }
    // each pageGone site on its own: on a destroyed Table a direct releaseLeaveLock() / teardownAfterRoute() is a no-op.
    {
      const g = await makeLeaveWorld(false);
      const { t, director, engine, LbR, rm } = g;
      realWindow(t);
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      t.requestLeave(); // dialog open: director PAUSED(LEAVE_CONFIRM) — a resume would show up
      t.aboutToDisappear(); // page removed (no leave route issued → nothing finished)
      t.leaving = true; t.homeRouting = true;
      const m0 = { landscape: winModel.landscape, on: winModel.avoidOn, resumes: director.resumes };
      t.releaseLeaveLock();
      t.teardownAfterRoute();
      await settle();
      ok(t.pageGone === true && winModel.landscape === m0.landscape && winModel.avoidOn === m0.on && director.resumes === m0.resumes &&
        t.leaving === true && t.homeRouting === true && director.stopped === 0 && engine.toLobbyCalls === 0 && !t.calls.includes('teardown'),
        `leave-pageGone sites: destroyed Table → releaseLeaveLock() no landscape lock (+${winModel.landscape - m0.landscape}) / no avoidArea bind (+${winModel.avoidOn - m0.on}) / ` +
        `no resume (+${director.resumes - m0.resumes}) / locks kept; teardownAfterRoute() no director.stop (${director.stopped}) / no engine LOBBY (${engine.toLobbyCalls})`);
    }
    // ⑯ 补丁轮 3 第 2 条：同一次运行连打两局、每局都离局 → 第二局也 director.stop 1 次、引擎回 LOBBY、桌音释放、中退 1 条（共 2 条、matchId 不同）。
    {
      const lw2 = await makeLeaveWorld(false);
      const { t, director, engine, clk: c, RSx, rm, fm, lw, LbR, LA } = lw2;
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      await lw2.land(0, 'newFirst');
      const m1 = { stops: director.stopped - lw.lobbyStops, lobby: engine.toLobbyCalls, rel: audio.leaveRelease, recs: RSx.recent().length, phase: engine.snap.phase };
      const lbgm = LA.bgmPlayer; // lobby BGM of the first real lobby (return #1)
      const lp1 = { plays: lbgm ? lbgm.plays : -1, playing: lbgm !== null && isPlaying(lbgm) };
      const w0 = routerLog.warns.filter((m) => m.startsWith('toTable:')).length;
      LbR.toTable(); // match 2 (Lobby.tryEnterTable), no leave replace in flight → no HiLog
      lw.lobbies[0].onPageHide(); // pushUrl covers the lobby (it stays on the stack) → 400 ms fade, then pause
      c.advance(LA.HIDE_FADE_MS);
      await settle();
      const hideMark = lbgm ? lbgm.acts.length : 0; // from here on (fade done) the lobby must stay silent for the whole match
      const warnIdle = routerLog.warns.filter((m) => m.startsWith('toTable:')).length - w0;
      const t2 = new t.constructor();
      t2.bindPause();
      Object.assign(engine.snap, { matchId: 'm-778', phase: PhaseE.TURN, startedAt: c.now });
      director.state = PSt.RUNNING; director.reason = '';
      rm.pages.push({ name: 'Table', inst: t2 });
      c.advance(60000);
      await settle();
      const mid2 = lbgm ? silentSince(lbgm, hideMark) : { noPlay: false, vols0: false, lastPause: false, lastVol: NaN };
      await confirmLeave(t2, 0);
      await lw2.land(1, 'oldFirst');
      const ids = RSx.recent().map((r) => r.matchId);
      const tableStops = director.stopped - lw.lobbyStops;
      const returns = lw.lobbies.length; // every return to the lobby = one leave landing = one lobby instance
      ok(lbgm !== null && lp1.plays === 1 && lp1.playing && mid2.noPlay && mid2.vols0 && mid2.lastPause && mid2.lastVol === 0 &&
        LA.bgmPlayer === lbgm && lbgm.plays === returns && returns === 2 && isPlaying(lbgm) && fm.pools.length === 1 && fm.players.length === 2 &&
        m1.stops === 1 && m1.lobby === 1 && m1.rel === 1 && m1.recs === 1 && m1.phase === PhaseE.LOBBY &&
        tableStops === 2 && engine.toLobbyCalls === 2 && engine.snap.phase === PhaseE.LOBBY && audio.leaveRelease === 2 &&
        RSx.recent().length === 2 && new Set(ids).size === 2 && ids.includes('m-777') && ids.includes('m-778') && RSx.recent().every((r) => r.quit === true) &&
        RSx.summaryNow().quits === 2 && rm.replaceCalls === 2 && lw.lobbies.length === 2 && lw.lobbies.every((L) => L.lobbyInit) && warnIdle === 0,
        `leave-two-matches: match 1 director.stop=${m1.stops} LOBBY=${m1.lobby} table audio released=${m1.rel} 中退=${m1.recs}; ` +
        `match 2 director.stop total=${tableStops} engine LOBBY total=${engine.toLobbyCalls} (${engine.snap.phase}) table audio released total=${audio.leaveRelease}; ` +
        `records=${RSx.recent().length} [${ids.join(',')}] quits=${RSx.summaryNow().quits}; both lobbies init=${lw.lobbies.map((L) => L.lobbyInit).join('/')}; toTable HiLog when idle=${warnIdle}; ` +
        `lobby audio: return #1 BGM play()=${lp1.plays} playing=${lp1.playing}; match 2 (lobby on the stack) play()=${mid2.noPlay ? 0 : '≥1'} volumes all 0=${mid2.vols0} ` +
        `paused=${mid2.lastPause} last volume=${mid2.lastVol}; after return #2 same player=${LA.bgmPlayer === lbgm} BGM play()=${lbgm ? lbgm.plays : -1} = returns ${returns}, ` +
        `playing=${lbgm ? isPlaying(lbgm) : false}, pools=${fm.pools.length} AVPlayers=${fm.players.length}`);
    }
    // 补丁轮 3/3 追补（负责人批，进 #296）：LbRouter.tripsInFlight 落地 / 失败都回 0。三个独立新世界、三个断言名；
    // 每条都只看真 LbRouter：结束时 toTable 的 HiLog「toTable: N leave replace(s) still in flight」新增 0 行，计数读数 = 0（中途读数也逐值对上，从不为负）。
    // 超时本身不减（那趟确实还在路上），只在 replace 自己的 promise 落地 / 失败时由 clearTrip 减一。
    const toTableWarns = () => routerLog.warns.filter((m) => m.startsWith('toTable:')).length;
    const reissueAfterTimeout = async (lwx) => { // #1 issued → 3000 ms timeout (live page unlocks) → player confirms again → #1 voided, #2 issued
      const { t, clk: c, rm, LbR } = lwx;
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      const n1 = LbR.tripsInFlight;
      c.advance(3000);
      await settle();
      const nTimeout = LbR.tripsInFlight; // timeout does NOT decrement: #1 is still in flight
      c.advance(10000);
      await drainMicrotasks();
      await confirmLeave(t, 1);
      return { n1, nTimeout, n2: LbR.tripsInFlight, tickets: rm.trips.map((x) => x.opt.params && x.opt.params.lbLeaveTicket) };
    };
    // (1) voided old trip lands late: new #2 lands first (Table destroyed, leave finished), then the voided #1 lands late.
    {
      const lwx = await makeLeaveWorld(false);
      const { clk: c, rm, LbR } = lwx;
      const pre = await reissueAfterTimeout(lwx);
      await lwx.land(1, 'newFirst');
      const nAfterNew = LbR.tripsInFlight; // #1 (voided) still in flight
      c.advance(1500);
      await lwx.land(0, 'newFirst');
      c.advance(3000);
      await settle();
      const nEnd = LbR.tripsInFlight;
      const w0 = toTableWarns();
      LbR.toTable();
      const dw = toTableWarns() - w0;
      ok(rm.replaceCalls === 2 && JSON.stringify(pre.tickets) === '[1,2]' && pre.n1 === 1 && pre.nTimeout === 1 && pre.n2 === 2 && nAfterNew === 1 &&
        nEnd === 0 && dw === 0,
        `leave-tripsInFlight voided old trip lands late → 0: tickets=${JSON.stringify(pre.tickets)}; in flight after #1 issued=${pre.n1}, after #1 timeout=${pre.nTimeout} ` +
        `(timeout does not decrement), after re-confirm (#1 voided, #2 issued)=${pre.n2}, after #2 lands=${nAfterNew}, after voided #1 lands late=${nEnd}; toTable HiLog +${dw}`);
    }
    // (2) replace fails via reject → back() also fails (stack = Table only) → lock released; the rejected trip settles → 0.
    {
      const lwx = await makeLeaveWorld(false);
      const { t, clk: c, rm, LbR } = lwx;
      LbR.toTable();
      rm.pages = [{ name: 'Table', inst: t }];
      const issuedAt = c.now; // relative clock (no hard-coded world start)
      await confirmLeave(t, 0);
      const n1 = LbR.tripsInFlight;
      c.advance(500);
      rm.trips[0].rej({ code: 100001, message: 'replace failed' });
      await settle();
      const viaReject = t.leaving === false && t.homeRouting === false && c.now - issuedAt < LbR.LEAVE_ROUTE_TIMEOUT_MS; // released by the reject → back ✗ path, before any timeout
      const nAfterReject = LbR.tripsInFlight;
      c.advance(5000);
      await settle();
      const nEnd = LbR.tripsInFlight;
      const w0 = toTableWarns();
      LbR.toTable();
      const dw = toTableWarns() - w0;
      ok(rm.replaceCalls === 1 && n1 === 1 && viaReject && nAfterReject === 0 && nEnd === 0 && dw === 0,
        `leave-tripsInFlight replace rejects → 0: in flight after issue=${n1}, after reject (+500 ms, back ✗ → lock released=${viaReject})=${nAfterReject}, ` +
        `+5000 ms=${nEnd}; toTable HiLog +${dw}`);
    }
    // (3) old and new both land: voided #1 lands first (while #2 is still pending), then #2 lands → 0, then toTable.
    {
      const lwx = await makeLeaveWorld(false);
      const { clk: c, rm, LbR } = lwx;
      const pre = await reissueAfterTimeout(lwx);
      await lwx.land(0, 'oldFirst');
      const nAfterOld = LbR.tripsInFlight; // #2 still in flight
      await lwx.land(1, 'oldFirst');
      c.advance(3000);
      await settle();
      const nEnd = LbR.tripsInFlight;
      const w0 = toTableWarns();
      LbR.toTable();
      const dw = toTableWarns() - w0;
      ok(rm.replaceCalls === 2 && JSON.stringify(pre.tickets) === '[1,2]' && pre.n2 === 2 && nAfterOld === 1 && nEnd === 0 && dw === 0,
        `leave-tripsInFlight old and new both land → 0: in flight after re-confirm=${pre.n2}, after voided #1 lands (#2 pending)=${nAfterOld}, ` +
        `after #2 lands=${nEnd}; toTable HiLog +${dw}`);
    }
    // 进桌后大厅 BGM 淡出票第 3 条（负责人）：离局成功后马上开新局，3 秒内（< LEAVE_ROUTE_TIMEOUT_MS）再离局一次 → 必须重新发 replace、落回大厅、
    // 第二局收尾 1 次。真 LbRouter.clearTrip 落地时清掉 leaveTrip；若不清（只减计数），第二次离局会被当成「上一趟还在途」直接按成功收尾，人停在 Table。
    {
      const l2 = await makeLeaveWorld(false);
      const { t, director, engine, clk: c, RSx, rm, lw, LbR } = l2;
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      const t0 = c.now;
      await confirmLeave(t, 0);
      const L1 = l2.newLobby('L1'); // trip #1 lands at once (no land(): it advances 2000 ms)
      rm.params = rm.trips[0].opt.params;
      L1.aboutToAppear(); L1.onPageShow(); t.aboutToDisappear();
      rm.pages[rm.pages.length - 1] = { name: 'Lobby', inst: L1 };
      rm.trips[0].res();
      await settle();
      const m1 = { stops: director.stopped - lw.lobbyStops, lobby: engine.toLobbyCalls, top: rm.pages[rm.pages.length - 1].name, inFlight: LbR.tripsInFlight };
      c.advance(500);
      LbR.toTable(); // match 2 right away
      const t2 = new t.constructor();
      t2.bindPause();
      Object.assign(engine.snap, { matchId: 'm-778', phase: PhaseE.TURN, startedAt: c.now });
      director.state = PSt.RUNNING; director.reason = '';
      rm.pages.push({ name: 'Table', inst: t2 });
      c.advance(1000);
      const dt = c.now - t0;
      await confirmLeave(t2, 0);
      const replace2 = rm.replaceCalls;
      const ticket2 = rm.trips[1] ? rm.trips[1].opt.params.lbLeaveTicket : -1;
      await l2.land(1, 'newFirst');
      c.advance(3000);
      await settle();
      const top = rm.pages[rm.pages.length - 1];
      const tableStops = director.stopped - lw.lobbyStops;
      ok(dt < LbR.LEAVE_ROUTE_TIMEOUT_MS && m1.stops === 1 && m1.lobby === 1 && m1.top === 'Lobby' && m1.inFlight === 0 && replace2 === 2 && ticket2 === 2 &&
        !lw.missingTrips && top.name === 'Lobby' && top.inst !== L1 && t2.pageGone === true && tableStops === 2 && engine.toLobbyCalls === 2 &&
        engine.snap.phase === PhaseE.LOBBY && RSx.recent().length === 2 && lw.lobbies.length === 2 && lw.lobbies.every((L) => L.lobbyInit),
        `leave-twice-within-3s (leave #1 lands, new match, leave #2 at +${dt} ms < ${LbR.LEAVE_ROUTE_TIMEOUT_MS}): match 1 finish=${m1.stops} top=${m1.top} in flight=${m1.inFlight}; ` +
        `leave #2 replaceUrl total=${replace2} (ticket #${ticket2}), lands on ${top.name} (new instance=${top.inst !== L1}), match 2 finish=${tableStops - m1.stops} ` +
        `(director.stop total=${tableStops}, engine LOBBY total=${engine.toLobbyCalls} → ${engine.snap.phase}), 中退=${RSx.recent().length}`);
    }
    // 防重复收尾三层之一「阶段判断」单独真跑（真 Table.finishLeaveIfRouted / teardownAfterRoute / finishLeaveOnce + 真 LbRouter）：
    // pageGone = false、离局会话令牌是新的（toTable 开了新会话，令牌可领），只有阶段挡：引擎已在 LOBBY / RECAP / END → 不再收尾；
    // 对照：同一状态改回 TURN → 照常收尾 1 次（证明令牌确实可领、挡住的只是阶段判断）。
    {
      const ph = await makeLeaveWorld(false);
      const { t, director, engine, LbR } = ph;
      t.pageGone = false; // Table.ets field initializer (the harness constructor does not carry it)
      LbR.toTable();
      t.leaveRouteIssued = true;
      t.teardownAfterRoute(); // route ok → finish once → engine LOBBY
      const s0 = { stop: director.stopped, lobby: engine.toLobbyCalls, rel: audio.leaveRelease, phase: engine.snap.phase };
      LbR.toTable(); // fresh leave session → the token would grant again
      const rows = [];
      for (const p of [PhaseE.LOBBY, PhaseE.RECAP, PhaseE.END]) {
        engine.snap.phase = p;
        t.finishLeaveIfRouted();
        rows.push(`${p}:${director.stopped - s0.stop}/${engine.toLobbyCalls - s0.lobby}/${audio.leaveRelease - s0.rel}`);
      }
      const blocked = director.stopped === s0.stop && engine.toLobbyCalls === s0.lobby && audio.leaveRelease === s0.rel;
      const gone = t.pageGone;
      engine.snap.phase = PhaseE.TURN; // control: same Table, same fresh token, phase not terminal → finishes once
      t.finishLeaveIfRouted();
      const ctl = { stop: director.stopped - s0.stop, lobby: engine.toLobbyCalls - s0.lobby, rel: audio.leaveRelease - s0.rel };
      ok(s0.stop === 1 && s0.lobby === 1 && s0.rel === 1 && s0.phase === PhaseE.LOBBY && gone === false && blocked && ctl.stop === 1 && ctl.lobby === 1 && ctl.rel === 1,
        `leave-phase layer finishLeaveIfRouted (direct, pageGone=false, fresh token): route-ok finish=${s0.stop} → engine ${s0.phase}; ` +
        `terminal phase → extra stop/LOBBY/audio release [${rows.join(' ')}]; control TURN → ${ctl.stop}/${ctl.lobby}/${ctl.rel}`);
    }
    // 追补（测试发现）：端到端新顺序「router replace 先成功、旧 Table 页之后才 aboutToDisappear」。真 Table + 真 LbRouter + 真 Lobby + 真 RecordStore：
    // 收尾只 1 次（director.stop / 引擎回 LOBBY / 桌音释放 / 中退各 1）。此顺序里第二次收尾请求（aboutToDisappear → finishLeaveIfRouted）
    // 先被阶段判断（引擎已 LOBBY）挡、再被离局令牌挡；两层一起删才会翻倍（破坏测试 B113）。
    {
      const rf = await makeLeaveWorld(false);
      const { t, director, engine, RSx, rm, lw, LbR } = rf;
      const proto = Object.getPrototypeOf(t);
      const seen = { tearBeforeGone: null };
      t.aboutToDisappear = function aboutToDisappear() { seen.tearBeforeGone = this.calls.includes('teardown'); return proto.aboutToDisappear.call(this); };
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      await rf.land(0, 'routeFirst');
      const tableStops = director.stopped - lw.lobbyStops;
      ok(seen.tearBeforeGone === true && t.pageGone === true && rm.replaceCalls === 1 && tableStops === 1 && engine.toLobbyCalls === 1 &&
        engine.snap.phase === PhaseE.LOBBY && audio.leaveRelease === 1 && RSx.recent().length === 1 && RSx.recent()[0].quit === true && RSx.summaryNow().quits === 1 &&
        lw.lobbies.length === 1 && lw.lobbies[0].lobbyInit === true,
        `leave-route-first (replace resolves first, old Table disappears after): teardown before aboutToDisappear=${seen.tearBeforeGone}; ` +
        `director.stop=${tableStops} engine LOBBY=${engine.toLobbyCalls} table audio release=${audio.leaveRelease} 中退=${RSx.recent().length} (quits=${RSx.summaryNow().quits})`);
    }
    // 追补（美术阻塞项）：LobbyAudio.prepare() 同代守卫——全部在真 LobbyAudio（假 media）上真跑，数实际建出的 SoundPool / AVPlayer。
    const audioCensus = (fm, LA) => ({
      pools: fm.pools.length, players: fm.players.length,
      livePools: fm.pools.filter((p) => !p.released).length, livePlayers: fm.players.filter((p) => !p.released).length,
      orphans: fm.players.filter((p) => p !== LA.bgmPlayer && p !== LA.ambPlayer && isPlaying(p)).length,
      plays: fm.players.map((p) => p.plays)
    });
    // (1) 两个大厅同一 tick 落地：新趟 #2 → 初始化大厅 A（begin() 停在 await hydrate()），同 tick 老趟 #1 → 只渲染大厅 B（playIfIdle → startReturnBeds + prepare()），
    //     随后 A 继续跑到 prepare()。两种生命周期先后都跑。
    for (const order of ['newFirst', 'oldFirst']) {
      const st = await makeLeaveWorld(false);
      const { t, clk: c, rm, fm, LbR, LA } = st;
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      c.advance(3000);
      await settle();
      c.advance(10000);
      await drainMicrotasks();
      await confirmLeave(t, 1);
      const A = st.newLobby('A-init');
      const B = st.newLobby('B-render');
      const step = (trip, L) => {
        const old = rm.pages[rm.pages.length - 1];
        rm.params = trip.opt.params;
        if (order === 'newFirst') { L.aboutToAppear(); old.inst.aboutToDisappear(); } else { old.inst.aboutToDisappear(); L.aboutToAppear(); }
        rm.pages[rm.pages.length - 1] = { name: 'Lobby', inst: L };
      };
      step(rm.trips[1], A); // synchronous: A.begin() runs up to `await this.hydrate()` and suspends
      step(rm.trips[0], B); // same tick: render-only B → playIfIdle → prepare()
      const preparedBeforeA = fm.pools.length;
      rm.trips[1].res(); rm.trips[0].res();
      await settle();
      c.advance(3000);
      await settle();
      c.advance(3000);
      await settle();
      const k = audioCensus(fm, LA);
      const bgm = LA.bgmPlayer;
      ok(A.lobbyInit === true && B.lobbyInit === false && rm.replaceCalls === 2 && k.pools === 1 && k.players === 2 && k.livePools === 1 && k.livePlayers === 2 &&
        k.orphans === 0 && bgm !== null && !bgm.released && bgm.plays === 1 && isPlaying(bgm),
        `lobby-audio same-tick double lobby [${order === 'newFirst' ? 'new appear → old disappear' : 'old disappear → new appear'}] (init A suspended at hydrate, render-only B prepares first): ` +
        `pools=${k.pools} AVPlayers=${k.players} plays=${JSON.stringify(k.plays)} unreferenced-but-playing=${k.orphans}; BGM play()=${bgm ? bgm.plays : -1} playing=${bgm ? isPlaying(bgm) : false} ` +
        `(pools created before A resumed: ${preparedBeforeA})`);
    }
    // (2) push 进桌、大厅留在栈上（LbRouter.toTable → pushUrl；局内旧大厅不销毁），离局回来的新大厅 begin() 再调 prepare()（同代）。
    //     页栈小修：新大厅初始化完成后 router.clear() 才把旧大厅清掉——它已不是音频持有者，Lobby:120 的 leaveThenRelease 不跑（池 / 播放器数不变即证）。
    //     局内大厅 BGM 是否在响是另一张票（#296 之后），这里不断言它，只数池 / 播放器 / 孤儿。
    for (const order of ['newFirst', 'oldFirst']) {
      const ps = await makeLeaveWorld(true);
      const { t, clk: c, rm, fm, LbR, LA, lw } = ps;
      let pushes = 0;
      const push0 = rm.router.pushUrl;
      rm.router.pushUrl = (o) => { pushes++; return push0(o); };
      rm.pages = [];
      const L0 = ps.newLobby('L0-stays');
      let l0Gone = 0;
      const l0Proto = Object.getPrototypeOf(L0);
      L0.aboutToDisappear = function aboutToDisappear() { l0Gone++; return l0Proto.aboutToDisappear.call(this); };
      rm.params = undefined;
      L0.aboutToAppear(); // cold start lobby: prepare() → 1 pool + 2 beds
      rm.pages = [{ name: 'Lobby', inst: L0 }];
      await settle();
      c.advance(12000);
      await settle();
      const k0 = audioCensus(fm, LA);
      const bgm0 = LA.bgmPlayer;
      const plays0 = bgm0 ? bgm0.plays : -1;
      LbR.toTable(); // pushUrl: L0 stays alive under the Table
      rm.pages.push({ name: 'Table', inst: t });
      L0.onPageHide(); // covered by the Table → lobby beds fade out + pause
      c.advance(30000); // the match
      await settle();
      await confirmLeave(t, 0);
      await ps.land(0, order); // Table → new init lobby L1 → begin() → prepare() again, same gen; L1.onPageShow → playIfIdle resumes
      c.advance(3000);
      await settle();
      const k = audioCensus(fm, LA);
      const L1 = lw.lobbies[1];
      const bgm = LA.bgmPlayer;
      ok(pushes === 1 && l0Gone === 1 && rm.clears === 1 && rm.pages.length === 1 && L1 !== undefined && rm.pages[0].inst === L1 && L1.lobbyInit === true && k0.pools === 1 && k0.players === 2 &&
        k.pools === 1 && k.players === 2 && k.livePools === 1 && k.livePlayers === 2 && k.orphans === 0 &&
        plays0 === 1 && bgm !== null && bgm === bgm0 && bgm.plays === 2 && isPlaying(bgm) && k.pools === k0.pools && k.players === k0.players &&
        lw.la.leave === 0 && lw.la.release === 0,
        `lobby-audio push-stay-return prepare guard [${order === 'newFirst' ? 'new appear → old disappear' : 'old disappear → new appear'}]: pushUrl=${pushes}, lobby under the table destroyed=${l0Gone} ` +
        `(by the new lobby's router.clear()=${rm.clears}, stack depth ${rm.pages.length}); ` +
        `before the match pools=${k0.pools} AVPlayers=${k0.players}; after returning (new lobby init=${L1 ? L1.lobbyInit : '-'}, prepare() again) pools=${k.pools} AVPlayers=${k.players} ` +
        `(live ${k.livePools}/${k.livePlayers}), unreferenced-but-playing=${k.orphans}; BGM play() cold=${plays0} → after return ${bgm ? bgm.plays : -1} ` +
        `(same player=${bgm === bgm0}) playing=${bgm ? isPlaying(bgm) : false}; LobbyAudio leaveThenRelease=${lw.la.leave} release=${lw.la.release}`);
    }
    // (3) 防过度拦截：守卫只挡同代重复。大厅被移走 → 真 release（gen + 1）→ 回到大厅（新初始化大厅）→ prepare() 必须重建：
    //     活着的池 1、播放器 2、BGM 在放（play 总数 +1）。
    {
      const rr = await makeLeaveWorld(true);
      const { clk: c, rm, fm, LA } = rr;
      rm.pages = [];
      const L0 = rr.newLobby('cold');
      rm.params = undefined;
      L0.aboutToAppear();
      rm.pages = [{ name: 'Lobby', inst: L0 }];
      await settle();
      c.advance(12000);
      await settle();
      const b0 = LA.bgmPlayer;
      const k0 = audioCensus(fm, LA);
      const bgmPlays0 = b0 ? b0.plays : -1;
      const gen0 = LA.gen;
      L0.aboutToDisappear(); // lobby page removed → leaveThenRelease → release() after the leave fade (gen + 1)
      c.advance(1000);
      await settle();
      const genRel = LA.gen;
      const kr = audioCensus(fm, LA);
      const released = b0 !== null && b0.released && kr.livePools === 0 && kr.livePlayers === 0 && LA.bgmPlayer === null;
      const L1 = rr.newLobby('back');
      rm.params = undefined;
      L1.aboutToAppear();
      rm.pages = [{ name: 'Lobby', inst: L1 }];
      await settle();
      c.advance(3000);
      await settle();
      const k = audioCensus(fm, LA);
      const bgm = LA.bgmPlayer;
      const bgmPlays1 = (b0 ? b0.plays : 0) + (bgm ? bgm.plays : 0); // BGM play() across the released + the rebuilt player
      ok(k0.pools === 1 && k0.players === 2 && b0 !== null && b0.plays === 1 && released && L1.lobbyInit === true && k.pools === 2 && k.players === 4 &&
        k.livePools === 1 && k.livePlayers === 2 && k.orphans === 0 && bgm !== null && bgm !== b0 && !bgm.released && bgm.plays === 1 && isPlaying(bgm) && bgmPlays1 === bgmPlays0 + 1 &&
        genRel === gen0 + 1 && LA.gen === gen0 + 1,
        `lobby-audio release-then-return prepare rebuilds (guard blocks same gen only): cold lobby pools=${k0.pools} AVPlayers=${k0.players} BGM play()=${b0 ? b0.plays : -1}; ` +
        `lobby removed → released=${released}; back to a new lobby → live pools=${k.livePools} AVPlayers=${k.livePlayers} (created ${k.pools}/${k.players}), new BGM play()=${bgm ? bgm.plays : -1} ` +
        `playing=${bgm ? isPlaying(bgm) : false}, BGM play() total ${bgmPlays0} → ${bgmPlays1}; gen ${gen0} → after release ${genRel} → after rebuild ${LA.gen} (exactly +1)`);
    }
    // ———— 进桌后大厅 BGM 淡出票（负责人，#296 之后）：真 Lobby.onPageHide / onPageShow + 真 LobbyAudio（假 media）。
    const coldLobby = async (wx, name) => {
      wx.rm.pages = [];
      const L = wx.newLobby(name);
      wx.rm.params = undefined;
      L.aboutToAppear(); L.onPageShow();
      wx.rm.pages = [{ name: 'Lobby', inst: L }];
      await settle();
      wx.clk.advance(12000);
      await settle();
      return L;
    };
    const nextTable = (wx, t) => { // a new Table for match n (same harness class), director / engine back to a running match
      const tn = new t.constructor();
      tn.bindPause();
      Object.assign(wx.engine.snap, { phase: PhaseE.TURN, startedAt: wx.clk.now });
      wx.director.state = PSt.RUNNING; wx.director.reason = '';
      return tn;
    };
    // (1) push 进桌、大厅留在栈上：大厅页 onPageHide → BGM / 环境床 400 ms 淡出后 pause()；整局实际音量 0、不再 play()；离局回大厅（初始化大厅 onPageShow →
    //     playIfIdle）同一组播放器恢复。连打两局：BGM play() 次数 = 回大厅次数，池始终 1、播放器始终 2（不建新播放器、不重建池）。
    hideOnPush: {
      const hs = await makeLeaveWorld(true);
      const { t, clk: c, rm, fm, LbR, LA, lw } = hs;
      const L0 = await coldLobby(hs, 'L0-stays');
      const bgm = LA.bgmPlayer;
      const amb = LA.ambPlayer;
      if (bgm === null || amb === null) { fail(`lobby-bgm-hide-on-push: cold lobby built no BGM / amb player (bgm=${bgm !== null} amb=${amb !== null})`); break hideOnPush; }
      const cold = { bgm: bgm ? bgm.plays : -1, amb: amb ? amb.plays : -1, playing: bgm !== null && amb !== null && isPlaying(bgm) && isPlaying(amb),
        vol: bgm ? bgm.vols[bgm.vols.length - 1] : NaN };
      const match = async (L, tbl) => {
        LbR.toTable(); // pushUrl
        rm.pages.push({ name: 'Table', inst: tbl });
        const m0 = { b: bgm.acts.length, a: amb.acts.length };
        L.onPageHide();
        c.advance(LA.HIDE_FADE_MS - 40);
        await settle();
        const early = { b: bgm.acts.slice(m0.b), a: amb.acts.slice(m0.a) };
        c.advance(40);
        await settle();
        const fadeB = bgm.acts.slice(m0.b);
        const fadeA = amb.acts.slice(m0.a);
        const m1 = { b: bgm.acts.length, a: amb.acts.length };
        c.advance(60000); // the whole match, lobby still on the stack
        await settle();
        const sb = silentSince(bgm, m1.b);
        const sa = silentSince(amb, m1.a);
        const vB = fadeB.filter((x) => x.startsWith('vol:')).map((x) => Number(x.slice(4)));
        return {
          early: !early.b.includes('pause') && !early.a.includes('pause') && early.b.some((x) => x.startsWith('vol:')),
          fade: vB.length >= 10 && vB.every((v, i) => i === 0 || v <= vB[i - 1]) && vB[vB.length - 1] === 0 &&
            fadeB[fadeB.length - 1] === 'pause' && fadeA[fadeA.length - 1] === 'pause' && fadeB.filter((x) => x === 'pause').length === 1 &&
            !fadeB.includes('stop') && !fadeB.includes('play'),
          steps: vB.length, from: vB[0],
          silent: sb.noPlay && sb.vols0 && sb.lastPause && sb.lastVol === 0 && sa.noPlay && sa.vols0 && sa.lastPause && sa.lastVol === 0,
          stays: rm.pages[0].inst === L0 && !bgm.released && !amb.released
        };
      };
      const r1 = await match(L0, t);
      await confirmLeave(t, 0);
      await hs.land(0, 'newFirst'); // init lobby L1 (L0 still under it)
      c.advance(1000);
      await settle();
      const back1 = { bgm: bgm.plays, amb: amb.plays, playing: isPlaying(bgm) && isPlaying(amb), vol: bgm.vols[bgm.vols.length - 1], pools: fm.pools.length, players: fm.players.length };
      ok(cold.bgm === 1 && cold.amb === 1 && cold.playing && Math.abs(cold.vol - LA.VOL_BGM_STEADY) < 1e-12 && r1.early && r1.fade && r1.silent && r1.stays &&
        lw.lobbies[1].lobbyInit === true && back1.bgm === 2 && back1.amb === 2 && back1.playing && Math.abs(back1.vol - LA.VOL_BGM_STEADY) < 1e-12 &&
        LA.bgmPlayer === bgm && LA.ambPlayer === amb && back1.pools === 1 && back1.players === 2,
        `lobby-bgm-hide-on-push (Lobby pushes Table, lobby stays on the stack): cold BGM/amb play()=${cold.bgm}/${cold.amb} at ${cold.vol}; onPageHide → ` +
        `no pause before ${LA.HIDE_FADE_MS - 40} ms=${r1.early}, ${r1.steps} fade steps ${r1.from} → 0 then one pause() at ${LA.HIDE_FADE_MS} ms (no stop / release)=${r1.fade}; ` +
        `whole match: no play(), every volume 0, paused=${r1.silent} (lobby kept=${r1.stays}); back to the lobby (init lobby onPageShow → playIfIdle): ` +
        `same players=${LA.bgmPlayer === bgm && LA.ambPlayer === amb} BGM/amb play()=${back1.bgm}/${back1.amb} playing=${back1.playing} volume ${back1.vol}; ` +
        `pools=${back1.pools} AVPlayers=${back1.players}`);
      const L1 = lw.lobbies[1];
      const t2 = nextTable(hs, t);
      const r2 = await match(L1, t2);
      await confirmLeave(t2, 0);
      await hs.land(1, 'oldFirst');
      c.advance(1000);
      await settle();
      const returns = lw.lobbies.length - 1; // L0 = cold start; every later lobby = one return
      ok(r2.fade && r2.silent && returns === 2 && bgm.plays - cold.bgm === returns && amb.plays - cold.amb === returns && isPlaying(bgm) && isPlaying(amb) &&
        fm.pools.length === 1 && fm.players.length === 2 && fm.calls.pool === 1 && fm.calls.player === 2 && LA.bgmPlayer === bgm,
        `lobby-bgm-hide two matches in a row: match 2 fade+pause=${r2.fade} silent=${r2.silent}; returns to the lobby=${returns}, BGM play() after cold start ` +
        `+${bgm.plays - cold.bgm} (amb +${amb.plays - cold.amb}) = returns, playing=${isPlaying(bgm)}; SoundPool created ${fm.calls.pool}× (pools ${fm.pools.length}), ` +
        `AVPlayer created ${fm.calls.player}× (players ${fm.players.length})`);
    }
    // (2) onPageShow → playIfIdle 是恢复的唯一入口（back 回本页 / 回前台，没有新大厅 begin()）：Records push 盖住大厅 → 淡出暂停 → back → 同一组播放器 play() 一次；
    //     400 ms 内又可见（淡出还没到 pause）→ 撤销暂停淡回常驻，不 play()、不 pause()。
    showAfterBack: {
      const bs = await makeLeaveWorld(true);
      const { clk: c, fm, LbR, LA, rm } = bs;
      const L0 = await coldLobby(bs, 'L0');
      const bgm = LA.bgmPlayer;
      if (bgm === null) { fail('lobby-bgm-show-after-back: cold lobby built no BGM player'); break showAfterBack; }
      const p0 = bgm ? bgm.plays : -1;
      LbR.toRecords();
      rm.pages.push({ name: 'Report', inst: { aboutToDisappear: () => {} } });
      L0.onPageHide();
      c.advance(5000);
      await settle();
      const hid = { paused: bgm.acts.filter((a) => !a.startsWith('vol:')).pop() === 'pause', vol: bgm.vols[bgm.vols.length - 1] };
      rm.pages.pop();
      L0.onPageShow(); // router.back() → Lobby page shown again
      c.advance(1000);
      await settle();
      const back = { plays: bgm.plays, playing: isPlaying(bgm), vol: bgm.vols[bgm.vols.length - 1] };
      const mk = bgm.acts.length;
      L0.onPageHide();
      c.advance(200); // shown again inside the 400 ms fade
      await settle();
      L0.onPageShow();
      c.advance(1000);
      await settle();
      const quick = bgm.acts.slice(mk).filter((a) => !a.startsWith('vol:'));
      ok(p0 === 1 && hid.paused && hid.vol === 0 && back.plays === 2 && back.playing && Math.abs(back.vol - LA.VOL_BGM_STEADY) < 1e-12 &&
        quick.length === 0 && bgm.plays === 2 && isPlaying(bgm) && Math.abs(bgm.vols[bgm.vols.length - 1] - LA.VOL_BGM_STEADY) < 1e-12 &&
        LA.bgmPlayer === bgm && fm.pools.length === 1 && fm.players.length === 2,
        `lobby-bgm-show-after-back (Records push → back, no new lobby): hidden → paused=${hid.paused} volume ${hid.vol}; onPageShow → playIfIdle → same player play() ${p0} → ${back.plays}, ` +
        `playing=${back.playing} volume ${back.vol}; shown again 200 ms into the fade → acts [${quick.join(',') || 'none'}] (no play / pause), play() stays ${bgm.plays}, ` +
        `volume back to ${bgm.vols[bgm.vols.length - 1]}; pools=${fm.pools.length} AVPlayers=${fm.players.length}`);
    }
    // (3) 同代 prepare 失败可重试（负责人第 2 条）：冷启动第一次 createSoundPool 抛错 → 下一次回大厅（离局 → 初始化大厅 onPageShow / begin()）重建成功：池 1、BGM 在响。
    {
      const fs = await makeLeaveWorld(true);
      const { t, clk: c, rm, fm, LbR, LA } = fs;
      fm.fail.pool = 1;
      const L0 = await coldLobby(fs, 'L0');
      const before = { pools: fm.pools.length, pool: LA.pool, players: fm.players.length, bgmPlaying: LA.bgmPlayer !== null && isPlaying(LA.bgmPlayer) };
      LbR.toTable();
      rm.pages.push({ name: 'Table', inst: t });
      L0.onPageHide();
      c.advance(30000);
      await settle();
      await confirmLeave(t, 0);
      await fs.land(0, 'newFirst');
      c.advance(1000);
      await settle();
      const bgm = LA.bgmPlayer;
      const livePools = fm.pools.filter((p) => !p.released).length;
      ok(fm.failed.pool === 1 && before.pools === 0 && before.pool === null && before.players === 2 && before.bgmPlaying && fm.calls.pool === 2 &&
        fm.pools.length === 1 && livePools === 1 && LA.pool === fm.pools[0] && fm.pools[0].loaded.length === 4 && fm.players.length === 2 &&
        bgm !== null && isPlaying(bgm) && bgm.plays === 2,
        `lobby-audio prepare retry after createSoundPool failure: cold createSoundPool threw (${fm.failed.pool}×) → pools=${before.pools}, beds built=${before.players}, ` +
        `BGM playing=${before.bgmPlaying}; next return to the lobby → createSoundPool called ${fm.calls.pool}× total, live pools=${livePools} (loaded ${fm.pools[0] ? fm.pools[0].loaded.length : 0} sounds), ` +
        `AVPlayers=${fm.players.length}, BGM playing=${bgm ? isPlaying(bgm) : false} play()=${bgm ? bgm.plays : -1}`);
    }
    // (3b) 建床失败那一支：冷启动第一次 createAVPlayer（BGM 床）抛错 → 大厅没有 BGM；下一次回大厅补建 BGM 床（只补缺的那张，环境床不重建）并在响。
    {
      const fb = await makeLeaveWorld(true);
      const { t, clk: c, rm, fm, LbR, LA } = fb;
      fm.fail.player = 1;
      const L0 = await coldLobby(fb, 'L0');
      const before = { bgm: LA.bgmPlayer, amb: LA.ambPlayer, players: fm.players.length, pools: fm.pools.length };
      LbR.toTable();
      rm.pages.push({ name: 'Table', inst: t });
      L0.onPageHide();
      c.advance(30000);
      await settle();
      await confirmLeave(t, 0);
      await fb.land(0, 'newFirst');
      c.advance(1000);
      await settle();
      const bgm = LA.bgmPlayer;
      ok(fm.failed.player === 1 && before.bgm === null && before.amb !== null && before.players === 1 && before.pools === 1 && fm.calls.player === 3 &&
        fm.players.length === 2 && LA.ambPlayer === before.amb && bgm !== null && bgm !== before.amb && isPlaying(bgm) && bgm.plays === 1 &&
        Math.abs(bgm.vols[bgm.vols.length - 1] - LA.VOL_BGM_STEADY) < 1e-12 && fm.pools.length === 1,
        `lobby-audio prepare retry after createAVPlayer failure: cold BGM bed threw (${fm.failed.player}×) → BGM player=${before.bgm === null ? 'none' : 'yes'}, amb built, players=${before.players}; ` +
        `next return → createAVPlayer called ${fm.calls.player}× total, BGM bed rebuilt=${bgm !== null}, amb kept=${LA.ambPlayer === before.amb}, players=${fm.players.length}, ` +
        `BGM playing=${bgm ? isPlaying(bgm) : false} play()=${bgm ? bgm.plays : -1} volume ${bgm ? bgm.vols[bgm.vols.length - 1] : NaN}, pools=${fm.pools.length}`);
    }
    // ⑲ 页栈小修（负责人，#307 合入后开）：真 Lobby（aboutToAppear / begin / tryEnterTable / rollbackTablePush / lockThenPeekTable）+ 真 LbRouter
    //     + 真 LobbyAudio（假 media）。router 模型维护页栈：push / replace 落地由测试推进；router.clear() 只留栈顶、下面每页 aboutToDisappear（从栈底往上）。
    // (1) 连打两局（push 进桌 → 离局 replace 回新大厅 ×2）：每个新初始化大厅 clear 一次 → 栈深始终 1；被清掉的旧大厅已不是音频持有者 →
    //     LobbyAudio 不 leaveThenRelease / 不 release、gen 不变、同一个 BGM 播放器在放。
    for (const order of ['newFirst', 'oldFirst']) {
      const sw = await makeLeaveWorld(true);
      const { t, clk: c, rm, fm, LbR, LA, lw } = sw;
      await coldLobby(sw, 'L0-cold');
      const bgm = LA.bgmPlayer;
      const gen0 = LA.gen;
      const spy = { leaveRelease: 0, release: 0 };
      const lrel0 = LA.leaveThenRelease;
      const rel0 = LA.release;
      LA.leaveThenRelease = function leaveThenRelease() { spy.leaveRelease++; return lrel0.call(this); };
      LA.release = function release() { spy.release++; return rel0.call(this); };
      const depths = [];
      let tbl = t;
      for (let k = 0; k < 2; k++) {
        const Lk = rm.pages[rm.pages.length - 1].inst;
        LbR.toTable(); // Lobby.tryEnterTable → pushUrl, lobby stays under the table
        rm.pages.push({ name: 'Table', inst: tbl });
        Lk.onPageHide();
        c.advance(30000);
        await settle();
        await confirmLeave(tbl, 0);
        await sw.land(k, order); // Table → new init lobby (aboutToAppear registers the audio owner → begin() → clear)
        c.advance(1000);
        await settle();
        depths.push(rm.pages.length);
        if (k === 0) tbl = nextTable(sw, t);
      }
      const top = rm.pages[rm.pages.length - 1];
      ok(JSON.stringify(depths) === '[1,1]' && rm.clears === 2 && JSON.stringify(rm.depthAtClear) === '[2,2]' && lw.lobbies.length === 3 &&
        lw.lobbies.every((L) => L.lobbyInit) && top.inst === lw.lobbies[2] && rm.backs === 0 && LA.gen === gen0 && spy.leaveRelease === 0 && spy.release === 0 &&
        bgm !== null && LA.bgmPlayer === bgm && !bgm.released && isPlaying(bgm) && fm.pools.length === 1 && fm.players.length === 2,
        `pagestack two matches in a row [${order === 'newFirst' ? 'new appear → old disappear' : 'old disappear → new appear'}]: stack depth after each return ` +
        `${JSON.stringify(depths)} (router.clear()=${rm.clears}, depth at clear ${JSON.stringify(rm.depthAtClear)}, back()=${rm.backs}), lobbies=${lw.lobbies.length} all init=` +
        `${lw.lobbies.every((L) => L.lobbyInit)}; LobbyAudio gen ${gen0} → ${LA.gen}, leaveThenRelease=${spy.leaveRelease} release=${spy.release}, ` +
        `same BGM player=${LA.bgmPlayer === bgm} playing=${bgm ? isPlaying(bgm) : false}; pools=${fm.pools.length} AVPlayers=${fm.players.length}`);
    }
    // (2) 进桌 pushUrl 失败（L1 遮罩 + 横屏中）：回滚 = 停导演 → 引擎回 LOBBY → 锁竖屏 → 竖屏落定后才撤遮罩（matchLoading=false，22:210 先竖屏再见大厅）。
    //     lockPortrait 由测试挂住：挂住期间遮罩必须还在。LobbyAudio 不动：不 fade / 不 leaveThenRelease / 不 release、gen 不变、没有被 hide 暂停、BGM 一直在放。
    pushFail: {
      const pf = await makeLeaveWorld(true);
      const { clk: c, rm, LbR, LA, lw } = pf;
      const L0 = await coldLobby(pf, 'L0');
      const bgm = LA.bgmPlayer;
      if (bgm === null) { fail('pagestack push-failure rollback: cold lobby built no BGM player'); break pushFail; }
      const gen0 = LA.gen;
      const acts0 = bgm.acts.length;
      const spy = { fade: 0, leaveRelease: 0, release: 0 };
      const fade0 = LA.fadeOutForHide;
      const lrel0 = LA.leaveThenRelease;
      const rel0 = LA.release;
      LA.fadeOutForHide = function fadeOutForHide() { spy.fade++; return fade0.call(this); };
      LA.leaveThenRelease = function leaveThenRelease() { spy.leaveRelease++; return lrel0.call(this); };
      LA.release = function release() { spy.release++; return rel0.call(this); };
      let loading = true;
      Object.defineProperty(L0, 'matchLoading', { configurable: true, get: () => loading, set: (v) => { loading = v; if (!v) lw.log.push('reveal'); } });
      Object.assign(L0, { matchBusy: true, matchLoadAxisDone: true, matchLoadPersistDone: true });
      let openPortrait = null;
      lw.portraitGate = () => new Promise((res) => { openPortrait = res; });
      lw.log.length = 0;
      const stops0 = lw.lobbyStops;
      const resets0 = lw.resets;
      rm.pushFail = true;
      lw.la.calls.length = 0;
      lw.la.watch = true; // 从这里起大厅页对 LobbyAudio 的任何方法调用都记下来
      L0.tryEnterTable(); // startMatch → director.start → LbRouter.toTable() → pushUrl rejects
      await settle();
      const held = { loading, busy: L0.matchBusy, log: lw.log.join(' → ') };
      if (openPortrait) openPortrait();
      await settle();
      c.advance(1000);
      await settle();
      const tail = bgm.acts.slice(acts0).filter((a) => !a.startsWith('vol:'));
      const seq = lw.log.join(' → ');
      ok(rm.pushCalls === 1 && held.loading === true && held.busy === true &&
        held.log === 'engine.startMatch:4 → director.start → director.stop → engine.resetToLobby → portrait:req' &&
        seq === 'engine.startMatch:4 → director.start → director.stop → engine.resetToLobby → portrait:req → portrait:done → reveal' &&
        lw.lobbyStops === stops0 + 1 && lw.resets === resets0 + 1 && loading === false && L0.matchBusy === false && L0.matchLoadAxisDone === false &&
        L0.matchLoadPersistDone === false && rm.pages.length === 1 && rm.pages[0].inst === L0 && rm.replaceCalls === 0 && rm.backs === 0 &&
        spy.fade === 0 && spy.leaveRelease === 0 && spy.release === 0 && lw.la.calls.length === 0 && LA.gen === gen0 && !LA.isPausedByHide() && tail.length === 0 &&
        LA.bgmPlayer === bgm && isPlaying(bgm) && Math.abs(bgm.vols[bgm.vols.length - 1] - LA.VOL_BGM_STEADY) < 1e-12,
        `pagestack push-failure rollback (tryEnterTable): pushUrl=${rm.pushCalls} rejected; while lockPortrait is pending overlay shown=${held.loading} busy=${held.busy} ` +
        `[${held.log}]; full order [${seq}]; director.stop +${lw.lobbyStops - stops0} engine LOBBY +${lw.resets - resets0}; flags reset=` +
        `${!loading && !L0.matchBusy && !L0.matchLoadAxisDone && !L0.matchLoadPersistDone}; stack depth ${rm.pages.length}, replace=${rm.replaceCalls} back=${rm.backs}; ` +
        `LobbyAudio fadeOutForHide=${spy.fade} leaveThenRelease=${spy.leaveRelease} release=${spy.release} calls from the lobby [${lw.la.calls.join(',') || 'none'}] ` +
        `gen ${gen0} → ${LA.gen} pausedByHide=${LA.isPausedByHide()}, ` +
        `BGM acts since push [${tail.join(',') || 'none'}] playing=${isPlaying(bgm)} volume ${bgm.vols[bgm.vols.length - 1]}`);
      // 偷看桌（peek）同一回滚：先横屏 → push 失败 → 停导演 → 引擎回 LOBBY → 锁竖屏 → 露出大厅；LobbyAudio 仍不动。
      lw.portraitGate = null;
      lw.log.length = 0;
      lw.la.calls.length = 0;
      const peek0 = { stops: lw.lobbyStops, resets: lw.resets, dirStopped: pf.director.stopped, acts: bgm.acts.length };
      await L0.lockThenPeekTable();
      await settle();
      c.advance(1000);
      await settle();
      const seqPeek = lw.log.join(' → ');
      const tailPeek = bgm.acts.slice(peek0.acts).filter((a) => !a.startsWith('vol:'));
      ok(rm.pushCalls === 2 && seqPeek === 'landscape → director.stop → engine.resetToLobby → portrait:req → portrait:done → reveal' &&
        lw.lobbyStops === peek0.stops + 1 && pf.director.stopped === peek0.dirStopped + 1 && lw.resets === peek0.resets + 1 &&
        spy.fade === 0 && spy.leaveRelease === 0 && spy.release === 0 && lw.la.calls.length === 0 && LA.gen === gen0 && !LA.isPausedByHide() &&
        tailPeek.length === 0 && isPlaying(bgm) && rm.pages.length === 1,
        `pagestack push-failure rollback (peek table): order [${seqPeek}]; director.stop +${lw.lobbyStops - peek0.stops} (director stopped +${pf.director.stopped - peek0.dirStopped}), ` +
        `engine LOBBY +${lw.resets - peek0.resets}, portrait locked=${lw.log.includes('portrait:done')}; LobbyAudio calls from the lobby [${lw.la.calls.join(',') || 'none'}] ` +
        `fadeOutForHide=${spy.fade} leaveThenRelease=${spy.leaveRelease} release=${spy.release} gen ${gen0} → ${LA.gen} pausedByHide=${LA.isPausedByHide()}, ` +
        `BGM acts [${tailPeek.join(',') || 'none'}] playing=${isPlaying(bgm)}; stack depth ${rm.pages.length}`);
    }
    // (3) 再来一局 replace 到 TABLE 失败（栈 [冷启动大厅, 结算]）：LbRouter 回落回大厅 → 第二趟 replaceUrl(LOBBY)（不 back()）→ 新初始化大厅停导演 / 引擎回 LOBBY，
    //     并 clear 掉栈底旧大厅（栈深 1），音频不释放、BGM 恢复在放。
    {
      const rf = await makeLeaveWorld(true);
      const { clk: c, rm, LbR, LA, lw } = rf;
      const L0 = await coldLobby(rf, 'L0');
      const bgm = LA.bgmPlayer;
      rm.pages.push({ name: 'Report', inst: { aboutToDisappear: () => {} } });
      L0.onPageHide();
      c.advance(1000);
      await settle();
      const gen0 = LA.gen;
      const stops0 = lw.lobbyStops;
      const resets0 = lw.resets;
      let openPortrait = null;
      lw.portraitGate = () => new Promise((res) => { openPortrait = res; });
      lw.log.length = 0;
      LbR.replaceTable(); // Report.restartMatch → replaceUrl(TABLE)
      const urls0 = rm.urls.slice();
      if (rm.trips[0]) rm.trips[0].rej(new Error('replace failed (sim)'));
      await settle();
      const held = { log: lw.log.join(' → '), urls: rm.urls.length }; // 竖屏锁挂住：回落路由还不能发
      if (openPortrait) openPortrait();
      lw.portraitGate = null;
      await settle();
      const seqFallback = lw.log.join(' → ');
      const urls1 = rm.urls.slice();
      await rf.land(1, 'newFirst'); // the fallback replaceUrl(LOBBY) lands: Report → new init lobby
      c.advance(1000);
      await settle();
      const L1 = lw.lobbies[1];
      ok(JSON.stringify(urls0) === '["pages/Table"]' && JSON.stringify(urls1) === '["pages/Table","pages/Lobby"]' && rm.backs === 0 && L1 !== undefined &&
        held.log === 'replaceUrl:pages/Table → portrait:req' && held.urls === 1 &&
        seqFallback === 'replaceUrl:pages/Table → portrait:req → portrait:done → replaceUrl:pages/Lobby' &&
        L1.lobbyInit === true && lw.lobbyStops === stops0 + 1 && lw.resets === resets0 + 1 && rm.clears === 1 && rm.pages.length === 1 && rm.pages[0].inst === L1 &&
        LA.gen === gen0 && bgm !== null && LA.bgmPlayer === bgm && isPlaying(bgm),
        `pagestack replace(TABLE) failure → lobby: replaceUrl ${JSON.stringify(urls0)} rejected → ${JSON.stringify(urls1)} (back()=${rm.backs}); while the portrait lock is ` +
        `pending [${held.log}] (replaceUrl calls ${held.urls}); order [${seqFallback}]; fallback lobby init=` +
        `${L1 ? L1.lobbyInit : '-'} director.stop +${lw.lobbyStops - stops0} engine LOBBY +${lw.resets - resets0}; router.clear()=${rm.clears} stack depth ${rm.pages.length}; ` +
        `LobbyAudio gen ${gen0} → ${LA.gen}, BGM playing=${bgm ? isPlaying(bgm) : false}`);
    }
    // (3b) UI 预审：锁竖屏 reject 也不能卡住——两条路都照常往下走（不停在横屏结算 / 遮罩上）。lockPortrait 桩一律 reject；
    //      期间临时挂 unhandledRejection 监听：被漏掉的 reject 记下来判红（不让 node 直接崩掉、看不到是哪条）。
    const withUnhandled = async (fn) => {
      const seen = [];
      const h = (e) => { seen.push(e && e.message ? e.message : String(e)); };
      process.on('unhandledRejection', h);
      try { await fn(); await tickIo(); await tickIo(); } finally { process.off('unhandledRejection', h); }
      return seen;
    };
    {
      const rj = await makeLeaveWorld(true);
      const { clk: c, rm, LbR, LA, lw } = rj;
      await coldLobby(rj, 'L0');
      rm.pages.push({ name: 'Report', inst: { aboutToDisappear: () => {} } });
      const r = {};
      const unhandled = await withUnhandled(async () => {
        lw.portraitGate = () => Promise.reject(new Error('lockPortrait rejected (sim)'));
        lw.log.length = 0;
        LbR.replaceTable();
        if (rm.trips[0]) rm.trips[0].rej(new Error('replace failed (sim)'));
        await settle();
        r.seq = lw.log.join(' → ');
        r.urls = rm.urls.slice();
        await rj.land(1, 'newFirst'); // fallback lands; the new lobby's own portrait lock (aboutToAppear) also rejects → swallowed
        c.advance(1000);
        await settle();
        lw.portraitGate = null;
      });
      const L1 = lw.lobbies[1];
      ok(r.seq === 'replaceUrl:pages/Table → portrait:req → replaceUrl:pages/Lobby' && JSON.stringify(r.urls) === '["pages/Table","pages/Lobby"]' &&
        r.urls.filter((u) => u === 'pages/Lobby').length === 1 && rm.backs === 0 && unhandled.length === 0 && L1 !== undefined && L1.lobbyInit === true &&
        rm.pages.length === 1 && rm.pages[0].inst === L1 && LA.bgmPlayer !== null && isPlaying(LA.bgmPlayer),
        `pagestack replace(TABLE) failure with lockPortrait rejecting: order [${r.seq}] → toLobby replaceUrl(LOBBY)×${(r.urls || []).filter((u) => u === 'pages/Lobby').length} ` +
        `(back()=${rm.backs}), unhandled rejections=${unhandled.length}${unhandled.length ? ` (${unhandled[0]})` : ''}; fallback lobby init=${L1 ? L1.lobbyInit : '-'} ` +
        `stack depth ${rm.pages.length}, BGM playing=${LA.bgmPlayer ? isPlaying(LA.bgmPlayer) : false}`);
    }
    {
      const rj = await makeLeaveWorld(true);
      const { rm, LA, lw } = rj;
      const L0 = await coldLobby(rj, 'L0');
      let loading = true;
      Object.defineProperty(L0, 'matchLoading', { configurable: true, get: () => loading, set: (v) => { loading = v; if (!v) lw.log.push('reveal'); } });
      Object.assign(L0, { matchBusy: true, matchLoadAxisDone: true, matchLoadPersistDone: true });
      const gen0 = LA.gen;
      const unhandled = await withUnhandled(async () => {
        lw.portraitGate = () => Promise.reject(new Error('lockPortrait rejected (sim)'));
        lw.log.length = 0;
        rm.pushFail = true;
        L0.tryEnterTable();
        await settle();
        lw.portraitGate = null;
      });
      const seq = lw.log.join(' → ');
      ok(seq === 'engine.startMatch:4 → director.start → director.stop → engine.resetToLobby → portrait:req → reveal' && loading === false &&
        L0.matchBusy === false && unhandled.length === 0 && LA.gen === gen0 && LA.bgmPlayer !== null && isPlaying(LA.bgmPlayer),
        `pagestack push-failure rollback with lockPortrait rejecting: order [${seq}], overlay hidden=${!loading} busy=${L0.matchBusy}, ` +
        `unhandled rejections=${unhandled.length}${unhandled.length ? ` (${unhandled[0]})` : ''}; LobbyAudio gen ${gen0} → ${LA.gen}, BGM playing=${LA.bgmPlayer ? isPlaying(LA.bgmPlayer) : false}`);
    }
    // (4) 守卫在 await 期间的并发（负责人第 2 条补测）：假 createSoundPool / createAVPlayer 挂在假时钟上 300 ms 后才 resolve；
    //     第二次 prepare() 正好在第一次等 createSoundPool 时进来（池还是 null），第三次在等 createAVPlayer 时进来 → 都必须被同代守卫挡住。
    {
      const cw = await makeLeaveWorld(true);
      const { clk: c, rm, fm, LA } = cw;
      fm.delay.pool = 300; fm.delay.player = 300;
      rm.pages = [];
      const L0 = cw.newLobby('L0');
      rm.params = undefined;
      L0.aboutToAppear(); L0.onPageShow();
      rm.pages = [{ name: 'Lobby', inst: L0 }];
      await settle(); // begin() → prepare() #1 is waiting on createSoundPool (+300 ms on the clock)
      const inPool = { calls: fm.calls.pool, pool: LA.pool, guarded: LA.preparedGen === LA.gen };
      void LA.prepare(); // #2 enters during the createSoundPool await (not awaited: a mutated guard would hang on the fake clock)
      await settle();
      const afterSecond = fm.calls.pool;
      c.advance(300);
      await settle(); // pool #1 made + loaded → prepareBed waits on createAVPlayer
      const inBed = { pool: LA.pool !== null, playerCalls: fm.calls.player, players: fm.players.length };
      void LA.prepare(); // #3 enters during the createAVPlayer await
      await settle();
      for (let i = 0; i < 4; i++) { c.advance(300); await settle(); }
      c.advance(12000);
      await settle();
      const k = audioCensus(fm, LA);
      const bgm = LA.bgmPlayer;
      ok(inPool.calls === 1 && inPool.pool === null && inPool.guarded && afterSecond === 1 && inBed.pool && inBed.playerCalls === 1 && inBed.players === 0 &&
        fm.calls.pool === 1 && fm.calls.player === 2 && k.pools === 1 && k.players === 2 && k.livePools === 1 && k.livePlayers === 2 && k.orphans === 0 &&
        bgm !== null && bgm.plays === 1 && isPlaying(bgm),
        `lobby-audio prepare guard during the await (create* resolve +300 ms on the fake clock): 2nd prepare() while createSoundPool pending (pool=${inPool.pool === null ? 'null' : 'set'}) → ` +
        `createSoundPool calls ${afterSecond}; 3rd prepare() while createAVPlayer pending → AVPlayer calls ${fm.calls.player} in the end; pools=${k.pools} AVPlayers=${k.players} ` +
        `orphans=${k.orphans}; BGM play()=${bgm ? bgm.plays : -1} playing=${bgm ? isPlaying(bgm) : false}`);
    }
    // ⑯ 补丁轮 3 第 5 条（负责人批）：只渲染大厅 LobbyAudio.playIfIdle()。真 LobbyAudio + 真 AudioSettings（vol_bgm=50 → 增益 ≠ 1）+ 假 AVPlayer。
    // 新趟 #2 先落地（初始化大厅 L1，BGM 起），老趟 #1 迟到：L1 消失后过 gap ms 只渲染大厅 L0 才出现（交接窗 LOBBY_HANDOVER_MS = 1000）。
    const lateLobby = async (gapMs, init) => {
      const { AS } = await asCase(init);
      const lw0 = await makeLeaveWorld(false, AS);
      const { t, clk: c, rm, fm, lw, LbR, LA } = lw0;
      LbR.toTable();
      rm.pages = [tableStub(), { name: 'Table', inst: t }];
      await confirmLeave(t, 0);
      c.advance(3000);
      await drainMicrotasks();
      c.advance(10000);
      await drainMicrotasks();
      await confirmLeave(t, 1);
      await lw0.land(1, 'newFirst'); // L1 (init) up, lobby BGM playing
      const bgm1 = LA.bgmPlayer;
      const mark = bgm1 ? bgm1.acts.length : 0;
      const plays1 = bgm1 ? bgm1.plays : -1;
      const trip = rm.trips[0];
      rm.pages[rm.pages.length - 1].inst.aboutToDisappear(); // old trip #1 lands: L1 goes …
      c.advance(gapMs);
      await settle();
      const L0 = lw0.newLobby('L0-late'); // … and the render-only lobby appears gapMs later
      rm.params = trip.opt.params;
      L0.aboutToAppear();
      rm.pages[rm.pages.length - 1] = { name: 'Lobby', inst: L0 };
      trip.res();
      await settle();
      c.advance(3000);
      await settle();
      const live = LA.bgmPlayer;
      const acts = live ? live.acts.filter((a) => !a.startsWith('vol:')) : [];
      return { LA, fm, lw, L0, bgm1, plays1, mark, live, lastAct: acts[acts.length - 1], lastVol: live ? live.vols[live.vols.length - 1] : NaN,
        rebuilt: fm.pools.length > 1, oldActs: bgm1 ? bgm1.acts.slice(mark).filter((a) => !a.startsWith('vol:')) : [] };
    }
    {
      const slow = await lateLobby(1500, { vol_bgm: 50, vol_sfx: 100, mute_all: false });
      const want = slow.LA.VOL_BGM_STEADY * 0.5;
      const mid = await lateLobby(1200, { vol_bgm: 50, vol_sfx: 100, mute_all: false });
      ok(slow.L0.lobbyInit === false && slow.bgm1 !== null && slow.bgm1.released && slow.rebuilt && slow.live !== null && slow.live !== slow.bgm1 &&
        !slow.live.released && slow.live.plays === 1 && slow.lastAct === 'play' && Math.abs(slow.lastVol - want) < 1e-12 &&
        mid.L0.lobbyInit === false && mid.live === mid.bgm1 && !mid.live.released && mid.live.plays === mid.plays1 && mid.plays1 === 1 && !mid.rebuilt &&
        !mid.oldActs.some((a) => a === 'play' || a === 'pause' || a === 'stop' || a === 'reset' || a.startsWith('seek')) && Math.abs(mid.lastVol - want) < 1e-12,
        `lobby-bgm-late-render-only (vol_bgm=50): gap 1500 ms (> handover 1000 + leave fade 400 → released) → render-only lobby rebuilt BGM: play()=${slow.live ? slow.live.plays : -1}, ` +
        `last=${slow.lastAct}, volume=${slow.lastVol} (VOL_BGM_STEADY ${slow.LA.VOL_BGM_STEADY} × 0.5 = ${want}), old player released=${slow.bgm1 && slow.bgm1.released}; ` +
        `gap 1200 ms (mid leave-fade) → same player kept (play()=${mid.live ? mid.live.plays : -1}, no re-play [${mid.oldActs.join(',') || 'none'}]), fade back to ${mid.lastVol}`);
      const muted = await lateLobby(1500, { vol_bgm: 50, vol_sfx: 100, mute_all: true });
      ok(muted.live !== null && muted.live.plays === 1 && muted.live.vols.length > 0 && muted.live.vols.every((v) => v === 0) && muted.lastVol === 0,
        `lobby-bgm-late-render-only mute_all=true: rebuilt BGM play()=${muted.live ? muted.live.plays : -1}, every volume sent 0 (${JSON.stringify([...new Set(muted.live ? muted.live.vols : [])])})`);
      const fast = await lateLobby(300, { vol_bgm: 50, vol_sfx: 100, mute_all: false });
      ok(fast.L0.lobbyInit === false && fast.live === fast.bgm1 && fast.live.plays === 1 && fast.plays1 === 1 && !fast.live.released && !fast.rebuilt &&
        fast.fm.players.length === 2 && fast.oldActs.length === 0 && Math.abs(fast.lastVol - fast.LA.VOL_BGM_STEADY * 0.5) < 1e-12,
        `lobby-bgm-fast-render-only (gap 300 ms, BGM still playing): play() stays ${fast.live ? fast.live.plays : -1}, same player, no stop/seek/reset/pause/play ` +
        `[${fast.oldActs.join(',') || 'none'}], players=${fast.fm.players.length}, pools=${fast.fm.pools.length}, volume ${fast.lastVol}`);
    }
    // Controls (no false positives): cold start (no ticket), RECAP → Report → toLobby (no ticket), one normal leave; the lobby that later exits releases audio.
    {
      const cs = await makeLeaveWorld(true);
      cs.rm.pages = [];
      const L0 = cs.newLobby('cold');
      cs.rm.params = undefined;
      L0.aboutToAppear();
      await settle();
      cs.clk.advance(12000);
      await settle();
      const b0 = bgmOf(cs.fm);
      const rep = await makeLeaveWorld(false);
      rep.LbR.toTable();
      rep.rm.params = undefined; // Report → LbRouter.toLobby() carries no ticket
      const Lr = rep.newLobby('fromReport');
      Lr.aboutToAppear();
      await settle();
      rep.clk.advance(3000);
      await settle();
      const one = await makeLeaveWorld(false);
      one.LbR.toTable();
      one.rm.pages = [{ name: 'Lobby', inst: { aboutToDisappear: () => {} } }, { name: 'Table', inst: one.t }];
      await confirmLeave(one.t, 0);
      await one.land(0, 'newFirst');
      const b1 = bgmOf(one.fm);
      const playsBeforeExit = b1 ? b1.plays : -1;
      one.lw.lobbies[0].aboutToDisappear(); // app exit later
      one.clk.advance(3000);
      await settle();
      ok(L0.lobbyInit && cs.lw.resets === 1 && b0 !== undefined && b0.plays === 1 && Lr.lobbyInit && rep.lw.resets === 1 && (bgmOf(rep.fm) || { plays: -1 }).plays === 1 &&
        one.lw.lobbies[0].lobbyInit && one.lw.resets === 1 && playsBeforeExit === 1 && b1.released,
        `leave-token controls: cold start (no ticket) init=${L0.lobbyInit} reset=${cs.lw.resets} BGM play()=${b0 ? b0.plays : -1}; ` +
        `Report → toLobby (no ticket) init=${Lr.lobbyInit} BGM play()=${(bgmOf(rep.fm) || { plays: -1 }).plays}; single leave init=${one.lw.lobbies[0].lobbyInit} BGM play()=${playsBeforeExit}, ` +
        `that lobby exiting later releases audio=${b1 && b1.released}`);
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
    // ⑮ 补丁轮 2 第 2 段：暂停期间不能出牌（真 Table.onPauseState / cancelPlaySheet / closePeek / beginHumanPlay）。
    // (a) 暂停那一刻出牌面板开着 → 关面板 + 清空选牌 + 关偷看；恢复后不自动重开。
    {
      const { t, director, engine } = await makeWorld();
      t.showPlay = true; t.showPeek = true; t.selectedIds = ['c1', 'c2'];
      director.requestPause(PRs.BACKGROUND);
      await drainMicrotasks();
      const atPause = { play: t.showPlay, peek: t.showPeek, sel: t.selectedIds.length };
      t.resumeFromPauseLayer();
      await drainMicrotasks();
      ok(!atPause.play && !atPause.peek && atPause.sel === 0 && engine.cancelPlayCalls === 1 && audio.log.includes('privacy:false') &&
        t.showPlay === false && t.showPeek === false && t.selectedIds.length === 0 && director.state === PSt.RUNNING && audio.spPause === 1,
        `pause-closes-play-sheet (sheet open): at pause showPlay=${atPause.play} showPeek=${atPause.peek} selected=${atPause.sel} (engine.cancelPlay=${engine.cancelPlayCalls}); ` +
        `after resume showPlay=${t.showPlay} showPeek=${t.showPeek} selected=${t.selectedIds.length} (not reopened); SoundPlayer.pauseForGame=${audio.spPause}`);
    }
    // (b) PAU-12b：面板没开、手牌直选 + 确认条 → 暂停 → 恢复：选牌保留（21 §3.3 第 14 项，21:396）、确认条照常显示。
    {
      const { t, director, engine } = await makeWorld();
      t.selectedIds = ['c1']; t.confirmBarOn = true;
      director.requestPause(PRs.BACKGROUND);
      t.resumeFromPauseLayer();
      await drainMicrotasks();
      ok(JSON.stringify(t.selectedIds) === '["c1"]' && t.confirmBarOn === true && t.showPlay === false && engine.cancelPlayCalls === 0,
        `pause-keeps-hand-select (PAU-12b, sheet closed): after resume selected=${JSON.stringify(t.selectedIds)} confirmBar=${t.confirmBarOn} cancelPlay=${engine.cancelPlayCalls}`);
    }
    // (c) Table 门：已暂停 → beginHumanPlay 打不到 engine.submitPlay（不飞牌、不放音、不锁 confirmBusy）；恢复后同一调用照常提交。
    {
      const { t, director, engine } = await makeWorld();
      t.selectedIds = ['c1'];
      director.requestPause(PRs.BACKGROUND);
      t.beginHumanPlay('SOFT', -1);
      const paused = { submit: engine.submitPlayCalls, fly: t.calls.includes('fly'), launch: audio.launch, busy: t.confirmBusy };
      t.resumeFromPauseLayer();
      t.beginHumanPlay('SOFT', -1);
      ok(paused.submit === 0 && !paused.fly && paused.launch === 0 && !paused.busy && engine.submitPlayCalls === 1,
        `pause-gate Table.beginHumanPlay: while PAUSED engine.submitPlay calls=${paused.submit}, fly=${paused.fly}, launch SFX=${paused.launch}; control after resume submitPlay calls=${engine.submitPlayCalls}`);
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

// ---------------------------------------------------------------- ⑮ 补丁轮 2：真 MatchEngine 方法（submitPlay 暂停门 / pause·resumeClock）+ 真 MatchDirector 暂停机
// 方法体原样取自 MatchEngine.ets / MatchDirector.ets（只去类型），挂在最小宿主类上跑；AI / 规则其余部分不加载（不改引擎）。
const ENGINE_SIGS = ['  submitPlay(cardIds: string[], style: PlayStyle, speech: string, namedSeatId: number): boolean {', '  pauseClock(wallMs: number): void {',
  '  resumeClock(wallMs: number, shiftMs: number): number {', '  earliestDeadline(): number {', '  clockPausedAtMs(): number {', '  isClockPaused(): boolean {'];
const DIR_SIGS = ['  requestPause(reason: string): PauseState {', '  resumeFromPause(): number {', '  pauseStateNow(): PauseState {', '  isPaused(): boolean {',
  '  isPausePending(): boolean {', '  pauseReasonNow(): string {', '  setSequenceBusyProbe(probe: SequenceBusyProbe | null): void {',
  '  setPendingDeadlineProbe(probe: PendingDeadlineProbe | null): void {', '  addPauseListener(fn: PauseListener): void {', '  private enterPaused(): void {',
  '  private sequenceBusy(snap: MatchSnapshot): boolean {', '  private isLivePhase(phase: Phase): boolean {', '  private notifyPause(shiftMs: number): void {', '  tick(): void {'];
const missEng = ENGINE_SIGS.filter((sg) => body(engine, sg).length === 0);
const missDir = DIR_SIGS.filter((sg) => body(dir, sg).length === 0);
ok(missEng.length === 0 && missDir.length === 0, `engine/director harness: ${ENGINE_SIGS.length} MatchEngine + ${DIR_SIGS.length} MatchDirector methods found (${[...missEng, ...missDir].join(' | ') || 'ok'})`);
const engineHarnessJs = `class EngineHarness {
  constructor() {
    Object.assign(this, { clockPausedAt: 0, nowMs: 0, pausedTotalMs: 0, turnEndsAtMs: 0, ritualEndsAtMs: 0, beatEndsAtMs: 0, penaltyEndsAtMs: 0,
      phase: Phase.TURN, cfg: { min_play_cards: 1, max_play_cards: 3, max_slam_per_game: 1, max_hesitate_per_game: 1 }, turnWindow: '',
      currentSeatId: 0, slamUsed: 0, hesitateUsed: 0, touched: [] });
  }
  currentIsGhost() { this.touched.push('currentIsGhost'); return false; }
  handOf() { this.touched.push('handOf'); return [{ id: 'c1' }, { id: 'c2' }]; }
  takeFromHand(s, id) { this.touched.push('take'); return { id }; }
  returnCards() {}
  commitPicked() { this.touched.push('commit'); }
  current() { return { phase: this.phase }; }
  pulse() {} humanMustWait() { return true; } isDemoMatch() { return false; } pausedTotalAt() { return 0; }
${stripEts(ENGINE_SIGS.map((sg) => body(engine, sg) + '\n  }\n').join('\n'), ['CardModel[]', 'string[]', 'PlayStyle', 'number[]', 'number', 'boolean', 'string'])}
}
export { EngineHarness };`;
const dirHarnessJs = `class DirectorHarness {
  constructor(engine) {
    Object.assign(this, { engine, live: null, pauseState: PauseState.RUNNING, pauseReason: '', pauseListeners: [], seqBusyProbe: null, deadlineProbe: null,
      resumeHoldUntilMs: 0, pendingSinceMs: 0, thinkUntilMs: 0, playBusy: false, log: [] });
  }
  pushLive() {} armIfNeeded() {} runAi() { this.log.push('runAi'); }
${stripEts(DIR_SIGS.map((sg) => body(dir, sg) + '\n  }\n').join('\n'),
  ['MatchSnapshot | null', 'MatchSnapshot', 'PendingDeadlineProbe | null', 'SequenceBusyProbe | null', 'PauseListener[]', 'PauseListener', 'PauseState',
    'RecordCommit', 'Phase', 'number[]', 'number', 'boolean', 'string'])}
}
export { DirectorHarness };`;
if (RSh) {
  const PhaseE2 = enumObj('Phase');
  const loadEngDir = async (clk) => {
    const EH = (await importFresh(engineHarnessJs, { Phase: PhaseE2, TurnWindow: enumObj('TurnWindow'), PlayStyle: enumObj('PlayStyle'),
      Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'MatchEngine' })).EngineHarness;
    const DH = (await importFresh(dirHarnessJs, { PauseState: PSt, PauseReasons: PRs, Phase: PhaseE2, ResumeShift: RSh, RESUME_GRACE_MS: graceMs,
      PENDING_CAP_MS: capMs, RecordStore: { commitOnce: () => false }, Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'MatchDirector',
      ...clockStubs(clk) })).DirectorHarness;
    const eng = new EH();
    const d = new DH(eng);
    const states = [];
    d.addPauseListener((st, sh) => states.push([st, sh]));
    return { eng, d, states };
  };
  // 第 2 段 engine 门：暂停中 submitPlay 直接 false，规则路径一步都不走（不读手牌 / 不判 ghost / 不提交）。
  {
    const clk = makeClock(10000);
    const { eng } = await loadEngDir(clk);
    eng.pauseClock(10000);
    const r = eng.submitPlay(['c1'], 'SOFT', '', -1);
    const touchedPaused = eng.touched.length;
    eng.resumeClock(10500, 0);
    const r2 = eng.submitPlay(['c1'], 'SOFT', '', -1);
    ok(r === false && touchedPaused === 0 && r2 === true && eng.touched.includes('commit'),
      `pause-gate MatchEngine.submitPlay (real method): paused → ${r}, rule path touched=${touchedPaused}; control after resumeClock → ${r2} (committed)`);
  }
  // 闸缺口：真 MatchDirector —— 序列中请求暂停进 PENDING，序列放完 tick 进 PAUSED（引擎时钟此刻才冻）。
  {
    const clk = makeClock(20000);
    const { eng, d, states } = await loadEngDir(clk);
    let busy = true;
    d.setSequenceBusyProbe(() => busy);
    const st = d.requestPause(PRs.USER);
    const frozenEarly = eng.clockPausedAt;
    for (let i = 0; i < 3; i++) { clk.advance(200); d.tick(); }
    const midState = d.pauseStateNow();
    busy = false;
    clk.advance(200);
    d.tick();
    ok(st === PSt.PENDING && frozenEarly === 0 && midState === PSt.PENDING && d.isPaused() && eng.clockPausedAt === clk.now &&
      states.map((x) => x[0]).join('>') === `${PSt.PENDING}>${PSt.PAUSED}`,
      `real MatchDirector: pause during a sequence → ${st} (engine clock not frozen), still ${midState} while busy, sequence ends → PAUSED at tick (engine paused at ${eng.clockPausedAt - 20000} ms); listeners ${states.map((x) => x[0]).join('>')}`);
  }
  // 闸缺口：真 MatchDirector —— 序列永不结束，满 PENDING_CAP_MS 强停。
  {
    const clk = makeClock(30000);
    const { d } = await loadEngDir(clk);
    d.setSequenceBusyProbe(() => true);
    d.requestPause(PRs.USER);
    clk.advance(capMs - 1);
    d.tick();
    const before = d.pauseStateNow();
    clk.advance(1);
    d.tick();
    ok(before === PSt.PENDING && d.isPaused(), `real MatchDirector PENDING_CAP_MS: still ${before} at +${capMs - 1} ms, forced PAUSED at +${capMs} ms`);
  }
  // 闸缺口：真 resumeFromPause + 真 MatchEngine.resumeClock —— 4 个 deadline 同一平移、最早一项距恢复 = RESUME_GRACE_MS、未武装的不动。
  {
    const clk = makeClock(40000);
    const { eng, d, states } = await loadEngDir(clk);
    eng.turnEndsAtMs = 41000; eng.beatEndsAtMs = 40300; eng.ritualEndsAtMs = 0; eng.penaltyEndsAtMs = 45000;
    d.requestPause(PRs.USER);
    clk.advance(4000);
    const shift = d.resumeFromPause();
    const now = clk.now;
    ok(shift === 4300 && eng.turnEndsAtMs === 41000 + shift && eng.beatEndsAtMs === 40300 + shift && eng.penaltyEndsAtMs === 45000 + shift &&
      eng.ritualEndsAtMs === 0 && eng.beatEndsAtMs - now === graceMs && eng.pausedTotalMs === 4000 && eng.clockPausedAt === 0 &&
      states[states.length - 1][1] === shift && d.resumeHoldUntilMs === now + graceMs,
      `real resumeFromPause + MatchEngine.resumeClock: paused 4000 ms, shift=${shift} applied to turn/beat/penalty (ritual unarmed stays 0); ` +
      `earliest due ${eng.beatEndsAtMs - now} ms after resume; pausedTotal=${eng.pausedTotalMs}; listener shift=${states[states.length - 1][1]}; AI hold ${d.resumeHoldUntilMs - now} ms`);
  }
}

// ---------------------------------------------------------------- ⑭ audio exit on the REAL TableAudio (fake SoundPool / AVPlayer / clock)
// Leaving: pendings cleared, BGM + SFX pool released; a loadComplete arriving after leaving replays nothing;
// paused before leaving → BGM never resumed / faded in.
const TA_TYPES = ['media.AVPlayer | null', 'media.SoundPool | null', 'common.UIAbilityContext | null', 'resourceManager.RawFileDescriptor',
  'media.AVPlayer', 'media.SoundPool', 'media.PlayParameters', 'media.AVFileDescriptor', 'common.UIAbilityContext', 'audio.AudioRendererInfo',
  'Promise<void>', 'Promise<number>', 'BusinessError', 'PlayStyle', 'number', 'void', 'string', 'boolean'];
const taJs = stripEts(src(E + 'features/table/TableAudio.ets'), TA_TYPES, []);
const loadTableAudio = async (AS = null) => {
  const tclk = makeClock(1000);
  const fm = makeFakeMedia();
  const TA = (await importFresh(taJs, {
    media: fm, audio: { StreamUsage: { STREAM_USAGE_MUSIC: 1 }, AudioRendererRate: { RENDER_RATE_NORMAL: 0 } },
    SfxIds: new Proxy({}, { get: (_, k) => String(k) }), PlayStyle: enumObj('PlayStyle') || {},
    AudioSettings: AS || { sfx01: (v) => v, bgm01: (v) => v, voice01: (v) => v, addListener: () => {} },
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
  // ⑮ 补丁轮 2 闸修正：150ms 暂停淡出真跑——数淡出步数（ramp 40ms/步），最后一步才 pause()，中间不硬切。
  {
    const { TA, fm, tclk } = await loadTableAudio();
    await TA.prepare();
    await drainMicrotasks();
    TA.startBgm(TA.BGM_FADE_IN_MS);
    tclk.advance(2000);
    const pl = fm.players[0];
    const mark = pl.acts.length;
    const t0 = tclk.now;
    TA.pauseForGame();
    const at100 = (tclk.advance(100), pl.acts.slice(mark).filter((a) => a === 'pause').length);
    tclk.advance(200);
    const acts = pl.acts.slice(mark);
    const vols = acts.filter((a) => a.startsWith('vol:')).map((a) => Number(a.slice(4)));
    const steps = vols.length - 1;
    const mono = vols.every((v, i) => i === 0 || v <= vols[i - 1] + 1e-9);
    ok(TA.PAUSE_FADE_OUT_MS === 150 && steps === Math.round(150 / 40) && mono && vols[0] > 0 && vols[vols.length - 1] === 0 && at100 === 0 &&
      acts[acts.length - 1] === 'pause' && acts.filter((a) => a === 'pause').length === 1 && !acts.includes('stop') && tclk.now - t0 >= 150,
      `pause fade-out 150 ms (real TableAudio): ${steps} ramp steps after the first set (${vols.map((v) => v.toFixed(3)).join('→')}), no pause before 100 ms, ` +
      `single pause() as the last action (${acts.slice(-2).join(',')}), no stop / hard cut`);
  }
  // ⑮ 补丁轮 2 第 8 段：暂停后 0 / 10 / 140 ms 就恢复（+ 400 ms 淡完再恢复作对照）→ 最终 BGM 在响（最后一个播放器动作不是 pause），音量回到 VOL_BGM × 增益。
  {
    const rows = [];
    let allOk = true;
    for (const d of [0, 10, 140, 400]) {
      const { TA, fm, tclk } = await loadTableAudio();
      await TA.prepare();
      await drainMicrotasks();
      TA.startBgm(TA.BGM_FADE_IN_MS);
      tclk.advance(2000);
      const pl = fm.players[0];
      TA.pauseForGame();
      tclk.advance(d);
      TA.resumeForGame();
      tclk.advance(1500);
      await drainMicrotasks();
      const playerActs = pl.acts.filter((a) => a === 'play' || a === 'pause' || a === 'stop');
      const lastAct = playerActs[playerActs.length - 1];
      const lastVol = pl.vols[pl.vols.length - 1];
      const good = lastAct === 'play' && Math.abs(lastVol - TA.VOL_BGM) < 1e-9 && TA.bgmFadeId === -1;
      allOk = allOk && good;
      rows.push(`${d}ms:last=${lastAct},vol=${lastVol}`);
    }
    ok(allOk, `quick resume keeps BGM (real TableAudio): ${rows.join(' | ')} (VOL_BGM × gain 1 = 0.2; fade-out cancelled on resume)`);
  }
  // ⑯ 补丁轮 3 第 4 条：快恢复补增益 ≠ 1 的行（真 AudioSettings vol_bgm=50）→ 淡回目标 = VOL_BGM × 0.5，最后一步 play。
  {
    const rows = [];
    let allOk = true;
    for (const d of [0, 140]) {
      const { AS } = await asCase({ vol_bgm: 50, vol_sfx: 100, mute_all: false });
      const { TA, fm, tclk } = await loadTableAudio(AS);
      await TA.prepare();
      await drainMicrotasks();
      TA.startBgm(TA.BGM_FADE_IN_MS);
      tclk.advance(2000);
      const pl = fm.players[0];
      TA.pauseForGame();
      tclk.advance(d);
      TA.resumeForGame();
      tclk.advance(1500);
      await drainMicrotasks();
      const playerActs = pl.acts.filter((a) => a === 'play' || a === 'pause' || a === 'stop');
      const lastAct = playerActs[playerActs.length - 1];
      const lastVol = pl.vols[pl.vols.length - 1];
      const good = lastAct === 'play' && Math.abs(lastVol - TA.VOL_BGM * 0.5) < 1e-12 && Math.max(...pl.vols) <= TA.VOL_BGM * 0.5 + 1e-12 && TA.bgmFadeId === -1;
      allOk = allOk && good;
      rows.push(`${d}ms:last=${lastAct},vol=${lastVol},max=${Math.max(...pl.vols)}`);
    }
    ok(allOk, `quick resume at gain 0.5 (real AudioSettings vol_bgm=50 → real TableAudio): ${rows.join(' | ')} (target VOL_BGM × 0.5 = 0.1, never above)`);
  }
  // ⑯ 补丁轮 3 第 4 条：TableAudio.playShot 主路径（TableAudio:927）真跑——vol_sfx=50 → 实际音量 = VOL × 0.5；100 作对照 = VOL。
  {
    const rows = [];
    let allOk = true;
    for (const [lvl, gain] of [[50, 0.5], [100, 1]]) {
      const { AS } = await asCase({ vol_bgm: 100, vol_sfx: lvl, mute_all: false });
      const { TA, fm } = await loadTableAudio(AS);
      await TA.prepare();
      await drainMicrotasks();
      fm.pools[0].emitAll();
      TA.playClaimSet();
      TA.playTurnTick();
      const vols = fm.pools[0].plays.map((x) => x.vol);
      const good = vols.length === 2 && vols[0] === TA.VOL_CLAIM * gain && vols[1] === TA.VOL_TURN * gain;
      allOk = allOk && good;
      rows.push(`vol_sfx=${lvl}: claim ${vols[0]} (want ${TA.VOL_CLAIM * gain}), turn ${vols[1]} (want ${TA.VOL_TURN * gain})`);
    }
    ok(allOk, `TableAudio.playShot main path (TableAudio:927) gain real-run: ${rows.join(' | ')}`);
  }
  // ⑮ 补丁轮 2 第 6 / 9 段：真 AudioSettings（lb.settings 假存档）+ 真 TableAudio + 真 SoundPlayer.drainPending / pauseForGame。
  // 静音、SFX=0 两种情况下实际传给播放器的音量：BGM（静音时）与所有补播都是 0；对照组（不静音）确实出声。
  {
    const spText = src(E + 'features/table/SoundPlayer.ets');
    const volOf = (k) => Number((new RegExp(`static readonly ${k}: number = ([\\d.]+);`).exec(spText) || [0, NaN])[1]);
    const spJs = stripEts(['  static pauseForGame(): void {', '  private static drainPending(isFlip: boolean): void {'].map((sg) => body(spText, sg) + '\n  }\n').join('\n'),
      ['number', 'boolean']);
    const loadSp = async (AS, paused) => (await importFresh(`class SoundPlayer {
  static logDeferredReplay() {}
  static slotRendererReady() { return false; }
  static fireRenderer(g) { SoundPlayer.fired.push(g); }
  static firePlay(id, g) { SoundPlayer.fired.push(g); }
${spJs}
}
SoundPlayer.pendingFlip = 0; SoundPlayer.pendingExt = 0; SoundPlayer.flipId = 1; SoundPlayer.extId = 2; SoundPlayer.fired = [];
SoundPlayer.VOL_FLIP = ${volOf('VOL_FLIP')}; SoundPlayer.VOL_EXTINGUISH = ${volOf('VOL_EXTINGUISH')};
export { SoundPlayer };`, { TableAudio: { isGamePaused: () => paused.on }, AudioSettings: AS, SfxIds: new Proxy({}, { get: (_, k) => String(k) }) })).SoundPlayer;
    const run = async (init) => {
      const { AS } = await asCase(init);
      const { TA, fm, tclk } = await loadTableAudio(AS);
      TA.playClaimSet(); // pool not ready → deferred shot
      await TA.prepare();
      await drainMicrotasks();
      fm.pools[0].emitAll(); // loadComplete → deferred replay
      TA.startBgm(TA.BGM_FADE_IN_MS);
      tclk.advance(2000);
      const bgmVols = fm.players[0].vols.slice();
      const paused = { on: false };
      const SP = await loadSp(AS, paused);
      SP.pendingFlip = 2; SP.pendingExt = 1;
      SP.drainPending(true); SP.drainPending(false);
      return { bgmVols, shots: fm.pools[0].plays.map((x) => x.vol), sp: SP.fired.slice() };
    };
    const mute = await run({ vol_bgm: 100, vol_sfx: 100, mute_all: true });
    const sfx0 = await run({ vol_bgm: 100, vol_sfx: 0, mute_all: false });
    const on = await run({ vol_bgm: 100, vol_sfx: 100, mute_all: false });
    const allZero = (a) => a.every((v) => v === 0);
    ok(allZero(mute.bgmVols) && mute.bgmVols.length > 0 && allZero(mute.shots) && allZero(mute.sp),
      `mute_all=true (real AudioSettings → TableAudio / SoundPlayer): BGM volumes sent ${JSON.stringify([...new Set(mute.bgmVols)])}, ` +
      `deferred shot volumes ${JSON.stringify(mute.shots)}, deferred flip/extinguish volumes ${JSON.stringify(mute.sp)} — all 0 (nothing audible)`);
    ok(allZero(sfx0.shots) && allZero(sfx0.sp) && Math.max(...sfx0.bgmVols) > 0,
      `vol_sfx=0: deferred shot volumes ${JSON.stringify(sfx0.shots)}, deferred flip/extinguish ${JSON.stringify(sfx0.sp)} — all 0; BGM track independent (max ${Math.max(...sfx0.bgmVols)})`);
    ok(on.shots.length > 0 && on.shots.every((v) => v > 0) && on.sp.length === 3 && on.sp.every((v) => v > 0) && Math.max(...on.bgmVols) > 0,
      `gain control (not muted, 100/100): deferred shot ${JSON.stringify(on.shots)}, deferred flip/extinguish ${JSON.stringify(on.sp)}, BGM max ${Math.max(...on.bgmVols)} — the replay paths really fire`);
    // 第 4 段：pending 翻牌 / 熄烛在暂停时清掉 → 恢复后资源才就绪也不补响；对照：不暂停照常补响。
    const { AS } = await asCase({ vol_bgm: 100, vol_sfx: 100, mute_all: false });
    const pz = { on: false };
    const SPp = await loadSp(AS, pz);
    SPp.pendingFlip = 2; SPp.pendingExt = 1; // queued before the pause (resources not ready)
    pz.on = true; SPp.pauseForGame();
    pz.on = false; // resumed, then the resources become ready
    SPp.drainPending(true); SPp.drainPending(false);
    const SPc = await loadSp(AS, { on: false });
    SPc.pendingFlip = 2; SPc.pendingExt = 1;
    SPc.drainPending(true); SPc.drainPending(false);
    ok(SPp.fired.length === 0 && SPp.pendingFlip === 0 && SPp.pendingExt === 0 && SPc.fired.length === 3,
      `SoundPlayer.pauseForGame clears pendingFlip/pendingExt: after pause → resume → ready, stale flip/extinguish replayed=${SPp.fired.length}; control without pause replayed=${SPc.fired.length}`);
    // ⑯ 补丁轮 3 第 4 条：SoundPlayer.playNamed 主路径（SoundPlayer:512）真跑——资源已就绪直接出声，池 / renderer 两个出声口；
    // vol_sfx=50 → 实际音量 = VOL × 0.5（「增益 > 0 就满音量」会被抓），100 作对照 = VOL。
    const pnJs = stripEts(body(spText, '  private static playNamed(idName: string, soundId: number, volume: number, isFlip: boolean): void {') + '\n  }\n',
      ['number', 'boolean', 'string']);
    const loadPn = async (AS2, rendererOn) => (await importFresh(`class SoundPlayer {
  static slotRendererReady() { return SoundPlayer.rendererOn; }
  static diagPlayN() { return 1; }
  static pathLabel() { return 'sim'; }
  static fireRenderer(g, path, isFlip) { SoundPlayer.fired.push(g); }
  static firePlay(id, g) { SoundPlayer.fired.push(g); }
${pnJs}
}
SoundPlayer.silent = false; SoundPlayer.flipReady = true; SoundPlayer.extReady = true; SoundPlayer.pool = {}; SoundPlayer.firstPlayDone = false;
SoundPlayer.pendingFlip = 0; SoundPlayer.pendingExt = 0; SoundPlayer.fired = []; SoundPlayer.rendererOn = ${rendererOn ? 'true' : 'false'};
export { SoundPlayer };`, { TableAudio: { isGamePaused: () => false }, AudioSettings: AS2, Logger: { info: () => {}, warn: () => {}, error: () => {} },
      TAG_READY: 'SfxReady', TAG: 'SoundPlayer', Date: { now: () => 1 } })).SoundPlayer;
    const VF = volOf('VOL_FLIP');
    const VE = volOf('VOL_EXTINGUISH');
    const pnRows = [];
    let pnOk = true;
    for (const [lvl, gain] of [[50, 0.5], [100, 1]]) {
      for (const rend of [false, true]) {
        const { AS: ASn } = await asCase({ vol_bgm: 100, vol_sfx: lvl, mute_all: false });
        const SPn = await loadPn(ASn, rend);
        SPn.playNamed('card_flip', 1, VF, true);
        SPn.playNamed('life_extinguish', 2, VE, false);
        const good = SPn.fired.length === 2 && SPn.fired[0] === VF * gain && SPn.fired[1] === VE * gain && SPn.pendingFlip === 0 && SPn.pendingExt === 0;
        pnOk = pnOk && good;
        pnRows.push(`vol_sfx=${lvl} ${rend ? 'renderer' : 'pool'}: ${JSON.stringify(SPn.fired)} (want [${VF * gain},${VE * gain}])`);
      }
    }
    ok(pnOk, `SoundPlayer.playNamed main path (SoundPlayer:512) gain real-run: ${pnRows.join(' | ')}`);
  }
    // ⑯ 补丁轮 3 第 4 条：LobbyAudio 增益改真跑（原结构断言）——真 AudioSettings + 真 LobbyAudio + 假 AVPlayer / SoundPool：
  // 大厅 BGM 淡到常驻后的实际音量 = VOL_BGM_STEADY × BGM 增益；CTA 短音效 = VOL_CTA × SFX 增益（0 / 静音 = 不出声或 0）。
  {
    const LA_TYPES2 = ['media.AVPlayer | null', 'media.SoundPool | null', 'common.UIAbilityContext | null', 'resourceManager.RawFileDescriptor',
      'media.AVPlayer', 'media.SoundPool', 'media.PlayParameters', 'media.AVFileDescriptor', 'common.UIAbilityContext', 'audio.AudioRendererInfo',
      'Promise<void>', 'Promise<number>', 'BusinessError', 'number', 'void', 'string', 'boolean'];
    const laJs2 = stripEts(src(E + 'features/lobby/LobbyAudio.ets'), LA_TYPES2, []);
    const LB2 = (await importFresh(stripEts(src(E + 'features/lobby/LobbyBoot.ets'), ['BootMarks', 'number', 'boolean']), {})).LobbyBoot;
    const ctx2 = { resourceManager: { getRawFd: async () => ({ fd: 1, offset: 0, length: 10 }), closeRawFd: async () => {} } };
    const settle2 = async () => { for (let k = 0; k < 6; k++) { await drainMicrotasks(60); await tickIo(); } };
    const rows = [];
    let allOk = true;
    for (const [init, label, gB, gS] of [[{ vol_bgm: 50, vol_sfx: 50, mute_all: false }, '50/50', 0.5, 0.5], [{ vol_bgm: 0, vol_sfx: 0, mute_all: false }, '0/0', 0, 0],
      [{ vol_bgm: 50, vol_sfx: 50, mute_all: true }, 'mute', 0, 0], [{ vol_bgm: 100, vol_sfx: 100, mute_all: false }, '100/100 control', 1, 1]]) {
      const { AS: ASl } = await asCase(init);
      const lclk = makeClock(1000);
      const fml = makeFakeMedia();
      const LAx = (await importFresh(laJs2, {
        media: fml, audio: { StreamUsage: { STREAM_USAGE_MUSIC: 1 }, AudioRendererRate: { RENDER_RATE_NORMAL: 0 } },
        SfxIds: new Proxy({}, { get: (_, k) => String(k) }), Logger: { info: () => {}, warn: () => {}, error: () => {} }, LobbyBoot: LB2,
        MatchLoad: { VOL_MATCH_OPEN: 0.46 }, AudioSettings: ASl, ...clockStubs(lclk)
      })).LobbyAudio;
      LAx.bind(ctx2);
      await LAx.prepare();
      await settle2();
      fml.pools[0].emitAll();
      LAx.startBgm(LB2.BOOT_MS_BGM_FADE, true);
      lclk.advance(2000);
      LAx.playCtaTap(false);
      await settle2();
      const bgm = LAx.bgmPlayer;
      const lastVol = bgm ? bgm.vols[bgm.vols.length - 1] : NaN;
      const wantB = LAx.VOL_BGM_STEADY * gB;
      const shots = fml.pools[0].plays.map((x) => x.vol);
      const wantS = LAx.VOL_CTA * gS;
      const good = bgm !== null && bgm.plays === 1 && Math.abs(lastVol - wantB) < 1e-12 && Math.max(...bgm.vols) <= wantB + 1e-12 &&
        (gS > 0 ? shots.length === 1 && shots[0] === wantS : shots.every((v) => v === 0));
      allOk = allOk && good;
      rows.push(`${label}: BGM ${lastVol} (want ${wantB}), CTA ${JSON.stringify(shots)} (want ${gS > 0 ? wantS : 'none / 0'})`);
    }
    ok(allOk, `LobbyAudio gain real-run (real AudioSettings → real LobbyAudio): ${rows.join(' | ')}`);
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
RUN(false);
// SoundPlayer / LobbyAudio: same generation rule (structural — release bumps gen; every awaited create checks it before registering).
{
  const sp = src(E + 'features/table/SoundPlayer.ets');
  const la = src(E + 'features/lobby/LobbyAudio.ets');
  const spRelB = code(body(sp, '  static release(): void {'));
  const laRelB = code(body(la, '  static release(): void {'));
  const spPrep = code(body(sp, '  private static async doPrepare(): Promise<void> {'));
  const spRend = code(body(sp, '  private static async prepareRenderers(gen: number): Promise<void> {'));
  const laBed = code(body(la, '  private static async prepareBed(isBgm: boolean, gen: number): Promise<boolean> {'));
  const laPrep = code(body(la, '  private static async preparePool(gen: number): Promise<boolean> {'));
  ok(/void \{\s*SoundPlayer\.gen = SoundPlayer\.gen \+ 1;\s*SoundPlayer\.inFlight = null;/.test(spRelB) &&
    /await media\.createSoundPool\([^)]*\);\s*if \(SoundPlayer\.gen !== gen\) \{[^}]*pool\.release\(\)/.test(spPrep) &&
    (spRend.match(/await SoundPlayer\.createSlotRenderer\([^)]*\);\s*if \(SoundPlayer\.gen !== gen\) \{\s*SoundPlayer\.releaseOneRenderer\(/g) || []).length === 2,
    'SoundPlayer: release() bumps gen + drops the in-flight prepare; a pool / renderer created after release is released, not registered');
  ok(/void \{\s*LobbyAudio\.gen = LobbyAudio\.gen \+ 1;/.test(laRelB) &&
    /await media\.createAVPlayer\(\);\s*if \(LobbyAudio\.gen !== gen\) \{\s*LobbyAudio\.dropStalePlayer\(player\);\s*return true;/.test(laBed) &&
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
// ⑮ 补丁轮 2 第 1 段（UI 22 S22-32 / 22:106）：zIndex 只在同一父容器里比，所以按父容器查挂载位置——暂停层必须是根 Stack 的
// 最后一个直接子节点，排在桌面 Stack（含桌槌 choiceActLayer / 回大厅键）、PeekMaskOverlay、出牌面板、飞牌之后；全屏盖安全区、遮罩吃点击。
{
  const bld = body(table, '  build() {');
  const lines = bld.split('\n');
  const rootEnd = lines.findIndex((ln, i) => i > 0 && /^ {4}\}/.test(ln));
  const kids = [];
  lines.forEach((ln, i) => { if (i < rootEnd && /^ {6}[^ .})\]]/.test(ln)) kids.push([i, ln.trim()]); });
  const at = (re) => { const h = kids.find(([, tx]) => re.test(tx)); return h ? h[0] : -1; };
  const desk = at(/^Stack\(\{ alignContent: Alignment\.TopStart \}\) \{$/);
  const peek = at(/^PeekMaskOverlay\(/);
  const sheet = at(/^if \(this\.showPlay\) \{$/);
  const fly = at(/^if \(this\.flyOn\) \{$/);
  const pause = at(/^if \(this\.pauseLayerOn\) \{$/);
  const last = kids.length > 0 ? kids[kids.length - 1][0] : -1;
  let deskEnd = -1;
  for (let i = desk + 1; desk >= 0 && i < lines.length; i++) { if (/^ {6}\}/.test(lines[i])) { deskEnd = i; break; } }
  const deskBody = desk >= 0 && deskEnd > desk ? lines.slice(desk, deskEnd + 1).join('\n') : '';
  ok(desk >= 0 && deskEnd > desk && peek > deskEnd && sheet > peek && fly > sheet && pause > fly && pause === last &&
    !deskBody.includes('this.pauseLayer()') && deskBody.includes('this.choiceActLayer()') && deskBody.includes('this.homeExitChrome()') &&
    count(tableCode, /this\.pauseLayer\(\)/) === 1,
    `pause layer mount (by parent): last child of the root Stack (root children lines desk ${desk}-${deskEnd} [mallet + home inside], ` +
    `PeekMaskOverlay ${peek}, play sheet ${sheet}, fly card ${fly}, pause layer ${pause}; last root child ${last}); not inside the desk Stack`);
  const plb = body(table, '  pauseLayer() {');
  ok(/\.expandSafeArea\(\[SafeAreaType\.SYSTEM, SafeAreaType\.CUTOUT\],\s*\[SafeAreaEdge\.TOP, SafeAreaEdge\.BOTTOM, SafeAreaEdge\.START, SafeAreaEdge\.END\]\)/.test(plb) &&
    /\.hitTestBehavior\(HitTestMode\.Default\)/.test(plb) && /\.opacity\(0\.72\)\s*\.onClick\(/.test(plb) &&
    /\.ignoreLayoutSafeArea\(\[LayoutSafeAreaType\.SYSTEM\], \[LayoutSafeAreaEdge\.ALL\]\)/.test(lines.slice(rootEnd).join('\n')),
    'pause layer full screen incl. safe areas (expandSafeArea 4 edges, root Stack ignoreLayoutSafeArea ALL); HitTestMode.Default + dim backdrop onClick swallow taps (nothing underneath clickable)');
}
ok(/REVEAL_HOLD_MS\(3000\)/.test(rawSrc(E + 'pages/Table.ets')) && !/REVEAL_HOLD_MS\(5000\)/.test(rawSrc(E + 'pages/Table.ets')) &&
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
  // 补丁轮 3：LobbyAudio 的 BGM 增益已改真跑（LobbyAudio gain real-run）；TableAudio 的 BGM 增益由快恢复 gain 0.5 真跑覆盖，这里只留结构兜底。
  if (name === 'TableAudio') {
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
ok(!/静默/.test(rawSrc(E + 'common/Ids.ets').split('\n').slice(190, 215).join('\n')) && !/静默/.test(rawSrc(E + 'persist/AudioSettings.ets')), '「静默」→「静音」 in Ids (settings block) / AudioSettings comments');
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
ok(pfg.includes('TableAudio.clearPendingShots()') && pfg.includes('TableAudio.pendingBgm = false'),
  'pauseForGame clears pending shots + pendingBgm (the 150 ms fade itself is the real-run "pause fade-out 150 ms")');
ok(/if \(toVol <= 0\) \{\s*player\.pause\(\)/.test(code(body(ta, '  private static fadeBgm(fromVol: number, toVol: number, fadeMs: number): void {'))),
  'fadeBgm to 0 ends in player.pause() (position kept, no stop / seek)');
ok(/static readonly RESUME_FADE_IN_MS: number = 300;/.test(ta) && code(body(ta, '  static resumeForGame(): void {')).includes('TableAudio.startBgm(TableAudio.RESUME_FADE_IN_MS)'),
  'resumeForGame: BGM fades back in over 300 ms');
const cps = code(body(ta, '  private static clearPendingShots(): void {'));
const pendFlags = [...new Set([...code(ta).matchAll(/private static (pending(?!Bgm)\w+): boolean = false;/g)].map((m) => m[1]))];
ok(pendFlags.length > 0 && pendFlags.every((f) => cps.includes(`TableAudio.${f} = false`)), `clearPendingShots resets all ${pendFlags.length} deferred-shot flags`);
ok(/if \(TableAudio\.gamePaused\) \{\s*return;/.test(code(body(ta, '  private static playShot(soundId: number, volume: number): void {'))) &&
  /^[^{]*\{\s*if \(TableAudio\.gamePaused\) \{\s*return;\s*\}/.test(code(body(ta, '  private static onLoaded(soundId: number): void {'))),
  'TableAudio: playShot + onLoaded replay silent while paused (onLoaded gate anchored as its first statement)');
ok(/if \(TableAudio\.isGamePaused\(\)\) \{[\s\S]{0,200}return;/.test(code(sp2)) && sp2.includes("import { TableAudio } from './TableAudio';"),
  'SoundPlayer.playNamed: no sound and no deferral while paused');
const dp = code(body(sp2, '  private static drainPending(isFlip: boolean): void {'));
ok(dp.includes('const paused: boolean = TableAudio.isGamePaused();') && count(dp, /if \(paused \|\| \w+Gain <= 0\) \{\s*return;/) === 2,
  'SoundPlayer.drainPending: deferred flip / extinguish dropped while paused (gain values are the real-run mute / vol_sfx=0 / control rows)');
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

// ---------------------------------------------------------------- ⑱ 结算面板 PR（21 §1.2-§1.6 · 22 §4）：playLog / ReportModel / Report 真跑
const playLogSrc = src(E + 'engine/PlayLog.ets');
const reportModelSrc = src(E + 'features/report/ReportModel.ets');
const reportPage = src(E + 'pages/Report.ets');
const reportPanelSrc = src(E + 'features/report/ReportPanel.ets');
// structural: engine write points (21 §1.3 写死 1-3)
const cpk = code(body(engine, '  private commitPicked('));
const ajd = code(body(engine, '  private applyJudged(): void {'));
const rlb = code(body(engine, '  rollbackLastPlay(): boolean {'));
const stm = code(body(engine, '  startMatch(opts: StartMatchOpts): boolean {'));
ok(cpk.includes('this.playLog.append(this.roundIndex, actor, picked.length, fake, style);') &&
  ajd.includes('this.playLog.markJudged(this.lastPlay.actorSeatId, this.challenge.challengerSeatId, success, loser);') &&
  rlb.includes('this.playLog.popLast(actor);') && stm.includes('this.playLog.clear();') &&
  count(code(engine), /this\.playLog\.clear\(\)/) === 1 && count(code(engine), /this\.playLog\.append\(/) === 1,
  'playLog write points: commitPicked append · applyJudged mark · rollbackLastPlay pop · startMatch clear (collectRedeal / dealFresh never clear)');
ok(/recapPlayLog\(\): PlayLogEntry\[\] \{\s*if \(this\.phase !== Phase\.RECAP && this\.phase !== Phase\.END\) \{\s*return \[\];\s*\}\s*return this\.playLog\.entries\(\);/.test(code(engine)) &&
  !/playLog/.test(code(body(engine, '  private buildSnapshot(): MatchSnapshot {'))),
  'playLog copy only after RECAP / END (never in the mid-match snapshot)');
ok(!/highlightLine|dealerLine/.test(code(reportPage)) && !/snap\.lastPlay|snap\.challenge/.test(code(reportPage)) &&
  reportPage.includes('playLog: AppRuntime.engine.recapPlayLog(),') && reportPage.includes('this.view = ReportModel.build(input, this.readTexts());'),
  'Report reads playLog via ReportModel only (no highlightLine / dealerLine fallback, no snap.lastPlay / challenge — S21-25 / S21-46)');
const rpBar = code(body(reportPanelSrc, '  btnBar() {'));
ok(/\.id\(ControlIds\.REPORT_LOBBY\)[\s\S]*?this\.onHome\(\)/.test(rpBar) && /\.id\(ControlIds\.AGAIN\)[\s\S]*?this\.onAgain\(\)/.test(rpBar) &&
  /onAgain: \(\) => \{\s*this\.leaveMatchReport\(true\);/.test(code(reportPage)) && /onHome: \(\) => \{\s*this\.leaveMatchReport\(false\);/.test(code(reportPage)),
  'button bar → Report.leaveMatchReport(true / false) (the methods run below)');
const cardB = code(body(reportPanelSrc, '  card(id: string, badge: Resource, title: Resource, c: ReportCardView) {'));
ok(cardB.includes('.grayscale(c.ok ? 0 : 1)') && cardB.includes('.opacity(c.ok ? 1 : 0.4)') &&
  /if \(this\.view\.showCards\) \{[\s\S]*?REPORT_HL_BLUFF[\s\S]*?REPORT_HL_DOUBT[\s\S]*?REPORT_HL_BURN[\s\S]*?\} else \{[\s\S]*?REPORT_HL_FALLBACK/.test(code(reportPanelSrc)) &&
  /\.visibility\(this\.view\.replayText\.length > 0 \? Visibility\.Visible : Visibility\.None\)/.test(code(reportPanelSrc)),
  'cards fixed order bluff → doubt → burn; failing card badge grayscale 100% + 40%; none entered → one fallback line; empty replay → Visibility.None (22 §4.4)');
const mediaUsed = [...new Set([...reportPanelSrc.matchAll(/app\.media\.(\w+)/g)].map((m) => m[1]))].sort();
const MEDIA_OK = ['art_hl_best_challenge', 'art_hl_long_bluff', 'art_hl_worst_break', 'art_life_candle_body', 'art_life_candle_extinguish_3',
  'art_life_candle_flame_full', 'art_result_bar_lose', 'art_result_bar_win'];
ok(JSON.stringify(mediaUsed) === JSON.stringify(MEDIA_OK), `ReportPanel media = existing ids only, no new media id (${mediaUsed.join(',')})`);

RUN(true);
const PL_TYPES = ['PlayLogEntry[]', 'PlayLogEntry', 'PlayLogTally', 'PlayStyle', 'number', 'boolean'];
const RM_TYPES = ['Map<string, string>', 'string | undefined', 'PlayLogEntry[]', 'PlayLogEntry | null', 'PlayLogEntry', 'MatchEvent[]', 'RecapRow[]',
  'SeatModel[]', 'SeatModel', 'ReportInput', 'ReportView', 'ReportRowView[]', 'ReportRowView', 'ReportCardView', 'BluffPick | null', 'BluffPick',
  'DoubtPick | null', 'DoubtPick', 'BurnPick | null', 'BurnPick', 'PlayLogTally', 'PlayStyle', 'string[]', 'number[]', 'boolean[]', 'string', 'number', 'boolean'];
const plJs = stripEts(playLogSrc, PL_TYPES);
const rmJs = stripEts(reportModelSrc, RM_TYPES);
const PSt2 = enumObj('PlayStyle');
const EK = enumObj('EventKind');
const SRo = enumObj('SeatRole');
let PL = null;
let RMod = null;
let RKEYS = null;
try {
  const m = await importFresh(`${plJs}\n${rmJs}`, { PlayStyle: PSt2, EventKind: EK, SeatRole: SRo });
  PL = m.PlayLog; RMod = m.ReportModel; RKEYS = m.REPORT_TEXT_KEYS;
} catch (e) {
  fail(`结算面板: real PlayLog.ets + ReportModel.ets did not load in node after type strip: ${e.message}`);
}
const strJson = JSON.parse(src('entry/src/main/resources/base/element/string.json')).string;
const strMap = new Map(strJson.map((x) => [x.name, x.value]));
if (PL && RMod) {
  // --- playLog (21 §1.3): seq = hand order, rollback pops without gaps, judge marks the last hand, copies are detached
  const L = new PL();
  L.append(1, 0, 2, 0, PSt2.SOFT);            // seq1 seat0 true
  L.append(1, 1, 1, 1, PSt2.SLAM);            // seq2 seat1 fake
  const markWrongSeat = L.markJudged(0, 2, true, 0);
  const markOk = L.markJudged(1, 2, true, 1);  // seat2 catches seat1
  const markTwice = L.markJudged(1, 3, false, 3);
  const popJudged = L.popLast(1);
  L.append(2, 3, 1, 1, PSt2.SOFT);            // seq3 seat3 fake …
  const popOther = L.popLast(0);
  const popOk = L.popLast(3);                  // … rolled back
  L.append(2, 3, 3, 0, PSt2.HESITATE);        // seq3 again (no gap)
  L.markJudged(3, 0, false, 0);                // seat0 doubts wrongly
  const ent = L.entries();
  ent[0].count = 99;
  const t1 = L.tally(1); const t2 = L.tally(2); const t3 = L.tally(3); const t0 = L.tally(0);
  ok(!markWrongSeat && markOk && !markTwice && !popJudged && !popOther && popOk && L.size() === 3 &&
    JSON.stringify(L.entries().map((e) => e.seq)) === '[1,2,3]' && L.entries()[0].count === 2 &&
    t1.plays === 1 && t1.fakeHands === 1 && t1.doubted === 1 && t1.caught === 1 && t2.doubts === 1 && t2.doubtHits === 1 &&
    t3.plays === 1 && t3.fakeHands === 0 && t3.doubted === 1 && t3.caught === 0 && t0.doubts === 1 && t0.doubtHits === 0 && t0.plays === 1,
    'real PlayLog: seq 1..3 with a rollback in between (no gap), rolled-back fake hand not counted, judge marks only the unjudged last hand, entries() is a copy');
  L.clear();
  ok(L.size() === 0 && L.entries().length === 0, 'real PlayLog.clear() (startMatch)');

  // --- ReportModel fixtures (4 seats, human = 0); texts = the real string.json values
  const texts = new Map(RKEYS.map((k) => [k, strMap.get(k)]));
  const missingKeys = RKEYS.filter((k) => !strMap.has(k));
  ok(missingKeys.length === 0, `REPORT_TEXT_KEYS all exist in string.json (${RKEYS.length} keys${missingKeys.length ? '; missing ' + missingKeys.join(',') : ''})`);
  const seats4 = (lives) => [0, 1, 2, 3].map((i) => ({ seatId: i, role: i === 0 ? SRo.HUMAN : SRo.AI, nickname: ['阿龙', '老千', '怂货', '杠精'][i], lives: lives[i] }));
  const E_ = (kind, seatId) => ({ kind, seatId, detail: '', at: 0 });
  const pe = (seq, actor, count, fake, style, ch, chal, caught) => ({ seq, round: 1, actorSeatId: actor, count, fakeCount: fake, style,
    challenged: ch, challengerSeatId: ch ? chal : -1, caught: ch ? caught : false, loserSeatId: ch ? (caught ? actor : chal) : -1 });
  const inp = (over) => ({ seats: seats4([2, 0, 0, 0]), recap: [0, 1, 2, 3].map((i) => ({ seatId: i, aliveAtExit: [0, 3, 4, 2][i] })),
    eventLog: [], playLog: [], winnerSeatId: 0, roundIndex: 5, startedAt: 1000, endedAt: 1000 + 125000 + 30000, pausedMs: 30000,
    livesDefault: 3, quit: false, ff: false, ...over });
  // A: seat1 bluffs 3 in a row (one is a 3-card hand ⇒ {手} must be seq not count), seat0 catches seat1 later; seat2 burns 3 straight and goes out
  const logA = [pe(1, 1, 3, 2, PSt2.SOFT, false), pe(2, 1, 1, 1, PSt2.SOFT, false), pe(3, 2, 1, 0, PSt2.SOFT, false), pe(4, 1, 2, 1, PSt2.SLAM, false),
    pe(5, 3, 1, 0, PSt2.SOFT, true, 2, false), pe(6, 1, 3, 3, PSt2.SLAM, true, 0, true), pe(7, 2, 1, 1, PSt2.SOFT, true, 3, true)];
  const evA = [E_(EK.PLAY, 1), E_(EK.LIFE_CHANGE, 2), E_(EK.LIFE_CHANGE, 1), E_(EK.LIFE_CHANGE, 3), E_(EK.LIFE_CHANGE, 2), E_(EK.LIFE_CHANGE, 2), E_(EK.LIFE_CHANGE, 2),
    E_(EK.OUT, 2), E_(EK.LIFE_CHANGE, 1), E_(EK.LIFE_CHANGE, 1), E_(EK.OUT, 1), E_(EK.LIFE_CHANGE, 3), E_(EK.LIFE_CHANGE, 0), E_(EK.LIFE_CHANGE, 3), E_(EK.LIFE_CHANGE, 3), E_(EK.OUT, 3)];
  const vA = RMod.build(inp({ playLog: logA, eventLog: evA }), texts);
  const rowsA = vA.rows.map((r) => `${r.slot}:${r.nickname}:${r.candles.map((c) => (c ? 1 : 0)).join('')}:${r.burnt}:${r.plays}/${r.fakes}/${r.doubts}/${r.hits}:${r.rankText}:${r.tagText}`);
  ok(vA.showCards && vA.bluff.ok && vA.bluff.text === '老千 连骗 3 手没被拆穿' && vA.doubt.ok && vA.doubt.text === '阿龙 质疑 1 次，开中 1 次' &&
    vA.burn.ok && vA.burn.text === '怂货 连熄 3 烛，直接出局' && vA.fallbackText === '',
    `H1 / H2 / H3 on a real-run fixture: ${vA.bluff.text} | ${vA.doubt.text} | ${vA.burn.text} (21 §1.4.1-§1.4.3)`);
  ok(vA.replayText === '阿龙 第 6 手开中了 老千', `replay target = last judged hand involving the human, {手} = seq (6) not card count (3): "${vA.replayText}" (21 §1.4.4 / §1.4.5)`);
  ok(JSON.stringify(rowsA) === JSON.stringify(['self:阿龙:110:1:0/0/1/1:第 1 名:留下', 'p1:老千:000:3:4/4/0/0:第 3 名:第 2 个出局',
    'p2:怂货:000:3:2/1/1/0:第 4 名:第 1 个出局', 'p3:杠精:000:3:1/0/1/1:第 2 名:第 3 个出局']) &&
    vA.rows.every((r) => r.candles.filter((c) => c).length + r.burnt === 3),
    `rows: human first then seat order; candles lit + burnt = 3; rank = alive-at-exit, winner 1; 第 k 个出局 by OUT order (${rowsA.join(' / ')})`);
  ok(vA.topText === '你留到了最后' && vA.winnerText === '胜者：阿龙' && vA.durationText === '用时 2分5秒' && vA.roundsText === '5 轮 · 7 手' && vA.humanWon,
    `head: ${vA.topText} · ${vA.winnerText} · ${vA.durationText} (pause excluded) · ${vA.roundsText} (手 = playLog.length)`);
  // ties: H1 equal best → larger fake sum; H2 equal h → higher h/k; H3 equal k → ends with OUT beats human
  const logT = [pe(1, 1, 1, 1, PSt2.SOFT, false), pe(2, 2, 2, 2, PSt2.SOFT, false), pe(3, 1, 1, 1, PSt2.SOFT, false), pe(4, 2, 1, 1, PSt2.SOFT, false),
    pe(5, 3, 1, 1, PSt2.SOFT, true, 0, true), pe(6, 0, 1, 0, PSt2.SOFT, true, 3, false), pe(7, 1, 1, 0, PSt2.SOFT, true, 3, false),
    pe(8, 0, 1, 1, PSt2.SOFT, true, 3, true)];
  const evT = [E_(EK.LIFE_CHANGE, 0), E_(EK.LIFE_CHANGE, 0), E_(EK.LIFE_CHANGE, 1), E_(EK.LIFE_CHANGE, 1), E_(EK.OUT, 1)];
  const bT = RMod.pickBluff(logT); const dT = RMod.pickDoubt(logT, [0, 1, 2, 3]); const uT = RMod.pickBurn(evT, 0);
  ok(bT && bT.seatId === 2 && bT.best === 2 && bT.fakeSum === 3 && dT && dT.seatId === 0 && dT.hits === 1 && dT.doubts === 1 &&
    uT && uT.seatId === 1 && uT.out === true,
    `tie-breaks: H1 best=2 tie → fake sum (seat ${bT && bT.seatId}); H2 h=1 tie → h/k 1/1 beats 1/3 (seat ${dT && dT.seatId}); H3 k=2 tie → ends with OUT beats human (seat ${uT && uT.seatId})`);
  // rule 1: only H2 enters → three cards, the other two use their own *_none line
  const v1 = RMod.build(inp({ playLog: [pe(1, 1, 1, 1, PSt2.SOFT, true, 0, true)], eventLog: [E_(EK.LIFE_CHANGE, 1)] }), texts);
  ok(v1.showCards && !v1.bluff.ok && v1.bluff.text === '没人连骗得手' && v1.doubt.ok && !v1.burn.ok && v1.burn.text === '没人连熄两烛' && v1.fallbackText === '',
    '§1.4.3a rule 1: one card enters → three cards stay, failing cards show bluff_none / burn_none (badge dimmed in the panel)');
  // rule 2a: nothing judged → hl_none, replay hidden; rule 2b: judged but nobody qualifies → hl_quiet, replay shown
  const v2a = RMod.build(inp({ playLog: [pe(1, 1, 1, 0, PSt2.SOFT, false)], eventLog: [] }), texts);
  const v2b = RMod.build(inp({ playLog: [pe(1, 1, 1, 0, PSt2.HESITATE, true, 2, false)], eventLog: [E_(EK.LIFE_CHANGE, 2)] }), texts);
  ok(!v2a.showCards && v2a.fallbackText === '这一局，没人掀过牌。' && v2a.replayText === '' &&
    !v2b.showCards && v2b.fallbackText === '这一局，没有谁特别出挑。' && v2b.replayText === '怂货 第 1 手开错了，自己熄了一支烛',
    `§1.4.3a rule 2 / 3: none entered → one line (none: "${v2a.fallbackText}" replay hidden · quiet: "${v2b.fallbackText}" + replay "${v2b.replayText}")`);
  const v2c = RMod.build(inp({ playLog: [pe(1, 2, 2, 1, PSt2.SLAM, true, 3, true)] }), texts);
  ok(v2c.replayText === '怂货 第 1 手甩出后被拆穿，熄了一支烛', `replay caught template with {方式} = style word: "${v2c.replayText}"`);
  // D1 quit report (model only — the pause PR wires the entry)
  const vq = RMod.build(inp({ quit: true, winnerSeatId: -1, seats: seats4([2, 1, 0, 1]), eventLog: [E_(EK.OUT, 2)],
    recap: [0, 1, 2, 3].map((i) => ({ seatId: i, aliveAtExit: i === 2 ? 4 : 0 })) }), texts);
  ok(vq.topText === '中途离桌，记一负' && vq.winnerText === '胜者：未决' && !vq.humanWon &&
    JSON.stringify(vq.rows.map((r) => `${r.slot}:${r.rankText}:${r.tagText}`)) === JSON.stringify(['self:第 3 名:中退', 'p1:—:在桌', 'p2:第 4 名:第 1 个出局', 'p3:—:在桌']),
    'quit report: top = rpt_quit, winner 未决, human rank = alive now (3) + 中退, other alive seats — + 在桌 (21 §1.5 D1)');
  const allText = [vA, v1, v2a, v2b, v2c, vq].map((v) => [v.topText, v.winnerText, v.durationText, v.roundsText, v.bluff.text, v.doubt.text, v.burn.text,
    v.fallbackText, v.replayText, ...v.rows.map((r) => r.rankText + r.tagText)].join('|')).join('|');
  ok(!/命|开枪|左轮|膛位|\{[^}]*\}/.test(allText) && !/胜者：阿龙/.test([vA.fallbackText, vA.replayText, v2a.fallbackText, v2b.fallbackText].join('|')),
    'report text: no 命 / 开枪 / 左轮 / 膛位, no unfilled {placeholder}, winner line never reused in highlight slots (RPT-6 / S21-46)');
}

// --- engine playLog wiring: REAL MatchEngine methods (commitPicked / rollbackLastPlay / applyJudged / buildRecap / recapPlayLog)
const PLE_SIGS = ['  private commitPicked(', '  rollbackLastPlay(): boolean {', '  private applyJudged(): void {', '  private buildRecap(): RecapRow[] {',
  '  recapPlayLog(): PlayLogEntry[] {', '  private seatCount(arr: number[], seat: number): number {'];
const plMiss = PLE_SIGS.filter((sg) => body(engine, sg).length === 0);
ok(plMiss.length === 0, `playLog engine harness: ${PLE_SIGS.length} real MatchEngine methods found (${plMiss.join(' | ') || 'ok'})`);
if (PL && plMiss.length === 0) {
  const PhaseE3 = enumObj('Phase');
  const pleJs = `class PLEngine {
  constructor(n) {
    Object.assign(this, { playLog: new PlayLog(), seats: [], hands: [], aliveAtExits: [], phase: PhaseE.TURN, currentSeatId: 0, roundIndex: 1,
      playIndexInRound: 0, playSeq: 0, stallSkipCount: 0, lastPlay: null, lastPlayRanks: [], lastPicked: [], emptyOrder: [], emptyHandSeatId: -1,
      roundWinPending: false, currentClaim: { rank: 'K' }, challenge: null, cfg: { lives_default: 3 }, revealOpen: false, judged: false,
      lastLoserSeatId: -1, lastLoserReason: '', extinguishPending: false, dealerKey: '', dealerLine: '', events: [] });
    for (let i = 0; i < n; i++) { this.seats.push({ seatId: i, nickname: 's' + i }); this.hands.push([]); this.aliveAtExits.push(0); }
  }
  handOf(s) { return this.hands[s]; }
  returnCards(s, cards) { for (const c of cards) this.hands[s].push(c); }
  clearEmptyGate() {} enterTurn() {} enterHandEmptyGate() {} maybeSettleRoundSafeWait() {} recordAiReveal() {} settleBets() {}
  pushEvent(k, s, d) { this.events.push(k); } buildSnapshot() { return {}; }
${stripEts(PLE_SIGS.map((sg) => body(engine, sg) + '\n  }\n').join('\n'),
  ['CardModel[]', 'PlayStyle', 'RecapRow[]', 'PlayLogEntry[]', 'PlayLogTally', 'LifeReason', 'string[]', 'number[]', 'string', 'number', 'boolean'])}
}
export { PLEngine };`;
  let PLE = null;
  try {
    PLE = (await importFresh(pleJs, { PlayLog: PL, PhaseE: PhaseE3, Phase: PhaseE3, EventKind: EK, PlayStyle: PSt2, ChallengeResult: enumObj('ChallengeResult'),
      LifeReason: enumObj('LifeReason'), Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'MatchEngine',
      isFakeRank: (r, c) => !(r === c || r === 'JOKER'), isChallengeSuccess: (rs, c) => rs.some((r) => !(r === c || r === 'JOKER')),
      lineForKey: () => '', nextAlive: (seats, s) => (s + 1) % seats.length })).PLEngine;
  } catch (e) {
    fail(`playLog engine harness did not load: ${e.message}`);
  }
  if (PLE) {
    const en = new PLE(4);
    const play = (seat, ranks, style) => { en.currentSeatId = seat; en.commitPicked(ranks.map((r, i) => ({ cardId: `${seat}-${en.playSeq}-${i}`, rank: r })), style, '', -1, false); };
    const judge = (challenger) => { en.challenge = { targetPlayId: en.lastPlay.playId, challengerSeatId: challenger, result: '', fakeCount: 0, judgedAt: 0 }; en.applyJudged(); };
    play(0, ['K', 'K'], PSt2.SOFT);              // seq1 true
    play(1, ['Q'], PSt2.SLAM);                   // seq2 fake …
    en.rollbackLastPlay();                       // … rolled back (old fakeHandCounts kept it — playLog pops it)
    play(1, ['K'], PSt2.SOFT);                   // seq2 true
    judge(2);                                    // seat2 doubts wrongly
    play(3, ['A', 'JOKER'], PSt2.HESITATE);      // seq3 fake
    judge(0);                                    // human catches seat3
    const midCopy = en.recapPlayLog();
    en.phase = PhaseE3.RECAP;
    const recap = en.buildRecap();
    const copy = en.recapPlayLog();
    copy[0].seq = 42;
    const r = (i) => recap[i];
    ok(midCopy.length === 0 && copy.length === 3 && en.recapPlayLog()[0].seq === 1 && JSON.stringify(en.recapPlayLog().map((e) => e.seq)) === '[1,2,3]' &&
      en.playLog.size() === 3 && r(1).playCount === 1 && r(1).fakeHandCount === 0 && r(1).doubtedCount === 1 && r(1).caughtCount === 0 &&
      r(2).challengeCount === 1 && r(2).challengeHits === 0 && r(3).fakeHandCount === 1 && r(3).doubtedCount === 1 && r(3).caughtCount === 1 &&
      r(0).challengeCount === 1 && r(0).challengeHits === 1 && r(0).playCount === 1,
      `real engine methods: commitPicked append / rollbackLastPlay pop / applyJudged mark → buildRecap from playLog (hands=${en.playLog.size()}, ` +
      `seat1 fake after rollback=${r(1).fakeHandCount}, seat3 caught=${r(3).caughtCount}, human hits=${r(0).challengeHits}); mid-match copy empty`);
  }
}

// --- RPT-11 (21:298 / :305 · S21-17): REAL Report methods + REAL RecordStore. Report commits the moment it appears; leaving at once keeps
// the record (recent = 1) and the saved bytes are identical before / after leaving. 再来一局 restarts in place (no lobby).
const REPORT_SIGS = ['  aboutToAppear(): void {', '  onBackPress(): boolean {', '  private readTexts(): Map<string, string> {',
  '  private leaveMatchReport(again: boolean): void {', '  private restartMatch(): boolean {', '  private async portraitThenLobby(): Promise<void> {'];
const rpMiss = REPORT_SIGS.filter((sg) => body(reportPage, sg).length === 0);
ok(rpMiss.length === 0, `RPT-11 harness: ${REPORT_SIGS.length} real Report.ets methods found (${rpMiss.join(' | ') || 'ok'})`);
if (RMod && MR && rpMiss.length === 0) {
  const PhaseE4 = enumObj('Phase');
  const SS4 = enumObj('SeatStatus');
  const rpJs = `class ReportHarness {
  constructor() { Object.assign(this, { view: null, recordsMode: true, leaving: false, againOpts: null }); }
${stripEts(REPORT_SIGS.map((sg) => body(reportPage, sg) + '\n  }\n').join('\n'),
  ['MatchSnapshot | null', 'StartMatchOpts | null', 'StartMatchOpts', 'common.UIAbilityContext', 'Map<string, string>', 'RecordCommit',
    'ReportInput', 'number', 'string', 'boolean'], ['common.UIAbilityContext']).replace(/new Map<string, string>\(\)/g, 'new Map()')}
}
export { ReportHarness };`;
  const T0r = 1759900000000;
  // o = { n: seats, silent, nick } — defaults = the 4-seat / not silent / 阿龙 fixture; the 3-seat / silent / 小满 variant proves the restart
  // re-uses THIS match's nickname / playerCount / silent (21:218), not hard-coded defaults.
  const mkRecapSnap = (mid, o) => {
    const n = o && o.n ? o.n : 4;
    const ids = Array.from({ length: n }, (_, i) => i);
    return {
      matchId: mid, phase: PhaseE4.RECAP, config: { lives_default: 3 }, silentMode: !!(o && o.silent), startedAt: T0r, endedAt: T0r + 240000, roundIndex: 4,
      winnerSeatId: 1, eventLog: [{ kind: EK.LIFE_CHANGE, seatId: 0, detail: '', at: 0 }, { kind: EK.OUT, seatId: 0, detail: '', at: 0 }],
      seats: ids.map((i) => ({ seatId: i, role: i === 0 ? SRo.HUMAN : SRo.AI, aiPersona: i === 0 ? '' : 'AI_SHARK',
        nickname: i === 0 ? (o && o.nick ? o.nick : '阿龙') : `ai${i}`, lives: i === 1 ? 2 : 0, status: i === 1 ? SS4.ALIVE : SS4.GHOST })),
      recap: ids.map((i) => ({ seatId: i, nickname: `s${i}`, playCount: 2, fakeHandCount: 1, challengeCount: 1, challengeHits: 0, doubtedCount: 1,
        caughtCount: 0, aliveAtExit: i === 1 ? 0 : n - (i === 0 ? 0 : i - 1) }))
    };
  };
  const world = async (mid, startOk, o) => {
    curPrefStore = makePrefStore();
    const RSr = await loadRecordStore();
    await RSr.init({});
    const log = [];
    const snap = mkRecapSnap(mid, o);
    const pausedStub = o && o.paused ? o.paused : 0;
    // o.pausedSeq: successive pausedTotalAt() answers (a second call would read a later, larger total) — proves the page reads it once.
    const pausedCalls = { n: 0 };
    const pausedAt = () => {
      pausedCalls.n++;
      if (o && o.pausedSeq) return o.pausedSeq[Math.min(pausedCalls.n - 1, o.pausedSeq.length - 1)];
      return pausedStub;
    };
    const eng = { current: () => snap, isDemoMatch: () => false, pausedTotalAt: pausedAt, recapPlayLog: () => [],
      toLobby: () => { log.push('engine.toLobby'); return true; }, startMatch: (o) => { log.push(`engine.startMatch:${o.nickname}/${o.playerCount}/${o.silent}`); return startOk; } };
    const director = { stop: () => log.push('director.stop'), start: () => log.push('director.start') };
    const H = (await importFresh(rpJs, {
      AppRuntime: { engine: eng, director, bootDirector: () => log.push('bootDirector') },
      Phase: PhaseE4, SeatRole: SRo, RecordStore: RSr, ReportModel: RMod, REPORT_TEXT_KEYS: RKEYS,
      TableAudio: { setSilent: (on) => log.push(`TableAudio.setSilent:${on}`), playResult: () => log.push('playResult'), fadeBgmOut: () => {}, BGM_FADE_OUT_MS: 400, release: () => log.push('TableAudio.release') },
      LbRouter: { toLobby: () => log.push('LbRouter.toLobby'), replaceTable: () => log.push('LbRouter.replaceTable'), back: () => log.push('LbRouter.back') },
      WindowOrientation: { lockPortrait: async () => { log.push('lockPortrait'); } },
      getContext: () => ({ resourceManager: { getStringByNameSync: (k) => strMap.get(k) } }),
      Logger: { info: () => {}, warn: () => {}, error: () => {} }, TAG: 'Report'
    })).ReportHarness;
    return { RSr, log, snap, h: new H(), pausedCalls };
  };
  // ⓐ director has NOT written yet → Report appears → written; leave at once (button / back key) → still 1, bytes identical
  for (const via of ['button', 'back']) {
    const w = await world(`m-${T0r}-${via}`, true);
    w.h.aboutToAppear();
    await tickIo();
    const afterAppear = w.RSr.recent().length;
    const dumpA = curPrefStore.dump();
    const writesA = curPrefStore.writes().length;
    let consumed = true;
    if (via === 'button') {
      w.h.leaveMatchReport(false);
    } else {
      consumed = w.h.onBackPress();
    }
    await drainMicrotasks();
    await tickIo();
    const RSre = await loadRecordStore();
    await RSre.init({});
    ok(afterAppear === 1 && writesA > 0 && curPrefStore.dump() === dumpA && curPrefStore.writes().length === writesA && RSre.recent().length === 1 &&
      consumed && w.log.indexOf('lockPortrait') >= 0 && w.log.indexOf('lockPortrait') < w.log.indexOf('LbRouter.toLobby') && !w.log.includes('LbRouter.replaceTable'),
      `RPT-11 ⓐ real Report commits on appear, leave at once (${via}): recent=${afterAppear} → restart recent=${RSre.recent().length}; save bytes identical before / after leaving (${w.log.join(' → ')})`);
  }
  // ⓑ director already committed (RECAP tick) → Report appears → no second write; leave → still 1
  {
    const w = await world(`m-${T0r}-dir`, true);
    const wDir = w.RSr.commitOnce(w.snap, { quit: false, isDemo: false, ff: false, pausedMs: 0 });
    await tickIo();
    const writes0 = curPrefStore.writes().length;
    const dump0 = curPrefStore.dump();
    w.h.aboutToAppear();
    await tickIo();
    w.h.leaveMatchReport(false);
    await drainMicrotasks();
    await tickIo();
    const stored = JSON.parse(prefData.get('recent_v1') || '[]');
    ok(wDir === true && stored.length === 1 && w.RSr.recent().length === 1 && curPrefStore.writes().length === writes0 && curPrefStore.dump() === dump0,
      `RPT-11 ⓑ director wrote first → Report appear + leave add nothing (recent_v1=${stored.length}, writes ${writes0} → ${curPrefStore.writes().length}; dedup by last_match_id)`);
  }
  // 再来一局 (21 §1.6 · S21-29): same opts → startMatch → director.start → release table audio → replaceTable; no lobby, no portrait lock
  {
    const w = await world(`m-${T0r}-again`, true);
    w.h.aboutToAppear();
    await tickIo();
    const dumpA = curPrefStore.dump();
    w.h.leaveMatchReport(true);
    w.h.leaveMatchReport(true);
    await drainMicrotasks();
    const seq = w.log.filter((x) => x !== 'playResult' && !x.startsWith('TableAudio.setSilent')).join(' → ');
    ok(seq === 'director.stop → bootDirector → engine.startMatch:阿龙/4/false → director.start → TableAudio.release → LbRouter.replaceTable' &&
      curPrefStore.dump() === dumpA && w.RSr.recent().length === 1,
      `再来一局 real Report: ${seq} (once; stays landscape; record untouched)`);
    const w2 = await world(`m-${T0r}-again-rejected`, false);
    w2.h.aboutToAppear();
    w2.h.leaveMatchReport(true);
    await drainMicrotasks();
    ok(w2.log.includes('engine.toLobby') && w2.log.includes('LbRouter.toLobby') && !w2.log.includes('LbRouter.replaceTable') && !w2.log.includes('director.start'),
      `再来一局 START_MATCH rejected → falls back to the lobby path (${w2.log.filter((x) => x !== 'playResult' && !x.startsWith('TableAudio.setSilent')).join(' → ')})`);
  }
  // 再来一局 keeps THIS match's opts (21:218): 3 seats, silent match, non-default nickname → startMatch:小满/3/true
  {
    const w = await world(`m-${T0r}-again-3s`, true, { n: 3, silent: true, nick: '小满' });
    w.h.aboutToAppear();
    await tickIo();
    w.h.leaveMatchReport(true);
    await drainMicrotasks();
    const seq3 = w.log.filter((x) => x !== 'playResult' && !x.startsWith('TableAudio.setSilent')).join(' → ');
    ok(seq3 === 'director.stop → bootDirector → engine.startMatch:小满/3/true → director.start → TableAudio.release → LbRouter.replaceTable' &&
      w.log.includes('TableAudio.setSilent:true') && w.RSr.recent().length === 1,
      `再来一局 keeps this match's nickname / playerCount / silent (3 seats, silent, 小满): ${seq3}`);
  }
  // duration on the report = endedAt − startedAt − pausedTotalAt (stub pause 30000 ms → 4:00 − 0:30 = 3:30), same Δ in the stored record
  {
    const w = await world(`m-${T0r}-paused`, true, { paused: 30000 });
    w.h.aboutToAppear();
    await tickIo();
    const rec0 = w.RSr.recent()[0];
    ok(w.h.view && w.h.view.durationText === '用时 3分30秒' && rec0 && rec0.durationMs === 210000,
      `report duration excludes pause (pausedTotalAt=30000): view "${w.h.view && w.h.view.durationText}", record durationMs=${rec0 && rec0.durationMs} (RPT-4)`);
  }
  // 2b（Report.ets 原 :42 / :49 各算一次）：pausedTotalAt 只读一次，战绩与战报同一个值。桩第 1 次答 30000、第 2 次答 45000：
  // 只读一次 → 战报 3分30秒、记录 210000 ms；读两次 → 两处对不上（或都变成 3分15秒）。
  {
    const w = await world(`m-${T0r}-paused-once`, true, { pausedSeq: [30000, 45000] });
    w.h.aboutToAppear();
    await tickIo();
    const rec0 = w.RSr.recent()[0];
    ok(w.pausedCalls.n === 1 && w.h.view && w.h.view.durationText === '用时 3分30秒' && rec0 && rec0.durationMs === 210000,
      `2b pausedTotalAt read once on the real Report: calls=${w.pausedCalls.n}, view "${w.h.view && w.h.view.durationText}", record durationMs=${rec0 && rec0.durationMs} (same Δ)`);
  }
  // view built from the real model + real strings on the same page instance
  {
    const w = await world(`m-${T0r}-view`, true);
    w.h.aboutToAppear();
    ok(w.h.recordsMode === false && w.h.view && w.h.view.topText === '你没撑到最后' && w.h.view.winnerText === '胜者：ai1' && w.h.view.rows[0].slot === 'self' &&
      w.h.view.rows[0].rankText === '第 4 名' && w.h.view.durationText === '用时 4分0秒' && w.h.view.fallbackText === '这一局，没人掀过牌。' && w.h.view.replayText === '',
      `real Report.aboutToAppear → ReportModel view via getStringByNameSync (${w.h.view && w.h.view.topText} · ${w.h.view && w.h.view.winnerText} · self ${w.h.view && w.h.view.rows[0].rankText})`);
  }
}
RUN(false);

// ---------------------------------------------------------------- ⑲ 2b 结算面板收尾（21 §1.5 / §1.7 · 22 §4.2 / §4.5）
RUN(true);
// 2b ①：startMatch 复位 turnWindow（「再来一局」由 Report 直接 startMatch，不经 resetToLobby）。真 startMatch 方法体挂最小宿主跑。
{
  const smBody = body(engine, '  startMatch(opts: StartMatchOpts): boolean {');
  ok(smBody.length > 0, '2b startMatch harness: real MatchEngine.startMatch found');
  if (smBody.length > 0) {
    const TW = enumObj('TurnWindow');
    const PhS = enumObj('Phase');
    const smJs = `class StartHarness {
  constructor() { Object.assign(this, { playLog: { clear() {} }, turnWindow: TurnWindow.FORCE_CHALLENGE, phase: Phase.TURN, dealt: 0 }); }
  buildSeats() {} dealFresh() { this.dealt++; } clearEmptyGate() {}
${stripEts(smBody + '\n  }\n', ['MatchDefaults', 'StartMatchOpts', 'number', 'boolean', 'string'], ['DeckConfig', 'DemoSeedConfig'])}
}
export { StartHarness };`;
    try {
      const SH = (await importFresh(smJs, {
        TurnWindow: TW, Phase: PhS, LifeReason: { NONE: 'NONE' }, TAG: 'MatchEngine', Logger: { info: () => {}, warn: () => {}, error: () => {} },
        SeededRng: class { constructor(s) { this.s = s; } },
        ConfigRepository: { isReady: () => true, snapshotMatchDefaults: () => ({ min_players: 3, max_players: 4, demo_seed_enabled: false, demo_seed_value: 7, lives_default: 3 }),
          deck: () => ({}), demo: () => ({}) }
      })).StartHarness;
      const res = [];
      for (const prev of [TW.FORCE_CHALLENGE, TW.EMPTY_SAFE, TW.CHALLENGE_ONLY, TW.AUTO_SKIP]) {
        const h = new SH();
        h.turnWindow = prev;
        const started = h.startMatch({ nickname: '阿龙', playerCount: 4, silent: false });
        res.push(`${prev}→${h.turnWindow}`);
        if (!(started === true && h.turnWindow === TW.NORMAL && h.phase === PhS.DEAL && h.dealt === 1)) res.push('BAD');
      }
      ok(!res.includes('BAD'), `2b real MatchEngine.startMatch resets turnWindow to NORMAL before the new deal (${res.join(', ')})`);
    } catch (e) {
      fail(`2b startMatch harness did not run: ${e.message}`);
    }
  }
}
// 2b ③：出局座 aliveAtExit 缺失（=0）→ 名次格「—」，出局序标照常；对照 aliveAtExit=3 → 第 3 名（真 ReportModel + 真 string.json）。
if (RMod) {
  const texts2b = new Map(RKEYS.map((k) => [k, strMap.get(k)]));
  const seatsX = [0, 1, 2, 3].map((i) => ({ seatId: i, role: i === 0 ? SRo.HUMAN : SRo.AI, nickname: ['阿龙', '老千', '怂货', '杠精'][i], lives: i === 1 ? 2 : 0 }));
  const evX = [{ kind: EK.OUT, seatId: 2, detail: '', at: 0 }, { kind: EK.OUT, seatId: 0, detail: '', at: 0 }, { kind: EK.OUT, seatId: 3, detail: '', at: 0 }];
  const mk = (alive0) => RMod.build({ seats: seatsX, recap: [0, 1, 2, 3].map((i) => ({ seatId: i, aliveAtExit: [alive0, 0, 4, 2][i] })),
    eventLog: evX, playLog: [], winnerSeatId: 1, roundIndex: 3, startedAt: 0, endedAt: 60000, pausedMs: 0, livesDefault: 3, quit: false, ff: false }, texts2b);
  const v0 = mk(0);
  const v3 = mk(3);
  const r0 = v0.rows.map((r) => `${r.slot}:${r.rankText}:${r.tagText}`);
  ok(v0.rows[0].rankText === '—' && v0.rows[0].tagText === '第 2 个出局' && v3.rows[0].rankText === '第 3 名' &&
    v0.rows[1].rankText === '第 1 名' && v0.rows[2].rankText === '第 4 名',
    `2b aliveAtExit=0 on an OUT seat → rank "—" (not 第 1 名), tag kept; control aliveAtExit=3 → ${v3.rows[0].rankText} (${r0.join(' / ')})`);
}
// 2b ④：22 §4.5 档位 —— 真 ReportPanel.applyTier（L-small 单栏 / L-fold 1.20 ≤ W/H < 1.60 左右 8% / L-phone）。
{
  const atBody = body(reportPanelSrc, '  applyTier(w: number, h: number): void {');
  ok(atBody.length > 0, '2b ReportPanel.applyTier found');
  if (atBody.length > 0) {
    const tierJs = `class TierHarness {
  constructor() { this.narrow = false; this.fold = false; }
${stripEts(atBody + '\n  }\n', ['number', 'boolean'])}
}
export { TierHarness };`;
    const TH = (await importFresh(tierJs, {})).TierHarness;
    const tier = (w, h) => { const t = new TH(); t.applyTier(w, h); return t.narrow ? 'small' : (t.fold ? 'fold' : 'phone'); };
    const cases = [[800, 360, 'phone'], [768, 480, 'phone'], [767, 480, 'fold'], [720, 600, 'fold'], [719, 600, 'phone'], [640, 480, 'fold'], [600, 300, 'small'], [400, 316, 'small']];
    const got = cases.map(([w, h, want]) => `${w}x${h}:${tier(w, h)}${tier(w, h) === want ? '' : '≠' + want}`);
    ok(got.every((x) => !x.includes('≠')), `2b real ReportPanel.applyTier tiers (22 §4.5): ${got.join(', ')}`);
  }
}
RUN(false);
{
  const rp = reportPanelSrc;
  ok(!/'58%'|'42%'/.test(rp) && /\.id\(ControlIds\.RECAP_LIST\)\s*\.width\('100%'\)\s*\.layoutWeight\(this\.narrow \? 0 : 58\)/.test(rp) &&
    /\.id\(ControlIds\.REPORT_HL\)\s*\.width\('100%'\)\s*\.layoutWeight\(this\.narrow \? 0 : 42\)/.test(rp) &&
    /Row\(\{ space: 12 \}\) \{\s*this\.recapTable\(\)\s*this\.highlights\(\)/.test(rp),
    '2b two columns = layoutWeight(58) / (42) inside Row({ space: 12 }) — no 58% + 42% + 12vp overflow; single column unweighted (22 §4.2)');
  ok(/\.padding\(\{ left: this\.fold \? '8%' : 0, right: this\.fold \? '8%' : 0 \}\)/.test(rp) && /this\.applyTier\(Number\(newArea\.width\), Number\(newArea\.height\)\)/.test(rp),
    '2b L-fold → root padding left / right 8% driven by applyTier from onAreaChange (22:283)');
  // 360vp landscape: head ≤ 20% = 72vp even with the ff note (padding + result bar + spaces + line heights, read from the source)
  const hd = body(reportPanelSrc, '  head() {');
  const num = (re) => { const m = re.exec(hd); return m ? Number(m[1]) : NaN; };
  const padT = num(/top: (\d+), bottom: \d+ \}\)/); const padB = num(/top: \d+, bottom: (\d+) \}\)/);
  const space = num(/Column\(\{ space: (\d+) \}\)/); const bar = num(/\.width\('100%'\)\s*\.height\((\d+)\)\s*Row/);
  const lhs = [...hd.matchAll(/\.lineHeight\((\d+)\)/g)].map((m) => Number(m[1]));
  const rowH = Math.max(lhs[0] || NaN, lhs[1] || NaN); const ffH = lhs[2];
  const total = padT + bar + space + rowH + space + ffH + padB;
  ok(/\.constraintSize\(\{ maxHeight: '20%' \}\)/.test(hd) && /\.clip\(true\)/.test(hd) && lhs.length === 3 && Number.isFinite(total) && total <= 360 * 0.2,
    `2b report head ≤ 20% with ff note at 360vp landscape: ${padT}+${bar}+${space}+${rowH}+${space}+${ffH}+${padB} = ${total} ≤ 72vp (22:211)`);
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
  { path: 'MatchTypes', text: types }, { path: 'LbRouter', text: lbRouter }, ...audioTexts,
  { path: 'PlayLog', text: playLogSrc }, { path: 'ReportModel', text: reportModelSrc }, { path: 'Report', text: reportPage }, { path: 'ReportPanel', text: reportPanelSrc }
], [...ANY_ESOBJECT, /:\s*unknown\b/]);
ok(hits.length === 0, hits.length === 0 ? 'PR-B + 结算面板 files: no any/unknown/ESObject in code' : `any/unknown/ESObject:\n  ${formatHits(hits)}`);

console.log(`TALLY real-run ${tally.run}, structural ${tally.struct}, total ${tally.run + tally.struct}`);
console.log(process.exitCode === 1 ? 'prb_client_check FAILED' : 'prb_client_check OK');
