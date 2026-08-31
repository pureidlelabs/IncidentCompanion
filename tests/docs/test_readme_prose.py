# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""Mechanical checks on `README.md`'s prose, beyond the ones Vale makes.

`test_scope.py` routes a README-only change to the **prose** tier, which runs
Vale and not this file -- so these run at landing rather than at edit time,
which is the point the defect they catch shipped from. Deliberately narrow:
only what a machine can decide. Whether a claim is *true* is
`readme-maintenance`'s job and no test can take it.

**Blocks come from `markdown2`, declared in `requirements-dev.txt`.** Two
hand-rolled versions of this failed the same way: the first classified *lines*
by first character (`#`, `|`, `-`, `*`, `>`) and waived 93 of 192 non-code
lines, every `**Bold lead.**` paragraph among them; the second split on blank
lines and hand-rolled fence tracking instead, where an unclosed fence, a lone
```` ``` ````, a four-backtick fence and a 4-space indented block each either
disabled the check for the rest of the file or reported code as prose. The
enumeration moved; it did not stop. The position one layer over costs a
dependency -- and fence length, info strings, `~~~`, indented code and
heading-vs-paragraph all stop being cases to get right.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

import markdown2
import pytest
from tests._repo import REPO_ROOT

README = REPO_ROOT / "README.md"
# `START_DOCKER` was here. See the retirement note by
# `test_the_two_places_teaching_the_brew_line_agree` below.

#: Rendered elements whose text is prose a duplicate check should read.
#: Headings are **not** here: a repeated subheading is ordinary, and the
#: previous version failed the suite over one, accusing it of a copied move.
_PROSE_TAGS = {"p", "li", "td", "th", "dd"}
#: `pre`/`code` carry code; the badge header's `img`/`a` carry no text at all.
_CODE_TAGS = {"pre", "code"}
#: Below this, a repeat is idiom rather than a copy-instead-of-move -- "See
#: below." recurs legitimately. Measured on the shipping README: 54 paragraphs
#: kept, the shortest real prose below the floor is 26 characters, and the
#: defect that shipped was 66. Clearance both ways.
_MIN_PARAGRAPH = 40


class _ProseCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._stack: list[str] = []
        self._buffer: list[str] = []
        self._code_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in _CODE_TAGS:
            self._code_depth += 1
        elif tag in _PROSE_TAGS:
            self._flush()
            self._stack.append(tag)

    def handle_endtag(self, tag):
        if tag in _CODE_TAGS:
            self._code_depth = max(0, self._code_depth - 1)
        elif tag in _PROSE_TAGS and self._stack:
            self._flush()
            self._stack.pop()

    def handle_data(self, data):
        if self._stack and not self._code_depth:
            self._buffer.append(data)

    def _flush(self) -> None:
        text = " ".join("".join(self._buffer).split())
        if text:
            self.blocks.append(text)
        self._buffer = []


def prose_paragraphs(text: str) -> list[str]:
    collector = _ProseCollector()
    collector.feed(markdown2.markdown(
        text, extras=["fenced-code-blocks", "tables"]))
    collector.close()
    collector._flush()
    return [block for block in collector.blocks
            if len(block) >= _MIN_PARAGRAPH]


def duplicates(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for paragraph in prose_paragraphs(text):
        counts[paragraph] = counts.get(paragraph, 0) + 1
    return {text: count for text, count in counts.items() if count > 1}


_LONG = "The default 2 CPU and 2 GB of memory is thin for the Node build stage."
_PAD = "Filler paragraph, long enough to clear the minimum length rule."


#: Both reviews' probe tables. The rows that *pass* are the ones the next
#: rewrite breaks, so they are kept rather than trimmed to the failures.
@pytest.mark.parametrize("name,text,expect_duplicate", [
    # --- prose blocks that must be read ---
    ("plain sentence", f"{_LONG}\n\n{_PAD}\n\n{_LONG}\n", True),
    ("bullet item", f"- {_LONG}\n\n{_PAD}\n\n- {_LONG}\n", True),
    ("blockquote", f"> {_LONG}\n\n{_PAD}\n\n> {_LONG}\n", True),
    ("bold lead", f"**Note.** {_LONG}\n\n{_PAD}\n\n**Note.** {_LONG}\n", True),
    ("table cell", f"| a | b |\n| --- | --- |\n| {_LONG} | x |\n\n{_PAD}\n\n"
                   f"| a | b |\n| --- | --- |\n| {_LONG} | x |\n", True),
    ("rewrapped at a different column",
     f"The default 2 CPU and 2 GB of memory\nis thin for the Node build stage.\n\n"
     f"{_PAD}\n\nThe default 2 CPU and 2 GB\nof memory is thin for the Node build stage.\n",
     True),
    ("trailing whitespace differs", f"{_LONG}   \n\n{_PAD}\n\n{_LONG}\n", True),
    ("one word differs",
     f"{_LONG}\n\n{_PAD}\n\n{_LONG.replace('thin', 'thick')}\n", False),
    ("short repeat is idiom", "See below.\n\nfiller\n\nSee below.\n", False),

    # --- code is not prose, however the fence is spelled ---
    ("fenced code repeated", f"```\n{_LONG}\n```\n\n{_PAD}\n\n```\n{_LONG}\n```\n",
     False),
    ("indented fence", f"    ```\n    {_LONG}\n    ```\n\n{_PAD}\n\n"
                       f"    ```\n    {_LONG}\n    ```\n", False),
    # markdown2 does not implement `~~~` in any extra combination -- it
    # renders as a paragraph, so a duplicated tilde-fenced block reads as
    # duplicated prose. Encoded as what it does rather than what CommonMark
    # says, and `test_the_readme_uses_only_backtick_fences` keeps the README
    # out of the gap instead of this file re-deriving a fence scanner.
    ("tilde fence is not understood", f"~~~\n{_LONG}\n~~~\n\n{_PAD}\n\n"
                                      f"~~~\n{_LONG}\n~~~\n", True),
    ("info string", f"```bash\n{_LONG}\n```\n\n{_PAD}\n\n```bash\n{_LONG}\n```\n",
     False),
    ("4-space indented code block", f"    {_LONG}\n\n{_PAD}\n\n    {_LONG}\n",
     False),

    # --- round 2's fail-open set: a broken fence must not disable the check ---
    ("dup below an unclosed fence", f"```\ncode\n\n{_LONG}\n\n{_LONG}\n", True),
    ("dup below a lone backtick fence", f"{_PAD}\n\n```\n\n{_LONG}\n\n{_LONG}\n",
     True),
    ("dup below a 4-backtick fence", f"````\n```\n````\n\n{_LONG}\n\n{_LONG}\n",
     True),
    ("dup below ~~~ closed by backticks",
     f"~~~\ncode\n```\n\n{_LONG}\n\n{_LONG}\n", True),

    # --- headings repeat legitimately; the previous version failed on one ---
    ("repeated heading",
     "### Headless launch (for scripts and AI agents)\n\nfiller\n\n"
     "### Headless launch (for scripts and AI agents)\n", False),
])
def test_the_duplicate_check_reads_markdown_blocks(name, text, expect_duplicate):
    assert bool(duplicates(text)) is expect_duplicate, name


