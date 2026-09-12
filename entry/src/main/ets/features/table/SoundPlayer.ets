import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';

const TAG = 'SoundPlayer';
const PATH_FLIP: string = 'audio/sfx/sfx_card_flip.wav';
const PATH_EXTINGUISH: string = 'audio/sfx/sfx_life_extinguish.wav';

/**
 * Table one-shots that must actually hit SoundPool — not log-only.
 * lb_sfx_card_flip (15 flip + 14b drop windup) / lb_sfx_life_extinguish (灭尽).
 * Missing file = fail-soft; visuals still run. Silent skips the player.
 */
export class SoundPlayer {
  static readonly VOL_FLIP: number = 0.40;
  static readonly VOL_EXTINGUISH: number = 0.42;
  static readonly MAX_STREAMS: number = 4;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static flipId: number = -1;
  private static extId: number = -1;
  private static silent: boolean = false;
  private static pendingFlip: number = 0;
  private static pendingExt: number = 0;

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

  static async prepare(): Promise<void> {
    if (SoundPlayer.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    if (SoundPlayer.pool !== null && SoundPlayer.flipId >= 0 && SoundPlayer.extId >= 0) {
      return;
    }
    try {
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 1
      };
      const pool: media.SoundPool = await media.createSoundPool(SoundPlayer.MAX_STREAMS, info);
      SoundPlayer.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        if (soundId === SoundPlayer.flipId && SoundPlayer.pendingFlip > 0) {
          const n: number = SoundPlayer.pendingFlip;
          SoundPlayer.pendingFlip = 0;
          for (let i = 0; i < n; i++) {
            SoundPlayer.playCardFlip();
          }
        }
        if (soundId === SoundPlayer.extId && SoundPlayer.pendingExt > 0) {
          const n: number = SoundPlayer.pendingExt;
          SoundPlayer.pendingExt = 0;
          for (let i = 0; i < n; i++) {
            SoundPlayer.playLifeExtinguish();
          }
        }
      });
      SoundPlayer.flipId = await SoundPlayer.loadPath(PATH_FLIP);
      SoundPlayer.extId = await SoundPlayer.loadPath(PATH_EXTINGUISH);
      Logger.info(TAG,
        `${SfxIds.CARD_FLIP} id=${SoundPlayer.flipId} ${SfxIds.LIFE_EXTINGUISH} id=${SoundPlayer.extId}`);
    } catch (err) {
      Logger.warn(TAG, `pool unavailable — fail-soft, visuals continue: ${err}`);
    }
  }

  static playCardFlip(): void {
    SoundPlayer.playNamed(SfxIds.CARD_FLIP, SoundPlayer.flipId, SoundPlayer.VOL_FLIP, true);
  }

  static playLifeExtinguish(): void {
    SoundPlayer.playNamed(SfxIds.LIFE_EXTINGUISH, SoundPlayer.extId, SoundPlayer.VOL_EXTINGUISH, false);
  }

  static release(): void {
    SoundPlayer.pendingFlip = 0;
    SoundPlayer.pendingExt = 0;
    SoundPlayer.flipId = -1;
    SoundPlayer.extId = -1;
    const pool: media.SoundPool | null = SoundPlayer.pool;
    SoundPlayer.pool = null;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  private static playNamed(idName: string, soundId: number, volume: number, isFlip: boolean): void {
    if (SoundPlayer.silent) {
      Logger.info(TAG, `${idName} skipped (silent)`);
      return;
    }
    if (soundId < 0 || SoundPlayer.pool === null) {
      if (isFlip) {
        SoundPlayer.pendingFlip = SoundPlayer.pendingFlip + 1;
      } else {
        SoundPlayer.pendingExt = SoundPlayer.pendingExt + 1;
      }
      Logger.warn(TAG, `${idName} not loaded — fail-soft`);
      return;
    }
    Logger.info(TAG, `${idName} play`);
    const pool: media.SoundPool | null = SoundPlayer.pool;
    if (pool === null) {
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
}
