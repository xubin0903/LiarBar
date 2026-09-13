import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { SfxPcm, SfxWavClip } from './SfxPcm';

const TAG = 'SoundPlayer';
const TAG_READY: string = 'SfxReady';
const TAG_DIAG: string = 'SfxDiag';
const PATH_FLIP: string = 'audio/sfx/sfx_card_flip.wav';
const PATH_EXTINGUISH: string = 'audio/sfx/sfx_life_extinguish.wav';
/** Fail-soft if loadComplete never arrives. Prepare-internal, not a UI sleep. */
const READY_TIMEOUT_MS: number = 1500;

/**
 * Table one-shots that must actually hit a player — not log-only.
 * Disk: sfx_card_flip.wav / sfx_life_extinguish.wav (48 kHz mono PCM16).
 * Call slots stay lb_sfx_card_flip / lb_sfx_life_extinguish (no parallel names).
 * Missing file = fail-soft; visuals still run. Silent skips the player.
 *
 * EXP 1 CLOSED (falsified): BGM mute via debug, still late. dT1-T0≈3–5ms;
 * playRet 2–8ms; dT2≈210–218ms; playFin-T1≈283–335ms. Flip wav≈200ms →
 * onset vs T1 still ~80–130ms late. Not BGM contention.
 *
 * EXP 2 — sample rate: log device preferred output vs rawfile wav. If
 * mismatch, resample in memory (no silence trim). Art slot names stay
 * sfx_card_flip / sfx_life_extinguish at the device native rate.
 *
 * EXP 3 PRIMARY — AudioRenderer writeData, pre-started GAME renderer
 * (official PCM path). SoundPool stays as A/B (debug 低延迟/池播).
 * BAN StreamUsage-only change — still GAME.
 *
 * EXP 4 — buffer / queue (this pack). #128 ear still late after rate match.
 * playFin was last writeData copy (write-complete), NOT speaker onset.
 * Official writeData: VALID buffers are queued for playback; idle VALID
 * silence therefore sits in the HAL queue (getBufferSize periods).
 * ArkTS AudioRendererOptions has no SetLatencyMode / SetFrameSizeInCallback
 * (those are OHAudio C). Lever here: do not queue silence (INVALID idle),
 * flush() residual, log measured cbBytes/bufMs. rendererFlags stays 1
 * (OH AUDIO_FLAG_MMAP try) then 0. Interrupt stays SHARE_MODE.
 *
 * Hang points stay #118: flip with playFlip kickoff; extinguish extFrame=0.
 * DIAG: T0/T1/T2 + playRet + write0 + playFin(sem=writeDone) + SfxReady.
 * VOL_FLIP stays 0.70.
 */
export class SoundPlayer {
  /** SEPARATE from latency EXP 1. #126 ear: flip too quiet. 0.40 → 0.70. */
  static readonly VOL_FLIP: number = 0.70;
  /** SEPARATE from latency EXP 1. Slight bump 0.42 → 0.55. */
  static readonly VOL_EXTINGUISH: number = 0.55;
  static readonly MAX_STREAMS: number = 4;
  /**
   * Production short-SFX path. #125 DIAG_STREAM_USAGE_GAME is now the default:
   * GAME + rendererFlags:1. MUSIC sample is not used for flip/extinguish.
   */
  static readonly DIAG_STREAM_USAGE_GAME: boolean = true;
  /**
   * EXP 3 rebuild flag. true = AudioRenderer (PRIMARY). false = SoundPool A/B.
   * Debug 低延迟/池播 can still flip at runtime. NOT a StreamUsage-only switch.
   */
  static readonly EXP_USE_RENDERER: boolean = true;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static flipId: number = -1;
  private static extId: number = -1;
  private static flipWarmId: number = -1;
  private static extWarmId: number = -1;
  private static lastFlipStream: number = 0;
  private static lastExtStream: number = 0;
  private static flipReady: boolean = false;
  private static extReady: boolean = false;
  private static silent: boolean = false;
  private static pendingFlip: number = 0;
  private static pendingExt: number = 0;
  private static inFlight: Promise<void> | null = null;
  private static warmResolve: (() => void) | null = null;
  private static warmTimer: number = -1;
  private static completedIds: number[] = [];
  private static completeWaitId: number = -1;
  private static completeWaitResolve: (() => void) | null = null;
  private static completeWaitTimer: number = -1;
  private static firstPlayDone: boolean = false;
  private static diagFlipN: number = 0;
  private static diagExtN: number = 0;
  private static diagFlipT0: number = 0;
  private static diagExtT0: number = 0;
  private static diagFlipT1: number = 0;
  private static diagExtT1: number = 0;
  private static useRenderer: boolean = true;
  private static rendererOk: boolean = false;
  private static deviceRate: number = 48000;
  private static flipClip: SfxWavClip | null = null;
  private static extClip: SfxWavClip | null = null;
  private static flipRenderer: audio.AudioRenderer | null = null;
  private static extRenderer: audio.AudioRenderer | null = null;
  private static flipCursor: number = -1;
  private static extCursor: number = -1;
  private static flipPlayArmed: boolean = false;
  private static extPlayArmed: boolean = false;
  private static rendererSeq: number = 0;
  private static flipFlushGen: number = 0;
  private static extFlushGen: number = 0;
  private static flipWrote0: boolean = false;
  private static extWrote0: boolean = false;
  private static flipCbBytes: number = 0;
  private static extCbBytes: number = 0;
  private static flipGetBuf: number = 0;
  private static extGetBuf: number = 0;

  static bind(context: common.UIAbilityContext): void {
    SoundPlayer.context = context;
    SoundPlayer.useRenderer = SoundPlayer.EXP_USE_RENDERER;
  }

