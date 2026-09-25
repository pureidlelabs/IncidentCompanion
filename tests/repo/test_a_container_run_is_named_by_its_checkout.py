"""Two checkouts running the container tiers on one daemon cannot exchange images or stacks.

A tag, a Compose project or a host port spelled the same in every checkout is
shared by all of them: one tree's build replaces the image another is about to
run, and one tree's `down` removes the stack another is testing. -> #1267
"""

from __future__ import annotations

import itertools
import re

import yaml

from tests._repo import REPO_ROOT

TIERS = [*sorted((REPO_ROOT / "tests" / "docker").glob("*.py")),
         *sorted((REPO_ROOT / "tests" / "lifecycle").glob("*.py"))]


def test_every_image_the_stack_builds_takes_the_checkout_tag():
    """An operator's `compose up` gets `:local`; a test run names its own tag."""
    spec = yaml.safe_load((REPO_ROOT / "compose.yaml").read_text(encoding="utf-8"))
    built = {name: service["image"] for name, service in spec["services"].items()
             if service["image"].startswith("incidentcompanion-")}
    assert built, "compose.yaml builds no incidentcompanion image -- this test moved"
    fixed = {name: image for name, image in built.items()
             if not image.endswith(":${IC_IMAGE_TAG:-local}")}
    assert not fixed, f"services whose image tag no test run can move: {fixed}"


def test_no_tier_spells_an_image_tag_a_project_or_a_port_of_its_own():
    """Every name a tier runs under comes from `tests/_checkout.py`."""
    bare_tag = re.compile(r"""["']incidentcompanion-[\w-]+:[\w.]""")
    own_name = re.compile(r"^(?:PROJECT|PORT)\s*=(?!.*\b(?:project|port)\()", re.MULTILINE)
    offenders = []
    for path in TIERS:
        source = path.read_text(encoding="utf-8")
        where = path.relative_to(REPO_ROOT)
        offenders += [f"{where}: {m.group(0)}" for m in bare_tag.finditer(source)]
        offenders += [f"{where}: {m.group(0)}..." for m in own_name.finditer(source)]
        if "PYTEST_XDIST_WORKER" in source:
            offenders.append(f"{where}: derives a name from the xdist worker alone")
    assert not offenders, "\n".join(offenders)


def test_the_compose_runs_carry_the_checkout_tag():
    """Every environment a tier hands a subprocess carries the tag, or compose builds and runs `:local`."""
    handed = re.compile(r"\{\*\*os\.environ,(?!\s*\*\*checkout\.ENV\b)")
    seen, untagged = 0, []
    for path in TIERS:
        source = path.read_text(encoding="utf-8")
        seen += source.count("{**os.environ,")
        untagged += [f"{path.relative_to(REPO_ROOT)}:{source.count(chr(10), 0, m.start()) + 1}"
                     for m in handed.finditer(source)]
    assert seen, "no tier hands a subprocess an environment -- this test moved"
    assert not untagged, f"environments without IC_IMAGE_TAG: {untagged}"


def test_no_two_checkouts_or_workers_share_a_port():
    """Every slot the stack registry hands out, every tier, sixteen workers each."""
    from tests import _checkout as checkout

    ports = [checkout.port(tier, slot, worker) for tier, slot, worker in itertools.product(
        checkout.PORT_BASE, range(checkout.MAX_SLOT + 1), range(16))]
    assert len(ports) == len(set(ports))
    assert max(ports) < 55432, "a tier port reaches the dev stacks' Postgres range (stack.mjs)"
