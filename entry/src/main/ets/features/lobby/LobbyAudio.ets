import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';

const TAG = 'LobbyAudio';

const PATH_BOOT: string = 'sfx/sfx_boot.wav';
const PATH_AMB: string = 'sfx/sfx_lobby_amb.wav';
const PATH_CTA: string = 'sfx/sfx_cta.wav';

/**
 * Minimal lobby SFX: boot one-shot + ambient loop + CTA tap.
 * Call sites are lb_sfx_*. Silent match (lb_tog_silent) skips non-essential audio;
 * greet subtitle and motion still run.
 */
export class LobbyAudio {
  static readonly BOOT: string = SfxIds.BOOT;
  static readonly AMB: string = SfxIds.LOBBY_AMB;
  static readonly CTA: string = SfxIds.CTA;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static bootId: number = -1;
  private static ambId: number = -1;
  private static ctaId: number = -1;
  private static ambStream: number = -1;
  private static silent: boolean = false;
  private static ambWanted: boolean = false;
  private static pendingBoot: boolean = false;
  private static pendingCta: boolean = false;

  static bind(context: common.UIAbilityContext): void {
    LobbyAudio.context = context;
  }

  static setSilent(on: boolean): void {
    LobbyAudio.silent = on;
    if (on) {
      Logger.info(TAG, `${SfxIds.BOOT}/${SfxIds.LOBBY_AMB}/${SfxIds.CTA} muted (silent match)`);
      LobbyAudio.stopAmbient();
      LobbyAudio.pendingBoot = false;
      LobbyAudio.pendingCta = false;
      return;
    }
    if (LobbyAudio.ambWanted) {
      LobbyAudio.playAmbient();
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
      const pool: media.SoundPool = await media.createSoundPool(4, info);
      LobbyAudio.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        LobbyAudio.onLoaded(soundId);
      });
      LobbyAudio.bootId = await LobbyAudio.loadPath(PATH_BOOT);
      LobbyAudio.ambId = await LobbyAudio.loadPath(PATH_AMB);
      LobbyAudio.ctaId = await LobbyAudio.loadPath(PATH_CTA);
      Logger.info(TAG, 'sound pool ready');
    } catch (err) {
      Logger.warn(TAG, `sound pool unavailable — fail-soft, timeline continues: ${err}`);
    }
  }

  static playBoot(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.BOOT} skipped (silent)`);
      return;
    }
    if (LobbyAudio.bootId < 0 || LobbyAudio.pool === null) {
      LobbyAudio.pendingBoot = true;
      return;
    }
    LobbyAudio.playId(LobbyAudio.bootId, 0, 1.0, false);
  }

  static playCta(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.CTA} skipped (silent)`);
      return;
    }
    if (LobbyAudio.ctaId < 0 || LobbyAudio.pool === null) {
      LobbyAudio.pendingCta = true;
      return;
    }
    LobbyAudio.playId(LobbyAudio.ctaId, 0, 1.0, false);
  }

  static startAmbient(): void {
    LobbyAudio.ambWanted = true;
    if (LobbyAudio.silent) {
      Logger.info(TAG, `${SfxIds.LOBBY_AMB} skipped (silent)`);
      return;
    }
    LobbyAudio.playAmbient();
  }

  static stopAmbient(): void {
    if (LobbyAudio.pool === null || LobbyAudio.ambStream < 0) {
      return;
    }
    try {
      LobbyAudio.pool.stop(LobbyAudio.ambStream);
    } catch (err) {
      Logger.warn(TAG, `stop ambient fail-soft: ${err}`);
    }
    LobbyAudio.ambStream = -1;
  }

  static release(): void {
    LobbyAudio.ambWanted = false;
    LobbyAudio.pendingBoot = false;
    LobbyAudio.pendingCta = false;
    LobbyAudio.stopAmbient();
    const pool: media.SoundPool | null = LobbyAudio.pool;
    LobbyAudio.pool = null;
    LobbyAudio.bootId = -1;
    LobbyAudio.ambId = -1;
    LobbyAudio.ctaId = -1;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  private static onLoaded(soundId: number): void {
    if (soundId === LobbyAudio.bootId && LobbyAudio.pendingBoot) {
      LobbyAudio.pendingBoot = false;
      LobbyAudio.playBoot();
    }
    if (soundId === LobbyAudio.ctaId && LobbyAudio.pendingCta) {
      LobbyAudio.pendingCta = false;
      LobbyAudio.playCta();
    }
    if (soundId === LobbyAudio.ambId && LobbyAudio.ambWanted && !LobbyAudio.silent) {
      LobbyAudio.playAmbient();
    }
  }

  private static playAmbient(): void {
    if (LobbyAudio.ambId < 0 || LobbyAudio.pool === null || LobbyAudio.ambStream >= 0) {
      return;
    }
    LobbyAudio.playId(LobbyAudio.ambId, -1, 0.45, true);
  }

  private static playId(soundId: number, loop: number, volume: number, rememberAmb: boolean): void {
    const pool: media.SoundPool | null = LobbyAudio.pool;
    if (pool === null || soundId < 0) {
      return;
    }
    const params: media.PlayParameters = {
      loop: loop,
      rate: audio.AudioRendererRate.RENDER_RATE_NORMAL,
      leftVolume: volume,
      rightVolume: volume,
      priority: 0
    };
    pool.play(soundId, params).then((streamId: number): void => {
      if (rememberAmb) {
        LobbyAudio.ambStream = streamId;
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
}
