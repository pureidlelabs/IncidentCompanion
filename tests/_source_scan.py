# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""String literals out of a TypeScript/TSX file, for the enumeration tests
that used to read `app/` alone (`ast.parse` has no TS grammar).

A single-pass tokenizer rather than a regex, because a regex over `'...'`
cannot tell a string's quote from one inside a `//` comment or a JSDoc block --
and a prose sentence describing the rule sits next to the literal these tests
exist to catch.

Template literals with no `${}` are read like any other string; one holding an
interpolation is skipped **whole**, rather than read up to the first `${`,
which would truncate a longer literal instead of refusing it.

**A `/` opens a regex only in value position** -- after `( , ; : = ! & | ? + -
* % ^ ~ < > [ { }` or nothing; after an identifier, a number, `)`, `]` or a
string/template/regex it is division. A regex literal's character class may
hold a bare quote, so getting this wrong swallows the rest of the file as one
literal, silently.
"""
from __future__ import annotations

from pathlib import Path

#: Characters after which a `/` starts a regex literal rather than dividing.
_REGEX_PRECEDERS = set("(,;:=!&|?+-*%^~<>[{}\n")


def ts_string_literals(path: Path) -> set[str]:
    src = path.read_text(encoding="utf-8")
    literals: set[str] = set()
    i, n = 0, len(src)
    last_significant = ""
    while i < n:
        ch = src[i]
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            end = src.find("\n", i)
            i = n if end == -1 else end + 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            end = src.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        if ch == "/" and (last_significant == "" or last_significant in _REGEX_PRECEDERS):
            j = i + 1
            in_class = False
            while j < n:
                c = src[j]
                if c == "\\" and j + 1 < n:
                    j += 2
                    continue
                if c == "\n":
                    break  # an unterminated regex; not this scanner's problem
                if c == "[":
                    in_class = True
                elif c == "]":
                    in_class = False
                elif c == "/" and not in_class:
                    j += 1
                    break
                j += 1
            i = j
            last_significant = "/"
            continue
        if ch in ("'", '"'):
            j = i + 1
            buf = []
            closed = False
            while j < n:
                c = src[j]
                if c == "\\" and j + 1 < n:
                    buf.append(src[j:j + 2])
                    j += 2
                    continue
                if c == ch:
                    closed = True
                    j += 1
                    break
                if c == "\n":
                    break  # an unterminated literal; not this scanner's problem
                buf.append(c)
                j += 1
            if closed:
                literals.add("".join(buf))
            i = j
            last_significant = "'"  # any string closer: division follows, not regex
            continue
        if ch == "`":
            j = i + 1
            has_interpolation = False
            while j < n and src[j] != "`":
                if src[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if src[j:j + 2] == "${":
                    has_interpolation = True
                j += 1
            if not has_interpolation and j < n:
                literals.add(src[i + 1:j])
            i = j + 1
            last_significant = "`"
            continue
        if not ch.isspace():
            last_significant = ch
        i += 1
    return literals


def ts_files(root: Path, *, exclude_suffixes: tuple[str, ...] = (".test.ts", ".test.tsx", ".stories.ts", ".stories.tsx")) -> list[Path]:
    """Every `.ts`/`.tsx` file under `root`, test and story files dropped.

    A co-located test or story legitimately names a fixture value a
    production file must not -- `mapping.test.ts`'s `'sentinel-import'` is a
    real value the wizard writes, not a hardcoded gate. Python's own
    enumeration tests get the same exemption for free by never reading
    `tests/`; nothing here plays that role for `ui/src`, so it is stated.
    """
    found = [
        path
        for pattern in ("*.ts", "*.tsx")
        for path in root.rglob(pattern)
        if not path.name.endswith(exclude_suffixes)
    ]
    return sorted(found)
