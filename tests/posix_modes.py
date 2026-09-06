"""The one place a raw permission mode may be compared.

The app runs on POSIX only -- in the container on every platform, and on the
host as a development path -- so `0600`/`0700` is an unconditional guarantee
rather than a question about the machine. What that buys is the *single call
site*: `tests/repo/test_platform_portability.py` fails if a `st_mode & 0o777`
comparison appears anywhere else, so a mode assertion cannot be written by hand
in a way that drifts from what the app promises.

What the cases root is protected by, and what it is not, is recorded in
`openspec/constitution.md`, Article III.
"""

from __future__ import annotations

from pathlib import Path


def assert_owner_only(path: Path, *, directory: bool = False) -> None:
    """Assert 0600 on a file, 0700 on a directory."""
    expected = "0o700" if directory else "0o600"
    actual = oct(path.stat().st_mode & 0o777)
    assert actual == expected, f"{path} is {actual}, expected {expected}"
