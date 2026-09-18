import { sys } from 'cc';
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
 * No-account local nickname / last table / stats via sys.localStorage.
 * Never store tokens or other players' hands.
 */
export class LocalStore {
  static async loadNickname(): Promise<string> {
    try {
      const val = sys.localStorage.getItem(${PersistNs.PROFILE}.nickname);
      return val ? String(val) : '你';
    } catch (e) {
      Logger.warn(TAG, 'loadNickname failed');
      return '你';
    }
  }

  static async saveNickname(name: string): Promise<void> {
    try {
      sys.localStorage.setItem(${PersistNs.PROFILE}.nickname, name);
    } catch (e) {
      Logger.warn(TAG, 'saveNickname failed');
    }
  }

  static async loadLastTable(): Promise<LastTable> {
    const cfg = ConfigRepository.isReady() ? ConfigRepository.match() : null;
    const fallback: LastTable = {
      playerCount: cfg ? cfg.default_players : 4,
      lives: cfg ? cfg.lives_default : 3,
      silent: false
    };
    try {
      const raw = sys.localStorage.getItem(PersistNs.LAST_TABLE);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        playerCount: Number(parsed.playerCount ?? fallback.playerCount),
        lives: Number(parsed.lives ?? fallback.lives),
        silent: Boolean(parsed.silent ?? fallback.silent)
      };
    } catch (e) {
      Logger.warn(TAG, 'loadLastTable failed');
      return fallback;
    }
  }

  static async saveLastTable(table: LastTable): Promise<void> {
    try {
      sys.localStorage.setItem(PersistNs.LAST_TABLE, JSON.stringify(table));
    } catch (e) {
      Logger.warn(TAG, 'saveLastTable failed');
    }
  }

  static async bumpLocalPlay(): Promise<void> {
    try {
      const prev = Number(sys.localStorage.getItem(${PersistNs.STATS}.plays) || 0);
      sys.localStorage.setItem(${PersistNs.STATS}.plays, String(prev + 1));
    } catch (e) {
      Logger.warn(TAG, 'bumpLocalPlay failed');
    }
  }
}
