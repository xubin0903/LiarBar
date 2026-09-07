import { AiFriend, AiDecision } from '../ai/AiFriend';
import { liveClaimShort, livePhaseText } from '../engine/DealerLines';
import { MatchEngine } from '../engine/MatchEngine';
import { MatchSnapshot } from '../engine/MatchTypes';
import { Phase, SeatRole, TurnWindow } from '../engine/Phase';
import { SeededRng } from '../engine/SeededRng';
import { LiveWindowAdapter, LiveWindowPayload } from '../harmony/LiveWindowAdapter';
import { Logger } from './Logger';

const TAG = 'MatchDirector';

/**
 * Dealer clock + AI turns. Pulses the pure engine. No rule numbers of its own.
 */
export class MatchDirector {
  private timerId: number = -1;
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
    this.armIfNeeded();
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
    if (this.roleOf(snap, snap.currentSeatId) !== SeatRole.AI) {
      this.thinkUntilMs = 0;
      return;
    }
    const rng: SeededRng = this.turnRng(snap);
    let persona: string = '';
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.currentSeatId) {
        persona = snap.seats[i].aiPersona;
      }
    }
    this.thinkUntilMs = Date.now() + this.ai.thinkDelayMs(persona, rng);
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
    if (this.roleOf(snap, snap.currentSeatId) !== SeatRole.AI) {
      return;
    }
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
    const hand = engine.handForAi(snap.currentSeatId);
    const rng: SeededRng = this.turnRng(snap);
    const d: AiDecision = this.ai.decide(snap, hand, rng);
    if (d.kind === 'CHALLENGE') {
      engine.intentChallenge();
    } else if (d.kind === 'PLAY') {
      engine.intentPlay();
      engine.submitPlay(d.cardIds, d.style, d.speech, d.namedSeatId);
    } else {
      if (snap.turnWindow === TurnWindow.CHALLENGE_ONLY || !snap.hasCards) {
        engine.skip();
      } else {
        engine.intentPlay();
        engine.submitPlay(d.cardIds, d.style, d.speech, d.namedSeatId);
      }
    }
    this.maybeTableColor(snap);
  }

  private maybeTableColor(prev: MatchSnapshot): void {
    if (this.engine === null) {
      return;
    }
    const rng: SeededRng = this.turnRng(prev);
    let persona: string = '';
    for (let i = 0; i < prev.seats.length; i++) {
      if (prev.seats[i].seatId === prev.currentSeatId) {
        persona = prev.seats[i].aiPersona;
      }
    }
    const row = this.ai.row(persona);
    if (rng.nextBool(row.p_emote_after_play)) {
      this.engine.emote(prev.currentSeatId, 'SMILE');
    }
    if (rng.nextBool(row.p_knock)) {
      this.engine.tableAct(prev.currentSeatId, 'KNOCK');
    }
    if (rng.nextBool(row.p_sign_no)) {
      this.engine.tableAct(prev.currentSeatId, 'SIGN_NO');
    }
  }

  private turnRng(snap: MatchSnapshot): SeededRng {
    return new SeededRng(snap.seed + snap.roundIndex * 1009 + snap.playIndexInRound * 17 + snap.currentSeatId);
  }

  private roleOf(snap: MatchSnapshot, seatId: number): SeatRole {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === seatId) {
        return snap.seats[i].role;
      }
    }
    return SeatRole.AI;
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
