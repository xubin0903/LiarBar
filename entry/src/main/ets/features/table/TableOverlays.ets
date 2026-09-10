import { ControlIds, OverlayIds } from '../../common/Ids';
import { CardModel } from '../../engine/MatchTypes';
import { PlayStyle } from '../../engine/Phase';
import { CardFace } from './CardFace';

/**
 * Peek mask (docs 11 §2.4 / O1): dim table-heart + opponents.
 * Faces flip on lb_cmp_card_{0-4} in the hand row — no title/skip chrome (X1/X2).
 */
@Component
export struct PeekMaskOverlay {
  @Link visible: boolean;

  build() {
    if (this.visible) {
      Column() {
        Blank()
      }
      .id(OverlayIds.PEEK_MASK)
      .width('100%')
      .height('58%')
      .margin({ top: '10%' })
      .backgroundColor($r('app.color.tavern_shadow'))
      .opacity(0.55)
      .hitTestBehavior(HitTestMode.None)
    }
  }
}

/**
 * Play package (docs 11 §2.3 / X3): right sidebar, cover ≤36% width.
 * Claim + four seats stay pointable. Submit + style chips share this pane.
 */
@Component
export struct PlaySheetOverlay {
  @Link visible: boolean;
  @Link cards: CardModel[];
  @Link selectedIds: string[];
  @Link styleName: string;
  @Link namedSeatId: number;
  @Link playCountText: string;
  @Link confirmEnabled: boolean;
  @Link nameP1: string;
  @Link nameP2: string;
  @Link nameP3: string;
  onToggleCard: (cardId: string) => void = (_cardId: string) => {};
  onStyle: (style: string) => void = (_style: string) => {};
  onName: (seatId: number) => void = (_seatId: number) => {};
  onConfirm: () => void = () => {};
  onClose: () => void = () => {};

  build() {
    if (this.visible) {
      Column({ space: 8 }) {
        Text($r('app.string.lb_str_overlay_play'))
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.subtitle_text_size'))
        Text(this.playCountText)
          .id(ControlIds.PLAY_COUNT)
          .fontColor($r('app.color.tavern_candle'))
        Scroll() {
          Row({ space: 6 }) {
            ForEach(this.cards, (card: CardModel) => {
              CardFace({
                rank: card.rank,
                faceUp: true,
                compact: true,
                selected: this.isSelected(card.cardId)
              })
                .onClick(() => {
                  this.onToggleCard(card.cardId);
                })
            }, (card: CardModel) => card.cardId)
          }
        }
        .scrollable(ScrollDirection.Horizontal)
        .scrollBar(BarState.Off)
        .constraintSize({ maxHeight: '40%' })
        Row({ space: 12 }) {
          Image($r('app.media.art_play_soft'))
            .id(ControlIds.STYLE_SOFT)
            .width(40)
            .height(40)
            .opacity(this.styleName === PlayStyle.SOFT ? 1 : 0.45)
            .onClick(() => {
              this.onStyle(PlayStyle.SOFT);
            })
          Image($r('app.media.art_play_slam'))
            .id(ControlIds.STYLE_SLAM)
            .width(40)
            .height(40)
            .opacity(this.styleName === PlayStyle.SLAM ? 1 : 0.45)
            .onClick(() => {
              this.onStyle(PlayStyle.SLAM);
            })
          Image($r('app.media.art_play_hesitate'))
            .id(ControlIds.STYLE_HESITATE)
            .width(40)
            .height(40)
            .opacity(this.styleName === PlayStyle.HESITATE ? 1 : 0.45)
            .onClick(() => {
              this.onStyle(PlayStyle.HESITATE);
            })
        }
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
          Text($r('app.string.lb_str_skip_line'))
            .fontColor($r('app.color.tavern_mute'))
            .fontSize($r('app.float.caption_text_size'))
            .margin({ right: 8 })
          Button(this.nameP1)
            .fontSize($r('app.float.caption_text_size'))
            .height(36)
            .onClick(() => {
              this.onName(1);
            })
          Button(this.nameP2)
            .fontSize($r('app.float.caption_text_size'))
            .height(36)
            .onClick(() => {
              this.onName(2);
            })
          Button(this.nameP3)
            .fontSize($r('app.float.caption_text_size'))
            .height(36)
            .onClick(() => {
              this.onName(3);
            })
        }
        .width('100%')
        Text(this.namedLabel())
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.caption_text_size'))
        Button($r('app.string.lb_str_play'))
          .id(ControlIds.PLAY)
          .width('100%')
          .height($r('app.float.cta_height'))
          .enabled(this.confirmEnabled)
          .backgroundColor($r('app.color.tavern_accent'))
          .fontColor($r('app.color.tavern_bg'))
          .onClick(() => {
            this.onConfirm();
          })
        Text($r('app.string.lb_str_skip'))
          .id(ControlIds.PLAY_CANCEL)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.caption_text_size'))
          .onClick(() => {
            this.onClose();
          })
      }
      .id(OverlayIds.SHEET_PLAY)
      .width('100%')
      .height('100%')
      .padding(12)
      .backgroundColor($r('app.color.tavern_panel'))
    }
  }

  private isSelected(cardId: string): boolean {
    for (let i = 0; i < this.selectedIds.length; i++) {
      if (this.selectedIds[i] === cardId) {
        return true;
      }
    }
    return false;
  }

  private namedLabel(): string {
    if (this.namedSeatId === 1) {
      return this.nameP1;
    }
    if (this.namedSeatId === 2) {
      return this.nameP2;
    }
    if (this.namedSeatId === 3) {
      return this.nameP3;
    }
    return '';
  }
}