  static setSilent(on: boolean): void {
    SoundPlayer.silent = on;
    if (on) {
      SoundPlayer.pendingFlip = 0;
      SoundPlayer.pendingExt = 0;
      SoundPlayer.flipCursor = -1;
      SoundPlayer.extCursor = -1;
      SoundPlayer.flipPlayArmed = false;
      SoundPlayer.extPlayArmed = false;
      SoundPlayer.flipFlushGen = SoundPlayer.flipFlushGen + 1;
      SoundPlayer.extFlushGen = SoundPlayer.extFlushGen + 1;
      SoundPlayer.flipWrote0 = false;
      SoundPlayer.extWrote0 = false;
      Logger.info(TAG, `${SfxIds.CARD_FLIP}/${SfxIds.LIFE_EXTINGUISH} skipped (silent)`);
    }
  }

  static usesRenderer(): boolean {
    return SoundPlayer.useRenderer && SoundPlayer.rendererOk;
  }

  /**
   * EXP 3 A/B: renderer vs SoundPool. Does not move hang points.
   * Both paths stay warm after prepare so the toggle is instant.
   */
  static setUseRenderer(on: boolean): void {
    SoundPlayer.useRenderer = on;
    Logger.info(TAG_DIAG,
      `SfxDiag path toggle renderer=${on} ok=${SoundPlayer.rendererOk} ` +
        `exp=${SoundPlayer.EXP_USE_RENDERER}`);
  }

  static isWarm(): boolean {
    if (SoundPlayer.usesRenderer()) {
      return SoundPlayer.flipClip !== null && SoundPlayer.extClip !== null &&
        SoundPlayer.flipRenderer !== null && SoundPlayer.extRenderer !== null;
    }
    return SoundPlayer.flipReady && SoundPlayer.extReady && SoundPlayer.pool !== null &&
      SoundPlayer.flipId >= 0 && SoundPlayer.extId >= 0;
  }

