"""The prose in the issue forms and the pull request template.

**Vale reaches no `.yml` file**, so the labels, descriptions, placeholders and
option text in `.github/ISSUE_TEMPLATE/` were linted by nothing -- and they are
the first prose anybody filing an issue reads. `.github` is among the paths
`lint:prose` walks, which gains the Markdown template alone: the forms are YAML
and `[formats]` maps none.

**What this proves is not one-sided, unlike `test_ui_copy.py`.** A form is
parsed rather than pattern-matched, so the denominator is every prose field in
every form and a miss is a field this file does not name rather than one a
regular expression could not see.

Rules are loaded from `.vale/styles/Shared/*.yml` and never restated here, so
narrowing a rule narrows it everywhere at once. `Interface` is excluded: a form
a maintainer fills in is not the product's chrome. `KnowledgeBase` is excluded
for the same reason in the other direction -- it governs the note store's voice.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from test_vale_config import STYLES, load_swaps, load_tokens
from tests._repo import REPO_ROOT

FORMS = REPO_ROOT / ".github" / "ISSUE_TEMPLATE"

STYLE_NAMES = ["Shared"]

#: Rules that are about a file's shape rather than its words.
#
# **`HardWrap` is YAML's business here, not the prose's.** A folded block wraps
# where the file wants and arrives as one line; a literal block arrives with the
# newlines the author typed. Neither says anything about the sentence.
SCOPED = {("Shared", "HardWrap")}

RULES = [
    (style, p.stem)
    for style in STYLE_NAMES
    for p in sorted((STYLES / style).glob("*.yml"))
    if (style, p.stem) not in SCOPED
]

#: Where prose lives in a GitHub issue form.
PROSE_KEYS = ("label", "description", "placeholder", "value")


def _form_strings(path: Path) -> list[tuple[str, str, str]]:
    """Every prose value in one form, as `(file, where, text)`."""
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    found: list[tuple[str, str, str]] = []
    rel = path.relative_to(REPO_ROOT).as_posix()

    def take(where: str, value: object) -> None:
        if isinstance(value, str) and value.strip():
            found.append((rel, where, value.strip()))

    for key in ("name", "description", "title"):
        take(key, doc.get(key))

    # `config.yml` is a landing page rather than a form.
    for i, link in enumerate(doc.get("contact_links") or []):
        for key in ("name", "about"):
            take(f"contact_links[{i}].{key}", (link or {}).get(key))

    for i, block in enumerate(doc.get("body") or []):
        attrs = (block or {}).get("attributes") or {}
        for key in PROSE_KEYS:
            take(f"body[{i}].{key}", attrs.get(key))
        for j, option in enumerate(attrs.get("options") or []):
            # A checkbox option is a mapping with `label`; a dropdown option is
            # a bare string.
            if isinstance(option, dict):
                take(f"body[{i}].options[{j}].label", option.get("label"))
            else:
                take(f"body[{i}].options[{j}]", option)
    return found


def form_strings() -> list[tuple[str, str, str]]:
    found: list[tuple[str, str, str]] = []
    for path in sorted(FORMS.glob("*.yml")):
        found.extend(_form_strings(path))
    return found


def test_the_forms_are_where_this_expects_them() -> None:
    """A renamed directory would leave every assertion below vacuously true."""
    forms = sorted(p.name for p in FORMS.glob("*.yml"))
    assert forms, f"no issue forms under {FORMS}"
    assert "config.yml" in forms, "the contact links are no longer read"


def test_the_extractor_still_finds_the_forms_prose() -> None:
    """A structural change to the forms that leaves this reading nothing."""
    found = form_strings()
    assert len(found) > 40, (
        f"only {len(found)} strings extracted from {len(list(FORMS.glob('*.yml')))} "
        "forms, which is fewer than the labels alone"
    )
    values = {v for _, _, v in found}
    assert "What happens" in values, "a known field label is no longer extracted"


@pytest.mark.parametrize("style,rule", RULES, ids=lambda v: v)
def test_the_forms_obey_the_content_rules(style: str, rule: str) -> None:
    tokens = load_tokens(style, rule)
    swaps = load_swaps(style, rule)
    offenders = []
    for path, where, text in form_strings():
        for token in tokens:
            match = re.search(token, text, re.I)
            if not match:
                continue
            # A swap that found its own replacement is asking for what is
            # already written. -> the same guard in `test_ui_copy.py`
            if match.group(0) == swaps.get(token):
                continue
            offenders.append(f"{path}  {where}  [{match.group(0)}]  {text[:90]}")
            break
    assert not offenders, "{}.{} in the issue forms:\n  {}".format(
        style, rule, "\n  ".join(offenders)
    )
