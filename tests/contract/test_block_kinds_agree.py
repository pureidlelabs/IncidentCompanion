"""One insert menu, held across the tier that serves it and the tier that draws it.

`GET /api/report-block-kinds` answers every section a report can hold, grouped
as the menu draws them, and the client ships its own copy of the same list as a
fixture. Both are live: `report-add-section-menu.tsx` takes the fixture as the
default for `groups`, and neither of its two call sites in `report-workspace.tsx`
passes anything, so the fixture is what an analyst opens in the running app --
the hook that would fetch the served list, `useReportBlockKinds`, has no caller
anywhere in the client.

They agree today. Nothing holds them there. A kind added to the server's
`GROUPS` and not to the fixture is a section the analyst cannot insert although
the install can render it; one added the other way is a menu entry that inserts
a kind the server does not know, and the failure arrives at the write rather
than at the menu.

**Read off the source rather than executed**, for `test_dedup_keys_agree.py`'s
reason: the two live in different workspaces and neither suite can import the
other. So this compares the *declarations* -- the headings and the kinds under
each -- and not the labels, which the server takes from the English pack and the
fixture spells out. A label drifting is visible on screen; a kind drifting is
not.

The wiring is issue #166. Until it lands, this is what keeps the copy honest.
"""

import re
from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server" / "src" / "report" / "block-kinds.ts"
CLIENT = REPO_ROOT / "ui" / "src" / "fixtures" / "reportBlockKinds.ts"


def _served() -> list[tuple[str, tuple[str, ...]]]:
    """The server's `GROUPS`, as `(heading, kinds)` in declaration order."""
    text = SERVER.read_text(encoding="utf-8")
    start = text.index("const GROUPS")
    end = text.index("\n]", start)
    body = text[start:end]
    groups: list[tuple[str, tuple[str, ...]]] = []
    for heading, kinds in re.findall(
        r"\[\s*'([^']+)',\s*\[([^\]]*)\]", body, flags=re.S
    ):
        groups.append((heading, tuple(re.findall(r"'([^']+)'", kinds))))
    return groups


def _drawn() -> list[tuple[str, tuple[str, ...]]]:
    """The client fixture, as `(heading, kinds)` in declaration order."""
    text = CLIENT.read_text(encoding="utf-8")
    start = text.index("export const reportBlockKinds")
    body = text[start:]
    groups: list[tuple[str, tuple[str, ...]]] = []
    for chunk in re.split(r"\{\s*heading:\s*", body)[1:]:
        heading = re.match(r"'([^']+)'", chunk)
        if heading is None:
            continue
        kinds_at = chunk.index("kinds:")
        kinds = tuple(re.findall(r"kind:\s*'([^']+)'", chunk[kinds_at : chunk.index("] }")]))
        groups.append((heading.group(1), kinds))
    return groups


def test_both_lists_were_found() -> None:
    """A parser that matched nothing agrees with anything."""
    assert len(_served()) > 3, "read no groups out of the server's GROUPS"
    assert len(_drawn()) > 3, "read no groups out of the client fixture"


def test_the_menu_offers_what_the_server_serves() -> None:
    """Same headings, same kinds under each, same order."""
    assert _drawn() == _served()
