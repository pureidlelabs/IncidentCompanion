"""Every visual tier renders at every density a person actually runs.

A layout landing on a fractional CSS pixel rounds to different device pixels at
each ratio, so a seam that shows a row through a sticky header at one density
does not exist at another. A tier that renders at one reports the others clean.

**The fractional ratios are the hard ones and the common ones.** Windows ships
125% and 150% display scaling, which arrive as 1.25 and 1.5; macOS's 2 is the
forgiving case, because there every CSS pixel maps to a whole number of device
pixels. A tier testing 1 and 2 alone misses the ratios most users are on.

Measured on 2026-09-05: a scrollport at `176.883` CSS pixels, swept at 1x all
day and reported clean while the row was visibly bleeding through the header on
a Retina screen.
"""

from __future__ import annotations

import pathlib
import re

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
VISUAL = REPO_ROOT / "server" / "e2e" / "visual"

#: Anything driving a browser to judge appearance.
CONFIGS = sorted(VISUAL.glob("playwright.*.config.ts"))

#: Where the set is declared, so the configs cannot each hold an opinion.
DENSITIES_FILE = VISUAL / "densities.ts"

#: 100%, 125%, 150%, and Retina. The middle two are what Windows ships.
REQUIRED = ("1", "1.25", "1.5", "2")


def test_there_are_visual_configs_to_check() -> None:
    """A glob that matched nothing passes the assertions below over an empty set."""
    assert len(CONFIGS) >= 3, f"expected the visual configs under {VISUAL}, found {CONFIGS}"


def test_the_density_set_covers_fractional_scaling() -> None:
    """The default set, where a config that asks for it gets the whole spread."""
    text = DENSITIES_FILE.read_text(encoding="utf-8")
    absent = [one for one in REQUIRED if not re.search(rf"(?<![\d.]){re.escape(one)}(?![\d.])", text)]
    assert not absent, (
        f"{DENSITIES_FILE.name} does not offer these scalings, so no tier can render at "
        f"them: {absent}. 1.25 and 1.5 are Windows' 125% and 150%, where the rounding "
        "is worst."
    )


def test_every_visual_config_takes_the_shared_density_set() -> None:
    """One source for the set: three configs with three opinions is three answers."""
    # `projects:` fed by the call, not merely the import: a config that imports
    # it and then declares `projects: []` renders at Playwright's default, and
    # a check for the bare name passes on exactly that.
    wired = re.compile(r"projects:\s*densityProjects\(")
    short = [path.name for path in CONFIGS if not wired.search(path.read_text(encoding="utf-8"))]
    assert not short, (
        "these visual configs do not take the shared density set, so they render at "
        "whatever Playwright defaults to and cannot see a seam that exists at one "
        "scaling only: " + ", ".join(short)
    )
