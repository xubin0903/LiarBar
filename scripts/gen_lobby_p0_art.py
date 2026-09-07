#!/usr/bin/env python3
"""HISTORICAL: v0.x Pillow / 色块占位。不是大厅 v2 交件。

Do not re-run this over the delivered art_* files.
Delivery generator: scripts/gen_lobby_v2_art.py
Delivery doc: docs/04-设计/大厅v2-交件说明.md
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"

# Style-board tokens (RGB)
BG = (0x1A, 0x12, 0x0E)
FELT = (0x2C, 0x18, 0x14)
PANEL = (0x3D, 0x24, 0x1C)
CANDLE = (0xE8, 0xB8, 0x6D)
BRASS = (0xC4, 0xA4, 0x6A)
PAPER = (0xF3, 0xE6, 0xC8)
MUTE = (0x8A, 0x73, 0x5A)
SHADOW = (0x0E, 0x1A, 0x22)
ACCENT = (0xF0, 0xC1, 0x4B)
DANGER = (0xC2, 0x3A, 0x3A)
DANGER_DEEP = (0x6B, 0x12, 0x18)
LIFE = (0xB8, 0x3B, 0x3B)
HAT = (0x14, 0x0E, 0x0C)
COAT = (0x24, 0x16, 0x12)
SKIN = (0xD8, 0xC0, 0x9A)
MASK = (0xE8, 0xD6, 0xB0)
GLOVE = (0xF0, 0xE4, 0xC4)


def clamp8(v: float) -> int:
    return int(max(0, min(255, round(v))))


def mix(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, int, int]:
    return (
        clamp8(a[0] + (b[0] - a[0]) * t),
        clamp8(a[1] + (b[1] - a[1]) * t),
        clamp8(a[2] + (b[2] - a[2]) * t),
    )


def rgba(c: tuple[int, int, int], a: int = 255) -> tuple[int, int, int, int]:
    return (c[0], c[1], c[2], a)


def find_cjk_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def add_film_grain(arr: np.ndarray, rng: np.random.Generator, sigma: float = 4.0) -> np.ndarray:
    noise = rng.normal(0.0, sigma, arr[..., :3].shape)
    out = arr.astype(np.float32)
    out[..., :3] = np.clip(out[..., :3] + noise, 0, 255)
    return out


def wood_modulation(xx: np.ndarray, yy: np.ndarray, scale: float, seed: float) -> np.ndarray:
    rings = np.sin(xx * (0.028 * scale) + np.sin(yy * (0.011 * scale) + seed) * 5.2 + seed)
    veins = np.sin((xx * 0.7 + yy * 0.15) * 0.09 * scale + seed * 2.1)
    return rings * 0.65 + veins * 0.35


def radial(xx: np.ndarray, yy: np.ndarray, cx: float, cy: float, radius: float) -> np.ndarray:
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return np.exp(-((d / max(radius, 1.0)) ** 2))


def save_rgba(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").save(path, "PNG")


def save_rgb(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(path, "PNG")


def rounded_panel(
    w: int,
    h: int,
    fill: tuple[int, int, int],
    border: tuple[int, int, int],
    radius: int,
    inset: bool = False,
    seed: int = 1,
) -> Image.Image:
    """9-slice friendly: ornaments stay on the ends; middle band is stretchable."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    od = ImageDraw.Draw(overlay)
    box = (1, 1, w - 2, h - 2)
    draw.rounded_rectangle(box, radius=radius, fill=rgba(fill, 255))

    arr = np.array(img).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    grain = wood_modulation(xx, yy, 1.35, seed)
    alpha = arr[..., 3] > 0
    shade = 1.0 + grain * 0.08
    # Keep the center third flatter so 9-slice stretch stays clean.
    mid = (xx > w * 0.28) & (xx < w * 0.72)
    shade = np.where(mid, 1.0 + grain * 0.03, shade)
    if inset:
        # Inner groove: darker top, faint bottom catch.
        ny = (yy / max(h - 1, 1) - 0.5) * 2.0
        shade = shade * (1.0 - np.clip(0.16 - ny * 0.10, 0, 0.22))
    else:
        ny = (yy / max(h - 1, 1) - 0.5) * 2.0
        shade = shade * (1.04 - ny * 0.06)
    arr[..., 0][alpha] = np.clip(arr[..., 0][alpha] * shade[alpha], 0, 255)
    arr[..., 1][alpha] = np.clip(arr[..., 1][alpha] * shade[alpha], 0, 255)
    arr[..., 2][alpha] = np.clip(arr[..., 2][alpha] * shade[alpha], 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGBA")
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle(box, radius=radius, outline=rgba(border, 255), width=4)
    inner = mix(border, PAPER, 0.35) if not inset else mix(border, SHADOW, 0.25)
    draw.rounded_rectangle((5, 5, w - 6, h - 6), radius=max(radius - 4, 8), outline=rgba(inner, 180), width=2)

    # End-cap brass rivets (outside the stretch zone).
    rivet_r = 6
    for x in (22, w - 23):
        for y in (h // 2 - 18, h // 2 + 18) if h >= 80 else (h // 2,):
            od.ellipse((x - rivet_r, y - rivet_r, x + rivet_r, y + rivet_r), fill=rgba(BRASS, 230))
            od.ellipse((x - 3, y - 3, x + 2, y + 2), fill=rgba(CANDLE, 160))

    # Short brass ticks on the left/right caps.
    for x0, x1 in ((16, 40), (w - 41, w - 17)):
        od.line([(x0, 14), (x1, 14)], fill=rgba(CANDLE, 140), width=2)
        od.line([(x0, h - 15), (x1, h - 15)], fill=rgba(BRASS, 120), width=2)

    img = Image.alpha_composite(img, overlay)
    rng = np.random.default_rng(seed)
    arr = add_film_grain(np.array(img), rng, 2.4)
    # Restore true transparency outside the rounded body.
    mask = np.array(img)[..., 3]
    arr[..., 3] = mask
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def draw_brass_flourish(draw: ImageDraw.ImageDraw, x: int, y: int, s: int, flip: bool = False) -> None:
    sx = -1 if flip else 1
    pts = [
        (x, y),
        (x + sx * s, y + s // 3),
        (x + sx * int(s * 0.55), y + s),
        (x + sx * int(s * 0.15), y + int(s * 0.55)),
    ]
    draw.line(pts + [pts[0]], fill=rgba(BRASS, 200), width=3)
    draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=rgba(CANDLE, 210))


def make_table_scene(lobby: bool, seed: int) -> np.ndarray:
    w, h = 1080, 2340
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:] = BG

    # Corner cold shadow #0E1A22
    nx = (xx / (w - 1) - 0.5) * 2.0
    ny = (yy / (h - 1) - 0.5) * 2.0
    vig = np.clip(nx * nx * 0.85 + ny * ny * 0.95, 0, 1)
    vig = np.power(vig, 1.15)
    img = img * (1.0 - vig * 0.82)[..., None] + np.array(SHADOW, dtype=np.float32) * (vig * 0.82)[..., None]

    # Felt heart (wine) — slightly lower on lobby so a bar/sign can sit above.
    cx, cy = w * 0.5, h * (0.42 if lobby else 0.50)
    rx, ry = w * (0.40 if lobby else 0.38), h * (0.26 if lobby else 0.30)
    felt_d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    felt_m = np.clip(1.15 - felt_d, 0, 1)
    felt_m = np.power(felt_m, 0.72)
    img = img * (1.0 - felt_m)[..., None] + np.array(FELT, dtype=np.float32) * felt_m[..., None]

    # Subtle diamond lattice on felt
    lattice = np.abs(np.sin((xx - cx) * 0.045) * np.sin((yy - cy) * 0.032))
    img += (lattice * felt_m * 6.0)[..., None] * np.array([0.35, 0.18, 0.10])

    # Wood rail around the felt
    ring = np.clip((felt_d - 0.88) / 0.22, 0, 1) * np.clip((1.28 - felt_d) / 0.18, 0, 1)
    wood = wood_modulation(xx, yy, 1.0, seed * 0.17)
    wood_col = np.array(PANEL, dtype=np.float32) + (wood * 14.0)[..., None] * np.array([1.0, 0.7, 0.4])
    img = img * (1.0 - ring)[..., None] + wood_col * ring[..., None]

    # Brass hairline just inside the wood
    brass_ring = np.clip((felt_d - 0.84) / 0.05, 0, 1) * np.clip((0.92 - felt_d) / 0.05, 0, 1)
    img = img * (1.0 - brass_ring * 0.55)[..., None] + np.array(BRASS, dtype=np.float32) * (brass_ring * 0.55)[..., None]

    # Candle: lobby sign cluster higher and warmer; table is a single overhead lamp.
    if lobby:
        glow = radial(xx, yy, w * 0.50, h * 0.16, 520) * 0.34
        glow += radial(xx, yy, w * 0.28, h * 0.14, 240) * 0.16
        glow += radial(xx, yy, w * 0.72, h * 0.14, 240) * 0.16
        img += glow[..., None] * np.array(CANDLE, dtype=np.float32)
        img += radial(xx, yy, w * 0.50, h * 0.12, 180)[..., None] * np.array(ACCENT, dtype=np.float32) * 0.10
    else:
        glow = radial(xx, yy, w * 0.50, h * 0.20, 460) * 0.26
        glow += radial(xx, yy, w * 0.50, h * 0.48, 380) * 0.08
        img += glow[..., None] * np.array(CANDLE, dtype=np.float32)

    # Wood grain wash on the outer floor
    floor = 1.0 - felt_m
    img += (wood_modulation(xx, yy, 0.7, 3.1) * floor * 5.5)[..., None] * np.array([0.55, 0.32, 0.16])

    img = np.clip(img, 0, 255)
    img = add_film_grain(img, rng, 3.2)
    return np.clip(img, 0, 255)


def decorate_table(img: Image.Image, lobby: bool) -> Image.Image:
    draw = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    # Corner brass flourishes
    draw_brass_flourish(draw, 48, 56, 54, False)
    draw_brass_flourish(draw, w - 48, 56, 54, True)
    draw_brass_flourish(draw, 48, h - 72, 54, False)
    draw_brass_flourish(draw, w - 48, h - 72, 54, True)

    # Side candle sconces
    for cx in (86, w - 86):
        draw.rectangle((cx - 7, 210, cx + 7, 390), fill=rgba(PANEL, 230))
        draw.rectangle((cx - 9, 206, cx + 9, 214), fill=rgba(BRASS, 240))
        draw.ellipse((cx - 16, 168, cx + 16, 214), fill=rgba(CANDLE, 80))
        draw.ellipse((cx - 6, 184, cx + 6, 204), fill=rgba(ACCENT, 220))
        draw.polygon([(cx, 172), (cx - 4, 188), (cx + 4, 188)], fill=rgba(PAPER, 200))

    if lobby:
        # Hanging wooden sign (bar plaque)
        sx0, sy0, sx1, sy1 = 300, 92, 780, 250
        draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=18, fill=rgba(PANEL, 235))
        draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=18, outline=rgba(BRASS, 240), width=5)
        draw.rounded_rectangle((sx0 + 10, sy0 + 10, sx1 - 10, sy1 - 10), radius=12, outline=rgba(CANDLE, 140), width=2)
        draw.line([(430, 70), (430, 96)], fill=rgba(BRASS, 230), width=4)
        draw.line([(650, 70), (650, 96)], fill=rgba(BRASS, 230), width=4)
        draw.ellipse((420, 58, 440, 78), fill=rgba(BRASS, 255))
        draw.ellipse((640, 58, 660, 78), fill=rgba(BRASS, 255))
        font = find_cjk_font(64)
        title = "谎馆"
        bbox = draw.textbbox((0, 0), title, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (sx0 + sx1 - tw) // 2
        ty = (sy0 + sy1 - th) // 2 - 4
        draw.text((tx + 2, ty + 3), title, font=font, fill=rgba(SHADOW, 160))
        draw.text((tx, ty), title, font=font, fill=rgba(CANDLE, 245))

        # Bar counter
        draw.rounded_rectangle((90, 1520, 990, 1760), radius=16, fill=rgba(PANEL, 220))
        draw.rounded_rectangle((90, 1520, 990, 1760), radius=16, outline=rgba(BRASS, 180), width=3)
        draw.rectangle((110, 1540, 970, 1574), fill=rgba(mix(PANEL, CANDLE, 0.18), 180))
        # Bottle silhouettes
        bottles = [(180, 40, LIFE), (250, 56, DANGER_DEEP), (330, 34, MUTE), (780, 50, DANGER), (860, 38, BRASS)]
        for bx, bh, col in bottles:
            draw.rounded_rectangle((bx, 1548 - bh, bx + 28, 1548), radius=6, fill=rgba(col, 200))
            draw.rectangle((bx + 10, 1548 - bh - 16, bx + 18, 1548 - bh + 2), fill=rgba(mix(col, PAPER, 0.2), 210))

    return img


def make_table_bg(path: Path) -> None:
    arr = make_table_scene(lobby=False, seed=11)
    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    decorate_table(img, lobby=False)
    img.save(path, "PNG")


def make_lobby_bg(path: Path) -> None:
    arr = make_table_scene(lobby=True, seed=29)
    # Lift mid-values a touch so the lobby reads brighter than the table.
    lift = arr.astype(np.float32)
    lift = np.clip(lift * 1.06 + 4.0, 0, 255)
    img = Image.fromarray(lift.astype(np.uint8), "RGB")
    decorate_table(img, lobby=True)
    img.save(path, "PNG")


def ellipse(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill, outline=None, width: int = 1) -> None:
    draw.ellipse(box, fill=fill, outline=outline, width=width)


def paint_dealer(announce: bool) -> Image.Image:
    """Stylized tavern dealer: top hat + Venetian mask, candle key light, true transparent ground."""
    scale = 2
    w, h = 324 * scale, 432 * scale
    body = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)

    # Torso / coat
    coat = mix(COAT, CANDLE, 0.08)
    coat_r = mix(COAT, SHADOW, 0.35)
    bd.polygon(
        [(70, 860), (80, 560), (210, 500), (440, 500), (570, 560), (590, 860), (324, 880)],
        fill=rgba(coat, 255),
    )
    # Right-side shade
    bd.polygon([(430, 520), (570, 560), (590, 860), (430, 860)], fill=rgba(coat_r, 180))
    # Left candle hem
    bd.polygon([(80, 560), (210, 508), (210, 860), (78, 860)], fill=rgba(mix(coat, CANDLE, 0.16), 90))

    # Vest
    vest = PANEL
    bd.polygon([(230, 560), (324, 548), (420, 560), (400, 860), (250, 860)], fill=rgba(vest, 255))
    bd.line([(324, 560), (324, 860)], fill=rgba(mix(vest, SHADOW, 0.4), 255), width=4)
    for by in (620, 690, 760):
        bd.ellipse((312, by, 336, by + 24), fill=rgba(BRASS, 255))
        bd.ellipse((318, by + 6, 330, by + 16), fill=rgba(CANDLE, 180))

    # Collar + cravat
    bd.polygon([(250, 548), (324, 610), (280, 548)], fill=rgba(PAPER, 255))
    bd.polygon([(398, 548), (324, 610), (368, 548)], fill=rgba(mix(PAPER, MUTE, 0.25), 255))
    bd.polygon([(300, 590), (324, 650), (348, 590), (324, 575)], fill=rgba(DANGER, 255))
    bd.polygon([(310, 600), (324, 640), (324, 600)], fill=rgba(mix(DANGER, CANDLE, 0.25), 255))

    # Neck + head
    bd.ellipse((278, 430, 370, 560), fill=rgba(mix(SKIN, CANDLE, 0.15), 255))
    bd.ellipse((230, 250, 430, 500), fill=rgba(SKIN, 255))
    # Right face shade
    bd.pieslice((230, 250, 430, 500), 300, 90, fill=rgba(mix(SKIN, SHADOW, 0.28), 140))
    # Left warm cheek
    bd.ellipse((240, 330, 310, 430), fill=rgba(mix(SKIN, CANDLE, 0.22), 70))

    # Ears
    bd.ellipse((214, 340, 250, 400), fill=rgba(mix(SKIN, MUTE, 0.15), 255))
    bd.ellipse((408, 340, 444, 400), fill=rgba(mix(SKIN, SHADOW, 0.2), 255))

    # Venetian mask
    mask_col = MASK
    bd.rounded_rectangle((236, 300, 422, 400), radius=36, fill=rgba(mask_col, 255))
    bd.rounded_rectangle((236, 300, 422, 400), radius=36, outline=rgba(BRASS, 255), width=5)
    # Nose bridge
    bd.polygon([(312, 355), (324, 390), (336, 355)], fill=rgba(mix(mask_col, MUTE, 0.2), 255))
    # Almond eye holes
    bd.polygon([(262, 348), (290, 324), (318, 348), (290, 372)], fill=rgba(HAT, 255))
    bd.polygon([(344, 348), (372, 324), (400, 348), (372, 372)], fill=rgba(HAT, 255))
    bd.ellipse((278, 336, 302, 360), fill=rgba(CANDLE, 210))
    bd.ellipse((358, 336, 380, 356), fill=rgba(BRASS, 130))
    # Mask ornament
    bd.regular_polygon((324, 318, 10), 4, fill=rgba(ACCENT, 230))

    # Mouth / jaw
    if announce:
        bd.ellipse((300, 430, 348, 468), fill=rgba(mix(HAT, DANGER_DEEP, 0.4), 255))
        bd.arc((292, 418, 356, 470), 20, 160, fill=rgba(mix(SKIN, MUTE, 0.3), 255), width=4)
    else:
        bd.arc((296, 428, 352, 462), 20, 160, fill=rgba(mix(HAT, MUTE, 0.3), 255), width=4)

    # Hair at the temples
    bd.pieslice((228, 248, 300, 340), 200, 350, fill=rgba(HAT, 255))
    bd.pieslice((360, 248, 432, 340), 190, 340, fill=rgba(HAT, 255))

    # Top hat
    bd.ellipse((200, 236, 458, 286), fill=rgba(HAT, 255))
    bd.ellipse((200, 236, 458, 286), outline=rgba(BRASS, 90), width=3)
    bd.rounded_rectangle((246, 70, 412, 250), radius=18, fill=rgba(HAT, 255))
    bd.ellipse((246, 58, 412, 100), fill=rgba(mix(HAT, MUTE, 0.15), 255))
    # Brass band + candle pin
    bd.rectangle((246, 200, 412, 228), fill=rgba(BRASS, 255))
    bd.rectangle((246, 208, 412, 214), fill=rgba(CANDLE, 200))
    bd.ellipse((310, 196, 338, 232), fill=rgba(ACCENT, 255))
    bd.polygon([(324, 176), (318, 202), (330, 202)], fill=rgba(CANDLE, 230))

    if announce:
        # Raised right arm + gloved hand (viewer-right)
        bd.polygon([(470, 620), (560, 340), (610, 360), (530, 660)], fill=rgba(coat, 255))
        bd.polygon([(560, 340), (610, 360), (600, 300), (548, 300)], fill=rgba(mix(coat, CANDLE, 0.08), 255))
        # Glove
        bd.ellipse((530, 250, 620, 330), fill=rgba(GLOVE, 255))
        bd.ellipse((600, 268, 648, 308), fill=rgba(GLOVE, 255))
        bd.ellipse((548, 236, 580, 274), fill=rgba(GLOVE, 255))
        bd.ellipse((572, 230, 602, 268), fill=rgba(mix(GLOVE, CANDLE, 0.15), 255))
        # Cuff brass
        bd.rounded_rectangle((548, 318, 612, 346), radius=6, fill=rgba(BRASS, 240))
        # Tiny announce card
        bd.rounded_rectangle((600, 210, 646, 274), radius=4, fill=rgba(PANEL, 255))
        bd.rounded_rectangle((600, 210, 646, 274), radius=4, outline=rgba(BRASS, 255), width=2)
        bd.regular_polygon((623, 242, 10), 4, fill=rgba(ACCENT, 230))

    # Wood grain + candle key only on the painted bust; halo is a tight body dilate
    # so corners stay true transparent (no full-frame glow slab).
    barr = np.array(body).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    opaque = barr[..., 3] > 0
    grain = wood_modulation(xx, yy, 2.4, 1.7)
    vest_zone = opaque & (yy > 540) & (xx > 220) & (xx < 430)
    coat_zone = opaque & (yy > 500) & ~vest_zone
    barr[..., 0][vest_zone] = np.clip(barr[..., 0][vest_zone] * (1.0 + grain[vest_zone] * 0.10), 0, 255)
    barr[..., 1][vest_zone] = np.clip(barr[..., 1][vest_zone] * (1.0 + grain[vest_zone] * 0.07), 0, 255)
    barr[..., 2][vest_zone] = np.clip(barr[..., 2][vest_zone] * (1.0 + grain[vest_zone] * 0.04), 0, 255)
    barr[..., 0][coat_zone] = np.clip(barr[..., 0][coat_zone] * (1.0 + grain[coat_zone] * 0.06), 0, 255)
    body = Image.fromarray(np.clip(barr, 0, 255).astype(np.uint8), "RGBA")

    halo = body.split()[-1].filter(ImageFilter.GaussianBlur(16))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    garr = np.array(glow).astype(np.float32)
    warm = radial(xx, yy, 200, 300, 220)
    ha = np.array(halo).astype(np.float32) / 255.0
    garr[..., 0] = CANDLE[0]
    garr[..., 1] = CANDLE[1]
    garr[..., 2] = CANDLE[2]
    garr[..., 3] = np.clip(ha * warm * 90.0, 0, 70)
    glow = Image.fromarray(garr.astype(np.uint8), "RGBA")
    layered = Image.alpha_composite(glow, body)

    # Warm key from the left, cool fill on the right — only on opaque pixels.
    arr = np.array(layered).astype(np.float32)
    light = 1.16 - (xx / (w - 1)) * 0.38
    warm = radial(xx, yy, 150, 280, 260) * 0.18
    arr[..., 0] += warm * 40
    arr[..., 1] += warm * 22
    arr[..., 2] += warm * 6
    arr[..., 0] *= light * 1.04
    arr[..., 1] *= light
    arr[..., 2] *= light * 0.94
    # Preserve alpha exactly (true transparent ground).
    arr[..., 3] = np.array(layered)[..., 3]
    opaque = arr[..., 3] > 0
    arr[..., 0] = np.where(opaque, np.clip(arr[..., 0], 0, 255), 0)
    arr[..., 1] = np.where(opaque, np.clip(arr[..., 1], 0, 255), 0)
    arr[..., 2] = np.where(opaque, np.clip(arr[..., 2], 0, 255), 0)

    rng = np.random.default_rng(7 if announce else 3)
    grain = rng.normal(0.0, 2.2, arr[..., :3].shape)
    arr[..., :3] = np.where(opaque[..., None], np.clip(arr[..., :3] + grain, 0, 255), 0)

    hi = Image.fromarray(arr.astype(np.uint8), "RGBA")
    out = hi.resize((324, 432), Image.Resampling.LANCZOS)
    # Kill downsample crumbs in the four corners so the bust is import-safe.
    oa = np.array(out)
    ch, cw = oa.shape[:2]
    pad = 10
    oa[:pad, :pad, 3] = 0
    oa[:pad, cw - pad :, 3] = 0
    oa[ch - pad :, :pad, 3] = 0
    oa[ch - pad :, cw - pad :, 3] = 0
    empty = oa[..., 3] == 0
    oa[..., :3][empty] = 0
    return Image.fromarray(oa, "RGBA")


