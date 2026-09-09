#!/usr/bin/env python3
"""LiarBar card-face delivery — vertical 240×336, baked shield indices.

Landscape attachments in scripts/art_src/src_card_*.png are style previews only.
This script reframes them to portrait and bakes one shared 盾/徽 template
(A/K/Q/J) into the PNG. Do not expect the client to overlay letters.

Specs: docs/04-设计/牌面与发牌-资产交件.md
Tokens: docs/04-设计/夜半酒馆-风格板.md
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts/art_src"
MEDIA = ROOT / "entry/src/main/resources/base/media"
DOCS_IMG = ROOT / "docs/04-设计"

CARD_W, CARD_H = 240, 336
SAFE = 16
SHIELD_W, SHIELD_H = 56, 90
LETTER_MIN_H = 74
THUMB_W, THUMB_H = 80, 112

PANEL = np.array((0x3D, 0x24, 0x1C), dtype=np.float32)
BRASS = np.array((0xC4, 0xA4, 0x6A), dtype=np.float32)
CANDLE = np.array((0xE8, 0xB8, 0x6D), dtype=np.float32)
PAPER = np.array((0xF3, 0xE6, 0xC8), dtype=np.float32)
ACCENT = np.array((0xF0, 0xC1, 0x4B), dtype=np.float32)
BG = np.array((0x1A, 0x12, 0x0E), dtype=np.float32)
SHADOW = np.array((0x0E, 0x1A, 0x22), dtype=np.float32)
FELT = np.array((0x2C, 0x18, 0x14), dtype=np.float32)

FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/croscore/Tinos-Bold.ttf",
)

# Focal: character sits mid-low on the vertical card; zoom past 16:9.
FACES = {
    "a": {
        "src": "src_card_a.png",
        "out": "art_card_a.png",
        "letter": "A",
        "fx": 0.50,
        "fy": 0.40,
        "zoom": 1.30,
        "focus_in_frame": 0.60,
    },
    "k": {
        "src": "src_card_k.png",
        "out": "art_card_k.png",
        "letter": "K",
        "fx": 0.50,
        "fy": 0.43,
        "zoom": 1.28,
        "focus_in_frame": 0.61,
    },
    "q": {
        "src": "src_card_q.png",
        "out": "art_card_q.png",
        "letter": "Q",
        "fx": 0.48,
        "fy": 0.40,
        "zoom": 1.26,
        "focus_in_frame": 0.60,
    },
    "joker": {
        "src": "src_card_joker.png",
        "out": "art_card_joker.png",
        "letter": "J",
        "fx": 0.50,
        "fy": 0.38,
        "zoom": 1.24,
        "focus_in_frame": 0.58,
    },
}

BACK = {
    "src": "src_card_back.png",
    "out": "art_card_back.png",
    "fx": 0.50,
    "fy": 0.50,
    "zoom": 1.10,
    "focus_in_frame": 0.52,
}


def clamp8(v: np.ndarray | float) -> np.ndarray | int:
    if isinstance(v, np.ndarray):
        return np.clip(v, 0, 255)
    return int(max(0, min(255, round(v))))


def pick_font() -> str:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    raise FileNotFoundError("no serif bold font found")


def portrait_reframe(
    im: Image.Image,
    fx: float,
    fy: float,
    zoom: float,
    focus_in_frame: float,
) -> Image.Image:
    """Cover-crop a landscape preview into 240×336 with the bust mid-low."""
    w, h = im.size
    base = max(CARD_W / w, CARD_H / h)
    scale = base * zoom
    nw = max(CARD_W, int(round(w * scale)))
    nh = max(CARD_H, int(round(h * scale)))
    resized = im.convert("RGB").resize((nw, nh), Image.Resampling.LANCZOS)
    cx = int(round(fx * nw))
    cy = int(round(fy * nh))
    left = cx - CARD_W // 2
    top = cy - int(round(CARD_H * focus_in_frame))
    left = max(0, min(nw - CARD_W, left))
    top = max(0, min(nh - CARD_H, top))
    return resized.crop((left, top, left + CARD_W, top + CARD_H))


def heater_shield_mask(w: int, h: int) -> np.ndarray:
    """Shared 盾/徽 silhouette — pointed heater, same path for A/K/Q/J."""
    yy, xx = np.mgrid[0:h, 0:w]
    nx = (xx + 0.5) / w * 2.0 - 1.0
    ny = (yy + 0.5) / h
    top = np.clip(ny / 0.13, 0.0, 1.0)
    half_top = 0.58 + 0.34 * np.sqrt(top)
    half_mid = np.full_like(ny, 0.90)
    taper = np.clip((1.0 - ny) / 0.50, 0.0, 1.0) ** 0.82
    half_bot = 0.90 * taper
    half = np.where(ny < 0.13, half_top, np.where(ny < 0.50, half_mid, half_bot))
    return (np.abs(nx) <= half) & (ny >= 0.018) & (ny <= 0.985)


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs):
        y0, y1 = max(0, y - r), min(h, y + r + 1)
        x0, x1 = max(0, x - r), min(w, x + r + 1)
        yy, xx = np.ogrid[y0:y1, x0:x1]
        out[y0:y1, x0:x1] |= (yy - y) ** 2 + (xx - x) ** 2 <= r * r
    return out


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    return ~dilate(~mask, r)


def make_shield_rgba(letter: str, rng: np.random.Generator) -> Image.Image:
    """One template: tavern_panel field + brass rim + baked letter."""
    w, h = SHIELD_W, SHIELD_H
    body = heater_shield_mask(w, h)
    rim = dilate(body, 2) & ~erode(body, 2)
    inner = erode(body, 3)
    core = erode(body, 5)

    yy, xx = np.mgrid[0:h, 0:w]
    ny = (yy + 0.5) / h
    nx = (xx + 0.5) / w
    grain = rng.normal(0.0, 1.0, (h, w))
    grain = Image.fromarray(((grain - grain.min()) / (np.ptp(grain) + 1e-6) * 255).astype(np.uint8))
    grain = np.asarray(grain.filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255.0
    wood = 0.55 + 0.45 * np.sin((xx * 0.55 + ny * 18.0) + grain * 2.4)
    wood = 0.62 * wood + 0.38 * grain
    vignette = 1.0 - 0.38 * ((nx - 0.5) ** 2 * 2.8 + (ny - 0.42) ** 2)

    field = PANEL * (0.72 + 0.28 * wood)[:, :, None]
    field = field * vignette[:, :, None]
    field = field * 0.82 + FELT * 0.18
    highlight = np.clip(1.0 - (nx - 0.32) ** 2 * 6 - (ny - 0.22) ** 2 * 8, 0, 1)
    field = field + CANDLE * (0.10 * highlight)[:, :, None]

    brass_grad = BRASS * (0.78 + 0.22 * (1.0 - ny))[:, :, None]
    brass_grad = brass_grad + ACCENT * (0.16 * highlight)[:, :, None]
    brass_grad = brass_grad + PAPER * (0.08 * np.clip(grain - 0.55, 0, 1))[:, :, None]

    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb[body] = field[body]
    rgb[inner] = (field * 0.88 + SHADOW * 0.12)[inner]
    rgb[core] = field[core]
    rgb[rim] = np.clip(brass_grad[rim], 0, 255)

    # Inner brass hairline (徽, not a rubber stamp).
    hair = dilate(erode(body, 4), 1) & ~erode(body, 5)
    rgb[hair] = np.clip(BRASS * 0.55 + CANDLE * 0.25 + rgb[hair] * 0.20, 0, 255)

    # Shoulder rivets — same on every rank.
    for rx, ry in ((11, 16), (w - 12, 16), (w // 2, 8)):
        rr = (xx - rx) ** 2 + (yy - ry) ** 2
        dot = (rr <= 4.2) & body
        rgb[dot] = np.clip(BRASS * 0.35 + ACCENT * 0.45 + PAPER * 0.20, 0, 255)

    alpha = np.zeros((h, w), dtype=np.uint8)
    alpha[dilate(body, 1)] = 255
    # Soft outer edge so it sits in the painting, not a square chop.
    edge = dilate(body, 2) & ~body
    alpha[edge] = 170

    rgba = np.dstack([clamp8(rgb).astype(np.uint8), alpha])
    badge = Image.fromarray(rgba, "RGBA")

    letter_layer = render_letter(letter, w, h)
    badge.alpha_composite(letter_layer, (0, 0))
    return badge


def _reinforce_a_bar(mask: Image.Image) -> Image.Image:
    """Keep the A crossbar at 80×112 — thin serifs collapse into a stick."""
    a = np.asarray(mask, dtype=np.uint8).copy()
    h, w = a.shape
    y0, y1 = int(h * 0.48), int(h * 0.64)
    for y in range(y0, y1):
        xs = np.where(a[y] > 70)[0]
        if len(xs) < 2:
            continue
        left, right = int(xs.min()), int(xs.max())
        if right - left < w * 0.28:
            continue
        a[max(0, y - 1) : min(h, y + 2), left : right + 1] = np.maximum(
            a[max(0, y - 1) : min(h, y + 2), left : right + 1], 230
        )
    return Image.fromarray(a, "L")


def render_letter(letter: str, w: int, h: int) -> Image.Image:
    """Bake A/K/Q/J; height ≥74px; mild width fit into the 56px shield."""
    font_path = pick_font()
    target = LETTER_MIN_H
    size = 92
    bbox = (0, 0, 0, 0)
    font = ImageFont.truetype(font_path, size)
    for size in range(118, 54, -1):
        font = ImageFont.truetype(font_path, size)
        bbox = font.getbbox(letter)
        ink_h = bbox[3] - bbox[1]
        if ink_h <= 80:
            if ink_h >= target:
                break
    ink_h = bbox[3] - bbox[1]
    ink_w = bbox[2] - bbox[0]
    # Hi-res stamp then down; keeps serifs readable at 80×112.
    scale = 3
    pad = 8
    tw = max(ink_w + pad * 2, 8)
    th = max(ink_h + pad * 2, 8)
    hi = Image.new("L", (tw * scale, th * scale), 0)
    hd = ImageDraw.Draw(hi)
    hfont = ImageFont.truetype(font_path, size * scale)
    hd.text((pad * scale - bbox[0] * scale, pad * scale - bbox[1] * scale), letter, fill=255, font=hfont)
    mask = hi.resize((tw, th), Image.Resampling.LANCZOS)

    max_w = w - 8
    if mask.size[0] > max_w:
        nh = mask.size[1]
        mask = mask.resize((max_w, nh), Image.Resampling.LANCZOS)

    # Guarantee ink height after any squeeze.
    if letter == "A":
        mask = _reinforce_a_bar(mask)
    ys, xs = np.where(np.asarray(mask) > 80)
    if len(ys) == 0:
        raise RuntimeError(f"letter {letter} produced empty mask")
    cur_h = int(ys.max() - ys.min() + 1)
    if cur_h < LETTER_MIN_H:
        grow = LETTER_MIN_H / cur_h
        nw = max(8, int(round(mask.size[0] * min(grow, max_w / mask.size[0]))))
        nh = max(LETTER_MIN_H, int(round(mask.size[1] * grow)))
        mask = mask.resize((nw, nh), Image.Resampling.LANCZOS)

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Sit in the shield body (above the point).
    cx, cy = w // 2, int(h * 0.44)
    mx, my = mask.size
    px, py = cx - mx // 2, cy - my // 2
    m = np.asarray(mask, dtype=np.float32) / 255.0
    # Extra weight so A/K/Q/J survive 80×112 (A especially collapses if thin).
    bulky = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    m = np.clip(np.asarray(bulky, dtype=np.float32) / 255.0, 0, 1)
    yy, xx = np.mgrid[0:my, 0:mx]
    ny = yy / max(1, my - 1)
    fill = PAPER * (0.82 + 0.10 * (1.0 - ny))[:, :, None] + ACCENT * 0.12
    fill = fill + CANDLE * 0.06
    outline = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    om = np.asarray(outline, dtype=np.float32) / 255.0
    stroke = (om - m).clip(0, 1)
    rgb = fill * m[:, :, None] + (SHADOW * 0.70 + BRASS * 0.30) * stroke[:, :, None]
    a = np.clip(np.maximum(m, stroke) * 255.0, 0, 255).astype(np.uint8)
    glyph = Image.fromarray(np.dstack([clamp8(rgb).astype(np.uint8), a]), "RGBA")
    layer.paste(glyph, (px, py), glyph)
    return layer


def card_frame(im: Image.Image) -> Image.Image:
    """Thin brass rail; does not replace the 盾/徽."""
    arr = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
    rail = (edge <= 2) & (edge >= 0)
    inner = edge == 3
    arr[rail] = arr[rail] * 0.25 + BRASS * 0.55 + ACCENT * 0.20
    arr[inner] = arr[inner] * 0.45 + BG * 0.55
    grain = np.random.default_rng(20260909).normal(0.0, 2.2, arr.shape)
    arr = np.clip(arr + grain, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def bake_indices(card: Image.Image, letter: str) -> Image.Image:
    rng = np.random.default_rng(abs(hash(letter)) % (2**32))
    shield = make_shield_rgba(letter, rng)
    out = card.convert("RGBA")
    tl = (SAFE, SAFE)
    out.alpha_composite(shield, tl)
    mirrored = shield.rotate(180, expand=False)
    br = (CARD_W - SAFE - SHIELD_W, CARD_H - SAFE - SHIELD_H)
    out.alpha_composite(mirrored, br)
    return card_frame(out.convert("RGB"))


def measure_letter_height(im: Image.Image, region: tuple[int, int, int, int]) -> int:
    crop = np.asarray(im.crop(region).convert("L"), dtype=np.float32)
    # Ink = brighter brass/paper against dark panel.
    hi = crop >= 150
    if hi.sum() < 20:
        hi = crop >= 130
    ys = np.where(hi.any(axis=1))[0]
    if len(ys) == 0:
        return 0
    return int(ys[-1] - ys[0] + 1)


def contrast_thumb(im: Image.Image) -> float:
    thumb = im.resize((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
    r = np.asarray(thumb.crop((5, 5, 5 + 19, 5 + 30)).convert("L"), dtype=np.float32)
    return float(r.max() - r.min())


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def make_safezone_sheet(cards: dict[str, Image.Image]) -> Image.Image:
    """UI sign-off plate: 3x @240 + 80×112 row with the 56×90 box drawn."""
    order = ["a", "k", "q", "joker"]
    gap = 16
    top_h = CARD_H
    sheet_w = CARD_W * 4 + gap * 5
    sheet_h = top_h + 24 + THUMB_H + 36
    sheet = Image.new("RGB", (sheet_w, sheet_h), (0x1A, 0x12, 0x0E))
    draw = ImageDraw.Draw(sheet)
    font_path = pick_font()
    cap = ImageFont.truetype(font_path, 14)
    x = gap
    for key in order:
        card = cards[key]
        sheet.paste(card, (x, 8))
        # Letter-zone box @3x (56×90 from 16,16) + shield outline.
        box = [x + SAFE, 8 + SAFE, x + SAFE + SHIELD_W - 1, 8 + SAFE + SHIELD_H - 1]
        draw.rectangle(box, outline=(0xF0, 0xC1, 0x4B), width=1)
        thumb = card.resize((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
        tx = x + (CARD_W - THUMB_W) // 2
        sheet.paste(thumb, (tx, 8 + top_h + 16))
        # Scaled box on the 80×112 row.
        sx = THUMB_W / CARD_W
        sy = THUMB_H / CARD_H
        tbox = [
            tx + int(SAFE * sx),
            8 + top_h + 16 + int(SAFE * sy),
            tx + int((SAFE + SHIELD_W) * sx) - 1,
            8 + top_h + 16 + int((SAFE + SHIELD_H) * sy) - 1,
        ]
        tdraw = ImageDraw.Draw(sheet)
        tdraw.rectangle(tbox, outline=(0xE8, 0xB8, 0x6D), width=1)
        draw.text((x + 4, sheet_h - 18), key.upper(), fill=(0xF3, 0xE6, 0xC8), font=cap)
        x += CARD_W + gap
    return sheet


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    cards: dict[str, Image.Image] = {}
    report: list[str] = []
    for key, spec in FACES.items():
        src = Image.open(SRC / spec["src"])
        if src.size[0] >= src.size[1]:
            framed = portrait_reframe(
                src, spec["fx"], spec["fy"], spec["zoom"], spec["focus_in_frame"]
            )
        else:
            framed = src.convert("RGB").resize((CARD_W, CARD_H), Image.Resampling.LANCZOS)
        baked = bake_indices(framed, spec["letter"])
        assert baked.size == (CARD_W, CARD_H)
        dest = MEDIA / spec["out"]
        save_png(baked, dest)
        cards[key] = baked
        region = (SAFE, SAFE, SAFE + SHIELD_W, SAFE + SHIELD_H)
        lh = measure_letter_height(baked, region)
        ct = contrast_thumb(baked)
        report.append(
            f"{spec['out']}: {baked.size[0]}×{baked.size[1]} letter≈{lh}px "
            f"thumbΔ={ct:.0f} src={src.size[0]}×{src.size[1]}"
        )
        if lh < LETTER_MIN_H:
            raise SystemExit(f"{spec['out']}: letter height {lh} < {LETTER_MIN_H}")

    src = Image.open(SRC / BACK["src"])
    back = portrait_reframe(src, BACK["fx"], BACK["fy"], BACK["zoom"], BACK["focus_in_frame"])
    back = card_frame(back)
    save_png(back, MEDIA / BACK["out"])
    report.append(f"{BACK['out']}: {back.size[0]}×{back.size[1]} (no index)")

    # Four faces must not be a hue-shift of one another.
    arrs = [np.asarray(cards[k], dtype=np.float32) for k in ("a", "k", "q", "joker")]
    for i, ka in enumerate(("a", "k", "q", "joker")):
        for kb, b in zip(("a", "k", "q", "joker")[i + 1 :], arrs[i + 1 :]):
            mse = float(np.mean((arrs[i] - b) ** 2))
            report.append(f"mse {ka} vs {kb}: {mse:.1f}")
            if mse < 400:
                raise SystemExit(f"faces {ka}/{kb} too similar (mse={mse:.1f})")

    sheet = make_safezone_sheet(cards)
    save_png(sheet, DOCS_IMG / "牌面与发牌-角标安全区示意.png")
    print("\n".join(report))
    print("wrote", DOCS_IMG / "牌面与发牌-角标安全区示意.png")


if __name__ == "__main__":
    main()
