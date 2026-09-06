import { ConfigRepository } from '../config/ConfigRepository';

/**
 * Formula from 数值与牌堆配置.md §2.6 / 脚手架约定 §3.4.
 * Wild rank is read from deck.json — not a hardcoded rule number.
 */
export function isLegal(cardRank: string, claim: string): boolean {
  const wild: string = ConfigRepository.deck().wild;
  return cardRank === claim || cardRank === wild;
}

export function handIsClean(cardRanks: string[], claim: string): boolean {
  for (let i = 0; i < cardRanks.length; i++) {
    if (!isLegal(cardRanks[i], claim)) {
      return false;
    }
  }
  return true;
}

/** Challenge succeeds iff the targeted play is not clean. No LLM. */
export function isChallengeSuccess(targetRanks: string[], claim: string): boolean {
  return !handIsClean(targetRanks, claim);
}
