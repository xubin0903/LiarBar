import http from '@ohos.net.http';
import { Logger } from '../common/Logger';
import { AuthStore } from '../persist/AuthStore';
import { AiInfoSet, AiPublicLastPlay, AiPublicSeat, AiRevealRec, ChallengeAction, PlayAction } from './AiTypes';
import { LlmApiConfig } from './LlmApiConfig';

const TAG = 'LlmDecisionClient';

/**
 * 人机对局AI-LLM决策.md v0.1 §1.1 system（逐字）。
 * LLM 只填 play/challenge；Judge / PENALTY / 胜负不在此模块。
 * 紧急票：禁止客户端直连 DeepSeek /chat/completions；改 POST 云端 /api/v1/llm/decide。
 * 闸兼容保留字面量：llm_skip_prefetch reason=no_key（不再挡云端 decide）。
 */
const SYSTEM_PROMPT: string =
  '你是谎馆牌友 NPC，只替本座做合法动作。只输出一个 JSON 对象，不要 Markdown，不要解释。\n' +
  '只能 kind=play（出牌）或 kind=challenge（质疑/相信/跳过）。\n' +
  '不得输出真假判定、输家、熄烛、胜负，不得输出 JUDGE、PENALTY、verdict、loser、trueRanks、judge。\n' +
  '不得偷看或索要他座手牌与未发牌。宣称 rank 以 user 中的 claim 为准，不得改写。\n' +
  'forceChallenge2 为 true 时，challenge.intent 必须是 DOUBT。\n' +
  '你只填决策字段；揭牌与惩罚由引擎完成。\n' +
  'params 只作性格口吻，不是透视。';

const FORBIDDEN_KEYS: string[] = [
  'verdict', 'loser', 'trueRanks', 'judge', 'penalty', 'winner',
  'JUDGE', 'PENALTY', 'loserSeatId', 'true_ranks'
];

/** Report / apply source 枚举（紧急票）。 */
export type LlmReportSource =
  'cloud_llm' | 'local_policy' | 'timeout_default' | 'parse_fail' | 'http_error' | 'no_ready';

export type LlmKind = 'play' | 'challenge';

/** Cloud decide request body（负责人契约）. */
interface LlmDecideRequestBody {
  request_id: string;
  kind: string;
  seat_id: number;
  match_id: string;
  user_text: string;
  timeout_ms: number;
}

/** Cloud report request body（负责人契约：无 latency_ms/http_code）. */
interface LlmReportRequestBody {
  request_id: string;
  kind: string;
  applied: boolean;
  source: string;
  action_summary: string;
}

/**
 * 云端 LLM 决策客户端（Bearer = 登录 token，与 records 同）。
 * armPrefetch* 在 think 窗启动异步请求并缓存；tryDecide* 只读缓存（绝不同步死等 HTTP）。
 * 合法回包必须按 content 出牌/质疑/相信；失败 → null → PlayPolicy/ChallengePolicy，并 report。
 */
export class LlmDecisionClient {
  private static cacheKey: string = '';
  private static cachedPlay: PlayAction | null = null;
  private static cachedChallenge: ChallengeAction | null = null;
  private static playReady: boolean = false;
  private static chalReady: boolean = false;
  /** Prefetch outcome when cache is null / pending. */
  private static lastSource: LlmReportSource = 'no_ready';
  private static lastRequestId: string = '';
  private static lastKind: LlmKind = 'play';
  private static lastLatencyMs: number = 0;
  private static lastHttpCode: number = 0;
  private static lastActionSummary: string = '';
  private static lastMatchId: string = '';
  private static reqSeq: number = 0;
  /** Avoid double-report for the same arm. */
  private static reportedKey: string = '';

