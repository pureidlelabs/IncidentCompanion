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
    comment_review.py --status             # counts, and what is left

**Identity survives an edit above it.** A comment is keyed on its file, its
text and which occurrence of that text it is -- never on a line number, which
moves the moment anything before it is corrected.

The ledger is `.claude/review/comment-ledger.jsonl`, one JSON object per
verdict, appended. It is committed, so the review is auditable and a later
session resumes from it rather than from a transcript.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEDGER = ROOT / ".claude" / "review" / "comment-ledger.jsonl"
TREES = ("server/src", "ui/src", "server/e2e", "server/test", "tests", ".claude")
DECISIONS = ("keep", "correct", "remove", "canonicalize")

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


def _files() -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for tree in TREES:
        root = ROOT / tree
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix not in {".ts", ".tsx", ".py"}:
                continue
            if "node_modules" in path.parts or "worktrees" in path.parts:
                continue
            out.append(path)
    return out


def _key(rel: str, text: str, nth: int) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    raw = f"{rel}\x00{flat}\x00{nth}"
    return hashlib.sha1(raw.encode("utf8")).hexdigest()[:12]


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


def _comments(path: pathlib.Path) -> list[dict]:
    """Every comment in the file, with what it sits on."""
    source = path.read_text(encoding="utf8", errors="ignore")
    lines = source.split("\n")
    rel = str(path.relative_to(ROOT))
    anchors = _py_anchors(source) if path.suffix == ".py" else {}
    out: list[dict] = []
    seen: dict[str, int] = {}
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        span = None
        if path.suffix == ".py" and stripped.startswith(('"""', "'''")):
            quote = stripped[:3]
            end = i
            if not (stripped.count(quote) >= 2 and len(stripped) > 3):
                end = i + 1
                while end < len(lines) and quote not in lines[end]:
                    end += 1
            span = (i, min(end, len(lines) - 1))
        elif path.suffix != ".py" and stripped.startswith(("/**", "/*")):
            end = i
            while end < len(lines) and "*/" not in lines[end]:
                end += 1
            span = (i, min(end, len(lines) - 1))
        elif stripped.startswith("//") or (
            path.suffix == ".py" and stripped.startswith("#") and not stripped.startswith("#!")
        ):
            marker = "//" if stripped.startswith("//") else "#"
            end = i
            while end + 1 < len(lines) and lines[end + 1].strip().startswith(marker):
                end += 1
            span = (i, end)
        if span is None:
            i += 1
            continue
        a, b = span
        text = "\n".join(lines[a : b + 1])
        # A python docstring is only a comment if the tree says it documents something.
        if path.suffix == ".py" and lines[a].strip().startswith(('"""', "'''")):
            if a + 1 not in anchors:
                i = b + 1
                continue
            anchor = anchors[a + 1]
        else:
            anchor = ""
            for y in range(b + 1, min(len(lines), b + 6)):
                if lines[y].strip():
                    anchor = lines[y].strip()
                    break
            if not anchor:
                back = ""
                for y in range(a - 1, max(-1, a - 4), -1):
                    if lines[y].strip():
                        back = lines[y].strip()
                        break
                anchor = f"(no declaration follows; after: {back})" if back else "(nothing follows)"
        flat = re.sub(r"\s+", " ", text).strip()
        nth = seen.get(flat, 0)
        seen[flat] = nth + 1
        out.append({
            "id": _key(rel, text, nth),
            "path": rel,
            "line": a + 1,
            "end": b + 1,
            "anchor": anchor,
            "text": text,
        })
        i = b + 1
    return out


def every() -> list[dict]:
    out: list[dict] = []
    for path in _files():
        out.extend(_comments(path))
    return out


def decided() -> dict[str, dict]:
    if not LEDGER.is_file():
        return {}
    out: dict[str, dict] = {}
    for line in LEDGER.read_text(encoding="utf8").splitlines():
        if line.strip():
            row = json.loads(line)
            out[row["id"]] = row
    return out


#: What `--next` shows first. **Ordering only -- it decides no verdict.** Both
#: defects this review has found were cross-file citations that outlived the
#: file they named, and every correction so far has come from a comment written
#: in the past tense, so those two go to the front. The queue still holds every
#: comment exactly once.
CITES_A_FILE = re.compile(r"`[\w./-]+\.(?:ts|tsx|py|md|mjs|yml|json)`")
WRITTEN_IN_THE_PAST = re.compile(
    r"\b(?:used to|no longer|previously|was|were|had been|stopped|left|"
    r"shipped|reproduced|measured|until)\b", re.I)


