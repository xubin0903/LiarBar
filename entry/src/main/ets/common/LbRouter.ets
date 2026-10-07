import { router } from '@kit.ArkUI';
import { PageUrls } from './Ids';
import { Logger } from './Logger';

export class LbRouter {
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
   * ① replaceUrl 大厅 → ② 失败（reject/throw）退 router.back()（页栈只剩本页也算失败）→ ③ 再失败返回 false。
   * 成败如实返回，调用方据此决定是否解锁。Report 等其它页仍用 toLobby()。
   */
  static async toLobbyOrBack(): Promise<boolean> {
    try {
      await router.replaceUrl({ url: PageUrls.LOBBY });
      return true;
    } catch (err) {
      Logger.warn('LbRouter', `toLobbyOrBack: replace lobby failed: ${(err as Error).message}`);
    }
    try {
      if (Number(router.getLength()) <= 1) {
        throw new Error('page stack has nothing to go back to');
      }
      router.back();
      return true;
    } catch (err) {
      Logger.error('LbRouter', `toLobbyOrBack: back() failed: ${(err as Error).message}`);
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
