import { http } from '@ohos.net.http';
import { Logger } from '../common/Logger';
import { AiInfoSet, AiPublicLastPlay, AiPublicSeat, AiRevealRec, ChallengeAction, PlayAction } from './AiTypes';
import { LlmApiConfig } from './LlmApiConfig';

const TAG = 'LlmDecisionClient';

/**
 * TODO(策划 schema)：替换系统/用户提示词与回包 JSON schema。
 * 当前为骨架占位；非法/缺字段/无 Key/网络错 → null → 调用方回落 PlayPolicy/ChallengePolicy。
 */
const TODO_SYSTEM_PROMPT: string =
  'TODO_SCHEMA: You are an NPC seat in LiarBar. Reply with ONE JSON object only. ' +
  'Play: {"type":"PLAY","cardIds":["..."],"style":"SOFT|SLAM|HESITATE","namedSeatId":-1,"speech":""}. ' +
  'Challenge: {"type":"DOUBT"|"BELIEVE"|"SKIP"}. Never judge truth or change win/loss.';

const TODO_USER_PROMPT_PREFIX: string = 'TODO_SCHEMA infoSet:\n';

export type LlmKind = 'play' | 'challenge';

/**
 * DeepSeek chat-completions 决策客户端（骨架）。
 * 同步 tryDecide*：无 Key / 骨架阶段一律 null（不阻塞 UI）。
 * 异步 request*：真实 HTTP；超时/非 2xx/非法 JSON → null。Judge/PENALTY 不在此模块。
 */
export class LlmDecisionClient {
  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecidePlay(info: AiInfoSet): PlayAction | null {
    if (!LlmApiConfig.hasApiKey()) {
      return null;
    }
    // Skeleton: Key 已加载也不在同步路径发 HTTP，避免卡 UI；等 schema 后接异步缓存。
    Logger.info(TAG, 'tryDecidePlay sync short-circuit → Policy (schema pending)');
    return null;
  }

  /** Sync short-circuit for MatchDirector.runAi — never blocks on HTTP. */
  static tryDecideChallenge(info: AiInfoSet): ChallengeAction | null {
    if (!LlmApiConfig.hasApiKey()) {
      return null;
    }
    Logger.info(TAG, 'tryDecideChallenge sync short-circuit → Policy (schema pending)');
    return null;
  }

