import { Node, SpriteFrame } from 'cc';
import { TableAudio } from './TableAudio';
import { PlayFlyFx } from './PlayFlyFx';

export class ChallengeFx {
  static readonly AWAIT_MS = 10000;
  static readonly NPC_BUBBLE_MS = 1000;

  static playChallengeStart(): void {
    TableAudio.playChallengeEnter();
  }

  static playChallengeCommit(): void {
    TableAudio.playChallengeCommit();
  }

  static playRevealSequence(
    poolNode: Node,
    onFlip: () => void,
    onFinish: () => void
  ): void {
    TableAudio.playRevealDraw();
    
    // DRAW_TO_FLIP_MS = 1000ms delay before flip
    setTimeout(() => {
      TableAudio.playRevealFlip();
      onFlip();

      // REVEAL_HOLD_MS = 3000ms face-up hold before finishing
      setTimeout(() => {
        onFinish();
      }, PlayFlyFx.REVEAL_HOLD_MS);
    }, PlayFlyFx.DRAW_TO_FLIP_MS);
  }
}