def test_the_readme_uses_only_backtick_fences():
    """The one place `markdown2` differs from CommonMark, held off the README.

    A `~~~` block renders as a paragraph, so its contents would be checked as
    prose and a duplicated one reported as a copied move. Asserting the input
    stays inside what the renderer implements is cheaper and more honest than
    this file growing a fence scanner again -- which is what the two previous
    versions were.
    """
    tilde_fences = [n for n, line in enumerate(README.read_text().splitlines(), 1)
                    if line.strip().startswith("~~~")]
    assert not tilde_fences, (
        f"README.md uses a `~~~` fence at line(s) {tilde_fences} -- markdown2 "
        "does not implement those, so the block would be read as prose. Use "
        "``` instead")


def test_no_prose_paragraph_appears_twice():
    """A moved paragraph that was copied rather than moved.

    Landed once: a sentence about VM sizing was repositioned by adding it in
    the right place and leaving the original two paragraphs below, under a code
    block whose flags it does not describe. Both copies read correctly in
    isolation, which is why review caught it and rereading did not.
    """
    repeated = duplicates(README.read_text())
    assert not repeated, (
        "README.md repeats a prose paragraph verbatim -- a move that copied "
        f"instead: {repeated}")


#: The brew line is taught in exactly two places, and they drifted the first
#: time one changed: `docker-buildx` was added to the README and not to the
#: script, which is the copy a reader hits *first* -- they run
#: `./start-docker.sh` before reading the docs, which is what its diagnostic
#: exists for.
#:
#: **Every `brew install` in each file, not the first one.** Since 2026-08-14
#: both teach two runtimes -- OrbStack and Colima -- and a `search` for the
#: first match compared the Colima lines while the OrbStack lines drifted
#: freely. That is a test quietly covering less than its name claims, which is
#: worse than one that admits the gap.
#:
#: `--cask` and any other flag is dropped rather than matched around: the old
#: pattern opened on `[a-z0-9]`, so `brew install --cask orbstack` did not
#: match at all and the coverage hole was invisible.
#:
#: **`)` and `"` terminate the match**, because start-docker.sh teaches the line
#: inside `echo "  (brew install ...)"` -- without them the last package is
#: captured as `orbstack)"` and never equals the README's `orbstack`, which
#: fails looking exactly like real drift.
_BREW = re.compile(r"brew install (?P<packages>[^\n`)\"]+)")


