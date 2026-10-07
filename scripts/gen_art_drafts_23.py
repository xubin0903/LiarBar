#!/usr/bin/env python3
"""DRAFT ONLY — doc 23 style drafts (settlement / records / pause / settings).

Outputs go to docs/04-设计/art-drafts/23/ (NOT entry/src/main/resources/**/media).
Formal art waits for UI wireframe doc 22; file names here are draft_* on purpose.

Palette = tokens of docs/04-设计/夜半酒馆-风格板.md §2
(same values as entry/src/main/resources/base/element/color.json and
scripts/gen_scaffold_assets.py). Derived shades are linear mixes of tokens only.

Deterministic: SEED_DRAFT drives wood-grain noise; 4x supersample then LANCZOS.
Read-only reuse for the contact sheet: art_life_candle_body / _flame_full /
_extinguish_3 (#108 polish) — composited in memory, media files untouched.

Usage: python3 scripts/gen_art_drafts_23.py
"""

from __future__ import annotations

import hashlib
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/04-设计/art-drafts/23"
MEDIA = ROOT / "entry/src/main/resources/base/media"

SEED_DRAFT = 202610071
SS = 4  # supersample

# --- tokens (夜半酒馆-风格板 §2) ---
TAVERN_BG = (0x1A, 0x12, 0x0E)
TAVERN_FELT = (0x2C, 0x18, 0x14)
TAVERN_PANEL = (0x3D, 0x24, 0x1C)
TAVERN_CANDLE = (0xE8, 0xB8, 0x6D)
TAVERN_BRASS = (0xC4, 0xA4, 0x6A)
TAVERN_PAPER = (0xF3, 0xE6, 0xC8)
TAVERN_MUTE = (0x8A, 0x73, 0x5A)
TAVERN_SHADOW = (0x0E, 0x1A, 0x22)
TAVERN_ACCENT = (0xF0, 0xC1, 0x4B)
TAVERN_DANGER = (0xC2, 0x3A, 0x3A)
TAVERN_SUCCESS = (0xD4, 0xA0, 0x17)
TAVERN_SETTLE_OK = (0x3D, 0x6B, 0x4A)
TAVERN_LIFE_EMPTY = (0x4A, 0x30, 0x28)
TAVERN_DANGER_DEEP = (0x6B, 0x12, 0x18)
TAVERN_GHOST = (0x6E, 0x7A, 0x86)

FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rgba(c, a: int = 255):
    return (c[0], c[1], c[2], a)


def font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def down(img: Image.Image, size) -> Image.Image:
    return img.resize(size, Image.LANCZOS)


def wood(w: int, h: int, rng: random.Random, base=TAVERN_PANEL, dark=TAVERN_FELT) -> Image.Image:
    """Horizontal wood grain from tokens only (panel ↔ felt)."""
    img = Image.new("RGB", (w, h), base)
    px = img.load()
    phase = [rng.uniform(0, math.tau) for _ in range(4)]
    freq = [rng.uniform(0.006, 0.012), rng.uniform(0.02, 0.04), rng.uniform(0.05, 0.08), rng.uniform(0.003, 0.006)]
    for y in range(h):
        for x in range(w):
            v = (
                0.45 * math.sin(y * 0.11 + 2.2 * math.sin(x * freq[0] + phase[0]) + phase[1])
                + 0.25 * math.sin(y * 0.37 + x * freq[1] + phase[2])
                + 0.15 * math.sin(x * freq[2] + y * 0.05 + phase[3])
                + 0.15 * math.sin(x * freq[3])
            )
            t = 0.5 + 0.5 * v
            px[x, y] = mix(base, dark, 0.15 + 0.55 * t)
    return img


