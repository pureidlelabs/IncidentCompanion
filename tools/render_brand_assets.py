# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""Render the raster brand assets from the same mark the logo SVGs draw.

`server/assets/` holds the vector marks and four rasters, and this renders
every raster from the geometry the SVGs draw, so the mark has one source.

**One geometry at every size.**

Each frame is drawn at its own size, supersampled 8x and reduced with LANCZOS
rather than resampled from one raster: PIL's own arc and line drawing has no
antialiasing, and a 16px ring drawn directly is a staircase.

    python3 tools/render_brand_assets.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "server" / "assets"

#: The light palette, because a raster cannot follow the OS theme the way the
#: SVGs do. `logo.png` is served over HTTP onto whatever ground the page has,
#: so the mark carries its own. These are the app's secondary, foreground and
#: primary tokens at their light values, matching `logo-tile-light.svg`.
GROUND = (240, 242, 244, 255)
LENS = (23, 27, 32, 255)
BEAT = (31, 104, 188, 255)

SS = 8  # supersample factor

#: The large form, in the 512 canvas the SVGs use, at the 0.88 the tile holds
#: the mark at. Kept as numbers rather than derived so a reader can check one
#: file against the other; `logo-tile-light.svg` is the authority.
RING_C, RING_R, RING_W = 224.8, 148.6, 29.9
NECK = (333.0, 374.1)
GRIP = (370.0, 428.6)
GRIP_W = 44.0
BEAT_W = 18.0
BEAT_PTS = [(95.4, 226.6), (174.1, 226.6), (194.0, 140.0), (222.5, 296.8),
            (252.8, 199.6), (270.4, 241.8), (275.4, 226.6), (354.1, 226.6)]
#: Where the beat reaches full opacity and where it starts leaving, as a
#: fraction of its own span. The SVG carries the same two numbers as gradient
#: stops; a fade that differs between the vector and the raster is the kind of
#: drift this script exists to stop.
FADE_IN, FADE_OUT = 0.113, 0.908

def _fade_mask(size: int, pts, width: float, u: float) -> Image.Image:
    """A horizontal alpha ramp over the beat's own span.

    PIL has no gradient stroke, so the beat is drawn solid on its own layer and
    this multiplies its alpha. Built as a one-pixel-tall image and resized,
    which is both faster than a per-column loop and exactly linear.
    """
    x0, x1 = pts[0][0] * u, pts[-1][0] * u
    span = x1 - x0
    ramp = Image.new("L", (size, 1), 255)
    px = ramp.load()
    for x in range(size):
        t = (x - x0) / span if span else 1.0
        if t < 0 or t > 1:
            value = 0
        elif t < FADE_IN:
            value = round(255 * t / FADE_IN)
        elif t > FADE_OUT:
            value = round(255 * (1 - t) / (1 - FADE_OUT))
        else:
            value = 255
        px[x, 0] = value
    # The caps overshoot the endpoints by half a stroke, so let the ramp keep
    # its zero there rather than clipping them square.
    return ramp.resize((size, size), Image.NEAREST)


def _stroke(d: ImageDraw.ImageDraw, a, b, width: float, fill, u: float) -> None:
    """A line with round caps. PIL draws butt caps only, so the caps are discs."""
    d.line([(a[0] * u, a[1] * u), (b[0] * u, b[1] * u)], fill=fill, width=round(width * u))
    for x, y in (a, b):
        r = width * u / 2
        d.ellipse([x * u - r, y * u - r, x * u + r, y * u + r], fill=fill)


def _mark(size: int) -> Image.Image:
    """The mark at `size` px, drawn at 8x and reduced.

    Drawn at the target size rather than resampled from one raster: PIL's arc
    and line drawing has no antialiasing, so a 16px ring drawn directly is a
    staircase and 8x-then-LANCZOS is what makes the small frames legible at all.
    """
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    u = n / 512.0                      # one unit of the SVG's 512 canvas
    # Inset 16 at radius 112, the same tile `favicon.svg` and the tile SVGs
    # carry. The tile is what makes the mark safe on a tab strip painted any
    # colour the browser likes: on its own ground it has one ground to survive.
    d.rounded_rectangle([16 * u, 16 * u, 496 * u, 496 * u], radius=112 * u, fill=GROUND)

    c, r, ring_w = RING_C, RING_R, RING_W
    beat_pts, beat_w = BEAT_PTS, BEAT_W

    # PIL strokes an ellipse *inward* from the bounding box, where SVG centres
    # the stroke on the radius. Passing r straight through put the band at
    # r - ring_w .. r, so the ring's outer edge landed 4.4 units inside where
    # the neck starts and the handle came away from the glass with a visible
    # gap. Expanding the box by half the stroke centres it, as the SVG does.
    rr = r + ring_w / 2
    d.ellipse([(c - rr) * u, (c - rr) * u, (c + rr) * u, (c + rr) * u],
              outline=LENS, width=round(ring_w * u))

    # Neck at the ring's own weight, then the grip. The neck's near end sits
    # inside the band; a round cap there would cross the inner edge and sit on
    # the glass as a blob, so it stays square.
    d.line([(NECK[0] * u, NECK[0] * u), (NECK[1] * u, NECK[1] * u)],
           fill=LENS, width=round(ring_w * u))
    _stroke(d, (GRIP[0], GRIP[0]), (GRIP[1], GRIP[1]), GRIP_W, LENS, u)

    # The beat on its own layer, so the fade multiplies only its alpha.
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.line([(x * u, y * u) for x, y in beat_pts], fill=BEAT,
            width=round(beat_w * u), joint="curve")
    # `joint="curve"` rounds the interior joins but leaves the two ends square.
    for x, y in (beat_pts[0], beat_pts[-1]):
        rr = beat_w * u / 2
        ld.ellipse([x * u - rr, y * u - rr, x * u + rr, y * u + rr], fill=BEAT)
    # Multiply, not composite: composite would *select* between two images by
    # the mask and throw the stroke's own antialiasing away at every edge.
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"),
                                       _fade_mask(n, beat_pts, beat_w, u)))
    img.alpha_composite(layer)

    return img.resize((size, size), Image.LANCZOS)


def render() -> None:
    square = _mark(512)
    square.save(ASSETS / "favicon.png")
    square.save(ASSETS / "logo.png")

    # Safari picks from these.
    sizes = (16, 24, 32, 48, 64, 128, 256)
    frames = [_mark(s) for s in sizes]
    # Largest first and every frame appended: given only `sizes`, PIL
    # downsamples the base image to each one, so every frame would be a resample
    # of the 256 rather than drawn at its own size and reduced from 8x.
    frames[-1].save(ASSETS / "favicon.ico",
                    sizes=[(s, s) for s in sizes],
                    append_images=frames[:-1])

    print(f"wrote favicon.png, logo.png and favicon.ico to {ASSETS}")
    print("wordmark-light.png and wordmark-dark.png are rendered by "
          "tools/render_wordmark.py, which needs a browser for the typeface")


if __name__ == "__main__":
    render()
