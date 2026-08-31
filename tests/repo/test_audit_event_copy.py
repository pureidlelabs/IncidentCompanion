"""Every audit event the server can write has words before it reaches a screen.

**The Activity column rendered `api_called` and `case_opened_live` as their own
identifiers** for as long as the client held the copy in a `SAID` map with an
``?? event`` fallback -- a missing entry was invisible in review and showed as
an enum name in a table nobody happened to open.

**The copy is the server's now**, in `ocsf.ts`: the client's `AuditRow` takes an
`activity` already in words, so there is no fallback left to hide behind. That
map is typed `Record<InstallEvent, Mapping>`, which makes a missing event a
compile error rather than something this file has to find -- so what is left
here is the half a type cannot state: that the words are not the identifier.

**Two events may share a name on purpose.** OCSF separates what was attempted
from how it ended, so `signed_in` and `sign_in_failed` are both `Logon` and the
outcome column is what tells them apart.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "server" / "src" / "db" / "schema" / "install-activity.ts"
OCSF = ROOT / "server" / "src" / "install-activity" / "ocsf.ts"


def served_events() -> list[str]:
    """The `installEvent` enum's members, in declaration order."""
    text = SCHEMA.read_text(encoding="utf-8")
    block = re.search(
        r"export const installEvent = pgEnum\(\s*'install_event',\s*\[(.*?)\]",
        text,
        re.DOTALL,
    )
    assert block, f"no installEvent enum found in {SCHEMA}"
    return re.findall(r"'([a-z_]+)'", block.group(1))


def named_events() -> set[str]:
    """The events `ocsf.ts` gives an activity name."""
    block = _mapping_block()
    return set(re.findall(r"^\s*([a-z_]+): \{", block, re.MULTILINE))


def _mapping_block() -> str:
    text = OCSF.read_text(encoding="utf-8")
    block = re.search(r"const MAP: Record<InstallEvent, Mapping> = \{(.*?)\n\}", text, re.DOTALL)
    assert block, f"no MAP found in {OCSF}"
    return block.group(1)


def test_the_enum_is_readable() -> None:
    """Guards the two parsers above: an empty match would pass everything."""
    events = served_events()
    assert len(events) > 10, f"parsed only {events!r} from the schema"
    assert "signed_in" in events


def test_every_event_has_copy() -> None:
    missing = [event for event in served_events() if event not in named_events()]
    assert not missing, (
        "these events reach the Activity column with no words of their own: "
        f"{missing}. Give each one a mapping in `ocsf.ts`."
    )


def test_no_copy_for_an_event_that_does_not_exist() -> None:
    """A stale key is a name nothing can produce, and reads as covered."""
    stale = sorted(named_events() - set(served_events()))
    assert not stale, f"`ocsf.ts` names events the server cannot write: {stale}"


@pytest.mark.parametrize("event", served_events())
def test_the_copy_is_not_the_identifier(event: str) -> None:
    said = re.search(
        rf"^\s*{event}: \{{[^}}]*activityName: '([^']+)'", _mapping_block(), re.MULTILINE
    )
    assert said, f"{event} has no mapping"
    assert said.group(1) != event, f"{event} is named after itself"
