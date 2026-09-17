/** Cocos / Node 侧日志；语义同 ArkTS Logger（无 hilog）。 */
export class Logger {
  static info(tag: string, message: string): void {
    console.log(`[${tag}] ${message}`);
  }

  static warn(tag: string, message: string): void {
    console.warn(`[${tag}] ${message}`);
  }

  static error(tag: string, message: string): void {
    console.error(`[${tag}] ${message}`);
  }
}
