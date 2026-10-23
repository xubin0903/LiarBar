import { preferences } from '@kit.ArkData';

/**
 * 一次性把无前缀旧键搬到当前账号桶（schema §2.3）。
 * 只删 `recent_v1` / `summary_v1` / `last_match_id` 这三个旧键，不动任何 `u:*`。
 * `migrated_v1=1` 之后不再复制，避免把同一份旧档抄给下一个账号。
 */
export class RecordsMigrate {
  static readonly FLAG: string = 'migrated_v1';
  static readonly KEY_RECENT: string = 'recent_v1';
  static readonly KEY_SUMMARY: string = 'summary_v1';
  static readonly KEY_LAST: string = 'last_match_id';

  static async once(store: preferences.Preferences, user: string): Promise<void> {
    if (user.length === 0) {
      return;
    }
    const flag: preferences.ValueType = await store.get(RecordsMigrate.FLAG, '');
    const legacyRecent: preferences.ValueType = await store.get(RecordsMigrate.KEY_RECENT, '');
    const legacySummary: preferences.ValueType = await store.get(RecordsMigrate.KEY_SUMMARY, '');
    const legacyLast: preferences.ValueType = await store.get(RecordsMigrate.KEY_LAST, '');
    const hasLegacy: boolean = RecordsMigrate.nonEmpty(legacyRecent) || RecordsMigrate.nonEmpty(legacySummary) ||
      RecordsMigrate.nonEmpty(legacyLast);
    if (typeof flag === 'string' && flag === '1') {
      if (hasLegacy) {
        await RecordsMigrate.dropLegacy(store);
      }
      return;
    }
    if (!hasLegacy) {
      await store.put(RecordsMigrate.FLAG, '1');
      await store.flush();
      return;
    }
    const destRecent: preferences.ValueType = await store.get(RecordsMigrate.bucket(user, RecordsMigrate.KEY_RECENT), '');
    if (!RecordsMigrate.nonEmpty(destRecent)) {
      await store.put(RecordsMigrate.bucket(user, RecordsMigrate.KEY_RECENT), RecordsMigrate.asText(legacyRecent));
      await store.put(RecordsMigrate.bucket(user, RecordsMigrate.KEY_SUMMARY), RecordsMigrate.asText(legacySummary));
      await store.put(RecordsMigrate.bucket(user, RecordsMigrate.KEY_LAST), RecordsMigrate.asText(legacyLast));
    }
    await store.put(RecordsMigrate.FLAG, '1');
    await RecordsMigrate.dropLegacy(store);
  }

  private static async dropLegacy(store: preferences.Preferences): Promise<void> {
    await store.delete(RecordsMigrate.KEY_RECENT);
    await store.delete(RecordsMigrate.KEY_SUMMARY);
    await store.delete(RecordsMigrate.KEY_LAST);
    await store.flush();
  }

  private static bucket(user: string, base: string): string {
    return `u:${user}:${base}`;
  }

  private static nonEmpty(v: preferences.ValueType): boolean {
    if (typeof v !== 'string') {
      return false;
    }
    const text: string = v;
    return text.length > 0;
  }

  private static asText(v: preferences.ValueType): string {
    if (typeof v !== 'string') {
      return '';
    }
    const text: string = v;
    return text;
  }
}