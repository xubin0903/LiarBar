import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'AudioSettings';

/** Called after every change so live players re-apply gain (BGM beds re-setVolume). */
export type AudioSettingsListener = () => void;

/**
 * PR-B 音量设置乘子层（Preferences `lb.settings` 持久化，运行时生效；21 §4.2）。
 * 两轨：BGM（大厅 BGM/环境床 + 局内 BGM）· 音效（全部 SFX；语音/VO 跟音效轨）。
 * 音量 = 0～100 整数、步进 5，默认 100；增益乘子 = 值 / 100。
 * 静音（mute_all）= 两轨同乘 0，不改滑条值；不改各槽位自身的混音常量（VOL_*），只在出声口乘一次。
 */
export class AudioSettings {
  /** 21 §4.2 键名（命名空间 PersistNs.AUDIO = `lb.settings`）。 */
  static readonly KEY_BGM: string = 'vol_bgm';
  static readonly KEY_SFX: string = 'vol_sfx';
  static readonly KEY_MUTED: string = 'mute_all';
  static readonly LEVEL_MIN: number = 0;
  static readonly LEVEL_MAX: number = 100;
  static readonly LEVEL_STEP: number = 5;
  static readonly DEFAULT_BGM: number = 100;
  static readonly DEFAULT_SFX: number = 100;
  static readonly DEFAULT_MUTED: boolean = false;

  private static store: preferences.Preferences | null = null;
  private static bgm: number = AudioSettings.DEFAULT_BGM;
  private static sfx: number = AudioSettings.DEFAULT_SFX;
  private static muted: boolean = false;
  private static listeners: AudioSettingsListener[] = [];

  static async init(context: common.UIAbilityContext): Promise<void> {
    try {
      const store: preferences.Preferences = await preferences.getPreferences(context, PersistNs.AUDIO);
      AudioSettings.store = store;
      const bgm: preferences.ValueType = await store.get(AudioSettings.KEY_BGM, AudioSettings.DEFAULT_BGM);
      const sfx: preferences.ValueType = await store.get(AudioSettings.KEY_SFX, AudioSettings.DEFAULT_SFX);
      const muted: preferences.ValueType = await store.get(AudioSettings.KEY_MUTED, AudioSettings.DEFAULT_MUTED);
      // 21 §2.6（S21-47）逐键：只坏的那个键回默认，其余照原值。
      AudioSettings.bgm = AudioSettings.parseLevel(bgm, AudioSettings.DEFAULT_BGM);
      AudioSettings.sfx = AudioSettings.parseLevel(sfx, AudioSettings.DEFAULT_SFX);
      AudioSettings.muted = AudioSettings.parseMuted(muted);
      Logger.info(TAG, `loaded bgm=${AudioSettings.bgm} sfx=${AudioSettings.sfx} muted=${AudioSettings.muted}`);
    } catch (err) {
      // 整个读取 / 解析失败 → 三键全回默认。
      AudioSettings.bgm = AudioSettings.DEFAULT_BGM;
      AudioSettings.sfx = AudioSettings.DEFAULT_SFX;
      AudioSettings.muted = AudioSettings.DEFAULT_MUTED;
      Logger.warn(TAG, 'preferences load fail-soft — defaults 100/100/unmuted');
    }
    AudioSettings.notify();
  }