def _priority(row: dict) -> int:
    text = row["text"]
    if CITES_A_FILE.search(text):
        return 0
    if WRITTEN_IN_THE_PAST.search(text):
        return 1
    return 2


def _window(row: dict, before: int, after: int) -> str:
    lines = (ROOT / row["path"]).read_text(encoding="utf8", errors="ignore").split("\n")
    lo = max(0, row["line"] - 1 - before)
    hi = min(len(lines), row["end"] + after)
    body = []
    for n in range(lo, hi):
        mark = "C" if row["line"] - 1 <= n <= row["end"] - 1 else " "
        body.append(f"{mark}{n + 1:5} {lines[n]}")
    return "\n".join(body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--next", type=int, metavar="N")
    parser.add_argument("--show", metavar="ID")
    parser.add_argument("-C", "--context", type=int, default=4)
    parser.add_argument("--record", nargs=3, metavar=("ID", "DECISION", "REASON"))
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--path", metavar="PREFIX",
                        help="only comments under this path prefix")
    parser.add_argument("--record-many", metavar="FILE",
                        help="a JSONL of {id,decision,reason}, each judged on its own")
    parser.add_argument("--verify-pairing", action="store_true")
    args = parser.parse_args(argv)

    if args.record:
        ident, decision, reason = args.record
        if decision not in DECISIONS:
            print(f"decision must be one of {DECISIONS}", file=sys.stderr)
            return 2
        if not reason.strip():
            print("a reason is required", file=sys.stderr)
            return 2
        if decision == "keep":
            tag = reason.split(":", 1)[0].strip().lower()
            if tag not in KEEP_VALUE:
                print("a keep must name its value as `<tag>: why`, one of:",
                      file=sys.stderr)
                for name, gloss in KEEP_VALUE.items():
                    print(f"  {name:12} {gloss}", file=sys.stderr)
                return 2
        rows = {r["id"]: r for r in every()}
        if ident not in rows:
            print(f"no comment with id {ident}", file=sys.stderr)
            return 2
        LEDGER.parent.mkdir(parents=True, exist_ok=True)
        with LEDGER.open("a", encoding="utf8") as handle:
            handle.write(json.dumps({
                "id": ident, "path": rows[ident]["path"], "line": rows[ident]["line"],
                "decision": decision, "reason": reason,
            }) + "\n")
        print(f"recorded {ident} {decision}")
        return 0

    if args.record_many:
        rows = {r["id"]: r for r in every()}
        wrote = 0
        LEDGER.parent.mkdir(parents=True, exist_ok=True)
        pending = [json.loads(l) for l in
                   pathlib.Path(args.record_many).read_text(encoding="utf8").splitlines()
                   if l.strip()]
        for row in pending:
            if row["id"] not in rows:
                print(f"no comment with id {row['id']}", file=sys.stderr)
                return 2
            if row["decision"] not in DECISIONS:
                print(f"bad decision {row['decision']}", file=sys.stderr)
                return 2
            if not row.get("reason", "").strip():
                print(f"{row['id']}: a reason is required", file=sys.stderr)
                return 2
            if row["decision"] == "keep":
                tag = row["reason"].split(":", 1)[0].strip().lower()
                if tag not in KEEP_VALUE:
                    print(f"{row['id']}: a keep must name its value, one of "
                          f"{sorted(KEEP_VALUE)}", file=sys.stderr)
                    return 2
        with LEDGER.open("a", encoding="utf8") as handle:
            for row in pending:
                handle.write(json.dumps({
                    "id": row["id"], "path": rows[row["id"]]["path"],
                    "line": rows[row["id"]]["line"],
                    "decision": row["decision"], "reason": row["reason"],
                }) + "\n")
                wrote += 1
        print(f"recorded {wrote}")
        return 0

    rows = every()
    done = decided()
    if args.path:
        rows = [r for r in rows if r["path"].startswith(args.path)]

    if args.status:
        counts: dict[str, int] = {}
        for row in done.values():
            counts[row["decision"]] = counts.get(row["decision"], 0) + 1
        print(f"comments found     {len(rows):,}")
        print(f"classified         {len(done):,}")
        for name in DECISIONS:
            print(f"  {name:14} {counts.get(name, 0):,}")
        print(f"remaining          {len(rows) - len(done):,}")
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
            key=lambda r: (_priority(r), r["path"], r["line"]),
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