def _brew_installs(text: str) -> set[frozenset[str]]:
    """Every `brew install` in `text`, as one package set each, flags dropped."""
    found = set()
    for match in _BREW.finditer(text):
        packages = frozenset(
            token for token in match.group("packages").split()
            if not token.startswith("-"))
        if packages:
            found.add(packages)
    return found


# `test_the_two_places_teaching_the_brew_line_agree` was here, and is retired
# with `start-docker.sh` (deleted 2026-08-15 with the Python container).
#
# **Retired on its own terms rather than by judgement**: its docstring said
# "if that is deliberate, this test is what has to be retired with it", and the
# deliberate thing happened -- there is one launcher now, so there are no two
# places to keep equal. `start-node.sh` teaches no `brew` line at all, because
# it needs only Docker and the README's Quick Start is where that is installed.
#
# `_brew_installs` above is kept: it still parses the README, and the day a
# second place teaches the line again this is the parser to reach for.


#: Every document that teaches somebody how to start the product. A new one
#: belongs in this list rather than in a second assertion.
STARTUP_DOCS = (
    README,
    README.parent / "ui" / "README.md",
    README.parent / ".claude" / "codebase-structure.md",
)


def test_every_taught_start_command_builds():
    """`docker compose up` alone serves whatever image already exists.

    **Measured**: an image built from one source, then the source edited, then a
    plain `up` -- the container served the *old* build. `up --build` served the
    new one. Nothing in the app says which it is, and `logging: driver: "none"`
    means there is no log to notice it in either.

    **This used to be structural.** The deleted launcher built on every start,
    deliberately, because that replaced an older `find`-based staleness guard;
    two tests held it and went with the script. What is left is three lines of
    prose in three documents, and prose is what goes quietly wrong.

    Asserted on the *taught* command rather than on every mention, so a document
    may still show `docker compose down` or a `--no-cache` rebuild.
    """
    missing = []
    for doc in STARTUP_DOCS:
        assert doc.is_file(), f"{doc} moved; re-anchor this test"
        # **Fenced blocks only.** Prose *about* `docker compose up` -- "an
        # attached `docker compose up` still prints to the terminal" -- is not
        # somebody being taught to run it, and matching those made this fire on
        # two sentences that were entirely correct.
        fenced = False
        # **Continuations are joined before scanning.** A line-by-line check
        # needs `docker compose` and ` up` on the same line, so a command split
        # over a `\` -- which this repo already writes elsewhere -- teaches a
        # plain `up` invisibly. Measured: splitting one taught command left the
        # guard green.
        pending, started_at = "", 0
        for n, line in enumerate(doc.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("```"):
                fenced, pending = not fenced, ""
                continue
            if not fenced:
                continue

            if not pending:
                started_at = n
            pending = f"{pending} {stripped}".strip()
            if pending.endswith("\\"):
                pending = pending[:-1]
                continue

            command, pending = pending, ""
            # The start command, not `down`, `build`, `config` or `logs`.
            if "docker compose" in command and " up" in f"{command} ":
                if "--build" not in command:
                    missing.append(f"{doc.name}:{started_at}: {command}")

    assert not missing, (
        "a document teaches `docker compose up` without `--build`, so somebody "
        "following it serves whatever image was built last -- an edited front "
        "end or server, with nothing saying so:\n  " + "\n  ".join(missing))
