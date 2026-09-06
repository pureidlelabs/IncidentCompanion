"""The review iterator pairs a comment with the thing it documents, and the
inventory beneath it decides what counts as a comment at all.

**Every pairing here was classified by hand first.** The iterator earns its
place by reproducing the pairing a person made, not by looking plausible: a
helper that anchored a docstring on the wrong declaration would send the
review's own judgement to the wrong code and nothing downstream would notice.

The awkward shapes are the point. A JSDoc on an exported function is the easy
one; a comment inside an array literal, one on an object key, a `#:` before a
constant and a module docstring with no declaration at all are where a
next-non-blank-line rule goes wrong.

**Nothing here edits the repository.** The extraction and the classifier are
pure over a string, and the ledger tests run against a fixture tree with `ROOT`
pointed at it -- a suite that wrote to the tree it measures would race the
inventory it is checking.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".claude" / "scripts" / "comment_review.py"


def _module():
    spec = importlib.util.spec_from_file_location("comment_review", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def review():
    return _module()


@pytest.fixture(scope="module")
def inventory(review):
    return review._INVENTORY


@pytest.fixture(scope="module")
def rows(review):
    return review.every()


#: `(file, text in the comment, the declaration it must anchor on)`, each taken
#: from a comment whose pairing a person judged before the iterator was
#: written.
PAIRINGS = [
    ("server/e2e/support/app.ts", "Call after `ensureCase`",
     "export async function fixtureCaseId"),
    ("server/e2e/support/app.ts", "nothing renders",
     '[data-testid="route-error"]'),
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


def test_it_finds_a_corpus_at_all(rows) -> None:
    """An empty sweep would pass every pairing below over nothing."""
    assert len(rows) > 10_000, f"only {len(rows)} comments found; the walk has gone stale"


def test_every_hand_reviewed_pairing_is_reproduced(rows) -> None:
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


# ------------------------------------------------------- what counts as a comment

def _spans(inventory, source: str) -> list[dict]:
    return inventory._python_comments("fixture.py", source)


def test_a_triple_quoted_string_that_documents_nothing_is_code(inventory) -> None:
    """`ast.get_docstring` is the arbiter, so a fixture body is not prose."""
    source = 'SQL = """\nselect 1\n"""\n\n\ndef f():\n    """Real."""\n    return 1\n'
    kinds = [(s["kind"], s["line"]) for s in _spans(inventory, source)]
    assert kinds == [("docstring", 7)], kinds


def test_comment_syntax_inside_a_string_is_code(inventory) -> None:
    source = 'a = "# not a comment"\nb = 1  # a comment\n'
    spans = _spans(inventory, source)
    assert [(s["line"], s["col"], s["text"]) for s in spans] == [(2, 7, "# a comment")]


def test_unicode_before_a_docstring_does_not_move_its_span(inventory) -> None:
    """`ast` reports a UTF-8 byte column and `tokenize` a character one.

    Combining the two without converting puts the docstring's start several
    columns to the right, which silently reclassifies the line it opens on.
    """
    source = 'def f(a="ééé"):\n    """Doc."""\n    return a\n'
    doc = [s for s in _spans(inventory, source) if s["kind"] == "docstring"]
    assert len(doc) == 1
    assert (doc[0]["line"], doc[0]["col"], doc[0]["endCol"]) == (2, 4, 14)


def test_both_quote_styles_and_a_single_line_docstring_are_found(inventory) -> None:
    source = "def f():\n    '''Doc.'''\n    return 1\n"
    spans = _spans(inventory, source)
    assert [s["kind"] for s in spans] == ["docstring"]
    assert spans[0]["text"] == "'''Doc.'''"


def test_hash_comments_group_only_across_whitespace(inventory) -> None:
    """A run is one claim; a line of code or a blank line ends it."""
    source = "# one\n# two\na = 1\n# three\n\n# four\n"
    spans = _spans(inventory, source)
    assert [s["text"] for s in spans] == ["# one\n# two", "# three", "# four"]


def test_a_shebang_is_a_protected_comment(inventory) -> None:
    source = "#!/usr/bin/env python3\na = 1\n"
    spans = _spans(inventory, source)
    assert spans[0]["protected"] is True


# ------------------------------------------------------- the line accounting

FIXTURE = '''\
"""Module doc.

