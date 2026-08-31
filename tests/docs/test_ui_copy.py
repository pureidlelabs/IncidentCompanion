"""What the interface puts on screen, benchmarked against EUI's content guide.

**Vale reaches no `.tsx` file**, so the labels, placeholders, empty states,
button text and error messages were linted by nothing.

**What this proves is one-sided.** Every violation it reports is real; it
cannot support *"the interface obeys these rules"*, because the extractor is
regexes over source text and the denominator is unknown.


Rules are loaded from `.vale/styles/{Shared,Interface}/*.yml` and never
restated here, so narrowing a rule narrows it everywhere at once.
`IncidentCompanion` and `KnowledgeBase` are excluded -- a button label owes
neither the docs' voice nor the note store's.

**Two exclusions, both false positives first.** `server/src/demos/` is
fictional case content rather than interface chrome (-> `rules/writing-style.md`),
and a plain `Error` thrown in `ui/` is a developer invariant about the
component tree, which no analyst sees.
"""

from __future__ import annotations

import functools
import re
from pathlib import Path

import pytest

from test_vale_config import STYLES, load_swaps, load_tokens
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
UI = ROOT / "ui" / "src"
SERVER = ROOT / "server" / "src"

STYLE_NAMES = ["Shared", "Interface"]

#: Rules that need a narrower surface than "every string on screen".
#
# **`HeadingIsALabel` is wrong everywhere but a heading**, and the measurement
# is in its own file: 83 hits over the full extraction, 3 of them defects. The
# other 80 are API reference prose and the report's own section vocabulary,
# both of which are sentences on purpose. It gets `heading_strings()` instead.
SCOPED = {("Interface", "HeadingIsALabel")}

RULES = [
    (style, p.stem)
    for style in STYLE_NAMES
    for p in sorted((STYLES / style).glob("*.yml"))
    if (style, p.stem) not in SCOPED
]

COPY_PROPS = (
    "label|title|placeholder|description|aria-label|ariaLabel|emptyMessage|"
    "tooltip|heading|subtitle|caption|helperText|hint|confirmLabel|cancelLabel|"
    "actionLabel|message|summary|alt|legend"
)

PATTERNS = [
    re.compile(rf'\b(?:{COPY_PROPS})\s*=\s*"([^"]{{4,200}})"'),
    re.compile(rf"\b(?:{COPY_PROPS})\s*=\s*'([^']{{4,200}})'"),
    re.compile(rf'\b(?:{COPY_PROPS})\s*=\s*\{{\s*[\'"]([^\'"]{{4,200}})[\'"]\s*\}}'),
    re.compile(rf"\b(?:{COPY_PROPS})\s*:\s*'([^']{{4,200}})'"),
    re.compile(rf'\b(?:{COPY_PROPS})\s*:\s*"([^"]{{4,200}})"'),
    # **Newlines allowed on purpose.** A JSX text node wraps at the print
    # width, so `…on the\n  left.` is one sentence to a reader and two lines to
    # a regex. The first version of this excluded `\n` and therefore could not
    # see any wrapped copy -- which is most of the longer sentences, including
    # the only directional-language violation in the interface.
    re.compile(r">\s*([A-Z][a-z][^<>{}]{6,200}?)\s*<", re.S),
    re.compile(r"(?:toast|notify|showError|showSuccess|setError)[.\w]*\(\s*['\"]([^'\"]{4,200})"),
]

#: A prop whose value is a backtick string with nothing interpolated.
#
# **`title={`…`}` was invisible.** Measured: a violation planted in one left
# the suite green, three simultaneous ones (`Oops`, `Something went wrong`,
# `on the left`) and still green.
TEMPLATE_PROP = re.compile(
    rf'\b(?:{COPY_PROPS})\s*=\s*\{{\s*`([^`${{]{{4,200}})`\s*\}}'
)

#: Any sentence-shaped literal inside a `.tsx` file.
#
# **The ternary is why this exists.** `{cond ? 'There is nothing at this
# address' : 'This screen stopped rendering'}` is the most common way this
# interface picks copy, and none of the prop or JSX-text patterns above reach
# inside an expression container -- so all four branches of `RouteError`, the
# longest sentences on that screen, were unlinted.
#
# Deliberately broad and then filtered, rather than another enumeration of
# syntax: the enumeration is what missed twice already.
SENTENCE = re.compile(
    r"(?<![\w`])'([A-Z][^'\\]{8,200}?)'"
    r'|(?<![\w`])"([A-Z][^"\\]{8,200}?)"'
    # A toast is a call argument, not a prop, so `TEMPLATE_PROP` never
    # reached it -- the five toasts in the app were 0% covered by the
    # `ErrorTone` rules written for them.
    r"|(?<![\w`])`([A-Z][^`${]{8,200}?)`"
)
#: A line that declares a module or opens a test block, not one that holds copy.
#
# **Matched on the prefix, because the whole-line form ate real copy.** The
# first version tested the entire line for these words and therefore discarded
# any label whose own text ends in one -- `submitLabel={door === 'blank' ?
# 'Create case' : 'Create and import'}` was dropped by the word `import` inside
# its own copy, which is the exact shape the sweep exists to catch. Nine strings
# went that way.
#: A console diagnostic: addressed to whoever wired the component wrongly.
#
# **The developer invariant the module docstring already excludes for `throw`,
# reached by a different verb.** `tree.tsx` warns *"TreeItemLabel: No item
# provided via props or context"* when a component is used outside its
# provider, and no analyst has a console open. Excluding by *file* would have
# taken the vendored tree's real copy with it.
#
# **Kept out of `NOT_COPY` because it is the only one safe to apply to the
# line above.** `export const MESSAGE =` wraps onto its own string too, and a
# lookbehind for the whole of `NOT_COPY` would silently unlint every copy
# constant declared that way.
CONSOLE = re.compile(r"\bconsole\.(warn|error|log|info|debug)\(")


