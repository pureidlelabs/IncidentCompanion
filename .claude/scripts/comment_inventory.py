#!/usr/bin/env python3
"""One inventory of every comment in the tree, and the line accounting over it.

The queue in `comment_review.py` and the ratio gate in
`tests/repo/test_comment_ratio.py` both read this, so what is reviewed and what
is measured cannot drift apart.

Comments come from parsers, never from a line prefix: `tools/comment-inventory.mjs`
for the JavaScript family and `tokenize` plus `ast` here for Python. A `//`
inside a string is code, a trailing comment is a comment, and a triple-quoted
string that documents nothing is code.

    python .claude/scripts/comment_inventory.py --json /tmp/inventory.json

**The accounting convention.** A physical line is `comment_only`, `code_only`,
`mixed` or `blank`; `comment_lines = comment_only + mixed` and
`code_lines = code_only + mixed`, so a line carrying both is counted once in
each and the two do not sum to the file. `ratio = comment_lines /
(comment_lines + code_lines)` -- the share of measured source, not comment
against code. Delimiters are comment characters and a Python docstring's quotes
are part of it.

An empty denominator, an unreadable file, a parse failure, a missing tree and a
manifest that moved during the scan each make the result incomplete. Incomplete
is an error, never 0 per cent.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tokenize

ROOT = pathlib.Path(__file__).resolve().parents[2]
COLLECTOR = ROOT / "tools" / "comment-inventory.mjs"

SCHEMA_VERSION = 1
METRIC_VERSION = "comment-share-v1"

TREES = ("server/src", "ui/src", "server/e2e", "server/test", "tests", ".claude")

JS_SUFFIXES = frozenset({".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"})
PY_SUFFIXES = frozenset({".py"})

#: Directories whose contents are somebody else's source or a build product.
#: `git ls-files` already answers most of this -- these are the ones that would
#: survive being tracked.
EXCLUDED_PARTS = frozenset({
    "node_modules", "worktrees", ".venv", "vendor", "dist",
    "storybook-static", "coverage", "test-results", "playwright-report",
})

#: A comment that carries a licence, an attribution or an instruction to a
#: tool. Counted in the share like any other and reported separately, because
#: it cannot be deleted to move the number.
PROTECTED = (
    "@ts-", "@license", "@preserve", "eslint", "prettier-ignore",
    "istanbul", "c8 ignore", "spdx", "copyright", "noqa", "type: ignore",
    "pragma:", "#!",
)


class Incomplete(RuntimeError):
    """The scan cannot answer, so it refuses to answer with a number."""


def _protected(text: str) -> bool:
    low = text.lower()
    return any(token in low for token in PROTECTED)


def tracked() -> list[str]:
    """Tracked source paths under `TREES`, sorted, as an explicit list."""
    missing = [tree for tree in TREES if not (ROOT / tree).is_dir()]
    if missing:
        raise Incomplete(f"expected trees are absent: {missing}")
    done = subprocess.run(
        ["git", "ls-files", "-z", "--", *TREES],
        cwd=ROOT, capture_output=True, text=True, check=True)
    out: list[str] = []
    for rel in done.stdout.split("\0"):
        if not rel:
            continue
        path = pathlib.PurePosixPath(rel)
        if path.suffix not in JS_SUFFIXES | PY_SUFFIXES:
            continue
        if EXCLUDED_PARTS & set(path.parts):
            continue
        out.append(rel)
    if not out:
        raise Incomplete("no source files matched; the scope is wrong")
    return sorted(out)


def manifest(paths: list[str]) -> str:
    """A hash of the working bytes, so a commit SHA cannot stand in for them."""
    digest = hashlib.sha256()
    for rel in paths:
        try:
            body = (ROOT / rel).read_bytes()
        except OSError as error:
            raise Incomplete(f"{rel}: {error}") from error
        digest.update(rel.encode("utf8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(body).hexdigest().encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _char_column(line: str, byte_column: int) -> int:
    """`ast` reports a UTF-8 byte offset; `tokenize` reports characters."""
    if byte_column == 0 or line.isascii():
        return byte_column
    return len(line.encode("utf8")[:byte_column].decode("utf8", errors="ignore"))


def _python_comments(rel: str, source: str) -> list[dict]:
    """`#` runs and real docstrings, as line and column spans.

    A triple-quoted string that `ast.get_docstring` does not claim is code: an
    assigned block, a fixture body, an expression in an argument list.
    """
    lines = source.split("\n")
    spans: list[dict] = []

    try:
        readline = io.StringIO(source).readline
        raw = [t for t in tokenize.generate_tokens(readline) if t.type == tokenize.COMMENT]
    except (tokenize.TokenError, SyntaxError, IndentationError) as error:
        raise Incomplete(f"{rel}: tokenize: {error}") from error

    for token in raw:
        line, col = token.start
        end_line, end_col = token.end
        previous = spans[-1] if spans else None
        if (previous and previous["kind"] == "ordinary" and previous["endLine"] == line - 1
                and lines[line - 1][:col].strip() == ""
                and lines[previous["endLine"] - 1][previous["endCol"]:].strip() == ""):
            previous["text"] += "\n" + token.string
            previous["endLine"], previous["endCol"] = end_line, end_col
            previous["protected"] = previous["protected"] or _protected(token.string)
            continue
        spans.append({
            "line": line, "col": col, "endLine": end_line, "endCol": end_col,
            "text": token.string, "kind": "ordinary",
            "protected": _protected(token.string),
        })

    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        raise Incomplete(f"{rel}: parse: {error}") from error
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)):
            continue
        if ast.get_docstring(node, clean=False) is None or not node.body:
            continue
        doc = node.body[0]
        assert isinstance(doc, ast.Expr) and doc.end_lineno is not None
        spans.append({
            "line": doc.lineno,
            "col": _char_column(lines[doc.lineno - 1], doc.col_offset),
            "endLine": doc.end_lineno,
            "endCol": _char_column(lines[doc.end_lineno - 1], doc.end_col_offset or 0),
            "text": ast.get_source_segment(source, doc) or "",
            "kind": "docstring",
            "protected": False,
        })

    spans.sort(key=lambda span: (span["line"], span["col"]))
    return spans


def _javascript_comments(paths: list[str]) -> tuple[dict[str, list[dict]], list[dict]]:
    if not paths:
        return {}, []
    done = subprocess.run(
        ["node", str(COLLECTOR)],
        cwd=ROOT, input="\0".join(paths).encode("utf8"),
        capture_output=True, check=False)
    if done.returncode != 0:
        raise Incomplete(
            f"the collector failed: {done.stderr.decode('utf8', 'replace')[-2000:]}")
    payload = json.loads(done.stdout)
    return ({entry["path"]: entry["comments"] for entry in payload["files"]},
            payload["errors"])


def classify(source: str, spans: list[dict]) -> dict[str, int]:
    """The four line categories over one file, plus comment lines by kind.

    One implementation for both languages: the callers differ only in where the
    spans came from.
    """
    lines = source.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    marks: dict[int, list[tuple[int, int, str, bool]]] = {}
    for span in spans:
        for number in range(span["line"], span["endLine"] + 1):
            if number - 1 >= len(lines):
                break
            start = span["col"] if number == span["line"] else 0
            stop = span["endCol"] if number == span["endLine"] else len(lines[number - 1])
            marks.setdefault(number, []).append(
                (start, stop, span["kind"], span["protected"]))

    totals = {
        "comment_only": 0, "code_only": 0, "mixed": 0, "blank": 0,
        "ordinary": 0, "jsdoc": 0, "docstring": 0, "directive": 0, "protected": 0,
    }
    for number, line in enumerate(lines, 1):
        intervals = marks.get(number)
        if not intervals:
            totals["code_only" if line.strip() else "blank"] += 1
            continue
        # A whitespace-only line inside a block is blank, so the fast path has
        # to see content before it can call the line comment.
        if len(intervals) == 1 and line.strip():
            start, stop, kind, guarded = intervals[0]
            if not line[:start].strip() and not line[stop:].strip():
                totals["comment_only"] += 1
                totals[kind] += 1
                if guarded:
                    totals["protected"] += 1
                continue
        has_comment = has_code = False
        kind = None
        guarded = False
        for column, character in enumerate(line):
            if character.isspace():
                continue
            inside = next(
                (i for i in intervals if i[0] <= column < i[1]), None)
            if inside is None:
                has_code = True
                continue
            has_comment = True
            guarded = guarded or inside[3]
            if kind is None:
                kind = inside[2]
        if has_comment and has_code:
            totals["mixed"] += 1
        elif has_comment:
            totals["comment_only"] += 1
        elif has_code:
            totals["code_only"] += 1
        else:
            totals["blank"] += 1
        if has_comment:
            totals[kind or "ordinary"] += 1
            if guarded:
                totals["protected"] += 1
    return totals


def _tier(rel: str) -> str:
    for tree in TREES:
        if rel == tree or rel.startswith(tree + "/"):
            return tree
    return "(outside the scope)"


def _head() -> str:
    done = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                          capture_output=True, text=True, check=False)
    return done.stdout.strip() or "(unknown)"


def collect() -> dict:
    """The whole inventory: comments, per-file lines, tier and aggregate totals.

    Raises `Incomplete` rather than returning a number it cannot stand behind.
    """
    paths = tracked()
    before = manifest(paths)

    javascript, errors = _javascript_comments(
        [p for p in paths if pathlib.PurePosixPath(p).suffix in JS_SUFFIXES])
    if errors:
        raise Incomplete(f"the collector reported {errors[:5]}")

    files: list[dict] = []
    comments: list[dict] = []
    for rel in paths:
        source = (ROOT / rel).read_text(encoding="utf8")
        if pathlib.PurePosixPath(rel).suffix in PY_SUFFIXES:
            spans = _python_comments(rel, source)
        else:
            spans = javascript.get(rel)
            if spans is None:
                raise Incomplete(f"{rel}: the collector returned nothing for it")
        for span in spans:
            comments.append({**span, "path": rel})
        lines = classify(source, spans)
        files.append({"path": rel, "tier": _tier(rel), "lines": lines})

    after = manifest(paths)
    if after != before:
        raise Incomplete("the source changed while it was being scanned")

    return {
        "schema_version": SCHEMA_VERSION,
        "metric_version": METRIC_VERSION,
        "head": _head(),
        "source_manifest_hash": before,
        "complete": True,
        "errors": [],
        "files_scanned": len(files),
        "excluded": sorted(EXCLUDED_PARTS),
        "totals": _sum(files),
        "tiers": [
            {"tier": tree,
             "totals": _sum([f for f in files if f["tier"] == tree])}
            for tree in TREES
        ],
        "files": files,
        "comments": comments,
    }


def _sum(files: list[dict]) -> dict:
    totals = {key: 0 for key in (
        "comment_only", "code_only", "mixed", "blank",
        "ordinary", "jsdoc", "docstring", "directive", "protected")}
    for entry in files:
        for key, value in entry["lines"].items():
            totals[key] += value
    totals["comment_lines"] = totals["comment_only"] + totals["mixed"]
    totals["code_lines"] = totals["code_only"] + totals["mixed"]
    measured = totals["comment_lines"] + totals["code_lines"]
    totals["ratio"] = totals["comment_lines"] / measured if measured else None
    return totals


def in_band(totals: dict, low: int = 15, high: int = 20) -> bool:
    """The band judged on raw totals, so nothing passes by rounding."""
    comment, code = totals["comment_lines"], totals["code_lines"]
    if comment + code == 0:
        return False
    return low * (comment + code) <= 100 * comment <= high * (comment + code)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", metavar="FILE", help="write the full report here")
    args = parser.parse_args(argv)

    try:
        report = collect()
    except Incomplete as error:
        print(f"incomplete: {error}", file=sys.stderr)
        return 1

    if args.json:
        pathlib.Path(args.json).write_text(
            json.dumps(report, indent=2), encoding="utf8")

    totals = report["totals"]
    print(f"head                {report['head'][:12]}")
    print(f"manifest            {report['source_manifest_hash'][:16]}")
    print(f"files scanned       {report['files_scanned']:,}")
    print(f"comment_only        {totals['comment_only']:,}")
    print(f"code_only           {totals['code_only']:,}")
    print(f"mixed               {totals['mixed']:,}")
    print(f"blank               {totals['blank']:,}")
    print(f"comment_lines       {totals['comment_lines']:,}")
    print(f"code_lines          {totals['code_lines']:,}")
    print(f"ratio               {totals['ratio'] * 100:.2f}%")
    print(f"  ordinary          {totals['ordinary']:,}")
    print(f"  jsdoc             {totals['jsdoc']:,}")
    print(f"  docstring         {totals['docstring']:,}")
    print(f"  directive         {totals['directive']:,}")
    print(f"  protected         {totals['protected']:,}")
    print(f"target_met          {str(in_band(totals)).lower()}")
    for tier in report["tiers"]:
        share = tier["totals"]["ratio"]
        if share is not None:
            print(f"  {tier['tier']:<14} {share * 100:5.1f}%  "
                  f"{tier['totals']['comment_lines']:>6,} / "
                  f"{tier['totals']['code_lines']:>6,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
