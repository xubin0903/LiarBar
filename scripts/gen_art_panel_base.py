#!/usr/bin/env python3
"""FINAL art — doc 23 #4: art_panel_base (shared overlay panel wood + brass rim).

Spec:
  23:66 / 22 K1 22:577 — 一套面板底 art_panel_base，九宫可拉伸；256×256，九宫 slice 48。
  Palette = docs/04-设计/夜半酒馆-风格板.md §2 (= 23 §2 token 表).
  Deterministic: SEED_FINAL drives wood-grain; 4x supersample then LANCZOS.
  Same paint recipe as scripts/gen_art_drafts_23.py panel() (draft_panel_base),
  but this writes formal media — does NOT touch draft_* or gen_art_drafts_23.py.

Outputs:
  entry/src/main/resources/base/media/art_panel_base.png
  docs/04-设计/art-drafts/23/final_panel_base_strip.png  (readability strip, docs only)

Usage: python3 scripts/gen_art_panel_base.py
"""

from __future__ import annotations

import hashlib
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
DOCS = ROOT / "docs/04-设计/art-drafts/23"

SEED_FINAL = 202610231  # formal (distinct from draft SEED_DRAFT=202610071)
SS = 4
SIZE = 256
SLICE = 48  # 九宫 slice（四边等宽）
RADIUS = 24
RIM = 8

# --- tokens (夜半酒馆-风格板 §2) ---
TAVERN_BG = (0x1A, 0x12, 0x0E)
TAVERN_FELT = (0x2C, 0x18, 0x14)
TAVERN_PANEL = (0x3D, 0x24, 0x1C)
TAVERN_CANDLE = (0xE8, 0xB8, 0x6D)
TAVERN_BRASS = (0xC4, 0xA4, 0x6A)
TAVERN_PAPER = (0xF3, 0xE6, 0xC8)
TAVERN_MUTE = (0x8A, 0x73, 0x5A)
TAVERN_ACCENT = (0xF0, 0xC1, 0x4B)

FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


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
    freq = [
        rng.uniform(0.006, 0.012),
        rng.uniform(0.02, 0.04),
        rng.uniform(0.05, 0.08),
        rng.uniform(0.003, 0.006),
    ]
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
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255
    )
    return m


