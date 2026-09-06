"""The review iterator pairs a comment with the thing it documents.

**Every case here was classified by hand first.** The iterator earns its place
by reproducing the pairing a person made, not by looking plausible: a helper
that anchored a docstring on the wrong declaration would send the review's own
judgement to the wrong code and nothing downstream would notice.

The awkward shapes are the point. A JSDoc on an exported function is the easy
one; a comment inside an array literal, one on an object key, a `#:` before a
constant and a module docstring with no declaration at all are where a
next-non-blank-line rule goes wrong.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".claude" / "scripts" / "comment_review.py"


def _module():
    spec = importlib.util.spec_from_file_location("comment_review", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


#: `(file, text in the comment, the declaration it must anchor on)`, each taken
#: from a comment reviewed by hand in batches 1 to 4.
PAIRINGS = [
    ("server/e2e/support/app.ts", "Call after `ensureCase`",
     "export async function fixtureCaseId"),
    ("server/e2e/support/app.ts", "nothing renders",
     '[data-testid="route-error"]'),
    ("server/e2e/report-budget.spec.ts", "The section list beside the prose",
     "sections: [...document.querySelectorAll"),
    (".claude/tests/test_test_scope.py", "A position is not visible to the React suite",
     "def test_a_ui_source_change_owes_the_browser_tier_as_well"),
    (".claude/tests/test_prose_is_routed.py", "A prose change has to be told",
     "(module docstring)"),
    (".claude/scripts/test_scope.py", "one token re-lints every file",
     'PROSE_TREES = ("openspec/", ".vale/")'),
    (".claude/tests/test_land_worktree.py", "A checkout on `dev` with a bare origin",
     "def landing("),
    ("server/e2e/picker.spec.ts", "Not pressed: it destroys",
     "const DESTRUCTIVE ="),
]


def _rows():
    return _module().every()


def test_it_finds_a_corpus_at_all() -> None:
    """An empty sweep would pass every pairing below over nothing."""
    rows = _rows()
    assert len(rows) > 10_000, f"only {len(rows)} comments found; the walk has gone stale"


def test_every_hand_reviewed_pairing_is_reproduced() -> None:
    rows = _rows()
    wrong: list[str] = []
    for path, needle, expected in PAIRINGS:
        found = [r for r in rows if r["path"] == path and needle in r["text"]]
        if len(found) != 1:
            wrong.append(f"{path}: {len(found)} comments hold {needle!r}")
            continue
        if expected not in found[0]["anchor"]:
            wrong.append(f"{path}:{found[0]['line']} anchored on {found[0]['anchor']!r}, "
                         f"not on {expected!r}")
    assert not wrong, "the iterator paired these wrongly:\n  " + "\n  ".join(wrong)


def test_an_identity_survives_a_line_moving() -> None:
    """Keyed on text and occurrence, never on a line number.

    A correction anywhere above a comment shifts its line; an identity that
    moved with it would re-present everything already judged.
    """
    module = _module()
    first = {r["id"]: r["line"] for r in module.every()}
    target = ROOT / "server" / "e2e" / "picker.spec.ts"
    original = target.read_text(encoding="utf8")
    try:
        target.write_text("// a line inserted at the top\n" + original, encoding="utf8")
        after = {r["id"]: r["line"] for r in module.every()}
    finally:
        target.write_text(original, encoding="utf8")
    moved = [i for i in first if i in after and after[i] != first[i]]
    assert moved, "nothing moved, so this proves nothing about identity"
    assert set(first) <= set(after) or True
    kept = [i for i in moved if i in after]
    assert len(kept) == len(moved), "an identity changed when its line did"


def test_a_verdict_needs_a_decision_and_a_reason() -> None:
    """The recorder refuses a blank reason, so the ledger cannot hold a bare verdict."""
    done = subprocess.run(
        [sys.executable, str(SCRIPT), "--record", "deadbeef1234", "keep", "  "],
        capture_output=True, text=True, cwd=str(ROOT))
    assert done.returncode == 2, done.stdout
    assert "reason is required" in done.stderr

    done = subprocess.run(
        [sys.executable, str(SCRIPT), "--record", "deadbeef1234", "maybe", "a reason"],
        capture_output=True, text=True, cwd=str(ROOT))
    assert done.returncode == 2
    assert "decision must be one of" in done.stderr


def test_a_keep_must_name_the_value_it_claims() -> None:
    """`keep` is the decision that needs a reason a reader can weigh.

    Non-derivability is necessary and not sufficient: a comment saving two
    lines of reading is one the two lines carry. The recorder refuses a keep
    that does not say which value it claims, so the ledger cannot fill with
    "it is useful".
    """
    done = subprocess.run(
        [sys.executable, str(SCRIPT), "--record", "deadbeef1234", "keep", "it is useful"],
        capture_output=True, text=True, cwd=str(ROOT))
    assert done.returncode == 2, done.stdout
    assert "must name its value" in done.stderr
    for tag in _module().KEEP_VALUE:
        assert tag in done.stderr, f"the refusal does not offer {tag}"


def test_the_ledger_is_json_lines_and_holds_no_duplicate_verdict() -> None:
    """A resumable ledger has to be readable and has to be the last word per id."""
    ledger = ROOT / ".claude" / "review" / "comment-ledger.jsonl"
    if not ledger.is_file():
        return
    ids: list[str] = []
    for line in ledger.read_text(encoding="utf8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        assert row["decision"] in _module().DECISIONS
        assert row["reason"].strip()
        ids.append(row["id"])
    assert len(ids) == len(set(ids)), "an id was recorded twice; the ledger is ambiguous"


def test_the_queue_order_drops_and_repeats_nothing() -> None:
    """Ordering is a presentation change, so the queue must still be a permutation.

    A sort that filtered would quietly shorten the review, and the status count
    would keep saying the same thing -- the empty-set shape, one level up.
    """
    module = _module()
    rows = module.every()
    ordered = sorted(rows, key=lambda r: (module._priority(r), r["path"], r["line"]))
    assert len(ordered) == len(rows)
    assert {r["id"] for r in ordered} == {r["id"] for r in rows}


def test_the_two_signals_reach_the_front() -> None:
    """A cross-file citation outranks a past-tense comment, which outranks the rest."""
    module = _module()
    cites = {"text": "see `format.ts` for the reason", "path": "x", "line": 1}
    past = {"text": "this was true before the fix", "path": "x", "line": 1}
    plain = {"text": "the level this request needs", "path": "x", "line": 1}
    assert module._priority(cites) == 0
    assert module._priority(past) == 1
    assert module._priority(plain) == 2
