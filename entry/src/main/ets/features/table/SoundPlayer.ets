import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';

const TAG = 'SoundPlayer';
const TAG_READY: string = 'SfxReady';
const TAG_DIAG: string = 'SfxDiag';
const PATH_FLIP: string = 'audio/sfx/sfx_card_flip.wav';
const PATH_EXTINGUISH: string = 'audio/sfx/sfx_life_extinguish.wav';
/** Fail-soft if loadComplete never arrives. Prepare-internal, not a UI sleep. */
const READY_TIMEOUT_MS: number = 1500;

/**
 * Table one-shots that must actually hit SoundPool — not log-only.
 * Disk: sfx_card_flip.wav / sfx_life_extinguish.wav.
 * Call slots stay lb_sfx_card_flip / lb_sfx_life_extinguish (no parallel names).
 * Missing file = fail-soft; visuals still run. Silent skips the player.
 *
 * Ready ≠ load() id. Harmony SoundPool can return an id before loadComplete;
 * play() then queues late (~0.5s). prepare() waits loadComplete + silent warmup
 * so the first user play after enter-table is already ready (not pending).
 * Call-site timing stays #118: flip with playFlip kickoff; extinguish at extFrame=0.
 *
 * DIAG ONLY (#listen): T0/T1/T2 + playN so device logs can compare enter-table
 * playN=1 vs playN=5. Does not change when/how play() is called.
 */
export class SoundPlayer {
  static readonly VOL_FLIP: number = 0.40;
  static readonly VOL_EXTINGUISH: number = 0.42;
  static readonly MAX_STREAMS: number = 4;
  /**
   * DIAG ONLY. false = STREAM_USAGE_MUSIC (OpenHarmony createSoundPool sample).
   * Set true for one Rebuild A/B of STREAM_USAGE_GAME. Not a fix — do not merge as default.
   */
  static readonly DIAG_STREAM_USAGE_GAME: boolean = false;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static flipId: number = -1;
  private static extId: number = -1;
  private static flipReady: boolean = false;
  private static extReady: boolean = false;
  private static silent: boolean = false;
  private static pendingFlip: number = 0;
  private static pendingExt: number = 0;
  private static inFlight: Promise<void> | null = null;
  private static warmResolve: (() => void) | null = null;
  private static warmTimer: number = -1;
  private static completedIds: number[] = [];
  private static firstPlayDone: boolean = false;
  private static diagFlipN: number = 0;
  private static diagExtN: number = 0;
  private static diagFlipT0: number = 0;
  private static diagExtT0: number = 0;
  private static diagFlipT1: number = 0;
  private static diagExtT1: number = 0;

  static bind(context: common.UIAbilityContext): void {
    SoundPlayer.context = context;
  }

  static setSilent(on: boolean): void {
    SoundPlayer.silent = on;
    if (on) {
      SoundPlayer.pendingFlip = 0;
      SoundPlayer.pendingExt = 0;
      Logger.info(TAG, `${SfxIds.CARD_FLIP}/${SfxIds.LIFE_EXTINGUISH} skipped (silent)`);
    }
  }

  static isWarm(): boolean {
    return SoundPlayer.flipReady && SoundPlayer.extReady && SoundPlayer.pool !== null &&
      SoundPlayer.flipId >= 0 && SoundPlayer.extId >= 0;
  }

  static async prepare(): Promise<void> {
    if (SoundPlayer.isWarm()) {
      Logger.info(TAG_READY,
        `SfxReady already warm slot=${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ` +
          `slot=${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId} ready=true pending=false ` +
          `t=${Date.now()} playN=0`);
      return;
    }
    if (SoundPlayer.inFlight !== null) {
      await SoundPlayer.inFlight;
      return;
    }
    const task: Promise<void> = SoundPlayer.doPrepare();
    SoundPlayer.inFlight = task;
    try {
      await task;
    } finally {
      if (SoundPlayer.inFlight === task) {
        SoundPlayer.inFlight = null;
      }
    }
  }

  static playCardFlip(): void {
    SoundPlayer.ensureDiagT0(true);
    SoundPlayer.playNamed(SfxIds.CARD_FLIP, SoundPlayer.flipId, SoundPlayer.VOL_FLIP, true);
  }