Two lines.
"""
import os

# A run of two
# ordinary lines.
VALUE = 1  # trailing


def f():
    """One line."""
    return os
'''

#: Hand-counted from `FIXTURE`, line by line: 1, 3, 4, 7, 8 and 13 are comment,
#: 5, 12 and 14 are code, 9 is mixed, and 2, 6, 10 and 11 are blank -- line 2
#: being the empty line inside the module docstring.
FIXTURE_CATEGORIES = {"comment_only": 6, "code_only": 3, "mixed": 1, "blank": 4}


def test_a_fixture_with_known_categories_yields_the_expected_ratio(inventory) -> None:
    totals = inventory.classify(FIXTURE, _spans(inventory, FIXTURE))
    for name, expected in FIXTURE_CATEGORIES.items():
        assert totals[name] == expected, f"{name}: {totals[name]} not {expected}"
    comment = totals["comment_only"] + totals["mixed"]
    code = totals["code_only"] + totals["mixed"]
    assert (comment, code) == (7, 4)
    assert comment / (comment + code) == pytest.approx(7 / 11)


def test_a_blank_line_inside_a_block_stays_blank(inventory) -> None:
    """A docstring's empty line carries no claim, so it is not comment surface."""
    source = '"""One.\n\nTwo.\n"""\na = 1\n'
    totals = inventory.classify(source, _spans(inventory, source))
    assert (totals["comment_only"], totals["blank"], totals["code_only"]) == (3, 1, 1)


def test_a_delimiter_is_comment_surface(inventory) -> None:
    """The closing quotes of a docstring are its last line, not a blank one."""
    source = 'def f():\n    """Doc.\n    """\n    return 1\n'
    totals = inventory.classify(source, _spans(inventory, source))
    assert (totals["comment_only"], totals["code_only"]) == (2, 2)


def test_a_protected_line_counts_in_the_share_and_is_reported_apart(inventory) -> None:
    source = "#!/usr/bin/env python3\na = 1\n"
    totals = inventory.classify(source, _spans(inventory, source))
    assert totals["comment_only"] == 1
    assert totals["protected"] == 1


def test_the_band_is_inclusive_and_does_not_round(inventory) -> None:
    """15 and 20 per cent pass exactly; a line either side fails without rounding."""
    def totals(comment: int, code: int) -> dict:
        return {"comment_lines": comment, "code_lines": code}

    assert inventory.in_band(totals(15, 85))
    assert inventory.in_band(totals(20, 80))
    assert not inventory.in_band(totals(1_499, 8_501))
    assert not inventory.in_band(totals(2_001, 7_999))
    assert not inventory.in_band(totals(0, 0)), "an empty denominator is not a pass"


# -------------------------------------------------------------- completeness

def test_a_python_parse_failure_is_incomplete(inventory) -> None:
    with pytest.raises(inventory.Incomplete):
        inventory._python_comments("broken.py", "def f(\n")


def test_a_missing_tree_makes_the_walk_incomplete(inventory, monkeypatch, tmp_path) -> None:
    """A tree that moved would otherwise shrink the corpus silently."""
    monkeypatch.setattr(inventory, "ROOT", tmp_path)
    monkeypatch.setattr(inventory, "TREES", ("server/src",))
    with pytest.raises(inventory.Incomplete, match="expected trees"):
        inventory.tracked()


def test_a_manifest_covers_the_working_bytes(inventory, monkeypatch, tmp_path) -> None:
    """A commit SHA alone would call an edited tree the reviewed one."""
    monkeypatch.setattr(inventory, "ROOT", tmp_path)
    (tmp_path / "a.py").write_text("a = 1\n", encoding="utf8")
    before = inventory.manifest(["a.py"])
    (tmp_path / "a.py").write_text("a = 2\n", encoding="utf8")
    assert inventory.manifest(["a.py"]) != before


# -------------------------------------------------------------- the identity

def test_an_identity_survives_lines_inserted_above_it(review, inventory) -> None:
    """Keyed on text and occurrence, never on a line number.

    A correction anywhere above a comment shifts its line; an identity that
    moved with it would re-present everything already judged.
    """
    source = "a = 1\n# the claim\nb = 2\n"
    moved = "# an unrelated line\n" + source

    def identity(text: str) -> tuple[str, int]:
        spans = _spans(inventory, text)
        target = [s for s in spans if "the claim" in s["text"]]
        assert len(target) == 1
        return review._key("fixture.py", target[0]["text"], 0), target[0]["line"]

    first, first_line = identity(source)
    second, second_line = identity(moved)
    assert second_line == first_line + 1, "nothing moved, so this proves nothing"
    assert first == second


def test_two_occurrences_of_one_text_get_two_identities(review, inventory) -> None:
    """Occurrence is part of the key, or a repeated comment is reviewed once."""
    source = "# same\na = 1\n\n# same\nb = 2\n"
    spans = _spans(inventory, source)
    keys = [review._key("fixture.py", s["text"], n) for n, s in enumerate(spans)]
    assert len(set(keys)) == 2


# ------------------------------------------------------------------ the ledger