def make_btn_primary(path: Path, pressed: bool) -> None:
    fill = ACCENT if pressed else PANEL
    border = mix(CANDLE, PAPER, 0.2) if pressed else ACCENT
    img = rounded_panel(720, 144, fill, border, radius=28, inset=False, seed=8 if pressed else 4)
    if pressed:
        # Inner gold wash so type on tavern_bg stays readable.
        wash = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(wash)
        d.rounded_rectangle((10, 10, 709, 133), radius=22, outline=rgba(mix(BG, BRASS, 0.35), 140), width=2)
        img = Image.alpha_composite(img, wash)
    img.save(path, "PNG")


def make_input_field(path: Path) -> None:
    img = rounded_panel(720, 96, mix(BG, FELT, 0.35), BRASS, radius=20, inset=True, seed=13)
    slot = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(slot)
    d.rounded_rectangle((16, 16, 703, 79), radius=14, fill=rgba(SHADOW, 150))
    d.rounded_rectangle((18, 18, 701, 77), radius=12, fill=rgba(mix(BG, SHADOW, 0.55), 90))
    d.line([(30, 24), (690, 24)], fill=rgba(SHADOW, 160), width=3)
    d.line([(30, 74), (690, 74)], fill=rgba(mix(BRASS, CANDLE, 0.25), 80), width=1)
    img = Image.alpha_composite(img, slot)
    img.save(path, "PNG")


