import http from '@ohos.net.http';
import { Logger } from '../common/Logger';
import { AiInfoSet, AiPublicLastPlay, AiPublicSeat, AiRevealRec, ChallengeAction, PlayAction } from './AiTypes';
import { LlmApiConfig } from './LlmApiConfig';

const TAG = 'LlmDecisionClient';

/**
 * 人机对局AI-LLM决策.md v0.1 §1.1 system（逐字）。
 * LLM 只填 play/challenge；Judge / PENALTY / 胜负不在此模块。
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

export type LlmKind = 'play' | 'challenge';

/** DeepSeek chat message — typed for arkts-no-untyped-obj-literals. */
interface LlmChatMessage {
  role: string;
  content: string;
}

/** DeepSeek chat-completions request body. */
interface LlmChatRequestBody {
  model: string;
  messages: LlmChatMessage[];
  temperature: number;
}

/**
 * DeepSeek chat-completions 决策客户端。
 * armPrefetch* 在 think 窗启动异步请求并缓存；tryDecide* 只读缓存（绝不同步死等 HTTP）。
 * 无 Key / 超时 / 非 2xx / 非法 JSON / 越权 / 越界 → null → PlayPolicy/ChallengePolicy。
 */
export class LlmDecisionClient {
  private static cacheKey: string = '';
  private static cachedPlay: PlayAction | null = null;
  private static cachedChallenge: ChallengeAction | null = null;
  private static playReady: boolean = false;
  private static chalReady: boolean = false;

  /** Clear prefetch cache (new arm / seat change). */
  static clearCache(): void {
    LlmDecisionClient.cacheKey = '';
    LlmDecisionClient.cachedPlay = null;
    LlmDecisionClient.cachedChallenge = null;
    LlmDecisionClient.playReady = false;
    LlmDecisionClient.chalReady = false;
  }

  /**
   * Fire-and-forget play request for the current think window.
   * key = seat|round|plays|play — stale replies ignored.
   */
  static armPrefetchPlay(info: AiInfoSet, key: string): void {
    LlmDecisionClient.cacheKey = key;
    LlmDecisionClient.cachedPlay = null;
    LlmDecisionClient.playReady = false;
    if (!LlmApiConfig.hasApiKey()) {
      Logger.info(TAG, 'llm_skip_prefetch reason=no_key kind=play');
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
        LlmDecisionClient.playReady = true;
      }
    });
  }

  /** Fire-and-forget challenge request for the current think window. */
  static armPrefetchChallenge(info: AiInfoSet, key: string): void {
    LlmDecisionClient.cacheKey = key;
    LlmDecisionClient.cachedChallenge = null;
    LlmDecisionClient.chalReady = false;
    if (!LlmApiConfig.hasApiKey()) {
      Logger.info(TAG, 'llm_skip_prefetch reason=no_key kind=challenge');
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
        LlmDecisionClient.chalReady = true;
      }
    });
  }

  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecidePlay(_info: AiInfoSet): PlayAction | null {
    if (!LlmApiConfig.hasApiKey()) {
      return null;
    }
    if (!LlmDecisionClient.playReady) {
      return null;
    }
    return LlmDecisionClient.cachedPlay;
  }

  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecideChallenge(_info: AiInfoSet): ChallengeAction | null {
    if (!LlmApiConfig.hasApiKey()) {
      return null;
    }
    if (!LlmDecisionClient.chalReady) {
      return null;
    }
    return LlmDecisionClient.cachedChallenge;
  }

  /** Async play decision. null → caller uses PlayPolicy. */
  static async decidePlayAsync(info: AiInfoSet): Promise<PlayAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'play');
    if (content === null) {
      return null;
    }
    return LlmDecisionClient.parsePlay(content, info);
  }

  /** Async challenge decision. null → caller uses ChallengePolicy. */
  static async decideChallengeAsync(info: AiInfoSet): Promise<ChallengeAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'challenge');
    if (content === null) {
      return null;
    }
    return LlmDecisionClient.parseChallenge(content, info);
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

  private static async requestContent(info: AiInfoSet, kind: LlmKind): Promise<string | null> {
    const key: string = LlmApiConfig.getApiKey();
    if (key.length === 0) {
      Logger.info(TAG, 'llm_no_key → Policy');
      return null;
    }
    const base: string = LlmApiConfig.getBaseUrl();
    const url: string = base + '/chat/completions';
    const timeoutMs: number = LlmApiConfig.getTimeoutMs();
    const userText: string = LlmDecisionClient.formatInfoSet(info, kind);
    const systemMsg: LlmChatMessage = {
      role: 'system',
      content: SYSTEM_PROMPT
    };
    const userMsg: LlmChatMessage = {
      role: 'user',
      content: userText
    };
    const messages: LlmChatMessage[] = [systemMsg, userMsg];
    const bodyObj: LlmChatRequestBody = {
      model: LlmApiConfig.getModel(),
      messages: messages,
      temperature: 0.7
    };
    const body: string = JSON.stringify(bodyObj);
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
      // Visible "about to POST" so console 0-req RCA can prove whether HTTP left device.
      Logger.info(TAG, 'llm_post kind=' + kind);
      const resp: http.HttpResponse = await client.request(url, {
        method: http.RequestMethod.POST,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        extraData: body,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        expectDataType: http.HttpDataType.STRING
      });
      const code: number = resp.responseCode;
      Logger.info(TAG, 'llm_http kind=' + kind + ' code=' + code);
      if (code < 200 || code >= 300) {
        return null;
      }
      const raw: string = LlmDecisionClient.responseToString(resp.result);
      if (raw.length === 0) {
        Logger.warn(TAG, 'llm_empty kind=' + kind);
        return null;
      }
      return LlmDecisionClient.extractMessageContent(raw);
    } catch (_err) {
      Logger.warn(TAG, 'llm_timeout_or_net kind=' + kind);
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

  private static extractMessageContent(raw: string): string | null {
    let root: Object;
    try {
      root = JSON.parse(raw) as Object;
    } catch (_e) {
      Logger.warn(TAG, 'llm_bad_json root');
      return null;
    }
    const o: Record<string, Object> = root as Record<string, Object>;
    const choicesRaw: Object | undefined = o['choices'];
    if (choicesRaw === undefined || !(choicesRaw instanceof Array)) {
      return null;
    }
    const choices: Object[] = choicesRaw as Object[];
    if (choices.length === 0) {
      return null;
    }
    const first: Record<string, Object> = choices[0] as Record<string, Object>;
    const msgRaw: Object | undefined = first['message'];
    if (msgRaw === undefined || typeof msgRaw !== 'object' || msgRaw === null) {
      return null;
    }
    const msg: Record<string, Object> = msgRaw as Record<string, Object>;
    const contentRaw: Object | undefined = msg['content'];
    if (typeof contentRaw !== 'string') {
      return null;
    }
    return contentRaw as string;
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
