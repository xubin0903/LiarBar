import { SeatModel } from '../../engine/MatchTypes';
import { SeatStatus } from '../../engine/Phase';

/**
 * D1 deal show (docs/04-设计/08 §2 / 09 §3).
 * serial: land, then wait T_stagger, then take off the next card.
 * Opening: T_card=220, T_stagger=55 → 20 cards = 5445ms.
 * Rebuild: T_card=180, T_stagger=40 → 20 cards = 4360ms (≥0.60× opening).
 */
export class DealFx {
  static readonly DEAL_CARD_MS_DEFAULT: number = 220;
  static readonly DEAL_CARD_MS_MIN: number = 180;
  static readonly DEAL_CARD_MS_MAX: number = 260;
  static readonly DEAL_STAGGER_MS_DEFAULT: number = 55;
  static readonly DEAL_STAGGER_MS_MIN: number = 40;
  static readonly DEAL_STAGGER_MS_MAX: number = 70;
  static readonly DEAL_CARD_MS_REBUILD: number = 180;
  static readonly DEAL_STAGGER_MS_REBUILD: number = 40;
  static readonly DEAL_REBUILD_SCALE_MIN: number = 0.60;
  static readonly DEAL_DONE_SETTLE_MS: number = 80;
  static readonly DEAL_LAND_PRESS_MS: number = 80;
  static readonly DEAL_OPENING_N4: number = 20;
  static readonly DEAL_OPENING_MS: number = 5445;
  static readonly HAND_SLOTS: number = 5;
  /** Table-center pool slot (lb_cmp_pool / art_pool_slot). */
  static readonly PILE_SLOT_W: number = 56;
  static readonly PILE_SLOT_H: number = 76;
  /** Visible deal-pile card (matches takeoff scale 0.72 of 56×78). */
  static readonly PILE_CARD_W: number = 40;
  static readonly PILE_CARD_H: number = 56;
  /** In-flight card box (app.float.card_w / card_h). */
  static readonly FLY_CARD_W: number = 56;
  static readonly FLY_CARD_H: number = 78;
  /** Micro-offset between stacked backs (牌堆感). */
  static readonly PILE_NUDGE: number = 1.2;

  static totalMs(n: number, cardMs: number, staggerMs: number): number {
    if (n <= 0) {
      return 0;
    }
    return n * cardMs + (n - 1) * staggerMs;
  }

  static openingMs(n: number): number {
    return DealFx.totalMs(n, DealFx.DEAL_CARD_MS_DEFAULT, DealFx.DEAL_STAGGER_MS_DEFAULT);
  }

  static rebuildMs(n: number): number {
    return DealFx.totalMs(n, DealFx.DEAL_CARD_MS_REBUILD, DealFx.DEAL_STAGGER_MS_REBUILD);
  }

  static cardMs(rebuild: boolean): number {
    if (rebuild) {
      return DealFx.DEAL_CARD_MS_REBUILD;
    }
    return DealFx.DEAL_CARD_MS_DEFAULT;
  }

  static staggerMs(rebuild: boolean): number {
    if (rebuild) {
      return DealFx.DEAL_STAGGER_MS_REBUILD;
    }
    return DealFx.DEAL_STAGGER_MS_DEFAULT;
  }

  static meetsRebuildFloor(rebuildMs: number, openingMs: number): boolean {
    return rebuildMs >= openingMs * DealFx.DEAL_REBUILD_SCALE_MIN;
  }

  static aliveClockwiseFromSelf(seats: SeatModel[]): number[] {
    const ids: number[] = [];
    let maxId: number = -1;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].seatId > maxId) {
        maxId = seats[i].seatId;
      }
    }
    for (let id = 0; id <= maxId; id++) {
      for (let i = 0; i < seats.length; i++) {
        if (seats[i].seatId === id && seats[i].status === SeatStatus.ALIVE) {
          ids.push(id);
        }
      }
    }
    return ids;
  }

  /** One-by-one around the table, self first. Never dump 5 to one seat. */
  static planBeats(aliveIds: number[], handSize: number): DealBeat[] {
    const beats: DealBeat[] = [];
    let index: number = 0;
    for (let slot = 0; slot < handSize; slot++) {
      for (let s = 0; s < aliveIds.length; s++) {
        beats.push({
          index: index,
          seatId: aliveIds[s],
          slot: slot
        });
        index++;
      }
    }
    return beats;
  }

  static takeoffAt(index: number, cardMs: number, staggerMs: number): number {
    return index * (cardMs + staggerMs);
  }

  static landAt(index: number, cardMs: number, staggerMs: number): number {
    return DealFx.takeoffAt(index, cardMs, staggerMs) + cardMs;
  }

  /**
   * Top-left of the fly layer so its center == dealPileAnchor center.
   * Opening and rebuild share this origin (docs 08 §2.1).
   */
  static flyOriginFromPile(pileX: number, pileY: number, pileW: number, pileH: number): number[] {
    const cx: number = pileX + pileW / 2;
    const cy: number = pileY + pileH / 2;
    return [cx - DealFx.FLY_CARD_W / 2, cy - DealFx.FLY_CARD_H / 2];
  }

  static pileNudgeX(layer: number): number {
    return (layer - 2) * DealFx.PILE_NUDGE;
  }

  static pileNudgeY(layer: number): number {
    return (2 - layer) * DealFx.PILE_NUDGE;
  }
}

export interface DealBeat {
  index: number;
  seatId: number;
  slot: number;
}
