"""One set of words for a report heading, and the client fixture that draws them.

The install resolves a heading key from its own pack, in the language the
report is produced in, and that is the only map a screen reads. What the client
still ships is `DEMO_HEADINGS`, the fixture its stories and demo layouts draw
chip labels from -- so a story shows words, not keys.

A fixture is allowed to be smaller than the pack and not allowed to disagree
with it. Words here that no install produces are a story describing a product
that does not exist, which is the more expensive kind of wrong: it is what
somebody reads when they are deciding whether the screen is right.

**Read off the source rather than executed**, because the two live in different
workspaces and neither suite can import the other. This compares the entries
they share: a key one holds and the other does not is not a disagreement, since
the pack is the larger of the two by design.

The last case reads the pack rather than the fixture for what the *product*
owes, which is the property that outlived the two-map arrangement: a kind the
install can label and the pack cannot resolve draws its slug on screen.
"""

import re
from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server" / "src" / "report" / "document" / "labels.en.ts"
CLIENT = REPO_ROOT / "ui" / "src" / "components" / "blocks" / "report-layouts.ts"

ENTRY = re.compile(
    r"""['"](heading\.[a-z0-9_]+)['"]:\s*(?:'([^']*)'|"([^"]*)")"""
)


def _entries(text: str) -> dict[str, str]:
    """Every `heading.*` entry, whichever quote its value is written with."""
    return {key: single or double for key, single, double in ENTRY.findall(text)}


def server_headings() -> dict[str, str]:
    """`heading.*` in the English pack: key -> the words it resolves to."""
    return _entries(SERVER.read_text(encoding="utf-8"))


def client_headings() -> dict[str, str]:
    """`DEMO_HEADINGS` in the client: the fixture the stories and demo layouts draw."""
    text = CLIENT.read_text(encoding="utf-8")
    start = text.index("export const DEMO_HEADINGS")
    return _entries(text[start : text.index("\n}", start)])


def test_both_maps_were_found():
    """A regex that matched nothing makes every comparison here trivially true.

    Its own case rather than a line inside one, because the checks below pass
    over an empty set as readily as over a matching one.
    """
    server, client = server_headings(), client_headings()
    assert len(server) >= 20, f"read no headings from {SERVER}: {server}"
    assert len(client) >= 20, f"read no headings from {CLIENT}: {client}"


def test_the_two_tiers_word_a_heading_the_same():
    """A fixture worded differently shows a heading no install produces."""
    server, client = server_headings(), client_headings()

    differing = {
        key: (server[key], client[key])
        for key in set(server) & set(client)
        if server[key] != client[key]
    }
    assert not differing, f"the pack and the client word these headings differently: {differing}"


def test_the_client_invents_no_heading_the_install_does_not_have():
    """A key only the fixture holds is English words no export will ever produce.

    The other direction is allowed and expected: the pack is the larger of the
    two, and the fixture carries only what a story draws.
    """
    server, client = server_headings(), client_headings()

    invented = set(client) - set(server)
    assert not invented, (
        "the fixture answers these heading keys and the install's pack does not, "
        f"so the words come from nowhere the install can reach: {sorted(invented)}"
    )


KINDS = REPO_ROOT / "server" / "src" / "domain" / "entities" / "report.ts"
MENU = REPO_ROOT / "server" / "src" / "report" / "block-kinds.ts"

BARE = re.compile(r"'([a-z0-9_]+)'")


def _block(text: str, opener: str) -> str:
    """The source between `opener` and the line that closes its literal."""
    start = text.index(opener)
    depth = 0
    for index in range(start, len(text)):
        if text[index] in "[{":
            depth += 1
        elif text[index] in "]}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    raise AssertionError(f"{opener} is not closed")


def block_kinds() -> list[str]:
    """`BLOCK_KINDS`: every section a report can hold."""
    return BARE.findall(_block(KINDS.read_text(encoding="utf-8"), "export const BLOCK_KINDS"))


def install_label(kind: str) -> str:
    """What the install's menu calls a kind: its menu name, else its heading."""
    menu = dict(BARE.findall(_block(MENU.read_text(encoding="utf-8"), "const MENU_LABEL")))
    return menu.get(kind) or server_headings().get(f"heading.{kind}") or kind


def client_label(kind: str) -> str:
    """What `labelForKind` answers against the fixture: its heading, else its unkeyed name."""
    text = CLIENT.read_text(encoding="utf-8")
    unkeyed = dict(BARE.findall(_block(text, "const UNKEYED_LABELS")))
    return client_headings().get(f"heading.{kind}") or unkeyed.get(kind) or kind


def test_the_client_can_name_every_kind_the_install_can():
    """A kind the install labels and the client cannot draws its slug on screen.

    This is the direction that produced the defect this file was written for: a
    kind gained a heading in the pack and the client's copy of that pack did not
    gain it, so the words matched only by both having been copied from the same
    place at the same time. It reaches the product now through the pack rather
    than through this map; what it still guards is the fixture.

    It reads `UNKEYED_LABELS` as well, which is the client's own second map and
    the one the comparison above cannot see -- its keys carry no `heading.`
    prefix and it is declared past the slice that one reads.
    """
    kinds = block_kinds()
    assert len(kinds) >= 15, f"read no kinds from {KINDS}: {kinds}"

    differing = {
        kind: (install_label(kind), client_label(kind))
        for kind in kinds
        if install_label(kind) != client_label(kind)
    }
    assert not differing, (
        "the install and the client draw these kinds under different words, so a "
        f"heading reads one way on screen and another in the export: {differing}"
    )
