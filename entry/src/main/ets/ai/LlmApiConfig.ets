import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'LlmApiConfig';

/** Defaults when rawfile missing / incomplete. Never commit secrets. */
const DEFAULT_BASE_URL: string = 'https://api.deepseek.com';
const DEFAULT_MODEL: string = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS: number = 8000;
const SECRETS_RAW_PATH: string = 'config/llm_secrets.json';

/**
 * DeepSeek 连接配置。
 * 读序：Preferences `lb.settings` / `llm_api_key` 非空优先 → 否则 rawfile `config/llm_secrets.json`
 * （gitignore，非验收）→ 都空则 hasApiKey false，决策回落 Policy。
 * 禁止把 Key 写入 string.json、已跟踪源码、hilog、注释或 commit message。
 */
export class LlmApiConfig {
  static readonly KEY_API: string = 'llm_api_key';

  private static apiKey: string = '';
  /** rawfile 里的 apiKey 缓存；清除 Preferences 后回落用。永不 hilog。 */
  private static rawfileKey: string = '';
  private static baseUrl: string = DEFAULT_BASE_URL;
  private static model: string = DEFAULT_MODEL;
  private static timeoutMs: number = DEFAULT_TIMEOUT_MS;
  private static loaded: boolean = false;
  private static context: common.UIAbilityContext | null = null;
  private static store: preferences.Preferences | null = null;

  static isLoaded(): boolean {
    return LlmApiConfig.loaded;
  }

  static hasApiKey(): boolean {
    return LlmApiConfig.apiKey.length > 0;
  }

  /** Never log the returned value. */
  static getApiKey(): string {
    return LlmApiConfig.apiKey;
  }

  static getBaseUrl(): string {
    return LlmApiConfig.baseUrl;
  }

  static getModel(): string {
    return LlmApiConfig.model;
  }

  static getTimeoutMs(): number {
    return LlmApiConfig.timeoutMs;
  }

  /**
   * Fail-soft load. Preferences 非空优先；否则 rawfile；都空 → hasApiKey false。
   * hilog 只打 hasKey=0|1 / absent|invalid|ready，永不打明文 Key。
   */
  static async tryLoad(context: common.UIAbilityContext): Promise<void> {
    LlmApiConfig.context = context;
    LlmApiConfig.apiKey = '';
    LlmApiConfig.rawfileKey = '';
    LlmApiConfig.baseUrl = DEFAULT_BASE_URL;
    LlmApiConfig.model = DEFAULT_MODEL;
    LlmApiConfig.timeoutMs = DEFAULT_TIMEOUT_MS;
    LlmApiConfig.loaded = false;
    LlmApiConfig.store = null;

    await LlmApiConfig.loadRawfile(context);
    const prefKey: string = await LlmApiConfig.readPrefKey();
    if (prefKey.length > 0) {
      LlmApiConfig.apiKey = prefKey;
      Logger.info(TAG, 'llm_secrets status=ready hasKey=1 source=prefs');
    } else if (LlmApiConfig.rawfileKey.length > 0) {
      LlmApiConfig.apiKey = LlmApiConfig.rawfileKey;
      Logger.info(TAG, 'llm_secrets status=ready hasKey=1 source=rawfile');
    } else {
      LlmApiConfig.apiKey = '';
      Logger.info(TAG, 'llm_secrets status=ready hasKey=0 source=none');
    }
    LlmApiConfig.loaded = true;
  }

  /**
   * 设置页保存：写入 Preferences，内存立即生效。空串走 clear。
   * 返回是否写盘成功（内存仍会更新以便本局可用）。
   */
  static async saveApiKeyFromSettings(key: string): Promise<boolean> {
    let trimmed: string = '';
    if (key !== null && key !== undefined) {
      trimmed = key.trim();
    }
    if (trimmed.length === 0) {
      return await LlmApiConfig.clearApiKeyFromSettings();
    }
    const ok: boolean = await LlmApiConfig.writePrefKey(trimmed);
    LlmApiConfig.apiKey = trimmed;
    Logger.info(TAG, 'llm_secrets status=saved hasKey=1');
    return ok;
  }

  /**
   * 设置页清除：Preferences 写空串，回落 rawfile（有则 hasKey=1，否则 0）。
   */
  static async clearApiKeyFromSettings(): Promise<boolean> {
    const ok: boolean = await LlmApiConfig.deletePrefKey();
    if (LlmApiConfig.rawfileKey.length > 0) {
      LlmApiConfig.apiKey = LlmApiConfig.rawfileKey;
      Logger.info(TAG, 'llm_secrets status=cleared hasKey=1 source=rawfile');
    } else {
      LlmApiConfig.apiKey = '';
      Logger.info(TAG, 'llm_secrets status=cleared hasKey=0 source=none');
    }
    return ok;
  }

