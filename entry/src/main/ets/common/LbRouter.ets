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

  static toLobby(): void {
    LbRouter.replace(PageUrls.LOBBY);
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
