import { BusinessError } from '@kit.BasicServicesKit';
import { router } from '@kit.ArkUI';
import { PageUrls } from './Ids';
import { Logger } from './Logger';

/**
 * 离桌路由的一次性结算：replace 成功 / 失败转 back / 超时，三者谁先到谁生效，其余迟到结果只打日志（负责人 #12）。
 */
class RouteOnce {
  done: boolean = false;
  timerId: number = -1;
  private resolveFn: (ok: boolean) => void;

  constructor(resolveFn: (ok: boolean) => void) {
    this.resolveFn = resolveFn;
  }

  settle(ok: boolean, via: string): boolean {
    if (this.done) {
      Logger.warn('LbRouter', `toLobbyOrBack: late ${via} ignored (already settled)`);
      return false;
    }
    this.done = true;
    if (this.timerId >= 0) {
      clearTimeout(this.timerId);
      this.timerId = -1;
    }
    this.resolveFn(ok);
    return true;
  }
}

/**
 * 一趟离局 replace（负责人补丁轮 2）。ticket = 离局请求编号（令牌），随 replaceUrl 的 params 带进大厅；
 * issuedAtMs 用来判「在途超过 LEAVE_ROUTE_TIMEOUT_MS 就作废」。
 */
class LeaveTrip {
  ticket: number;
  issuedAtMs: number;
  nav: Promise<void>;

  constructor(ticket: number, issuedAtMs: number, nav: Promise<void>) {
    this.ticket = ticket;
    this.issuedAtMs = issuedAtMs;
    this.nav = nav;
  }
}

/** 离局 replace 带给大厅的路由参数（大厅 aboutToAppear 读 lbLeaveTicket 认令牌）。 */
export class LeaveRouteParams {
  lbLeaveTicket: number = 0;
}

export class LbRouter {
  /** 离桌路由超时（负责人 #12）：超时按失败走 Table.releaseLeaveLock 兜底（局面不拆、解锁）。 */
  static readonly LEAVE_ROUTE_TIMEOUT_MS: number = 3000;
  /**
   * 大厅交接窗（负责人补丁轮 2）：令牌已用掉的离局会话里，持有大厅音频的大厅被移走时，最多等这么久让后落地的
   * 「只渲染」大厅接手 LobbyAudio（不 release、不重起 BGM）；窗内没人接手就照常释放。
   */
  static readonly LOBBY_HANDOVER_MS: number = 1000;
  /**
   * 在途的离局 replace（路由层还没回结果）。未满 LEAVE_ROUTE_TIMEOUT_MS 再次离局 → 复用同一趟；
   * 超过即作废（负责人补丁轮 2）：下次离局（玩家再次确认）重新发 replaceUrl。作废那趟迟到成功只会落一个「只渲染」大厅。
   */
  private static leaveTrip: LeaveTrip | null = null;
  /** 最后发出的离局请求编号（令牌）。 */
  private static leaveSeq: number = 0;
  /** 离局会话 = 一次进桌（toTable 时 +1）；会话首个令牌编号。 */
  private static leaveSession: number = 0;
  private static sessionFloor: number = 1;
  /** 本会话离局终态（停导演 / 引擎回 LOBBY）已放行的会话号：Table 已销毁后老趟迟到成功也不会第二次收尾。 */
  private static finishedSession: number = -1;
  /** 本会话大厅令牌已被哪个会话用掉（先落地的大厅跑初始化，后落地的只渲染）。 */
  private static lobbyTokenSession: number = -1;
  private static lobbyKeySeq: number = 0;
  /** 当前持有 LobbyAudio 的大厅实例（0 = 无）。 */
  private static lobbyAudioOwner: number = 0;
  private static handoverTimer: number = -1;
  /** 已发出、路由层还没回结果的离局 replace 趟数（含已作废的老趟；补丁轮 3，只用于 toTable 打日志）。 */
  private static tripsInFlight: number = 0;

