import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { PageUrls, PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'AuthStore';

/**
 * 登录 schema §2：Preferences `lb.auth` 只存会话。
 * 键仅 `auth_token` + `auth_username`。不写密码，不碰 `lb.settings` / `lb.records`。
 */
export class AuthStore {
  static readonly KEY_TOKEN: string = 'auth_token';
  static readonly KEY_USER: string = 'auth_username';
  private static store: preferences.Preferences | null = null;
  private static token: string = '';
  private static username: string = '';
  private static corrupt: boolean = false;
  private static gatePhrase: string = '';

  /** 非空 string token = 本机已登录。空 / 缺 / 非 string 都不是。 */
  static isLoggedIn(): boolean {
    return AuthStore.token.length > 0;
  }

  static usernameNow(): string {
    return AuthStore.username;
  }

  static corruptCleared(): boolean {
    return AuthStore.corrupt;
  }

  /** 冷启动路由：有令牌进大厅，否则登录页。本阶段不调 /me。 */
  static coldStartUrl(): string {
    if (AuthStore.isLoggedIn()) {
      return PageUrls.LOBBY;
    }
    return PageUrls.LOGIN;
  }

  static noteGate(phrase: string): void {
    AuthStore.gatePhrase = phrase;
  }

  static takeGatePhrase(): string {
    const phrase: string = AuthStore.gatePhrase;
    AuthStore.gatePhrase = '';
    return phrase;
  }

  /**
   * getPreferences 失败：本运行未登录，不崩。
   * token 类型非 string：清空两键并 flush，视为未登录。
   * 有 token 缺 username：仍已登录，展示名空串。
   */
  static async init(context: common.UIAbilityContext): Promise<void> {
    AuthStore.token = '';
    AuthStore.username = '';
    AuthStore.corrupt = false;
    AuthStore.gatePhrase = '';
    AuthStore.store = null;
    try {
      const store: preferences.Preferences = await preferences.getPreferences(context, PersistNs.AUTH);
      AuthStore.store = store;
      const rawToken: preferences.ValueType = await store.get(AuthStore.KEY_TOKEN, '');
      const rawUser: preferences.ValueType = await store.get(AuthStore.KEY_USER, '');
      if (typeof rawToken !== 'string') {
        AuthStore.corrupt = true;
        await AuthStore.wipe(store);
        Logger.warn(TAG, 'auth_token not a string — session cleared');
        return;
      }
      if (rawToken.length === 0) {
        return;
      }
      AuthStore.token = rawToken;
      if (typeof rawUser === 'string') {
        AuthStore.username = rawUser;
      }
    } catch (err) {
      AuthStore.store = null;
      AuthStore.token = '';
      AuthStore.username = '';
      Logger.warn(TAG, 'getPreferences fail-soft — logged out');
    }
  }

  /** 登录/注册成功：两键 put 后 flush。空 token 不写。失败不改内存令牌。 */
  static async save(token: string, username: string): Promise<boolean> {
    if (token.length === 0) {
      return false;
    }
    const store: preferences.Preferences | null = AuthStore.store;
    if (store === null) {
      Logger.warn(TAG, 'save fail-soft — no lb.auth store');
      return false;
    }
    try {
      await store.put(AuthStore.KEY_TOKEN, token);
      await store.put(AuthStore.KEY_USER, username);
      await store.flush();
      AuthStore.token = token;
      AuthStore.username = username;
      AuthStore.corrupt = false;
      return true;
    } catch (err) {
      Logger.warn(TAG, 'save fail-soft');
      return false;
    }
  }

  /** 退出：删两键再 flush。失败则内存令牌保持，调用方不得进登录页冒充已退出。 */
  static async clear(): Promise<boolean> {
    const store: preferences.Preferences | null = AuthStore.store;
    if (store === null) {
      AuthStore.token = '';
      AuthStore.username = '';
      return true;
    }
    try {
      await AuthStore.wipe(store);
      return AuthStore.token.length === 0;
    } catch (err) {
      Logger.warn(TAG, 'clear fail-soft');
      return false;
    }
  }

  private static async wipe(store: preferences.Preferences): Promise<void> {
    await store.delete(AuthStore.KEY_TOKEN);
    await store.delete(AuthStore.KEY_USER);
    await store.flush();
    AuthStore.token = '';
    AuthStore.username = '';
  }
}
