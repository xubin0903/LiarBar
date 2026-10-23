import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { Logger } from '../common/Logger';

const TAG = 'LlmApiConfig';

/** Defaults when rawfile missing / incomplete. Never commit secrets. */
const DEFAULT_BASE_URL: string = 'https://api.deepseek.com';
const DEFAULT_MODEL: string = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS: number = 8000;
const SECRETS_RAW_PATH: string = 'config/llm_secrets.json';

/**
 * DeepSeek 连接配置（骨架）。
 * 读 rawfile `config/llm_secrets.json`（gitignore，不进仓）：
 *   apiKey / baseUrl / model / timeoutMs
 * Key 注入方式等负责人通知；缺文件/缺字段/apiKey 空 → 空 Key，决策回落 Policy。
 * 禁止把 Key 写入 string.json、已跟踪源码、hilog、注释或 commit message。
 */
export class LlmApiConfig {
  private static apiKey: string = '';
  private static baseUrl: string = DEFAULT_BASE_URL;
  private static model: string = DEFAULT_MODEL;
  private static timeoutMs: number = DEFAULT_TIMEOUT_MS;
  private static loaded: boolean = false;

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
   * Fail-soft load from rawfile. Missing file / bad JSON / empty apiKey → keep defaults,
   * hasApiKey() false, callers must fall back to local Policy (no throw).
   */
  static async tryLoad(context: common.UIAbilityContext): Promise<void> {
    LlmApiConfig.apiKey = '';
    LlmApiConfig.baseUrl = DEFAULT_BASE_URL;
    LlmApiConfig.model = DEFAULT_MODEL;
    LlmApiConfig.timeoutMs = DEFAULT_TIMEOUT_MS;
    LlmApiConfig.loaded = false;
    try {
      const bytes: Uint8Array = await context.resourceManager.getRawFileContent(SECRETS_RAW_PATH);
      const text: string = LlmApiConfig.decode(bytes);
      const parsed: Object = JSON.parse(text) as Object;
      LlmApiConfig.applyFields(parsed);
      LlmApiConfig.loaded = true;
      Logger.info(TAG, 'llm secrets rawfile ok hasKey=' + (LlmApiConfig.hasApiKey() ? '1' : '0'));
    } catch (_err) {
      LlmApiConfig.loaded = true;
      Logger.info(TAG, 'llm secrets absent or invalid — Policy fallback');
    }
  }

  /** Test / inject hook only. Do not persist. Empty string clears Key. */
  static setApiKeyForSession(key: string): void {
    if (key === null || key === undefined) {
      LlmApiConfig.apiKey = '';
      return;
    }
    LlmApiConfig.apiKey = key.trim();
  }

  private static applyFields(raw: Object): void {
    const o: Record<string, Object> = raw as Record<string, Object>;
    const keyRaw: Object | undefined = o['apiKey'];
    if (typeof keyRaw === 'string') {
      LlmApiConfig.apiKey = (keyRaw as string).trim();
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

  private static decode(bytes: Uint8Array): string {
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    return decoder.decodeToString(bytes);
  }
}
