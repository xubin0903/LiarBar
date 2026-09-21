import { AiFriend } from '../ai/AiFriend';
import { AiPersonaRegistry } from '../ai/AiPersonaRegistry';
import { AiSeatController } from '../ai/AiSeatController';
import { AiInfoSet, ChallengeAction, PlayAction } from '../ai/AiTypes';
import { PersonaRow } from '../config/AiPersonasConfig';
import { liveClaimShort, livePhaseText } from '../engine/DealerLines';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchSnapshot } from '../engine/MatchTypes';
import { Phase, PlayStyle, SeatRole, TurnWindow } from '../engine/Phase';
import { SeededRng } from '../engine/SeededRng';
import { LiveWindowAdapter, LiveWindowPayload } from '../harmony/LiveWindowAdapter';
import { Logger } from './Logger';

const TAG = 'MatchDirector';

/**
 * Dealer clock + AI turns. Pulses the pure engine. No rule numbers of its own.
 * HUMAN TURN / PLAY_REVEAL_SELF: do not arm think, do not runAi, do not expire into autoPlay.
 * AI seats: think-delay then AiInfoSet → AiSeatController (人机对局AI.md v0.1.0).
 * demo_seed PLAY/CHALLENGE force is behind demo_force_ai_enabled (default OFF).
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

  bind(engine: MatchEngine, live: LiveWindowAdapter): void {
    this.engine = engine;
    this.live = live;
  }

  start(): void {
    if (this.engine === null) {
      return;
    }
    this.stopTimerOnly();
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
  }

  tick(): void {
    if (this.engine === null) {
      return;
    }
    this.engine.pulse(Date.now());
    const snap: MatchSnapshot | null = this.engine.current();
    if (snap === null) {
      return;
    }
    this.pushLive(snap);
    if (snap.phase === Phase.RECAP || snap.phase === Phase.END || snap.phase === Phase.LOBBY) {
      return;
    }
    if (this.playBusy) {
      return;
    }
    if (this.engine.humanMustWait()) {
      this.thinkUntilMs = 0;
      return;
    }
    this.armIfNeeded();
    if (this.thinkUntilMs > 0 && Date.now() >= this.thinkUntilMs) {
      this.thinkUntilMs = 0;
      this.runAi();
    }
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
    const persona: string = this.personaOf(snap, snap.currentSeatId);
    const ctrl: AiSeatController = AiSeatController.create(snap.currentSeatId, persona);
    this.thinkUntilMs = Date.now() + ctrl.thinkDelayMs(rng, snap.config.turn_seconds);
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
    const rng: SeededRng = this.turnRng(snap);
    const ctrl: AiSeatController = AiSeatController.create(snap.currentSeatId, info.personaId);
    const win: TurnWindow = snap.turnWindow;
    if (info.forceChallenge2 || win === TurnWindow.FORCE_CHALLENGE) {
      engine.intentChallenge();
      this.maybeTableColor(snap);
      return;
    }
    if (snap.canChallenge || win === TurnWindow.CHALLENGE_ONLY || win === TurnWindow.EMPTY_SAFE) {
      const ch: ChallengeAction = ctrl.decideChallenge(info, rng);
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
      const play: PlayAction = ctrl.decidePlay(info, rng);
      engine.intentPlay();
      engine.submitPlay(play.cardIds, this.toStyle(play.style), play.speech, play.namedSeatId);
    } else {
      engine.skip();
    }
    this.maybeTableColor(snap);
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