def rounded_mask(size, radius: int) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def panel(w: int, h: int, radius: int, rim: int, rng: random.Random, header: int = 0) -> Image.Image:
    """Wood panel + brass rim + inner candle hairline. 9-slice friendly (rim/corners uniform)."""
    W, H, R, RIM = w * SS, h * SS, radius * SS, rim * SS
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # brass rim (vertical gradient candle→brass→mute)
    rim_img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(rim_img)
    for y in range(H):
        t = y / max(1, H - 1)
        c = mix(TAVERN_CANDLE, TAVERN_BRASS, min(1, t * 2)) if t < 0.5 else mix(TAVERN_BRASS, TAVERN_MUTE, (t - 0.5) * 2)
        d.line([(0, y), (W, y)], fill=c)
    out.paste(rim_img, (0, 0), rounded_mask((W, H), R))
    # wood body (grain generated at 1x then upscaled: cheap + deterministic)
    iw, ih = w - 2 * rim, h - 2 * rim
    body = wood(iw, ih, rng).resize((iw * SS, ih * SS), Image.BICUBIC)
    # vignette toward edges (felt/bg) — keeps centre readable for paper text
    vig = Image.new("L", body.size, 0)
    ImageDraw.Draw(vig).rounded_rectangle((0, 0, body.size[0] - 1, body.size[1] - 1), radius=max(1, R - RIM), outline=255, width=10 * SS)
    vig = vig.filter(ImageFilter.GaussianBlur(8 * SS))
    body = Image.composite(Image.new("RGB", body.size, TAVERN_BG), body, vig.point(lambda v: int(v * 0.55)))
    if header:
        hd = ImageDraw.Draw(body)
        hy = header * SS
        hd.rectangle((0, 0, body.size[0], hy), fill=mix(TAVERN_FELT, TAVERN_BG, 0.35))
        hd.line([(RIM, hy), (body.size[0] - RIM, hy)], fill=TAVERN_BRASS, width=2 * SS)
    out.paste(body, (RIM, RIM), rounded_mask(body.size, max(1, R - RIM)))
    # inner candle hairline
    ImageDraw.Draw(out).rounded_rectangle(
        (RIM + 3 * SS, RIM + 3 * SS, W - RIM - 3 * SS - 1, H - RIM - 3 * SS - 1),
        radius=max(1, R - RIM - 3 * SS), outline=rgba(TAVERN_CANDLE, 110), width=1 * SS)
    return down(out, (w, h))


def plate_icon(draw_glyph, pressed: bool = False) -> Image.Image:
    """96 grid: 8 pad · 80 plate · glyph box 56 (centred). Rim 3px brass (style board 2~3px @96)."""
    S = 96 * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p0, p1 = 8 * SS, 88 * SS
    fill = TAVERN_ACCENT if pressed else TAVERN_PANEL
    d.ellipse((p0, p0, p1, p1), fill=rgba(fill), outline=rgba(TAVERN_BRASS), width=3 * SS)
    glyph_col = TAVERN_BG if pressed else TAVERN_PAPER
    draw_glyph(d, glyph_col)
    return down(img, (96, 96))


def g_gear(d: ImageDraw.ImageDraw, col):
    c = 48 * SS
    r_out, r_in, r_hole = 25 * SS, 18 * SS, 7 * SS
    pts = []
    teeth = 8
    for i in range(teeth * 4):
        a = i / (teeth * 4) * math.tau - math.pi / 2
        r = r_out if (i % 4) in (1, 2) else r_in
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, fill=rgba(col))
    d.ellipse((c - r_in + 2 * SS, c - r_in + 2 * SS, c + r_in - 2 * SS, c + r_in - 2 * SS), fill=rgba(col))
    d.ellipse((c - r_hole, c - r_hole, c + r_hole, c + r_hole), fill=(0, 0, 0, 0))


