"""One set of words for a report heading, held across the two tiers that hold it.

The install resolves a heading key from its own English pack, and the client
holds a map of the same keys so a report can be drawn before the pack arrives.
Both name the same headings, and a key the client answers differently is a
heading that changes wording the moment the report is exported.

The client's map also stands in for a block carrying no heading key at all, so
it is the whole answer for those and not a stand-in for a served one.

**Read off the source rather than executed**, because the two live in different
workspaces and neither suite can import the other. This compares the entries
they share: a key one holds and the other does not is not a disagreement, since
the pack is the larger of the two by design and the client holds only what it
can draw without it.
"""

import re
from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server" / "src" / "report" / "document" / "labels.en.ts"
CLIENT = REPO_ROOT / "ui" / "src" / "components" / "blocks" / "report-layouts.ts"

ENTRY = re.compile(r"'(heading\.[a-z0-9_]+)':\s*'([^']*)'")


def server_headings() -> dict[str, str]:
    """`heading.*` in the English pack: key -> the words it resolves to."""
    return dict(ENTRY.findall(SERVER.read_text(encoding="utf-8")))


def client_headings() -> dict[str, str]:
    """`HEADING_LABELS` in the client: the same keys, for a report not yet served."""
    text = CLIENT.read_text(encoding="utf-8")
    start = text.index("export const HEADING_LABELS")
    return dict(ENTRY.findall(text[start : text.index("\n}", start)]))


def test_the_two_tiers_word_a_heading_the_same():
    """A key worded differently is a heading that changes when the report is exported."""
    server, client = server_headings(), client_headings()

    # The sweep swept: a regex that matched nothing makes every comparison
    # below trivially true.
    assert len(server) >= 20, f"read no headings from {SERVER}: {server}"
    assert len(client) >= 20, f"read no headings from {CLIENT}: {client}"

    differing = {
        key: (server[key], client[key])
        for key in set(server) & set(client)
        if server[key] != client[key]
    }
    assert not differing, f"the pack and the client word these headings differently: {differing}"


def test_the_client_invents_no_heading_the_install_does_not_have():
    """A key only the client holds is English words no export will ever produce.

    The other direction is allowed and expected: the pack carries keys for
    things the client never draws unserved.
    """
    server, client = server_headings(), client_headings()

    invented = set(client) - set(server)
    assert not invented, (
        "the client answers these heading keys and the install's pack does not, "
        f"so the words come from nowhere the install can reach: {sorted(invented)}"
    )
