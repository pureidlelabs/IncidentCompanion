"""A count of this repository's own tests or files, inside a comment.

**The claim is durable and the number is not.** *Deleting the guard left the
whole suite green* stays true for as long as the guard is unasserted; *left
2362 tests green* is wrong the first time somebody adds a test, and a reader
cannot tell which half has rotted. `rules/docstrings.md` already sends a
measured number to the commit message that acted on it; this is what refuses
the next one.

**Only a count of tests, files or suites.** A fixture size -- *399 rows*, *300
entries* -- describes the test's own data and moves only when the test does, so
it is not scanned. Widening past this reports mostly fixture sizes.

The comment walk is `test_history_is_not_narrated.py`'s, imported rather than
copied, so a comment form it learns to see is seen here too.

`INVENTORY` is the backlog and it only shrinks. The second test refuses an
entry that no longer matches, so the list cannot outlive the prose.
"""

from __future__ import annotations

import importlib.util
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SIBLING = pathlib.Path(__file__).with_name("test_history_is_not_narrated.py")

_spec = importlib.util.spec_from_file_location("_history", SIBLING)
assert _spec and _spec.loader
_history = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_history)

#: A count of things this repository holds, which every commit can move.
#:
#: **One qualifier is allowed between the number and the noun**, because "2714
#: server tests" and "1326 unit tests" are the same claim as "470 tests" and the
#: bare form misses seven of them. A *determiner* there is not a qualifier: "the
#: same 400 this file exists to stop" is an HTTP status, and excluding
#: `this|that|the|a|an` separates the two exactly.
COUNTED = re.compile(
    r"\b[\d,]{2,6}\s+(?!this\b|that\b|the\b|an?\b)(?:\w+\s+)?(?:tests?|files?|suites?)\b",
    re.I)

#: Findings that predate this check, by file and matched phrase. Classified
#: when the file comes up in its own review batch; never added to.
INVENTORY: dict[str, dict[str, int]] = {
    '.claude/scripts/test_scope.py': {'780 files': 1},
    '.claude/tests/test_stale_references.py': {'327 tests': 1},
    'server/e2e/visual/exclude.ts': {'60 kit files': 1},
    'server/src/collections/conflicts.test.ts': {'470 tests': 1},
    'server/src/collections/identity.test.ts': {'75 tests': 1},
    'server/src/collections/reorder.test.ts': {'172 tests': 1},
    'server/src/prose/prose.service.test.ts': {'29 tests': 1},
    'server/src/report/figure-render.test.ts': {'514 tests': 1},
    'server/test/database.ts': {'28 files': 1},
    'server/test/security-headers.test.ts': {'18 files': 1},
    'tests/docker/test_container_config.py': {
        '55 tests': 1, '43 deployment tests': 1, '24 deployment tests': 1,
        '31 compose tests': 1,
    },
    'tests/docs/test_vale_config.py': {'19 files': 1},
    'tests/repo/test_docstring_claims.py': {'475 files': 1},
    'ui/src/a-floating-panel-is-opaque.rule.test.ts': {'419 files': 1},
    'ui/src/api/entityTargets.test.ts': {'1326 unit tests': 1},
    'ui/src/every-story-has-an-intro.rule.test.ts': {'263 story files': 1},
    'ui/src/screens/row-detail.test.tsx': {'14 files': 1},
    'ui/src/structure.test.ts': {'1366 tests': 1},
}


def _found() -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for tree in _history.TREES:
        root = ROOT / tree
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".py"}:
                continue
            if _history._excluded(path):
                continue
            if path.resolve() == pathlib.Path(__file__).resolve():
                continue
            for run in _history._comment_runs(path):
                for hit in COUNTED.finditer(run):
                    key = str(path.relative_to(ROOT))
                    phrase = hit.group(0).lower()
                    out.setdefault(key, {})
                    out[key][phrase] = out[key].get(phrase, 0) + 1
    return out


def test_it_scans_a_corpus_at_all() -> None:
    """An empty walk would pass this file over nothing.

    The tree being present is not the same as its files being walked: the
    exclusion is what decides that, and it is shared with the sibling module.
    """
    seen = sum(1 for tree in _history.TREES if (ROOT / tree).is_dir())
    assert seen == len(_history.TREES), f"only {seen} of the trees are present"
    walked = sum(
        1
        for tree in _history.TREES
        for path in (ROOT / tree).rglob("*")
        if path.suffix in {".ts", ".tsx", ".py"} and not _history._excluded(path)
    )
    assert walked > 500, f"only {walked} files walked; the exclusion or the trees moved"


def test_no_comment_counts_the_repository_s_own_tests_or_files() -> None:
    found = _found()
    unexpected = {
        path: {p: n for p, n in phrases.items()
               if n > INVENTORY.get(path, {}).get(p, 0)}
        for path, phrases in found.items()
    }
    unexpected = {p: v for p, v in unexpected.items() if v}
    assert not unexpected, (
        "a count of this repository's own tests or files, which the next "
        "commit moves -- keep the claim, and put the number in the commit "
        "message that measured it:\n  "
        + "\n  ".join(f"{p}: {v}" for p, v in sorted(unexpected.items())))


def test_the_inventory_holds_nothing_that_has_gone() -> None:
    """An entry whose prose was fixed must leave, or the backlog reads as work."""
    found = _found()
    stale = {
        path: {p: n for p, n in phrases.items()
               if found.get(path, {}).get(p, 0) < n}
        for path, phrases in INVENTORY.items()
    }
    stale = {p: v for p, v in stale.items() if v}
    assert not stale, (
        "these inventory entries no longer match; remove them:\n  "
        + "\n  ".join(f"{p}: {v}" for p, v in sorted(stale.items())))