  /** Async play decision. null → caller uses PlayPolicy. */
  static async decidePlayAsync(info: AiInfoSet): Promise<PlayAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'play');
    if (content === null) {
      return null;
    }
    return LlmDecisionClient.parsePlay(content);
  }

  /** Async challenge decision. null → caller uses ChallengePolicy. */
  static async decideChallengeAsync(info: AiInfoSet): Promise<ChallengeAction | null> {
    const content: string | null = await LlmDecisionClient.requestContent(info, 'challenge');
    if (content === null) {
      return null;
    }
    return LlmDecisionClient.parseChallenge(content);
  }

  /** Plain-text info-set serialization (placeholder until 策划 schema). */
  static formatInfoSet(info: AiInfoSet): string {
    const lines: string[] = [];
    lines.push('phase=' + info.phase + ' window=' + info.turnWindow + ' persona=' + info.personaId);
    lines.push('self.seat=' + info.self.seatId + ' lives=' + info.self.lives + ' handCount=' + info.self.handCount);
    lines.push('self.handRanks=' + info.self.handRanks.join(','));
    const cardIds: string[] = [];
    for (let i = 0; i < info.self.cards.length; i++) {
      cardIds.push(info.self.cards[i].cardId + ':' + info.self.cards[i].rank);
    }
    lines.push('self.cards=' + cardIds.join(','));
    lines.push('claim.rank=' + info.claim.rank);
    lines.push('canChallenge=' + info.canChallenge + ' forceChallenge2=' + info.forceChallenge2);
    lines.push('aliveCount=' + info.aliveCount + ' turnSecondsLeft=' + info.turnSecondsLeft);
    const lp: AiPublicLastPlay | null = info.lastPlay;
    if (lp !== null) {
      lines.push('lastPlay.seat=' + lp.seatId + ' count=' + lp.count + ' style=' + lp.style +
        ' namedSeatId=' + lp.namedSeatId);
    } else {
      lines.push('lastPlay=null');
    }
    for (let i = 0; i < info.seats.length; i++) {
      const s: AiPublicSeat = info.seats[i];
      lines.push('seat id=' + s.seatId + ' hand=' + s.handCount + ' lives=' + s.lives +
        ' alive=' + s.alive + ' human=' + s.isHuman + ' order=' + s.order);
    }
    lines.push('memory A/K/Q/J=' + info.memory.revealedA + '/' + info.memory.revealedK + '/' +
      info.memory.revealedQ + '/' + info.memory.revealedJoker + ' publicPlayTotal=' +
      info.memory.publicPlayTotal);
    for (let i = 0; i < info.history.reveals.length; i++) {
      const r: AiRevealRec = info.history.reveals[i];
      lines.push('reveal playSeat=' + r.playSeatId + ' ranks=' + r.ranks.join(',') +
        ' verdict=' + r.verdict + ' loser=' + r.loserSeatId);
    }
    for (let i = 0; i < info.history.challengeOutcomes.length; i++) {
      const c = info.history.challengeOutcomes[i];
      lines.push('chalOut challenger=' + c.challenger + ' target=' + c.target + ' ok=' + c.success);
    }
    return lines.join('\n');
  }

  private static async requestContent(info: AiInfoSet, kind: LlmKind): Promise<string | null> {
    const key: string = LlmApiConfig.getApiKey();
    if (key.length === 0) {
      return null;
    }
    const base: string = LlmApiConfig.getBaseUrl();
    const url: string = base + '/chat/completions';
    const timeoutMs: number = LlmApiConfig.getTimeoutMs();
    const userText: string = TODO_USER_PROMPT_PREFIX + LlmDecisionClient.formatInfoSet(info) +
      '\nkind=' + kind;
    const bodyObj: Record<string, Object> = {
      'model': LlmApiConfig.getModel(),
      'messages': [
        { 'role': 'system', 'content': TODO_SYSTEM_PROMPT } as Object,
        { 'role': 'user', 'content': userText } as Object
      ] as Object,
      'temperature': 0.7 as Object
    };
    const body: string = JSON.stringify(bodyObj);
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
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
      if (code < 200 || code >= 300) {
        Logger.warn(TAG, 'llm http non-2xx code=' + code + ' kind=' + kind);
        return null;
      }
      const raw: string = LlmDecisionClient.responseToString(resp.result);
      if (raw.length === 0) {
        Logger.warn(TAG, 'llm empty body kind=' + kind);
        return null;
      }
      return LlmDecisionClient.extractMessageContent(raw);
    } catch (_err) {
      Logger.warn(TAG, 'llm request fail-soft kind=' + kind);
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
      Logger.warn(TAG, 'llm root JSON parse fail');
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

  private static parsePlay(content: string): PlayAction | null {
    const obj: Record<string, Object> | null = LlmDecisionClient.parseJsonObject(content);
    if (obj === null) {
      return null;
    }
    const typeRaw: Object | undefined = obj['type'];
    if (typeof typeRaw === 'string' && (typeRaw as string) !== 'PLAY') {
      return null;
    }
    const idsRaw: Object | undefined = obj['cardIds'];
    if (idsRaw === undefined || !(idsRaw instanceof Array)) {
      return null;
    }
    const idsArr: Object[] = idsRaw as Object[];
    const cardIds: string[] = [];
    for (let i = 0; i < idsArr.length; i++) {
      if (typeof idsArr[i] !== 'string') {
        return null;
      }
      cardIds.push(idsArr[i] as string);
    }
    if (cardIds.length === 0) {
      return null;
    }
    let style: string = 'SOFT';
    const styleRaw: Object | undefined = obj['style'];
    if (typeof styleRaw === 'string' && (styleRaw as string).length > 0) {
      style = styleRaw as string;
    }
    let namedSeatId: number = -1;
    const namedRaw: Object | undefined = obj['namedSeatId'];
    if (typeof namedRaw === 'number' && isFinite(namedRaw as number)) {
      namedSeatId = Math.floor(namedRaw as number);
    }
    let speech: string = '';
    const speechRaw: Object | undefined = obj['speech'];
    if (typeof speechRaw === 'string') {
      speech = speechRaw as string;
    }
    const out: PlayAction = {
      type: 'PLAY',
      cardIds: cardIds,
      style: style,
      namedSeatId: namedSeatId,
      speech: speech,
      thinkMs: 0
    };
    return out;
  }

  private static parseChallenge(content: string): ChallengeAction | null {
    const obj: Record<string, Object> | null = LlmDecisionClient.parseJsonObject(content);
    if (obj === null) {
      return null;
    }
    const typeRaw: Object | undefined = obj['type'];
    if (typeof typeRaw !== 'string') {
      return null;
    }
    const t: string = typeRaw as string;
    if (t !== 'DOUBT' && t !== 'BELIEVE' && t !== 'SKIP') {
      return null;
    }
    const out: ChallengeAction = { type: t, thinkMs: 0 };
    return out;
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
      Logger.warn(TAG, 'llm decision JSON parse fail');
      return null;
    }
  }
}
