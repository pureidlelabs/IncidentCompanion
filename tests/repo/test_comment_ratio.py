"""The share of the tree that is prose, measured from parsers and held.

**A ratchet against growth, and a target it has not reached.** The share is
`comment_lines / (comment_lines + code_lines)` over
`.claude/scripts/comment_inventory.py`, which is the same walk the review queue
reads -- what is reviewed and what is measured cannot drift apart.

The target is 15 to 20 per cent, inclusive, judged on raw totals so nothing
passes by rounding. Until the review has brought the tree into that band the
ceiling below is the measured baseline, and `target_met` stays false. A cut
made to reach a number rather than because each line failed a review is what
this file exists to make unnecessary.

`test_the_band_is_not_reached_yet` is the other half of the ratchet: it goes
red the moment the band is met, which is the moment the baseline ceiling
becomes an untrue description and has to be replaced by the band itself.
"""

from __future__ import annotations

import importlib.util
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]

#: The measured baseline, as the raw totals that produced it rather than a
#: rounded percentage. Lower it when a review has justified the deletions that
#: made it lower, never to make room for a cut.
BASELINE_COMMENT = 79_228
BASELINE_MEASURED = 249_128

BAND = (15, 20)


def _inventory():
    spec = importlib.util.spec_from_file_location(
        "comment_inventory", ROOT / ".claude" / "scripts" / "comment_inventory.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def report():
    module = _inventory()
    try:
        return module, module.collect()
    except module.Incomplete as error:
        pytest.fail(f"the inventory is incomplete, so it has no share to report: {error}")


def _breakdown(report: dict) -> str:
    return ", ".join(
        f"{tier['tier']} {tier['totals']['ratio'] * 100:.1f}%"
        for tier in report["tiers"] if tier["totals"]["ratio"] is not None)


def test_the_walk_covers_the_tree(report) -> None:
    """An empty or partial corpus reports a share about nothing."""
    _, found = report
    assert found["complete"] and not found["errors"], found["errors"]
    assert found["files_scanned"] > 1_000, found["files_scanned"]
    assert found["totals"]["comment_lines"] + found["totals"]["code_lines"] > 0


def test_the_prose_share_has_not_grown_past_its_baseline(report) -> None:
    _, found = report
    totals = found["totals"]
    comment = totals["comment_lines"]
    measured = comment + totals["code_lines"]
    assert comment * BASELINE_MEASURED <= BASELINE_COMMENT * measured, (
        f"{comment / measured * 100:.2f}% of the tree is comment ({comment:,} "
        f"lines against {totals['code_lines']:,} of code), over the "
        f"{BASELINE_COMMENT / BASELINE_MEASURED * 100:.2f}% baseline. By tier: "
        f"{_breakdown(found)}. This is a ratchet: bring the new prose down "
        f"rather than raising the baseline.")


def test_the_band_is_not_reached_yet(report) -> None:
    """The baseline is a migration ceiling, and saying so has to stop being true.

    Passing means the tree is still outside 15 to 20 per cent. When this goes
    red the review has arrived: replace the baseline above with the band, so
    the gate stops describing an unfinished migration as the standard.
    """
    module, found = report
    assert not module.in_band(found["totals"], *BAND), (
        f"the tree measures {found['totals']['ratio'] * 100:.2f}%, inside the "
        f"{BAND[0]} to {BAND[1]} per cent target. Replace the baseline ceiling "
        f"in this file with the band and delete this test.")
