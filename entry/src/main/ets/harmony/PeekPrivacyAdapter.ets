import { window } from '@kit.ArkUI';
import { OverlayIds } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'PeekPrivacy';

/**
 * F-03 fail-soft: privacy mode on peek. Call site id = lb_privacy_on.
 * Peek is an overlay on lb_scr_table — never a main route.
 */
export class PeekPrivacyAdapter {
  static readonly CALL_SITE: string = OverlayIds.PRIVACY_ON;

  static async setEnabled(win: window.Window | null, on: boolean): Promise<boolean> {
    if (win === null) {
      Logger.warn(TAG, 'no window; peek still allowed locally');
      return false;
    }
    try {
      await win.setWindowPrivacyMode(on);
      Logger.info(TAG, `${PeekPrivacyAdapter.CALL_SITE}=${on}`);
      return true;
    } catch (err) {
      Logger.warn(TAG, 'privacy mode unavailable — fail-soft, peek still works');
      return false;
    }
  }
}
