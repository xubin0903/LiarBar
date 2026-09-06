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
    router.replaceUrl({ url: PageUrls.LOBBY }).catch((err: Error) => {
      Logger.warn('LbRouter', `replace lobby failed: ${err.message}`);
      router.back();
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
