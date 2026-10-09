import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'AudioSettings';

/** Called after every change so live players re-apply gain (BGM beds re-setVolume). */
export type AudioSettingsListener = () => void;

/**
 * 音量设置乘子层（Preferences `lb.settings`；21 §4.2 / 补7 按键写盘）。
 * 两轨：BGM · SFX（语音跟 SFX）。静音 = 两轨乘 0，不改滑条值。
 * 读档修正只改内存；setter 只 put 自己的键再 flush；store null 时重新取。
 */
export class AudioSettings {
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
  /** 供 store null 时重新 getPreferences（21:329 / SET-9）。 */
  private static context: common.UIAbilityContext | null = null;
  private static bgm: number = AudioSettings.DEFAULT_BGM;
  private static sfx: number = AudioSettings.DEFAULT_SFX;
  private static muted: boolean = false;
  private static listeners: AudioSettingsListener[] = [];

  static async init(context: common.UIAbilityContext): Promise<void> {
    AudioSettings.context = context;
    let store: preferences.Preferences | null = null;
    try {
      store = await preferences.getPreferences(context, PersistNs.AUDIO);
    } catch (err) {
      // getPreferences 失败：本运行只在内存默认值生效，记日志；下次 setter 再取 store。
      AudioSettings.bgm = AudioSettings.DEFAULT_BGM;
      AudioSettings.sfx = AudioSettings.DEFAULT_SFX;
      AudioSettings.muted = AudioSettings.DEFAULT_MUTED;
      AudioSettings.store = null;
      Logger.warn(TAG, 'getPreferences fail-soft — memory defaults 100/100/unmuted; next set retries store');
      AudioSettings.notify();
      return;
    }
    // 逐键 get：只回落抛错 / 非法的那个键（21 补7）；全部 get 后再挂 store。
    try {
      const raw: preferences.ValueType = await store.get(AudioSettings.KEY_BGM, AudioSettings.DEFAULT_BGM);
      AudioSettings.bgm = AudioSettings.parseLevel(raw, AudioSettings.DEFAULT_BGM);
    } catch (err) {
      AudioSettings.bgm = AudioSettings.DEFAULT_BGM;
      Logger.warn(TAG, 'vol_bgm get fail-soft → default 100');
    }
    try {
      const raw: preferences.ValueType = await store.get(AudioSettings.KEY_SFX, AudioSettings.DEFAULT_SFX);
      AudioSettings.sfx = AudioSettings.parseLevel(raw, AudioSettings.DEFAULT_SFX);
    } catch (err) {
      AudioSettings.sfx = AudioSettings.DEFAULT_SFX;
      Logger.warn(TAG, 'vol_sfx get fail-soft → default 100');
    }
    try {
      const raw: preferences.ValueType = await store.get(AudioSettings.KEY_MUTED, AudioSettings.DEFAULT_MUTED);
      AudioSettings.muted = AudioSettings.parseMuted(raw);
    } catch (err) {
      AudioSettings.muted = AudioSettings.DEFAULT_MUTED;
      Logger.warn(TAG, 'mute_all get fail-soft → default false');
    }
    AudioSettings.store = store;
    Logger.info(TAG, `loaded bgm=${AudioSettings.bgm} sfx=${AudioSettings.sfx} muted=${AudioSettings.muted}`);
    AudioSettings.notify();
  }

  static bgmGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.bgm / AudioSettings.LEVEL_MAX;
  }

  static sfxGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.sfx / AudioSettings.LEVEL_MAX;
  }

  static voiceGain(): number {
    return AudioSettings.sfxGain();
  }

  static bgmLevel(): number {
    return AudioSettings.bgm;
  }

  static sfxLevel(): number {
    return AudioSettings.sfx;
  }

  static isMuted(): boolean {
    return AudioSettings.muted;
  }

  /** 拖动中：只改内存 + 通知乘子，不写盘（21 §4.2 实时跟随）。 */
  static applyBgmLive(level: number): void {
    AudioSettings.bgm = AudioSettings.snapLevel(level, AudioSettings.bgm);
    AudioSettings.notify();
  }

  static applySfxLive(level: number): void {
    AudioSettings.sfx = AudioSettings.snapLevel(level, AudioSettings.sfx);
    AudioSettings.notify();
  }

  /** 松手：只写 vol_bgm，再 flush（21 §4.2 第 3 条）。 */
  static setBgmLevel(level: number): void {
    AudioSettings.applyBgmLive(level);
    void AudioSettings.persistKey(AudioSettings.KEY_BGM, AudioSettings.bgm);
  }

  static setSfxLevel(level: number): void {
    AudioSettings.applySfxLive(level);
    void AudioSettings.persistKey(AudioSettings.KEY_SFX, AudioSettings.sfx);
  }

  static setMuted(on: boolean): void {
    AudioSettings.muted = on;
    AudioSettings.notify();
    void AudioSettings.persistKey(AudioSettings.KEY_MUTED, AudioSettings.muted);
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

  static sfx01(slotVolume: number): number {
    return AudioSettings.clamp01(slotVolume * AudioSettings.sfxGain());
  }

  static voice01(slotVolume: number): number {
    return AudioSettings.clamp01(slotVolume * AudioSettings.voiceGain());
  }

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

  /**
   * 单键写盘：store null → 用缓存 context 重取；取到后只 put 本键再 flush。
   * 回落/取整键不会在读档时写盘，只有玩家 setter 走到这里才写（21:328）。
   */
  private static async persistKey(key: string, value: preferences.ValueType): Promise<void> {
    let store: preferences.Preferences | null = AudioSettings.store;
    if (store === null) {
      const ctx: common.UIAbilityContext | null = AudioSettings.context;
      if (ctx === null) {
        Logger.warn(TAG, `persistKey ${key} skipped — no context`);
        return;
      }
      try {
        store = await preferences.getPreferences(ctx, PersistNs.AUDIO);
        AudioSettings.store = store;
        Logger.info(TAG, 'store re-acquired after null');
      } catch (err) {
        Logger.warn(TAG, `persistKey ${key} getPreferences fail-soft — memory only`);
        return;
      }
    }
    try {
      await store.put(key, value);
      await store.flush();
    } catch (err) {
      Logger.warn(TAG, `persistKey ${key} fail-soft`);
    }
  }

  /**
   * 读档校验（21 §2.6 / S21-47 逐键）：0～100 整数 → 非 5 倍数四舍五入到最近 5；
   * 非数字 / 非整数 / 越界 → 只这个键回默认。修正只在内存。
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

  static parseMuted(raw: preferences.ValueType): boolean {
    if (typeof raw !== 'boolean') {
      return AudioSettings.DEFAULT_MUTED;
    }
    return raw === true;
  }

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
