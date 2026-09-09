import { ControlIds, OverlayIds } from '../../common/Ids';
import { CardModel } from '../../engine/MatchTypes';
import { PlayStyle } from '../../engine/Phase';
import { CardFace } from './CardFace';

@Component
export struct PeekMaskOverlay {
  @Link visible: boolean;
  @Link ranks: string[];
  onClose: () => void = () => {};

  build() {
    if (this.visible) {
      Column({ space: 10 }) {
        Text($r('app.string.lb_str_overlay_peek'))
          .fontColor($r('app.color.tavern_paper'))
        Text($r('app.string.lb_str_peek_hint'))
          .fontColor($r('app.color.tavern_candle'))
        Text($r('app.string.lb_str_peek_first'))
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.subtitle_text_size'))
        Scroll() {
          Row({ space: 8 }) {
            ForEach(this.ranks, (rank: string, idx: number) => {
              CardFace({
                rank: rank,
                faceUp: true,
                compact: false
              })
            }, (rank: string, idx: number) => `${rank}_${idx}`)
          }
        }
        .scrollable(ScrollDirection.Horizontal)
        .scrollBar(BarState.Off)
        Image($r('app.media.art_card_privacy_mask'))
          .width($r('app.float.card_face_w'))
          .height($r('app.float.card_face_h'))
        Text($r('app.string.lb_str_privacy_on'))
          .id(OverlayIds.PRIVACY_ON)
          .fontColor($r('app.color.tavern_mute'))
          .fontSize($r('app.float.subtitle_text_size'))
        Button($r('app.string.lb_str_skip'))
          .onClick(() => {
            this.onClose();
          })
      }
      .id(OverlayIds.PEEK_MASK)
      .width('100%')
      .padding(16)
      .backgroundColor($r('app.color.tavern_shadow'))
    }
  }
}

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
      Column({ space: 10 }) {
        Text($r('app.string.lb_str_overlay_play'))
          .fontColor($r('app.color.tavern_paper'))
        Text(this.playCountText)
          .id(ControlIds.PLAY_COUNT)
          .fontColor($r('app.color.tavern_candle'))
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
        Row({ space: 8 }) {
          Text($r('app.string.lb_str_skip_line'))
            .fontColor($r('app.color.tavern_mute'))
          Button(this.nameP1)
            .onClick(() => {
              this.onName(1);
            })
          Button(this.nameP2)
            .onClick(() => {
              this.onName(2);
            })
          Button(this.nameP3)
            .onClick(() => {
              this.onName(3);
            })
        }
        Text(this.namedLabel())
          .fontColor($r('app.color.tavern_paper'))
          .fontSize($r('app.float.subtitle_text_size'))
        Button($r('app.string.lb_str_play'))
          .id(ControlIds.PLAY)
          .enabled(this.confirmEnabled)
          .backgroundColor($r('app.color.tavern_accent'))
          .fontColor($r('app.color.tavern_bg'))
          .onClick(() => {
            this.onConfirm();
          })
        Button($r('app.string.lb_str_skip'))
          .id(ControlIds.PLAY_CANCEL)
          .onClick(() => {
            this.onClose();
          })
      }
      .id(OverlayIds.SHEET_PLAY)
      .width('100%')
      .padding(16)
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
