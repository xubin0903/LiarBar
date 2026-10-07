#!/usr/bin/env python3
"""FINAL art — doc 23 #14 / #15: art_icon_mute / art_icon_silent_match (+ _on).

Spec (verbatim sources, see docs/04-设计/静音与静默局图标-资产交件.md):
  23 §3 图标网格: 96 源图 = 8 边距 + 80 圆底盘（tavern_panel，3px tavern_brass 描边）+ 56 字形框；
                  实心剪影 tavern_paper；按下 _on = 底盘 tavern_accent + 字形 tavern_bg。
                  例外：#14 叉 tavern_danger（_on → tavern_bg）；#15 琥珀缎带 tavern_candle（_on → tavern_panel）。
  22:516 / K5 22:581: 静音 = 完整喇叭 + 右侧红叉，黄铜外圈；
                      静默局 = 酒馆手摇铃 + 琥珀缎带，黄铜外圈；无喇叭、无叉；两者不得共用图标。

Palette = tokens of docs/04-设计/夜半酒馆-风格板.md §2 (= 23 §3 table). Derived shades are
linear mixes of tokens only. Rim gradient candle (high) -> brass -> mute (low), per 23 §3
("tavern_candle 铜边渐变高点 / tavern_mute 铜边渐变低点").

Deterministic: no randomness. Rendered at 4x (384) then LANCZOS to 96. Outside the 80px
disc the PNG is fully transparent (alpha 0).

Outputs:
  entry/src/main/resources/base/media/art_icon_mute.png / _on.png
  entry/src/main/resources/base/media/art_icon_silent_match.png / _on.png
  docs/04-设计/art-drafts/23/final_icon_mute_silent_small.png   (readability strip, docs only)

Usage: python3 scripts/gen_art_icons_mute_silent.py
Does NOT touch gen_art_drafts_23.py or any draft_* PNG.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "entry/src/main/resources/base/media"
DOCS = ROOT / "docs/04-设计/art-drafts/23"

SS = 4                 # supersample factor
N = 96                 # final size
S = N * SS             # 384 working canvas

# --- tokens (夜半酒馆-风格板 §2 / 23 §3) ---
TAVERN_BG = (0x1A, 0x12, 0x0E)
TAVERN_FELT = (0x2C, 0x18, 0x14)
TAVERN_PANEL = (0x3D, 0x24, 0x1C)
TAVERN_CANDLE = (0xE8, 0xB8, 0x6D)
TAVERN_BRASS = (0xC4, 0xA4, 0x6A)
TAVERN_PAPER = (0xF3, 0xE6, 0xC8)
TAVERN_MUTE = (0x8A, 0x73, 0x5A)
TAVERN_ACCENT = (0xF0, 0xC1, 0x4B)
TAVERN_DANGER = (0xC2, 0x3A, 0x3A)
TAVERN_DANGER_DEEP = (0x6B, 0x12, 0x18)
TAVERN_SUCCESS = (0xD4, 0xA0, 0x17)

FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def u(v: float) -> float:
    """96-grid units -> working pixels."""
    return v * SS


# ---------------------------------------------------------------- fills
def linear_fill(c0, c1, angle_deg: float, stops=None) -> Image.Image:
    """Full-canvas RGB gradient along angle (0 = left->right, 90 = top->bottom).
    stops: optional list of (t, colour) overriding c0/c1."""
    if stops is None:
        stops = [(0.0, c0), (1.0, c1)]
    a = math.radians(angle_deg)
    dx, dy = math.cos(a), math.sin(a)
    # projection range over canvas corners
    proj = [x * dx + y * dy for x in (0, S) for y in (0, S)]
    lo, hi = min(proj), max(proj)
    # 1-D ramp of 1024 samples, then map
    ramp = []
    for i in range(1024):
        t = i / 1023
        for k in range(len(stops) - 1):
            t0, col0 = stops[k]
            t1, col1 = stops[k + 1]
            if t <= t1 or k == len(stops) - 2:
                tt = 0.0 if t1 == t0 else min(1.0, max(0.0, (t - t0) / (t1 - t0)))
                ramp.append(mix(col0, col1, tt))
                break
    img = Image.new("RGB", (S, S))
    px = img.load()
    span = hi - lo
    for y in range(S):
        for x in range(S):
            t = ((x * dx + y * dy) - lo) / span
            px[x, y] = ramp[int(t * 1023)]
    return img


def radial_fill(c_center, c_edge, cx, cy, r) -> Image.Image:
    img = Image.new("RGB", (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = min(1.0, math.hypot(x - cx, y - cy) / r)
            px[x, y] = mix(c_center, c_edge, t * t)
    return img


def disc_mask(r: float, cx: float = S / 2, cy: float = S / 2) -> Image.Image:
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r - 1, cy + r - 1), fill=255)
    return m


def solid(col) -> Image.Image:
    return Image.new("RGB", (S, S), col)


def paint(canvas: Image.Image, fill: Image.Image, mask: Image.Image):
    """Composite an RGB fill through an L mask onto RGBA canvas."""
    layer = fill.convert("RGBA")
    layer.putalpha(mask)
    canvas.alpha_composite(layer)


# ---------------------------------------------------------------- plate
C = S / 2
R_OUT = u(40)          # 80px disc
RIM = u(3)             # 3px brass stroke
R_IN = R_OUT - RIM

_cache: dict = {}


def plate(pressed: bool) -> tuple[Image.Image, Image.Image]:
    """Returns (RGBA plate, L disc mask)."""
    key = ("plate", pressed)
    if key in _cache:
        return _cache[key]
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    outer = disc_mask(R_OUT)
    inner = disc_mask(R_IN)
    # brass rim: candle (top-left high) -> brass -> mute (bottom-right low)
    rim_fill = linear_fill(None, None, 60, stops=[(0.0, TAVERN_CANDLE), (0.42, TAVERN_BRASS), (1.0, TAVERN_MUTE)])
    paint(img, rim_fill, outer)
    # plate face with soft radial falloff (lit from top-left)
    if pressed:
        face = radial_fill(mix(TAVERN_ACCENT, TAVERN_PAPER, 0.16), mix(TAVERN_ACCENT, TAVERN_SUCCESS, 0.45),
                           C - u(10), C - u(12), u(52))
    else:
        face = radial_fill(mix(TAVERN_PANEL, TAVERN_BRASS, 0.07), mix(TAVERN_PANEL, TAVERN_FELT, 0.75),
                           C - u(10), C - u(12), u(52))
    paint(img, face, inner)
    # inner bevel: dark hairline inside the rim, strongest at the top (rim casts onto face)
    ring = ImageChops.subtract(inner, disc_mask(R_IN - u(1.25)))
    shade = linear_fill(None, None, 90, stops=[(0.0, TAVERN_BG), (0.6, TAVERN_FELT), (1.0, TAVERN_FELT)])
    ring_a = ring.point(lambda v: int(v * (0.55 if not pressed else 0.35)))
    paint(img, shade if not pressed else solid(mix(TAVERN_ACCENT, TAVERN_MUTE, 0.6)), ring_a)
    # specular glint on rim upper-left arc
    glint = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glint)
    rr = R_OUT - RIM / 2
    gd.arc((C - rr, C - rr, C + rr, C + rr), 198, 252, fill=255, width=int(u(1.1)))
    glint = glint.filter(ImageFilter.GaussianBlur(u(0.35)))
    glint = ImageChops.multiply(glint, outer)
    paint(img, solid(TAVERN_PAPER), glint.point(lambda v: int(v * 0.75)))
    # faint lower rim shadow edge to separate from dark backgrounds
    low = Image.new("L", (S, S), 0)
    ImageDraw.Draw(low).arc((C - R_OUT + u(0.4), C - R_OUT + u(0.4), C + R_OUT - u(0.4), C + R_OUT - u(0.4)),
                            20, 160, fill=110, width=int(u(0.8)))
    paint(img, solid(mix(TAVERN_MUTE, TAVERN_BG, 0.5)), ImageChops.multiply(low, outer))
    _cache[key] = (img, outer)
    return img, outer


# ---------------------------------------------------------------- glyph helpers
def glyph_layer(img: Image.Image, mask: Image.Image, base, pressed: bool, disc: Image.Image, sheen=True):
    """Solid silhouette with a soft drop shadow (inside the disc only) and a gentle top-left sheen."""
    # drop shadow: offset down-right, blurred, clipped to disc face
    sh = Image.new("L", (S, S), 0)
    sh.paste(mask, (int(u(0.9)), int(u(1.4))))
    sh = sh.filter(ImageFilter.GaussianBlur(u(0.9)))
    sh = ImageChops.multiply(sh, disc_mask(R_IN))
    sh_col = TAVERN_BG if not pressed else mix(TAVERN_ACCENT, TAVERN_MUTE, 0.75)
    paint(img, solid(sh_col), sh.point(lambda v: int(v * (0.60 if not pressed else 0.40))))
    # body fill: near-flat token with a very gentle diagonal falloff (keeps it a solid silhouette)
    if sheen:
        if not pressed:
            fill = linear_fill(None, None, 55, stops=[(0.0, TAVERN_PAPER), (0.55, TAVERN_PAPER),
                                                      (1.0, mix(TAVERN_PAPER, TAVERN_BRASS, 0.30))])
        else:
            fill = linear_fill(None, None, 55, stops=[(0.0, mix(TAVERN_BG, TAVERN_PANEL, 0.35)), (0.5, TAVERN_BG),
                                                      (1.0, TAVERN_BG)])
    else:
        fill = solid(base)
    paint(img, fill, mask)


def shape_mask(draw_fn) -> Image.Image:
    m = Image.new("L", (S, S), 0)
    draw_fn(ImageDraw.Draw(m))
    return m


def round_line(d: ImageDraw.ImageDraw, p0, p1, w, fill=255):
    d.line([p0, p1], fill=fill, width=int(w))
    r = w / 2
    for (x, y) in (p0, p1):
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


# ---------------------------------------------------------------- #14 art_icon_mute
def speaker_mask() -> Image.Image:
    """Complete speaker (box + flared cone), left part of the 56 glyph box (x 20..76).
    Never cut by a slash (22:516 '完整喇叭')."""
    def draw(d):
        # magnet box (rounded)
        d.rounded_rectangle((u(20), u(38), u(33), u(58)), radius=u(3), fill=255)
        # cone: smooth flare via polygon with curved mouth
        pts = [(u(30), u(38)), (u(46), u(23))]
        # rounded mouth (slight convex arc on the right)
        for i in range(0, 21):
            t = i / 20
            ang = -math.pi / 2 + t * math.pi
            pts.append((u(46) + u(2.6) * math.cos(ang), u(48) + u(25) * math.sin(ang)))
        pts += [(u(46), u(73)), (u(30), u(58))]
        d.polygon(pts, fill=255)
    return shape_mask(draw)


def x_mask() -> Image.Image:
    def draw(d):
        w = u(9.0)
        round_line(d, (u(57.5), u(39)), (u(72.5), u(57)), w)
        round_line(d, (u(57.5), u(57)), (u(72.5), u(39)), w)
    return shape_mask(draw)


def icon_mute(pressed: bool) -> Image.Image:
    base, disc = plate(pressed)
    img = base.copy()
    glyph_layer(img, speaker_mask(), TAVERN_PAPER, pressed, disc)
    xm = x_mask()
    if not pressed:
        # red X (tavern_danger) with a slightly deeper underside for depth
        sh = Image.new("L", (S, S), 0)
        sh.paste(xm, (int(u(0.9)), int(u(1.4))))
        sh = ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(u(0.9))), disc_mask(R_IN))
        paint(img, solid(TAVERN_BG), sh.point(lambda v: int(v * 0.6)))
        xf = linear_fill(None, None, 90, stops=[(0.0, mix(TAVERN_DANGER, TAVERN_CANDLE, 0.12)), (0.45, TAVERN_DANGER),
                                                 (1.0, mix(TAVERN_DANGER, TAVERN_DANGER_DEEP, 0.35))])
        paint(img, xf, xm)
    else:
        glyph_layer(img, xm, TAVERN_BG, pressed, disc)
    return finish(img, disc)


# ---------------------------------------------------------------- #15 art_icon_silent_match
BELL_TOP, BELL_LIP = 38.0, 63.5


def bell_halfwidth(y: float) -> float:
    """Tavern hand-bell profile (96 units): rounded crown -> waist -> flared lip."""
    t = (y - BELL_TOP) / (BELL_LIP - BELL_TOP)
    t = min(1.0, max(0.0, t))
    return 11.5 + 4.5 * t + 7.0 * (t ** 4.0)


def bell_mask() -> Image.Image:
    """Hand bell inside the 56 glyph box (y 17..76): knob + grip + collar, domed body, flared lip, clapper."""
    def draw(d):
        c = 48
        d.ellipse((u(c - 5.4), u(16.5), u(c + 5.4), u(26)), fill=255)                         # knob
        d.rounded_rectangle((u(c - 3.4), u(22), u(c + 3.4), u(33)), radius=u(1.6), fill=255)  # grip
        d.rounded_rectangle((u(c - 7.5), u(30.5), u(c + 7.5), u(34.5)), radius=u(1.6), fill=255)  # collar
        left, right = [], []
        steps = 60
        for i in range(steps + 1):
            y = BELL_TOP + (BELL_LIP - BELL_TOP) * i / steps
            hw = bell_halfwidth(y)
            left.append((u(c - hw), u(y)))
            right.append((u(c + hw), u(y)))
        crown = []
        hw0 = bell_halfwidth(BELL_TOP)
        for i in range(25):
            a = math.pi + i / 24 * math.pi
            crown.append((u(c + hw0 * math.cos(a)), u(BELL_TOP + 5.5 * math.sin(a))))
        d.polygon(crown + right + left[::-1], fill=255)
        hwl = bell_halfwidth(BELL_LIP)
        d.rounded_rectangle((u(c - hwl - 0.6), u(BELL_LIP - 3.0), u(c + hwl + 0.6), u(BELL_LIP + 3.0)), radius=u(3.0), fill=255)  # lip
        d.ellipse((u(c - 4.4), u(BELL_LIP + 1.8), u(c + 4.4), u(BELL_LIP + 10.2)), fill=255)            # clapper
    return shape_mask(draw)


RIB_Y0, RIB_Y1 = 45.0, 52.0
GAP = 1.7


def ribbon_masks() -> tuple[Image.Image, Image.Image]:
    """(gap mask, band mask). Band hugs the bell waist; bow knot + two swallow-tail ends to the right."""
    c = 48
    ky = (RIB_Y0 + RIB_Y1) / 2
    kx = c + bell_halfwidth(ky) + 0.5

    SAG = 2.2  # band dips at the front: reads as wrapped around a round bell

    def band_poly(pad: float):
        y0, y1 = RIB_Y0 - pad, RIB_Y1 + pad
        hw_top = bell_halfwidth(y0) + 1.0 + pad
        hw_bot = bell_halfwidth(y1) + 1.0 + pad
        top, bot = [], []
        steps = 32
        for i in range(steps + 1):
            k = -1 + 2 * i / steps
            top.append((u(c + k * hw_top), u(y0 + SAG * (1 - k * k))))
            bot.append((u(c + k * hw_bot), u(y1 + SAG * (1 - k * k))))
        return top + bot[::-1]

    def tail(d, root, tip, width, pad):
        """Solid swallow-tail strip from root to tip."""
        (x0, y0), (x1, y1) = root, tip
        L = math.hypot(x1 - x0, y1 - y0)
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        tx, ty = (x1 - x0) / L, (y1 - y0) / L
        hw = width / 2 + pad
        ext = pad
        a = (x0 + nx * hw, y0 + ny * hw)
        b = (x1 + nx * hw + tx * ext, y1 + ny * hw + ty * ext)
        notch = (x1 - tx * (width * 0.75 - pad * 1.2), y1 - ty * (width * 0.75 - pad * 1.2))
        cc = (x1 - nx * hw + tx * ext, y1 - ny * hw + ty * ext)
        e = (x0 - nx * hw, y0 - ny * hw)
        d.polygon([(u(p[0]), u(p[1])) for p in (a, b, notch, cc, e)], fill=255)

    def bow(d, pad):
        tail(d, (kx, ky), (kx + 10.0, ky - 8.0), 5.4, pad)  # upper tail
        tail(d, (kx, ky), (kx + 11.5, ky + 9.5), 5.6, pad)  # lower tail (clear of the lip)
        r = 4.6 + pad
        d.ellipse((u(kx - r), u(ky - r), u(kx + r), u(ky + r)), fill=255)  # knot

    gap = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(gap)
    gd.polygon(band_poly(GAP), fill=255)
    bow(gd, GAP)
    band = Image.new("L", (S, S), 0)
    bd = ImageDraw.Draw(band)
    bd.polygon(band_poly(0.0), fill=255)
    bow(bd, 0.0)
    return gap, band


def icon_silent_match(pressed: bool) -> Image.Image:
    base, disc = plate(pressed)
    img = base.copy()
    gap, band = ribbon_masks()
    bell = bell_mask()
    # shadow + bell body
    glyph_layer(img, bell, TAVERN_PAPER, pressed, disc)
    sh = Image.new("L", (S, S), 0)
    sh.paste(ImageChops.subtract(gap, bell), (int(u(0.9)), int(u(1.4))))
    sh = ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(u(0.9))), disc_mask(R_IN))
    paint(img, solid(TAVERN_BG if not pressed else mix(TAVERN_ACCENT, TAVERN_MUTE, 0.75)),
          sh.point(lambda v: int(v * (0.55 if not pressed else 0.35))))
    # plate-coloured gap around the ribbon (separates band from bell at 24px)
    face_col = TAVERN_PANEL if not pressed else TAVERN_ACCENT
    paint(img, solid(face_col), gap)
    # amber ribbon: tavern_candle (normal) / tavern_panel (pressed)
    if not pressed:
        rf = linear_fill(None, None, 90, stops=[(0.0, mix(TAVERN_CANDLE, TAVERN_PAPER, 0.25)), (0.5, TAVERN_CANDLE),
                                                 (1.0, mix(TAVERN_CANDLE, TAVERN_MUTE, 0.30))])
    else:
        rf = solid(TAVERN_PANEL)
    paint(img, rf, band)
    return finish(img, disc)


# ---------------------------------------------------------------- output
def finish(img: Image.Image, disc: Image.Image) -> Image.Image:
    # hard guarantee: nothing outside the 80px disc
    a = ImageChops.multiply(img.getchannel("A"), disc)
    img.putalpha(a)
    out = img.resize((N, N), Image.LANCZOS)
    # LANCZOS rings a little past the rim; clip alpha to the box-filtered (exact-coverage) disc
    cover = disc.resize((N, N), Image.BOX)
    out.putalpha(ImageChops.darker(out.getchannel("A"), cover))
    # clean LANCZOS ringing in alpha; zero fully-transparent RGB for deterministic, tidy PNGs
    px = out.load()
    for y in range(N):
        for x in range(N):
            r, g, b, al = px[x, y]
            if al <= 2:
                px[x, y] = (0, 0, 0, 0)
    return out


def label(d, xy, text, size, col):
    try:
        f = ImageFont.truetype(FONT_LATIN, size)
    except OSError:
        f = ImageFont.load_default()
    d.text(xy, text, font=f, fill=col + (255,))


def small_strip(icons: dict) -> Image.Image:
    """Readability strip: rows = background x state; columns = 24 / 32 / 48 / 96 px, #14 then #15."""
    sizes = (24, 32, 48, 96)
    rows = (("tavern_bg #1A120E", TAVERN_BG, ""), ("tavern_bg #1A120E  _on", TAVERN_BG, "_on"),
            ("tavern_panel #3D241C", TAVERN_PANEL, ""), ("tavern_panel #3D241C  _on", TAVERN_PANEL, "_on"))
    RH = 112
    W, H = 760, 36 + len(rows) * RH + 6
    out = Image.new("RGBA", (W, H), TAVERN_BG + (255,))
    d = ImageDraw.Draw(out)
    label(d, (12, 10), "FINAL  #14 art_icon_mute  vs  #15 art_icon_silent_match   @ 24 / 32 / 48 / 96 px", 13, TAVERN_CANDLE)
    for r, (nm, col, state) in enumerate(rows):
        y0 = 36 + r * RH
        d.rectangle((0, y0, W, y0 + RH - 6), fill=col + (255,))
        label(d, (12, y0 + RH // 2 - 10), nm, 12, TAVERN_MUTE)
        x = 210
        for sz in sizes:
            for key in ("art_icon_mute", "art_icon_silent_match"):
                ic = icons[key + state]
                ic = ic if sz == 96 else ic.resize((sz, sz), Image.LANCZOS)
                out.alpha_composite(ic, (x, y0 + (RH - 6) // 2 - sz // 2))
                x += sz + 8
            x += 26
    return out


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    icons = {
        "art_icon_mute": icon_mute(False),
        "art_icon_mute_on": icon_mute(True),
        "art_icon_silent_match": icon_silent_match(False),
        "art_icon_silent_match_on": icon_silent_match(True),
    }
    MEDIA.mkdir(parents=True, exist_ok=True)
    outs = []
    for k, im in icons.items():
        p = MEDIA / f"{k}.png"
        im.save(p, format="PNG", optimize=True)
        outs.append(p)
    strip = DOCS / "final_icon_mute_silent_small.png"
    small_strip(icons).save(strip, format="PNG", optimize=True)
    outs.append(strip)
    for p in outs:
        im = Image.open(p)
        print(f"{p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]} {im.mode}  {p.stat().st_size} B  {sha(p)}")


if __name__ == "__main__":
    main()