  static toTable(): void {
    if (LbRouter.tripsInFlight > 0) {
      // 补丁轮 3（已知限制 L1 真机排查用）：还有离局 replace 没回结果就进新局——它迟到落地会把新 Table 换成大厅。
      Logger.warn('LbRouter', `toTable: ${LbRouter.tripsInFlight} leave replace(s) still in flight (last ticket #${LbRouter.leaveSeq}) — a late landing would swap the new table for the lobby`);
    }
    LbRouter.beginLeaveSession();
    LbRouter.push(PageUrls.TABLE);
  }

  /** 进桌 = 新离局会话：上一局的令牌全部过期。 */
  private static beginLeaveSession(): void {
    LbRouter.leaveSession = LbRouter.leaveSession + 1;
    LbRouter.sessionFloor = LbRouter.leaveSeq + 1;
  }

  /**
   * 离局终态令牌（负责人补丁轮 2）：每个离局会话只放行一次。Table.finishLeaveOnce 只认它——
   * 两趟 replace 先后都成功（或老趟在 Table 销毁后才迟到）时，不重复停导演 / 不重复回 LOBBY / 不重复释放桌音。
   */
  static claimLeaveFinish(): boolean {
    if (LbRouter.finishedSession === LbRouter.leaveSession) {
      Logger.warn('LbRouter', `leave finish already done for session ${LbRouter.leaveSession} — skipped`);
      return false;
    }
    LbRouter.finishedSession = LbRouter.leaveSession;
    return true;
  }

  /**
   * 大厅令牌（负责人补丁轮 2）：大厅 aboutToAppear 先调。true = 本实例跑初始化；
   * false = 本离局会话的令牌已被先落地的大厅用掉（另一趟离局 replace 迟到成功又落了一个大厅）→ 只渲染。
   * 无令牌（冷启动 / 结算回大厅）或上一局的令牌 → 照常初始化。
   */
  static claimLobbyInit(ticket: number): boolean {
    const ours: boolean = ticket >= LbRouter.sessionFloor && ticket <= LbRouter.leaveSeq;
    if (ours && LbRouter.lobbyTokenSession === LbRouter.leaveSession) {
      Logger.warn('LbRouter', `lobby token of leave #${ticket} already used — render only (no init, no BGM restart)`);
      return false;
    }
    LbRouter.lobbyTokenSession = LbRouter.leaveSession;
    return true;
  }

  /** 读本页路由参数里的离局令牌（无 = 0）。 */
  static leaveTicketFromRoute(): number {
    try {
      const raw: Object | undefined = router.getParams();
      if (raw === undefined || raw === null) {
        return 0;
      }
      const p: LeaveRouteParams = raw as LeaveRouteParams;
      const t: number = Number(p.lbLeaveTicket);
      return Number.isInteger(t) && t > 0 ? t : 0;
    } catch (e) {
      return 0;
    }
  }

  /** 大厅实例出现：登记实例号；初始化的实例与只渲染的实例都成为 LobbyAudio 持有者（只渲染 = 接手上一个大厅的音频）。 */
  static lobbyAppeared(initialized: boolean): number {
    LbRouter.lobbyKeySeq = LbRouter.lobbyKeySeq + 1;
    const key: number = LbRouter.lobbyKeySeq;
    if (LbRouter.handoverTimer >= 0) {
      clearTimeout(LbRouter.handoverTimer);
      LbRouter.handoverTimer = -1;
    }
    LbRouter.lobbyAudioOwner = key;
    Logger.info('LbRouter', `lobby #${key} appeared (${initialized ? 'init' : 'render only — audio handed over'})`);
    return key;
  }

