import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { PlayStyle } from '../../engine/Phase';

const TAG = 'TableAudio';

const PATH_BGM: string = 'audio/bgm/bgm_table_bluff.ogg';
const PATH_CLAIM: string = 'audio/sfx/sfx_claim_set.wav';
const PATH_SOFT: string = 'audio/sfx/sfx_play_soft.wav';
const PATH_SLAM: string = 'audio/sfx/sfx_play_slam.wav';
const PATH_HESITATE: string = 'audio/sfx/sfx_play_hesitate.wav';
const PATH_TURN: string = 'audio/sfx/sfx_turn_tick.wav';
const PATH_STARE: string = 'audio/sfx/sfx_named_stare.wav';
const PATH_WIN: string = 'audio/sfx/sfx_result_win.wav';
const PATH_LOSE: string = 'audio/sfx/sfx_result_lose.wav';

/**
 * Table bed + §5.2 SFX (docs 13 §3/§5/§6, assets #80).
 * Enter: lobby BGM already 400ms fade-out → this bed 600ms fade-in.
 * Leave / silent: 400ms fade-out. Silent = BGM + SFX fully off (same as LobbyAudio).
 * Do not load or play sfx_challenge_*.
 * BGM stays on this AVPlayer (MUSIC). Flip/extinguish short SFX live on
 * SoundPlayer's GAME SoundPool — not this MUSIC pool — so path-B latency
 * experiments do not share the table bed mixer.
 *
 * EXP 1 (post-#126, post-playRet): BGM mute/pause only. Does not touch
 * SoundPlayer / CardFace / LifeCandles hang points. DealAudio is deal-SFX
 * SoundPool (no AVPlayer bed) — not muted here.
 */
export class TableAudio {
  static readonly BGM: string = SfxIds.BGM_TABLE_BLUFF;
  static readonly CLAIM_SET: string = SfxIds.CLAIM_SET;
  static readonly PLAY_SOFT: string = SfxIds.PLAY_SOFT;
  static readonly PLAY_SLAM: string = SfxIds.PLAY_SLAM;
  static readonly PLAY_HESITATE: string = SfxIds.PLAY_HESITATE;
  static readonly TURN_TICK: string = SfxIds.TURN_TICK;
  static readonly NAMED_STARE: string = SfxIds.NAMED_STARE;
  static readonly RESULT_WIN: string = SfxIds.RESULT_WIN;
  static readonly RESULT_LOSE: string = SfxIds.RESULT_LOSE;

  static readonly BGM_FADE_IN_MS: number = 600;
  static readonly BGM_FADE_OUT_MS: number = 400;
  /**
   * EXP 1 rebuild flag (PRIMARY / latency A/B). true = table AVPlayer BGM
   * never starts; flip/extinguish SFX stay on. Default false so normal play
   * still has the bed. Aron: set true + Rebuild for BGM-off from enter-table
   * without opening the debug panel. Runtime toggle (lb_btn_debug_bgm_mute)
   * can still restore. NOT a volume change — see SoundPlayer VOL_FLIP.
   */
  static readonly EXP_MUTE_BGM: boolean = false;
  static readonly VOL_BGM: number = 0.20;
  static readonly VOL_CLAIM: number = 0.40;
  static readonly VOL_SOFT: number = 0.38;
  static readonly VOL_SLAM: number = 0.48;
  static readonly VOL_HESITATE: number = 0.34;
  static readonly VOL_TURN: number = 0.22;
  static readonly VOL_STARE: number = 0.40;
  static readonly VOL_RESULT: number = 0.44;
  /** 13 §6: slam may duck BGM −3 dB · 120ms. */
  static readonly SLAM_DUCK_FACTOR: number = 0.707;
  static readonly SLAM_DUCK_MS: number = 120;
  /**
   * Play-style peak offsets after lastPlay hits the pool (no extra VFX).
   * Soft paper-drop mid / slam impact / hesitate friction-then-stop.
   */
  static readonly PEAK_SOFT_MS: number = 90;
  static readonly PEAK_SLAM_MS: number = 40;
  static readonly PEAK_HESITATE_MS: number = 160;
  static readonly MAX_STREAMS: number = 8;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static bgmPlayer: media.AVPlayer | null = null;
  private static claimId: number = -1;
  private static softId: number = -1;
  private static slamId: number = -1;
  private static hesitateId: number = -1;
  private static turnId: number = -1;
  private static stareId: number = -1;
  private static winId: number = -1;
  private static loseId: number = -1;
  private static silent: boolean = false;
  /** Runtime BGM mute (debug toggle / EXP_MUTE_BGM). SFX pools stay live. */
  private static bgmMuted: boolean = false;
  private static bedsWanted: boolean = false;
  private static pendingBgm: boolean = false;
  private static pendingClaim: boolean = false;
  private static pendingSoft: boolean = false;
  private static pendingSlam: boolean = false;
  private static pendingHesitate: boolean = false;
  private static pendingTurn: boolean = false;
  private static pendingStare: boolean = false;
  private static pendingWin: boolean = false;
  private static pendingLose: boolean = false;
  private static bgmReady: boolean = false;
  private static bgmVol: number = 0;
  private static bgmFadeId: number = -1;
  private static releaseTimer: number = -1;
  private static duckTimer: number = -1;
  private static bgmFdOpen: boolean = false;
  private static resultPlayed: boolean = false;

