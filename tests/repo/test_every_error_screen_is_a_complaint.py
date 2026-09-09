"""The browser tier can see every error screen the client draws.

**An error screen the tier cannot see reports a clean pass**, which is worse
than a misleading failure: `complaints()` is what six specs read to decide
whether the screen said anything went wrong, so a boundary it does not match
is a section that stopped rendering and a spec that recorded no complaint.

`SectionErrorScreen` was exactly that. It carries `data-testid="section-error"`
and no `role="alert"`, and `complaints()` named only `route-error` -- while its
own docstring says a sweep watching one failure mode and not the other reports
the second as a pass. -> #451

Read as source text rather than rendered, so it asserts which handles are named
and never that the screens work.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

SCREENS = REPO_ROOT / "ui" / "src" / "screens" / "route-error.tsx"
TIER = REPO_ROOT / "server" / "e2e" / "support" / "app.ts"


def drawn_testids() -> set[str]:
    """Every `data-testid` the error screens attach to something."""
    return set(re.findall(r'data-testid="([^"]+)"', SCREENS.read_text(encoding="utf-8")))


def complaints_selector() -> str:
    """The selector list `complaints()` joins, as written."""
    text = TIER.read_text(encoding="utf-8")
    start = text.index("export function complaints(")
    end = text.index("\n}", start)
    return text[start:end]


def test_the_extractor_still_sees_both_files() -> None:
    """A rename or a reshape that leaves the assertion below vacuously true."""
    assert SCREENS.exists(), f"{SCREENS} is gone, so nothing below reads a screen"
    assert len(drawn_testids()) >= 2, (
        "fewer than two error screens carry a testid, which is not the shape this "
        "file was written against -- check the screens before trusting it"
    )
    assert "locator(" in complaints_selector(), "complaints() no longer builds a locator"


def test_complaints_names_every_error_screen_the_client_draws() -> None:
    """A screen the tier cannot match is a failure it reports as a pass.

    Quantifies over what the screens attach rather than over a list, so a third
    error screen fails here rather than in whichever spec next walks onto it.
    """
    selector = complaints_selector()
    unseen = sorted(one for one in drawn_testids() if one not in selector)

    assert unseen == [], (
        "complaints() does not match these error screens, so a spec reading it "
        f"records a clean pass while one of them is on screen: {unseen}"
    )
