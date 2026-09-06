# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""`_source_scan.ts_string_literals` -- the enumeration tests' TS reader."""
from pathlib import Path

from tests._source_scan import ts_files, ts_string_literals


def _scan(tmp_path: Path, source: str) -> set[str]:
    path = tmp_path / "probe.ts"
    path.write_text(source, encoding="utf-8")
    return ts_string_literals(path)


def test_reads_single_and_double_quoted_strings(tmp_path):
    assert _scan(tmp_path, "const a = 'sentinel'\nconst b = \"other\"\n") == {
        "sentinel", "other",
    }


def test_ignores_a_word_inside_a_line_comment(tmp_path):
    assert _scan(tmp_path, "// mentions sentinel in prose\nconst a = 'kept'\n") == {"kept"}


def test_ignores_a_word_inside_a_block_comment(tmp_path):
    assert _scan(tmp_path, "/** talks about sentinel here */\nconst a = 'kept'\n") == {"kept"}


def test_reads_a_plain_template_literal_but_skips_one_with_interpolation(tmp_path):
    literals = _scan(tmp_path, "const a = `plain`\nconst b = `has ${x} interpolation`\n")
    assert literals == {"plain"}


def test_a_quote_inside_a_regex_character_class_does_not_open_a_string(tmp_path):
    # A quote inside a regex character class opens a bogus "string" that runs
    # to the next `"` in the file, swallowing the literals after it --
    # `requiresImporter: 'sentinel'` is the kind these tests then stop
    # catching.
    literals = _scan(
        tmp_path,
        'const cell = (v) => /[",\\r\\n]/.test(v) ? `"${v}"` : v\n'
        "const gate = 'sentinel'\n",
    )
    assert literals == {"sentinel"}


def test_division_after_an_identifier_is_not_read_as_a_regex(tmp_path):
    # `total / count` -- the `/` divides; a scanner that always treated `/`
    # as a regex start would run off the rest of the file looking for a
    # closing one.
    literals = _scan(tmp_path, "const half = total / count\nconst a = 'kept'\n")
    assert literals == {"kept"}


def test_ts_files_excludes_tests_and_stories(tmp_path):
    (tmp_path / "Widget.tsx").write_text("export {}", encoding="utf-8")
    (tmp_path / "Widget.test.tsx").write_text("export {}", encoding="utf-8")
    (tmp_path / "Widget.stories.tsx").write_text("export {}", encoding="utf-8")
    names = {path.name for path in ts_files(tmp_path)}
    assert names == {"Widget.tsx"}
