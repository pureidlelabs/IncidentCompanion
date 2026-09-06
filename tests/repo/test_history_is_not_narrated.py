"""`Shared.NoHistory`'s tokens, scanned where Vale cannot reach.

**A narrow repair of an existing policy, not a new one.** The tokens are read
from `.vale/styles/Shared/NoHistory.yml` so the two cannot disagree; what
differs is only the text they are matched against.

Vale misses two shapes, both measured on 2026-09-05:

- **A shebang suppresses the whole file.** The same docstring reports one
  finding without `#!/usr/bin/env python3` above it and none with it.
- **A token spanning a line break never matches.** `The old\\nversion failed
  open` is invisible where the same sentence on one line is caught, and
  comments here wrap at about 76 characters.

So this joins each comment run into one string and collapses its whitespace
before matching, which is the scope the rule was always meant to have.

`INVENTORY` is the backlog, and it only shrinks. An entry is removed when the
file it names is reviewed, and the test refuses an entry that no longer
matches, so the list cannot outlive the prose it describes.
"""

from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
RULE = ROOT / ".vale" / "styles" / "Shared" / "NoHistory.yml"

TREES = ("server/src", "ui/src", "server/e2e", "server/test", "tests", ".claude")

#: Findings that predate this check, by file and matched token. Classified when
#: the file comes up in its own review batch; never added to.
INVENTORY: dict[str, dict[str, int]] = {
    '.claude/tests/test_stack_check.py': {'the old version': 1},
    'server/src/install-activity/severity.ts': {'the first version': 1},
    'server/src/live/live.gateway.test.ts': {'used to be': 1},
    'server/src/report/document/widths.test.ts': {'the first version': 1},
    'ui/src/api/proseSync.ts': {'this replaced': 1},
    'ui/src/components/ui/kit-owns-the-primitives.rule.test.ts': {'an earlier form': 1},
    'ui/src/components/ui/switch.tsx': {'used to be': 1},
    'ui/src/components/ui/tabs.tsx': {'an earlier note': 1},
    'ui/src/test/select.ts': {'used to be': 1},
}


def _tokens() -> list[str]:
    """The rule's own token list, so a token added there is scanned here."""
    found: list[str] = []
    inside = False
    for raw in RULE.read_text(encoding="utf8").splitlines():
        line = raw.strip()
        if line.startswith("tokens:"):
            inside = True
            continue
        if inside and line.startswith("- "):
            found.append(line[2:].strip().strip("'\""))
    assert found, f"no tokens parsed from {RULE}; the rule's shape changed"
    return found


#: **Relative to `ROOT`, because a checkout can live inside `.claude/worktrees/`.**
#: Tested against the absolute path, every part of that checkout matches and the
#: walk skips the whole tree -- the empty sweep this file exists to refuse,
#: arriving in the file that refuses it.
def _excluded(path: pathlib.Path) -> bool:
    inside = path.relative_to(ROOT).parts
    return "node_modules" in inside or "worktrees" in inside


def _comment_runs(path: pathlib.Path) -> list[str]:
    """Every comment run in the file, joined and whitespace-collapsed."""
    text = path.read_text(encoding="utf8", errors="ignore")
    runs: list[str] = []
    if path.suffix == ".py":
        for block in re.findall(r'"""(.*?)"""', text, re.S):
            runs.append(block)
        runs += ["\n".join(re.findall(r"^\s*#[^\n]*", text, re.M))]
    else:
        runs += re.findall(r"/\*(.*?)\*/", text, re.S)
        runs += ["\n".join(re.findall(r"^\s*//[^\n]*", text, re.M))]
    cleaned = []
    for run in runs:
        flat = re.sub(r"^\s*(\*|//|#)\s?", " ", run, flags=re.M)
        cleaned.append(re.sub(r"\s+", " ", flat).strip())
    return [c for c in cleaned if c]


def _found() -> dict[str, dict[str, int]]:
    patterns = [re.compile(t, re.I) for t in _tokens()]
    out: dict[str, dict[str, int]] = {}
    for tree in TREES:
        root = ROOT / tree
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".py"}:
                continue
            if _excluded(path):
                continue
            for run in _comment_runs(path):
                for pattern in patterns:
                    for hit in pattern.finditer(run):
                        key = str(path.relative_to(ROOT))
                        out.setdefault(key, {})
                        token = hit.group(0).lower()
                        out[key][token] = out[key].get(token, 0) + 1
    return out


def test_it_walks_a_corpus_at_all() -> None:
    """An empty walk reports no history and passes, which is the shape above."""
    walked = sum(
        1
        for tree in TREES
        if (ROOT / tree).is_dir()
        for path in (ROOT / tree).rglob("*")
        if path.suffix in {".ts", ".tsx", ".py"} and not _excluded(path)
    )
    assert walked > 500, f"only {walked} files walked; the exclusion or the trees moved"


def test_no_comment_narrates_the_code_s_own_past() -> None:
    found = _found()
    unexpected = {
        path: {t: n for t, n in tokens.items()
               if n > INVENTORY.get(path, {}).get(t, 0)}
        for path, tokens in found.items()
    }
    unexpected = {p: t for p, t in unexpected.items() if t}
    assert not unexpected, (
        "history narrated in a comment, which belongs in the commit message:\n  "
        + "\n  ".join(f"{p}: {t}" for p, t in sorted(unexpected.items())))


def test_the_inventory_holds_nothing_that_has_gone() -> None:
    """An entry whose prose was fixed must leave, or the backlog reads as work."""
    found = _found()
    stale = {
        path: {t: n for t, n in tokens.items()
               if found.get(path, {}).get(t, 0) < n}
        for path, tokens in INVENTORY.items()
    }
    stale = {p: t for p, t in stale.items() if t}
    assert not stale, (
        "these inventory entries no longer match; remove them:\n  "
        + "\n  ".join(f"{p}: {t}" for p, t in sorted(stale.items())))
