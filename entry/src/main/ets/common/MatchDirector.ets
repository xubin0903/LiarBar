import { AiFriend } from '../ai/AiFriend';
import { AiPersonaRegistry } from '../ai/AiPersonaRegistry';
import { AiInfoSet, ChallengeAction, PlayAction } from '../ai/AiTypes';
import { ChallengePolicy } from '../ai/ChallengePolicy';
import { Memory } from '../ai/Memory';
import { PlayPolicy } from '../ai/PlayPolicy';
import { PersonaRow } from '../config/AiPersonasConfig';
import { liveClaimShort, livePhaseText } from '../engine/DealerLines';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchSnapshot } from '../engine/MatchTypes';
import { ResumeShift } from '../engine/ResumeShift';
import { Phase, PlayStyle, SeatRole, TurnWindow } from '../engine/Phase';
import { SeededRng } from '../engine/SeededRng';
import { LiveWindowAdapter, LiveWindowPayload } from '../harmony/LiveWindowAdapter';
import { RecordCommit, RecordStore } from '../persist/RecordStore';
import { Logger } from './Logger';

const TAG = 'MatchDirector';

/**
 * PR-B 恢复缓冲（策划 21 §3.4；负责人 D3：算在 ≤1s 容差内）。
 * 任何恢复（暂停层「继续」/ 离局确认「取消」/ 后台回来「继续」）后这段时间内：
 * 不触发超时（引擎 deadline 抬到 ≥ now+600）、AI 不臂思考不出手（导演 hold）。全仓只此一处定义。
 */
export const RESUME_GRACE_MS: number = 600;

/** 21 §3.1 P04：待停满此时长强停（防序列探针卡死，记日志）。 */
export const PENDING_CAP_MS: number = 8000;

/** 21 §1.7「直接看结算」快进步数上限；超限回落「继续观战」并记日志 ff_cap（负责人 2026-10-07）。 */
export const FF_MAX_STEPS: number = 4000;

/** fastForward() 结果：到 RECAP / 超步数回落观战 / 不在出局选择态（拒绝，什么都不动）。 */
export class FastForwardResult {
  static readonly RECAP: string = 'recap';
  static readonly CAPPED: string = 'capped';
  static readonly REFUSED: string = 'refused';
}

/** PR-B 局内暂停三态。PENDING = 开牌/燃烛序列中按了暂停，序列放完再停。 */
export enum PauseState {
  RUNNING = 'RUNNING',
  PENDING = 'PENDING',
  PAUSED = 'PAUSED'
}

/** shiftMs = 恢复时各 deadline 平移量（只在 PAUSED→RUNNING 时 >0）。 */
export type PauseListener = (state: PauseState, shiftMs: number) => void;

/** 页面报告「开牌/燃烛等不可打断序列」是否仍在放。 */
export type SequenceBusyProbe = () => boolean;

/** 页面报告自己最早的挂起到期时刻（绝对 ms，无 = 0），参与统一平移量计算（21 §3.4）。 */
export type PendingDeadlineProbe = (pausedAtMs: number) => number;

/** 暂停来源（日志/UI 判断用，不影响冻结范围）。 */
export class PauseReasons {
  static readonly USER: string = 'user';
  static readonly BACKGROUND: string = 'background';
  static readonly LEAVE_CONFIRM: string = 'leave_confirm';
  /** 21 §1.7 / §3.1 P15：人类出局二选一（PAUSED 子态 ELIM_CHOICE）。 */
  static readonly ELIM_CHOICE: string = 'elim_choice';
}

/**
 * Dealer clock + AI turns. Pulses the pure engine. No rule numbers of its own.
 * HUMAN TURN / PLAY_REVEAL_SELF: do not arm think, do not runAi, do not expire into autoPlay.
 * AI seats: InfoSetBuilder → Memory → PlayPolicy / ChallengePolicy → ThinkDelay
 * (人机对局AI-核心算法.md v0.2.0). demo_seed force stays behind demo_force_ai_enabled.
 */
