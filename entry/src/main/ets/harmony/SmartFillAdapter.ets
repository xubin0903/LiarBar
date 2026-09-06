import { LastTable, LocalStore } from '../persist/LocalStore';
import { ControlIds } from '../common/Ids';
import { Logger } from '../common/Logger';

/**
 * F-11 fail-soft: system autofill is UI-driven on lb_cmp_nick_field.
 * Last-table fill uses Preferences — never login / Huawei ID.
 */
export class SmartFillAdapter {
  static readonly FIELD_ID: string = ControlIds.NICK_FIELD;

  static systemSuggestion(): string {
    Logger.info('SmartFill', 'no forced account; empty suggestion is OK');
    return '';
  }

  static async fillLastTable(): Promise<LastTable> {
    return LocalStore.loadLastTable();
  }
}
