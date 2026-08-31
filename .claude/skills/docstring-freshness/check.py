#!/usr/bin/env python3
"""Find docstring claims the codebase no longer supports.

Economy asks whether a line is worth its space; this asks whether it is still
true. That difference is why this is a script and `docstring-economy` is not:
"is this claim stale" has an answer the repository can be asked for, and
"should this sentence exist" does not.

Four checks, reported separately because they carry different false-positive
rates and want different judgement:

  PATH    a file or directory named in a docstring that does not exist
  LINEREF a `file.py:NNN` past the end of that file, or pointing at a blank
  SYMBOL  a `backticked` name nothing defines and nothing names as a string
  PHRASE  a claim matched against what the code actually does (see CLAIMS)

PATH and LINEREF are near-zero noise: act on them. SYMBOL is the noisy one and
deliberately so -- see `_is_known` for the four classes already suppressed.
PHRASE is the extensible one; a claim worth checking twice belongs in CLAIMS.
"""
from __future__ import annotations

import argparse
import ast
import pathlib
import re
import sys
from collections import defaultdict

SKIP_DIRS = {".venv", "__pycache__", ".git", "node_modules", ".pytest_cache", ".ruff_cache"}

# A docstring phrase, and the module whose source must contain the counter-
# evidence for it to be a finding. Keeps a rename that the type system cannot
# see -- a storage format, a vocabulary value -- from outliving its docstring.
CLAIMS: list[tuple[str, re.Pattern, re.Pattern, str]] = [
    (
        "reads case.json but the module reads case.db",
        re.compile(r"case\.json", re.I),
        re.compile(r"case_meta|CASE_DB_NAME|casedb\."),
        "the .iccase archive still carries case.json; live storage is case.db",
    ),
    (
        "names a pre-v5 timeline field",
        re.compile(r"\b(event_type|killchain)\b"),
        re.compile(r"event_source|\btactic\b"),
        "v5 split the axis: event_source (telemetry) and tactic (ATT&CK)",
    ),
]

PATH_RE = re.compile(r"(?:^|[\s`(\[])((?:app|tests|tools|scripts|docs)/[\w./-]+\.\w+)")
LINEREF_RE = re.compile(r"`?([\w/]+\.py):(\d+)`?")
BACKTICK_RE = re.compile(r"`([^`\n]+)`")
DOTTED_RE = re.compile(r"^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$")
CODEISH_RE = re.compile(r"^_?[A-Za-z]\w*$")


def py_files(root: pathlib.Path):
    for path in sorted(root.rglob("*.py")):
        if not any(part in SKIP_DIRS for part in path.parts):
            yield path


def build_index(root: pathlib.Path):
    """Every name the repo defines, every string it writes, every module."""
    defined: set[str] = set()
    literals: set[str] = set()
    modules: dict[str, pathlib.Path] = {}
    for path in py_files(root):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        modules[path.stem] = path
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                defined.add(node.name)
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                defined.add(node.id)
            elif isinstance(node, ast.arg):
                defined.add(node.arg)
            elif isinstance(node, ast.Attribute):
                defined.add(node.attr)
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                # A dict key, a column name, an env var, a CSS class: real
                # things that are not Python identifiers. Without this the
                # SYMBOL check is mostly noise.
                literals.add(node.value)
    return defined, literals, modules


def docstrings(root: pathlib.Path):
    for path in py_files(root):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            doc = ast.get_docstring(node, clean=False)
            if doc:
                yield path, getattr(node, "lineno", 1), getattr(node, "name", "<module>"), doc


def _is_known(token: str, defined: set[str], literals: set[str], modules: dict) -> bool:
    if token in defined or token in literals or token in modules:
        return True
    if "." in token:                      # a filename, or a dotted path
        head, _, tail = token.rpartition(".")
        return tail in defined or head in modules or token in literals
    return False


def _looks_like_code(token: str) -> bool:
    """Only flag what could plausibly be an identifier, not English prose."""
    if not CODEISH_RE.match(token):
        return False
    return "_" in token or token.startswith("_") or (token.isupper() and len(token) > 2)


def scan(root: pathlib.Path):
    defined, literals, modules = build_index(root)
    findings: dict[str, list] = defaultdict(list)

    for path, lineno, name, doc in docstrings(root):
        where = f"{path}:{lineno} {name}"
        src_of_module = path.read_text(encoding="utf-8")

        for match in PATH_RE.finditer(doc):
            claimed = match.group(1)
            if not (root / claimed).exists():
                findings["PATH"].append((claimed, where))

        for match in LINEREF_RE.finditer(doc):
            stem = pathlib.Path(match.group(1)).stem
            num = int(match.group(2))
            target = modules.get(stem)
            if target is None:
                continue
            lines = target.read_text(encoding="utf-8").split("\n")
            if num > len(lines) or not lines[num - 1].strip():
                findings["LINEREF"].append((f"{match.group(1)}:{num}", where))

        for match in BACKTICK_RE.finditer(doc):
            token = match.group(1).strip()
            if _is_known(token, defined, literals, modules):
                continue
            dotted = DOTTED_RE.match(token)
            if dotted and dotted.group(1) in modules:
                findings["SYMBOL"].append((token, where))
            elif not dotted and _looks_like_code(token):
                findings["SYMBOL"].append((token, where))

        for label, claim, counter, note in CLAIMS:
            if claim.search(doc) and counter.search(src_of_module):
                findings["PHRASE"].append((f"{label}  -- {note}", where))

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("root", nargs="?", default=".", type=pathlib.Path)
    ap.add_argument("--only", choices=["PATH", "LINEREF", "SYMBOL", "PHRASE"],
                    help="report one check (SYMBOL is the noisy one)")
    ap.add_argument("--quiet", action="store_true",
                    help="counts only, for a pre-merge gate")
    args = ap.parse_args()

    findings = scan(args.root)
    kinds = [args.only] if args.only else ["PATH", "LINEREF", "PHRASE", "SYMBOL"]

    total = 0
    for kind in kinds:
        rows = findings.get(kind, [])
        total += len(rows)
        if args.quiet:
            print(f"{kind}: {len(rows)}")
            continue
        print(f"\n{'=' * 72}\n{kind}: {len(rows)}\n{'=' * 72}")
        for what, where in rows:
            print(f"  {what}\n      {where}")

    # PATH and LINEREF are the near-zero-noise pair; only they set the status.
    return 1 if (findings.get("PATH") or findings.get("LINEREF")) else 0


if __name__ == "__main__":
    sys.exit(main())
