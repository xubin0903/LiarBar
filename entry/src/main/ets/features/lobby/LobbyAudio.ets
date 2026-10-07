import { common } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { resourceManager } from '@kit.LocalizationKit';
import { media } from '@kit.MediaKit';
import { SfxIds } from '../../common/Ids';
import { Logger } from '../../common/Logger';
import { LobbyBoot } from './LobbyBoot';
import { MatchLoad } from './MatchLoad';
import { AudioSettings } from '../../persist/AudioSettings';

const TAG = 'LobbyAudio';
const STALE_PREPARE: string = 'prepare stale: released while loading';

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
  /** 进桌后大厅 BGM 淡出（13 §2 进桌：大厅 BGM 400ms 淡出）：大厅页 onPageHide → 两张床 400ms 淡到 0 再 pause()，不 stop、不 release。 */
  static readonly HIDE_FADE_MS: number = 400;

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
  private static settingsHooked: boolean = false;
  /** release() 代际号（负责人第 3 条遗留）：异步 prepare 在 release 之后才返回 → 立刻释放新建对象，不登记、不播放。 */
  private static gen: number = 0;
  private static bgmFadeId: number = -1;
  private static ambFadeId: number = -1;
  private static releaseTimer: number = -1;
  private static bgmFdOpen: boolean = false;
  private static ambFdOpen: boolean = false;
  /** 最近一次 prepare() 发起时的代际号（补丁轮 3）：== gen 表示本代的池 / 床已建或正在建，playIfIdle 不重复 prepare。 */
  private static preparedGen: number = -1;
  /** 本代上次 prepare 有一部分失败（allowRetry 记下的代际号）：== gen 时下一次 prepare 只补缺的池 / 床，已建好的不重建。 */
  private static retryGen: number = -1;
  /** 大厅页被盖住 / 退后台（onPageHide）时淡出并暂停的床：true = 等 onPageShow → playIfIdle 恢复（同一组播放器，不重建）。 */
  private static hiddenPaused: boolean = false;
  /** onPageHide 淡出结束后 pause() 两张床的定时器。 */
  private static hideTimer: number = -1;
  /** 本次显示里 playIfIdle 已把被隐藏暂停的床 play() 回来：初始化大厅随后的 startReturnBeds 只淡到常驻，不再 play() 第二次。 */
  private static resumedOnShow: boolean = false;

  static bind(context: common.UIAbilityContext): void {
    LobbyAudio.context = context;
    if (!LobbyAudio.settingsHooked) {
      LobbyAudio.settingsHooked = true;
      AudioSettings.addListener((): void => {
        LobbyAudio.applyAudioSettings();
      });
    }
  }

  /** PR-B 设置即时生效：BGM 与环境床都走 BGM 轨（淡入淡出进行中由 ramp 自己带乘子）。 */
  static applyAudioSettings(): void {
    const bgm: media.AVPlayer | null = LobbyAudio.bgmPlayer;
    if (bgm !== null && LobbyAudio.bgmFadeId < 0 && LobbyAudio.bgmVol > 0) {
      bgm.setVolume(AudioSettings.bgm01(LobbyAudio.bgmVol));
    }
    const amb: media.AVPlayer | null = LobbyAudio.ambPlayer;
    if (amb !== null && LobbyAudio.ambFadeId < 0 && LobbyAudio.ambVol > 0) {
      amb.setVolume(AudioSettings.bgm01(LobbyAudio.ambVol));
    }
  }

  static setSilent(on: boolean): void {
    const wasSilent: boolean = LobbyAudio.silent;
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
    // 只在「静默 → 有声」时补起床；本来就有声（如回大厅 begin() 里的 setSilent(false)）不再 play() 第二次。
    if (wasSilent && LobbyAudio.bedsWanted) {
      LobbyAudio.ensureBeds(true);
    }
  }

  static async prepare(): Promise<void> {
    if (LobbyAudio.preparedGen === LobbyAudio.gen) {
      return;
    }
    if (LobbyAudio.context === null) {
      Logger.warn(TAG, 'prepare skipped: no context');
      return;
    }
    const gen: number = LobbyAudio.gen;
    LobbyAudio.preparedGen = gen;
    const retry: boolean = LobbyAudio.retryGen === gen;
    LobbyAudio.retryGen = -1;
    const poolOk: boolean = retry && LobbyAudio.pool !== null ? true : await LobbyAudio.preparePool(gen);
    const bgmOk: boolean = retry && LobbyAudio.bgmPlayer !== null ? true : await LobbyAudio.prepareBed(true, gen);
    const ambOk: boolean = retry && LobbyAudio.ambPlayer !== null ? true : await LobbyAudio.prepareBed(false, gen);
    if (!poolOk || !bgmOk || !ambOk) {
      LobbyAudio.allowRetry(gen);
    }
  }

  /**
   * 同代 prepare 失败可重试（负责人，进桌后大厅 BGM 淡出票第 2 条）：建池 / 建床任一失败且代际没变 → preparedGen 复位 -1，
   * 下一次回大厅（begin() / onPageShow → playIfIdle）再 prepare，只补缺的那部分（retryGen：池为空才建池、床为空才建床）。
   * 放在本次 prepare 全部步骤跑完之后：失败后同一次 prepare 还在建另一张床时，不让并发重试再建一份。
   */
  private static allowRetry(gen: number): void {
    if (LobbyAudio.gen !== gen || LobbyAudio.preparedGen !== gen) {
      return;
    }
    Logger.warn(TAG, 'prepare incomplete — same gen may retry on the next lobby show');
    LobbyAudio.retryGen = gen;
    LobbyAudio.preparedGen = -1;
  }

  /** 建池 + 载入四个短音。返回 false = 本代建池失败（已丢掉半成品池，可重试）；代际已变 = 不算失败。 */
  private static async preparePool(gen: number): Promise<boolean> {
    try {
      const info: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 1
      };
      const pool: media.SoundPool = await media.createSoundPool(5, info);
      if (LobbyAudio.gen !== gen) {
        Logger.info(TAG, 'stale sound pool (created after release) — released, not registered');
        pool.release().catch((err: BusinessError): void => {
          Logger.warn(TAG, `stale pool release fail-soft: ${err.message}`);
        });
        return true;
      }
      LobbyAudio.pool = pool;
      pool.on('loadComplete', (soundId: number): void => {
        LobbyAudio.onLoaded(soundId);
      });
      LobbyAudio.hitId = await LobbyAudio.loadPath(PATH_HIT, gen);
      LobbyAudio.ctaId = await LobbyAudio.loadPath(PATH_CTA, gen);
      LobbyAudio.voId = await LobbyAudio.loadPath(PATH_VO, gen);
      LobbyAudio.matchOpenId = await LobbyAudio.loadPath(PATH_MATCH_OPEN, gen);
      Logger.info(TAG, 'sound pool ready');
      return true;
    } catch (err) {
      if (LobbyAudio.gen !== gen) {
        Logger.info(TAG, 'prepare dropped: released while loading');
        return true;
      }
      Logger.warn(TAG, `sound pool unavailable — fail-soft, timeline continues: ${err}`);
      LobbyAudio.dropPool();
      return false;
    }
  }

  /** 本代建池失败：丢掉半成品池与已载入的 id（下次重试从头建池）。 */
  private static dropPool(): void {
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
      Logger.warn(TAG, `failed pool release fail-soft: ${err.message}`);
    });
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
    LobbyAudio.playBed(LobbyAudio.ambPlayer);
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
    LobbyAudio.playBed(LobbyAudio.bgmPlayer);
  }

  static startReturnBeds(fadeMs: number): void {
    LobbyAudio.bedsWanted = true;
    if (LobbyAudio.silent) {
      Logger.info(TAG, `return beds skipped (silent)`);
      return;
    }
    LobbyAudio.hiddenPaused = false;
    LobbyAudio.cancelHideTimer();
    if (LobbyAudio.resumedOnShow) {
      // 本次显示里 onPageShow → playIfIdle 已把床 play() 回来：初始化大厅的回大厅短入场只淡到常驻，不再 play()。
      LobbyAudio.resumedOnShow = false;
      Logger.info(TAG, 'return beds: already resumed on page show — fade to steady only (no second play)');
      LobbyAudio.fadeAmb(LobbyAudio.ambVol, LobbyAudio.VOL_AMB, fadeMs);
      LobbyAudio.fadeBgm(LobbyAudio.bgmVol, LobbyAudio.VOL_BGM_STEADY, fadeMs);
      return;
    }
    LobbyAudio.startAmb(fadeMs);
    LobbyAudio.startBgm(fadeMs, true);
  }

  /**
   * 进桌后大厅 BGM 淡出（13 §2；大厅页 onPageHide 调）：push 进桌时大厅留在栈上不销毁，大厅床原来整局一直在响。
   * 现在：BGM 与环境床 HIDE_FADE_MS（400ms）淡到 0，到点 pause()；不 stop、不 release、不建新播放器。
   * 还没就绪的床（pending）一并取消，局内不会再被拉起。onPageShow → playIfIdle 恢复。
   */
  static fadeOutForHide(): void {
    LobbyAudio.resumedOnShow = false;
    if (LobbyAudio.silent || LobbyAudio.releaseTimer >= 0) {
      return;
    }
    LobbyAudio.hiddenPaused = true;
    LobbyAudio.bedsWanted = false;
    LobbyAudio.pendingHit = false;
    LobbyAudio.pendingCta = false;
    LobbyAudio.pendingCtaPeek = false;
    LobbyAudio.pendingVo = false;
    LobbyAudio.pendingMatchOpen = false;
    LobbyAudio.pendingBgmOpen = false;
    LobbyAudio.pendingBgmSteady = false;
    LobbyAudio.pendingAmb = false;
    Logger.info(TAG, `page hidden — beds fade ${LobbyAudio.HIDE_FADE_MS}ms then pause (no stop / release)`);
    LobbyAudio.fadeBgm(LobbyAudio.bgmVol, 0, LobbyAudio.HIDE_FADE_MS);
    LobbyAudio.fadeAmb(LobbyAudio.ambVol, 0, LobbyAudio.HIDE_FADE_MS);
    LobbyAudio.cancelHideTimer();
    LobbyAudio.hideTimer = setTimeout((): void => {
      LobbyAudio.hideTimer = -1;
      LobbyAudio.stopBedsNow();
    }, LobbyAudio.HIDE_FADE_MS);
  }

  /** 大厅床是否正因页面隐藏而淡出 / 暂停（大厅页 onPageShow 只在这时走 playIfIdle；冷启动 / 初始化中的大厅由 begin() 起床）。 */
  static isPausedByHide(): boolean {
    return LobbyAudio.hiddenPaused;
  }

  /**
   * 补丁轮 3（负责人批）：「只渲染」大厅接手音频时调用，幂等。
   * - 大厅床正在响 / 正由初始化的大厅拉起（本代已 prepare、未在离场淡出）→ 什么都不做：不重新 play、不从头放、不重建；
   * - 离场淡出中（leaveThenRelease 的释放还没到）→ 撤销释放，按当前增益淡回常驻音量（播放器一直在放，不 play）；
   * - 已释放（老大厅消失后超过 LbRouter.LOBBY_HANDOVER_MS 新大厅才出现）→ 重建并按当前 AudioSettings 增益起回大厅床
   *   （与回大厅短入场同一套：startReturnBeds，资源就绪后各 play 一次）。
   */
  static playIfIdle(): void {
    if (LobbyAudio.silent) {
      Logger.info(TAG, 'playIfIdle skipped (silent)');
      return;
    }
    if (LobbyAudio.releaseTimer >= 0) {
      const bgm: media.AVPlayer | null = LobbyAudio.bgmPlayer;
      if (bgm !== null && LobbyAudio.bgmReady) {
        clearTimeout(LobbyAudio.releaseTimer);
        LobbyAudio.releaseTimer = -1;
        LobbyAudio.bedsWanted = true;
        if (LobbyAudio.hiddenPaused) {
          LobbyAudio.resumeFromHide();
          return;
        }
        Logger.info(TAG, 'playIfIdle: leave fade cancelled — beds back to steady (no re-play)');
        LobbyAudio.fadeBgm(LobbyAudio.bgmVol, LobbyAudio.VOL_BGM_STEADY, LobbyBoot.BOOT_MS_RETURN_ENTER);
        if (LobbyAudio.ambPlayer !== null && LobbyAudio.ambReady) {
          LobbyAudio.fadeAmb(LobbyAudio.ambVol, LobbyAudio.VOL_AMB, LobbyBoot.BOOT_MS_RETURN_ENTER);
        }
        return;
      }
      LobbyAudio.release();
    }
    if (LobbyAudio.hiddenPaused) {
      LobbyAudio.resumeFromHide();
      return;
    }
    if (LobbyAudio.preparedGen === LobbyAudio.gen) {
      Logger.info(TAG, 'playIfIdle: lobby beds already playing / starting — no-op');
      return;
    }
    Logger.info(TAG, 'playIfIdle: lobby audio was released — rebuild, beds at current gain');
    LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);
    void LobbyAudio.prepare();
  }

  /**
   * 页面重新可见（onPageShow → playIfIdle）且床是被 fadeOutForHide 暂停的：同一组播放器淡回常驻并 play() 一次，不建池、不建播放器。
   * 本代 prepare 曾失败（preparedGen 已复位）→ 顺带重试补建。
   */
  private static resumeFromHide(): void {
    const bgm: media.AVPlayer | null = LobbyAudio.bgmPlayer;
    if (LobbyAudio.hideTimer >= 0 && bgm !== null && LobbyAudio.bgmReady) {
      // 淡出还没到 pause()（400ms 内又可见）：床一直在放 → 撤销暂停、淡回常驻，不 play()、不从头放。
      LobbyAudio.cancelHideTimer();
      LobbyAudio.hiddenPaused = false;
      LobbyAudio.bedsWanted = true;
      Logger.info(TAG, 'playIfIdle: shown again before the hide pause — fade back to steady (no re-play)');
      LobbyAudio.fadeBgm(LobbyAudio.bgmVol, LobbyAudio.VOL_BGM_STEADY, LobbyBoot.BOOT_MS_RETURN_ENTER);
      if (LobbyAudio.ambPlayer !== null && LobbyAudio.ambReady) {
        LobbyAudio.fadeAmb(LobbyAudio.ambVol, LobbyAudio.VOL_AMB, LobbyBoot.BOOT_MS_RETURN_ENTER);
      } else {
        LobbyAudio.startAmb(LobbyBoot.BOOT_MS_RETURN_ENTER);
      }
    } else {
      Logger.info(TAG, 'playIfIdle: page shown again — beds resume from the hide pause (same players, no rebuild)');
      LobbyAudio.startReturnBeds(LobbyBoot.BOOT_MS_RETURN_ENTER);
    }
    LobbyAudio.resumedOnShow = true;
    if (LobbyAudio.preparedGen !== LobbyAudio.gen) {
      void LobbyAudio.prepare();
    }
  }

  private static cancelHideTimer(): void {
    if (LobbyAudio.hideTimer >= 0) {
      clearTimeout(LobbyAudio.hideTimer);
      LobbyAudio.hideTimer = -1;
    }
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
    LobbyAudio.gen = LobbyAudio.gen + 1;
    LobbyAudio.bedsWanted = false;
    LobbyAudio.hiddenPaused = false;
    LobbyAudio.resumedOnShow = false;
    LobbyAudio.cancelHideTimer();
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

  /** 建一张床。返回 false = 本代建床失败（半成品播放器已丢掉，可重试）；代际已变 = 不算失败。 */
  private static async prepareBed(isBgm: boolean, gen: number): Promise<boolean> {
    const ctx: common.UIAbilityContext | null = LobbyAudio.context;
    if (ctx === null || LobbyAudio.gen !== gen) {
      return true;
    }
    const path: string = isBgm ? PATH_BGM : PATH_AMB;
    let made: media.AVPlayer | null = null;
    try {
      const player: media.AVPlayer = await media.createAVPlayer();
      if (LobbyAudio.gen !== gen) {
        LobbyAudio.dropStalePlayer(player);
        return true;
      }
      made = player;
      const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
      if (LobbyAudio.gen !== gen) {
        LobbyAudio.dropStalePlayer(player);
        ctx.resourceManager.closeRawFd(path).catch((err: BusinessError): void => {
          Logger.warn(TAG, `closeRawFd fail-soft: ${err.message}`);
        });
        return true;
      }
      player.on('stateChange', (state: string): void => {
        LobbyAudio.onBedState(isBgm, state);
      });
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
      return true;
    } catch (err) {
      Logger.warn(TAG, `${path} bed unavailable — fail-soft: ${err}`);
      if (LobbyAudio.gen !== gen) {
        return true;
      }
      const registered: media.AVPlayer | null = isBgm ? LobbyAudio.bgmPlayer : LobbyAudio.ambPlayer;
      if (made !== null && registered === made) {
        LobbyAudio.releasePlayer(isBgm);
      } else if (made !== null) {
        LobbyAudio.dropStalePlayer(made);
      }
      return false;
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

  private static playBed(player: media.AVPlayer): void {
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
      player.setVolume(AudioSettings.bgm01(vol));
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
      player.setVolume(AudioSettings.bgm01(vol));
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
    // PR-B: VO 跟音效轨（voice01 = sfx 乘子）；其余短 SFX 走 sfx01。
    const gained: number = rememberVo ? AudioSettings.voice01(volume) : AudioSettings.sfx01(volume);
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
    pool.play(soundId, params).then((streamId: number): void => {
      if (rememberVo) {
        LobbyAudio.voStream = streamId;
      }
    }).catch((err: BusinessError): void => {
      Logger.warn(TAG, `play fail-soft: ${err.message}`);
    });
  }

  private static dropStalePlayer(player: media.AVPlayer): void {
    Logger.info(TAG, 'stale bed player (created after release) — released, not registered');
    player.release().catch((err: BusinessError): void => {
      Logger.warn(TAG, `stale bed release fail-soft: ${err.message}`);
    });
  }

  /** 代际已变（release 过）时抛出，不把旧 id 写回。 */
  private static async loadPath(path: string, gen: number): Promise<number> {
    const ctx: common.UIAbilityContext | null = LobbyAudio.context;
    const pool: media.SoundPool | null = LobbyAudio.pool;
    if (LobbyAudio.gen !== gen) {
      throw new Error(STALE_PREPARE);
    }
    if (ctx === null || pool === null) {
      return -1;
    }
    const rawFd: resourceManager.RawFileDescriptor = await ctx.resourceManager.getRawFd(path);
    const fd: number = rawFd.fd;
    const offset: number = rawFd.offset;
    const length: number = rawFd.length;
    const soundId: number = await pool.load(fd, offset, length);
    await ctx.resourceManager.closeRawFd(path);
    if (LobbyAudio.gen !== gen) {
      throw new Error(STALE_PREPARE);
    }
    return soundId;
  }

  private static clearIntervalId(id: number): number {
    if (id >= 0) {
      clearInterval(id);
    }
    return -1;
  }
}