  static async prepare(): Promise<void> {
    if (SoundPlayer.isWarm()) {
      Logger.info(TAG_READY,
        `SfxReady already warm slot=${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ` +
          `slot=${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId} ready=true pending=false ` +
          `t=${Date.now()} usage=${SoundPlayer.usageLabel()} playN=0 ` +
          `path=${SoundPlayer.pathLabel()}`);
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
    SoundPlayer.clearCompleteWait();
    SoundPlayer.pendingFlip = 0;
    SoundPlayer.pendingExt = 0;
    SoundPlayer.flipId = -1;
    SoundPlayer.extId = -1;
    SoundPlayer.flipWarmId = -1;
    SoundPlayer.extWarmId = -1;
    SoundPlayer.lastFlipStream = 0;
    SoundPlayer.lastExtStream = 0;
    SoundPlayer.flipReady = false;
    SoundPlayer.extReady = false;
    SoundPlayer.completedIds = [];
    SoundPlayer.firstPlayDone = false;
    SoundPlayer.resetDiag();
    SoundPlayer.releaseRenderers();
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
      SoundPlayer.useRenderer = SoundPlayer.EXP_USE_RENDERER;
      await SoundPlayer.prepareClipsAndRates();
      await SoundPlayer.prepareRenderers();
      if (SoundPlayer.pool === null) {
        const info: audio.AudioRendererInfo = {
          usage: audio.StreamUsage.STREAM_USAGE_GAME,
          rendererFlags: 1
        };
        const pool: media.SoundPool = await media.createSoundPool(SoundPlayer.MAX_STREAMS, info);
        SoundPlayer.pool = pool;
        pool.on('loadComplete', (soundId: number): void => {
          SoundPlayer.onLoadComplete(soundId);
        });
        pool.on('playFinishedWithStreamId', (streamId: number): void => {
          SoundPlayer.onPlayFinished(streamId);
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
      if (SoundPlayer.flipId < 0 && SoundPlayer.extId < 0 && !SoundPlayer.rendererOk) {
        Logger.info(TAG_READY, 'SfxReady warmup skipped: both slots missing');
        return;
      }
      SoundPlayer.armReadyTimeout();
      await SoundPlayer.waitSlotsReady();
      await SoundPlayer.warmupIsolated(PATH_FLIP, SfxIds.CARD_FLIP, true);
      await SoundPlayer.warmupIsolated(PATH_EXTINGUISH, SfxIds.LIFE_EXTINGUISH, false);
      Logger.info(TAG_READY,
        `SfxReady warmup done slot=${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ` +
          `warmId=${SoundPlayer.flipWarmId} ready=${SoundPlayer.flipReady} ` +
          `pending=${SoundPlayer.pendingFlip} ` +
          `slot=${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId} ` +
          `warmId=${SoundPlayer.extWarmId} ` +
          `ready=${SoundPlayer.extReady} pending=${SoundPlayer.pendingExt} ` +
          `t=${Date.now()} usage=${SoundPlayer.usageLabel()} playN=0 ` +
          `path=${SoundPlayer.pathLabel()} deviceRate=${SoundPlayer.deviceRate}`);
    } catch (err) {
      Logger.warn(TAG, `pool unavailable — fail-soft, visuals continue: ${err}`);
    }
  }

  private static playNamed(idName: string, soundId: number, volume: number, isFlip: boolean): void {
    const renderer: boolean = SoundPlayer.slotRendererReady(isFlip);
    const ready: boolean = renderer ? true :
      (isFlip ? SoundPlayer.flipReady : SoundPlayer.extReady);
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
    if (!renderer && (soundId < 0 || SoundPlayer.pool === null || !ready)) {
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
          `deferred=false playN=${playN} t=${now} path=${SoundPlayer.pathLabel()}`);
    } else {
      Logger.info(TAG_READY,
        `SfxReady play slot=${idName} id=${soundId} ready=true pending=false ` +
          `deferred=false playN=${playN} t=${now} path=${SoundPlayer.pathLabel()}`);
    }
    if (renderer) {
      SoundPlayer.fireRenderer(volume, 'renderer', isFlip);
      return;
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
    const prev: number = kind === 'flip' ? SoundPlayer.lastFlipStream : SoundPlayer.lastExtStream;
    if (prev > 0) {
      pool.stop(prev).catch((err: BusinessError): void => {
        Logger.info(TAG, `stop prev fail-soft: ${err.message}`);
      });
    }
    const params: media.PlayParameters = {
      loop: 0,
      rate: audio.AudioRendererRate.RENDER_RATE_NORMAL,
      leftVolume: volume,
      rightVolume: volume,
      priority: 1
    };
    const tCall: number = Date.now();
    pool.play(soundId, params).then((stream: number): void => {
      const tRet: number = Date.now();
      if (kind === 'flip') {
        SoundPlayer.lastFlipStream = stream;
      } else {
        SoundPlayer.lastExtStream = stream;
      }
      const playN: number = SoundPlayer.diagPlayN(kind === 'flip');
      const dRet: number = tRet - tCall;
      Logger.info(TAG_DIAG,
        `SfxDiag playRet kind=${kind} playN=${playN} t=${tRet} stream=${stream} ` +
          `dPlayRet-T1=${dRet} usage=${SoundPlayer.usageLabel()} id=${soundId} ` +
          `path=play wavMs=${SoundPlayer.wavMs(kind === 'flip')}`);
    }).catch((err: BusinessError): void => {
      Logger.warn(TAG, `play fail-soft: ${err.message}`);
    });
  }

  private static fireRenderer(volume: number, path: string, isFlip: boolean): void {
    const clip: SfxWavClip | null = isFlip ? SoundPlayer.flipClip : SoundPlayer.extClip;
    const renderer: audio.AudioRenderer | null =
      isFlip ? SoundPlayer.flipRenderer : SoundPlayer.extRenderer;
    if (clip === null || renderer === null) {
      return;
    }
    const kind: string = isFlip ? 'flip' : 'extinguish';
    SoundPlayer.diagT1(kind, path, isFlip ? SoundPlayer.flipId : SoundPlayer.extId);
    const tCall: number = Date.now();
    renderer.setVolume(volume).catch((err: BusinessError): void => {
      Logger.info(TAG, `setVolume fail-soft: ${err.message}`);
    });
    SoundPlayer.ensureRendererRunning(renderer);
    const gen: number = SoundPlayer.beginFlushArm(isFlip);
    try {
      renderer.flush().then((): void => {
        SoundPlayer.finishFlushArm(isFlip, gen, kind, tCall, clip);
      }).catch((err: BusinessError): void => {
        Logger.info(TAG, `flush fail-soft: ${err.message}`);
        SoundPlayer.finishFlushArm(isFlip, gen, kind, tCall, clip);
      });
    } catch (err) {
      Logger.info(TAG, `flush throw fail-soft: ${err}`);
      SoundPlayer.finishFlushArm(isFlip, gen, kind, tCall, clip);
    }
  }

  private static finishFlushArm(isFlip: boolean, gen: number, kind: string, tCall: number,
    clip: SfxWavClip): void {
    if (!SoundPlayer.sameFlushGen(isFlip, gen)) {
      return;
    }
    SoundPlayer.armRendererPlay(isFlip);
    const tRet: number = Date.now();
    const stream: number = isFlip ? SoundPlayer.lastFlipStream : SoundPlayer.lastExtStream;
    const playN: number = SoundPlayer.diagPlayN(isFlip);
    Logger.info(TAG_DIAG,
      `SfxDiag playRet kind=${kind} playN=${playN} t=${tRet} stream=${stream} ` +
        `dPlayRet-T1=${tRet - tCall} usage=${SoundPlayer.usageLabel()} ` +
        `id=${isFlip ? SoundPlayer.flipId : SoundPlayer.extId} path=renderer ` +
        `wavMs=${clip.durationMs} rate=${clip.sampleRate} ` +
        `bufMs=${SoundPlayer.bufMsOf(SoundPlayer.cbBytes(isFlip), clip)} ` +
        `cbBytes=${SoundPlayer.cbBytes(isFlip)} getBuf=${SoundPlayer.getBuf(isFlip)} ` +
        `sem=armedAfterFlush`);
  }

  /**
   * Prime the GAME renderer on a *copy* of the wav, then stop that stream.
   * User play keeps flipId/extId so silent warmup cannot steal the audible id
   * (OH: same sound ID play() multiple times may only play once).
   */
  private static async warmupIsolated(path: string, idName: string, isFlip: boolean): Promise<void> {
    const warmId: number = await SoundPlayer.loadPath(path);
    if (isFlip) {
      SoundPlayer.flipWarmId = warmId;
    } else {
      SoundPlayer.extWarmId = warmId;
    }
    if (warmId < 0) {
      Logger.info(TAG_READY, `SfxReady warmup slot=${idName} skipped (missing copy)`);
      return;
    }
    await SoundPlayer.waitOneComplete(warmId);
    await SoundPlayer.warmupSlot(warmId, idName);
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
      Logger.info(TAG_READY,
        `SfxReady warmup slot=${idName} id=${soundId} stream=${stream} ready=true isolated=true`);
      if (stream > 0) {
        await pool.stop(stream);
        Logger.info(TAG_READY,
          `SfxReady warmup slot=${idName} id=${soundId} stream=${stream} stopped=true`);
      }
    } catch (err) {
      Logger.info(TAG_READY, `SfxReady warmup slot=${idName} fail-soft: ${err}`);
    }
  }

  private static onLoadComplete(soundId: number): void {
    if (soundId === SoundPlayer.flipId) {
      SoundPlayer.markReady(true, soundId);
      SoundPlayer.finishCompleteWait(soundId);
      return;
    }
    if (soundId === SoundPlayer.extId) {
      SoundPlayer.markReady(false, soundId);
      SoundPlayer.finishCompleteWait(soundId);
      return;
    }
    SoundPlayer.completedIds.push(soundId);
    SoundPlayer.finishCompleteWait(soundId);
  }

  private static onPlayFinished(streamId: number): void {
    const tFin: number = Date.now();
    let kind: string = '';
    if (SoundPlayer.lastFlipStream === streamId) {
      kind = 'flip';
      SoundPlayer.lastFlipStream = 0;
    } else if (SoundPlayer.lastExtStream === streamId) {
      kind = 'extinguish';
      SoundPlayer.lastExtStream = 0;
    }
    if (kind.length === 0) {
      return;
    }
    SoundPlayer.logPlayFin(kind, streamId, tFin, 'play');
  }

  private static logPlayFin(kind: string, streamId: number, tFin: number, path: string): void {
    const isFlip: boolean = kind === 'flip';
    const playN: number = SoundPlayer.diagPlayN(isFlip);
    const t0: number = isFlip ? SoundPlayer.diagFlipT0 : SoundPlayer.diagExtT0;
    const t1: number = isFlip ? SoundPlayer.diagFlipT1 : SoundPlayer.diagExtT1;
    const dFin1: number = t1 > 0 ? tFin - t1 : -1;
    const dFin0: number = t0 > 0 ? tFin - t0 : -1;
    const clip: SfxWavClip | null = isFlip ? SoundPlayer.flipClip : SoundPlayer.extClip;
    const cb: number = SoundPlayer.cbBytes(isFlip);
    const sem: string = path === 'renderer' ? 'writeDone' : 'poolFinished';
    Logger.info(TAG_DIAG,
      `SfxDiag playFin kind=${kind} playN=${playN} t=${tFin} stream=${streamId} ` +
        `dPlayFin-T1=${dFin1} dPlayFin-T0=${dFin0} path=${path} ` +
        `wavMs=${SoundPlayer.wavMs(isFlip)} bufMs=${SoundPlayer.bufMsOf(cb, clip)} ` +
        `cbBytes=${cb} sem=${sem} note=playFin≠onset`);
  }

  private static applyCompleted(soundId: number): void {
    if (soundId < 0) {
      return;
    }
    const kept: number[] = [];
    for (let i = 0; i < SoundPlayer.completedIds.length; i++) {
      if (SoundPlayer.completedIds[i] === soundId) {
        if (soundId === SoundPlayer.flipId) {
          SoundPlayer.markReady(true, soundId);
        } else if (soundId === SoundPlayer.extId) {
          SoundPlayer.markReady(false, soundId);
        }
      } else {
        kept.push(SoundPlayer.completedIds[i]);
      }
    }
    SoundPlayer.completedIds = kept;
  }

  private static hasCompleted(soundId: number): boolean {
    for (let i = 0; i < SoundPlayer.completedIds.length; i++) {
      if (SoundPlayer.completedIds[i] === soundId) {
        return true;
      }
    }
    return false;
  }

  private static waitOneComplete(soundId: number): Promise<void> {
    if (soundId < 0 || SoundPlayer.hasCompleted(soundId)) {
      return Promise.resolve();
    }
    if (soundId === SoundPlayer.flipId && SoundPlayer.flipReady) {
      return Promise.resolve();
    }
    if (soundId === SoundPlayer.extId && SoundPlayer.extReady) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve: () => void) => {
      SoundPlayer.clearCompleteWait();
      SoundPlayer.completeWaitId = soundId;
      SoundPlayer.completeWaitResolve = resolve;
      SoundPlayer.completeWaitTimer = setTimeout((): void => {
        SoundPlayer.completeWaitTimer = -1;
        if (SoundPlayer.completeWaitId === soundId) {
          SoundPlayer.completeWaitId = -1;
          SoundPlayer.completeWaitResolve = null;
          resolve();
        }
      }, READY_TIMEOUT_MS);
    });
  }

