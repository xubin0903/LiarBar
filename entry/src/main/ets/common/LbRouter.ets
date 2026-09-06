import { router } from '@kit.ArkUI';
import { PageUrls } from './Ids';
import { Logger } from './Logger';

export class LbRouter {
  static toTable(): void {
    LbRouter.push(PageUrls.TABLE);
  }

  static toChallenge(): void {
    LbRouter.push(PageUrls.CHALLENGE);
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

  static replaceChallenge(): void {
    LbRouter.replace(PageUrls.CHALLENGE);
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
