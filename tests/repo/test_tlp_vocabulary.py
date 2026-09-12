"""The two TLP lists are one vocabulary, and nothing at runtime says so.

The server decides which markings an export may carry and refuses anything
else; the Indicators screen writes its own copy to build the picker. Nothing in
the client reads a served vocabulary, so the two are held together here or not
at all -- and the failure is silent in the direction that matters: a level the
server accepts and the screen does not offer is a marking an analyst cannot
choose, which is how a bundle comes to be under-marked.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "server/src/exports/indicators.ts"
CLIENT = ROOT / "ui/src/screens/indicators.tsx"


def _levels(text: str, declaration: str) -> list[str]:
    """The quoted entries of a single-line array literal, in order."""
    match = re.search(rf"{declaration}\s*=\s*\[(.*?)\]", text, re.DOTALL)
    assert match, f"{declaration} is not a literal array any more"
    return re.findall(r"'([^']+)'", match.group(1))


def test_the_screen_offers_every_marking_the_server_accepts() -> None:
    served = _levels(SERVER.read_text(encoding="utf8"), r"export const TLP_NAMES")
    offered = _levels(CLIENT.read_text(encoding="utf8"), r"const TLP_LEVELS")

    assert served, "the served vocabulary reads empty, so this test proves nothing"
    assert offered == served, (
        "the Indicators screen and the export route disagree about the TLP "
        "vocabulary. A level the server accepts and the screen omits cannot be "
        f"picked; one it offers and the server refuses answers 400.\n"
        f"  served:  {served}\n  offered: {offered}"
    )