  /**
   * 大厅实例被移走：不是持有者 → 音频已交给后落地的只渲染大厅，不释放；
   * 本会话令牌已用掉且发过 ≥2 趟离局（另一趟的大厅可能正落地）→ 挂起释放 LOBBY_HANDOVER_MS，窗内有大厅接手即取消；
   * 其余 → 立刻释放（与改前一致）。
   */
  static lobbyDisappearing(key: number, release: () => void): void {
    if (LbRouter.lobbyAudioOwner !== key) {
      Logger.info('LbRouter', `lobby #${key} gone — audio already handed to lobby #${LbRouter.lobbyAudioOwner}, no release`);
      return;
    }
    const trips: number = LbRouter.leaveSeq - LbRouter.sessionFloor + 1;
    if (trips >= 2 && LbRouter.lobbyTokenSession === LbRouter.leaveSession) {
      if (LbRouter.handoverTimer >= 0) {
        clearTimeout(LbRouter.handoverTimer);
      }
      LbRouter.handoverTimer = setTimeout((): void => {
        LbRouter.handoverTimer = -1;
        if (LbRouter.lobbyAudioOwner === key) {
          LbRouter.lobbyAudioOwner = 0;
          release();
        }
      }, LbRouter.LOBBY_HANDOVER_MS);
      return;
    }
    LbRouter.lobbyAudioOwner = 0;
    release();
  }

  /** Frozen: Section 2 AwaitChallenge is in-table. Do not push lb_scr_challenge. */
  static toChallenge(): void {
    Logger.warn('LbRouter', 'toChallenge frozen — AwaitChallenge is in-table (Section 2)');
  }

  static toReport(): void {
    LbRouter.push(PageUrls.REPORT);
  }

  /**
   * PR-A 大厅「战绩」入口：同一 Report 页，phase=LOBBY 时走战绩空态，
   * 不播结算输赢音效（真战绩列表 PR-B 接 RecordStore）。
   */
  static toRecords(): void {
    LbRouter.push(PageUrls.REPORT);
  }

  /** F3: table → lobby. replaceUrl; fall back to back() inside replace(). */
  static toLobby(): void {
    LbRouter.replace(PageUrls.LOBBY);
  }

  /**
   * PR-B 离桌路由（Table 离局锁用，负责人裁定「锁不许死在路由失败上」）：
   * ① replaceUrl 大厅 → ② 失败（reject / 同步抛错）退 router.back()（页栈只剩本页也算失败）→ ③ 再失败返回 false。
   * 整体超时 LEAVE_ROUTE_TIMEOUT_MS（3000）按失败返回 false；超时与成功 / 失败竞态只生效一次（RouteOnce），
   * 已超时后 replace 才失败时不再补 back()，避免解锁后又跳页。Report 等其它页仍用 toLobby()。
   * 补丁轮 2：只在玩家再次确认离开时（Table.goHome）才会再进来——这里不自动重发。在途那趟已超 3000ms → 作废；
   * 重发前先看栈顶：已不是 Table（老趟其实已把页面换走）→ 不再发 replace，直接按成功收尾（finishLeaveOnce）。
   */
  static toLobbyOrBack(timeoutMs: number = LbRouter.LEAVE_ROUTE_TIMEOUT_MS): Promise<boolean> {
    return new Promise<boolean>((resolve: (ok: boolean) => void): void => {
      const once: RouteOnce = new RouteOnce(resolve);
      once.timerId = setTimeout((): void => {
        if (!once.done) {
          Logger.error('LbRouter', `toLobbyOrBack: timed out after ${timeoutMs}ms — treat as failure`);
        }
        once.settle(false, 'timeout');
      }, timeoutMs);
      try {
        const now: number = Date.now();
        let trip: LeaveTrip | null = LbRouter.leaveTrip;
        if (trip !== null && now - trip.issuedAtMs >= timeoutMs) {
          Logger.warn('LbRouter', `toLobbyOrBack: leave #${trip.ticket} in flight ${now - trip.issuedAtMs}ms ≥ ${timeoutMs}ms — voided, new replaceUrl`);
          LbRouter.leaveTrip = null;
          trip = null;
          if (!LbRouter.tableOnTop()) {
            Logger.warn('LbRouter', 'toLobbyOrBack: top page is no longer Table — no second replace, finish the leave');
            once.settle(true, 'top-not-table');
            return;
          }
        }
        if (trip === null) {
          LbRouter.leaveSeq = LbRouter.leaveSeq + 1;
          const params: LeaveRouteParams = new LeaveRouteParams();
          params.lbLeaveTicket = LbRouter.leaveSeq;
          const started: Promise<void> = router.replaceUrl({ url: PageUrls.LOBBY, params: params });
          const issued: LeaveTrip = new LeaveTrip(LbRouter.leaveSeq, now, started);
          LbRouter.leaveTrip = issued;
          LbRouter.tripsInFlight = LbRouter.tripsInFlight + 1;
          started.then((): void => {
            LbRouter.clearTrip(issued);
          }, (): void => {
            LbRouter.clearTrip(issued);
          });
          trip = issued;
        } else {
          Logger.warn('LbRouter', `toLobbyOrBack: leave #${trip.ticket} still in flight (< ${timeoutMs}ms) — wait on it (no second route)`);
        }
        const ticket: number = trip.ticket;
        trip.nav.then((): void => {
          once.settle(true, `replace #${ticket}`);
        }).catch((err: BusinessError): void => {
          Logger.warn('LbRouter', `toLobbyOrBack: replace lobby #${ticket} failed: code=${err.code} ${err.message}`);
          if (once.done) {
            Logger.warn('LbRouter', 'toLobbyOrBack: replace failed after settle — no back()');
            return;
          }
          once.settle(LbRouter.tryBack(), 'back');
        });
      } catch (e) {
        const be: BusinessError = e as BusinessError;
        Logger.warn('LbRouter', `toLobbyOrBack: replace lobby threw: code=${be.code} ${be.message}`);
        once.settle(LbRouter.tryBack(), 'back');
      }
    });
  }