export class MatchDirector {
  private timerId: number = -1;
  /**
   * 16 PlayLaunch window. Table sets this; tick must not runAi / submit
   * a second hand while the fly is on screen (F16-4).
   */
  playBusy: boolean = false;
  private thinkUntilMs: number = 0;
  private armedSeat: number = -1;
  private armedRound: number = -1;
  private armedPlays: number = -1;
  readonly ai: AiFriend = new AiFriend();
  private engine: MatchEngine | null = null;
  private live: LiveWindowAdapter | null = null;
  private pauseState: PauseState = PauseState.RUNNING;
  private pauseReason: string = '';
  private pauseListeners: PauseListener[] = [];
  private seqBusyProbe: SequenceBusyProbe | null = null;
  private deadlineProbe: PendingDeadlineProbe | null = null;
  /** RESUME_GRACE_MS 窗口结束点；之前 tick 只 pulse 不动 AI。0 = 无缓冲。 */
  private resumeHoldUntilMs: number = 0;
  private pendingSinceMs: number = 0;
  /** 本局是否走过「直接看结算」快进并到了 RECAP（战绩 ff=true / 战报快进附注同源）。start() 清。 */
  private ffMatch: boolean = false;
  /** 快进步数上限；产品值 = FF_MAX_STEPS（闸只在测试侧改实例字段触发超限）。 */
  private ffMaxSteps: number = FF_MAX_STEPS;

  bind(engine: MatchEngine, live: LiveWindowAdapter): void {
    this.engine = engine;
    this.live = live;
  }

  start(): void {
    if (this.engine === null) {
      return;
    }
    this.stopTimerOnly();
    this.pauseState = PauseState.RUNNING;
    this.pauseReason = '';
    this.resumeHoldUntilMs = 0;
    this.pendingSinceMs = 0;
    this.ffMatch = false;
    this.engine.pulse(Date.now());
    if (this.engine.humanMustWait()) {
      this.thinkUntilMs = 0;
    } else {
      this.armIfNeeded();
    }
    this.timerId = setInterval((): void => {
      this.tick();
    }, 200);
    Logger.info(TAG, 'director started');
  }

  stop(): void {
    this.stopTimerOnly();
    if (this.live !== null) {
      this.live.stop();
    }
    this.thinkUntilMs = 0;
    this.armedSeat = -1;
    this.playBusy = false;
    // PR-B: leaving the match drops any pause silently (engine reset clears its clock).
    this.pauseState = PauseState.RUNNING;
    this.pauseReason = '';
    this.resumeHoldUntilMs = 0;
    this.pendingSinceMs = 0;
  }

  // ---------------------------------------------------------------- PR-B pause

