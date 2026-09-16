"""Every `files:` glob in an eslint config points at a directory that exists.

A glob matching nothing is silent: the block it guards applies to no file, and
the rules it turns off stay on for the code the exemption was written for. The
lint still reports zero errors, so nothing else can see it.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

CONFIGS = ("server/eslint.config.mjs", "ui/eslint.config.js")

FILES_BLOCK = re.compile(r"\bfiles:\s*\[(?P<body>[^\]]*)\]", re.DOTALL)

QUOTED = re.compile(r"""(['"])(?P<glob>[^'"\n]+)\1""")

LINE_COMMENT = re.compile(r"//[^\n]*")


def _globs(text: str) -> list[str]:
    """The glob strings of every `files:` array. A config writes `files: []`
    inside a comment, so comments go first."""
    code = LINE_COMMENT.sub("", text)
    return [
        m.group("glob")
        for block in FILES_BLOCK.finditer(code)
        for m in QUOTED.finditer(block.group("body"))
    ]


def _directory(glob: str) -> str:
    """The literal directory a glob is anchored at, or `""` when it has none.

    Everything from the first wildcard on can match any name, so only the path
    segments before it are a claim about the tree.
    """
    literal = glob.split("*", 1)[0]
    return literal.rsplit("/", 1)[0] if "/" in literal else ""


def test_a_files_glob_is_anchored_at_a_directory_that_exists() -> None:
    missing: list[str] = []
    seen = 0
    for config in CONFIGS:
        workspace = (REPO_ROOT / config).parent
        globs = _globs((REPO_ROOT / config).read_text(encoding="utf-8"))
        assert len(globs) > 5, f"{config} yielded {len(globs)} globs"
        seen += len(globs)
        for glob in globs:
            anchor = _directory(glob)
            if anchor and not (workspace / anchor).is_dir():
                missing.append(f"{config}: {glob} is anchored at {anchor}/, which does not exist")
    assert not missing, "these lint globs match nothing:\n  " + "\n  ".join(missing)
    assert seen > 10, f"walked {seen} globs across {len(CONFIGS)} configs"


def test_an_anchor_is_read_from_the_literal_half_of_a_glob() -> None:
    """The parser is what decides the test above can fail at all."""
    planted = """
    // files: ['commented/out/**']
    files: ['e2e/visual/probe.js', 'src/test/**'],
    files: [
      '**/*.test.ts',
      '.shot-story.mjs',
      'public/**/*.js',
    ],
    """
    assert _globs(planted) == [
        "e2e/visual/probe.js",
        "src/test/**",
        "**/*.test.ts",
        ".shot-story.mjs",
        "public/**/*.js",
    ]
    assert [_directory(one) for one in _globs(planted)] == [
        "e2e/visual",
        "src/test",
        "",
        "",
        "public",
    ]
