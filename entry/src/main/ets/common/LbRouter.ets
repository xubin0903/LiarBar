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

export class LbRouter {
  /** 离桌路由超时（负责人 #12）：超时按失败走 Table.releaseLeaveLock 兜底（局面不拆、解锁）。 */
  static readonly LEAVE_ROUTE_TIMEOUT_MS: number = 3000;
  /**
   * 已发出、路由层还没回结果的离桌 replace（超时判失败后仍可能迟到成功）。再次离桌时复用它、不再发第二次 replace，
   * 页面只会离开一次（负责人 #12）。路由层回结果（成功或失败）即清空。
   */
  private static leaveInFlight: Promise<void> | null = null;

  static toTable(): void {
    LbRouter.push(PageUrls.TABLE);
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
        let nav: Promise<void> | null = LbRouter.leaveInFlight;
        if (nav === null) {
          const started: Promise<void> = router.replaceUrl({ url: PageUrls.LOBBY });
          LbRouter.leaveInFlight = started;
          started.then((): void => {
            LbRouter.clearInFlight(started);
          }, (): void => {
            LbRouter.clearInFlight(started);
          });
          nav = started;
        } else {
          Logger.warn('LbRouter', 'toLobbyOrBack: previous leave route still in flight — wait on it (no second route)');
        }
        nav.then((): void => {
          once.settle(true, 'replace');
        }).catch((err: BusinessError): void => {
          Logger.warn('LbRouter', `toLobbyOrBack: replace lobby failed: code=${err.code} ${err.message}`);
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

  private static clearInFlight(p: Promise<void>): void {
    if (LbRouter.leaveInFlight === p) {
      LbRouter.leaveInFlight = null;
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