  static playLifeExtinguish(): void {
    SoundPlayer.ensureDiagT0(false);
    SoundPlayer.playNamed(SfxIds.LIFE_EXTINGUISH, SoundPlayer.extId, SoundPlayer.VOL_EXTINGUISH, false);
  }

  /** DIAG ONLY: T0 = playFlip / playExtinguish entry (timestamp from the caller). */
  static diagT0(kind: string, t0: number): void {
    if (kind === 'flip') {
      SoundPlayer.diagFlipN = SoundPlayer.diagFlipN + 1;
      SoundPlayer.diagFlipT0 = t0;
      SoundPlayer.diagFlipT1 = 0;
      Logger.info(TAG_DIAG,
        `SfxDiag T0 kind=flip playN=${SoundPlayer.diagFlipN} t=${t0} src=playFlip`);
      return;
    }
    SoundPlayer.diagExtN = SoundPlayer.diagExtN + 1;
    SoundPlayer.diagExtT0 = t0;
    SoundPlayer.diagExtT1 = 0;
    Logger.info(TAG_DIAG,
      `SfxDiag T0 kind=extinguish playN=${SoundPlayer.diagExtN} t=${t0} src=playExtinguish`);
  }

  /** DIAG ONLY: T2 = flip 210ms / extinguish clear. */
  static diagT2(kind: string): void {
    const t2: number = Date.now();
    const isFlip: boolean = kind === 'flip';
    const playN: number = isFlip ? SoundPlayer.diagFlipN : SoundPlayer.diagExtN;
    const t0: number = isFlip ? SoundPlayer.diagFlipT0 : SoundPlayer.diagExtT0;
    const t1: number = isFlip ? SoundPlayer.diagFlipT1 : SoundPlayer.diagExtT1;
    const d20: number = t0 > 0 ? t2 - t0 : -1;
    const d21: number = t1 > 0 ? t2 - t1 : -1;
    Logger.info(TAG_DIAG,
      `SfxDiag T2 kind=${kind} playN=${playN} t=${t2} dT2-T0=${d20} dT2-T1=${d21}`);
  }