  private static finishCompleteWait(soundId: number): void {
    if (SoundPlayer.completeWaitId !== soundId || SoundPlayer.completeWaitResolve === null) {
      return;
    }
    const done: () => void = SoundPlayer.completeWaitResolve;
    SoundPlayer.clearCompleteWait();
    done();
  }

  private static clearCompleteWait(): void {
    if (SoundPlayer.completeWaitTimer >= 0) {
      clearTimeout(SoundPlayer.completeWaitTimer);
      SoundPlayer.completeWaitTimer = -1;
    }
    SoundPlayer.completeWaitId = -1;
    SoundPlayer.completeWaitResolve = null;
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
        if (SoundPlayer.slotRendererReady(true)) {
          SoundPlayer.fireRenderer(SoundPlayer.VOL_FLIP, 'deferred', true);
        } else {
          SoundPlayer.firePlay(SoundPlayer.flipId, SoundPlayer.VOL_FLIP, 'deferred');
        }
      }
      return;
    }
    const n: number = SoundPlayer.pendingExt;
    SoundPlayer.pendingExt = 0;
    for (let i = 0; i < n; i++) {
      SoundPlayer.logDeferredReplay(SfxIds.LIFE_EXTINGUISH, SoundPlayer.extId);
      if (SoundPlayer.slotRendererReady(false)) {
        SoundPlayer.fireRenderer(SoundPlayer.VOL_EXTINGUISH, 'deferred', false);
      } else {
        SoundPlayer.firePlay(SoundPlayer.extId, SoundPlayer.VOL_EXTINGUISH, 'deferred');
      }
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
    if (SoundPlayer.rendererOk && SoundPlayer.flipClip !== null && SoundPlayer.extClip !== null) {
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
      `SfxDiag T1 kind=${kind} playN=${playN} t=${t1} dT1-T0=${d10} path=${path} ` +
        `id=${soundId} usage=${SoundPlayer.usageLabel()} rate=${SoundPlayer.deviceRate}`);
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
    return 'GAME';
  }

  private static pathLabel(): string {
    if (SoundPlayer.usesRenderer()) {
      return 'renderer';
    }
    return 'play';
  }

  private static wavMs(isFlip: boolean): number {
    const clip: SfxWavClip | null = isFlip ? SoundPlayer.flipClip : SoundPlayer.extClip;
    if (clip !== null) {
      return clip.durationMs;
    }
    if (isFlip) {
      return 200;
    }
    return 420;
  }

  private static slotRendererReady(isFlip: boolean): boolean {
    if (!SoundPlayer.useRenderer || !SoundPlayer.rendererOk) {
      return false;
    }
    if (isFlip) {
      return SoundPlayer.flipClip !== null && SoundPlayer.flipRenderer !== null;
    }
    return SoundPlayer.extClip !== null && SoundPlayer.extRenderer !== null;
  }

  /**
   * Disarm until flush() drops queued VALID silence, then arm.
   * writeData must stay INVALID during this window.
   */
  private static beginFlushArm(isFlip: boolean): number {
    if (isFlip) {
      SoundPlayer.flipPlayArmed = false;
      SoundPlayer.flipCursor = -1;
      SoundPlayer.flipWrote0 = false;
      SoundPlayer.flipFlushGen = SoundPlayer.flipFlushGen + 1;
      return SoundPlayer.flipFlushGen;
    }
    SoundPlayer.extPlayArmed = false;
    SoundPlayer.extCursor = -1;
    SoundPlayer.extWrote0 = false;
    SoundPlayer.extFlushGen = SoundPlayer.extFlushGen + 1;
    return SoundPlayer.extFlushGen;
  }

  private static sameFlushGen(isFlip: boolean, gen: number): boolean {
    if (isFlip) {
      return SoundPlayer.flipFlushGen === gen;
    }
    return SoundPlayer.extFlushGen === gen;
  }

  private static armRendererPlay(isFlip: boolean): void {
    SoundPlayer.rendererSeq = SoundPlayer.rendererSeq + 1;
    const stream: number = SoundPlayer.rendererSeq;
    if (isFlip) {
      SoundPlayer.flipCursor = 0;
      SoundPlayer.flipPlayArmed = true;
      SoundPlayer.lastFlipStream = stream;
      return;
    }
    SoundPlayer.extCursor = 0;
    SoundPlayer.extPlayArmed = true;
    SoundPlayer.lastExtStream = stream;
  }

  private static cbBytes(isFlip: boolean): number {
    if (isFlip) {
      return SoundPlayer.flipCbBytes;
    }
    return SoundPlayer.extCbBytes;
  }

  private static getBuf(isFlip: boolean): number {
    if (isFlip) {
      return SoundPlayer.flipGetBuf;
    }
    return SoundPlayer.extGetBuf;
  }

  private static bufMsOf(bytes: number, clip: SfxWavClip | null): number {
    if (clip === null || clip.sampleRate < 1 || clip.channels < 1 || bytes < 1) {
      return 0;
    }
    return Math.round(bytes * 1000 / (clip.sampleRate * clip.channels * 2));
  }

  private static framesOf(bytes: number, clip: SfxWavClip | null): number {
    if (clip === null || clip.channels < 1 || bytes < 1) {
      return 0;
    }
    return Math.floor(bytes / (clip.channels * 2));
  }

  private static logBuf(isFlip: boolean, clip: SfxWavClip, getBuf: number, cbBytes: number): void {
    const slot: string = isFlip ? SfxIds.CARD_FLIP : SfxIds.LIFE_EXTINGUISH;
    const measured: number = cbBytes > 0 ? cbBytes : getBuf;
    Logger.info(TAG_DIAG,
      `SfxDiag buf slot=${slot} getBufferSize=${getBuf} cbBytes=${cbBytes} ` +
        `frames=${SoundPlayer.framesOf(measured, clip)} ` +
        `bufMs=${SoundPlayer.bufMsOf(measured, clip)} flags=1 interrupt=SHARE ` +
        `rate=${clip.sampleRate} ch=${clip.channels} ` +
        `note=ArkTS-no-SetFrameSize;INVALID-idle+flush`);
  }

  /** First PCM copied into writeData buffer — still not speaker, but ≠ playFin. */
  private static logWrite0(isFlip: boolean, cbBytes: number, clip: SfxWavClip): void {
    const t0w: number = Date.now();
    const kind: string = isFlip ? 'flip' : 'extinguish';
    const playN: number = SoundPlayer.diagPlayN(isFlip);
    const t0: number = isFlip ? SoundPlayer.diagFlipT0 : SoundPlayer.diagExtT0;
    const t1: number = isFlip ? SoundPlayer.diagFlipT1 : SoundPlayer.diagExtT1;
    const stream: number = isFlip ? SoundPlayer.lastFlipStream : SoundPlayer.lastExtStream;
    const d1: number = t1 > 0 ? t0w - t1 : -1;
    const d0: number = t0 > 0 ? t0w - t0 : -1;
    const bufMs: number = SoundPlayer.bufMsOf(cbBytes, clip);
    Logger.info(TAG_DIAG,
      `SfxDiag write0 kind=${kind} playN=${playN} t=${t0w} stream=${stream} ` +
        `dWrite0-T1=${d1} dWrite0-T0=${d0} path=renderer ` +
        `bufBytes=${cbBytes} frames=${SoundPlayer.framesOf(cbBytes, clip)} ` +
        `bufMs=${bufMs} getBuf=${SoundPlayer.getBuf(isFlip)} ` +
        `sem=firstPcm note=write0≠onset`);
    setTimeout((): void => {
      SoundPlayer.logTsPos(isFlip, stream, t0w);
    }, 0);
  }

  /** Playhead after first PCM enqueue. Claimed, not ear. Do not call from writeData. */
  private static logTsPos(isFlip: boolean, stream: number, write0At: number): void {
    const renderer: audio.AudioRenderer | null =
      isFlip ? SoundPlayer.flipRenderer : SoundPlayer.extRenderer;
    if (renderer === null) {
      return;
    }
    try {
      const info: audio.AudioTimestampInfo = renderer.getAudioTimestampInfoSync();
      const t: number = Date.now();
      const t1: number = isFlip ? SoundPlayer.diagFlipT1 : SoundPlayer.diagExtT1;
      const playN: number = SoundPlayer.diagPlayN(isFlip);
      const kind: string = isFlip ? 'flip' : 'extinguish';
      Logger.info(TAG_DIAG,
        `SfxDiag tsPos kind=${kind} playN=${playN} t=${t} stream=${stream} ` +
          `framePos=${info.framePos} tsNs=${info.timestamp} ` +
          `dTs-T1=${t1 > 0 ? t - t1 : -1} dTs-write0=${t - write0At} ` +
          `path=renderer sem=playhead note=notSpeaker`);
    } catch (err) {
      Logger.info(TAG_DIAG,
        `SfxDiag tsPos kind=${isFlip ? 'flip' : 'extinguish'} ` +
          `playN=${SoundPlayer.diagPlayN(isFlip)} stream=${stream} ` +
          `sem=playhead fail-soft=${err}`);
    }
  }

  /** EXP 2: device preferred output vs rawfile wav. Resample on mismatch; never trim. */
  private static async prepareClipsAndRates(): Promise<void> {
    const ctx: common.UIAbilityContext | null = SoundPlayer.context;
    if (ctx === null) {
      return;
    }
    SoundPlayer.deviceRate = await SoundPlayer.probeDeviceRate();
    const flipRaw: SfxWavClip | null = await SoundPlayer.loadClip(PATH_FLIP);
    const extRaw: SfxWavClip | null = await SoundPlayer.loadClip(PATH_EXTINGUISH);
    const flipRate: number = flipRaw !== null ? flipRaw.sampleRate : 0;
    const extRate: number = extRaw !== null ? extRaw.sampleRate : 0;
    const matchFlip: boolean = flipRate === SoundPlayer.deviceRate;
    const matchExt: boolean = extRate === SoundPlayer.deviceRate;
    Logger.info(TAG_DIAG,
      `SfxDiag rate device=${SoundPlayer.deviceRate} wavFlip=${flipRate} wavExt=${extRate} ` +
        `matchFlip=${matchFlip} matchExt=${matchExt} slot=${SfxIds.CARD_FLIP} ` +
        `file=${PATH_FLIP} slot=${SfxIds.LIFE_EXTINGUISH} file=${PATH_EXTINGUISH}`);
    if (flipRaw === null) {
      Logger.info(TAG_DIAG,
        `SfxDiag rate art-needed slot=${SfxIds.CARD_FLIP} nativeRate=${SoundPlayer.deviceRate} ` +
          `current=unreadable file=${PATH_FLIP} note=PCM16-wav`);
    } else if (!matchFlip) {
      Logger.info(TAG_DIAG,
        `SfxDiag rate mismatch slot=${SfxIds.CARD_FLIP} wav=${flipRate} ` +
          `device=${SoundPlayer.deviceRate} action=resample`);
    }
    if (extRaw === null) {
      Logger.info(TAG_DIAG,
        `SfxDiag rate art-needed slot=${SfxIds.LIFE_EXTINGUISH} nativeRate=${SoundPlayer.deviceRate} ` +
          `current=unreadable file=${PATH_EXTINGUISH} note=PCM16-wav`);
    } else if (!matchExt) {
      Logger.info(TAG_DIAG,
        `SfxDiag rate mismatch slot=${SfxIds.LIFE_EXTINGUISH} wav=${extRate} ` +
          `device=${SoundPlayer.deviceRate} action=resample`);
    }
    if (flipRaw !== null) {
      SoundPlayer.flipClip = matchFlip ? flipRaw : SfxPcm.resampleTo(flipRaw, SoundPlayer.deviceRate);
    }
    if (extRaw !== null) {
      SoundPlayer.extClip = matchExt ? extRaw : SfxPcm.resampleTo(extRaw, SoundPlayer.deviceRate);
    }
  }

  private static async probeDeviceRate(): Promise<number> {
    try {
      const routing: audio.AudioRoutingManager = audio.getAudioManager().getRoutingManager();
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_GAME,
        rendererFlags: 1
      };
      let devices: audio.AudioDeviceDescriptors =
        await routing.getPreferOutputDeviceForRendererInfo(info);
      let src: string = 'preferOutput';
      if (devices.length === 0) {
        devices = await routing.getDevices(audio.DeviceFlag.OUTPUT_DEVICES_FLAG);
        src = 'outputDevices';
      }
      if (devices.length === 0) {
        Logger.info(TAG_DIAG, `SfxDiag rate device=48000 src=default48k list=-`);
        return 48000;
      }
      const desc: audio.AudioDeviceDescriptor = devices[0];
      const picked: number = SfxPcm.pickDeviceRate(desc.sampleRates);
      Logger.info(TAG_DIAG,
        `SfxDiag rate device=${picked} src=${src} list=${SfxPcm.joinRates(desc.sampleRates)} ` +
          `type=${desc.deviceType}`);
      return picked;
    } catch (err) {
      Logger.info(TAG_DIAG, `SfxDiag rate device=48000 src=default48k fail-soft=${err}`);
      return 48000;
    }
  }

  private static async loadClip(path: string): Promise<SfxWavClip | null> {
    const ctx: common.UIAbilityContext | null = SoundPlayer.context;
    if (ctx === null) {
      return null;
    }
    try {
      const bytes: Uint8Array = await ctx.resourceManager.getRawFileContent(path);
      return SfxPcm.parseWav(bytes, path);
    } catch (err) {
      Logger.warn(TAG, `${path} clip missing — fail-soft: ${err}`);
      return null;
    }
  }

  /** EXP 3: pre-started AudioRenderer + writeData silence so HAL is already open. */
  private static async prepareRenderers(): Promise<void> {
    SoundPlayer.rendererOk = false;
    if (SoundPlayer.flipClip === null && SoundPlayer.extClip === null) {
      Logger.info(TAG_READY, 'SfxReady renderer skipped: no PCM clips');
      return;
    }
    try {
      if (SoundPlayer.flipClip !== null) {
        SoundPlayer.flipRenderer = await SoundPlayer.createSlotRenderer(SoundPlayer.flipClip, true);
      }
      if (SoundPlayer.extClip !== null) {
        SoundPlayer.extRenderer = await SoundPlayer.createSlotRenderer(SoundPlayer.extClip, false);
      }
      SoundPlayer.rendererOk = SoundPlayer.flipRenderer !== null && SoundPlayer.extRenderer !== null;
      Logger.info(TAG_READY,
        `SfxReady renderer prepare ok=${SoundPlayer.rendererOk} ` +
          `flip=${SoundPlayer.flipRenderer !== null} ext=${SoundPlayer.extRenderer !== null} ` +
          `rate=${SoundPlayer.deviceRate} exp=${SoundPlayer.EXP_USE_RENDERER}`);
    } catch (err) {
      Logger.warn(TAG, `renderer unavailable — SoundPool A/B remains: ${err}`);
      SoundPlayer.rendererOk = false;
    }
  }

  private static async createSlotRenderer(clip: SfxWavClip, isFlip: boolean): Promise<audio.AudioRenderer | null> {
    let work: SfxWavClip = clip;
    let renderer: audio.AudioRenderer | null =
      await SoundPlayer.tryCreateRenderer(work, 1);
    if (renderer === null && work.channels === 1) {
      work = SfxPcm.upmixMonoToStereo(work);
      renderer = await SoundPlayer.tryCreateRenderer(work, 1);
      if (renderer !== null) {
        if (isFlip) {
          SoundPlayer.flipClip = work;
        } else {
          SoundPlayer.extClip = work;
        }
        Logger.info(TAG_DIAG,
          `SfxDiag rate upmix slot=${isFlip ? SfxIds.CARD_FLIP : SfxIds.LIFE_EXTINGUISH} ` +
            `mono→stereo device=${work.sampleRate}`);
      }
    }
    if (renderer === null) {
      renderer = await SoundPlayer.tryCreateRenderer(work, 0);
    }
    if (renderer === null) {
      return null;
    }
    if (isFlip) {
      renderer.on('writeData', (buffer: ArrayBuffer): audio.AudioDataCallbackResult => {
        return SoundPlayer.fillRenderer(buffer, true);
      });
    } else {
      renderer.on('writeData', (buffer: ArrayBuffer): audio.AudioDataCallbackResult => {
        return SoundPlayer.fillRenderer(buffer, false);
      });
    }
    try {
      await renderer.setInterruptMode(audio.InterruptMode.SHARE_MODE);
    } catch (err) {
      Logger.info(TAG, `setInterruptMode fail-soft: ${err}`);
    }
    try {
      await renderer.start();
      let getBuf: number = 0;
      try {
        getBuf = renderer.getBufferSizeSync();
      } catch (bufErr) {
        Logger.info(TAG, `getBufferSizeSync fail-soft: ${bufErr}`);
      }
      if (isFlip) {
        SoundPlayer.flipGetBuf = getBuf;
      } else {
        SoundPlayer.extGetBuf = getBuf;
      }
      try {
        await renderer.flush();
      } catch (flushErr) {
        Logger.info(TAG, `warmup flush fail-soft: ${flushErr}`);
      }
      Logger.info(TAG_READY,
        `SfxReady renderer start slot=${isFlip ? SfxIds.CARD_FLIP : SfxIds.LIFE_EXTINGUISH} ` +
          `rate=${work.sampleRate} ch=${work.channels} wavMs=${work.durationMs}`);
      SoundPlayer.logBuf(isFlip, work, getBuf, 0);
    } catch (err) {
      Logger.warn(TAG, `renderer start fail-soft: ${err}`);
      renderer.release().catch((e: BusinessError): void => {
        Logger.info(TAG, `renderer release fail-soft: ${e.message}`);
      });
      return null;
    }
    return renderer;
  }

  private static async tryCreateRenderer(clip: SfxWavClip, flags: number): Promise<audio.AudioRenderer | null> {
    try {
      const streamInfo: audio.AudioStreamInfo = {
        samplingRate: SfxPcm.toSamplingRate(clip.sampleRate),
        channels: SfxPcm.toChannel(clip.channels),
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
      };
      const rendererInfo: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_GAME,
        rendererFlags: flags
      };
      const options: audio.AudioRendererOptions = {
        streamInfo: streamInfo,
        rendererInfo: rendererInfo
      };
      return await audio.createAudioRenderer(options);
    } catch (err) {
      Logger.info(TAG, `createAudioRenderer flags=${flags} ch=${clip.channels} fail-soft: ${err}`);
      return null;
    }
  }

  private static fillRenderer(buffer: ArrayBuffer, isFlip: boolean): audio.AudioDataCallbackResult {
    const dest: Uint8Array = new Uint8Array(buffer);
    const firstCb: boolean = isFlip ? SoundPlayer.flipCbBytes === 0 : SoundPlayer.extCbBytes === 0;
    if (isFlip) {
      SoundPlayer.flipCbBytes = dest.length;
    } else {
      SoundPlayer.extCbBytes = dest.length;
    }
    if (firstCb && dest.length > 0) {
      const measure: SfxWavClip | null = isFlip ? SoundPlayer.flipClip : SoundPlayer.extClip;
      if (measure !== null) {
        SoundPlayer.logBuf(isFlip, measure, SoundPlayer.getBuf(isFlip), dest.length);
      }
    }
    const clip: SfxWavClip | null = isFlip ? SoundPlayer.flipClip : SoundPlayer.extClip;
    let cursor: number = isFlip ? SoundPlayer.flipCursor : SoundPlayer.extCursor;
    const armed: boolean = isFlip ? SoundPlayer.flipPlayArmed : SoundPlayer.extPlayArmed;
    if (clip === null || !armed || cursor < 0) {
      for (let i = 0; i < dest.length; i++) {
        dest[i] = 0;
      }
      // Official writeData: VALID queues this buffer. Idle VALID silence
      // is why #128 heard after flip. INVALID = do not enqueue.
      return audio.AudioDataCallbackResult.INVALID;
    }
    const src: Uint8Array = new Uint8Array(clip.pcm);
    let n: number = dest.length;
    const avail: number = src.length - cursor;
    if (avail < n) {
      n = avail;
    }
    if (n < 0) {
      n = 0;
    }
    for (let i = 0; i < n; i++) {
      dest[i] = src[cursor + i];
    }
    for (let i = n; i < dest.length; i++) {
      dest[i] = 0;
    }
    const firstPcm: boolean = isFlip ? !SoundPlayer.flipWrote0 : !SoundPlayer.extWrote0;
    if (firstPcm && n > 0) {
      if (isFlip) {
        SoundPlayer.flipWrote0 = true;
      } else {
        SoundPlayer.extWrote0 = true;
      }
      SoundPlayer.logWrite0(isFlip, dest.length, clip);
    }
    cursor = cursor + n;
    const done: boolean = cursor >= src.length;
    if (isFlip) {
      SoundPlayer.flipCursor = done ? -1 : cursor;
      if (done) {
        SoundPlayer.flipPlayArmed = false;
      }
    } else {
      SoundPlayer.extCursor = done ? -1 : cursor;
      if (done) {
        SoundPlayer.extPlayArmed = false;
      }
    }
    if (done) {
      const kind: string = isFlip ? 'flip' : 'extinguish';
      const stream: number = isFlip ? SoundPlayer.lastFlipStream : SoundPlayer.lastExtStream;
      SoundPlayer.logPlayFin(kind, stream, Date.now(), 'renderer');
    }
    return audio.AudioDataCallbackResult.VALID;
  }

  private static ensureRendererRunning(renderer: audio.AudioRenderer): void {
    const state: audio.AudioState = renderer.state;
    if (state === audio.AudioState.STATE_RUNNING) {
      return;
    }
    if (state === audio.AudioState.STATE_PREPARED || state === audio.AudioState.STATE_PAUSED ||
      state === audio.AudioState.STATE_STOPPED) {
      renderer.start().catch((err: BusinessError): void => {
        Logger.info(TAG, `renderer restart fail-soft: ${err.message}`);
      });
    }
  }

  private static releaseRenderers(): void {
    SoundPlayer.flipCursor = -1;
    SoundPlayer.extCursor = -1;
    SoundPlayer.flipPlayArmed = false;
    SoundPlayer.extPlayArmed = false;
    SoundPlayer.flipFlushGen = SoundPlayer.flipFlushGen + 1;
    SoundPlayer.extFlushGen = SoundPlayer.extFlushGen + 1;
    SoundPlayer.flipWrote0 = false;
    SoundPlayer.extWrote0 = false;
    SoundPlayer.flipCbBytes = 0;
    SoundPlayer.extCbBytes = 0;
    SoundPlayer.flipGetBuf = 0;
    SoundPlayer.extGetBuf = 0;
    SoundPlayer.rendererOk = false;
    SoundPlayer.flipClip = null;
    SoundPlayer.extClip = null;
    const flip: audio.AudioRenderer | null = SoundPlayer.flipRenderer;
    const ext: audio.AudioRenderer | null = SoundPlayer.extRenderer;
    SoundPlayer.flipRenderer = null;
    SoundPlayer.extRenderer = null;
    SoundPlayer.releaseOneRenderer(flip);
    SoundPlayer.releaseOneRenderer(ext);
  }

  private static releaseOneRenderer(renderer: audio.AudioRenderer | null): void {
    if (renderer === null) {
      return;
    }
    try {
      renderer.off('writeData');
    } catch (err) {
      Logger.info(TAG, `renderer off fail-soft: ${err}`);
    }
    renderer.stop().catch((err: BusinessError): void => {
      Logger.info(TAG, `renderer stop fail-soft: ${err.message}`);
    });
    renderer.release().catch((err: BusinessError): void => {
      Logger.info(TAG, `renderer release fail-soft: ${err.message}`);
    });
  }
}