def g_pause(d, col):
    bw, bh, gap = 11 * SS, 36 * SS, 10 * SS
    c = 48 * SS
    for x0 in (c - gap // 2 - bw, c + gap // 2):
        d.rounded_rectangle((x0, c - bh // 2, x0 + bw, c + bh // 2), radius=3 * SS, fill=rgba(col))


def _plate_of(col):
    """Glyph colour tells us the state: paper = normal (plate panel), bg = pressed (plate accent)."""
    return TAVERN_ACCENT if col == TAVERN_BG else TAVERN_PANEL


def g_mute(d, col):
    """Settings 静音 (mute_all): speaker + bold X beside it = ALL sound off.
    Speaker stays whole (no slash through it) so it still reads as 'speaker' at 24px."""
    x_col = TAVERN_DANGER if col != TAVERN_BG else TAVERN_BG
    # speaker: box + flared cone (filled), shifted left
    d.rectangle((20 * SS, 38 * SS, 33 * SS, 58 * SS), fill=rgba(col))
    d.polygon([(31 * SS, 38 * SS), (50 * SS, 22 * SS), (50 * SS, 74 * SS), (31 * SS, 58 * SS)], fill=rgba(col))
    # bold X on the right
    for (p0, p1) in (((57 * SS, 37 * SS), (77 * SS, 59 * SS)), ((57 * SS, 59 * SS), (77 * SS, 37 * SS))):
        d.line([p0, p1], fill=rgba(x_col), width=8 * SS)
        for (x, y) in (p0, p1):
            r = 4 * SS
            d.ellipse((x - r, y - r, x + r, y + r), fill=rgba(x_col))


def g_silent_match(d, col):
    """Lobby 静默局 (lb_tog_silent): tavern hand-bell with an amber ribbon (手铃加琥珀缎带; brass rim = plate ring) = no urging / taunts.
    Deliberately NOT a speaker and NO X/slash, so it never reads as 'mute'."""
    plate = _plate_of(col)
    band = TAVERN_CANDLE if col != TAVERN_BG else TAVERN_PANEL
    c = 48 * SS
    d.ellipse((c - 6 * SS, 16 * SS, c + 6 * SS, 28 * SS), fill=rgba(col))          # handle knob
    d.pieslice((c - 21 * SS, 24 * SS, c + 21 * SS, 66 * SS), 180, 360, fill=rgba(col))  # dome
    d.rectangle((c - 21 * SS, 44 * SS, c + 21 * SS, 62 * SS), fill=rgba(col))
    d.polygon([(c - 21 * SS, 58 * SS), (c + 21 * SS, 58 * SS), (c + 29 * SS, 70 * SS), (c - 29 * SS, 70 * SS)], fill=rgba(col))
    d.ellipse((c - 5 * SS, 70 * SS, c + 5 * SS, 78 * SS), fill=rgba(col))         # clapper stub
    # amber ribbon (plate gap + candle-colour band), knot tails to the right
    d.rectangle((c - 25 * SS, 42 * SS, c + 25 * SS, 56 * SS), fill=rgba(plate))
    d.rectangle((c - 23 * SS, 44 * SS, c + 23 * SS, 54 * SS), fill=rgba(band))
    d.polygon([(c + 20 * SS, 46 * SS), (c + 34 * SS, 38 * SS), (c + 32 * SS, 50 * SS)], fill=rgba(band))
    d.polygon([(c + 20 * SS, 52 * SS), (c + 34 * SS, 62 * SS), (c + 27 * SS, 64 * SS)], fill=rgba(band))


def g_records(d, col):
    """Ledger / tally book: lobby-only entry (PM 2026-10-07)."""
    x0, y0, x1, y1 = 30 * SS, 24 * SS, 66 * SS, 72 * SS
    d.rounded_rectangle((x0, y0, x1, y1), radius=4 * SS, fill=rgba(col))
    hole = (0, 0, 0, 0)
    # spine notch + ruled lines (cut-outs read at 32vp)
    d.rectangle((x0 + 6 * SS, y0, x0 + 9 * SS, y1), fill=hole)
    for i, y in enumerate((36, 46, 56)):
        d.rectangle((x0 + 14 * SS, y * SS, x1 - 6 * SS - (8 * SS if i == 2 else 0), y * SS + 3 * SS), fill=hole)


def hl_badge(kind: str) -> Image.Image:
    """Highlight medallion, 96×96. Kinds = doc 21 §1.4 (H1/H2/H3), one shared shape:
    brass ring + coloured face + panel plate + paper glyph + red ribbon; only face colour + glyph change.
      long_bluff     H1 最大连骗  face candle   glyph = half mask
      best_challenge H2 最准质疑  face success  glyph = crosshair
      worst_break    H3 最惨连熄  face danger_deep glyph = snuffed candle + smoke
    """
    S = 96 * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = 48 * SS
    face = {"long_bluff": TAVERN_CANDLE, "best_challenge": TAVERN_SUCCESS, "worst_break": TAVERN_DANGER_DEEP}[kind]
    P = rgba(TAVERN_PAPER)
    for sx in (-1, 1):
        d.polygon([(c + sx * 10 * SS, 60 * SS), (c + sx * 26 * SS, 90 * SS), (c + sx * 16 * SS, 86 * SS),
                   (c + sx * 12 * SS, 94 * SS), (c, 66 * SS)], fill=rgba(mix(TAVERN_DANGER, TAVERN_BG, 0.2)))
    d.ellipse((c - 36 * SS, c - 40 * SS, c + 36 * SS, c + 32 * SS), fill=rgba(TAVERN_BRASS))
    d.ellipse((c - 31 * SS, c - 35 * SS, c + 31 * SS, c + 27 * SS), fill=rgba(face))
    d.ellipse((c - 25 * SS, c - 29 * SS, c + 25 * SS, c + 21 * SS), fill=rgba(TAVERN_PANEL))
    cy = c - 4 * SS
    if kind == "best_challenge":
        d.ellipse((c - 15 * SS, cy - 15 * SS, c + 15 * SS, cy + 15 * SS), outline=P, width=3 * SS)
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            d.line([(c + dx * 9 * SS, cy + dy * 9 * SS), (c + dx * 21 * SS, cy + dy * 21 * SS)], fill=P, width=3 * SS)
        d.ellipse((c - 3 * SS, cy - 3 * SS, c + 3 * SS, cy + 3 * SS), fill=rgba(TAVERN_DANGER))
    elif kind == "long_bluff":
        # half mask: brow band + two eye holes + nose dip
        d.rounded_rectangle((c - 20 * SS, cy - 9 * SS, c + 20 * SS, cy + 7 * SS), radius=8 * SS, fill=P)
        d.polygon([(c - 4 * SS, cy + 7 * SS), (c + 4 * SS, cy + 7 * SS), (c, cy + 1 * SS)], fill=rgba(TAVERN_PANEL))
        for ex in (-10, 10):
            d.ellipse((c + (ex - 5) * SS, cy - 4 * SS, c + (ex + 5) * SS, cy + 3 * SS), fill=rgba(TAVERN_PANEL))
        d.line([(c + 20 * SS, cy - 2 * SS), (c + 22 * SS, cy + 12 * SS)], fill=rgba(TAVERN_CANDLE), width=2 * SS)  # ribbon tie
    else:  # worst_break
        d.rounded_rectangle((c - 7 * SS, cy - 2 * SS, c + 7 * SS, cy + 18 * SS), radius=2 * SS, fill=P)
        d.line([(c, cy - 2 * SS), (c, cy - 6 * SS)], fill=rgba(TAVERN_MUTE), width=2 * SS)  # snuffed wick
        d.arc((c - 6 * SS, cy - 22 * SS, c + 6 * SS, cy - 8 * SS), 90, 270, fill=rgba(TAVERN_GHOST), width=2 * SS)
        d.arc((c - 6 * SS, cy - 30 * SS, c + 6 * SS, cy - 16 * SS), 270, 90, fill=rgba(TAVERN_GHOST), width=2 * SS)
        for k, x in enumerate((-17, 17)):  # two out-pips = "连熄"
            d.ellipse((c + (x - 3) * SS, cy + 10 * SS, c + (x + 3) * SS, cy + 16 * SS), fill=rgba(TAVERN_DANGER))
    d.arc((c - 34 * SS, c - 38 * SS, c + 34 * SS, c + 30 * SS), 200, 250, fill=rgba(TAVERN_PAPER, 170), width=2 * SS)
    return down(img, (96, 96))


def slider_track(w=480, h=24) -> Image.Image:
    W, H = w * SS, h * SS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=H // 2, fill=rgba(TAVERN_BRASS))
    d.rounded_rectangle((2 * SS, 2 * SS, W - 2 * SS - 1, H - 2 * SS - 1), radius=H // 2 - 2 * SS, fill=rgba(mix(TAVERN_SHADOW, TAVERN_BG, 0.5)))
    d.line([(H // 2, 6 * SS), (W - H // 2, 6 * SS)], fill=rgba(TAVERN_BG, 200), width=2 * SS)  # inner groove shade
    return down(img, (w, h))


def slider_fill(w=480, h=24) -> Image.Image:
    W, H = w * SS, h * SS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = Image.new("RGB", (W, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / (H - 1)
        gd.line([(0, y), (W, y)], fill=mix(TAVERN_ACCENT, TAVERN_CANDLE, t) if t < 0.6 else mix(TAVERN_CANDLE, TAVERN_SUCCESS, (t - 0.6) / 0.4))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((2 * SS, 2 * SS, W - 2 * SS - 1, H - 2 * SS - 1), radius=H // 2 - 2 * SS, fill=255)
    img.paste(grad, (0, 0), m)
    ImageDraw.Draw(img).line([(H // 2, 6 * SS), (W - H // 2, 6 * SS)], fill=rgba(TAVERN_PAPER, 120), width=2 * SS)
    return down(img, (w, h))


def slider_thumb(s=64) -> Image.Image:
    """Wax-seal / brass knob. 64 visual, hit ≥48vp by control."""
    S = s * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    sh = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sh).ellipse((10 * SS, 14 * SS, 56 * SS, 60 * SS), fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(3 * SS))
    img.paste(Image.new("RGBA", (S, S), rgba(TAVERN_BG)), (0, 0), sh)
    d.ellipse((8 * SS, 8 * SS, 56 * SS, 56 * SS), fill=rgba(TAVERN_BRASS))
    d.ellipse((12 * SS, 12 * SS, 52 * SS, 52 * SS), fill=rgba(TAVERN_PANEL))
    d.ellipse((20 * SS, 20 * SS, 44 * SS, 44 * SS), fill=rgba(TAVERN_CANDLE))
    d.ellipse((26 * SS, 24 * SS, 34 * SS, 30 * SS), fill=rgba(TAVERN_PAPER, 200))
    return down(img, (s, s))


def demo_badge(w=160, h=56) -> Image.Image:
    """In-game '演示' corner tag chrome. Text is overlaid by the control (not baked)."""
    W, H = w * SS, h * SS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=8 * SS, fill=rgba(TAVERN_DANGER), outline=rgba(TAVERN_BRASS), width=2 * SS)
    d.rounded_rectangle((5 * SS, 5 * SS, W - 5 * SS - 1, H - 5 * SS - 1), radius=5 * SS, fill=rgba(mix(TAVERN_DANGER, TAVERN_BG, 0.55)),
                        outline=rgba(TAVERN_CANDLE, 140), width=1 * SS)
    # left candle dot = "recording/demo" cue, leaves right 2/3 for text
    d.ellipse((14 * SS, H // 2 - 7 * SS, 28 * SS, H // 2 + 7 * SS), fill=rgba(TAVERN_ACCENT))
    return down(img, (w, h))


def small_strip(parts: dict) -> Image.Image:
    """Readability strip: mute / silent_match at 24 / 32 / 48 px on tavern_bg and tavern_panel."""
    sizes = (24, 32, 48)
    bgs = (("bg #1A120E", TAVERN_BG), ("panel #3D241C", TAVERN_PANEL))
    W, H = 560, 230
    out = Image.new("RGBA", (W, H), rgba(TAVERN_BG))
    d = ImageDraw.Draw(out)
    label(d, (12, 8), "DRAFT · mute / silent_match @ 24 / 32 / 48 px", 14, TAVERN_CANDLE)
    for r, (nm, col) in enumerate(bgs):
        y0 = 34 + r * 96
        d.rectangle((0, y0, W, y0 + 90), fill=rgba(col))
        label(d, (12, y0 + 36), nm, 12, TAVERN_MUTE)
        x = 130
        for sz in sizes:
            for key in ("draft_icon_mute.png", "draft_icon_silent_match.png"):
                ic = parts[key].resize((sz, sz), Image.LANCZOS)
                out.alpha_composite(ic, (x, y0 + 45 - sz // 2))
                x += sz + 14
            x += 24
    return out


def stamp(img: Image.Image, text: str = "DRAFT") -> Image.Image:
    out = img.copy()
    d = ImageDraw.Draw(out)
    f = font(FONT_LATIN, max(10, img.width // 16))
    d.text((img.width - 6, img.height - 6), text, font=f, anchor="rd", fill=rgba(TAVERN_PAPER, 150))
    return out


def label(d, xy, text, size=18, col=TAVERN_PAPER, cjk=False):
    d.text(xy, text, font=font(FONT_CJK if cjk else FONT_LATIN, size), fill=rgba(col))


def contact_sheet(parts: dict, rng: random.Random) -> Image.Image:
    W, H = 1600, 1020
    sheet = Image.new("RGBA", (W, H), rgba(TAVERN_BG))
    d = ImageDraw.Draw(sheet)
    label(d, (32, 20), "DRAFT · 23 结算/战绩/暂停/设置 风格草稿 v0.3 · 正式图等 UI 22", 26, TAVERN_CANDLE, cjk=True)
    label(d, (32, 58), f"seed {SEED_DRAFT} · palette = 夜半酒馆风格板 §2 · 非交件 · 不进 media", 16, TAVERN_MUTE, cjk=True)

    # settlement mock (landscape, 9-slice stretched)
    rp = panel(900, 520, 32, 10, random.Random(SEED_DRAFT + 11), header=72)
    sheet.alpha_composite(rp, (32, 100))
    label(d, (64, 126), "结算（暂排 · 字段见 21 §1.2）", 26, TAVERN_PAPER, cjk=True)
    # seat labels are neutral placeholders (self/p1..p3); real names/fields come from 21
    seats = [("self", 2, "#1", TAVERN_SUCCESS, "留下"), ("p1", 0, "#2", TAVERN_MUTE, "第3个出局"),
             ("p2", 0, "#3", TAVERN_MUTE, "第2个出局"), ("p3", 0, "#4", TAVERN_MUTE, "第1个出局")]
    cs = (48, 60)
    body = Image.open(MEDIA / "art_life_candle_body.png").convert("RGBA").resize(cs, Image.LANCZOS)
    flame = Image.open(MEDIA / "art_life_candle_flame_full.png").convert("RGBA").resize(cs, Image.LANCZOS)
    out3 = Image.open(MEDIA / "art_life_candle_extinguish_3.png").convert("RGBA").resize(cs, Image.LANCZOS)
    # proposal for "burnt out" read: dim body to 45% alpha (program-side; no new PNG unless 22 asks)
    body_out = body.copy()
    body_out.putalpha(body_out.getchannel("A").point(lambda v: int(v * 0.45)))
    for i, (name, alive, rank, col, tag) in enumerate(seats):
        y = 200 + i * 78
        d.rounded_rectangle((64, y, 540, y + 66), radius=12, fill=rgba(mix(TAVERN_PANEL, TAVERN_BG, 0.35), 230),
                            outline=rgba(TAVERN_BRASS, 100), width=1)
        label(d, (84, y + 18), rank, 22, col)
        label(d, (150, y + 18), name, 22, TAVERN_PAPER)
        label(d, (240, y + 22), tag, 15, col, cjk=True)
        for k in range(3):
            x = 340 + k * 56
            lit = k < alive
            sheet.alpha_composite(body if lit else body_out, (x, y + 3))
            sheet.alpha_composite(flame if lit else out3, (x, y + 3))
    label(d, (560, 210), "三烛复用 #108", 15, TAVERN_MUTE, cjk=True)
    label(d, (560, 290), "亮 = body + flame_full", 15, TAVERN_MUTE, cjk=True)
    label(d, (560, 368), "熄 = body 45% + extinguish_3", 15, TAVERN_MUTE, cjk=True)
    label(d, (560, 446), "（熄烛读法待 22 定）", 15, TAVERN_MUTE, cjk=True)
    for k, (key, title) in enumerate((("long_bluff", "最大连骗"), ("best_challenge", "最准质疑"), ("worst_break", "最惨连熄"))):
        hb = parts[f"draft_hl_{key}.png"].resize((64, 64), Image.LANCZOS)
        sheet.alpha_composite(hb, (64 + k * 200, 528))
        label(d, (134 + k * 200, 548), title, 18, TAVERN_PAPER, cjk=True)
    label(d, (660, 548), "21 §1.4 H1/H2/H3", 14, TAVERN_MUTE)

    # pause/settings panel (shared base)
    pb = panel(600, 520, 24, 8, random.Random(SEED_DRAFT + 12))
    sheet.alpha_composite(pb, (968, 100))
    label(d, (1000, 126), "共用面板底：暂停/设置/规则/确认/后台继续/出局二选", 20, TAVERN_PAPER, cjk=True)
    track, fill, thumb = parts["draft_slider_track.png"], parts["draft_slider_fill.png"], parts["draft_slider_thumb.png"]
    for j, (nm, pct) in enumerate((("音乐", 0.7), ("音效与语音", 0.45))):
        y = 200 + j * 90
        label(d, (1000, y), nm, 20, TAVERN_PAPER, cjk=True)
        tw = 340
        t = track.resize((tw, 24), Image.LANCZOS)
        sheet.alpha_composite(t, (1140, y + 4))
        fw = int(tw * pct)
        f = fill.crop((0, 0, fw, 24)) if fw <= fill.width else fill
        # keep right cap round: paste fill cropped + its own right cap
        cap = fill.crop((fill.width - 12, 0, fill.width, 24))
        sheet.alpha_composite(fill.crop((0, 0, max(12, fw - 12), 24)), (1140, y + 4))
        sheet.alpha_composite(cap, (1140 + max(12, fw - 12), y + 4))
        sheet.alpha_composite(thumb, (1140 + fw - 32, y + 4 - 20))
    # icons: normal + pressed row
    for k, nm in enumerate(("settings", "pause", "records")):
        x = 1000 + k * 180
        sheet.alpha_composite(parts[f"draft_icon_{nm}.png"], (x, 400))
        sheet.alpha_composite(parts[f"_on_{nm}"], (x + 80, 400))
        label(d, (x, 500), {"settings": "齿轮·大厅顶栏+暂停层", "pause": "暂停·局内", "records": "战绩·仅大厅顶栏"}[nm], 14, TAVERN_MUTE, cjk=True)
    label(d, (1000, 530), "左=常态  右=按下(_on)；禁用=控件降透明，不出图", 14, TAVERN_MUTE, cjk=True)
    label(d, (1000, 360), "暂停层菜单（21 §3.5）：继续 / 设置 / 规则 / 结束游戏 / 回大厅", 14, TAVERN_MUTE, cjk=True)

    # demo badge in a fake corner
    db = parts["draft_badge_demo.png"]
    sheet.alpha_composite(db, (32, 660))
    dd = ImageDraw.Draw(sheet)
    dd.text((32 + 44, 660 + 28), "演示", font=font(FONT_CJK, 26), anchor="lm", fill=rgba(TAVERN_PAPER))
    label(d, (210, 668), "局内「演示」角标（隐藏演示开关开时）· 位置等 22 · 不撞 lb_btn_home / 槌锚 / 手牌 · 字由控件叠", 16, TAVERN_MUTE, cjk=True)

    # mute (settings mute_all) vs silent match (lobby lb_tog_silent): two distinct metaphors
    label(d, (32, 724), "静音 vs 静默局（两图不同隐喻；设置客户端 PR 开工前须验收，否则两处转纯文字）", 16, TAVERN_PAPER, cjk=True)
    for k, nm in enumerate(("mute", "silent_match")):
        x = 32 + k * 420
        sheet.alpha_composite(parts[f"draft_icon_{nm}.png"], (x, 756))
        sheet.alpha_composite(parts[f"_on_{nm}"], (x + 104, 756))
        for j, sz in enumerate((48, 32, 24)):
            sheet.alpha_composite(parts[f"draft_icon_{nm}.png"].resize((sz, sz), Image.LANCZOS),
                                  (x + 212 + j * 60, 804 - sz // 2))
        label(d, (x, 856), {"mute": "静音·设置 mute_all（喇叭+叉=全部声音关）",
                            "silent_match": "静默局·大厅开局 lb_tog_silent（手铃加琥珀缎带=无催促/嘲讽）"}[nm], 14, TAVERN_MUTE, cjk=True)
    label(d, (1010, 726), "左=常态 中=按下(_on) 右=48/32/24px", 14, TAVERN_MUTE, cjk=True)

    # swatches
    sw = [("bg", TAVERN_BG), ("felt", TAVERN_FELT), ("panel", TAVERN_PANEL), ("candle", TAVERN_CANDLE),
          ("brass", TAVERN_BRASS), ("paper", TAVERN_PAPER), ("mute", TAVERN_MUTE), ("shadow", TAVERN_SHADOW),
          ("accent", TAVERN_ACCENT), ("danger", TAVERN_DANGER), ("success", TAVERN_SUCCESS), ("settle_ok", TAVERN_SETTLE_OK)]
    for i, (nm, c) in enumerate(sw):
        x = 32 + i * 128
        d.rounded_rectangle((x, 884, x + 112, 936), radius=8, fill=rgba(c), outline=rgba(TAVERN_BRASS, 120), width=1)
        label(d, (x, 944), f"{nm}", 14, TAVERN_PAPER)
        label(d, (x, 964), "#%02X%02X%02X" % c, 14, TAVERN_MUTE)
    big = font(FONT_LATIN, 120)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).text((W - 40, 870), "DRAFT", font=big, anchor="rd", fill=rgba(TAVERN_PAPER, 28))
    sheet.alpha_composite(ov)
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED_DRAFT)
    parts: dict[str, Image.Image] = {}
    parts["draft_icon_settings.png"] = plate_icon(g_gear)
    parts["draft_icon_pause.png"] = plate_icon(g_pause)
    parts["draft_icon_records.png"] = plate_icon(g_records)
    parts["_on_settings"] = plate_icon(g_gear, True)
    parts["_on_pause"] = plate_icon(g_pause, True)
    parts["_on_records"] = plate_icon(g_records, True)
    parts["draft_icon_mute.png"] = plate_icon(g_mute)
    parts["draft_icon_silent_match.png"] = plate_icon(g_silent_match)
    parts["_on_mute"] = plate_icon(g_mute, True)
    parts["_on_silent_match"] = plate_icon(g_silent_match, True)
    parts["draft_icon_mute_silent_small.png"] = small_strip(parts)
    parts["draft_panel_report.png"] = stamp(panel(384, 384, 32, 10, random.Random(SEED_DRAFT + 1), header=72))
    parts["draft_panel_base.png"] = stamp(panel(256, 256, 24, 8, random.Random(SEED_DRAFT + 2)))
    for k in ("long_bluff", "best_challenge", "worst_break"):
        parts[f"draft_hl_{k}.png"] = hl_badge(k)
    parts["draft_slider_track.png"] = slider_track()
    parts["draft_slider_fill.png"] = slider_fill()
    parts["draft_slider_thumb.png"] = slider_thumb()
    parts["draft_badge_demo.png"] = demo_badge()
    parts["draft_contact_sheet.png"] = contact_sheet(parts, rng)
    for name, img in parts.items():
        if name.startswith("_"):
            continue
        p = OUT / name
        img.save(p, optimize=True)
        sha = hashlib.sha256(p.read_bytes()).hexdigest()
        print(f"{name}\t{img.width}x{img.height}\t{p.stat().st_size}\t{sha}")


if __name__ == "__main__":
    main()