  /** Clear prefetch cache (new arm / seat change). */
  static clearCache(): void {
    LlmDecisionClient.cacheKey = '';
    LlmDecisionClient.cachedPlay = null;
    LlmDecisionClient.cachedChallenge = null;
    LlmDecisionClient.playReady = false;
    LlmDecisionClient.chalReady = false;
    LlmDecisionClient.lastSource = 'no_ready';
    LlmDecisionClient.lastRequestId = '';
    LlmDecisionClient.lastLatencyMs = 0;
    LlmDecisionClient.lastHttpCode = 0;
    LlmDecisionClient.lastActionSummary = '';
    LlmDecisionClient.lastMatchId = '';
    LlmDecisionClient.reportedKey = '';
  }

  /**
   * Fire-and-forget play request for the current think window.
   * key = seat|round|plays|play — stale replies ignored.
   * Decide 不再依赖本机 Key（legacy: llm_skip_prefetch reason=no_key）。
   */
  static armPrefetchPlay(info: AiInfoSet, key: string, matchId: string = ''): void {
    LlmDecisionClient.cacheKey = key;
    LlmDecisionClient.cachedPlay = null;
    LlmDecisionClient.playReady = false;
    LlmDecisionClient.lastSource = 'no_ready';
    LlmDecisionClient.lastKind = 'play';
    LlmDecisionClient.lastMatchId = matchId;
    LlmDecisionClient.reportedKey = '';
    const token: string = AuthStore.tokenNow();
    if (token.length === 0) {
      Logger.info(TAG, 'llm_skip_prefetch reason=no_auth_token kind=play');
      LlmDecisionClient.lastSource = 'no_ready';
      LlmDecisionClient.playReady = true;
      LlmDecisionClient.cachedPlay = null;
      return;
    }
    const k: string = key;
    LlmDecisionClient.decidePlayAsync(info).then((r: PlayAction | null): void => {
      if (LlmDecisionClient.cacheKey === k) {
        LlmDecisionClient.cachedPlay = r;
        LlmDecisionClient.playReady = true;
      }
    }).catch((): void => {
      if (LlmDecisionClient.cacheKey === k) {
        LlmDecisionClient.cachedPlay = null;
        LlmDecisionClient.lastSource = 'http_error';
        LlmDecisionClient.playReady = true;
      }
    });
  }

  /** Fire-and-forget challenge request for the current think window. */
  static armPrefetchChallenge(info: AiInfoSet, key: string, matchId: string = ''): void {
    LlmDecisionClient.cacheKey = key;
    LlmDecisionClient.cachedChallenge = null;
    LlmDecisionClient.chalReady = false;
    LlmDecisionClient.lastSource = 'no_ready';
    LlmDecisionClient.lastKind = 'challenge';
    LlmDecisionClient.lastMatchId = matchId;
    LlmDecisionClient.reportedKey = '';
    const token: string = AuthStore.tokenNow();
    if (token.length === 0) {
      Logger.info(TAG, 'llm_skip_prefetch reason=no_auth_token kind=challenge');
      LlmDecisionClient.lastSource = 'no_ready';
      LlmDecisionClient.chalReady = true;
      LlmDecisionClient.cachedChallenge = null;
      return;
    }
    const k: string = key;
    LlmDecisionClient.decideChallengeAsync(info).then((r: ChallengeAction | null): void => {
      if (LlmDecisionClient.cacheKey === k) {
        LlmDecisionClient.cachedChallenge = r;
        LlmDecisionClient.chalReady = true;
      }
    }).catch((): void => {
      if (LlmDecisionClient.cacheKey === k) {
        LlmDecisionClient.cachedChallenge = null;
        LlmDecisionClient.lastSource = 'http_error';
        LlmDecisionClient.chalReady = true;
      }
    });
  }

  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecidePlay(_info: AiInfoSet): PlayAction | null {
    if (!LlmDecisionClient.playReady) {
      LlmDecisionClient.emitFallback('play', 'timeout_default');
      return null;
    }
    const hit: PlayAction | null = LlmDecisionClient.cachedPlay;
    if (hit !== null) {
      LlmDecisionClient.emitApply('play', hit);
      return hit;
    }
    const src: LlmReportSource = LlmDecisionClient.lastSource === 'cloud_llm'
      ? 'local_policy' : LlmDecisionClient.lastSource;
    LlmDecisionClient.emitFallback('play', src);
    return null;
  }

  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecideChallenge(_info: AiInfoSet): ChallengeAction | null {
    if (!LlmDecisionClient.chalReady) {
      LlmDecisionClient.emitFallback('challenge', 'timeout_default');
      return null;
    }
    const hit: ChallengeAction | null = LlmDecisionClient.cachedChallenge;
    if (hit !== null) {
      LlmDecisionClient.emitApply('challenge', hit);
      return hit;
    }
    const src: LlmReportSource = LlmDecisionClient.lastSource === 'cloud_llm'
      ? 'local_policy' : LlmDecisionClient.lastSource;
    LlmDecisionClient.emitFallback('challenge', src);
    return null;
  }

