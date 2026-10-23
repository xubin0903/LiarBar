import http from '@ohos.net.http';
import { Logger } from '../common/Logger';
import { AuthStore } from '../persist/AuthStore';

const TAG = 'AuthClient';

/** 一次注册/登录的结果。phrase 是 string.json 键名；ok 时 phrase 为空。 */
export class AuthCallResult {
  ok: boolean = false;
  token: string = '';
  username: string = '';
  phrase: string = '';
}

/**
 * 云端注册/登录。基址与路径见登录 schema §1.2（负责人 2026-10-23 开闸）。
 * 超时 8s。无网 / 超时 / 非 2xx / 缺 token → 短句，不写令牌。
 * 本类不碰 Preferences；落盘在 AuthSession。
 */
export class AuthClient {
  static readonly BASE: string = 'http://101.33.196.35:18080';
  static readonly PATH_REGISTER: string = '/api/v1/register';
  static readonly PATH_LOGIN: string = '/api/v1/login';
  static readonly TIMEOUT_MS: number = 8000;

  static fail(phrase: string): AuthCallResult {
    const result: AuthCallResult = new AuthCallResult();
    result.ok = false;
    result.token = '';
    result.username = '';
    result.phrase = phrase;
    return result;
  }

  /** trim 后用户名 3～16；密码 ≥6。不合法返回字段短句，调用方不得发请求。 */
  static validate(username: string, password: string): string {
    const name: string = username.trim();
    if (name.length < 3 || name.length > 16 || password.length < 6) {
      return 'lb_str_auth_field_invalid';
    }
    return '';
  }

  static async register(username: string, password: string): Promise<AuthCallResult> {
    return AuthClient.post(AuthClient.PATH_REGISTER, username, password);
  }

  static async login(username: string, password: string): Promise<AuthCallResult> {
    return AuthClient.post(AuthClient.PATH_LOGIN, username, password);
  }

  /** code 优先，否则按 HTTP 状态映射 schema §1.5。detail/message 只记日志，不代替短句。 */
  static phraseFor(status: number, code: string): string {
    if (code === 'AUTH_BAD_CREDENTIALS' || code === 'AUTH_USER_NOT_FOUND') {
      return 'lb_str_auth_login_fail';
    }
    if (code === 'AUTH_USER_EXISTS') {
      return 'lb_str_auth_register_conflict';
    }
    if (code === 'AUTH_VALIDATION') {
      return 'lb_str_auth_field_invalid';
    }
    if (code === 'AUTH_RATE_LIMIT') {
      return 'lb_str_auth_rate_limit';
    }
    if (status === 401 || status === 404) {
      return 'lb_str_auth_login_fail';
    }
    if (status === 409) {
      return 'lb_str_auth_register_conflict';
    }
    if (status === 400 || status === 422) {
      return 'lb_str_auth_field_invalid';
    }
    if (status === 429) {
      return 'lb_str_auth_rate_limit';
    }
    return 'lb_str_auth_bad_response';
  }

  /**
   * 纯解析，便于闸里不发真网也能跑。
   * 2xx 且 ok===true 且 token 非空才成功。expires_in 忽略。
   */
  static interpret(status: number, raw: string, fallbackName: string): AuthCallResult {
    const httpOk: boolean = status >= 200 && status < 300;
    let parsed: boolean = false;
    let codeStr: string = '';
    let okFlag: boolean = false;
    let token: string = '';
    let uname: string = '';
    let detail: string = '';
    let message: string = '';
    if (raw.length > 0) {
      try {
        const root: Object = JSON.parse(raw);
        const rec: Record<string, Object> = root as Record<string, Object>;
        parsed = true;
        codeStr = AuthClient.strField(rec, 'code');
        okFlag = AuthClient.boolField(rec, 'ok');
        token = AuthClient.strField(rec, 'token');
        uname = AuthClient.strField(rec, 'username');
        detail = AuthClient.strField(rec, 'detail');
        message = AuthClient.strField(rec, 'message');
      } catch (_err) {
        parsed = false;
      }
    }
    if (!httpOk || !parsed || !okFlag || token.length === 0) {
      if (detail.length > 0 || message.length > 0) {
        Logger.info(TAG, `auth server text ignored status=${status} code=${codeStr}`);
      }
      if (!httpOk) {
        return AuthClient.fail(AuthClient.phraseFor(status, codeStr));
      }
      if (!parsed) {
        return AuthClient.fail('lb_str_auth_bad_response');
      }
      if (codeStr.length > 0) {
        return AuthClient.fail(AuthClient.phraseFor(status, codeStr));
      }
      return AuthClient.fail('lb_str_auth_bad_response');
    }
    const result: AuthCallResult = new AuthCallResult();
    result.ok = true;
    result.token = token;
    if (uname.length > 0) {
      result.username = uname;
    } else {
      result.username = fallbackName;
    }
    result.phrase = '';
    return result;
  }

  private static async post(path: string, username: string, password: string): Promise<AuthCallResult> {
    const bad: string = AuthClient.validate(username, password);
    if (bad.length > 0) {
      return AuthClient.fail(bad);
    }
    const name: string = username.trim();
    const url: string = AuthClient.BASE + path;
    const payload: Record<string, Object> = {
      'username': name,
      'password': password
    };
    const body: string = JSON.stringify(payload);
    let client: http.HttpRequest | null = null;
    try {
      const live: http.HttpRequest = http.createHttp();
      client = live;
      const resp: http.HttpResponse = await live.request(url, {
        method: http.RequestMethod.POST,
        header: {
          'Content-Type': 'application/json'
        },
        extraData: body,
        connectTimeout: AuthClient.TIMEOUT_MS,
        readTimeout: AuthClient.TIMEOUT_MS,
        expectDataType: http.HttpDataType.STRING
      });
      const code: number = resp.responseCode;
      const raw: string = AuthClient.responseToString(resp.result);
      return AuthClient.interpret(code, raw, name);
    } catch (_err) {
      Logger.warn(TAG, 'auth network/timeout');
      return AuthClient.fail('lb_str_auth_network');
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e2) {
          // destroy 失败不影响短句
        }
      }
    }
  }

  private static responseToString(result: string | Object | ArrayBuffer): string {
    if (typeof result === 'string') {
      return result as string;
    }
    if (result instanceof ArrayBuffer) {
      return '';
    }
    try {
      return JSON.stringify(result);
    } catch (_err) {
      return '';
    }
  }

  private static strField(rec: Record<string, Object>, key: string): string {
    const raw: Object | undefined = rec[key];
    if (typeof raw === 'string') {
      return raw as string;
    }
    return '';
  }

  private static boolField(rec: Record<string, Object>, key: string): boolean {
    const raw: Object | undefined = rec[key];
    if (typeof raw === 'boolean') {
      const flag: boolean = raw as boolean;
      return flag === true;
    }
    return false;
  }
}

/** 校验 → HTTP → 成功才写 lb.auth 并 flush。失败不写令牌。 */
export class AuthSession {
  static async submit(registerMode: boolean, username: string, password: string): Promise<AuthCallResult> {
    const result: AuthCallResult = registerMode
      ? await AuthClient.register(username, password)
      : await AuthClient.login(username, password);
    if (!result.ok) {
      return result;
    }
    const saved: boolean = await AuthStore.save(result.token, result.username);
    if (!saved) {
      await AuthStore.clear();
      return AuthClient.fail('lb_str_auth_prefs_fail');
    }
    return result;
  }
}