  /** BGM 轨乘子（大厅 BGM、大厅环境床、局内 BGM）。 */
  static bgmGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.bgm / AudioSettings.LEVEL_MAX;
  }

  /** 音效轨乘子（全部短 SFX）。 */
  static sfxGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.sfx / AudioSettings.LEVEL_MAX;
  }

  /** 语音跟音效（负责人分派单 v1 第 6 条）。 */
  static voiceGain(): number {
    return AudioSettings.sfxGain();
  }

  /** 0～100（步进 5）。 */
  static bgmLevel(): number {
    return AudioSettings.bgm;
  }

  static sfxLevel(): number {
    return AudioSettings.sfx;
  }

  static isMuted(): boolean {
    return AudioSettings.muted;
  }

  /** 0～100；落到最近的 5 的倍数并夹在范围内。 */
  static setBgmLevel(level: number): void {
    AudioSettings.bgm = AudioSettings.snapLevel(level, AudioSettings.bgm);
    AudioSettings.notify();
    void AudioSettings.persist();
  }

  static setSfxLevel(level: number): void {
    AudioSettings.sfx = AudioSettings.snapLevel(level, AudioSettings.sfx);
    AudioSettings.notify();
    void AudioSettings.persist();
  }

  static setMuted(on: boolean): void {
    AudioSettings.muted = on;
    AudioSettings.notify();
    void AudioSettings.persist();
  }

  static addListener(fn: AudioSettingsListener): void {
    for (let i = 0; i < AudioSettings.listeners.length; i++) {
      if (AudioSettings.listeners[i] === fn) {
        return;
      }
    }
    AudioSettings.listeners.push(fn);
  }

  static removeListener(fn: AudioSettingsListener): void {
    const kept: AudioSettingsListener[] = [];
    for (let i = 0; i < AudioSettings.listeners.length; i++) {
      if (AudioSettings.listeners[i] !== fn) {
        kept.push(AudioSettings.listeners[i]);
      }
    }
    AudioSettings.listeners = kept;
  }

  /** Scale a slot volume by the SFX track (never > 1). */
  static sfx01(slotVolume: number): number {
    return AudioSettings.clamp01(slotVolume * AudioSettings.sfxGain());
  }

  /** Scale a voice/VO slot volume (follows SFX track). */
  static voice01(slotVolume: number): number {
    return AudioSettings.clamp01(slotVolume * AudioSettings.voiceGain());
  }

  /** Scale a BGM/bed volume by the BGM track. */
  static bgm01(bedVolume: number): number {
    return AudioSettings.clamp01(bedVolume * AudioSettings.bgmGain());
  }

  private static notify(): void {
    const list: AudioSettingsListener[] = AudioSettings.listeners;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i]();
      } catch (err) {
        Logger.warn(TAG, 'listener fail-soft');
      }
    }
  }

  private static async persist(): Promise<void> {
    const store: preferences.Preferences | null = AudioSettings.store;
    if (store === null) {
      return;
    }
    try {
      await store.put(AudioSettings.KEY_BGM, AudioSettings.bgm);
      await store.put(AudioSettings.KEY_SFX, AudioSettings.sfx);
      await store.put(AudioSettings.KEY_MUTED, AudioSettings.muted);
      await store.flush();
    } catch (err) {
      Logger.warn(TAG, 'persist fail-soft');
    }
  }

  /**
   * 读档校验（21 §2.6 / S21-47 逐键）：0～100 的整数 → 不是 5 的倍数就四舍五入到最近的 5（37→35、38→40）；
   * 非数字 / 非整数（如 37.5，不四舍五入）/ < 0 / > 100（如 105，不截断到 100 以外的值）→ 只这个键回默认 100。
   * 修正只在内存里生效：读永不写存档，等玩家下次设置松手再 persist（负责人 2026-10-07）。
   */
  static parseLevel(raw: preferences.ValueType, fallback: number): number {
    if (typeof raw !== 'number') {
      return fallback;
    }
    const v: number = raw;
    if (!Number.isInteger(v) || v < AudioSettings.LEVEL_MIN || v > AudioSettings.LEVEL_MAX) {
      return fallback;
    }
    return Math.round(v / AudioSettings.LEVEL_STEP) * AudioSettings.LEVEL_STEP;
  }

  /** mute_all 非布尔 → false。 */
  static parseMuted(raw: preferences.ValueType): boolean {
    if (typeof raw !== 'boolean') {
      return AudioSettings.DEFAULT_MUTED;
    }
    return raw === true;
  }

  /** 设值：夹到 0～100 再取最近的 5 的倍数；NaN 保持原值。 */
  static snapLevel(level: number, current: number): number {
    if (Number.isNaN(level)) {
      return current;
    }
    const clamped: number = Math.min(AudioSettings.LEVEL_MAX, Math.max(AudioSettings.LEVEL_MIN, level));
    return Math.round(clamped / AudioSettings.LEVEL_STEP) * AudioSettings.LEVEL_STEP;
  }

  private static clamp01(v: number): number {
    if (Number.isNaN(v)) {
      return 1;
    }
    if (v < 0) {
      return 0;
    }
    if (v > 1) {
      return 1;
    }
    return v;
  }
}
