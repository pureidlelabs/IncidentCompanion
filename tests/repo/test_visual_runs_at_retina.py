"""Every visual tier renders at every density a person actually runs.

A layout landing on a fractional CSS pixel rounds to different device pixels at
each ratio, so a seam that shows a row through a sticky header at one density
does not exist at another. A tier that renders at one reports the others clean.

**The fractional ratios are the hard ones and the common ones.** Windows ships
125% and 150% display scaling, which arrive as 1.25 and 1.5; macOS's 2 is the
forgiving case, because there every CSS pixel maps to a whole number of device
pixels. A tier testing 1 and 2 alone misses the ratios most users are on.

A scrollport landing on a fraction of a pixel is the shape this catches: swept
at 1x it reports clean while the row bleeds through the header on a Retina
screen.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

VISUAL = REPO_ROOT / "server" / "e2e" / "visual"

CONFIGS = sorted(VISUAL.glob("playwright.*.config.ts"))

#: Where the set is declared, so the configs cannot each hold an opinion.
DENSITIES_FILE = VISUAL / "densities.ts"

#: 100%, 125%, 150%, and Retina. The middle two are what Windows ships.
REQUIRED = ("1", "1.25", "1.5", "2")


def test_there_are_visual_configs_to_check() -> None:
    """A glob that matched nothing passes the assertions below over an empty set."""
    assert len(CONFIGS) >= 3, f"expected the visual configs under {VISUAL}, found {CONFIGS}"


#: The declaration itself, so prose naming a ratio cannot satisfy the check.
DEFAULT = re.compile(r"VISUAL_DENSITIES[^\n]*\?\?\s*'([^']*)'")


def test_the_density_set_covers_fractional_scaling() -> None:
    """The default set, where a config that asks for it gets the whole spread.

    **The value, never the file's prose.** Match the ratios anywhere in the
    file and the docstring sentence naming 1.25 and 1.5 satisfies the check
    while the default is trimmed to `1` -- it passes with the code under it
    stubbed.
    """
    text = DENSITIES_FILE.read_text(encoding="utf-8")
    found = DEFAULT.search(text)
    assert found is not None, (
        f"{DENSITIES_FILE.name} no longer spells its default as a quoted fallback to "
        "VISUAL_DENSITIES, so this cannot read the value and would otherwise pass over "
        "the file's prose."
    )
    offered = [one.strip() for one in (found.group(1) or "").split(",") if one.strip()]
    absent = [one for one in REQUIRED if one not in offered]
    assert not absent, (
        f"{DENSITIES_FILE.name} defaults to {offered}, so no tier renders at {absent}. "
        "1.25 and 1.5 are Windows' 125% and 150%, where the rounding is worst."
    )


#: The Storybook walk, whose readings are the same at every density.
#:
#: A density answers for what somebody looks at: a seam rounds differently per
#: ratio, and the sweeps capture frames a reader reads. The walk reports what
#: `probe.js` measures through the DOM, and hashes its one capture only to pair
#: stories that render alike within a single run. Rendering it four times over
#: is four identical readings. -> #885
GEOMETRY_ONLY = {"playwright.storybook.config.ts"}

PROBE = VISUAL / "probe.js"

#: What would make a reading move with the ratio. The exemption above holds
#: only while the probe names none of them.
DENSITY_AWARE = ("devicePixelRatio", "deviceScaleFactor")


def test_every_visual_config_takes_the_shared_density_set() -> None:
    """One source for the set: three configs with three opinions is three answers."""
    # `projects:` fed by the call, not merely the import: a config that imports
    # it and then declares `projects: []` renders at Playwright's default, and
    # a check for the bare name passes on exactly that.
    wired = re.compile(r"projects:\s*densityProjects\(")
    short = [
        path.name
        for path in CONFIGS
        if path.name not in GEOMETRY_ONLY and not wired.search(path.read_text(encoding="utf-8"))
    ]
    assert not short, (
        "these visual configs do not take the shared density set, so they render at "
        "whatever Playwright defaults to and cannot see a seam that exists at one "
        "scaling only: " + ", ".join(short)
    )


def test_the_exempt_config_measures_nothing_the_ratio_moves() -> None:
    """The exemption is only as good as the probe staying blind to the ratio.

    A probe that starts reading the device ratio measures something a single
    density cannot see, and the config owes the shared set again.
    """
    assert PROBE.is_file(), f"{PROBE} is gone, so the exemption rests on nothing"
    text = PROBE.read_text(encoding="utf-8")
    named = [one for one in DENSITY_AWARE if one in text]
    assert not named, (
        f"{PROBE.name} now reads {named}, so its readings can move with the device "
        "ratio. Either drop the exemption and give "
        f"{', '.join(sorted(GEOMETRY_ONLY))} the shared density set, or establish "
        "that the new reading is ratio-invariant."
    )