@pytest.fixture
def tree(review, inventory, tmp_path, monkeypatch):
    """A fixture tree with `ROOT` pointed at it, and a ledger inside it.

    Returns a callable taking `{relative path: source}` and giving back the
    review rows over it, so the whole record-edit-verify lifecycle runs without
    touching the repository being measured.
    """
    ledger = tmp_path / "ledger.jsonl"
    monkeypatch.setattr(review, "ROOT", tmp_path)
    monkeypatch.setattr(review, "LEDGER", ledger)

    def build(sources: dict[str, str]):
        comments = []
        for rel, text in sources.items():
            (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
            (tmp_path / rel).write_text(text, encoding="utf8")
            for span in inventory._python_comments(rel, text):
                comments.append({**span, "path": rel})
        review._REPORT = {"comments": comments}
        return review.every()

    yield build
    review._REPORT = None


#: One fixture per class of knowledge the review has to keep straight: a caller
#: precondition, a dangerous alternative, what a test does not reach, a
#: rationale duplicated from a design record, and a claim that stopped being
#: true. Each is judged, edited and verified below.
REVIEWED = '''\
def flush():
    """Write the buffer.

    Call before `close`, which discards anything still held.
    """


# Reordering these two loses the lock, and the tree reads as if it did not.
ORDER = ("acquire", "write")

# This suite does not reach the retry path; `test_retry.py` is the only cover.
CASES = 3

# The layering rule is in the design record, restated here.
LAYER = "auth"

# The counter resets on a write, which stopped being true.
RESET = False
'''


def test_a_verdict_records_what_a_later_run_rechecks_it_against(review, tree) -> None:
    rows = {r["anchor"]: r for r in tree({"a.py": REVIEWED})}
    target = rows['ORDER = ("acquire", "write")']
    assert review.main([
        "--record", target["id"], "keep",
        "alternative: reordering these two loses the lock",
    ]) == 0
    held = review.decided()[target["id"]]
    assert held["schema_version"] == review.LEDGER_SCHEMA
    assert held["status"] == "pending"
    assert held["code_fingerprint"] == review.file_hash("a.py")
    assert held["anchor"] == target["anchor"]


def test_a_code_change_goes_stale_though_the_prose_is_identical(review, tree) -> None:
    """The comment is a claim about the code, so the code is what invalidates it."""
    rows = {r["anchor"]: r for r in tree({"a.py": REVIEWED})}
    target = rows['ORDER = ("acquire", "write")']
    review.main(["--record", target["id"], "keep", "alternative: the lock"])
    review.main(["--verify", target["id"]])
    comments = {r["id"]: r for r in tree({"a.py": REVIEWED})}
    fresh = review.classify_ledger(review.decided(), comments)["counts"]
    assert fresh["valid_current_keeps"] == 1 and fresh["stale"] == 0

    tree({"a.py": REVIEWED.replace('("acquire", "write")', '("acquire", "write", "x")')})
    comments = {r["id"]: r for r in review.every()}
    after = review.classify_ledger(review.decided(), comments)["counts"]
    assert after["stale"] == 1, after
    assert after["valid_current_keeps"] == 0


def test_a_changed_dependency_goes_stale(review, tree) -> None:
    rows = {r["anchor"]: r for r in tree({"a.py": REVIEWED, "b.py": "LAYER = 1\n"})}
    target = rows['LAYER = "auth"']
    review.main(["--record", target["id"], "keep", "nonlocal: b.py owns the rule",
                 "--depends", "b.py"])
    review.main(["--verify", target["id"]])
    comments = {r["id"]: r for r in review.every()}
    assert review.classify_ledger(review.decided(), comments)["counts"][
        "valid_current_keeps"] == 1

    (review.ROOT / "b.py").write_text("LAYER = 2\n", encoding="utf8")
    assert review.classify_ledger(review.decided(), comments)["counts"]["stale"] == 1


def test_a_removal_cannot_be_verified_while_the_comment_is_there(review, tree) -> None:
    rows = {r["anchor"]: r for r in tree({"a.py": REVIEWED})}
    target = rows['LAYER = "auth"']
    review.main(["--record", target["id"], "remove", "the design record holds it"])
    assert review.main(["--verify", target["id"]]) == 2
    assert review.decided()[target["id"]]["status"] == "pending"


def test_a_canonicalisation_needs_a_destination_that_holds_its_heading(review, tree) -> None:
    """A move is not done because the source copy is gone."""
    rows = {r["anchor"]: r for r in tree({"a.py": REVIEWED})}
    target = rows['LAYER = "auth"']
    review.main(["--record", target["id"], "canonicalize", "moved to the design record",
                 "--destination", "design.md#The layering rule"])
    tree({"a.py": REVIEWED.replace(
        "# The layering rule is in the design record, restated here.\n", "")})
    assert review.main(["--verify", target["id"]]) == 2

    (review.ROOT / "design.md").write_text("# The layering rule\n", encoding="utf8")
    assert review.main(["--verify", target["id"]]) == 0
    assert review.decided()[target["id"]]["status"] == "verified"


def test_a_removed_id_does_not_reduce_the_unreviewed_count(review, tree) -> None:
    """A historical record answers about a comment that is gone, and nothing else."""
    rows = tree({"a.py": REVIEWED})
    target = next(r for r in rows if "stopped being true" in r["text"])
    review.main(["--record", target["id"], "remove", "the claim is false"])

    remaining = tree({"a.py": REVIEWED.replace(
        "# The counter resets on a write, which stopped being true.\n", "")})
    assert review.main(["--verify", target["id"]]) == 0
    counts = review.classify_ledger(
        review.decided(), {r["id"]: r for r in remaining})["counts"]
    assert counts["verified_removals_or_moves"] == 1
    assert counts["unreviewed_current"] == len(remaining)


def test_a_correction_is_not_complete_until_its_replacement_is_verified(review, tree) -> None:
    rows = tree({"a.py": REVIEWED})
    target = next(r for r in rows if "stopped being true" in r["text"])
    review.main(["--record", target["id"], "correct", "the claim was false"])
    after = tree({"a.py": REVIEWED.replace("which stopped being true", "and only then")})
    assert review.main(["--verify", target["id"]]) == 2

    replacement = next(r for r in after if "and only then" in r["text"])
    held = review.decided()
    held[target["id"]]["replacement"] = {"id": replacement["id"],
                                         "text_hash": review._text_hash(replacement["text"])}
    review._write_ledger(held, review._ledger_bytes())
    assert review.main(["--verify", target["id"]]) == 0


def test_a_concurrent_ledger_write_is_refused(review, tree) -> None:
    """Two sessions reviewing at once must not silently drop one's verdicts."""
    rows = tree({"a.py": REVIEWED})
    review.main(["--record", rows[0]["id"], "keep", "constraint: the guard"])
    stale = review._ledger_bytes()
    review.main(["--record", rows[1]["id"], "keep", "constraint: the order"])
    with pytest.raises(SystemExit, match="changed while"):
        review._write_ledger({}, stale)
    assert len(review.decided()) == 2


def test_a_record_from_the_old_model_stays_visible_as_unresolved(review, tree) -> None:
    """A new extraction's corpus was not reviewed under the old one.

    Counting a schema-0 record whose comment the new walk cannot find as a
    verified removal would claim the review had covered ground it never saw.
    """
    rows = tree({"a.py": REVIEWED})
    review.LEDGER.write_text(json.dumps({
        "id": "0" * 12, "path": "a.py", "line": 1,
        "decision": "keep", "reason": "constraint: from an earlier walk",
    }) + "\n" + json.dumps({
        "id": rows[0]["id"], "path": "a.py", "line": rows[0]["line"],
        "decision": "keep", "reason": "constraint: still there",
    }) + "\n", encoding="utf8")
    counts = review.classify_ledger(
        review.decided(), {r["id"]: r for r in rows})["counts"]
    assert counts["unresolved_migrations"] == 1
    assert counts["verified_removals_or_moves"] == 0
    assert counts["pending"] == 1


# ---------------------------------------------------------------- the recorder

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


def test_a_keep_must_name_the_value_it_claims(review) -> None:
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
    for tag in review.KEEP_VALUE:
        assert tag in done.stderr, f"the refusal does not offer {tag}"


def test_the_ledger_is_json_lines_and_holds_no_duplicate_verdict(review) -> None:
    """A resumable ledger has to be readable and has to be the last word per id."""
    ledger = ROOT / ".claude" / "review" / "comment-ledger.jsonl"
    if not ledger.is_file():
        return
    ids: list[str] = []
    for line in ledger.read_text(encoding="utf8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        assert row["decision"] in review.DECISIONS
        assert row["reason"].strip()
        ids.append(row["id"])
    assert len(ids) == len(set(ids)), "an id was recorded twice; the ledger is ambiguous"


def test_the_queue_order_drops_and_repeats_nothing(review, rows) -> None:
    """Ordering is a presentation change, so the queue must still be a permutation.

    A sort that filtered would quietly shorten the review, and the status count
    would keep saying the same thing -- the empty-set shape, one level up.
    """
    ordered = sorted(rows, key=lambda r: (review._priority(r), r["path"], r["line"]))
    assert len(ordered) == len(rows)
    assert {r["id"] for r in ordered} == {r["id"] for r in rows}


def test_the_two_signals_reach_the_front(review) -> None:
    """A cross-file citation outranks a past-tense comment, which outranks the rest."""
    cites = {"text": "see `format.ts` for the reason", "path": "x", "line": 1}
    past = {"text": "this was true before the fix", "path": "x", "line": 1}
    plain = {"text": "the level this request needs", "path": "x", "line": 1}
    assert review._priority(cites) == 0
    assert review._priority(past) == 1
    assert review._priority(plain) == 2
