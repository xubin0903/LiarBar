# 玩家框 idle 资产交件

> 分支：`feat/art-player-frame-idle` → `develop`  
> 票：真机 `art_frame_player_idle` 黑块/方块减号 → 真铜框（另票，不挡 R-LAND 合入）

## 交付

| media 名 | 文件 | 尺寸 | 格式 | 透明 | 用途 |
|---|---|---|---|---|---|
| `art_frame_player_idle` | `art_frame_player_idle.png` | **256×256** | PNG RGBA | 外圈+**中空**透明 | `lb_cmp_seat_self` 常态铜框 |

## 规格说明

- 对齐现有 AI idle：**256×256 RGBA**（关键资源清单历史写 216，本批按负责人「对齐 AI idle」以 256 为准；客户端等比缩放即可）
- **中空圆形**可叠系统头像；外侧透明，禁止黑底方块/减号占位
- 夜半酒馆铜框：暖铜描边 + 轻烛火点缀；非纯色块
- 覆盖同名 media，**不另起 id**
- 本批**不做**：`art_frame_player_named` / `_turn` / `_ghost` 返工；不挡 R-LAND 布局小修

## 验收

- 真机 self 座可见铜框环，中空透头像（或系统头）
- 禁黑块/方框减号感
- 合入≠ R-LAND 终验

## 会签

- [x] @LiarBar UI 挂点确认（尺寸缩放 / 圆裁叠层）
- [ ] @LiarBar负责人 终审