  static bind(context: common.UIAbilityContext): void {
    TableAudio.context = context;
    TableAudio.bgmMuted = TableAudio.EXP_MUTE_BGM;
    Logger.info('SfxDiag',
      `SfxDiag bgmMute bind exp=${TableAudio.EXP_MUTE_BGM} runtime=${TableAudio.bgmMuted}`);
  }

  static isBgmMuted(): boolean {
    return TableAudio.bgmMuted;
  }

  /**
   * EXP 1: pause/resume table AVPlayer BGM only. Does not setSilent —
   * claim/slam/flip/extinguish keep playing. Immediate pause (no fade)
   * so A/B listen is clean.
   */
  static setBgmMuted(on: boolean): void {
    TableAudio.bgmMuted = on;
    Logger.info('SfxDiag',
      `SfxDiag bgmMute on=${on} exp=${TableAudio.EXP_MUTE_BGM} ` +
        `bedsWanted=${TableAudio.bedsWanted} silent=${TableAudio.silent}`);
    if (on) {
      TableAudio.pendingBgm = false;
      TableAudio.stopBedsNow();
      return;
    }
    if (TableAudio.bedsWanted && !TableAudio.silent) {
      TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
    }
  }

  static setSilent(on: boolean): void {
    TableAudio.silent = on;
    if (on) {
      Logger.info(TAG,
        `${SfxIds.BGM_TABLE_BLUFF}/${SfxIds.CLAIM_SET}/${SfxIds.PLAY_SOFT}/` +
        `${SfxIds.PLAY_SLAM}/${SfxIds.PLAY_HESITATE}/${SfxIds.TURN_TICK}/` +
        `${SfxIds.NAMED_STARE}/${SfxIds.RESULT_WIN}/${SfxIds.RESULT_LOSE} skipped (silent)`);
      TableAudio.clearPendings();
      TableAudio.stopBedsNow();
      return;
    }
    if (TableAudio.bedsWanted && !TableAudio.bgmMuted) {
      TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
    }
  }