  /** Async play decision. null → caller uses PlayPolicy. */
  static async decidePlayAsync(info: AiInfoSet): Promise<PlayAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'play');
    if (content === null) {
      return null;
    }
    const parsed: PlayAction | null = LlmDecisionClient.parsePlay(content, info);
    if (parsed === null) {
      LlmDecisionClient.lastSource = 'parse_fail';
      Logger.warn(TAG, 'llm_fallback kind=play source=parse_fail');
      return null;
    }
    LlmDecisionClient.lastSource = 'cloud_llm';
    return parsed;
  }

  /** Async challenge decision. null → caller uses ChallengePolicy. */
  static async decideChallengeAsync(info: AiInfoSet): Promise<ChallengeAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'challenge');
    if (content === null) {
      return null;
    }
    const parsed: ChallengeAction | null = LlmDecisionClient.parseChallenge(content, info);
    if (parsed === null) {
      LlmDecisionClient.lastSource = 'parse_fail';
      Logger.warn(TAG, 'llm_fallback kind=challenge source=parse_fail');
      return null;
    }
    LlmDecisionClient.lastSource = 'cloud_llm';
    return parsed;
  }

  /**
   * §1.2 user 投影：只 self.handRanks；seats 无他座 handRanks；近 6 条公开短日志。
   * 禁止注入 undealt / 他座手牌。
   */
  static formatInfoSet(info: AiInfoSet, kind: LlmKind = 'play'): string {
    const lines: string[] = [];
    const gate: string = LlmDecisionClient.gateLabel(info, kind);
    lines.push('decision: ' + kind);
    lines.push('gate: ' + gate);
    lines.push('self: seatId=' + info.self.seatId +
      ' handRanks=[' + info.self.handRanks.join(',') + ']' +
      ' handCount=' + info.self.handCount +
      ' lives=' + info.self.lives);
    lines.push('claim: rank=' + info.claim.rank);
    const lp: AiPublicLastPlay | null = info.lastPlay;
    if (lp !== null) {
      const named: string = lp.namedSeatId >= 0 ? String(lp.namedSeatId) : '-';
      lines.push('lastPlay: seatId=' + lp.seatId + ' count=' + lp.count +
        ' style=' + lp.style + ' namedSeatId=' + named);
    } else {
      lines.push('lastPlay: -');
    }
    for (let i = 0; i < info.seats.length; i++) {
      const s: AiPublicSeat = info.seats[i];
      lines.push('seats: seatId=' + s.seatId + ' handCount=' + s.handCount +
        ' lives=' + s.lives + ' alive=' + s.alive);
    }
    lines.push('memory: revealedA=' + info.memory.revealedA +
      ' revealedK=' + info.memory.revealedK +
      ' revealedQ=' + info.memory.revealedQ +
      ' revealedJoker=' + info.memory.revealedJoker +
      ' publicPlayTotal=' + info.memory.publicPlayTotal);
    lines.push('phase=' + info.phase +
      ' aliveCount=' + info.aliveCount +
      ' forceChallenge2=' + info.forceChallenge2 +
      ' turnWindow=' + info.turnWindow +
      ' canChallenge=' + info.canChallenge +
      ' maxPlay=' + info.limits.maxPlay);
    lines.push('params: personaId=' + info.personaId +
      ' aggression=' + info.params.aggression +
      ' caution=' + info.params.caution +
      ' bluffTendency=' + info.params.bluffTendency +
      ' challengeSensitivity=' + info.params.challengeSensitivity);
    lines.push('log:');
    const logs: string[] = LlmDecisionClient.shortLogs(info);
    if (logs.length === 0) {
      lines.push('- (none)');
    } else {
      for (let i = 0; i < logs.length; i++) {
        lines.push('- ' + logs[i]);
      }
    }
    // SYSTEM_PROMPT kept for schema/docs; cloud server owns system. Touch marker:
    if (SYSTEM_PROMPT.length < 0) {
      lines.push('unused');
    }
    return lines.join('\n');
  }

  /** D1 play；D4 force；D5 CHALLENGE_ONLY/EMPTY_SAFE；D3 HandEmptyGate≥3 近似；其余 D2。 */
  static gateLabel(info: AiInfoSet, kind: LlmKind): string {
    if (kind === 'play') {
      return 'D1';
    }
    if (info.forceChallenge2) {
      return 'D4';
    }
    if (info.turnWindow === 'CHALLENGE_ONLY') {
      return 'D5';
    }
    if (info.turnWindow === 'EMPTY_SAFE') {
      return 'D3';
    }
    return 'D2';
  }

  private static shortLogs(info: AiInfoSet): string[] {
    const out: string[] = [];
    const reveals: AiRevealRec[] = info.history.reveals;
    const startR: number = reveals.length > 4 ? reveals.length - 4 : 0;
    for (let i = startR; i < reveals.length; i++) {
      const r: AiRevealRec = reveals[i];
      out.push('reveal playSeat=' + r.playSeatId + ' ranks=' + r.ranks.join(',') +
        ' verdict=' + r.verdict + ' loser=' + r.loserSeatId);
    }
    const outs = info.history.challengeOutcomes;
    const startC: number = outs.length > 2 ? outs.length - 2 : 0;
    for (let i = startC; i < outs.length; i++) {
      const c = outs[i];
      out.push('chalOut challenger=' + c.challenger + ' target=' + c.target + ' ok=' + c.success);
    }
    if (info.lastPlay !== null && out.length < 6) {
      const lp: AiPublicLastPlay = info.lastPlay;
      out.push('lastPlay seat=' + lp.seatId + ' count=' + lp.count + ' style=' + lp.style);
    }
    if (out.length > 6) {
      return out.slice(out.length - 6);
    }
    return out;
  }


  private static currentMatchId(): string {
    return LlmDecisionClient.lastMatchId;
  }

  private static summarizePlay(action: PlayAction): string {
    return 'PLAY count=' + String(action.cardIds.length) + ' style=' + action.style;
  }

  private static summarizeChallenge(action: ChallengeAction): string {
    return 'CHALLENGE intent=' + action.type;
  }

  private static nextRequestId(kind: LlmKind): string {
    LlmDecisionClient.reqSeq = LlmDecisionClient.reqSeq + 1;
    return 'llm_' + kind + '_' + String(Date.now()) + '_' + String(LlmDecisionClient.reqSeq);
  }

  /**
   * POST cloud /api/v1/llm/decide（Bearer=登录 token）。
   * 永不 hilog Key/Bearer。路径未通时 llm_http 打失败即可。
   */
  private static async requestContent(info: AiInfoSet, kind: LlmKind): Promise<string | null> {
    const token: string = AuthStore.tokenNow();
    if (token.length === 0) {
      LlmDecisionClient.lastSource = 'no_ready';
      Logger.info(TAG, 'llm_no_auth_token → Policy kind=' + kind);
      return null;
    }
    const url: string = LlmApiConfig.getDecideUrl();
    const timeoutMs: number = LlmApiConfig.DECIDE_TIMEOUT_MS;
    const requestId: string = LlmDecisionClient.nextRequestId(kind);
    LlmDecisionClient.lastRequestId = requestId;
    LlmDecisionClient.lastKind = kind;
    LlmDecisionClient.lastHttpCode = 0;
    LlmDecisionClient.lastLatencyMs = 0;
    const userText: string = LlmDecisionClient.formatInfoSet(info, kind);
    const seatId: number = info.self.seatId;
    const matchId: string = LlmDecisionClient.currentMatchId();
    const bodyObj: LlmDecideRequestBody = {
      request_id: requestId,
      kind: kind,
      seat_id: seatId,
      match_id: matchId,
      user_text: userText,
      timeout_ms: timeoutMs
    };
    const body: string = JSON.stringify(bodyObj);
    let client: http.HttpRequest | null = null;
    const t0: number = Date.now();
    try {
      client = http.createHttp();
      // Visible "about to POST" so console 0-req RCA can prove whether HTTP left device.
      Logger.info(TAG, 'llm_post kind=' + kind + ' request_id=' + requestId +
        ' seat_id=' + String(seatId) + ' match_id=' + matchId +
        ' timeout_ms=' + String(timeoutMs));
      const resp: http.HttpResponse = await client.request(url, {
        method: http.RequestMethod.POST,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        extraData: body,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        expectDataType: http.HttpDataType.STRING
      });
      const code: number = resp.responseCode;
      const latency: number = Date.now() - t0;
      LlmDecisionClient.lastHttpCode = code;
      LlmDecisionClient.lastLatencyMs = latency;
      Logger.info(TAG, 'llm_http kind=' + kind + ' code=' + code +
        ' latency_ms=' + String(latency) + ' request_id=' + requestId);
      if (code < 200 || code >= 300) {
        LlmDecisionClient.lastSource = 'http_error';
        Logger.warn(TAG, 'llm_fallback kind=' + kind + ' source=http_error code=' + code);
        return null;
      }
      const raw: string = LlmDecisionClient.responseToString(resp.result);
      if (raw.length === 0) {
        LlmDecisionClient.lastSource = 'http_error';
        Logger.warn(TAG, 'llm_empty kind=' + kind);
        return null;
      }
      const content: string | null = LlmDecisionClient.extractCloudContent(raw);
      if (content === null) {
        LlmDecisionClient.lastSource = 'parse_fail';
        Logger.warn(TAG, 'llm_fallback kind=' + kind + ' source=parse_fail reason=no_content');
        return null;
      }
      return content;
    } catch (_err) {
      const latency: number = Date.now() - t0;
      LlmDecisionClient.lastLatencyMs = latency;
      LlmDecisionClient.lastSource = 'http_error';
      Logger.warn(TAG, 'llm_http kind=' + kind + ' code=0 latency_ms=' + String(latency) +
        ' request_id=' + requestId + ' err=timeout_or_net');
      Logger.warn(TAG, 'llm_fallback kind=' + kind + ' source=http_error');
      return null;
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) {
          // ignore destroy errors
        }
      }
    }
  }

  private static emitApply(kind: LlmKind, action: PlayAction | ChallengeAction): void {
    let summary: string = '';
    if (kind === 'play') {
      summary = LlmDecisionClient.summarizePlay(action as PlayAction);
    } else {
      summary = LlmDecisionClient.summarizeChallenge(action as ChallengeAction);
    }
    LlmDecisionClient.lastActionSummary = summary;
    Logger.info(TAG, 'llm_apply source=cloud_llm kind=' + kind + ' ' + summary +
      ' request_id=' + LlmDecisionClient.lastRequestId +
      ' latency_ms=' + String(LlmDecisionClient.lastLatencyMs));
    LlmDecisionClient.fireReport(true, 'cloud_llm');
  }

  private static emitFallback(kind: LlmKind, source: LlmReportSource): void {
    const summary: string = 'FALLBACK source=' + source;
    LlmDecisionClient.lastActionSummary = summary;
    Logger.info(TAG, 'llm_fallback kind=' + kind + ' source=' + source +
      ' request_id=' + LlmDecisionClient.lastRequestId +
      ' latency_ms=' + String(LlmDecisionClient.lastLatencyMs) +
      ' http_code=' + String(LlmDecisionClient.lastHttpCode));
    LlmDecisionClient.fireReport(false, source);
  }

  /** Fire-and-forget POST /api/v1/llm/report. Never logs Bearer. */
  private static fireReport(applied: boolean, source: LlmReportSource): void {
    const key: string = LlmDecisionClient.cacheKey + '|' + source + '|' + String(applied);
    if (LlmDecisionClient.reportedKey === key) {
      return;
    }
    LlmDecisionClient.reportedKey = key;
    const token: string = AuthStore.tokenNow();
    if (token.length === 0) {
      Logger.info(TAG, 'llm_report skipped reason=no_auth_token source=' + source);
      return;
    }
    let requestId: string = LlmDecisionClient.lastRequestId;
    if (requestId.length === 0) {
      requestId = LlmDecisionClient.nextRequestId(LlmDecisionClient.lastKind);
    }
    let summary: string = LlmDecisionClient.lastActionSummary;
    if (summary.length === 0) {
      summary = applied ? 'cloud_llm' : ('FALLBACK source=' + source);
    }
    const bodyObj: LlmReportRequestBody = {
      request_id: requestId,
      kind: LlmDecisionClient.lastKind,
      applied: applied,
      source: source,
      action_summary: summary
    };
    const body: string = JSON.stringify(bodyObj);
    const url: string = LlmApiConfig.getReportUrl();
    const timeoutMs: number = LlmApiConfig.DECIDE_TIMEOUT_MS;
    LlmDecisionClient.postReport(url, token, body, timeoutMs, source, applied);
  }

  private static postReport(url: string, token: string, body: string, timeoutMs: number,
    source: string, applied: boolean): void {
    const run = async (): Promise<void> => {
      let client: http.HttpRequest | null = null;
      try {
        client = http.createHttp();
        const resp: http.HttpResponse = await client.request(url, {
          method: http.RequestMethod.POST,
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          extraData: body,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
          expectDataType: http.HttpDataType.STRING
        });
        Logger.info(TAG, 'llm_report ok applied=' + String(applied) + ' source=' + source +
          ' code=' + String(resp.responseCode));
      } catch (_err) {
        Logger.warn(TAG, 'llm_report fail source=' + source + ' applied=' + String(applied));
      } finally {
        if (client !== null) {
          try {
            client.destroy();
          } catch (_e) {
            // ignore
          }
        }
      }
    };
    run().catch((): void => {
      Logger.warn(TAG, 'llm_report fail source=' + source);
    });
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
    } catch (_e) {
      return '';
    }
  }

  /** Cloud envelope: top-level `content` string (decision JSON). */
  private static extractCloudContent(raw: string): string | null {
    let root: Object;
    try {
      root = JSON.parse(raw) as Object;
    } catch (_e) {
      Logger.warn(TAG, 'llm_bad_json root');
      return null;
    }
    const o: Record<string, Object> = root as Record<string, Object>;
    const contentRaw: Object | undefined = o['content'];
    if (typeof contentRaw === 'string' && (contentRaw as string).length > 0) {
      return contentRaw as string;
    }
    // Tolerate nested data.content
    const dataRaw: Object | undefined = o['data'];
    if (dataRaw !== undefined && typeof dataRaw === 'object' && dataRaw !== null &&
      !(dataRaw instanceof Array)) {
      const data: Record<string, Object> = dataRaw as Record<string, Object>;
      const nested: Object | undefined = data['content'];
      if (typeof nested === 'string' && (nested as string).length > 0) {
        return nested as string;
      }
    }
    return null;
  }

  /** §2 play envelope → PlayAction；越权/越界/缺字段 → null。 */
  static parsePlay(content: string, info: AiInfoSet): PlayAction | null {
    const obj: Record<string, Object> | null = LlmDecisionClient.parseEnvelope(content);
    if (obj === null) {
      return null;
    }
    const kindRaw: Object | undefined = obj['kind'];
    if (typeof kindRaw !== 'string' || (kindRaw as string) !== 'play') {
      Logger.warn(TAG, 'llm_bad_json kind≠play');
      return null;
    }
    const playRaw: Object | undefined = obj['play'];
    if (playRaw === undefined || typeof playRaw !== 'object' || playRaw === null || playRaw instanceof Array) {
      Logger.warn(TAG, 'llm_bad_json missing play');
      return null;
    }
    if (LlmDecisionClient.hasForbidden(playRaw as Record<string, Object>)) {
      Logger.warn(TAG, 'llm_out_of_scope nested play');
      return null;
    }
    const play: Record<string, Object> = playRaw as Record<string, Object>;
    const idxRaw: Object | undefined = play['cardIndexes'];
    if (idxRaw === undefined || !(idxRaw instanceof Array)) {
      Logger.warn(TAG, 'llm_illegal_play no cardIndexes');
      return null;
    }
    const idxArr: Object[] = idxRaw as Object[];
    const maxPlay: number = info.limits.maxPlay > 0 ? info.limits.maxPlay : 3;
    const handLen: number = info.self.cards.length;
    if (idxArr.length < 1 || idxArr.length > maxPlay) {
      Logger.warn(TAG, 'llm_illegal_play count');
      return null;
    }
    const countRaw: Object | undefined = play['count'];
    if (typeof countRaw === 'number' && isFinite(countRaw as number)) {
      if (Math.floor(countRaw as number) !== idxArr.length) {
        Logger.warn(TAG, 'llm_illegal_play count≠indexes');
        return null;
      }
    }
    const seen: Record<string, boolean> = {};
    const cardIds: string[] = [];
    for (let i = 0; i < idxArr.length; i++) {
      if (typeof idxArr[i] !== 'number' || !isFinite(idxArr[i] as number)) {
        Logger.warn(TAG, 'llm_illegal_play idx type');
        return null;
      }
      const ix: number = Math.floor(idxArr[i] as number);
      if (ix < 0 || ix >= handLen) {
        Logger.warn(TAG, 'llm_illegal_play idx OOB');
        return null;
      }
      const sk: string = String(ix);
      if (seen[sk]) {
        Logger.warn(TAG, 'llm_illegal_play dup idx');
        return null;
      }
      seen[sk] = true;
      cardIds.push(info.self.cards[ix].cardId);
    }
    let style: string = 'SOFT';
    const styleRaw: Object | undefined = play['style'];
    if (typeof styleRaw === 'string') {
      const st: string = styleRaw as string;
      if (st !== 'SOFT' && st !== 'SLAM' && st !== 'HESITATE') {
        Logger.warn(TAG, 'llm_bad_json style');
        return null;
      }
      style = st;
    }
    let namedSeatId: number = -1;
    const namedRaw: Object | undefined = play['namedSeatId'];
    if (namedRaw !== undefined && namedRaw !== null) {
      if (typeof namedRaw !== 'number' || !isFinite(namedRaw as number)) {
        Logger.warn(TAG, 'llm_bad_json namedSeatId');
        return null;
      }
      namedSeatId = Math.floor(namedRaw as number);
    }
    const out: PlayAction = {
      type: 'PLAY',
      cardIds: cardIds,
      style: style,
      namedSeatId: namedSeatId,
      speech: '',
      thinkMs: 0
    };
    return out;
  }

  /** §2 challenge envelope → ChallengeAction；越权/非法 intent/D4 非 DOUBT → null。 */
  static parseChallenge(content: string, info: AiInfoSet): ChallengeAction | null {
    const obj: Record<string, Object> | null = LlmDecisionClient.parseEnvelope(content);
    if (obj === null) {
      return null;
    }
    const kindRaw: Object | undefined = obj['kind'];
    if (typeof kindRaw !== 'string' || (kindRaw as string) !== 'challenge') {
      Logger.warn(TAG, 'llm_bad_json kind≠challenge');
      return null;
    }
    const chalRaw: Object | undefined = obj['challenge'];
    if (chalRaw === undefined || typeof chalRaw !== 'object' || chalRaw === null || chalRaw instanceof Array) {
      Logger.warn(TAG, 'llm_bad_json missing challenge');
      return null;
    }
    if (LlmDecisionClient.hasForbidden(chalRaw as Record<string, Object>)) {
      Logger.warn(TAG, 'llm_out_of_scope nested challenge');
      return null;
    }
    const chal: Record<string, Object> = chalRaw as Record<string, Object>;
    const intentRaw: Object | undefined = chal['intent'];
    if (typeof intentRaw !== 'string') {
      Logger.warn(TAG, 'llm_bad_json intent');
      return null;
    }
    let intent: string = intentRaw as string;
    if (intent !== 'DOUBT' && intent !== 'BELIEVE' && intent !== 'SKIP') {
      Logger.warn(TAG, 'llm_bad_json intent value');
      return null;
    }
    const gate: string = LlmDecisionClient.gateLabel(info, 'challenge');
    if (gate === 'D4') {
      if (intent !== 'DOUBT') {
        Logger.warn(TAG, 'llm_illegal D4 intent≠DOUBT');
        return null;
      }
    } else if (gate === 'D5') {
      if (intent !== 'DOUBT' && intent !== 'SKIP') {
        Logger.warn(TAG, 'llm_illegal D5 intent');
        return null;
      }
    } else {
      // D2 / D3: DOUBT | BELIEVE；若模型给 SKIP 且窗口非 CHALLENGE_ONLY → 丢弃
      if (intent === 'SKIP') {
        Logger.warn(TAG, 'llm_illegal D2/D3 SKIP');
        return null;
      }
    }
    // MatchDirector: ch.type==='DOUBT' 才质疑；BELIEVE/SKIP 走非质疑路径
    const out: ChallengeAction = { type: intent, thinkMs: 0 };
    return out;
  }

  /** Parse JSON object; reject forbidden top-level keys; require schemaVersion===1. */
  private static parseEnvelope(content: string): Record<string, Object> | null {
    const obj: Record<string, Object> | null = LlmDecisionClient.parseJsonObject(content);
    if (obj === null) {
      Logger.warn(TAG, 'llm_bad_json');
      return null;
    }
    if (LlmDecisionClient.hasForbidden(obj)) {
      Logger.warn(TAG, 'llm_out_of_scope');
      return null;
    }
    const verRaw: Object | undefined = obj['schemaVersion'];
    if (typeof verRaw !== 'number' || Math.floor(verRaw as number) !== 1) {
      Logger.warn(TAG, 'llm_bad_json schemaVersion');
      return null;
    }
    return obj;
  }

  private static hasForbidden(obj: Record<string, Object>): boolean {
    for (let i = 0; i < FORBIDDEN_KEYS.length; i++) {
      if (obj[FORBIDDEN_KEYS[i]] !== undefined) {
        return true;
      }
    }
    return false;
  }

  private static parseJsonObject(content: string): Record<string, Object> | null {
    let text: string = content.trim();
    if (text.indexOf('```') >= 0) {
      const start: number = text.indexOf('{');
      const end: number = text.lastIndexOf('}');
      if (start < 0 || end <= start) {
        return null;
      }
      text = text.substring(start, end + 1);
    }
    try {
      const parsed: Object = JSON.parse(text) as Object;
      if (typeof parsed !== 'object' || parsed === null || parsed instanceof Array) {
        return null;
      }
      return parsed as Record<string, Object>;
    } catch (_e) {
      return null;
    }
  }
}
