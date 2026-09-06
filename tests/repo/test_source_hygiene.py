"""A literal NUL byte in a source file is a write that went wrong.

**Nothing downstream complains.** The Write/Edit tool can emit a NUL where a
space was typed; Read renders a NUL as a space, so the file looks correct, and
this shell's `grep` is `ugrep`, which treats a NUL-bearing file as binary and
returns rc=1 **for every pattern silently** -- so searching the file reports it
as not containing text it does contain.

**A sweep cannot distinguish the accident from the idiom, which is why this is
a ban rather than a search.** This repo uses NUL deliberately, as a separator
that cannot occur in the data it joins (`` `${src}\\u0000${dst}` ``) and as a
sentinel that cannot collide with a real value (`'\\u0000create'`). Written as
literal bytes those are indistinguishable from the corruption — one was
investigated as a defect and turned out to be correct. Written as `\\u0000`
escapes they are legible, and every literal NUL left in the tree is an
accident.

So the rule is about *spelling*, not about NUL: keep using it, and never type
it. The escape survives every tool in the chain.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
# A NUL is meaningful inside these; the ban is about text a human edits.
BINARY_SUFFIXES = frozenset(
    {".png", ".ico", ".gif", ".jpg", ".jpeg", ".woff", ".woff2", ".ttf", ".pdf",
     ".zip", ".iccase", ".db", ".xlsx", ".docx"}
)


def tracked_text_files() -> list[Path]:
    listing = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    return [
        ROOT / name
        for name in listing.split("\0")
        if name and Path(name).suffix.lower() not in BINARY_SUFFIXES
    ]


def test_no_source_file_holds_a_literal_nul() -> None:
    """Every deliberate NUL is spelled `\\u0000`; a literal one is a bad write."""
    offenders = []
    for path in tracked_text_files():
        if not path.is_file():
            continue
        blob = path.read_bytes()
        if b"\x00" not in blob:
            continue
        line = blob.split(b"\x00")[0].count(b"\n") + 1
        offenders.append(f"{path.relative_to(ROOT)}:{line}")

    assert not offenders, (
        "literal NUL bytes — write them as \\u0000 escapes:\n  "
        + "\n  ".join(offenders)
    )


@pytest.mark.parametrize(
    "path",
    ["ui/src/api/useCaseChanges.ts",
     "ui/src/components/blocks/entity-combobox.tsx",
     "ui/src/components/blocks/entity-graph.ts",
     "ui/src/components/blocks/csv-import.ts"],
)
def test_the_deliberate_sentinels_still_carry_a_nul(path: str) -> None:
    """Escaping them must not have turned them into ordinary strings.

    The mechanical risk of the conversion above: `\\u0000` typed into a
    single-quoted TypeScript string is a real NUL, but into a *template*
    literal's surrounding backticks it is too — and into a Python string it is
    not. Getting it wrong replaces a non-colliding separator with the
    eight-character text `\\u0000`, which collides with nothing either and so
    breaks no test. This asserts the escape is present in source.
    """
    assert "\\u0000" in (ROOT / path).read_text(), f"{path} lost its sentinel"


def test_no_request_schema_repeats_the_password_minimum() -> None:
    """The minimum is one constant rather than a literal in each request schema.

    Better Auth mounts its own change-password and sign-up routes and enforces
    `emailAndPassword.minPasswordLength`. Leave that unset and the library
    answers with its own default while each controller spells a longer minimum
    of its own -- so the effective minimum on the install is the one nothing in
    this repository names, and the app's route refuses a password the
    library's accepts.

    Asserted over the source rather than by parsing the schemas: they are
    module-private, and exporting three of them so a test could count them
    would be the test shaping the code.
    """
    offenders = [
        path.relative_to(ROOT)
        for path in tracked_text_files()
        if path.suffix == ".ts"
        and path.name != "password-policy.ts"
        and not path.name.endswith(".test.ts")
        and re.search(r"password[^\n]*\.min\(\s*\d", path.read_text())
    ]
    assert offenders == [], (
        "a password minimum spelled as a number is a second policy: "
        f"{[str(p) for p in offenders]}"
    )
