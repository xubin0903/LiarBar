import { MatchDefaults } from '../config/MatchDefaults';
import { Phase, SeatRole, SeatStatus, TableMode, TurnWindow } from './Phase';

export interface HandStub {
  ownerSeatId: number;
  cards: string[];
}

export interface SeatStub {
  seatId: number;
  role: SeatRole;
  aiPersona: string;
  nickname: string;
  status: SeatStatus;
  isHost: boolean;
  lives: number;
}

export interface MatchSnapshot {
  matchId: string;
  seed: number;
  config: MatchDefaults;
  phase: Phase;
  turnWindow: TurnWindow;
  tableMode: TableMode;
  silentMode: boolean;
  currentSeatId: number;
  roundIndex: number;
  playIndexInRound: number;
  stallSkipCount: number;
  seats: SeatStub[];
}