def opens_a_console_call(line: str) -> bool:
    """True when `line` starts a console call that has not closed on it.

    **The unclosed test is the whole of it, and a bare `CONSOLE.search` was
    wrong.** Measured 2026-08-23 by planting `"Oops, something went wrong via
    the tree"` on the line directly under a *complete* `console.warn(...)`:
    the suite stayed green, so two rules that should both have fired were
    silently switched off for every line following any console call in the
    tree. The break-verify that found it went green, which is the outcome that
    carries information.
    """
    return bool(CONSOLE.search(line)) and line.count("(") > line.count(")")

NOT_COPY = re.compile(
    r"^\s*(import|export)\b|\b(describe|it|test|expect)\(\s*$|" + CONSOLE.pattern
)

#: A comment line, which quotes other people's copy to explain why ours differs.
#
# **This is the cost of the broad `SENTENCE` sweep.** `RouteError.tsx` and
# `severity-badge.tsx` both quote React Router's *"Unexpected Application
# Error!"* in a docstring, to say what the app replaced -- and an exclamation
# mark inside an explanation of somebody else's exclamation mark is not a
# violation of anything.
COMMENT_LINE = re.compile(r"^\s*(\*|//|/\*)")
#: Nest exceptions reach the browser as the message the analyst is shown.
SERVER_THROWN = re.compile(r"\w+Exception\(\s*['\"]([^'\"]{4,200})")


def is_copy(path: Path) -> bool:
    parts = path.parts
    return not (
        ".test." in path.name
        or path.name.endswith(".stories.tsx")   # Storybook story names
        or "demos" in parts                      # fictional case content
        or "fixtures" in parts
    )


@functools.lru_cache(maxsize=1)
def screen_strings() -> tuple[tuple[str, int, str], ...]:
    found = []
    for root in (UI, SERVER):
        for f in sorted(root.rglob("*")):
            if f.suffix not in {".ts", ".tsx"} or not is_copy(f):
                continue
            text = f.read_text(errors="ignore")
            patterns = list(PATTERNS) + [TEMPLATE_PROP]
            if root is SERVER:
                patterns.append(SERVER_THROWN)
            # **Every TypeScript file, not just `.tsx`.** Restricting the
            # sweep to components left 72 sentence-shaped literals unlinted,
            # including `api/backendHealth.ts` -- the banner an analyst reads
            # when Postgres or Redis is down.
            patterns.append(SENTENCE)
            lines = text.split("\n")
            for pattern in patterns:
                for match in pattern.finditer(text):
                    # `SENTENCE` has two alternatives, so take whichever caught.
                    value = next((g for g in match.groups() if g), "").strip()
                    if not value or value.startswith(("http", "/", "#", "{")):
                        continue
                    if "${" in value or not re.search(r"[a-z]{2}", value):
                        continue
                    line = text[: match.start()].count("\n") + 1
                    source_line = lines[line - 1]
                    # **The line above counts as well, because a call wraps.**
                    # `console.warn(` and its message are on two lines whenever
                    # the message is long, which is exactly when it is
                    # sentence-shaped enough for `SENTENCE` to catch. One line
                    # of lookbehind, not a brace walk: the wrapped-call shapes
                    # this file cares about all put the opener directly above.
                    above = lines[line - 2] if line >= 2 else ""
                    if NOT_COPY.search(source_line) or opens_a_console_call(above):
                        continue
                    if COMMENT_LINE.match(source_line):
                        continue
                    # Collapse the wrap, so a rule sees the sentence a reader
                    # sees rather than the line the formatter chose.
                    value = " ".join(value.split())
                    found.append((str(f.relative_to(ROOT)), line, value))
    # One string can be caught by two patterns; a rule only needs to see it once.
    return tuple(dict.fromkeys(found))


def test_the_extractor_still_finds_the_interface_s_copy() -> None:
    """Without this, every assertion below passes over an empty list.

    The first version of this extractor captured the *prop name* rather than
    its value, so 587 of 766 strings were the word `label` and every content
    rule scored zero -- indistinguishable from copy that is already perfect.
    """
    found = screen_strings()
    assert len(found) > 700, (
        f"only {len(found)} strings found; the extractor has stopped matching "
        "how this interface declares its copy."
    )
    values = {v for _, _, v in found}
    assert "Back to your cases" in values, "a known button label is no longer extracted"


