"""One notion of a duplicate, held across the two tiers that each implement it.

**There are two natural-key implementations and they must agree.** The server's
`identity.ts` decides what an import treats as already present; the client's
`csv-import.ts` decides what the preview *tells the analyst* it will treat as
already present. They are separate code, in separate workspaces, and the client
says so itself:

    **The rules match the server's row for row** - an importer that disagrees
    doubles the case on a re-import.
    -> `server/src/collections/identity.ts`

Nothing held that claim. A collection keyed on one side and not the other, or
keyed on different fields, makes the preview a lie in the direction that costs
most: it says a row will be skipped as a duplicate and the server writes it, or
it promises a write the server skips. Either way the analyst reads a number
before the import that the import does not honour.

**Read off the source rather than executed**, because the two live in different
workspaces and neither suite can import the other. That is a real limit: this
compares the *declarations*, so two implementations agreeing on which fields
make a key and disagreeing on how they are folded would pass here. The folding
is asserted per tier -- `identity.test.ts` and `csv-import.test.ts` -- and what
has no home but this file is that the two lists are the same list.
"""

import re
from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server" / "src" / "collections" / "identity.ts"
CLIENT = REPO_ROOT / "ui" / "src" / "components" / "blocks" / "csv-import.ts"


def _block(text: str, opener: str) -> str:
    """The source between `opener` and the line that closes its object literal."""
    start = text.index(opener)
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    raise AssertionError(f"{opener} is not a closed object literal")


def server_keys() -> dict[str, set[str]]:
    """`KEYED` in `identity.ts`: collection -> the fields its key is made of."""
    block = _block(SERVER.read_text(encoding="utf-8"), "const KEYED")
    found: dict[str, set[str]] = {}
    for name, fields in re.findall(r"^\s{2}(\w+):\s*\[([^\]]*)\]", block, re.M):
        found[name] = set(re.findall(r"'([^']+)'", fields))
    return found


def client_keys() -> dict[str, set[str]]:
    """`DEDUP_KEYS` in `csv-import.ts`: collection -> the `values.x` it reads.

    Each entry is an arrow function rather than a list, so the fields are the
    `values.<field>` it names. A field read through a helper rather than
    directly would be missed, which is why the count below is asserted.
    """
    block = _block(CLIENT.read_text(encoding="utf-8"), "const DEDUP_KEYS")
    entries = re.split(r"^\s{2}(\w+):\s", block, flags=re.M)[1:]
    found: dict[str, set[str]] = {}
    for name, body in zip(entries[0::2], entries[1::2]):
        found[name] = set(re.findall(r"values\.(\w+)", body))
    return found


def test_the_two_tiers_key_the_same_collections():
    """A collection keyed on one side only is a preview that contradicts the write."""
    server, client = server_keys(), client_keys()

    # The sweep swept something: a regex that matched nothing would make every
    # comparison below trivially true.
    assert len(server) >= 5, f"read no key rules from {SERVER}: {server}"
    assert len(client) >= 5, f"read no key rules from {CLIENT}: {client}"

    assert set(server) == set(client), (
        "the server and the client disagree about which collections have a "
        f"natural key: server only {set(server) - set(client)}, "
        f"client only {set(client) - set(server)}"
    )


def test_the_two_tiers_key_on_the_same_fields():
    """Keyed on different fields is the same lie, one level down.

    `accounts` is the case that matters: keyed on the name alone, `admin` at the
    customer and `admin` at a partner domain collapse into one account -- which
    `identity.test.ts` calls the expensive direction, because the row that loses
    is gone with no trace.
    """
    server, client = server_keys(), client_keys()

    differing = {
        name: (server[name], client[name])
        for name in set(server) & set(client)
        if server[name] != client[name]
    }
    assert not differing, f"the two tiers key these collections differently: {differing}"
