import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { ConfigRepository } from '../config/ConfigRepository';
import { PersistNs } from '../common/Ids';
import { Logger } from '../common/Logger';

const TAG = 'LocalStore';

export interface LastTable {
  playerCount: number;
  lives: number;
  silent: boolean;
}

/**
 * No-account local nickname / last table / stats.
 * Never store tokens or other players' hands.
 */
export class LocalStore {
  private static profile: preferences.Preferences | null = null;
  private static lastTable: preferences.Preferences | null = null;
  private static stats: preferences.Preferences | null = null;

  static async init(context: common.UIAbilityContext): Promise<void> {
    LocalStore.profile = await preferences.getPreferences(context, PersistNs.PROFILE);
    LocalStore.lastTable = await preferences.getPreferences(context, PersistNs.LAST_TABLE);
    LocalStore.stats = await preferences.getPreferences(context, PersistNs.STATS);
    Logger.info(TAG, 'preferences ready');
  }

  static async loadNickname(): Promise<string> {
    if (LocalStore.profile === null) {
      return '';
    }
    const value = await LocalStore.profile.get('nickname', '');
    return `${value}`;
  }

  static async saveNickname(name: string): Promise<void> {
    if (LocalStore.profile === null) {
      return;
    }
    await LocalStore.profile.put('nickname', name);
    await LocalStore.profile.flush();
  }

  static async loadLastTable(): Promise<LastTable> {
    const cfg = ConfigRepository.match();
    const fallback: LastTable = {
      playerCount: cfg.default_players,
      lives: cfg.lives_default,
      silent: false
    };
    if (LocalStore.lastTable === null) {
      return fallback;
    }
    const players = await LocalStore.lastTable.get('playerCount', fallback.playerCount);
    const lives = await LocalStore.lastTable.get('lives', fallback.lives);
    const silent = await LocalStore.lastTable.get('silent', fallback.silent);
    return {
      playerCount: Number(players),
      lives: Number(lives),
      silent: Boolean(silent)
    };
  }

  static async saveLastTable(table: LastTable): Promise<void> {
    if (LocalStore.lastTable === null) {
      return;
    }
    await LocalStore.lastTable.put('playerCount', table.playerCount);
    await LocalStore.lastTable.put('lives', table.lives);
    await LocalStore.lastTable.put('silent', table.silent);
    await LocalStore.lastTable.flush();
  }

  /** Stats stub — no ranking, no network. */
  static async bumpLocalPlay(): Promise<void> {
    if (LocalStore.stats === null) {
      return;
    }
    const prev = await LocalStore.stats.get('plays', 0);
    await LocalStore.stats.put('plays', Number(prev) + 1);
    await LocalStore.stats.flush();
  }
}
