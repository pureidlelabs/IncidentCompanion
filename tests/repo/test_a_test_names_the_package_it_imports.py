"""A test file imports only what its workspace declares.

Only `*.test.ts`, `*.test.tsx`, `*.spec.ts` and `*.audit.ts` are read, so a
support module one of them imports is outside this.
"""

from __future__ import annotations

import json
import re

from tests._repo import REPO_ROOT

WORKSPACES = ("server", "ui")

SUFFIXES = ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.audit.ts")

#: An import clause holds bindings and nothing else, which is what stops the
#: match running past the statement in a tree that writes no semicolons.
CLAUSE = r"[\w$,{}\s*]"

IMPORT = re.compile(
    rf"^[ \t]*import\s+(?P<clause>{CLAUSE}*?)\s*from\s*(['\"])(?P<name>[^'\"\n]+)\2",
    re.MULTILINE,
)

REEXPORT = re.compile(
    rf"^[ \t]*export\s+{CLAUSE}*?\s*from\s*(['\"])(?P<name>[^'\"\n]+)\1",
    re.MULTILINE,
)

BARE = re.compile(r"^[ \t]*import\s*(['\"])(?P<name>[^'\"\n]+)\1", re.MULTILINE)

DYNAMIC = re.compile(r"""\bimport\s*\(\s*(['"])(?P<name>[^'"\n]+)\1""")

#: A full-line `//` comment, which `json` refuses and every tsconfig here has.
LINE_COMMENT = re.compile(r"^\s*//.*$", re.MULTILINE)


def _manifest(path: str) -> dict:
    return json.loads((REPO_ROOT / path).read_text(encoding="utf-8"))


def _declared(workspace: str) -> tuple[set[str], set[str]]:
    """The packages declared for the workspace, and those only `@types` covers."""
    names: set[str] = set()
    for manifest in (_manifest("package.json"), _manifest(f"{workspace}/package.json")):
        for field in ("dependencies", "devDependencies", "peerDependencies"):
            names.update(manifest.get(field, {}))
    typed = {n.removeprefix("@types/") for n in names if n.startswith("@types/")}
    return names, typed - names


def _aliases(workspace: str) -> set[str]:
    """First segments of the `paths` keys: `@contract/wire` reads as a package."""
    found: set[str] = set()
    for config in sorted((REPO_ROOT / workspace).glob("tsconfig*.json")):
        stripped = LINE_COMMENT.sub("", config.read_text(encoding="utf-8"))
        paths = json.loads(stripped).get("compilerOptions", {}).get("paths", {})
        found.update(key.split("/")[0] for key in paths)
    return found


def _package(specifier: str) -> str:
    parts = specifier.split("/")
    return "/".join(parts[:2]) if specifier.startswith("@") else parts[0]


def _code(text: str) -> str:
    """The source with comments and template literals blanked, newlines kept.

    A quoted string ends at the newline as well as at its quote, so a quote
    inside a regular expression costs one line rather than every import below
    it.
    """
    out: list[str] = []
    i, end = 0, len(text)
    while i < end:
        pair, char = text[i : i + 2], text[i]
        if pair == "//":
            while i < end and text[i] != "\n":
                i += 1
        elif pair == "/*":
            i += 2
            while i < end and text[i : i + 2] != "*/":
                out.append("\n" if text[i] == "\n" else "")
                i += 1
            i += 2
        elif char in "'\"":
            out.append(char)
            i += 1
            while i < end and text[i] not in (char, "\n"):
                out.append(text[i : i + 2] if text[i] == "\\" else text[i])
                i += 2 if text[i] == "\\" else 1
            if i < end and text[i] == char:
                out.append(char)
                i += 1
        elif char == "`":
            i += 1
            while i < end and text[i] != "`":
                out.append("\n" if text[i] == "\n" else "")
                i += 2 if text[i] == "\\" else 1
            i += 1
        else:
            out.append(char)
            i += 1
    return "".join(out)


def _type_only(clause: str) -> bool:
    if re.match(r"type\b", clause.strip()):
        return True
    braced = re.search(r"\{(.*)\}", clause, re.DOTALL)
    if not braced:
        return False
    bindings = [one.strip() for one in braced.group(1).split(",") if one.strip()]
    return bool(bindings) and all(re.match(r"type\b", one) for one in bindings)


def _specifiers(text: str) -> list[tuple[str, bool]]:
    """Each imported specifier with whether the import is erased before the run."""
    code = _code(text)
    found = [(m.group("name"), _type_only(m.group("clause"))) for m in IMPORT.finditer(code)]
    for pattern in (REEXPORT, BARE, DYNAMIC):
        found += [(m.group("name"), False) for m in pattern.finditer(code)]
    return found


def _sources(workspace: str) -> list:
    found = []
    for suffix in SUFFIXES:
        found += [
            source
            for source in (REPO_ROOT / workspace).rglob(suffix)
            if "node_modules" not in source.parts
        ]
    return found


def _imports(workspace: str) -> list[tuple[str, str, bool]]:
    aliases = _aliases(workspace)
    found: list[tuple[str, str, bool]] = []
    for source in _sources(workspace):
        for specifier, erased in _specifiers(source.read_text(encoding="utf-8")):
            if specifier.startswith((".", "/", "node:")):
                continue
            if specifier.split("/")[0] in aliases:
                continue
            found.append((str(source.relative_to(REPO_ROOT)), _package(specifier), erased))
    return found


def test_a_test_file_imports_only_declared_packages() -> None:
    undeclared: list[str] = []
    for workspace in WORKSPACES:
        declared, typed = _declared(workspace)
        walked = _sources(workspace)
        assert len(walked) > 100, f"{workspace} walked {len(walked)} test files"
        for source, name, erased in _imports(workspace):
            if name in declared or (erased and name in typed):
                continue
            undeclared.append(f"{source}: {name}")
    assert not undeclared, (
        "these test files import packages no manifest declares:\n  "
        + "\n  ".join(sorted(set(undeclared)))
    )


def test_a_stray_backtick_does_not_silence_the_imports_below_it() -> None:
    """The failure this guards is silent: a swallowed file reports nothing."""
    source = """
// A comment with a stray ` backtick and a commented-out import:
// import { hidden } from 'commented-out'
// await import('commented-out-too')
const SQL = 'delete from "session" where id = $1'
const PLANTED = `
import type { Meta } from '@storybook/react-vite'
`
import { named } from 'undeclared-package'
import type { Shape } from 'types-only-package'
const lazy = await import('dynamic-package')
"""
    assert sorted(_specifiers(source)) == sorted(
        [
            ("undeclared-package", False),
            ("types-only-package", True),
            ("dynamic-package", False),
        ]
    )
