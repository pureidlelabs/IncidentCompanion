"""The largest upload the app offers is one the edge will carry.

**nginx is the only door.** `compose.yaml` gives the app no ``ports:`` -- *"nginx
is the only door to the host"* -- so every upload crosses
``client_max_body_size`` before the app sees a byte. An operator who raises
``evidence.attachmentMegabytes`` past it meets a 413 from nginx carrying none of
the app's words, which is the same defect #588 was about one layer further out:
a bound offered, and enforced somewhere the offer cannot see.

Held here rather than in either file, because the claim is about the pair.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
KEYS = ROOT / "server" / "src" / "policy" / "keys.ts"
NGINX = ROOT / "docker" / "nginx" / "default.conf"


def app_ceiling_megabytes() -> int:
    """The largest an operator may set an evidence limit to."""
    text = KEYS.read_text(encoding="utf-8")
    found = re.search(r"^export const EVIDENCE_CEILING_MEGABYTES = (.+)$", text, re.M)
    assert found, f"{KEYS} declares no EVIDENCE_CEILING_MEGABYTES"
    return int(eval(found.group(1), {"__builtins__": {}}, {}))  # noqa: S307


def edge_ceiling_megabytes() -> int:
    """What nginx will carry, in megabytes."""
    text = NGINX.read_text(encoding="utf-8")
    found = re.search(r"^\s*client_max_body_size\s+(\d+)([kmg]);", text, re.M | re.I)
    assert found, f"{NGINX} sets no client_max_body_size"
    size, unit = int(found.group(1)), found.group(2).lower()
    return {"k": size // 1024, "m": size, "g": size * 1024}[unit]


def test_the_app_offers_no_upload_the_edge_would_refuse() -> None:
    """A limit an operator may set is one the shipped stack can carry.

    Names both numbers, because the failure is about which of the two moved.
    """
    app, edge = app_ceiling_megabytes(), edge_ceiling_megabytes()

    assert app <= edge, (
        f"an operator may set an evidence limit to {app}MB and nginx carries {edge}MB, "
        "so anything between the two is refused at the edge with a 413 the app never "
        "sees. Move whichever is wrong -- they are one number."
    )


def test_both_numbers_were_read_rather_than_assumed() -> None:
    """Without this the pair above passes over whatever a failed regex returned."""
    assert app_ceiling_megabytes() > 0
    assert edge_ceiling_megabytes() > 0
