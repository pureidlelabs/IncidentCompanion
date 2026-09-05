"""The share of the tree that is prose, held under a ceiling.

**A ratchet against growth, never a target to optimise against.** The ceiling
is set at where the tree actually sits, so it refuses an increase and says
nothing about whether the tree should be smaller. Lower it when a review has
justified the deletions that made it lower, never to make room for a cut.

Published guidance puts a healthy share of comment at 15 to 20 per cent of all
lines. This tree measured 30.7 per cent on 2026-09-05, which is where the
ceiling stands.

A cut made to reach a number rather than because each line failed a review is
what this file exists to make unnecessary.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: The trees whose prose this governs. `.claude/scripts` and `tests` are in
#: because a rule that exempts its own enforcement surface is not a rule.
TIERS = ("server/src", "ui/src", "server/e2e", "server/test", "tests", ".claude")

CEILING = 0.31


def _counts(root: Path) -> tuple[int, int]:
    """Comment lines and code lines under `root`, blank lines counted as neither."""
    comment = code = 0
    for path in root.rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".py"}:
            continue
        if "node_modules" in path.parts or "worktrees" in path.parts:
            continue
        in_block = False
        for raw in path.read_text(encoding="utf8", errors="ignore").splitlines():
            line = raw.strip()
            if not line:
                continue
            if in_block:
                comment += 1
                if "*/" in line:
                    in_block = False
            elif line.startswith("/*"):
                comment += 1
                in_block = "*/" not in line
            elif line.startswith(("//", "#")):
                comment += 1
            else:
                code += 1
    return comment, code


def test_the_prose_share_has_not_grown_past_its_baseline() -> None:
    per_tier = {tier: _counts(ROOT / tier) for tier in TIERS}
    comment = sum(c for c, _ in per_tier.values())
    code = sum(k for _, k in per_tier.values())
    ratio = comment / (comment + code)

    breakdown = ", ".join(
        f"{tier} {c / (c + k) * 100:.1f}%" for tier, (c, k) in per_tier.items() if c + k
    )
    assert ratio <= CEILING, (
        f"{ratio * 100:.1f}% of the tree is comment ({comment:,} lines against "
        f"{code:,} of code), over the {CEILING * 100:.0f}% ceiling. By tier: "
        f"{breakdown}. This is a ratchet: bring the new prose down rather than "
        f"raising the ceiling."
    )
