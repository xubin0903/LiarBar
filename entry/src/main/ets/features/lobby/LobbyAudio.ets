import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { LobbyBoot } from './LobbyBoot';
import { MatchLoad } from './MatchLoad';

const TAG = 'LobbyAudio';

const PATH_BGM: string = 'audio/bgm/bgm_lobby_night.ogg';
const PATH_AMB: string = 'audio/sfx/sfx_amb_tavern.ogg';
const PATH_HIT: string = 'audio/sfx/sfx_boot_hit.wav';
const PATH_CTA: string = 'audio/sfx/sfx_cta_tap.wav';
const PATH_VO: string = 'audio/vo/vo_dealer_greet.wav';
const PATH_MATCH_OPEN: string = 'audio/sfx/sfx_match_open.wav';

/**
 * Five-layer lobby field: BGM + tavern amb + boot hit + CTA tap + greet VO.
 * Silent match (lb_tog_silent) skips every lb_bgm_* / lb_sfx_* / lb_vo_* call.
 * Subtitles and motion still run. Never ducks leftover beds to a low whisper.
 */
export class LobbyAudio {
  static readonly BGM: string = SfxIds.BGM_LOBBY_NIGHT;
  static readonly AMB: string = SfxIds.AMB_TAVERN;
  static readonly HIT: string = SfxIds.BOOT_HIT;
  static readonly CTA: string = SfxIds.CTA_TAP;
  static readonly VO: string = SfxIds.VO_DEALER_GREET;
  static readonly MATCH_OPEN: string = SfxIds.MATCH_OPEN;

  static readonly VOL_BGM_OPEN: number = 0.25;
  static readonly VOL_BGM_STEADY: number = 0.20;
  static readonly VOL_AMB: number = 0.13;
  static readonly VOL_HIT: number = 0.50;
  static readonly VOL_CTA: number = 0.32;
  static readonly VOL_CTA_PEEK: number = 0.226;
  static readonly VOL_VO: number = 0.40;
  static readonly DUCK_FACTOR: number = 0.42;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static bgmPlayer: media.AVPlayer | null = null;
  private static ambPlayer: media.AVPlayer | null = null;
  private static hitId: number = -1;
  private static ctaId: number = -1;
  private static voId: number = -1;
  private static matchOpenId: number = -1;
  private static voStream: number = -1;
  private static silent: boolean = false;
  private static bedsWanted: boolean = false;
  private static pendingHit: boolean = false;
  private static pendingCta: boolean = false;
  private static pendingCtaPeek: boolean = false;
  private static pendingVo: boolean = false;
  private static pendingMatchOpen: boolean = false;
  private static pendingBgmOpen: boolean = false;
  private static pendingBgmSteady: boolean = false;
  private static pendingAmb: boolean = false;
  private static bgmReady: boolean = false;
  private static ambReady: boolean = false;
  private static bgmVol: number = 0;
  private static ambVol: number = 0;
  private static bgmFadeId: number = -1;
  private static ambFadeId: number = -1;
  private static releaseTimer: number = -1;
  private static bgmFdOpen: boolean = false;
  private static ambFdOpen: boolean = false;

  static bind(context: common.UIAbilityContext): void {
    LobbyAudio.context = context;
  }

  static setSilent(on: boolean): void {
    LobbyAudio.silent = on;
    if (on) {
      Logger.info(TAG,
        `${SfxIds.BGM_LOBBY_NIGHT}/${SfxIds.AMB_TAVERN}/${SfxIds.BOOT_HIT}/` +
        `${SfxIds.CTA_TAP}/${SfxIds.VO_DEALER_GREET}/${SfxIds.MATCH_OPEN} skipped (silent)`);
      LobbyAudio.pendingHit = false;
      LobbyAudio.pendingCta = false;
      LobbyAudio.pendingCtaPeek = false;
      LobbyAudio.pendingVo = false;
      LobbyAudio.pendingMatchOpen = false;
      LobbyAudio.pendingBgmOpen = false;
      LobbyAudio.pendingBgmSteady = false;
      LobbyAudio.pendingAmb = false;
      LobbyAudio.stopVo();
      LobbyAudio.stopBedsNow();
      return;
    }
    if (LobbyAudio.bedsWanted) {
      LobbyAudio.ensureBeds(true);
    }
  }

