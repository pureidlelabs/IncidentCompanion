"""The built entry point is where everything that starts it says it is.

`nest build` prints `Successfully compiled` whichever layout it emits, so a
`rootDir` change moves `main.js` and nothing fails until a container starts.
"""

from __future__ import annotations

import json
import re

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server"


def _emit_prefix() -> str:
    """`dist/src` or `dist`, per the `rootDir` the swc builder honours."""
    root_dir = re.search(r'"rootDir":\s*"([^"]+)"', (SERVER / "tsconfig.json").read_text())
    assert root_dir, "tsconfig.json names no rootDir"
    return "dist/src" if root_dir.group(1) == "." else "dist"


def test_every_launcher_names_the_file_the_build_emits() -> None:
    prefix = _emit_prefix()
    scripts = json.loads((SERVER / "package.json").read_text())["scripts"]

    assert scripts["start"] == f"node {prefix}/main.js"
    assert scripts["seed"] == f"node {prefix}/seed.js"
    assert f'"{prefix}/main.js"' in (REPO_ROOT / "docker" / "app" / "Dockerfile").read_text()
    assert f'"{prefix}/seed.js"' in (REPO_ROOT / "compose.yaml").read_text()
