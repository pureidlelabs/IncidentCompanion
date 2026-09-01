"""The chain from `mise.toml` to the script that prints the environment is unbroken.

**Every link in it fails quietly**, which is why this is a test rather than a
note. mise's `_.source` pointed at a path that does not exist warns once, on a
shell prompt nobody is reading; `eval "$(node <a missing file>)"` sets no
variable and exits 0. A rename anywhere along the chain therefore leaves a
shell with no `DATABASE_URL` and nothing that says so -- the same silent
absence the environment was moved into mise to stop.
"""

from __future__ import annotations

import re
import tomllib

from tests._repo import REPO_ROOT


def test_the_shell_environment_reaches_the_script_that_prints_it() -> None:
    config = tomllib.loads((REPO_ROOT / "mise.toml").read_text(encoding="utf-8"))
    sourced = config["env"]["_"]["source"]

    wrapper = REPO_ROOT / sourced
    assert wrapper.is_file(), f"mise.toml sources {sourced!r}, which is not a file"

    ran = re.findall(r"node\s+(\S+\.mjs)", wrapper.read_text(encoding="utf-8"))
    assert ran, f"{sourced} runs no script, so a shell sourcing it gets nothing"
    for path in ran:
        assert (REPO_ROOT / path).is_file(), f"{sourced} runs {path!r}, which is not a file"
