"""A test file imports only what its workspace declares.

Only `*.test.ts`, `*.test.tsx` and `*.spec.ts` are read, so a support module
one of them imports is outside this.
"""

from __future__ import annotations

import json
import re

from tests._repo import REPO_ROOT

WORKSPACES = ("server", "ui")

SUFFIXES = ("*.test.ts", "*.test.tsx", "*.spec.ts")

#: Anchoring to the line a statement ends on is what keeps `delete from
#: "session"` out: SQL in a template literal reads exactly like a specifier.
STATEMENT = re.compile(r"^\s*(?:import\b|export\b|\}\s*from\b)")

SPECIFIER = re.compile(r"""\bfrom\s*['"]([^'"\n]+)['"]|^\s*import\s*['"]([^'"\n]+)['"]""")

DYNAMIC = re.compile(r"""\bimport\s*\(\s*['"]([^'"\n]+)['"]""")

#: A full-line `//` comment, which `json` refuses and every tsconfig here has.
LINE_COMMENT = re.compile(r"^\s*//.*$", re.MULTILINE)


def _manifest(path: str) -> dict:
    return json.loads((REPO_ROOT / path).read_text(encoding="utf-8"))


def _declared(workspace: str) -> set[str]:
    names: set[str] = set()
    for manifest in (_manifest("package.json"), _manifest(f"{workspace}/package.json")):
        for field in ("dependencies", "devDependencies", "peerDependencies"):
            names.update(manifest.get(field, {}))
    # `import type { Request } from 'express'` is declared by `@types/express`:
    # the resolution is TypeScript's, and nothing of express reaches the run.
    names.update({name.removeprefix("@types/") for name in names if name.startswith("@types/")})
    return names


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


def _specifiers(text: str) -> list[str]:
    """Import specifiers, skipping a template literal: a planted story has imports."""
    found: list[str] = []
    planted = False
    for line in text.splitlines():
        quoted, planted = planted, planted != (line.count("`") % 2 == 1)
        if quoted:
            continue
        if STATEMENT.match(line):
            found += [name for pair in SPECIFIER.findall(line) for name in pair if name]
        found += DYNAMIC.findall(line)
    return found


def _imports(workspace: str) -> list[tuple[str, str]]:
    aliases = _aliases(workspace)
    found: list[tuple[str, str]] = []
    for suffix in SUFFIXES:
        for source in (REPO_ROOT / workspace).rglob(suffix):
            if "node_modules" in source.parts:
                continue
            for specifier in _specifiers(source.read_text(encoding="utf-8")):
                if specifier.startswith((".", "/", "node:")):
                    continue
                if specifier.split("/")[0] in aliases:
                    continue
                found.append((str(source.relative_to(REPO_ROOT)), _package(specifier)))
    return found


def test_a_test_file_imports_only_declared_packages() -> None:
    undeclared: list[str] = []
    counted = 0
    for workspace in WORKSPACES:
        declared = _declared(workspace)
        imports = _imports(workspace)
        counted += len(imports)
        undeclared += [
            f"{source}: {name}" for source, name in imports if name not in declared
        ]
    assert counted > 100, "no test-file imports were read at all, so this guards nothing"
    assert not undeclared, (
        "these test files import packages no manifest declares:\n  "
        + "\n  ".join(sorted(set(undeclared)))
    )
