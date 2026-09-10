# 13b · 局内 BGM 打回换源（规格补丁 · docs only）

| 项 | 内容 |
|---|---|
| 状态 | **规格补丁已合 #82** · 真源已换 **Moil CC0**（见 [局内声场-资产交件.md](./局内声场-资产交件.md) v1.1） |
| 针对 | 用户否决 `#80`/`#81` 的 `bgm_table_bluff`（numpy 程序拼曲） |
| 读者 | **@LiarBar负责人**、音频/美术、UI、鸿蒙、测试 |
| 基线 | [13-局内声场与伴奏规格.md](./13-局内声场与伴奏规格.md)（层次/BPM/接缝/与大厅硬闸仍有效） |

---

## 1. 打回认定（不辩）

当前仓内 `bgm_table_bluff`（`scripts/gen_table_audio.py` 合成）**作废当完成**：

1. 与大厅几乎听不出换曲，无对局张力  
2. 「动不动响一下」——无稳定节奏/氛围床  
3. **numpy 叠正弦/噪声干货** 课设听感不及格  

**立即停用**：`gen_table_audio.py` 再烤 BGM、方波/正弦叠层、短干 loop、大厅曲改音量、同一脚本交差。

文件可暂留包内，**换绑前工程应回退/静音该槽或改挂新床**（由鸿蒙在真源合入后做）。

---

## 2. 新路线（硬闸）

| 要求 | 说明 |
|---|---|
| 来源 | **真人编曲 / 可商用课设素材库**（Freesound / OpenGameArt / FMA / Pixabay Content License 等），**禁止**再交程序玩具音 |
| 听感 | **可感知律动（BPM 可感）** + 鼓或扫刷/低音/和弦 **至少两层可指认** |
| 区分 | 与 `bgm_lobby_night` **一耳朵能分**（密度更高、有盯梢/压注感） |
| 循环 | 循环体 **≥24s**（可从更长曲裁无缝段）；接缝 ≥500ms 交叉或自然句尾 |
| 许可 | 必须 **CC0** 或课设可嵌（Pixabay Content License 可接受但文档写清）；交件写 **作者 / URL / 许可证 / 是否需署名** |
| 交付顺序 | **本补丁会签 → 下载/裁剪真源 PR → UI 阅 → 鸿蒙换绑 → 听验** |

---

## 3. 推荐候选（先审再下）

> 以下为打回当时的公开候选。负责人已锁 **P0 Moil**；真源已按交件裁转进仓（同名 `bgm_table_bluff`）。

| 优先级 | 曲名 | 来源 | 许可（公开页） | 为何比脚本强 | 备注 |
|---|---|---|---|---|---|
| **P0 首选** | **Moil** | [OpenGameArt](https://opengameart.org/content/moil) · Ruskerdax | **CC0** | 文案写明：Rhodes + jazz drums + baritone sax + standup bass → **鼓/低音/和弦层次一眼有**；慢速 dark jazz，贴虚张声势 | mp3 ~7.4MB；进仓需转 **ogg 48k 立体声**，裁 ≥24s 无缝循环段 |
| P1 | (Jazz Loop) Rusted Maid | [Freesound 464923](https://freesound.org/people/plasterbrain/sounds/464923/) · plasterbrain | 页述可自由商用复制修改（Freesound 常见 **CC0** 文案；下前再核徽章） | 作者自述 dark neo-noir game loop；~30.8s 已接近循环体 | 若徽章非 CC0 则弃 |
| P1 | A Body In The Alley | [FMA · Patrick Davies](https://freemusicarchive.org/music/patrick-davies/single/a-body-in-the-alley/) | **CC0 1.0** | 作者自述 moody noir jazz；~2:29 可裁循环 | 注意页内拼写 Ally/Alley |
| P2 备选 | Pixabay「Bar Noir」等 | Pixabay Music | **Pixabay Content License**（非 CC0，课设可嵌须文档标注） | 真编曲床，有酒吧 noir 向 | 优先 CC0；仅当 P0/P1 不可用 |

**已落地**：采用 **Moil（CC0）** 作 `bgm_table_bluff` 替换源；交件目录仍用同名 media，避免工程改 id。署名见 [ATTRIBUTION-audio.md](./ATTRIBUTION-audio.md)。

---

## 4. 工程落点（会签后）

| 步骤 | 谁 |
|---|---|
| 下载 Moil（或拍板曲）→ 转码 ogg 48k stereo → 裁循环 ≥24s → 峰值约 −14～−12 dBFS | 美术 |
| 更新 `docs/04-设计/局内声场-资产交件.md`：来源/许可/时长/峰值；**标注作废 gen 脚本 BGM** | 美术 |
| `scripts/gen_table_audio.py`：**禁止再生成 BGM**（可删或脚本头写死 abort）；SFX 另议 | 美术 |
| 换绑仍走 `bgm_table_bluff` 槽；进桌 400/600 不变 | 鸿蒙 |
| 听验：换曲可感、律动可感、与大厅可分、循环无硬缝 | 测试 |

---

## 5. SFX 附带

若 Rebuild 听验仍「叮一下」：对 §5.2 中 tip 感强的条（尤 turn_tick / claim_set）改用 **Freesound 真 Foley**（木/纸/铜）重做；本补丁 **先不扩 SFX 下载清单**，等 BGM 源拍板后另开或同 PR。

质疑四槽 **仍冻、不生成**。

---

## 6. 验收句（替换后）

1. 进桌 1s 内能感到 **换曲**（不是大厅变小声）。  
2. 闭眼 5s 能感到 **稳定律动/鼓或扫刷**（不是偶发 tip）。  
3. 能指认至少 **低音或鼓 + 和声乐器** 两层。  
4. 交件 docs 写清 **许可与 URL**；来源不是 `gen_table_audio.py`。

---

## 7. 会签

- [x] @LiarBar负责人 拍板候选（默认 Moil）并授权下载  
- [ ] @LiarBar UI 阅（无新挂点则勾阅即可）  
- [ ] @LiarBar鸿蒙开发 阅：仍挂 `bgm_table_bluff` 同名替换  

---

*维护人：美术/音频岗 · 2026-09-10 · docs only · 用户否决程序玩具音*