  private static clearTrip(trip: LeaveTrip): void {
    LbRouter.tripsInFlight = Math.max(0, LbRouter.tripsInFlight - 1);
    if (LbRouter.leaveTrip === trip) {
      LbRouter.leaveTrip = null;
    }
  }

  /** 路由栈顶是否仍是 Table（读失败按「是」处理，照常发 replace）。 */
  private static tableOnTop(): boolean {
    try {
      const st: router.RouterState = router.getState();
      const top: string = `${st.path}${st.name}`;
      return top === PageUrls.TABLE || st.name === PageUrls.TABLE || top.endsWith('/Table') || st.name === 'Table';
    } catch (e) {
      return true;
    }
  }

  /** 第二步：back()。页栈只剩本页也算失败。返回是否成功。 */
  private static tryBack(): boolean {
    try {
      if (Number(router.getLength()) <= 1) {
        Logger.error('LbRouter', 'toLobbyOrBack: back() skipped — page stack has nothing to go back to');
        return false;
      }
      router.back();
      return true;
    } catch (e) {
      const be: BusinessError = e as BusinessError;
      Logger.error('LbRouter', `toLobbyOrBack: back() failed: code=${be.code} ${be.message}`);
      return false;
    }
  }

  static replaceTable(): void {
    LbRouter.replace(PageUrls.TABLE);
  }

  static replaceReport(): void {
    LbRouter.replace(PageUrls.REPORT);
  }

  /** Frozen: Section 2 does not replace into the old four-beat page. */
  static replaceChallenge(): void {
    Logger.warn('LbRouter', 'replaceChallenge frozen — AwaitChallenge is in-table (Section 2)');
  }

  private static replace(url: string): void {
    router.replaceUrl({ url: url }).catch((err: Error) => {
      Logger.warn('LbRouter', `replace ${url} failed: ${err.message}`);
      if (url === PageUrls.LOBBY) {
        router.back();
      }
    });
  }

  static back(): void {
    router.back();
  }

  private static push(url: string): void {
    router.pushUrl({ url: url }).catch((err: Error) => {
      Logger.warn('LbRouter', `push ${url} failed: ${err.message}`);
    });
  }
}
