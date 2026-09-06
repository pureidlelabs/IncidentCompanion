"""The API document's prose, held to the same rules as every other page.

**Vale reads markdown and reaches nothing in `server/src`** -- measured, 0
files -- so the strings that become the OpenAPI document at `/api/docs` were
the one prose surface with no instrument at all. They are the product's public
contract, read by whoever is writing a client.

**The count is asserted as a floor, not quoted here**: `server/src/demos/` is
excluded, and the two numbers differ by more than half.

The rules are not restated here: `.vale/styles/Shared/*.yml` is the single
source, loaded through `test_vale_config.load_tokens`, so narrowing a rule
narrows it in both places at once. Only `Shared` applies -- `IncidentCompanion`
is the docs' own voice and `KnowledgeBase` is the note store's, and neither
governs a field description.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from test_vale_config import STYLES, load_tokens
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
SOURCE = ROOT / "server" / "src"

# **`Shared` only, and the reason is a mistake worth not repeating.**
# `Interface` was added here on the argument that a 4xx `description` *is* an
# error message. It is not: it is a reference entry read by somebody writing a
# client, in Redocly or in generated code. `Interface` encodes the *interface's*
# voice -- device-agnostic verbs, toggle language, a ban on `invalid` -- and
# `invalid` is the correct word for a malformed body. `IncidentCompanion` and
# `KnowledgeBase` stay out for the same reason: those are page voices.
#
# What is left is what genuinely spans every surface: spelling, terminology,
# Latin abbreviations, filler, inclusive language.
RULES = [
    ("Shared", p.stem) for p in sorted((STYLES / "Shared").glob("*.yml"))
]

# `.describe('...')` is Zod's; `summary:`/`description:` are the Nest
# decorators'. Both end up in the same document, so both are in scope.
#
#: One quoted fragment, single or double.
FRAGMENT = r"""(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""
#: A fragment plus any number of `+ 'more'` continuations.
#
# **The continuation half is the whole point.** Matching only the first literal
# reads the opening clause of every concatenated description and nothing after
# it: a violation planted in a continuation leaves the suite green, where the
# same violation in the first fragment reddens three tests.
CONCAT = rf"{FRAGMENT}(?:\s*\+\s*{FRAGMENT})*"

PATTERNS = [
    re.compile(rf"\.describe\(\s*({CONCAT})"),
    re.compile(rf"\b(?:summary|description)\s*:\s*({CONCAT})"),
]

QUOTED = re.compile(FRAGMENT)


def joined(blob: str) -> str:
    """Stitch a `'a' + 'b'` chain back into the sentence a reader sees."""
    return " ".join("".join(q[1:-1] for q in QUOTED.findall(blob)).split())

#: A backtick-quoted description is not parsed, and the count is asserted rather
#: than ignored -- a surface that silently stops being covered is the failure
#: this whole file exists to prevent.
TEMPLATE = re.compile(r"(?:\.describe\(|(?:summary|description)\s*:\s*)`")


def published_strings() -> list[tuple[str, int, str]]:
    found = []
    for f in sorted(SOURCE.rglob("*.ts")):
        # Demo case content is an analyst's own prose, not the product's --
        # the same exclusion `test_ui_copy.py` carries and for the same reason.
        if f.name.endswith(".test.ts") or "demos" in f.parts:
            continue
        text = f.read_text()
        for pattern in PATTERNS:
            for match in pattern.finditer(text):
                line = text[: match.start()].count("\n") + 1
                found.append((str(f.relative_to(ROOT)), line, joined(match.group(1))))
    return found


def test_the_extractor_still_finds_the_document_s_prose() -> None:
    """The check that stops every assertion below passing over an empty list.

    A renamed decorator or a move to template literals would leave the rules
    running over nothing, and a loop with no iterations is green.
    """
    found = published_strings()
    assert len(found) > 120, (
        f"only {len(found)} published strings found; the extractor has stopped "
        "matching how this codebase declares them."
    )


def test_no_description_is_a_template_literal() -> None:
    """Template literals are the extractor's blind spot, so there are none.

    Asserted rather than skipped: interpolation into a published description
    would put a runtime value in the API contract, which is its own problem.
    """
    offenders = [
        str(f.relative_to(ROOT))
        for f in sorted(SOURCE.rglob("*.ts"))
        if not f.name.endswith(".test.ts") and TEMPLATE.search(f.read_text())
    ]
    assert not offenders, (
        "a published description is a template literal, which this file cannot "
        f"lint and the contract should not contain: {offenders}"
    )


@pytest.mark.parametrize("style,rule", RULES, ids=lambda v: v)
def test_the_api_document_obeys_the_prose_rules(style: str, rule: str) -> None:
    tokens = load_tokens(style, rule)
    offenders = []
    for path, line, text in published_strings():
        for token in tokens:
            match = re.search(token, text, re.I)
            if match:
                offenders.append(f"{path}:{line}  [{match.group(0)}]  {text[:90]}")
                break
    assert not offenders, "{}.{} in the API document:\n  {}".format(
        style, rule, "\n  ".join(offenders)
    )
