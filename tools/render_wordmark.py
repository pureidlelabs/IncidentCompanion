# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""Render the wordmark: the tiled mark beside the name, per ground."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import urllib.parse, os, sys

ASSETS = Path("server/assets")
H, MARK, GAP, PAD = 256, 200, 34, 22
INK   = {"light": "#171b20", "dark": "#e9ebee"}
MUTED = {"light": "#6b7280", "dark": "#a3abb8"}   # muted-foreground per ground

def page_html(ground):
    svg = (ASSETS / ("logo-tile-%s.svg" % ground)).read_text()
    uri = "data:image/svg+xml;utf8," + urllib.parse.quote(svg)
    return """<style>
  html,body{margin:0;background:transparent}
  #w{display:inline-flex;align-items:center;gap:%dpx;padding:0 %dpx;height:%dpx}
  img{display:block;width:%dpx;height:%dpx}
  #n{font-family:Inter;font-size:78px;
     letter-spacing:-0.025em;line-height:1;white-space:nowrap;
     font-weight:500;color:%s}
  #n b{font-weight:400;color:%s}
</style><div id="w"><img src="%s"><span id="n">Incident<b>Companion</b></span></div>
""" % (GAP, PAD, H, MARK, MARK, INK[ground], MUTED[ground], uri)

with sync_playwright() as p:
    b = p.chromium.launch()
    for ground in ("light", "dark"):
        pg = b.new_page(viewport={"width": 1400, "height": 400}, device_scale_factor=2)
        pg.set_content(page_html(ground))
        pg.wait_for_timeout(200)
        fam = pg.evaluate("getComputedStyle(document.getElementById('n')).fontFamily")
        box = pg.evaluate("(()=>{const r=document.getElementById('w').getBoundingClientRect();return [r.width,r.height]})()")
        # Inter resolved? A width comparison is the wrong instrument: at this
        # weight mix Inter and the generic fallback measure 638.5 against 639.0.
        # A pixel diff of the same string separates them by 13,300 pixels.
        assert pg.evaluate("document.fonts.check('78px Inter')"), "Inter is not available to Chromium"
        out = ASSETS / ("wordmark-%s.png" % ground)
        pg.locator("#w").screenshot(path=str(out), omit_background=True)
        print("%-20s %s  box %.0fx%.0f" % (out.name, fam, box[0], box[1]))
        pg.close()
    b.close()
from PIL import Image
for g in ("light","dark"):
    im=Image.open(ASSETS/("wordmark-%s.png"%g))
    print("wordmark-%s.png %s mode=%s"%(g, im.size, im.mode))