  static async prepare(): Promise<void> {
    if (LobbyAudio.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    try {
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 1
      };
      const pool: media.SoundPool = await media.createSoundPool(5, info);
      LobbyAudio.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        LobbyAudio.onLoaded(soundId);
      });
      LobbyAudio.hitId = await LobbyAudio.loadPath(PATH_HIT);
      LobbyAudio.ctaId = await LobbyAudio.loadPath(PATH_CTA);
      LobbyAudio.voId = await LobbyAudio.loadPath(PATH_VO);
      LobbyAudio.matchOpenId = await LobbyAudio.loadPath(PATH_MATCH_OPEN);
      Logger.info(TAG, 'sound pool ready');
    } catch (err) {
      Logger.warn(TAG, `sound pool unavailable — fail-soft, timeline continues: ${err}`);
    }
    await LobbyAudio.prepareBed(true);
    await LobbyAudio.prepareBed(false);
  }

  static playBootHit(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.BOOT_HIT} skipped (silent)`);
      return;
    }
    if (LobbyAudio.hitId < 0 || LobbyAudio.pool === null) {
      LobbyAudio.pendingHit = true;
      return;
    }
    Logger.info(TAG, `${SfxIds.BOOT_HIT} play`);
    LobbyAudio.playShot(LobbyAudio.hitId, LobbyAudio.VOL_HIT, false);
  }

  static playCtaTap(secondary: boolean): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.CTA_TAP} skipped (silent)`);
      return;
    }
    if (LobbyAudio.ctaId < 0 || LobbyAudio.pool === null) {
      if (secondary) {
        LobbyAudio.pendingCtaPeek = true;
      } else {
        LobbyAudio.pendingCta = true;
      }
      return;
    }
    const vol: number = secondary ? LobbyAudio.VOL_CTA_PEEK : LobbyAudio.VOL_CTA;
    Logger.info(TAG, `${SfxIds.CTA_TAP} play vol=${vol}`);
    LobbyAudio.playShot(LobbyAudio.ctaId, vol, false);
  }

  static playVoGreet(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.VO_DEALER_GREET} skipped (silent)`);
      return;
    }
    if (LobbyAudio.voId < 0 || LobbyAudio.pool === null) {
      LobbyAudio.pendingVo = true;
      return;
    }
    Logger.info(TAG, `${SfxIds.VO_DEALER_GREET} play`);
    LobbyAudio.playShot(LobbyAudio.voId, LobbyAudio.VOL_VO, true);
  }

  static playMatchOpen(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.MATCH_OPEN} skipped (silent)`);
      return;
    }
    if (LobbyAudio.matchOpenId < 0 || LobbyAudio.pool === null) {
      LobbyAudio.pendingMatchOpen = true;
      return;
    }
    Logger.info(TAG, `${SfxIds.MATCH_OPEN} play`);
    LobbyAudio.playShot(LobbyAudio.matchOpenId, MatchLoad.VOL_MATCH_OPEN, false);
  }

  static startAmb(fadeMs: number): void {
    LobbyAudio.bedsWanted = true;
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.AMB_TAVERN} skipped (silent)`);
      return;
    }
    if (!LobbyAudio.ambReady || LobbyAudio.ambPlayer === null) {
      LobbyAudio.pendingAmb = true;
      return;
    }
    Logger.info(TAG, `${SfxIds.AMB_TAVERN} fade ${fadeMs}ms`);
    LobbyAudio.fadeAmb(LobbyAudio.ambVol, LobbyAudio.VOL_AMB, fadeMs);
    LobbyAudio.playIfIdle(LobbyAudio.ambPlayer);
  }

  static startBgm(fadeMs: number, toSteady: boolean): void {
    LobbyAudio.bedsWanted = true;
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.BGM_LOBBY_NIGHT} skipped (silent)`);
      return;
    }
    const target: number = toSteady ? LobbyAudio.VOL_BGM_STEADY : LobbyAudio.VOL_BGM_OPEN;
    if (!LobbyAudio.bgmReady || LobbyAudio.bgmPlayer === null) {
      if (toSteady) {
        LobbyAudio.pendingBgmSteady = true;
      } else {
        LobbyAudio.pendingBgmOpen = true;
      }
      return;
    }
    Logger.info(TAG, `${SfxIds.BGM_LOBBY_NIGHT} fade ${fadeMs}ms target=${target}`);
    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, target, fadeMs);
    LobbyAudio.playIfIdle(LobbyAudio.bgmPlayer);
  }

  static startReturnBeds(fadeMs: number): void {
    LobbyAudio.bedsWanted = true;
    if (LobbyAudio.silent) {
      Logger.info(TAG, `return beds skipped (silent)`);
      return;
    }
    LobbyAudio.startAmb(fadeMs);
    LobbyAudio.startBgm(fadeMs, true);
  }

  static duckBgmForVo(): void {
    if (LobbyAudio.silent || LobbyAudio.bgmPlayer === null) {
      return;
    }
    const ducked: number = LobbyAudio.bgmVol * LobbyAudio.DUCK_FACTOR;
    Logger.info(TAG, `${SfxIds.BGM_LOBBY_NIGHT} duck`);
    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, ducked, LobbyBoot.BOOT_MS_DUCK);
  }

  static unduckBgmToSteady(): void {
    if (LobbyAudio.silent || LobbyAudio.bgmPlayer === null) {
      return;
    }
    Logger.info(TAG, `${SfxIds.BGM_LOBBY_NIGHT} unduck→steady`);
    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, LobbyAudio.VOL_BGM_STEADY, LobbyBoot.BOOT_MS_DUCK);
  }

  static leaveThenRelease(): void {
    LobbyAudio.bedsWanted = false;
    LobbyAudio.pendingHit = false;
    LobbyAudio.pendingCta = false;
    LobbyAudio.pendingCtaPeek = false;
    LobbyAudio.pendingVo = false;
    LobbyAudio.pendingMatchOpen = false;
    LobbyAudio.pendingBgmOpen = false;
    LobbyAudio.pendingBgmSteady = false;
    LobbyAudio.pendingAmb = false;
    LobbyAudio.stopVo();
    if (LobbyAudio.silent || (LobbyAudio.bgmPlayer === null && LobbyAudio.ambPlayer === null)) {
      LobbyAudio.release();
      return;
    }
    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, 0, LobbyBoot.BOOT_MS_LEAVE_BGM);
    LobbyAudio.fadeAmb(LobbyAudio.ambVol, 0, LobbyBoot.BOOT_MS_LEAVE_AMB);
    if (LobbyAudio.releaseTimer >= 0) {
      clearTimeout(LobbyAudio.releaseTimer);
    }
    LobbyAudio.releaseTimer = setTimeout((): void => {
      LobbyAudio.releaseTimer = -1;
      LobbyAudio.release();
    }, LobbyBoot.BOOT_MS_LEAVE_BGM);
  }

  static release(): void {
    LobbyAudio.bedsWanted = false;
    LobbyAudio.pendingHit = false;
    LobbyAudio.pendingCta = false;
    LobbyAudio.pendingCtaPeek = false;
    LobbyAudio.pendingVo = false;
    LobbyAudio.pendingMatchOpen = false;
    LobbyAudio.pendingBgmOpen = false;
    LobbyAudio.pendingBgmSteady = false;
    LobbyAudio.pendingAmb = false;
    LobbyAudio.bgmFadeId = LobbyAudio.clearIntervalId(LobbyAudio.bgmFadeId);
    LobbyAudio.ambFadeId = LobbyAudio.clearIntervalId(LobbyAudio.ambFadeId);
    if (LobbyAudio.releaseTimer >= 0) {
      clearTimeout(LobbyAudio.releaseTimer);
      LobbyAudio.releaseTimer = -1;
    }
    LobbyAudio.stopVo();
    LobbyAudio.stopBedsNow();
    LobbyAudio.releasePlayer(true);
    LobbyAudio.releasePlayer(false);
    const pool: media.SoundPool | null = LobbyAudio.pool;
    LobbyAudio.pool = null;
    LobbyAudio.hitId = -1;
    LobbyAudio.ctaId = -1;
    LobbyAudio.voId = -1;
    LobbyAudio.matchOpenId = -1;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  private static onLoaded(soundId: number): void {
    if (soundId === LobbyAudio.hitId && LobbyAudio.pendingHit) {
      LobbyAudio.pendingHit = false;
      LobbyAudio.playBootHit();
    }
    if (soundId === LobbyAudio.ctaId && LobbyAudio.pendingCta) {
      LobbyAudio.pendingCta = false;
      LobbyAudio.playCtaTap(false);
    }
    if (soundId === LobbyAudio.ctaId && LobbyAudio.pendingCtaPeek) {
      LobbyAudio.pendingCtaPeek = false;
      LobbyAudio.playCtaTap(true);
    }
    if (soundId === LobbyAudio.voId && LobbyAudio.pendingVo) {
      LobbyAudio.pendingVo = false;
      LobbyAudio.playVoGreet();
    }
    if (soundId === LobbyAudio.matchOpenId && LobbyAudio.pendingMatchOpen) {
      LobbyAudio.pendingMatchOpen = false;
      LobbyAudio.playMatchOpen();
    }
  }

  private static ensureBeds(toSteady: boolean): void {
    if (LobbyAudio.silent) {
      return;
    }
    LobbyAudio.startAmb(LobbyBoot.BOOT_MS_RETURN_ENTER);
    LobbyAudio.startBgm(LobbyBoot.BOOT_MS_RETURN_ENTER, toSteady);
  }

  private static async prepareBed(isBgm: boolean): Promise<void> {
    const ctx: common.UIAbilityContext | null = LobbyAudio.context;
    if (ctx === null) {
      return;
    }
    const path: string = isBgm ? PATH_BGM : PATH_AMB;
    try {
      const player: media.AVPlayer = await media.createAVPlayer();
      player.on('stateChange', (state: string): void => {
        LobbyAudio.onBedState(isBgm, state);
      });
      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
      const desc: media.AVFileDescriptor = {
        fd: rawFd.fd,
        offset: rawFd.offset,
        length: rawFd.length
      };
      if (isBgm) {
        LobbyAudio.bgmPlayer = player;
        LobbyAudio.bgmFdOpen = true;
      } else {
        LobbyAudio.ambPlayer = player;
        LobbyAudio.ambFdOpen = true;
      }
      player.fdSrc = desc;
    } catch (err) {
      Logger.warn(TAG, `${path} bed unavailable — fail-soft: ${err}`);
    }
  }

  private static onBedState(isBgm: boolean, state: string): void {
    const player: media.AVPlayer | null = isBgm ? LobbyAudio.bgmPlayer : LobbyAudio.ambPlayer;
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
      if (isBgm) {
        LobbyAudio.bgmReady = true;
        if (LobbyAudio.pendingBgmOpen) {
          LobbyAudio.pendingBgmOpen = false;
          LobbyAudio.startBgm(LobbyBoot.BOOT_MS_BGM_FADE, false);
        } else if (LobbyAudio.pendingBgmSteady) {
          LobbyAudio.pendingBgmSteady = false;
          LobbyAudio.startBgm(LobbyBoot.BOOT_MS_BGM_FADE, true);
        }
      } else {
        LobbyAudio.ambReady = true;
        if (LobbyAudio.pendingAmb) {
          LobbyAudio.pendingAmb = false;
          LobbyAudio.startAmb(LobbyBoot.BOOT_MS_AMB_FADE);
        }
      }
    }
  }

  private static playIfIdle(player: media.AVPlayer): void {
    player.play().catch((err: BusinessError): void => {
      Logger.warn(TAG, `bed play fail-soft: ${err.message}`);
    });
  }

  private static fadeBgm(fromVol: number, toVol: number, fadeMs: number): void {
    LobbyAudio.bgmFadeId = LobbyAudio.clearIntervalId(LobbyAudio.bgmFadeId);
    const player: media.AVPlayer | null = LobbyAudio.bgmPlayer;
    if (player === null) {
      return;
    }
    LobbyAudio.bgmFadeId = LobbyAudio.ramp(fromVol, toVol, fadeMs, (vol: number): void => {
      LobbyAudio.bgmVol = vol;
      player.setVolume(vol);
    }, (): void => {
      LobbyAudio.bgmFadeId = -1;
    });
  }

  private static fadeAmb(fromVol: number, toVol: number, fadeMs: number): void {
    LobbyAudio.ambFadeId = LobbyAudio.clearIntervalId(LobbyAudio.ambFadeId);
    const player: media.AVPlayer | null = LobbyAudio.ambPlayer;
    if (player === null) {
      return;
    }
    LobbyAudio.ambFadeId = LobbyAudio.ramp(fromVol, toVol, fadeMs, (vol: number): void => {
      LobbyAudio.ambVol = vol;
      player.setVolume(vol);
    }, (): void => {
      LobbyAudio.ambFadeId = -1;
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

  private static stopVo(): void {
    if (LobbyAudio.pool === null || LobbyAudio.voStream < 0) {
      LobbyAudio.voStream = -1;
      return;
    }
    try {
      LobbyAudio.pool.stop(LobbyAudio.voStream);
    } catch (err) {
      Logger.warn(TAG, `stop vo fail-soft: ${err}`);
    }
    LobbyAudio.voStream = -1;
  }

  private static stopBedsNow(): void {
    LobbyAudio.bgmFadeId = LobbyAudio.clearIntervalId(LobbyAudio.bgmFadeId);
    LobbyAudio.ambFadeId = LobbyAudio.clearIntervalId(LobbyAudio.ambFadeId);
    LobbyAudio.bgmVol = 0;
    LobbyAudio.ambVol = 0;
    const bgm: media.AVPlayer | null = LobbyAudio.bgmPlayer;
    const amb: media.AVPlayer | null = LobbyAudio.ambPlayer;
    if (bgm !== null) {
      bgm.setVolume(0);
      bgm.pause().catch((err: BusinessError): void => {
        Logger.warn(TAG, `bgm pause fail-soft: ${err.message}`);
      });
    }
    if (amb !== null) {
      amb.setVolume(0);
      amb.pause().catch((err: BusinessError): void => {
        Logger.warn(TAG, `amb pause fail-soft: ${err.message}`);
      });
    }
  }

  private static releasePlayer(isBgm: boolean): void {
    const player: media.AVPlayer | null = isBgm ? LobbyAudio.bgmPlayer : LobbyAudio.ambPlayer;
    const path: string = isBgm ? PATH_BGM : PATH_AMB;
    const fdOpen: boolean = isBgm ? LobbyAudio.bgmFdOpen : LobbyAudio.ambFdOpen;
    if (isBgm) {
      LobbyAudio.bgmPlayer = null;
      LobbyAudio.bgmReady = false;
      LobbyAudio.bgmFdOpen = false;
    } else {
      LobbyAudio.ambPlayer = null;
      LobbyAudio.ambReady = false;
      LobbyAudio.ambFdOpen = false;
    }
    if (player !== null) {
      player.release().catch((err: BusinessError): void => {
        Logger.warn(TAG, `bed release fail-soft: ${err.message}`);
      });
    }
    const ctx: common.UIAbilityContext | null = LobbyAudio.context;
    if (fdOpen && ctx !== null) {
      ctx.resourceManager.closeRawFd(path).catch((err: BusinessError): void => {
        Logger.warn(TAG, `closeRawFd fail-soft: ${err.message}`);
      });
    }
  }

  private static playShot(soundId: number, volume: number, rememberVo: boolean): void {
    const pool: media.SoundPool | null = LobbyAudio.pool;
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
    pool.play(soundId, params).then((streamId: number): void => {
      if (rememberVo) {
        LobbyAudio.voStream = streamId;
      }
    }).catch((err: BusinessError): void => {
      Logger.warn(TAG, `play fail-soft: ${err.message}`);
    });
  }

  private static async loadPath(path: string): Promise<number> {
    const ctx: common.UIAbilityContext | null = LobbyAudio.context;
    const pool: media.SoundPool | null = LobbyAudio.pool;
    if (ctx === null || pool === null) {
      return -1;
    }
    const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
    const fd: number = rawFd.fd;
    const offset: number = rawFd.offset;
    const length: number = rawFd.length;
    const soundId: number = await pool.load(fd, offset, length);
    await ctx.resourceManager.closeRawFd(path);
    return soundId;
  }

  private static clearIntervalId(id: number): number {
    if (id >= 0) {
      clearInterval(id);
    }
    return -1;
  }
}
