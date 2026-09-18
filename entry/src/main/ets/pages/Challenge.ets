import { ScreenIds } from '../common/Ids';
import { LbRouter } from '../common/LbRouter';
import { Logger } from '../common/Logger';

/**
 * Frozen four-beat page (C2-6 / F16-10 / F17-7).
 * Section 2 AwaitChallenge lives on lb_scr_table.
 * Do not host 真/假/过 here. Do not flip lastPlayRanks.
 */
@Entry
@Component
struct Challenge {
  aboutToAppear(): void {
    Logger.warn('Challenge', 'lb_scr_challenge frozen — back to table AwaitChallenge');
    LbRouter.back();
  }

  build() {
    Column()
      .id(ScreenIds.CHALLENGE)
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.tavern_bg'))
      .hitTestBehavior(HitTestMode.None)
  }
}
