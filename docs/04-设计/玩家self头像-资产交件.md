# 玩家 self 头像 · 资产交件

> 分支：`feat/art-player-avatar` → `develop`  
> 票：#69 现场下手 self 金框空着 → 真头像（配套 `art_frame_player_idle`）

## 交付

| media 名 | 文件 | 尺寸 | 格式 | 透明 | 用途 |
|---|---|---|---|---|---|
| `art_player_idle` | `art_player_idle.png` | **256×256** | PNG RGBA | 外圈透明（可圆裁） | `lb_cmp_seat_self` 头像层（框下） |

## 气质

- 精明、聪明、戴眼镜；自信半笑，**非反派感**
- 与三 AI 一眼区分：非老千阴狠、非杠精对线、非怂货怯场
- 夜半酒馆画风；头肩构图，圆框安全区居中

## 挂接

- 叠层建议：**头像在下**（本资源）→ **铜框在上**（`art_frame_player_idle`）
- 圆裁由 UI/客户端容器负责；本图外角已透明
- 历史清单写「自己脸用系统头」——本票改为真图 `art_player_idle`，**不另起第五套 AI id**
- 客户端换绑由鸿蒙在负责人审过资源后做；美术本批只交 media + docs

## 不做

- named/turn/ghost 头像变体；玩家自拍管线；商业级原画；质疑仍冻

## 验收

- self 座铜框内可见人物脸（眼镜可读）
- 禁空框 / 方块减号 / 纯色字交差

## 会签

- [x] @LiarBar UI 挂点（selfDock 叠层顺序 / 圆裁）
- [ ] @LiarBar负责人 终审
