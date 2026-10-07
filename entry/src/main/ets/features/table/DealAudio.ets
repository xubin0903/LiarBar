import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { AudioSettings } from '../../persist/AudioSettings';
import { TableAudio } from './TableAudio';

const TAG = 'DealAudio';
const STALE_PREPARE: string = 'prepare stale: released while loading';
const PATH_DEAL: string = 'audio/sfx/sfx_deal_card.wav';

/**
 * Layered paper/table deal Foley (#39 sfx_deal_card).
 * One shot per takeoff. SoundPool so adjacent cards can overlap — not a single beep.
 * Silent: do not call the player (no duck).
 * EXP 1 BGM mute lives on TableAudio's AVPlayer bed — this class has no BGM.
 */
export class DealAudio {
  static readonly DEAL_CARD: string = SfxIds.DEAL_CARD;
  static readonly VOL_DEAL: number = 0.46;
  static readonly MAX_STREAMS: number = 8;

  private static context: common.UIAbilityContext | null = null;
  private static pool: media.SoundPool | null = null;
  private static dealId: number = -1;
  private static silent: boolean = false;
  private static pending: number = 0;
  /** release() 代际号（负责人第 3 条遗留）：异步 prepare 在 release 之后才返回 → 立刻释放新建对象，不登记、不播放。 */
  private static gen: number = 0;

  static bind(context: common.UIAbilityContext): void {
    DealAudio.context = context;
  }

  static setSilent(on: boolean): void {
    DealAudio.silent = on;
    if (on) {
      DealAudio.pending = 0;
      Logger.info(TAG, `${SfxIds.DEAL_CARD} skipped (silent)`);
    }
  }

  static async prepare(): Promise<void> {
    if (DealAudio.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    if (DealAudio.pool !== null && DealAudio.dealId >= 0) {
      return;
    }
    const gen: number = DealAudio.gen;
    try {
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 1
      };
      const pool: media.SoundPool = await media.createSoundPool(DealAudio.MAX_STREAMS, info);
      if (DealAudio.gen !== gen) {
        Logger.info(TAG, 'stale deal pool (created after release) — released, not registered');
        pool.release().catch((err: BusinessError): void => {
          Logger.warn(TAG, `stale pool release fail-soft: ${err.message}`);
        });
        return;
      }
      DealAudio.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        if (soundId === DealAudio.dealId && DealAudio.pending > 0) {
          const n: number = DealAudio.pending;
          DealAudio.pending = 0;
          if (TableAudio.isGamePaused()) {
            // PR-B 暂停闸：暂停中加载完不补播。
            return;
          }
          for (let i = 0; i < n; i++) {
            DealAudio.playDealCard();
          }
        }
      });
      DealAudio.dealId = await DealAudio.loadPath(PATH_DEAL, gen);
      Logger.info(TAG, `${SfxIds.DEAL_CARD} pool ready id=${DealAudio.dealId}`);
    } catch (err) {
      if (DealAudio.gen !== gen) {
        Logger.info(TAG, 'prepare dropped: released while loading');
        return;
      }
      Logger.warn(TAG, `deal pool unavailable — fail-soft, show continues: ${err}`);
    }
  }

  static playDealCard(): void {
    if (TableAudio.isGamePaused()) {
      // PR-B 暂停闸：暂停中不出声，也不排补播。
      return;
    }
    if (DealAudio.silent) {
      Logger.info(TAG, `${SfxIds.DEAL_CARD} skipped (silent)`);
      return;
    }
    if (DealAudio.dealId < 0 || DealAudio.pool === null) {
      DealAudio.pending = DealAudio.pending + 1;
      return;
    }
    Logger.info(TAG, `${SfxIds.DEAL_CARD} play`);
    const pool: media.SoundPool | null = DealAudio.pool;
    if (pool === null) {
      return;
    }
    const gained: number = AudioSettings.sfx01(DealAudio.VOL_DEAL);
    if (gained <= 0) {
      return;
    }
    const params: media.PlayParameters = {
      loop: 0,
      rate: audio.AudioRendererRate.RENDER_RATE_NORMAL,
      leftVolume: gained,
      rightVolume: gained,
      priority: 0
    };
    pool.play(DealAudio.dealId, params).catch((err: BusinessError): void => {
      Logger.warn(TAG, `play fail-soft: ${err.message}`);
    });
  }

  static release(): void {
    DealAudio.gen = DealAudio.gen + 1;
    DealAudio.pending = 0;
    DealAudio.dealId = -1;
    const pool: media.SoundPool | null = DealAudio.pool;
    DealAudio.pool = null;
    if (pool === null) {
      return;
    }
    pool.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `release fail-soft: ${err.message}`);
    });
  }

  /** 代际已变（release 过）时抛出，不把旧 id 写回。 */
  private static async loadPath(path: string, gen: number): Promise<number> {
    const ctx: common.UIAbilityContext | null = DealAudio.context;
    const pool: media.SoundPool | null = DealAudio.pool;
    if (DealAudio.gen !== gen) {
      throw new Error(STALE_PREPARE);
    }
    if (ctx === null || pool === null) {
      return -1;
    }
    const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
    const soundId: number = await pool.load(rawFd.fd, rawFd.offset, rawFd.length);
    await ctx.resourceManager.closeRawFd(path);
    if (DealAudio.gen !== gen) {
      throw new Error(STALE_PREPARE);
    }
    return soundId;
  }
}