  /** Test / inject hook only. Do not persist. Empty string clears session Key. */
  static setApiKeyForSession(key: string): void {
    if (key === null || key === undefined) {
      LlmApiConfig.apiKey = '';
      return;
    }
    LlmApiConfig.apiKey = key.trim();
  }

  private static async loadRawfile(context: common.UIAbilityContext): Promise<void> {
    let bytes: Uint8Array;
    try {
      bytes = await context.resourceManager.getRawFileContent(SECRETS_RAW_PATH);
    } catch (_absent) {
      Logger.info(TAG, 'llm_secrets status=absent hasKey=0');
      return;
    }
    try {
      const text: string = LlmApiConfig.decode(bytes);
      const parsed: Object = JSON.parse(text) as Object;
      LlmApiConfig.applyFields(parsed);
      if (LlmApiConfig.rawfileKey.length > 0) {
        Logger.info(TAG, 'llm_secrets status=ok hasKey=1');
      } else {
        Logger.info(TAG, 'llm_secrets status=ok hasKey=0 reason=empty_key');
      }
    } catch (_invalid) {
      LlmApiConfig.rawfileKey = '';
      Logger.info(TAG, 'llm_secrets status=invalid hasKey=0');
    }
  }

  private static applyFields(raw: Object): void {
    const o: Record<string, Object> = raw as Record<string, Object>;
    const keyRaw: Object | undefined = o['apiKey'];
    if (typeof keyRaw === 'string') {
      LlmApiConfig.rawfileKey = (keyRaw as string).trim();
    }
    const baseRaw: Object | undefined = o['baseUrl'];
    if (typeof baseRaw === 'string' && (baseRaw as string).length > 0) {
      LlmApiConfig.baseUrl = (baseRaw as string).replace(/\/$/, '');
    }
    const modelRaw: Object | undefined = o['model'];
    if (typeof modelRaw === 'string' && (modelRaw as string).length > 0) {
      LlmApiConfig.model = modelRaw as string;
    }
    const toRaw: Object | undefined = o['timeoutMs'];
    if (typeof toRaw === 'number' && isFinite(toRaw as number) && (toRaw as number) > 0) {
      let ms: number = Math.floor(toRaw as number);
      if (ms > 8000) {
        ms = 8000;
      }
      LlmApiConfig.timeoutMs = ms;
    }
  }

  private static async ensureStore(): Promise<preferences.Preferences | null> {
    if (LlmApiConfig.store !== null) {
      return LlmApiConfig.store;
    }
    const ctx: common.UIAbilityContext | null = LlmApiConfig.context;
    if (ctx === null) {
      return null;
    }
    try {
      const store: preferences.Preferences = await preferences.getPreferences(ctx, PersistNs.AUDIO);
      LlmApiConfig.store = store;
      return store;
    } catch (_err) {
      Logger.warn(TAG, 'llm_prefs getPreferences fail-soft');
      return null;
    }
  }

  private static async readPrefKey(): Promise<string> {
    const store: preferences.Preferences | null = await LlmApiConfig.ensureStore();
    if (store === null) {
      return '';
    }
    try {
      const raw: preferences.ValueType = await store.get(LlmApiConfig.KEY_API, '');
      if (typeof raw === 'string') {
        return (raw as string).trim();
      }
      return '';
    } catch (_err) {
      Logger.warn(TAG, 'llm_prefs get fail-soft');
      return '';
    }
  }

  private static async writePrefKey(value: string): Promise<boolean> {
    const store: preferences.Preferences | null = await LlmApiConfig.ensureStore();
    if (store === null) {
      Logger.warn(TAG, 'llm_prefs put skipped — no store');
      return false;
    }
    try {
      await store.put(LlmApiConfig.KEY_API, value);
      await store.flush();
      return true;
    } catch (_err) {
      Logger.warn(TAG, 'llm_prefs put fail-soft');
      return false;
    }
  }

  /** 清除 = 单键写入空串再 flush（21 §4.2）；不 delete 整键。 */
  private static async deletePrefKey(): Promise<boolean> {
    return await LlmApiConfig.writePrefKey('');
  }

  private static decode(bytes: Uint8Array): string {
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    return decoder.decodeToString(bytes);
  }
}
