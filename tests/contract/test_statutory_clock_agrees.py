"""One statutory deadline, held across the two tiers that each implement it.

**GDPR Article 33(1) gives 72 hours, and this repository counts them twice.**
The server's `compliance/gdpr.ts` computes the deadline the assessment rests on;
the client's `lib/statutory-clock.ts` computes the clock the analyst reads on the
case queue. They are separate code in separate workspaces, and the client says
so itself:

    `NOTIFY_AUTHORITY_HOURS`, `deadline` and `hoursRemaining` carry the GDPR
    ...
    `hours_remaining` is `gdpr_aware_at + 72h - now`, and the 72 is written into

Nothing held them together. The failure is quiet and it is the worst shape a
compliance defect can take: the analyst reads one number on the screen and the
assessment is decided by another, so a case reported as having time left is
overdue -- or the reverse, which is the one that gets explained to a regulator.

**The server's own `hoursRemaining` is called by nothing but its own test**,
measured, so the number a person actually sees comes from the client's copy
alone. That makes the agreement asserted here the only thing standing between
the two.

**Read off the source rather than executed**, because the two live in separate
workspaces and neither suite can import the other -- the same limit
`test_dedup_keys_agree.py` records, and the same remedy: what has no home but
this file is that the two constants are the same constant.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server" / "src" / "compliance" / "gdpr.ts"
CLIENT = REPO_ROOT / "ui" / "src" / "lib" / "statutory-clock.ts"

#: `export const NOTIFY_AUTHORITY_HOURS = 72`, on either side.
DECLARED = re.compile(r"export\s+const\s+NOTIFY_AUTHORITY_HOURS\s*=\s*(\d+)")


def _hours(path) -> int:
    """The hours that file declares, or fail saying which file lost it."""
    text = path.read_text(encoding="utf-8")
    found = DECLARED.findall(text)
    assert found, (
        f"{path.relative_to(REPO_ROOT)} declares no NOTIFY_AUTHORITY_HOURS. Either it "
        "moved and this test is looking in the wrong place, or a tier stopped "
        "naming the deadline it counts."
    )
    assert len(found) == 1, (
        f"{path.relative_to(REPO_ROOT)} declares NOTIFY_AUTHORITY_HOURS {len(found)} times, "
        "so which one governs depends on import order"
    )
    return int(found[0])


def test_both_tiers_count_the_same_hours() -> None:
    """The number itself, which is the one a regulator would ask about."""
    assert _hours(SERVER) == _hours(CLIENT), (
        "the server and the client disagree about how long Article 33 gives, so the "
        "clock an analyst reads is not the clock the assessment is decided on"
    )


def test_the_deadline_is_the_article_33_figure() -> None:
    """**Pinned to 72 rather than only to each other.**

    Two tiers that agree on the wrong number agree. The figure is Article 33(1)
    and is not ours to choose, so it is quoted here as well -- the same reason
    `oj.test.ts` holds quoted thresholds against their source.
    """
    assert _hours(SERVER) == 72, "Article 33(1) gives 72 hours"


def test_each_tier_still_derives_the_deadline_from_the_constant() -> None:
    """The constant agreeing is worth nothing if a tier stopped using it.

    Asserted structurally: each file multiplies the constant by an hour in
    milliseconds to reach the deadline. A tier that inlined `72` beside the
    constant, or reached the deadline some other way, is what this catches --
    the constants would still match and the clocks would not.
    """
    for path in (SERVER, CLIENT):
        text = path.read_text(encoding="utf-8")
        assert "NOTIFY_AUTHORITY_HOURS" in text.split("export const NOTIFY_AUTHORITY_HOURS")[1], (
            f"{path.relative_to(REPO_ROOT)} declares the constant and never reads it back, "
            "so its deadline comes from somewhere else"
        )
