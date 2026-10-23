import http from '@ohos.net.http';
import { Logger } from '../common/Logger';

const TAG = 'RecordsClient';

/** 一次 records HTTP 的结果。phrase 是 string.json 键；ok 时 phrase 为空。 */
export class RecordsWire {
  ok: boolean = false;
  status: number = 0;
  raw: string = '';
  phrase: string = '';
}

/**
 * 战绩云端。基址 / 超时与登录同机（schema §1.2）。
 * GET/POST `/api/v1/records`，`Authorization: Bearer <auth_token>`。
 * 无令牌不发请求。失败只回短句，不改 lb.auth，不踢登。
 */
export class RecordsClient {
  static readonly BASE: string = 'http://101.33.196.35:18080';
  static readonly PATH: string = '/api/v1/records';
  static readonly TIMEOUT_MS: number = 8000;
  static readonly PHRASE_NETWORK: string = 'lb_str_records_sync_network';
  static readonly PHRASE_UNAUTHORIZED: string = 'lb_str_records_sync_unauthorized';
  static readonly PHRASE_BAD_RESPONSE: string = 'lb_str_records_sync_bad_response';
  static readonly PHRASE_BAD_PAYLOAD: string = 'lb_str_records_sync_bad_payload';
  static readonly PHRASE_RATE_LIMIT: string = 'lb_str_records_sync_rate_limit';
  static readonly PHRASE_ACCOUNT_LEAK: string = 'lb_str_records_account_leak';
  static readonly PHRASE_LOGOUT_WIPE: string = 'lb_str_records_logout_wipe';
  static readonly PHRASE_CLOUD_OVERRIDE: string = 'lb_str_records_cloud_override_fail';
  static readonly PHRASE_BLOCKS_UI: string = 'lb_str_records_sync_blocks_ui';

  static fail(status: number, phrase: string): RecordsWire {
    const wire: RecordsWire = new RecordsWire();
    wire.ok = false;
    wire.status = status;
    wire.raw = '';
    wire.phrase = phrase;
    return wire;
  }

  static async getRecords(token: string): Promise<RecordsWire> {
    if (token.length === 0) {
      return RecordsClient.fail(0, RecordsClient.PHRASE_UNAUTHORIZED);
    }
    return RecordsClient.send(http.RequestMethod.GET, '', token);
  }

  static async postRecords(token: string, body: string): Promise<RecordsWire> {
    if (token.length === 0) {
      return RecordsClient.fail(0, RecordsClient.PHRASE_UNAUTHORIZED);
    }
    return RecordsClient.send(http.RequestMethod.POST, body, token);
  }

  /** code 优先，否则按 HTTP 状态映射 schema §1.5。message 只记日志。 */
  static phraseFor(status: number, code: string): string {
    if (code === 'REC_UNAUTHORIZED' || status === 401) {
      return RecordsClient.PHRASE_UNAUTHORIZED;
    }
    if (code === 'REC_VALIDATION' || status === 400 || status === 422) {
      return RecordsClient.PHRASE_BAD_PAYLOAD;
    }
    if (code === 'REC_RATE_LIMIT' || status === 429) {
      return RecordsClient.PHRASE_RATE_LIMIT;
    }
    return RecordsClient.PHRASE_BAD_RESPONSE;
  }

  /**
   * 纯解析，闸里不发真网也能跑。
   * 2xx 且 ok===true 才成功。请求体是否含账号由调用方保证，这里不读 username。
   */
  static interpret(status: number, raw: string): RecordsWire {
    const httpOk: boolean = status >= 200 && status < 300;
    let parsed: boolean = false;
    let codeStr: string = '';
    let okFlag: boolean = false;
    let message: string = '';
    if (raw.length > 0) {
      try {
        const root: Object = JSON.parse(raw);
        const rec: Record<string, Object> = root as Record<string, Object>;
        parsed = true;
        codeStr = RecordsClient.strField(rec, 'code');
        okFlag = RecordsClient.boolField(rec, 'ok');
        message = RecordsClient.strField(rec, 'message');
      } catch (_err) {
        parsed = false;
      }
    }
    if (!httpOk || !parsed || !okFlag) {
      if (message.length > 0) {
        Logger.info(TAG, `records server text ignored status=${status} code=${codeStr}`);
      }
      if (!httpOk) {
        return RecordsClient.fail(status, RecordsClient.phraseFor(status, codeStr));
      }
      if (!parsed) {
        return RecordsClient.fail(status, RecordsClient.PHRASE_BAD_RESPONSE);
      }
      if (codeStr.length > 0) {
        return RecordsClient.fail(status, RecordsClient.phraseFor(status, codeStr));
      }
      return RecordsClient.fail(status, RecordsClient.PHRASE_BAD_RESPONSE);
    }
    const wire: RecordsWire = new RecordsWire();
    wire.ok = true;
    wire.status = status;
    wire.raw = raw;
    wire.phrase = '';
    return wire;
  }

  private static async send(method: http.RequestMethod, body: string, token: string): Promise<RecordsWire> {
    const url: string = RecordsClient.BASE + RecordsClient.PATH;
    const auth: string = 'Bearer ' + token;
    let client: http.HttpRequest | null = null;
    try {
      const live: http.HttpRequest = http.createHttp();
      client = live;
      let resp: http.HttpResponse;
      if (body.length === 0) {
        resp = await live.request(url, {
          method: method,
          header: {
            'Authorization': auth
          },
          connectTimeout: RecordsClient.TIMEOUT_MS,
          readTimeout: RecordsClient.TIMEOUT_MS,
          expectDataType: http.HttpDataType.STRING
        });
      } else {
        resp = await live.request(url, {
          method: method,
          header: {
            'Authorization': auth,
            'Content-Type': 'application/json'
          },
          extraData: body,
          connectTimeout: RecordsClient.TIMEOUT_MS,
          readTimeout: RecordsClient.TIMEOUT_MS,
          expectDataType: http.HttpDataType.STRING
        });
      }
      const code: number = resp.responseCode;
      const raw: string = RecordsClient.responseToString(resp.result);
      return RecordsClient.interpret(code, raw);
    } catch (_err) {
      Logger.warn(TAG, RecordsClient.PHRASE_NETWORK);
      return RecordsClient.fail(0, RecordsClient.PHRASE_NETWORK);
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