  /**
   * 请求暂停。RUNNING → PAUSED（或序列中 → PENDING）。
   * PENDING/PAUSED 期间重复请求一律忽略（不叠加、不重置）。
   * 例外（21 §3.1 P07 / §3.6）：切后台 = 立即硬冻结，不等序列；PENDING 中切后台直接升 PAUSED（子层/来源不改）。
   * 非对局阶段（LOBBY/RECAP/END）不进暂停。
   */
  requestPause(reason: string): PauseState {
    if (this.engine === null) {
      return this.pauseState;
    }
    const hard: boolean = reason === PauseReasons.BACKGROUND;
    if (hard && this.pauseState === PauseState.PENDING) {
      Logger.info(TAG, `background during PENDING → hard freeze (keep reason=${this.pauseReason})`);
      this.enterPaused();
      return PauseState.PAUSED;
    }
    if (this.pauseState !== PauseState.RUNNING) {
      Logger.info(TAG, `pause ignored (${this.pauseState}) reason=${reason}`);
      return this.pauseState;
    }
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null || !this.isLivePhase(snap.phase)) {
      return PauseState.RUNNING;
    }
    this.pauseReason = reason;
    if (!hard && this.sequenceBusy(snap)) {
      this.pauseState = PauseState.PENDING;
      this.pendingSinceMs = Date.now();
      Logger.info(TAG, `pause PENDING (sequence busy) phase=${snap.phase} reason=${reason}`);
      this.notifyPause(0);
      return PauseState.PENDING;
    }
    this.enterPaused();
    return PauseState.PAUSED;
  }

  /**
   * 恢复（PENDING 时 = 取消待停，没冻过就不加缓冲）。返回统一平移量 shift ms。
   * PAUSED → RUNNING：shift = ResumeShift.compute(Δ, 引擎 4 deadline + thinkUntilMs + 页面最早到期, RESUME_GRACE_MS)，
   * 所有挂起 deadline 都加这同一个 shift（到期顺序不变，最早一项距恢复 ≥ RESUME_GRACE_MS）；
   * 页面经 listener 拿到同一个 shift。并 hold 导演 RESUME_GRACE_MS（期间 AI 不臂不出手）。
   */
  resumeFromPause(): number {
    if (this.pauseState === PauseState.PENDING) {
      this.pauseState = PauseState.RUNNING;
      this.pauseReason = '';
      this.pendingSinceMs = 0;
      Logger.info(TAG, 'pending pause cancelled');
      this.notifyPause(0);
      return 0;
    }
    if (this.pauseState !== PauseState.PAUSED || this.engine === null) {
      return 0;
    }
    const now: number = Date.now();
    const pausedAt: number = this.engine.clockPausedAtMs();
    const pending: number[] = [this.engine.earliestDeadline(), this.thinkUntilMs];
    const probe: PendingDeadlineProbe | null = this.deadlineProbe;
    if (probe !== null) {
      pending.push(probe(pausedAt));
    }
    const want: number = ResumeShift.compute(pausedAt, now, RESUME_GRACE_MS, pending);
    const shift: number = this.engine.resumeClock(now, want);
    if (this.thinkUntilMs > 0) {
      this.thinkUntilMs = this.thinkUntilMs + shift;
    }
    this.resumeHoldUntilMs = now + RESUME_GRACE_MS;
    this.pauseState = PauseState.RUNNING;
    this.pauseReason = '';
    this.pendingSinceMs = 0;
    Logger.info(TAG, `resume shift=${shift}ms buffer=${RESUME_GRACE_MS}ms thinkUntil=${this.thinkUntilMs}`);
    this.notifyPause(shift);
    return shift;
  }

  pauseStateNow(): PauseState {
    return this.pauseState;
  }

  isPaused(): boolean {
    return this.pauseState === PauseState.PAUSED;
  }

  isPausePending(): boolean {
    return this.pauseState === PauseState.PENDING;
  }

  pauseReasonNow(): string {
    return this.pauseReason;
  }

  setSequenceBusyProbe(probe: SequenceBusyProbe | null): void {
    this.seqBusyProbe = probe;
  }

  setPendingDeadlineProbe(probe: PendingDeadlineProbe | null): void {
    this.deadlineProbe = probe;
  }

  addPauseListener(fn: PauseListener): void {
    for (let i = 0; i < this.pauseListeners.length; i++) {
      if (this.pauseListeners[i] === fn) {
        return;
      }
    }
    this.pauseListeners.push(fn);
  }

  removePauseListener(fn: PauseListener): void {
    const kept: PauseListener[] = [];
    for (let i = 0; i < this.pauseListeners.length; i++) {
      if (this.pauseListeners[i] !== fn) {
        kept.push(this.pauseListeners[i]);
      }
    }
    this.pauseListeners = kept;
  }

  private enterPaused(): void {
    if (this.engine === null) {
      return;
    }
    this.engine.pauseClock(Date.now());
    this.pauseState = PauseState.PAUSED;
    this.pendingSinceMs = 0;
    this.resumeHoldUntilMs = 0;
    Logger.info(TAG, `PAUSED reason=${this.pauseReason} thinkUntil=${this.thinkUntilMs}`);
    this.notifyPause(0);
  }

  /** 开牌/燃烛：质疑仪式→判定→扣烛窗口，或页面报告翻牌/桌槌序列仍在放；出牌飞出（21 §3.2 playBusy）。 */
  private sequenceBusy(snap: MatchSnapshot): boolean {
    if (snap.phase === Phase.CHALLENGE_RITUAL || snap.phase === Phase.JUDGE || snap.phase === Phase.PENALTY) {
      return true;
    }
    if (this.playBusy) {
      return true;
    }
    const probe: SequenceBusyProbe | null = this.seqBusyProbe;
    if (probe !== null && probe()) {
      return true;
    }
    return false;
  }

  private isLivePhase(phase: Phase): boolean {
    return phase !== Phase.LOBBY && phase !== Phase.RECAP && phase !== Phase.END;
  }

  private notifyPause(shiftMs: number): void {
    const list: PauseListener[] = this.pauseListeners;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](this.pauseState, shiftMs);
      } catch (err) {
        Logger.warn(TAG, 'pause listener fail-soft');
      }
    }
  }

  // ------------------------------------------------------------------ tick

  tick(): void {
    if (this.engine === null) {
      return;
    }
    if (this.pauseState === PauseState.PAUSED) {
      // Frozen: no pulse (engine deadlines), no AI think, no live-window countdown.
      return;
    }
    this.engine.pulse(Date.now());
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null) {
      return;
    }
    this.pushLive(snap);
    if (snap.phase === Phase.RECAP || snap.phase === Phase.END || snap.phase === Phase.LOBBY) {
      if (this.pauseState === PauseState.PENDING) {
        // Sequence ended the match — nothing left to pause.
        this.pauseState = PauseState.RUNNING;
        this.pauseReason = '';
        this.pendingSinceMs = 0;
        this.notifyPause(0);
      }
      if (snap.phase === Phase.RECAP) {
        this.commitRecap(snap);
      }
      return;
    }
    if (this.pauseState === PauseState.PENDING) {
      const capped: boolean = this.pendingSinceMs > 0 && Date.now() - this.pendingSinceMs >= PENDING_CAP_MS;
      if (!this.sequenceBusy(snap) || capped) {
        // 待停：序列放完（或满 PENDING_CAP_MS 强停）→ 立刻进暂停，本 tick 不让 AI 动。
        if (capped) {
          Logger.warn(TAG, `pending cap ${PENDING_CAP_MS}ms hit — force pause`);
        }
        this.enterPaused();
      }
      // 21 §3.2：待停期间只放完当前序列，不先臂 AI、不出手。
      return;
    }
    if (this.playBusy) {
      return;
    }
    if (this.engine.humanMustWait()) {
      this.thinkUntilMs = 0;
      return;
    }
    if (this.resumeHoldUntilMs > 0) {
      if (Date.now() < this.resumeHoldUntilMs) {
        // RESUME_GRACE_MS：恢复后缓冲期内 AI 不臂思考、不出手（超时由引擎 deadline 下限挡住）。
        return;
      }
      this.resumeHoldUntilMs = 0;
    }
    this.armIfNeeded();
    if (this.thinkUntilMs > 0 && Date.now() >= this.thinkUntilMs) {
      this.thinkUntilMs = 0;
      this.runAi();
    }
  }

  /**
   * PR-B 战绩：进 RECAP 写一次（21 §2.4 / 21:298：正常 / 观战 / 快进终局同一处，last_match_id 去重；演示局不写；时长扣暂停）。
   * 离局确认的中退只在非 RECAP 阶段写，同键去重 → 两路不会都写。快进局 ff=true（21 §1.7）。
   */
  private commitRecap(snap: MatchSnapshot): void {
    if (this.engine === null) {
      return;
    }
    const recapCommit: RecordCommit = {
      quit: false,
      isDemo: this.engine.isDemoMatch(),
      ff: this.ffMatch,
      pausedMs: this.engine.pausedTotalAt(snap.endedAt > 0 ? snap.endedAt : Date.now())
    };
    RecordStore.commitOnce(snap, recapCommit);
  }

  /** 本局是否为快进结算（Report 读：战绩 ff 与 lb_txt_report_ff_note 同源）。 */
  isFastForwardMatch(): boolean {
    return this.ffMatch;
  }

  /**
   * 21 §1.7「直接看结算」（D2）：只在 PAUSED.ELIM_CHOICE 下可调。导演用虚拟时钟连续 pulse()：
   * DEAL → dealDone()、CHALLENGE_RITUAL → skipRitual()、PENALTY → penaltyDone()；AI 回合照常 armIfNeeded()（ThinkDelay 照常抽数算 thinkMs）
   * 再 runAi()（同一路径、同一 turnRng；与 tick 同拍：每次臂只出手一次，没出成就照常等引擎超时托管），只是不等 thinkMs；没人能动时把虚拟时钟拨到引擎下一个 deadline 再 pulse（如真人座超时）。
   * 无音频、无动画（页面冻帧，期间不 pull）。到 RECAP：同一处 commitRecap（ff=true）→ 返回 RECAP，由页面直接路由结算。
   * 满 ffMaxSteps 仍未到 RECAP：记日志 ff_cap，按「继续观战」恢复对局（RUNNING + RESUME_GRACE_MS 缓冲，通知页面），返回 CAPPED。
   * ELIM_CHOICE 期间的等待照常算暂停（resumeClock 记入 pausedTotal）。
   */
  fastForward(): string {
    if (this.engine === null || this.pauseState !== PauseState.PAUSED || this.pauseReason !== PauseReasons.ELIM_CHOICE) {
      return FastForwardResult.REFUSED;
    }
    const engine: MatchEngine = this.engine;
    const startMs: number = Date.now();
    engine.resumeClock(startMs, 0);
    this.ffMatch = true;
    this.playBusy = false;
    let vt: number = startMs;
    let steps: number = 0;
    let snap: MatchSnapshot | null = engine.current();
    while (snap !== null && this.isLivePhase(snap.phase) && steps < this.ffMaxSteps) {
      steps++;
      const before: string = this.ffProgressKey(snap);
      engine.pulse(vt);
      snap = engine.current();
      if (snap === null || !this.isLivePhase(snap.phase)) {
        break;
      }
      if (this.ffProgressKey(snap) !== before) {
        continue;
      }
      if (snap.phase === Phase.DEAL) {
        engine.dealDone();
      } else if (snap.phase === Phase.CHALLENGE_RITUAL) {
        engine.skipRitual();
      } else if (snap.phase === Phase.PENALTY) {
        engine.penaltyDone();
      } else if (snap.phase === Phase.TURN && this.isAiSeat(snap, snap.currentSeatId)) {
        // 与 tick 同一节拍：每次臂（ThinkDelay 抽数）只出手一次；不等 thinkMs。没出成（如出牌被拒）照常等引擎超时托管，不重试。
        this.armIfNeeded();
        if (this.thinkUntilMs > 0) {
          this.thinkUntilMs = 0;
          this.runAi();
        }
      }
      snap = engine.current();
      if (snap !== null && this.ffProgressKey(snap) === before) {
        const due: number = engine.earliestDeadline();
        vt = due > vt ? due : vt + 1000;
      }
    }
    if (snap !== null && snap.phase === Phase.RECAP) {
      this.pauseState = PauseState.RUNNING;
      this.pauseReason = '';
      this.pendingSinceMs = 0;
      this.commitRecap(snap);
      Logger.info(TAG, `fast-forward → RECAP in ${steps} steps`);
      return FastForwardResult.RECAP;
    }
    Logger.warn(TAG, `ff_cap: ${steps} steps without RECAP (cap ${this.ffMaxSteps}) → fall back to spectate`);
    // 虚拟时钟 vt 跑在墙钟前面：已武装的 deadline 一律平移 −(vt − now)、引擎 nowMs = now，观战按真实时间接着走（剩余时长不变）。
    engine.rebaseClock(vt, Date.now());
    this.ffMatch = false;
    this.armedSeat = -1;
    this.resumeHoldUntilMs = Date.now() + RESUME_GRACE_MS;
    this.pauseState = PauseState.RUNNING;
    this.pauseReason = '';
    this.pendingSinceMs = 0;
    this.notifyPause(0);
    return FastForwardResult.CAPPED;
  }

  /** 快进「这一步有没有推进」：阶段 / 轮 / 手 / 当前座 / 窗口 / 仪式拍 / 事件条数任一变化即推进。 */
  private ffProgressKey(snap: MatchSnapshot): string {
    return `${snap.phase}|${snap.roundIndex}|${snap.playIndexInRound}|${snap.currentSeatId}|${snap.turnWindow}|${snap.ritualBeat}|${snap.eventLog.length}`;
  }

  private stopTimerOnly(): void {
    if (this.timerId >= 0) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }

  private armIfNeeded(): void {
    if (this.engine === null) {
      return;
    }
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null || snap.phase !== Phase.TURN) {
      return;
    }
    if (this.armedSeat === snap.currentSeatId && this.armedRound === snap.roundIndex &&
      this.armedPlays === snap.playIndexInRound) {
      return;
    }
    this.armedSeat = snap.currentSeatId;
    this.armedRound = snap.roundIndex;
    this.armedPlays = snap.playIndexInRound;
    if (!this.isAiSeat(snap, snap.currentSeatId)) {
      this.thinkUntilMs = 0;
      return;
    }
    const rng: SeededRng = this.turnRng(snap);
    const info: AiInfoSet = this.engine.buildAiInfoSet(snap.currentSeatId);
    const mem: Memory = Memory.fromInfoSet(info);
    let thinkMs: number = 1500;
    if (this.challengeGate(info, snap.turnWindow)) {
      thinkMs = ChallengePolicy.decideChallenge(info, mem, rng, false).thinkMs;
    } else {
      thinkMs = PlayPolicy.decidePlay(info, mem, rng, false).thinkMs;
    }
    this.thinkUntilMs = Date.now() + thinkMs;
  }

  private runAi(): void {
    if (this.engine === null) {
      return;
    }
    const engine: MatchEngine = this.engine;
    const snap: MatchSnapshot | null = engine.current();
    if (snap === null || snap.phase !== Phase.TURN) {
      return;
    }
    if (!this.isAiSeat(snap, snap.currentSeatId)) {
      return;
    }
    if (engine.demoForceAiEnabled()) {
      if (engine.shouldForceKarenChallenge()) {
        engine.intentChallenge();
        this.maybeTableColor(snap);
        return;
      }
      if (engine.shouldForceSharkPlay()) {
        engine.demoForcePlay();
        this.maybeTableColor(snap);
        return;
      }
    }
    const info: AiInfoSet = engine.buildAiInfoSet(snap.currentSeatId);
    const mem: Memory = Memory.fromInfoSet(info);
    const rng: SeededRng = this.turnRng(snap);
    const win: TurnWindow = snap.turnWindow;
    if (info.forceChallenge2 || win === TurnWindow.FORCE_CHALLENGE) {
      ChallengePolicy.decideChallenge(info, mem, rng, true);
      engine.intentChallenge();
      this.maybeTableColor(snap);
      return;
    }
    if (snap.canChallenge || win === TurnWindow.CHALLENGE_ONLY || win === TurnWindow.EMPTY_SAFE) {
      const ch: ChallengeAction = ChallengePolicy.decideChallenge(info, mem, rng, true);
      if (ch.type === 'DOUBT') {
        engine.intentChallenge();
        this.maybeTableColor(snap);
        return;
      }
      if (ch.type === 'SKIP' || win === TurnWindow.CHALLENGE_ONLY || win === TurnWindow.EMPTY_SAFE) {
        engine.skip();
        this.maybeTableColor(snap);
        return;
      }
    }
    if (snap.hasCards) {
      const play: PlayAction = PlayPolicy.decidePlay(info, mem, rng, true);
      engine.intentPlay();
      engine.submitPlay(play.cardIds, this.toStyle(play.style), play.speech, play.namedSeatId);
    } else {
      engine.skip();
    }
    this.maybeTableColor(snap);
  }

  private challengeGate(info: AiInfoSet, win: TurnWindow): boolean {
    if (info.forceChallenge2) {
      return true;
    }
    if (info.canChallenge) {
      return true;
    }
    if (win === TurnWindow.CHALLENGE_ONLY || win === TurnWindow.EMPTY_SAFE || win === TurnWindow.FORCE_CHALLENGE) {
      return true;
    }
    return false;
  }

  private toStyle(style: string): PlayStyle {
    if (style === 'SLAM') {
      return PlayStyle.SLAM;
    }
    if (style === 'HESITATE') {
      return PlayStyle.HESITATE;
    }
    return PlayStyle.SOFT;
  }

  private maybeTableColor(prev: MatchSnapshot): void {
    if (this.engine === null) {
      return;
    }
    const rng: SeededRng = this.turnRng(prev);
    const persona: string = this.personaOf(prev, prev.currentSeatId);
    const row: PersonaRow = this.ai.row(persona);
    if (rng.nextBool(row.pEmoteAfterPlay)) {
      this.engine.emote(prev.currentSeatId, 'SMILE');
    }
    if (rng.nextBool(row.pKnock)) {
      this.engine.tableAct(prev.currentSeatId, 'KNOCK');
    }
    if (rng.nextBool(row.pSignNo)) {
      this.engine.tableAct(prev.currentSeatId, 'SIGN_NO');
    }
  }

  private personaOf(snap: MatchSnapshot, seatId: number): string {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === seatId) {
        if (snap.seats[i].aiPersona.length > 0) {
          return snap.seats[i].aiPersona;
        }
      }
    }
    return AiPersonaRegistry.personaIdForSeat(seatId);
  }

  private turnRng(snap: MatchSnapshot): SeededRng {
    return new SeededRng(snap.seed + snap.roundIndex * 1009 + snap.playIndexInRound * 17 + snap.currentSeatId);
  }

  /** Unknown seat is not AI — fail closed so HUMAN is never auto-played. */
  private isAiSeat(snap: MatchSnapshot, seatId: number): boolean {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === seatId) {
        return snap.seats[i].role === SeatRole.AI;
      }
    }
    return false;
  }

  private pushLive(snap: MatchSnapshot): void {
    if (this.live === null) {
      return;
    }
    const remain: number = Math.ceil(snap.turnRemainMs / 1000);
    const payload: LiveWindowPayload = {
      phaseText: livePhaseText(snap),
      remainSec: remain,
      claimShort: liveClaimShort(snap)
    };
    if (!this.live.update(payload)) {
      this.live.start(payload);
    }
  }
}