  static release(): void {
    SoundPlayer.clearWarmWait();
    SoundPlayer.pendingFlip = 0;
    SoundPlayer.pendingExt = 0;
    SoundPlayer.flipId = -1;
    SoundPlayer.extId = -1;
    SoundPlayer.flipReady = false;
    SoundPlayer.extReady = false;
    SoundPlayer.completedIds = [];
    SoundPlayer.firstPlayDone = false;
    SoundPlayer.resetDiag();
    const pool: media.SoundPool | null = SoundPlayer.pool;
    SoundPlayer.pool = null;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  private static async doPrepare(): Promise<void> {
    if (SoundPlayer.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    try {
      SoundPlayer.resetDiag();
      if (SoundPlayer.pool === null) {
        let usage: audio.StreamUsage = audio.StreamUsage.STREAM_USAGE_MUSIC;
        if (SoundPlayer.DIAG_STREAM_USAGE_GAME) {
          usage = audio.StreamUsage.STREAM_USAGE_GAME;
        }
        const info: audio.AudioRendererInfo = {
          usage: usage,
          rendererFlags: 1
        };
        const pool: media.SoundPool = await media.createSoundPool(SoundPlayer.MAX_STREAMS, info);
        SoundPlayer.pool = pool;
        pool.on('loadComplete', (soundId: number): void => {
          SoundPlayer.onLoadComplete(soundId);
        });
      }
      if (SoundPlayer.flipId < 0) {
        SoundPlayer.flipId = await SoundPlayer.loadPath(PATH_FLIP);
        SoundPlayer.applyCompleted(SoundPlayer.flipId);
      }
      if (SoundPlayer.extId < 0) {
        SoundPlayer.extId = await SoundPlayer.loadPath(PATH_EXTINGUISH);
        SoundPlayer.applyCompleted(SoundPlayer.extId);
      }
      if (SoundPlayer.flipId < 0 && SoundPlayer.extId < 0) {
        Logger.info(TAG_READY, 'SfxReady warmup skipped: both slots missing');
        return;
      }
      SoundPlayer.armReadyTimeout();
      await SoundPlayer.waitSlotsReady();
      await SoundPlayer.warmupSlot(SoundPlayer.flipId, SfxIds.CARD_FLIP);
      await SoundPlayer.warmupSlot(SoundPlayer.extId, SfxIds.LIFE_EXTINGUISH);
      Logger.info(TAG_READY,
        `SfxReady warmup done slot=${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ` +
          `ready=${SoundPlayer.flipReady} pending=${SoundPlayer.pendingFlip} ` +
          `slot=${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId} ` +
          `ready=${SoundPlayer.extReady} pending=${SoundPlayer.pendingExt} ` +
          `t=${Date.now()} usage=${SoundPlayer.usageLabel()} playN=0`);
    } catch (err) {
      Logger.warn(TAG, `pool unavailable — fail-soft, visuals continue: ${err}`);
    }
  }

  private static playNamed(idName: string, soundId: number, volume: number, isFlip: boolean): void {
    const ready: boolean = isFlip ? SoundPlayer.flipReady : SoundPlayer.extReady;
    const first: boolean = !SoundPlayer.firstPlayDone;
    const playN: number = SoundPlayer.diagPlayN(isFlip);
    const now: number = Date.now();
    if (SoundPlayer.silent) {
      SoundPlayer.firstPlayDone = true;
      if (first) {
        Logger.info(TAG_READY,
          `SfxReady firstPlay slot=${idName} id=${soundId} ready=${ready} ` +
            `pending=false deferred=false skipped=silent playN=${playN} t=${now}`);
      } else {
        Logger.info(TAG_READY, `SfxReady ${idName} skipped (silent) playN=${playN} t=${now}`);
      }
      return;
    }
    if (soundId < 0 || SoundPlayer.pool === null || !ready) {
      if (isFlip) {
        SoundPlayer.pendingFlip = SoundPlayer.pendingFlip + 1;
      } else {
        SoundPlayer.pendingExt = SoundPlayer.pendingExt + 1;
      }
      if (first) {
        Logger.info(TAG_READY,
          `SfxReady firstPlay slot=${idName} id=${soundId} ready=false pending=true ` +
            `deferred=true playN=${playN} t=${now}`);
      } else {
        Logger.info(TAG_READY,
          `SfxReady slot=${idName} id=${soundId} ready=false pending=true deferred=true ` +
            `playN=${playN} t=${now}`);
      }
      return;
    }
    SoundPlayer.firstPlayDone = true;
    if (first) {
      Logger.info(TAG_READY,
        `SfxReady firstPlay slot=${idName} id=${soundId} ready=true pending=false ` +
          `deferred=false playN=${playN} t=${now}`);
    } else {
      Logger.info(TAG_READY,
        `SfxReady play slot=${idName} id=${soundId} ready=true pending=false ` +
          `deferred=false playN=${playN} t=${now}`);
    }
    SoundPlayer.firePlay(soundId, volume, 'play');
  }

  private static firePlay(soundId: number, volume: number, path: string): void {
    const pool: media.SoundPool | null = SoundPlayer.pool;
    if (pool === null || soundId < 0) {
      return;
    }
    const kind: string = soundId === SoundPlayer.flipId ? 'flip' : 'extinguish';
    SoundPlayer.diagT1(kind, path, soundId);
    const params: media.PlayParameters = {
      loop: 0,
      rate: audio.AudioRendererRate.RENDER_RATE_NORMAL,
      leftVolume: volume,
      rightVolume: volume,
      priority: 0
    };
    pool.play(soundId, params).catch((err: BusinessError): void => {
      Logger.warn(TAG, `play fail-soft: ${err.message}`);
    });
  }

  private static async warmupSlot(soundId: number, idName: string): Promise<void> {
    const pool: media.SoundPool | null = SoundPlayer.pool;
    if (pool === null || soundId < 0) {
      return;
    }
    const params: media.PlayParameters = {
      loop: 0,
      rate: audio.AudioRendererRate.RENDER_RATE_NORMAL,
      leftVolume: 0,
      rightVolume: 0,
      priority: 0
    };
    try {
      const stream: number = await pool.play(soundId, params);
      Logger.info(TAG_READY, `SfxReady warmup slot=${idName} id=${soundId} stream=${stream} ready=true`);
    } catch (err) {
      Logger.info(TAG_READY, `SfxReady warmup slot=${idName} fail-soft: ${err}`);
    }
  }

  private static onLoadComplete(soundId: number): void {
    if (soundId === SoundPlayer.flipId) {
      SoundPlayer.markReady(true, soundId);
      return;
    }
    if (soundId === SoundPlayer.extId) {
      SoundPlayer.markReady(false, soundId);
      return;
    }
    SoundPlayer.completedIds.push(soundId);
  }

  private static applyCompleted(soundId: number): void {
    if (soundId < 0) {
      return;
    }
    const kept: number[] = [];
    for (let i = 0; i < SoundPlayer.completedIds.length; i++) {
      if (SoundPlayer.completedIds[i] === soundId) {
        SoundPlayer.markReady(soundId === SoundPlayer.flipId, soundId);
      } else {
        kept.push(SoundPlayer.completedIds[i]);
      }
    }
    SoundPlayer.completedIds = kept;
  }

  private static markReady(isFlip: boolean, soundId: number): void {
    if (isFlip) {
      SoundPlayer.flipReady = true;
    } else {
      SoundPlayer.extReady = true;
    }
    const idName: string = isFlip ? SfxIds.CARD_FLIP : SfxIds.LIFE_EXTINGUISH;
    const pending: number = isFlip ? SoundPlayer.pendingFlip : SoundPlayer.pendingExt;
    Logger.info(TAG_READY,
      `SfxReady slot=${idName} id=${soundId} ready=true pending=${pending} deferred=false`);
    SoundPlayer.drainPending(isFlip);
    SoundPlayer.notifyReady();
  }

  private static drainPending(isFlip: boolean): void {
    if (isFlip) {
      const n: number = SoundPlayer.pendingFlip;
      SoundPlayer.pendingFlip = 0;
      for (let i = 0; i < n; i++) {
        SoundPlayer.logDeferredReplay(SfxIds.CARD_FLIP, SoundPlayer.flipId);
        SoundPlayer.firePlay(SoundPlayer.flipId, SoundPlayer.VOL_FLIP, 'deferred');
      }
      return;
    }
    const n: number = SoundPlayer.pendingExt;
    SoundPlayer.pendingExt = 0;
    for (let i = 0; i < n; i++) {
      SoundPlayer.logDeferredReplay(SfxIds.LIFE_EXTINGUISH, SoundPlayer.extId);
      SoundPlayer.firePlay(SoundPlayer.extId, SoundPlayer.VOL_EXTINGUISH, 'deferred');
    }
  }

  private static logDeferredReplay(idName: string, soundId: number): void {
    const first: boolean = !SoundPlayer.firstPlayDone;
    SoundPlayer.firstPlayDone = true;
    const isFlip: boolean = idName === SfxIds.CARD_FLIP;
    const playN: number = SoundPlayer.diagPlayN(isFlip);
    const now: number = Date.now();
    if (first) {
      Logger.info(TAG_READY,
        `SfxReady firstPlay slot=${idName} id=${soundId} ready=true pending=false ` +
          `deferred=true replay=true playN=${playN} t=${now}`);
      return;
    }
    Logger.info(TAG_READY,
      `SfxReady slot=${idName} id=${soundId} ready=true pending=false deferred=true ` +
        `replay=true playN=${playN} t=${now}`);
  }

  private static waitSlotsReady(): Promise<void> {
    if (SoundPlayer.flipReady && SoundPlayer.extReady) {
      SoundPlayer.clearWarmTimer();
      return Promise.resolve();
    }
    return new Promise<void>((resolve: () => void) => {
      SoundPlayer.warmResolve = resolve;
    });
  }

  private static notifyReady(): void {
    if (!SoundPlayer.flipReady || !SoundPlayer.extReady) {
      return;
    }
    SoundPlayer.clearWarmTimer();
    if (SoundPlayer.warmResolve !== null) {
      const done: () => void = SoundPlayer.warmResolve;
      SoundPlayer.warmResolve = null;
      done();
    }
  }

  private static armReadyTimeout(): void {
    SoundPlayer.clearWarmTimer();
    SoundPlayer.warmTimer = setTimeout((): void => {
      SoundPlayer.warmTimer = -1;
      if (!SoundPlayer.flipReady && SoundPlayer.flipId >= 0) {
        Logger.info(TAG_READY,
          `SfxReady slot=${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ready=timeout`);
        SoundPlayer.flipReady = true;
      }
      if (!SoundPlayer.extReady && SoundPlayer.extId >= 0) {
        Logger.info(TAG_READY,
          `SfxReady slot=${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId} ready=timeout`);
        SoundPlayer.extReady = true;
      }
      if (SoundPlayer.warmResolve !== null) {
        const done: () => void = SoundPlayer.warmResolve;
        SoundPlayer.warmResolve = null;
        done();
      }
    }, READY_TIMEOUT_MS);
  }

  private static clearWarmWait(): void {
    SoundPlayer.clearWarmTimer();
    if (SoundPlayer.warmResolve !== null) {
      const done: () => void = SoundPlayer.warmResolve;
      SoundPlayer.warmResolve = null;
      done();
    }
  }

  private static clearWarmTimer(): void {
    if (SoundPlayer.warmTimer >= 0) {
      clearTimeout(SoundPlayer.warmTimer);
      SoundPlayer.warmTimer = -1;
    }
  }

  private static async loadPath(path: string): Promise<number> {
    const ctx: common.UIAbilityContext | null = SoundPlayer.context;
    const pool: media.SoundPool | null = SoundPlayer.pool;
    if (ctx === null || pool === null) {
      return -1;
    }
    try {
      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
      const soundId: number = await pool.load(rawFd.fd, rawFd.offset, rawFd.length);
      await ctx.resourceManager.closeRawFd(path);
      return soundId;
    } catch (err) {
      Logger.warn(TAG, `${path} missing — fail-soft: ${err}`);
      return -1;
    }
  }

  private static ensureDiagT0(isFlip: boolean): void {
    const t0: number = isFlip ? SoundPlayer.diagFlipT0 : SoundPlayer.diagExtT0;
    const t1: number = isFlip ? SoundPlayer.diagFlipT1 : SoundPlayer.diagExtT1;
    if (t0 === 0 || t1 > 0) {
      SoundPlayer.diagT0(isFlip ? 'flip' : 'extinguish', Date.now());
    }
  }

  private static diagT1(kind: string, path: string, soundId: number): void {
    const t1: number = Date.now();
    if (kind === 'flip') {
      SoundPlayer.diagFlipT1 = t1;
    } else {
      SoundPlayer.diagExtT1 = t1;
    }
    const t0: number = kind === 'flip' ? SoundPlayer.diagFlipT0 : SoundPlayer.diagExtT0;
    const playN: number = kind === 'flip' ? SoundPlayer.diagFlipN : SoundPlayer.diagExtN;
    const d10: number = t0 > 0 ? t1 - t0 : -1;
    Logger.info(TAG_DIAG,
      `SfxDiag T1 kind=${kind} playN=${playN} t=${t1} dT1-T0=${d10} path=${path} id=${soundId}`);
  }

  private static diagPlayN(isFlip: boolean): number {
    if (isFlip) {
      return SoundPlayer.diagFlipN;
    }
    return SoundPlayer.diagExtN;
  }

  private static resetDiag(): void {
    SoundPlayer.diagFlipN = 0;
    SoundPlayer.diagExtN = 0;
    SoundPlayer.diagFlipT0 = 0;
    SoundPlayer.diagExtT0 = 0;
    SoundPlayer.diagFlipT1 = 0;
    SoundPlayer.diagExtT1 = 0;
  }

  private static usageLabel(): string {
    if (SoundPlayer.DIAG_STREAM_USAGE_GAME) {
      return 'GAME';
    }
    return 'MUSIC';
  }
}
