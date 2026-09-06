import { ConfigRepository } from '../config/ConfigRepository';
import { Logger } from '../common/Logger';
import { MatchSnapshot } from './MatchTypes';
import { Phase, TableMode, TurnWindow } from './Phase';

const TAG = 'MatchEngine';

/**
 * Pure-logic stub. No UI / Kit.
 * Full T01+ transitions are a later PR. Do not invent win conditions here.
 */
export class MatchEngine {
  private snapshot: MatchSnapshot | null = null;

  current(): MatchSnapshot | null {
    return this.snapshot;
  }

  phase(): Phase {
    if (this.snapshot === null) {
      return Phase.LOBBY;
    }
    return this.snapshot.phase;
  }

  /**
   * Scaffold only: remember that a match has not started.
   * START_MATCH / DEAL / JUDGE wiring is out of scope.
   */
  resetToLobby(): void {
    if (!ConfigRepository.isReady()) {
      Logger.warn(TAG, 'config not ready; stay uninitialized');
      return;
    }
    const cfg = ConfigRepository.snapshotMatchDefaults();
    const demo = ConfigRepository.demo();
    let seed: number = 0;
    if (cfg.demo_seed_enabled) {
      seed = cfg.demo_seed_value;
    } else if (demo.demo_seed_enabled) {
      seed = demo.demo_seed_value;
    }
    this.snapshot = {
      matchId: '',
      seed: seed,
      config: cfg,
      phase: Phase.LOBBY,
      turnWindow: TurnWindow.NORMAL,
      tableMode: TableMode.SOCIAL,
      silentMode: false,
      currentSeatId: 0,
      roundIndex: 0,
      playIndexInRound: 0,
      stallSkipCount: 0,
      seats: []
    };
    Logger.info(TAG, 'engine stub reset → LOBBY (no rules executed)');
  }
}
