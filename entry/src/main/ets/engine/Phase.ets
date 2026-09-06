/**
 * Stage ids from docs/05-技术/02-回合状态机草图.md §1 — no aliases.
 * UI may have subviews; logs / live window only report these IDs.
 */
export enum Phase {
  LOBBY = 'LOBBY',
  DEAL = 'DEAL',
  CLAIM = 'CLAIM',
  TURN = 'TURN',
  PLAY_REVEAL_SELF = 'PLAY_REVEAL_SELF',
  CHALLENGE_RITUAL = 'CHALLENGE_RITUAL',
  JUDGE = 'JUDGE',
  PENALTY = 'PENALTY',
  RECAP = 'RECAP',
  END = 'END'
}

/** TURN window modes — not extra phases. */
export enum TurnWindow {
  NORMAL = 'NORMAL',
  CHALLENGE_ONLY = 'CHALLENGE_ONLY',
  AUTO_SKIP = 'AUTO_SKIP'
}

export enum SeatRole {
  HUMAN = 'HUMAN',
  AI = 'AI'
}

export enum SeatStatus {
  ALIVE = 'ALIVE',
  GHOST = 'GHOST'
}

export enum PlayStyle {
  SOFT = 'SOFT',
  SLAM = 'SLAM',
  HESITATE = 'HESITATE'
}

export enum ChallengeResult {
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL'
}

export enum TableMode {
  SOCIAL = 'SOCIAL',
  ACTING = 'ACTING'
}
