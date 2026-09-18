import { director } from 'cc';
import { Logger } from './Logger';

const TAG = 'LbRouter';

export class LbRouter {
  static toTable(): void {
    Logger.info(TAG, 'route to Table');
    director.loadScene('Table');
  }

  static toLobby(): void {
    Logger.info(TAG, 'route to Lobby');
    director.loadScene('Lobby');
  }

  static toChallenge(): void {
    Logger.warn(TAG, 'toChallenge frozen — AwaitChallenge is in-table');
  }

  static toReport(): void {
    Logger.info(TAG, 'route to Report');
    // If Report is an in-table overlay or scene, handle gracefully
    director.loadScene('Table');
  }

  static replaceTable(): void {
    LbRouter.toTable();
  }

  static replaceReport(): void {
    LbRouter.toReport();
  }

  static replaceChallenge(): void {
    Logger.warn(TAG, 'replaceChallenge frozen');
  }

  static back(): void {
    LbRouter.toLobby();
  }
}
