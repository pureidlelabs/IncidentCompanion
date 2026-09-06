#!/usr/bin/env python3
"""Present every comment beside the thing it documents, and record one verdict each.

**It decides nothing.** No token list, no length rule, no shape that sorts a
comment into a class -- the whole point of the review is that a machine cannot
answer *does this tell me anything the declaration does not*, and a helper that
guessed would be the drift it exists to prevent. What it automates is finding
the comment, pairing it with the right declaration, and remembering the answer.

    comment_review.py --next 12            # the next unclassified, with pairing
    comment_review.py --show <id> -C 40    # widen the window on one
    comment_review.py --record <id> keep "constraint: the signature carries none"
    comment_review.py --verify <id> "the replacement reads ..."
    comment_review.py --status             # counts, and what is left
    comment_review.py --verify-ledger      # what each record can still stand behind
    comment_review.py --ratio              # the measured share, from the same walk
    comment_review.py --inventory FILE     # the full report as JSON

The corpus comes from `comment_inventory.py`, so what is reviewed and what is
measured are one walk.

**Identity survives an edit above it.** A comment is keyed on its file, its
text and which occurrence of that text it is -- never on a line number, which
moves the moment anything before it is corrected.

**A verdict is an intention until something checks it.** A record carries the
hash of the file it was judged against, so a later change to that file marks
the review stale rather than leaving it reading as current. `--verify` is the
second half: it re-reads the tree and refuses to mark a removal verified while
the comment is still there, or a canonicalisation whose destination does not
hold the heading it claims.

The ledger is `.claude/review/comment-ledger.jsonl`, one JSON object per
verdict. It is committed, so the review is auditable and a later session
resumes from it rather than from a transcript.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEDGER = ROOT / ".claude" / "review" / "comment-ledger.jsonl"
DECISIONS = ("keep", "correct", "remove", "canonicalize")
LEDGER_SCHEMA = 1


def _inventory_module():
    spec = importlib.util.spec_from_file_location(
        "comment_inventory", ROOT / ".claude" / "scripts" / "comment_inventory.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_INVENTORY = _inventory_module()
TREES = _INVENTORY.TREES

#: A keep has to name the value it claims, because "it is not derivable" is
#: necessary and not sufficient: a comment that only saves reading two lines is
#: a comment the two lines already carry. The counterfactual is the test -- if
#: this disappeared, what concrete understanding would somebody changing the
#: code lose? Where a name, a type or a test could carry it instead, that is the
#: fix and the comment goes.
KEEP_VALUE = {
    "nonlocal": "rationale that lives outside this file or this call",
    "constraint": "a surprising constraint the code reads as arbitrary without",
    "coverage": "what this test does not cover, which its name overstates",
    "contract": "an external contract -- a library, a wire shape, a standard",
    "alternative": "an obvious alternative that is dangerous, and why",
}


def _key(rel: str, text: str, nth: int) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    raw = f"{rel}\x00{flat}\x00{nth}"
    return hashlib.sha1(raw.encode("utf8")).hexdigest()[:12]


def _text_hash(text: str) -> str:
    return hashlib.sha256(
        re.sub(r"\s+", " ", text).strip().encode("utf8")).hexdigest()[:16]


def file_hash(rel: str) -> str:
    """The conservative invalidation boundary: any edit to the file at all.

    A five-line window cannot bound a claim about a whole function or about
    another module, and narrowing this needs attachment logic with its own
    tests behind it.
    """
    try:
        return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:16]
    except OSError:
        return ""


def _py_anchors(source: str) -> dict[int, str]:
    """Docstring start line -> the declaration it documents, from the syntax tree."""
    found: dict[int, str] = {}
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return found
    lines = source.split("\n")

    def signature(node: ast.AST) -> str:
        start = node.lineno - 1
        text = lines[start].strip()
        while not text.rstrip().endswith(":") and start + 1 < len(lines):
            start += 1
            text += " " + lines[start].strip()
        return re.sub(r"\s+", " ", text)

    doc = ast.get_docstring(tree, clean=False)
    if doc is not None and tree.body:
        found[tree.body[0].lineno] = "(module docstring)"
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if ast.get_docstring(node, clean=False) is not None and node.body:
                found[node.body[0].lineno] = signature(node)
    return found


def _anchor(lines: list[str], span: dict, py_anchors: dict[int, str]) -> str:
    """What the comment documents: a declaration, the code it trails, or neither."""
    if span["kind"] == "docstring":
        return py_anchors.get(span["line"], "(module docstring)")
    start = lines[span["line"] - 1]
    if start[: span["col"]].strip():
        return start.strip()
    for y in range(span["endLine"], min(len(lines), span["endLine"] + 5)):
        if lines[y].strip():
            return lines[y].strip()
    for y in range(span["line"] - 2, max(-1, span["line"] - 5), -1):
        if lines[y].strip():
            return f"(no declaration follows; after: {lines[y].strip()})"
    return "(nothing follows)"


_REPORT: dict | None = None


def report() -> dict:
    """The shared inventory, collected once per process."""
    global _REPORT
    if _REPORT is None:
        _REPORT = _INVENTORY.collect()
    return _REPORT


def every() -> list[dict]:
    """Every comment in the tree, paired with what it sits on."""
    out: list[dict] = []
    seen: dict[tuple[str, str], int] = {}
    by_path: dict[str, list[dict]] = {}
    for span in report()["comments"]:
        by_path.setdefault(span["path"], []).append(span)
    for rel, spans in by_path.items():
        source = (ROOT / rel).read_text(encoding="utf8")
        lines = source.split("\n")
        anchors = _py_anchors(source) if rel.endswith(".py") else {}
        for span in spans:
            flat = re.sub(r"\s+", " ", span["text"]).strip()
            nth = seen.get((rel, flat), 0)
            seen[(rel, flat)] = nth + 1
            out.append({
                "id": _key(rel, span["text"], nth),
                "path": rel,
                "line": span["line"],
                "end": span["endLine"],
                "kind": span["kind"],
                "anchor": _anchor(lines, span, anchors),
                "text": span["text"],
            })
    out.sort(key=lambda row: (row["path"], row["line"]))
    return out


# ----------------------------------------------------------------- the ledger

def _ledger_bytes() -> bytes:
    return LEDGER.read_bytes() if LEDGER.is_file() else b""


def decided() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for line in _ledger_bytes().decode("utf8").splitlines():
        if line.strip():
            row = json.loads(line)
            out[row["id"]] = row
    return out


def _write_ledger(rows: dict[str, dict], expected: bytes) -> None:
    """Replace the ledger, refusing when another session changed it underneath.

    One current record per id, so a later verdict replaces an earlier one rather
    than appending an ambiguous duplicate. Git holds what each record said before.
    """
    if _ledger_bytes() != expected:
        raise SystemExit(
            "the ledger changed while this verdict was being prepared; "
            "re-read it and record again")
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(row) + "\n" for row in rows.values())
    handle, temporary = tempfile.mkstemp(dir=str(LEDGER.parent))
    with os.fdopen(handle, "w", encoding="utf8") as out:
        out.write(body)
    os.replace(temporary, LEDGER)


def _check_verdict(decision: str, reason: str) -> str | None:
    if decision not in DECISIONS:
        return f"decision must be one of {DECISIONS}"
    if not reason.strip():
        return "a reason is required"
    if decision == "keep":
        tag = reason.split(":", 1)[0].strip().lower()
        if tag not in KEEP_VALUE:
            return ("a keep must name its value as `<tag>: why`, one of: "
                    + ", ".join(sorted(KEEP_VALUE)))
    return None


def _record(row: dict, comment: dict, extra: dict) -> dict:
    """One ledger record: the verdict, and everything a later run rechecks it against."""
    depends = {path: file_hash(path) for path in extra.get("depends_on", [])}
    out = {
        "schema_version": LEDGER_SCHEMA,
        "id": comment["id"],
        "path": comment["path"],
        "line": comment["line"],
        "decision": row["decision"],
        "reason": row["reason"],
        "anchor": comment["anchor"],
        "text_hash": _text_hash(comment["text"]),
        "code_fingerprint": file_hash(comment["path"]),
        "depends_on": depends,
        "status": "pending",
    }
    for name in ("evidence", "replacement", "destination"):
        if extra.get(name):
            out[name] = extra[name]
    return out


def classify_ledger(rows: dict[str, dict], comments: dict[str, dict]) -> dict:
    """What each record can still stand behind, against the tree as it is.

    A record whose id is absent from the corpus is not a verified removal by
    that fact alone: a schema-0 record predates this extraction model, so its
    absence cannot tell a deletion from a comment the old walk never saw.
    """
    counts = {name: 0 for name in (
        "current_comments", "valid_current_keeps", "pending", "stale",
        "historical", "verified_removals_or_moves", "unreviewed_current",
        "unresolved_migrations")}
    counts["current_comments"] = len(comments)
    detail: dict[str, list[str]] = {"stale": [], "unresolved_migrations": []}

    for ident, row in rows.items():
        present = ident in comments
        legacy = row.get("schema_version") != LEDGER_SCHEMA
        if not present:
            if legacy:
                counts["unresolved_migrations"] += 1
                detail["unresolved_migrations"].append(f"{ident} {row['path']}")
                continue
            counts["historical"] += 1
            if row["decision"] in ("remove", "canonicalize") and row.get("status") == "verified":
                counts["verified_removals_or_moves"] += 1
            continue
        if legacy or row.get("status") != "verified":
            counts["pending"] += 1
            continue
        moved = row.get("code_fingerprint") != file_hash(row["path"])
        moved = moved or any(
            file_hash(path) != held for path, held in row.get("depends_on", {}).items())
        if moved:
            counts["stale"] += 1
            detail["stale"].append(f"{ident} {row['path']}")
        elif row["decision"] == "keep":
            counts["valid_current_keeps"] += 1

    counts["unreviewed_current"] = sum(1 for ident in comments if ident not in rows)
    return {"counts": counts, "detail": detail}


def _window(row: dict, before: int, after: int) -> str:
    lines = (ROOT / row["path"]).read_text(encoding="utf8", errors="ignore").split("\n")
    lo = max(0, row["line"] - 1 - before)
    hi = min(len(lines), row["end"] + after)
    body = []
    for n in range(lo, hi):
        mark = "C" if row["line"] - 1 <= n <= row["end"] - 1 else " "
        body.append(f"{mark}{n + 1:5} {lines[n]}")
    return "\n".join(body)


#: What `--next` shows first. **Ordering only -- it decides no verdict.** Both
#: defects this review has found were cross-file citations that outlived the
#: file they named, and every correction so far has come from a comment written
#: in the past tense, so those two go to the front. The queue still holds every
#: comment exactly once.
CITES_A_FILE = re.compile(r"`[\w./-]+\.(?:ts|tsx|py|md|mjs|yml|json)`")
WRITTEN_IN_THE_PAST = re.compile(
    r"\b(?:used to|no longer|previously|was|were|had been|stopped|left|"
    r"shipped|reproduced|measured|until)\b", re.I)


def _tree(path: str) -> int:
    """Where a path's tree sits in `TREES`, so the product is judged first."""
    for index, tree in enumerate(TREES):
        if path.startswith(tree):
            return index
    return len(TREES)