def panel(w: int, h: int, radius: int, rim: int, rng: random.Random) -> Image.Image:
    """Wood panel + brass rim + inner candle hairline. 9-slice friendly (rim/corners uniform)."""
    W, H, R, RIM = w * SS, h * SS, radius * SS, rim * SS
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # brass rim (vertical gradient candle→brass→mute)
    rim_img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(rim_img)
    for y in range(H):
        t = y / max(1, H - 1)
        c = (
            mix(TAVERN_CANDLE, TAVERN_BRASS, min(1, t * 2))
            if t < 0.5
            else mix(TAVERN_BRASS, TAVERN_MUTE, (t - 0.5) * 2)
        )
        d.line([(0, y), (W, y)], fill=c)
    out.paste(rim_img, (0, 0), rounded_mask((W, H), R))
    # wood body
    iw, ih = w - 2 * rim, h - 2 * rim
    body = wood(iw, ih, rng).resize((iw * SS, ih * SS), Image.BICUBIC)
    vig = Image.new("L", body.size, 0)
    ImageDraw.Draw(vig).rounded_rectangle(
        (0, 0, body.size[0] - 1, body.size[1] - 1),
        radius=max(1, R - RIM),
        outline=255,
        width=10 * SS,
    )
    vig = vig.filter(ImageFilter.GaussianBlur(8 * SS))
    body = Image.composite(
        Image.new("RGB", body.size, TAVERN_BG), body, vig.point(lambda v: int(v * 0.55))
    )
    out.paste(body, (RIM, RIM), rounded_mask(body.size, max(1, R - RIM)))
    # inner candle hairline
    ImageDraw.Draw(out).rounded_rectangle(
        (RIM + 3 * SS, RIM + 3 * SS, W - RIM - 3 * SS - 1, H - RIM - 3 * SS - 1),
        radius=max(1, R - RIM - 3 * SS),
        outline=rgba(TAVERN_CANDLE, 110),
        width=1 * SS,
    )
    return down(out, (w, h))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_strip(panel_img: Image.Image) -> Image.Image:
    """Readability strip: 9-slice stretch mock + paper sample text on bg/panel."""
    # Layout: left = 256 source; mid = stretched 420×180 (9-slice); right = small bar 280×48
    W, H = 980, 320
    canvas = Image.new("RGBA", (W, H), rgba(TAVERN_BG))
    d = ImageDraw.Draw(canvas)
    f = font(FONT_LATIN, 14)
    f_sm = font(FONT_LATIN, 12)

    # source
    canvas.paste(panel_img, (24, 32), panel_img)
    d.text((24, 8), "art_panel_base 256  slice=48", fill=rgba(TAVERN_PAPER), font=f)

    # 9-slice stretch mock (manual paste corners/edges/center)
    def nine(src: Image.Image, tw: int, th: int) -> Image.Image:
        s = SLICE
        out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        # corners
        out.paste(src.crop((0, 0, s, s)), (0, 0))
        out.paste(src.crop((SIZE - s, 0, SIZE, s)), (tw - s, 0))
        out.paste(src.crop((0, SIZE - s, s, SIZE)), (0, th - s))
        out.paste(src.crop((SIZE - s, SIZE - s, SIZE, SIZE)), (tw - s, th - s))
        # edges
        top = src.crop((s, 0, SIZE - s, s)).resize((tw - 2 * s, s), Image.LANCZOS)
        bot = src.crop((s, SIZE - s, SIZE - s, SIZE)).resize((tw - 2 * s, s), Image.LANCZOS)
        left = src.crop((0, s, s, SIZE - s)).resize((s, th - 2 * s), Image.LANCZOS)
        right = src.crop((SIZE - s, s, SIZE, SIZE - s)).resize((s, th - 2 * s), Image.LANCZOS)
        out.paste(top, (s, 0))
        out.paste(bot, (s, th - s))
        out.paste(left, (0, s))
        out.paste(right, (tw - s, s))
        # center
        ctr = src.crop((s, s, SIZE - s, SIZE - s)).resize(
            (tw - 2 * s, th - 2 * s), Image.LANCZOS
        )
        out.paste(ctr, (s, s))
        return out

    big = nine(panel_img, 420, 180)
    canvas.paste(big, (300, 40), big)
    d.text((300, 8), "9-slice stretch 420x180 (settings/pause)", fill=rgba(TAVERN_PAPER), font=f)
    # sample paper line inside stretched panel
    d.text((320, 110), "tavern_paper on panel — contrast OK", fill=rgba(TAVERN_PAPER), font=f)

    # pending/ff 小条高常 < 2*slice；演示用 96 高（仍九宫），控件侧可更矮靠程序裁
    bar = nine(panel_img, 280, 120)
    canvas.paste(bar, (300, 230), bar)
    d.text((312, 266), "small bar mock 280x120 (pending/ff)", fill=rgba(TAVERN_PAPER), font=f_sm)
    d.text((300, 214), "pending/ff strip", fill=rgba(TAVERN_MUTE), font=f_sm)

    # overlay swatches
    d.text((760, 8), "overlay (program)", fill=rgba(TAVERN_PAPER), font=f)
    for i, (label, alpha) in enumerate(
        (("pause 60%", 153), ("settings 72%", 184), ("settings 75%", 191))
    ):
        y = 36 + i * 70
        sw = Image.new("RGBA", (180, 56), (0, 0, 0, 0))
        # under: felt strip
        ImageDraw.Draw(sw).rectangle((0, 0, 179, 55), fill=rgba(TAVERN_FELT))
        ImageDraw.Draw(sw).rectangle((0, 0, 179, 55), fill=rgba(TAVERN_BG, alpha))
        ImageDraw.Draw(sw).text((8, 18), label, fill=rgba(TAVERN_PAPER), font=f_sm)
        canvas.paste(sw, (760, y), sw)

    return canvas


def main():
    MEDIA.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    rng = random.Random(SEED_FINAL)
    img = panel(SIZE, SIZE, RADIUS, RIM, rng)

    # corner alpha must be 0 outside rounded rect — already from mask
    # assert 9-slice safe: rim+radius < SLICE
    assert RIM + RADIUS <= SLICE, f"corner {RIM}+{RADIUS} must fit in slice {SLICE}"

    out = MEDIA / "art_panel_base.png"
    img.save(out, "PNG")
    h = sha256_file(out)
    print(f"{out.relative_to(ROOT)}  {img.size}  {out.stat().st_size} B  sha256={h}")

    strip = make_strip(img)
    strip_path = DOCS / "final_panel_base_strip.png"
    strip.save(strip_path, "PNG")
    print(
        f"{strip_path.relative_to(ROOT)}  {strip.size}  {strip_path.stat().st_size} B  "
        f"sha256={sha256_file(strip_path)}"
    )

    # re-run determinism check
    rng2 = random.Random(SEED_FINAL)
    img2 = panel(SIZE, SIZE, RADIUS, RIM, rng2)
    assert list(img.get_flattened_data()) == list(img2.get_flattened_data()), "non-deterministic paint"
    print("determinism OK; slice=48; radius=24; rim=8")


if __name__ == "__main__":
    main()
