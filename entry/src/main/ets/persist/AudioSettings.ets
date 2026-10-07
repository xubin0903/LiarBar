import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'AudioSettings';

/** Called after every change so live players re-apply gain (BGM beds re-setVolume). */
export type AudioSettingsListener = () => void;

/**
 * PR-B 音量设置乘子层（Preferences 持久化，运行时生效）。
 * 两轨：BGM（大厅 BGM/环境床 + 局内 BGM）· 音效（全部 SFX；语音/VO 跟音效轨）。
 * 静默 = 两轨同乘 0；不改各槽位自身的混音常量（VOL_*），只在出声口乘一次。
 */
export class AudioSettings {
  static readonly KEY_BGM: string = 'bgm';
  static readonly KEY_SFX: string = 'sfx';
  static readonly KEY_MUTED: string = 'muted';
  static readonly DEFAULT_BGM: number = 1.0;
  static readonly DEFAULT_SFX: number = 1.0;

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
      const muted: preferences.ValueType = await store.get(AudioSettings.KEY_MUTED, false);
      AudioSettings.bgm = AudioSettings.clamp01(Number(bgm));
      AudioSettings.sfx = AudioSettings.clamp01(Number(sfx));
      AudioSettings.muted = Boolean(muted);
      Logger.info(TAG, `loaded bgm=${AudioSettings.bgm} sfx=${AudioSettings.sfx} muted=${AudioSettings.muted}`);
    } catch (err) {
      Logger.warn(TAG, 'preferences load fail-soft — defaults 1.0/1.0/unmuted');
    }
    AudioSettings.notify();
  }

  /** BGM 轨乘子（大厅 BGM、大厅环境床、局内 BGM）。 */
  static bgmGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.bgm;
  }

  /** 音效轨乘子（全部短 SFX）。 */
  static sfxGain(): number {
    return AudioSettings.muted ? 0 : AudioSettings.sfx;
  }

  /** 语音跟音效（负责人分派单 v1 第 6 条）。 */
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

  static setBgmLevel(level: number): void {
    AudioSettings.bgm = AudioSettings.clamp01(level);
    AudioSettings.notify();
    void AudioSettings.persist();
  }

  static setSfxLevel(level: number): void {
    AudioSettings.sfx = AudioSettings.clamp01(level);
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
