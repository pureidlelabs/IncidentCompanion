"""What the React build has to declare, asserted from outside it.

**These moved out of the retired Python tier's serving test, and the reason is
the whole point of this file.** That module mixed two subjects: how that app
mounted a built SPA, and what the build itself must say. When it
moved into `app/tests/` its `REPO_ROOT` became `app/`, so every one of these
read `app/ui/...` — a path that does not exist — and the checks stopped being
about the tree they name. Two of them raised; the rest of that file's sweeps
went green over the wrong directory.

Nothing here imports `app`. The assertions that compare the build against
`react_ui.spa_url()` or `react_ui.DIST_DIR` stayed behind on purpose: those are
agreements with the Python mount, and the Node server serves the UI now.
"""

import json
import re
from pathlib import Path
from tests._repo import REPO_ROOT

REPO_ROOT = REPO_ROOT
UI_DIR = REPO_ROOT / "ui"

def test_the_router_takes_its_basename_from_the_vite_base():
    """One source for the prefix on the React side, not a second literal.

    A hardcoded `basename: '/ui'` is correct until `base` moves, and the
    symptom then is every route rendering the not-found redirect while every
    asset loads.
    """
    routes = (UI_DIR / "src" / "app" / "routes.tsx").read_text(encoding="utf-8")

    # The call, not the substring: the docstring above it names `BASE_URL` too,
    # so `in routes` passes with the option hardcoded underneath.
    assert re.search(r"basename:\s*import\.meta\.env\.BASE_URL", routes)

def test_the_build_loads_nothing_from_a_network_origin():
    """Core makes no outbound request, and a bundled front end is no exception.

    Read off `index.html` in the *source* tree rather than the build, which is
    gitignored: a `<script src="https://...">` written there survives into
    every build and nothing else in the suite would see it.
    """
    index = (UI_DIR / "index.html").read_text(encoding="utf-8")
    remote = re.findall(r'(?:src|href)="(https?:)?//[^"]+"', index)

    assert not remote, f"index.html loads from the network: {remote}"

def test_index_html_declares_the_favicon():
    """Vite's `base: '/ui/'` does not rewrite an absolute href, so the same
    root-scoped icon the server serves (`/favicon.svg`,
    theme-aware) reaches the React tier unmodified -- matching the one-link
    convention the served documents already use
    rather than adding a second `.ico` link neither of them carries.
    """
    index = (UI_DIR / "index.html").read_text(encoding="utf-8")

    assert '<link rel="icon" href="/favicon.svg">' in index

def test_the_ui_package_declares_the_build_script_the_flag_needs():
    """`--serve-ui` is only usable if `npm run build` is what fills `dist/`."""
    package = json.loads((UI_DIR / "package.json").read_text(encoding="utf-8"))

    assert "build" in package.get("scripts", {})