@pytest.mark.parametrize("style,rule", RULES, ids=lambda v: v)
def test_the_interface_copy_obeys_the_content_rules(style: str, rule: str) -> None:
    tokens = load_tokens(style, rule)
    swaps = load_swaps(style, rule)
    offenders = []
    for path, line, text in screen_strings():
        for token in tokens:
            match = re.search(token, text, re.I)
            if not match:
                continue
            # **A swap that found its own replacement is not a violation.**
            # The patterns are matched case-insensitively, so `redis -> Redis`
            # fires on `Redis` and asks for what is already written. A rule that
            # reports the correct form is one somebody switches off.
            if match.group(0) == swaps.get(token):
                continue
            # **A whole-string match is a control's label, not prose.** These
            # rules exist for a sentence a reader cannot resolve later -- `last
            # month` inside a paragraph. A button or chip reading `Next month`
            # is the control naming what it does, and React Aria wants exactly
            # that string as the calendar's accessible name.
            #
            # **Only for a token rule.** A substitution is about how a word is
            # spelled, and a one-word label is exactly where a misspelling
            # lands -- excusing whole-string matches here let a bare `redis`
            # through, which a break-verify caught and this comment records.
            if not swaps and match.group(0).strip().lower() == text.strip().lower():
                continue
            offenders.append(f"{path}:{line}  [{match.group(0)}]  {text[:90]}")
            break
    assert not offenders, "{}.{} in interface copy:\n  {}".format(
        style, rule, "\n  ".join(offenders)
    )


#: A prop whose value names a region rather than describing it.
#
# **The slot is what makes this rule decidable, not the words.** `title`,
# `heading` and `legend` are the three props in this interface that draw a
# label above other controls; `description`, `subtitle` and `placeholder` sit
# beside or under one and may be sentences. Kept deliberately short -- a prop
# added here without re-running the measurement in
# `.vale/styles/Interface/HeadingIsALabel.yml` is how a scoped rule becomes a
# blanket one by accident.
HEADING_PROPS = "title|heading|legend"
HEADING = [
    re.compile(rf'\b(?:{HEADING_PROPS})\s*=\s*"([^"]{{2,200}})"'),
    re.compile(rf"\b(?:{HEADING_PROPS})\s*=\s*'([^']{{2,200}})'"),
    re.compile(rf"\b(?:{HEADING_PROPS})\s*:\s*'([^']{{2,200}})'"),
    re.compile(rf'\b(?:{HEADING_PROPS})\s*:\s*"([^"]{{2,200}})"'),
    re.compile(rf'\b(?:{HEADING_PROPS})\s*=\s*\{{\s*`([^`${{]{{2,200}})`\s*\}}'),
]


@functools.lru_cache(maxsize=1)
def heading_strings() -> tuple[tuple[str, int, str], ...]:
    """Only the strings drawn as a label over a region.

    **`ui/` only.** A server-side `title:` is an OpenAPI schema title, read in
    Redocly by somebody writing a client -- the same surface `Interface` is
    kept off, for the reason `rules/writing-style.md` records.
    """
    found = []
    for f in sorted(UI.rglob("*")):
        if f.suffix not in {".ts", ".tsx"} or not is_copy(f):
            continue
        text = f.read_text(errors="ignore")
        lines = text.split("\n")
        for pattern in HEADING:
            for match in pattern.finditer(text):
                value = " ".join((match.group(1) or "").split())
                if not value or "${" in value or not re.search(r"[a-z]{2}", value):
                    continue
                line = text[: match.start()].count("\n") + 1
                if COMMENT_LINE.match(lines[line - 1]):
                    continue
                found.append((str(f.relative_to(ROOT)), line, value))
    return tuple(dict.fromkeys(found))


def test_the_heading_extractor_still_finds_headings() -> None:
    """Without this, the rule below passes over an empty list.

    The floor is the count the rule was measured against. A collapse means the
    interface stopped declaring its headings this way, and the measurement in
    `HeadingIsALabel.yml` no longer describes anything.
    """
    found = heading_strings()
    assert len(found) > 120, (
        f"only {len(found)} headings found; the extractor has stopped matching "
        "how this interface declares them."
    )


@pytest.mark.parametrize("style,rule", sorted(SCOPED), ids=lambda v: v)
def test_a_heading_is_a_label_and_not_a_sentence(style: str, rule: str) -> None:
    """A heading names its region; the sentence explaining it is the subtitle.

    **What this cannot see** is the other half of the same defect --
    *"The work - everyone who can sign in"* carries no interrogative opener and
    reads exactly as wrong. Catching it needs a finite verb, and every cheap
    test for one fires on `Add` and `Sign in`.
    """
    tokens = load_tokens(style, rule)
    offenders = []
    for path, line, text in heading_strings():
        for token in tokens:
            match = re.search(token, text, re.I)
            if match:
                offenders.append(f"{path}:{line}  {text[:90]}")
                break
    assert not offenders, "{}.{} in interface headings:\n  {}".format(
        style, rule, "\n  ".join(offenders)
    )
