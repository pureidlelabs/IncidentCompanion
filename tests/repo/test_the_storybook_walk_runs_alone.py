"""The Storybook walk's config selects the walk, and not the kit tier with it.

`playwright.kit.config.ts` owns `**/*.storybook.spec.ts` -- the component
checks. The walk beside them is one test over the whole gallery, with its own
config because its cost and its precondition are different, and
`STORYBOOK_STORIES` scopes the walk while reaching none of the siblings.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

VISUAL = REPO_ROOT / "server" / "e2e" / "visual"

WALK_CONFIG = VISUAL / "playwright.storybook.config.ts"

#: The walk itself, the one file its config is sized for.
WALK = "storybook.spec.ts"

#: The literal, so prose about the walk cannot satisfy the check.
TEST_MATCH = re.compile(r"testMatch:\s*/(?P<pattern>.+?)/[a-z]*\s*,")


def test_the_config_declares_a_regex_this_can_read() -> None:
    """A renamed field would leave every assertion below reading nothing."""
    text = WALK_CONFIG.read_text(encoding="utf-8")
    assert TEST_MATCH.search(text) is not None, (
        f"{WALK_CONFIG.name} no longer spells testMatch as a regex literal, so this "
        "check cannot read what the config selects and would otherwise pass over prose."
    )


def test_the_walk_config_selects_the_walk_alone() -> None:
    """Applied to the directory, the pattern picks one file.

    The pattern is matched against every spec beside it rather than eyeballed:
    an unanchored `storybook\\.spec\\.ts` reads as one filename and selects
    all sixteen.
    """
    found = TEST_MATCH.search(WALK_CONFIG.read_text(encoding="utf-8"))
    assert found is not None
    pattern = re.compile(found.group("pattern"))

    candidates = sorted(path.name for path in VISUAL.glob("*.spec.ts"))
    assert WALK in candidates, f"{WALK} is not in {VISUAL}, so this checks nothing"

    selected = [name for name in candidates if pattern.search(name)]
    assert selected == [WALK], (
        f"{WALK_CONFIG.name} selects {selected}. The walk's config is sized for the "
        f"walk alone; the siblings are the kit tier, which playwright.kit.config.ts "
        "already runs."
    )
