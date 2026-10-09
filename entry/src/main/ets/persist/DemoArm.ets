import { Logger } from '../common/Logger';

const TAG = 'DemoArm';

/**
 * 21 §4.4 答辩演示：只存内存、只对下一局。
 * 大厅关于页连点 7 次解锁开关；拨开 → armed；startMatch 消费后复位。
 * 局内设置永不挂树；杀进程即清。
 */
export class DemoArm {
  /** 关于页是否已解锁演示行（本进程内保留）。 */
  private static unlocked: boolean = false;
  /** 下一局是否走 demo_seed（拨开后 true；消费或关开关后 false）。 */
  private static armed: boolean = false;

  static isUnlocked(): boolean {
    return DemoArm.unlocked;
  }

  static unlock(): void {
    DemoArm.unlocked = true;
  }

  static isArmed(): boolean {
    return DemoArm.armed;
  }

  static setArmed(on: boolean): void {
    DemoArm.armed = on;
    Logger.info(TAG, `armed=${on}`);
  }

  /** startMatch 开头调用：若 armed 则消费并返回 true（本局走 demo_seed）。 */
  static consume(): boolean {
    if (!DemoArm.armed) {
      return false;
    }
    DemoArm.armed = false;
    Logger.info(TAG, 'consumed for this match');
    return true;
  }

  /** 测试 / 冷启动复位。 */
  static resetAll(): void {
    DemoArm.unlocked = false;
    DemoArm.armed = false;
  }
}
