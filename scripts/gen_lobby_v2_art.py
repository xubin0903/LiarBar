#!/usr/bin/env python3
"""LiarBar lobby v2 delivery art.

Processes the attached true-texture sources into locked art_* slots.
v0.x Pillow / color-block skins (gen_lobby_p0_art.py, gen_scaffold_assets.py)
are placeholders only — they are not this delivery.

Tokens from docs/04-设计/夜半酒馆-风格板.md.
Sizes from docs/04-设计/关键资源规格清单.md and 大厅v2-交件说明.md.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts/art_src"
MEDIA = ROOT / "entry/src/main/resources/base/media"

BG = (0x1A, 0x12, 0x0E)
FELT = (0x2C, 0x18, 0x14)
PANEL = (0x3D, 0x24, 0x1C)
CANDLE = (0xE8, 0xB8, 0x6D)
BRASS = (0xC4, 0xA4, 0x6A)
PAPER = (0xF3, 0xE6, 0xC8)
SHADOW = (0x0E, 0x1A, 0x22)
ACCENT = (0xF0, 0xC1, 0x4B)

FULL = (1080, 2340)


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


def open_src(name: str) -> Image.Image:
    path = SRC / name
    if not path.exists():
        raise FileNotFoundError(f"missing source {path}")
    return Image.open(path).convert("RGB")


def cover_crop(im: Image.Image, tw: int, th: int, fx: float = 0.50, fy: float = 0.42) -> Image.Image:
    """Scale-to-cover then crop, focal point in 0..1 image space."""
    w, h = im.size
    scale = max(tw / w, th / h)
    nw, nh = max(tw, int(round(w * scale))), max(th, int(round(h * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    cx = int(round(fx * nw))
    cy = int(round(fy * nh))
    left = max(0, min(nw - tw, cx - tw // 2))
    top = max(0, min(nh - th, cy - th // 2))
    return resized.crop((left, top, left + tw, top + th))


def add_film_grain(arr: np.ndarray, rng: np.random.Generator, sigma: float = 2.4) -> np.ndarray:
    noise = rng.normal(0.0, sigma, arr[..., :3].shape)
    out = arr.astype(np.float32)
    out[..., :3] = np.clip(out[..., :3] + noise, 0, 255)
    return out


def grade_full(im: Image.Image, darken: float = 1.0, felt_pull: float = 0.0) -> Image.Image:
    """Keep source texture; lock shadows / candle / brass toward the style-board."""
    arr = np.array(im.convert("RGB")).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx / (w - 1) - 0.5) * 2.0
    ny = (yy / (h - 1) - 0.5) * 2.0
    vig = np.clip(nx * nx * 0.55 + ny * ny * 0.72, 0, 1)
    vig = np.power(vig, 1.25)

    lum = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
    shadow_w = np.clip((70.0 - lum) / 70.0, 0, 1) * 0.22
    candle_w = np.clip((lum - 140.0) / 90.0, 0, 1) * 0.10
    brass_w = np.clip((arr[..., 0] - arr[..., 2]) / 80.0, 0, 1) * np.clip(lum / 180.0, 0, 1) * 0.08

    out = arr * darken
    sh = np.array(SHADOW, dtype=np.float32)
    cd = np.array(CANDLE, dtype=np.float32)
    br = np.array(BRASS, dtype=np.float32)
    ft = np.array(FELT, dtype=np.float32)
    bg = np.array(BG, dtype=np.float32)

    out = out * (1.0 - shadow_w[..., None]) + sh * shadow_w[..., None]
    out = out * (1.0 - candle_w[..., None]) + (out * 0.72 + cd * 0.28) * candle_w[..., None]
    out = out * (1.0 - brass_w[..., None]) + (out * 0.80 + br * 0.20) * brass_w[..., None]
    out = out * (1.0 - vig * 0.34)[..., None] + sh * (vig * 0.34)[..., None]
    out = out * (1.0 - vig * 0.10)[..., None] + bg * (vig * 0.10)[..., None]

    if felt_pull > 0:
        # Darker felt heart for the table plate — mid-lower center.
        cx, cy = w * 0.50, h * 0.58
        rx, ry = w * 0.46, h * 0.28
        felt_d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        felt_m = np.clip(1.05 - felt_d, 0, 1)
        felt_m = np.power(felt_m, 0.85) * felt_pull
        out = out * (1.0 - felt_m * 0.28)[..., None] + (out * 0.55 + ft * 0.45) * (felt_m * 0.28)[..., None]

    rng = np.random.default_rng(17)
    out = add_film_grain(out, rng, 1.8)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def chroma(rgb: np.ndarray) -> np.ndarray:
    return rgb.max(axis=2) - rgb.min(axis=2)


def key_light_background(im: Image.Image) -> Image.Image:
    """Edge-seeded flood of light / low-chroma checker / studio gray."""
    rgb = np.array(im.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    L = luma(rgb)
    C = chroma(rgb)

    corners = np.stack(
        [
            rgb[2:18, 2:18].mean(axis=(0, 1)),
            rgb[2:18, w - 18 : w - 2].mean(axis=(0, 1)),
            rgb[h - 18 : h - 2, 2:18].mean(axis=(0, 1)),
            rgb[h - 18 : h - 2, w - 18 : w - 2].mean(axis=(0, 1)),
        ]
    )
    d0 = np.sqrt(((rgb - corners[0]) ** 2).sum(axis=2))
    d1 = np.sqrt(((rgb - corners[1]) ** 2).sum(axis=2))
    d2 = np.sqrt(((rgb - corners[2]) ** 2).sum(axis=2))
    d3 = np.sqrt(((rgb - corners[3]) ** 2).sum(axis=2))
    dmin = np.minimum(np.minimum(d0, d1), np.minimum(d2, d3))

    # Studio gray / checker: bright, almost no chroma, close to a corner sample.
    seed = (dmin < 28) | ((L > 228) & (C < 14)) | ((L > 238) & (C < 22))
    # Do not seed gold / brass / candle / skin.
    warm = (rgb[..., 0] > rgb[..., 2] + 18) & (L < 230)
    seed &= ~warm

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if seed[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if seed[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w or visited[ny, nx]:
                continue
            # Grow through light gray / checker; stop on costume / skin / wood.
            if dmin[ny, nx] < 42 or (L[ny, nx] > 210 and C[ny, nx] < 18):
                if warm[ny, nx] and L[ny, nx] < 215:
                    continue
                visited[ny, nx] = True
                q.append((ny, nx))

    bg = visited
    # Small gray islands that never touched an edge stay (gold filigree / mask).
    alpha = np.where(bg, 0.0, 255.0)

    # Soft fringe: pixels near bg that are still very light.
    near = np.zeros_like(bg)
    near[1:-1, 1:-1] = (
        bg[0:-2, 1:-1] | bg[2:, 1:-1] | bg[1:-1, 0:-2] | bg[1:-1, 2:]
    )
    fringe = near & ~bg & (L > 200) & (C < 28)
    alpha[fringe] = np.clip(255.0 - (L[fringe] - 190.0) * 4.0, 0, 255)

    aimg = Image.fromarray(alpha.astype(np.uint8), "L")
    aimg = aimg.filter(ImageFilter.MedianFilter(3))
    aimg = aimg.filter(ImageFilter.GaussianBlur(0.9))
    a = np.array(aimg).astype(np.float32)
    # Hard-zero the four corners after blur so import stays safe.
    a[:8, :8] = 0
    a[:8, w - 8 :] = 0
    a[h - 8 :, :8] = 0
    a[h - 8 :, w - 8 :] = 0

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(a, 0, 255).astype(np.uint8)
    empty = out[..., 3] == 0
    out[..., :3][empty] = 0
    return Image.fromarray(out, "RGBA")


def _opaque_bbox(im: Image.Image, thresh: int = 12) -> tuple[int, int, int, int]:
    arr = np.array(im)
    ys, xs = np.where(arr[..., 3] > thresh)
    if len(xs) == 0:
        raise RuntimeError("bust keying removed the whole figure")
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _clear_corners(im: Image.Image, pad: int = 6) -> Image.Image:
    oa = np.array(im)
    h, w = oa.shape[:2]
    oa[:pad, :pad, 3] = 0
    oa[:pad, w - pad :, 3] = 0
    oa[h - pad :, :pad, 3] = 0
    oa[h - pad :, w - pad :, 3] = 0
    empty = oa[..., 3] == 0
    oa[..., :3][empty] = 0
    return Image.fromarray(oa, "RGBA")


def fit_bust(im: Image.Image, tw: int = 324, th: int = 432, pad_ratio: float = 0.06) -> Image.Image:
    """Crop to opaque bbox, then contain-fit into 324×432 on a true-clear plate."""
    x0, y0, x1, y1 = _opaque_bbox(im)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    pad = int(max(bw, bh) * pad_ratio)
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0] - 1, x1 + pad)
    y1 = min(im.size[1] - 1, y1 + pad)
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))

    cw, ch = crop.size
    scale = min(tw / cw, th / ch)
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    fitted = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    plate = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    plate.paste(fitted, ((tw - nw) // 2, (th - nh) // 2), fitted)
    return _clear_corners(plate)


def fit_bust_announce(im: Image.Image, tw: int = 324, th: int = 432) -> Image.Image:
    """Portrait cover around hat + raised card so idle↔announce share a bust scale."""
    arr = np.array(im)
    x0, y0, x1, y1 = _opaque_bbox(im)
    # Hat / mask / raised card sit in the upper ~72% — drop most of the table.
    y_cut = y0 + int((y1 - y0) * 0.72)
    head = arr[: y_cut + 1]
    ys, xs = np.where(head[..., 3] > 12)
    if len(xs) == 0:
        return fit_bust(im)
    # Card is on the figure's right (viewer's left) — bias the window that way.
    cx = int(np.median(xs)) - int((x1 - x0) * 0.06)
    win_h = int((y1 - y0) * 0.86)
    win_w = int(win_h * tw / th)
    left = max(0, min(im.size[0] - win_w, cx - win_w // 2))
    top = max(0, min(im.size[1] - win_h, y0 - int(win_h * 0.03)))
    crop = im.crop((left, top, left + win_w, top + win_h))
    fitted = crop.resize((tw, th), Image.Resampling.LANCZOS)
    return _clear_corners(fitted)


def sample_patch(im: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    return im.crop(box).resize(size, Image.Resampling.LANCZOS)


def rounded_mask(w: int, h: int, radius: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, fill=255)
    return m


def wood_chrome(
    w: int,
    h: int,
    wood: Image.Image,
    fill_mix: tuple[int, int, int],
    border: tuple[int, int, int],
    pressed: bool = False,
    inset: bool = False,
    radius: int = 24,
    seed: int = 4,
) -> Image.Image:
    """Real wood patch + brass / candle chrome. Corners stay clear."""
    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tex = ImageOps.fit(wood.convert("RGB"), (w, h), method=Image.Resampling.LANCZOS)
    tarr = np.array(tex).astype(np.float32)
    fill = np.array(fill_mix, dtype=np.float32)
    tarr = tarr * 0.58 + fill * 0.42
    if pressed:
        tarr = tarr * 0.72 + np.array(ACCENT, dtype=np.float32) * 0.28
        tarr[..., 0] = np.clip(tarr[..., 0] * 1.08, 0, 255)
    if inset:
        tarr = tarr * 0.62 + np.array(SHADOW, dtype=np.float32) * 0.38

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sheen = np.exp(-(((yy - h * 0.28) / (h * 0.55)) ** 2) - (((xx - w * 0.35) / (w * 0.70)) ** 2))
    tarr += sheen[..., None] * np.array(CANDLE, dtype=np.float32) * (0.16 if not inset else 0.06)
    if not inset:
        edge_y = np.clip(1.0 - yy / max(h - 1, 1), 0, 1)
        tarr += (edge_y * 0.07)[..., None] * np.array(PAPER, dtype=np.float32)

    rng = np.random.default_rng(seed)
    tarr = add_film_grain(tarr, rng, 2.0)
    body = Image.fromarray(np.clip(tarr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    mask = rounded_mask(w, h, radius)
    body.putalpha(mask)
    plate = Image.alpha_composite(plate, body)

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=rgba(border, 255), width=4)
    inner = mix(border, PAPER, 0.28) if not inset else mix(border, SHADOW, 0.25)
    od.rounded_rectangle((6, 6, w - 7, h - 7), radius=max(radius - 5, 8), outline=rgba(inner, 170), width=2)
    if inset:
        od.rounded_rectangle((14, 14, w - 15, h - 15), radius=max(radius - 10, 6), fill=rgba(SHADOW, 120))
        od.line([(22, 18), (w - 23, 18)], fill=rgba(SHADOW, 160), width=2)
        od.line([(22, h - 19), (w - 23, h - 19)], fill=rgba(mix(BRASS, CANDLE, 0.3), 70), width=1)
    else:
        rivet = 7
        for x in (26, w - 27):
            for y in ((h // 2 - 22, h // 2 + 22) if h >= 90 else (h // 2,)):
                od.ellipse((x - rivet, y - rivet, x + rivet, y + rivet), fill=rgba(BRASS, 235))
                od.ellipse((x - 3, y - 3, x + 2, y + 2), fill=rgba(CANDLE, 170))
        for x0, x1 in ((18, 46), (w - 47, w - 19)):
            od.line([(x0, 16), (x1, 16)], fill=rgba(CANDLE, 150), width=2)
            od.line([(x0, h - 17), (x1, h - 17)], fill=rgba(BRASS, 130), width=2)
        if pressed:
            od.rounded_rectangle((10, 10, w - 11, h - 11), radius=max(radius - 8, 8), outline=rgba(mix(BG, BRASS, 0.4), 150), width=2)

    plate = Image.alpha_composite(plate, overlay)
    # Restore true transparency outside the rounded body (overlay strokes stay inside).
    final = np.array(plate)
    m = np.array(mask)
    final[..., 3] = np.minimum(final[..., 3], m)
    empty = final[..., 3] == 0
    final[..., :3][empty] = 0
    return Image.fromarray(final, "RGBA")


def unique_colors(path: Path) -> int:
    arr = np.array(Image.open(path))
    flat = arr.reshape(-1, arr.shape[-1])
    # Bound the uniqueness check on a subsample for huge plates.
    if flat.shape[0] > 400_000:
        flat = flat[::8]
    return int(np.unique(flat, axis=0).shape[0])


def corner_alpha_zero(path: Path) -> bool:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    samples = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    return all(p[3] == 0 for p in samples)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    splash_src = open_src("src_splash.png")
    lobby_src = open_src("src_lobby.png")
    idle_src = open_src("src_dealer_idle.png")
    announce_src = open_src("src_dealer_announce.png")

    splash = grade_full(cover_crop(splash_src, *FULL, fx=0.50, fy=0.40), darken=1.0)
    lobby = grade_full(cover_crop(lobby_src, *FULL, fx=0.50, fy=0.52), darken=0.98)
    table = grade_full(cover_crop(lobby_src, *FULL, fx=0.50, fy=0.58), darken=0.78, felt_pull=0.85)

    save_png(splash, MEDIA / "art_splash_still.png")
    save_png(lobby, MEDIA / "art_lobby_bg.png")
    save_png(table, MEDIA / "art_table_bg.png")

    idle = fit_bust(key_light_background(idle_src), pad_ratio=0.05)
    # Announce source is a waist-up table scene — cover-crop hat + raised card.
    announce = fit_bust_announce(key_light_background(announce_src))
    save_png(idle, MEDIA / "art_dealer_bust_idle.png")
    save_png(announce, MEDIA / "art_dealer_bust_announce.png")

    wood_btn = sample_patch(splash_src, (120, 180, 620, 420), (720, 144))
    wood_in = sample_patch(lobby_src, (180, 620, 900, 900), (720, 96))
    save_png(
        wood_chrome(720, 144, wood_btn, PANEL, ACCENT, pressed=False, radius=28, seed=4),
        MEDIA / "art_btn_primary.png",
    )
    save_png(
        wood_chrome(720, 144, wood_btn, mix(PANEL, ACCENT, 0.35), mix(CANDLE, PAPER, 0.2), pressed=True, radius=28, seed=8),
        MEDIA / "art_btn_primary_on.png",
    )
    save_png(
        wood_chrome(720, 96, wood_in, mix(BG, FELT, 0.4), BRASS, inset=True, radius=20, seed=13),
        MEDIA / "art_input_field.png",
    )

    jobs = [
        ("art_splash_still.png", (1080, 2340), False),
        ("art_lobby_bg.png", (1080, 2340), False),
        ("art_table_bg.png", (1080, 2340), False),
        ("art_dealer_bust_idle.png", (324, 432), True),
        ("art_dealer_bust_announce.png", (324, 432), True),
        ("art_btn_primary.png", (720, 144), True),
        ("art_btn_primary_on.png", (720, 144), True),
        ("art_input_field.png", (720, 96), True),
    ]
    for name, size, trans in jobs:
        dest = MEDIA / name
        im = Image.open(dest)
        if im.size != size:
            raise SystemExit(f"{name} size {im.size} != {size}")
        n = unique_colors(dest)
        extra = ""
        if trans:
            if not corner_alpha_zero(dest):
                raise SystemExit(f"{name} corners are not transparent")
            extra = " corners=clear"
        print(f"{name:32} {im.size[0]}x{im.size[1]} colors~{n} mode={im.mode} bytes={dest.stat().st_size}{extra}")
        if n < 80:
            raise SystemExit(f"{name} still looks like a color-block placeholder ({n} colors)")

    print("lobby v2 delivery art written")


if __name__ == "__main__":
    main()