def _priority(row: dict) -> int:
    text = row["text"]
    if CITES_A_FILE.search(text):
        return 0
    if WRITTEN_IN_THE_PAST.search(text):
        return 1
    return 2


def _verify(row: dict, comments: dict[str, dict]) -> str | None:
    """Whether the edit a verdict promised has actually happened."""
    present = row["id"] in comments
    if row["decision"] in ("keep",):
        if not present:
            return "the comment is gone, so a keep cannot be verified"
        return None
    if row["decision"] == "correct":
        if not present and not row.get("replacement"):
            return "a correction needs the replacement's identity recorded"
        return None
    if not present:
        if row["decision"] == "canonicalize":
            destination = row.get("destination") or {}
            target = ROOT / destination.get("path", "")
            if not destination.get("path") or not target.is_file():
                return "a canonicalisation needs a destination that exists"
            heading = destination.get("heading", "")
            if heading and heading not in target.read_text(encoding="utf8"):
                return f"{destination['path']} does not hold {heading!r}"
        return None
    return f"the comment is still in {row['path']}, so the {row['decision']} did not happen"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--next", type=int, metavar="N")
    parser.add_argument("--show", metavar="ID")
    parser.add_argument("-C", "--context", type=int, default=4)
    parser.add_argument("--record", nargs=3, metavar=("ID", "DECISION", "REASON"))
    parser.add_argument("--verify", nargs="+", metavar="ID",
                        help="mark a recorded verdict verified, once the tree agrees")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--verify-ledger", action="store_true")
    parser.add_argument("--ratio", action="store_true")
    parser.add_argument("--inventory", metavar="FILE",
                        help="write the measurement report as JSON")
    parser.add_argument("--evidence", metavar="TEXT")
    parser.add_argument("--depends", action="append", default=[], metavar="PATH",
                        help="a file this verdict relies on; a change to it goes stale")
    parser.add_argument("--destination", metavar="PATH#HEADING")
    parser.add_argument("--path", metavar="PREFIX",
                        help="only comments under this path prefix")
    parser.add_argument("--record-many", metavar="FILE",
                        help="a JSONL of {id,decision,reason}, each judged on its own")
    args = parser.parse_args(argv)

    extra: dict = {"depends_on": args.depends}
    if args.evidence:
        extra["evidence"] = args.evidence
    if args.destination:
        path, _, heading = args.destination.partition("#")
        extra["destination"] = {"path": path, "heading": heading}

    if args.record:
        ident, decision, reason = args.record
        complaint = _check_verdict(decision, reason)
        if complaint:
            print(complaint, file=sys.stderr)
            if decision == "keep" and "keep must name" in complaint:
                for name, gloss in KEEP_VALUE.items():
                    print(f"  {name:12} {gloss}", file=sys.stderr)
            return 2
        rows = {r["id"]: r for r in every()}
        if ident not in rows:
            print(f"no comment with id {ident}", file=sys.stderr)
            return 2
        held = _ledger_bytes()
        ledger = decided()
        ledger[ident] = _record(
            {"decision": decision, "reason": reason}, rows[ident], extra)
        _write_ledger(ledger, held)
        print(f"recorded {ident} {decision}")
        return 0

    if args.record_many:
        pending = [json.loads(line) for line in
                   pathlib.Path(args.record_many).read_text(encoding="utf8").splitlines()
                   if line.strip()]
        rows = {r["id"]: r for r in every()}
        for row in pending:
            complaint = _check_verdict(row.get("decision", ""), row.get("reason", ""))
            if complaint:
                print(f"{row.get('id')}: {complaint}", file=sys.stderr)
                return 2
            if row["id"] not in rows:
                print(f"no comment with id {row['id']}", file=sys.stderr)
                return 2
        held = _ledger_bytes()
        ledger = decided()
        for row in pending:
            ledger[row["id"]] = _record(row, rows[row["id"]], row)
        _write_ledger(ledger, held)
        print(f"recorded {len(pending)}")
        return 0

    if args.verify:
        comments = {r["id"]: r for r in every()}
        held = _ledger_bytes()
        ledger = decided()
        for ident in args.verify:
            row = ledger.get(ident)
            if row is None:
                print(f"no verdict recorded for {ident}", file=sys.stderr)
                return 2
            complaint = _verify(row, comments)
            if complaint:
                print(f"{ident}: {complaint}", file=sys.stderr)
                return 2
            row["schema_version"] = LEDGER_SCHEMA
            row["status"] = "verified"
            row["code_fingerprint"] = file_hash(row["path"])
            if args.evidence:
                row["evidence"] = args.evidence
            ledger[ident] = row
        _write_ledger(ledger, held)
        print(f"verified {len(args.verify)}")
        return 0

    if args.ratio or args.inventory:
        return _INVENTORY.main(["--json", args.inventory] if args.inventory else [])

    rows = every()
    done = decided()
    if args.path:
        rows = [r for r in rows if r["path"].startswith(args.path)]

    if args.status or args.verify_ledger:
        counted = classify_ledger(done, {r["id"]: r for r in rows})
        counts = counted["counts"]
        decisions: dict[str, int] = {}
        for row in done.values():
            decisions[row["decision"]] = decisions.get(row["decision"], 0) + 1
        print(f"comments found          {counts['current_comments']:,}")
        print(f"records held            {len(done):,}")
        for name in DECISIONS:
            print(f"  {name:14}        {decisions.get(name, 0):,}")
        print(f"valid current keeps     {counts['valid_current_keeps']:,}")
        print(f"pending                 {counts['pending']:,}")
        print(f"stale                   {counts['stale']:,}")
        print(f"historical              {counts['historical']:,}")
        print(f"verified removals/moves {counts['verified_removals_or_moves']:,}")
        print(f"unreviewed current      {counts['unreviewed_current']:,}")
        print(f"unresolved migrations   {counts['unresolved_migrations']:,}")
        if args.verify_ledger:
            for name, items in counted["detail"].items():
                for line in items[:40]:
                    print(f"  {name:22} {line}")
                if len(items) > 40:
                    print(f"  {name:22} ... and {len(items) - 40:,} more")
        return 0

    if args.show:
        for row in rows:
            if row["id"] == args.show:
                print(f"=== {row['id']}  {row['path']}:{row['line']}")
                print(f"ANCHOR {row['anchor']}")
                print(_window(row, args.context, args.context))
                return 0
        print(f"no comment with id {args.show}", file=sys.stderr)
        return 2

    if args.next:
        shown = 0
        queue = sorted(
            (r for r in rows if r["id"] not in done),
            key=lambda r: (_priority(r), _tree(r["path"]), r["path"], r["line"]),
        )
        for row in queue:
            print(f"\n=== {row['id']}  {row['path']}:{row['line']}")
            print(f"ANCHOR {row['anchor'][:110]}")
            print(_window(row, 0, args.context))
            shown += 1
            if shown >= args.next:
                break
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