def unique_colors(path: Path) -> int:
    arr = np.array(Image.open(path))
    flat = arr.reshape(-1, arr.shape[-1])
    return int(np.unique(flat, axis=0).shape[0])


def corner_alpha_zero(path: Path) -> bool:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    samples = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    return all(p[3] == 0 for p in samples)


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    jobs = {
        "art_dealer_bust_idle.png": lambda p: paint_dealer(False).save(p, "PNG"),
        "art_dealer_bust_announce.png": lambda p: paint_dealer(True).save(p, "PNG"),
        "art_table_bg.png": make_table_bg,
        "art_lobby_bg.png": make_lobby_bg,
        "art_btn_primary.png": lambda p: make_btn_primary(p, False),
        "art_btn_primary_on.png": lambda p: make_btn_primary(p, True),
        "art_input_field.png": make_input_field,
    }
    for name, fn in jobs.items():
        dest = MEDIA / name
        fn(dest)
        im = Image.open(dest)
        n = unique_colors(dest)
        print(f"{name:32} {im.size[0]}x{im.size[1]} colors={n} mode={im.mode}")

    for name in (
        "art_dealer_bust_idle.png",
        "art_dealer_bust_announce.png",
        "art_btn_primary.png",
        "art_btn_primary_on.png",
        "art_input_field.png",
    ):
        if not corner_alpha_zero(MEDIA / name):
            raise SystemExit(f"{name} corners are not transparent")

    print("lobby P0 art written")


if __name__ == "__main__":
    main()