  static async prepare(): Promise<void> {
    if (TableAudio.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    if (TableAudio.pool !== null && TableAudio.bgmPlayer !== null) {
      return;
    }
    try {
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 1
      };
      const pool: media.SoundPool = await media.createSoundPool(TableAudio.MAX_STREAMS, info);
      TableAudio.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        TableAudio.onLoaded(soundId);
      });
      TableAudio.claimId = await TableAudio.loadPath(PATH_CLAIM);
      TableAudio.softId = await TableAudio.loadPath(PATH_SOFT);
      TableAudio.slamId = await TableAudio.loadPath(PATH_SLAM);
      TableAudio.hesitateId = await TableAudio.loadPath(PATH_HESITATE);
      TableAudio.turnId = await TableAudio.loadPath(PATH_TURN);
      TableAudio.stareId = await TableAudio.loadPath(PATH_STARE);
      TableAudio.winId = await TableAudio.loadPath(PATH_WIN);
      TableAudio.loseId = await TableAudio.loadPath(PATH_LOSE);
      Logger.info(TAG, 'table sfx pool ready');
    } catch (err) {
      Logger.warn(TAG, `table pool unavailable — fail-soft: ${err}`);
    }
    if (TableAudio.bgmPlayer === null) {
      await TableAudio.prepareBed();
    }
  }

  static startBgm(fadeMs: number): void {
    TableAudio.bedsWanted = true;
    if (TableAudio.silent) {
      Logger.info(TAG, `${SfxIds.BGM_TABLE_BLUFF} skipped (silent)`);
      return;
    }
    if (TableAudio.bgmMuted) {
      Logger.info(TAG, `${SfxIds.BGM_TABLE_BLUFF} skipped (exp BGM mute)`);
      TableAudio.pendingBgm = false;
      TableAudio.stopBedsNow();
      return;
    }
    if (!TableAudio.bgmReady || TableAudio.bgmPlayer === null) {
      TableAudio.pendingBgm = true;
      return;
    }
    if (TableAudio.bgmVol >= TableAudio.VOL_BGM - 0.01) {
      TableAudio.playIfIdle(TableAudio.bgmPlayer);
      return;
    }
    Logger.info(TAG, `${SfxIds.BGM_TABLE_BLUFF} fade ${fadeMs}ms`);
    TableAudio.fadeBgm(TableAudio.bgmVol, TableAudio.VOL_BGM, fadeMs);
    TableAudio.playIfIdle(TableAudio.bgmPlayer);
  }

  static fadeBgmOut(fadeMs: number): void {
    TableAudio.bedsWanted = false;
    TableAudio.pendingBgm = false;
    if (TableAudio.silent || TableAudio.bgmPlayer === null) {
      TableAudio.stopBedsNow();
      return;
    }
    Logger.info(TAG, `${SfxIds.BGM_TABLE_BLUFF} fade-out ${fadeMs}ms`);
    TableAudio.fadeBgm(TableAudio.bgmVol, 0, fadeMs);
  }

  static leaveThenRelease(): void {
    TableAudio.bedsWanted = false;
    TableAudio.clearPendings();
    if (TableAudio.silent || TableAudio.bgmPlayer === null) {
      TableAudio.release();
      return;
    }
    TableAudio.fadeBgm(TableAudio.bgmVol, 0, TableAudio.BGM_FADE_OUT_MS);
    if (TableAudio.releaseTimer >= 0) {
      clearTimeout(TableAudio.releaseTimer);
    }
    TableAudio.releaseTimer = setTimeout((): void => {
      TableAudio.releaseTimer = -1;
      TableAudio.release();
    }, TableAudio.BGM_FADE_OUT_MS);
  }

  static playClaimSet(): void {
    TableAudio.playNamed(SfxIds.CLAIM_SET, TableAudio.claimId, TableAudio.VOL_CLAIM, 'pendingClaim');
  }

  static playTurnTick(): void {
    TableAudio.playNamed(SfxIds.TURN_TICK, TableAudio.turnId, TableAudio.VOL_TURN, 'pendingTurn');
  }

  static playNamedStare(): void {
    TableAudio.playNamed(SfxIds.NAMED_STARE, TableAudio.stareId, TableAudio.VOL_STARE, 'pendingStare');
  }

  static playStyleAtPeak(style: PlayStyle): void {
    if (TableAudio.silent) {
      Logger.info(TAG, `play-style ${style} skipped (silent)`);
      return;
    }
    let delayMs: number = TableAudio.PEAK_SOFT_MS;
    if (style === PlayStyle.SLAM) {
      delayMs = TableAudio.PEAK_SLAM_MS;
    } else if (style === PlayStyle.HESITATE) {
      delayMs = TableAudio.PEAK_HESITATE_MS;
    }
    setTimeout((): void => {
      if (TableAudio.silent) {
        return;
      }
      if (style === PlayStyle.SLAM) {
        TableAudio.playSlam();
        TableAudio.duckForSlam();
      } else if (style === PlayStyle.HESITATE) {
        TableAudio.playHesitate();
      } else {
        TableAudio.playSoft();
      }
    }, delayMs);
  }

  static playResult(humanWon: boolean): void {
    if (TableAudio.resultPlayed) {
      return;
    }
    TableAudio.resultPlayed = true;
    if (humanWon) {
      TableAudio.playNamed(SfxIds.RESULT_WIN, TableAudio.winId, TableAudio.VOL_RESULT, 'pendingWin');
    } else {
      TableAudio.playNamed(SfxIds.RESULT_LOSE, TableAudio.loseId, TableAudio.VOL_RESULT, 'pendingLose');
    }
  }

  static release(): void {
    TableAudio.bedsWanted = false;
    TableAudio.bgmMuted = TableAudio.EXP_MUTE_BGM;
    TableAudio.clearPendings();
    TableAudio.resultPlayed = false;
    TableAudio.bgmFadeId = TableAudio.clearIntervalId(TableAudio.bgmFadeId);
    if (TableAudio.releaseTimer >= 0) {
      clearTimeout(TableAudio.releaseTimer);
      TableAudio.releaseTimer = -1;
    }
    if (TableAudio.duckTimer >= 0) {
      clearTimeout(TableAudio.duckTimer);
      TableAudio.duckTimer = -1;
    }
    TableAudio.stopBedsNow();
    TableAudio.releasePlayer();
    const pool: media.SoundPool | null = TableAudio.pool;
    TableAudio.pool = null;
    TableAudio.claimId = -1;
    TableAudio.softId = -1;
    TableAudio.slamId = -1;
    TableAudio.hesitateId = -1;
    TableAudio.turnId = -1;
    TableAudio.stareId = -1;
    TableAudio.winId = -1;
    TableAudio.loseId = -1;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  private static playSoft(): void {
    TableAudio.playNamed(SfxIds.PLAY_SOFT, TableAudio.softId, TableAudio.VOL_SOFT, 'pendingSoft');
  }

  private static playSlam(): void {
    TableAudio.playNamed(SfxIds.PLAY_SLAM, TableAudio.slamId, TableAudio.VOL_SLAM, 'pendingSlam');
  }

  private static playHesitate(): void {
    TableAudio.playNamed(SfxIds.PLAY_HESITATE, TableAudio.hesitateId, TableAudio.VOL_HESITATE, 'pendingHesitate');
  }

  private static playNamed(idName: string, soundId: number, volume: number, pendingKey: string): void {
    if (TableAudio.silent) {
      Logger.info(TAG, `${idName} skipped (silent)`);
      return;
    }
    if (soundId < 0 || TableAudio.pool === null) {
      TableAudio.markPending(pendingKey, true);
      return;
    }
    Logger.info(TAG, `${idName} play`);
    TableAudio.playShot(soundId, volume);
  }

  private static markPending(key: string, on: boolean): void {
    if (key === 'pendingClaim') {
      TableAudio.pendingClaim = on;
    } else if (key === 'pendingSoft') {
      TableAudio.pendingSoft = on;
    } else if (key === 'pendingSlam') {
      TableAudio.pendingSlam = on;
    } else if (key === 'pendingHesitate') {
      TableAudio.pendingHesitate = on;
    } else if (key === 'pendingTurn') {
      TableAudio.pendingTurn = on;
    } else if (key === 'pendingStare') {
      TableAudio.pendingStare = on;
    } else if (key === 'pendingWin') {
      TableAudio.pendingWin = on;
    } else if (key === 'pendingLose') {
      TableAudio.pendingLose = on;
    }
  }

  private static onLoaded(soundId: number): void {
    if (soundId === TableAudio.claimId && TableAudio.pendingClaim) {
      TableAudio.pendingClaim = false;
      TableAudio.playClaimSet();
    }
    if (soundId === TableAudio.softId && TableAudio.pendingSoft) {
      TableAudio.pendingSoft = false;
      TableAudio.playSoft();
    }
    if (soundId === TableAudio.slamId && TableAudio.pendingSlam) {
      TableAudio.pendingSlam = false;
      TableAudio.playSlam();
    }
    if (soundId === TableAudio.hesitateId && TableAudio.pendingHesitate) {
      TableAudio.pendingHesitate = false;
      TableAudio.playHesitate();
    }
    if (soundId === TableAudio.turnId && TableAudio.pendingTurn) {
      TableAudio.pendingTurn = false;
      TableAudio.playTurnTick();
    }
    if (soundId === TableAudio.stareId && TableAudio.pendingStare) {
      TableAudio.pendingStare = false;
      TableAudio.playNamedStare();
    }
    if (soundId === TableAudio.winId && TableAudio.pendingWin) {
      TableAudio.pendingWin = false;
      TableAudio.playNamed(SfxIds.RESULT_WIN, TableAudio.winId, TableAudio.VOL_RESULT, 'pendingWin');
    }
    if (soundId === TableAudio.loseId && TableAudio.pendingLose) {
      TableAudio.pendingLose = false;
      TableAudio.playNamed(SfxIds.RESULT_LOSE, TableAudio.loseId, TableAudio.VOL_RESULT, 'pendingLose');
    }
  }

  private static async prepareBed(): Promise<void> {
    const ctx: common.UIAbilityContext | null = TableAudio.context;
    if (ctx === null) {
      return;
    }
    try {
      const player: media.AVPlayer = await media.createAVPlayer();
      player.on('stateChange', (state: string): void => {
        TableAudio.onBedState(state);
      });
      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(PATH_BGM);
      const desc: media.AVFileDescriptor = {
        fd: rawFd.fd,
        offset: rawFd.offset,
        length: rawFd.length
      };
      TableAudio.bgmPlayer = player;
      TableAudio.bgmFdOpen = true;
      player.fdSrc = desc;
    } catch (err) {
      Logger.warn(TAG, `${PATH_BGM} bed unavailable — fail-soft: ${err}`);
    }
  }

  private static onBedState(state: string): void {
    const player: media.AVPlayer | null = TableAudio.bgmPlayer;
    if (player === null) {
      return;
    }
    if (state === 'initialized') {
      player.loop = true;
      player.prepare().catch((err: BusinessError): void => {
        Logger.warn(TAG, `bed prepare fail-soft: ${err.message}`);
      });
      return;
    }
    if (state === 'prepared') {
      player.setVolume(0);
      TableAudio.bgmReady = true;
      if (TableAudio.pendingBgm) {
        TableAudio.pendingBgm = false;
        TableAudio.startBgm(TableAudio.BGM_FADE_IN_MS);
      }
    }
  }

  private static playIfIdle(player: media.AVPlayer): void {
    player.play().catch((err: BusinessError): void => {
      Logger.warn(TAG, `bed play fail-soft: ${err.message}`);
    });
  }

  private static duckForSlam(): void {
    if (TableAudio.silent || TableAudio.bgmMuted || TableAudio.bgmPlayer === null ||
      !TableAudio.bedsWanted) {
      return;
    }
    const ducked: number = TableAudio.VOL_BGM * TableAudio.SLAM_DUCK_FACTOR;
    TableAudio.fadeBgm(TableAudio.bgmVol, ducked, 40);
    if (TableAudio.duckTimer >= 0) {
      clearTimeout(TableAudio.duckTimer);
    }
    TableAudio.duckTimer = setTimeout((): void => {
      TableAudio.duckTimer = -1;
      if (TableAudio.silent || !TableAudio.bedsWanted || TableAudio.bgmPlayer === null) {
        return;
      }
      TableAudio.fadeBgm(TableAudio.bgmVol, TableAudio.VOL_BGM, 80);
    }, TableAudio.SLAM_DUCK_MS);
  }

  private static fadeBgm(fromVol: number, toVol: number, fadeMs: number): void {
    TableAudio.bgmFadeId = TableAudio.clearIntervalId(TableAudio.bgmFadeId);
    const player: media.AVPlayer | null = TableAudio.bgmPlayer;
    if (player === null) {
      return;
    }
    TableAudio.bgmFadeId = TableAudio.ramp(fromVol, toVol, fadeMs, (vol: number): void => {
      TableAudio.bgmVol = vol;
      player.setVolume(vol);
    }, (): void => {
      TableAudio.bgmFadeId = -1;
      if (toVol <= 0) {
        player.pause().catch((err: BusinessError): void => {
          Logger.warn(TAG, `bgm pause fail-soft: ${err.message}`);
        });
      }
    });
  }

  private static ramp(
    fromVol: number,
    toVol: number,
    fadeMs: number,
    apply: (vol: number) => void,
    done: () => void
  ): number {
    const steps: number = Math.max(1, Math.round(fadeMs / 40));
    let i: number = 0;
    apply(fromVol);
    const id: number = setInterval((): void => {
      i++;
      const t: number = i / steps;
      const vol: number = fromVol + (toVol - fromVol) * t;
      apply(vol);
      if (i >= steps) {
        clearInterval(id);
        done();
      }
    }, 40);
    return id;
  }

  private static stopBedsNow(): void {
    TableAudio.bgmFadeId = TableAudio.clearIntervalId(TableAudio.bgmFadeId);
    TableAudio.bgmVol = 0;
    const bgm: media.AVPlayer | null = TableAudio.bgmPlayer;
    if (bgm !== null) {
      bgm.setVolume(0);
      bgm.pause().catch((err: BusinessError): void => {
        Logger.warn(TAG, `bgm pause fail-soft: ${err.message}`);
      });
    }
  }

  private static releasePlayer(): void {
    const player: media.AVPlayer | null = TableAudio.bgmPlayer;
    const fdOpen: boolean = TableAudio.bgmFdOpen;
    TableAudio.bgmPlayer = null;
    TableAudio.bgmReady = false;
    TableAudio.bgmFdOpen = false;
    if (player !== null) {
      player.release().catch((err: BusinessError): void => {
        Logger.warn(TAG, `bed release fail-soft: ${err.message}`);
      });
    }
    const ctx: common.UIAbilityContext | null = TableAudio.context;
    if (fdOpen && ctx !== null) {
      ctx.resourceManager.closeRawFd(PATH_BGM).catch((err: BusinessError): void => {
        Logger.warn(TAG, `closeRawFd fail-soft: ${err.message}`);
      });
    }
  }

  private static playShot(soundId: number, volume: number): void {
    const pool: media.SoundPool | null = TableAudio.pool;
    if (pool === null || soundId < 0) {
      return;
    }
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

  private static async loadPath(path: string): Promise<number> {
    const ctx: common.UIAbilityContext | null = TableAudio.context;
    const pool: media.SoundPool | null = TableAudio.pool;
    if (ctx === null || pool === null) {
      return -1;
    }
    const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
    const soundId: number = await pool.load(rawFd.fd, rawFd.offset, rawFd.length);
    await ctx.resourceManager.closeRawFd(path);
    return soundId;
  }

  private static clearPendings(): void {
    TableAudio.pendingBgm = false;
    TableAudio.pendingClaim = false;
    TableAudio.pendingSoft = false;
    TableAudio.pendingSlam = false;
    TableAudio.pendingHesitate = false;
    TableAudio.pendingTurn = false;
    TableAudio.pendingStare = false;
    TableAudio.pendingWin = false;
    TableAudio.pendingLose = false;
  }

  private static clearIntervalId(id: number): number {
    if (id >= 0) {
      clearInterval(id);
    }
    return -1;
  }
}
