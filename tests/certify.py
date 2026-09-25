#!/usr/bin/env python3
"""Certify a run from the reports its tiers wrote.

    python3 -m tests.certify <reports> [--closes 203,220] [--partial]

`<reports>` holds a vitest JSON report per server, client and screen shard,
named `<tier>-<shard>.json`, and a pytest junit report per Python tier, named
`<tier>.xml`. Exits 1 naming every one of these:

- a test file a tier owns that none of that tier's reports holds, a report
  holding a file with no test in it, and a file named like a test that no tier
  owns;
- a skipped or todo test `ALLOWED_SKIPS` does not name, and a named one no
  report holds;
- a `demonstrated` row citing a path rather than a test, or a test that is
  absent, did not pass, or did not reach the product through its entry point;
- with `--closes`, an `unbuilt` row citing an issue the landing closes.

Then prints the four numbers the constitution asks for, counting as
demonstrated only the rows this run certified.

`--partial` is a local run's: a tier with no report in `<reports>` is named as
not run rather than refused, and a row citing it is counted uncertified.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ElementTree
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from tests._ledger import FILE_AND_TITLE, STATUSES, TITLE_PATH, citations, rows
from tests._repo import REPO_ROOT

LEDGER = REPO_ROOT / "openspec" / "matrix" / "scenarios.md"

#: A ledger row: capability, requirement, scenario, status, evidence.
Row = tuple[str, str, str, str, str]

VITEST = re.compile(r"\.test\.tsx?$")
STORY = re.compile(r"\.stories\.tsx$")
PYTEST = re.compile(r"(^|/)test_[^/]*\.py$")
PLAYWRIGHT = re.compile(r"\.spec\.ts$")
NODE_TEST = re.compile(r"\.test\.mjs$")

#: The names a runner collects as a test file, read independently of any
#: config's `include`, which is the thing that can narrow in silence.
CONVENTIONS = (VITEST, STORY, PYTEST, PLAYWRIGHT, NODE_TEST)

#: Each tier this reads, and the test files it owes: a path prefix and the
#: convention its runner collects under it.
OWNED: dict[str, tuple[tuple[str, re.Pattern[str]], ...]] = {
    "server": (("server/src/", VITEST), ("server/test/", VITEST)),
    "client": (("ui/src/", VITEST),),
    "screen": (("ui/src/", STORY),),
    "repository": (
        ("tests/docs/", PYTEST),
        ("tests/repo/", PYTEST),
        ("tests/contract/", PYTEST),
        (".claude/tests/", PYTEST),
        ("tests/docker/test_container_config.py", PYTEST),
        ("tests/docker/test_stack_images.py", PYTEST),
    ),
    "containers": (("tests/docker/", PYTEST),),
    "lifecycle": (("tests/lifecycle/", PYTEST),),
}

#: Files named like a test that no report here holds, and why that is not a
#: gap in what this certifies. A row citing one of them certifies nothing.
# ponytail: the Playwright tiers are read by nothing here; reading their JSON
# reporter is the upgrade.
UNREAD = {
    "server/e2e/": "Playwright: no report of the browser tier is read here, and the gallery "
    "sweeps every story rather than demonstrating a scenario",
    "tools/eslint-rules/": "node --test in the lint tier, which fails its job on a red case",
    ".claude/scripts/test_scope.py": "a script named like a test, which no runner collects",
}

#: Cases whose scenario's actor is the database role the application connects
#: as, so the store is the surface they reach it through; each with why. They
#: count only for a `state` row.
STORE_SURFACE: dict[str, str] = {
    "server/test/a-sent-report-says-nothing-to-a-writer-out-of-its-reach.test.ts :: a part naming a sent "
    "report out of the writer's reach > refuses it at the store as it refuses a report that does not "
    "exist, naming nothing and waiting on nothing": "whether a refused write waits on another case's row "
    "is visible only to a second session at the store, and every route refuses before it writes",
}

#: Stories whose scenario's surface is what they draw, with nothing stubbed on
#: the actor's path; each with why, and counting only for the capability named.
DRAWN_SURFACE: dict[tuple[str, str], str] = {
    ("ui/src/screens/case-archive.stories.tsx :: An export left unencrypted", "case-archive"): "being told is "
    "a readable line the screen draws from the analyst leaving the passphrase blank, which its container never sets",
}

EDGE_IMAGE_FILE ="tests/docker/test_container_config.py"


def _needs_edge_image() -> list[str]:
    """The cases `EDGE_IMAGE_FILE` gates behind the edge image, read from its decorators."""
    tree = ast.parse((REPO_ROOT / EDGE_IMAGE_FILE).read_text(encoding="utf-8"))
    return [
        node.name
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and any(isinstance(mark, ast.Name) and mark.id == "needs_edge_image" for mark in node.decorator_list)
    ]


#: Allowed skips that run in the merge group and skip in every other run, so
#: neither running nor skipping them says the allowance is stale.
ARMED_IN_THE_MERGE_GROUP = (
    ("repository", "tests/docs/test_openspec_consistency.py :: "
     "test_every_change_the_landing_archives_is_folded_into_specs"),
    ("repository", "tests/docs/test_openspec_consistency.py :: "
     "test_the_tree_being_landed_carries_nothing_in_flight"),
)

#: Tests a tier may report skipped, by tier and id, each with the reason it cannot
#: run there. One no report holds is refused, so an entry cannot outlive its test.
ALLOWED_SKIPS: dict[tuple[str, str], str] = {
    ("server", "server/test/stack.test.ts :: the per-worktree stack derivation > creates the three roles "
     "the app connects as"): "needs a compose project, and CI raises Postgres as a service container",
    **dict.fromkeys(ARMED_IN_THE_MERGE_GROUP, "armed in the merge group alone"),
    ("containers", "tests/docker/test_container_runtime.py :: "
     "test_the_detected_profile_names_the_runtime_the_daemon_reports"): "asserts macOS's arm, and CI runs Linux",
    **{
        ("repository", f"{EDGE_IMAGE_FILE} :: {name}"): "opt-in: the containers tier runs it"
        for name in _needs_edge_image()
    },
    **{
        ("repository", f"tests/repo/test_stack_env.py :: {name}"): "mise is not installed on the runner"
        for name in (
            "test_mise_evaluates_a_fresh_clone_without_recursing",
            "test_mise_hands_the_sourced_script_its_own_node",
        )
    },
    **{
        ("repository", f".claude/tests/test_hooks_import_on_the_oldest_python.py :: {name}[NOTSET]"): "no hook guard exists"
        for name in (
            "test_every_guard_names_a_python_floor",
            "test_the_gate_blocks_rather_than_permits",
            "test_the_gate_runs_before_anything_that_could_raise",
        )
    },
}


@dataclass
class Case:
    """One test as a report recorded it."""

    tier: str
    path: str
    status: str
    meta: dict[str, object] = field(default_factory=dict)


@dataclass
class Run:
    """What a run's reports hold: its cases by id and by tier, and the files each tier ran."""

    cases: dict[str, Case] = field(default_factory=dict)
    by_tier: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    twice: set[tuple[str, str]] = field(default_factory=set)
    ran: dict[str, set[str]] = field(default_factory=dict)
    empty: set[str] = field(default_factory=set)


def tracked() -> list[str]:
    """Every path the checkout tracks."""
    listed = subprocess.run(  # noqa: S603
        ["git", "ls-files", "-z"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [path for path in listed.split("\0") if path]


def owners(path: str) -> list[str]:
    """The tiers that owe `path`."""
    return [
        tier
        for tier, owned in OWNED.items()
        if any(path.startswith(prefix) and convention.search(path) for prefix, convention in owned)
    ]


def case_id(path: str, titles: Iterable[str]) -> str:
    """A test's id, as a ledger row cites it."""
    return path + FILE_AND_TITLE + TITLE_PATH.join(title for title in titles if title)


def _repo_path(name: str, known: set[str]) -> str | None:
    """The tracked path a report's absolute file name ends in."""
    parts = Path(name).as_posix().split("/")
    for start in range(len(parts)):
        candidate = "/".join(parts[start:])
        if candidate in known:
            return candidate
    return None


def _counts_for(named: str, path: str, run: Run) -> str:
    """Records `path` as run by the tier the report is named for, or else by the one owning it."""
    owned = owners(path)
    tier = named if named in owned or not owned else owned[0]
    run.ran.setdefault(tier, set()).add(path)
    return tier


#: Which of two reports of one case stands: a failure anywhere, else a run anywhere.
_RANK = {"skipped": 0, "passed": 1, "failed": 2}


def _record(run: Run, ident: str, case: Case) -> None:
    """Keeps `case` unless another report of the same test outranks it."""
    key = (case.tier, ident)
    if key in run.by_tier:
        run.twice.add(key)
    run.by_tier.setdefault(key, set()).add(case.status)
    kept = run.cases.get(ident)
    if kept is None or _RANK[case.status] > _RANK[kept.status]:
        run.cases[ident] = case


def _status(raw: str) -> str:
    return raw if raw in {"passed", "failed"} else "skipped"


def read_vitest(named: str, report: Path, known: set[str], run: Run) -> None:
    """Folds one vitest JSON report into `run`.

    One run of several projects writes one report, so a file the report's tier
    does not own counts for the tier that does.
    """
    for module in json.loads(report.read_text(encoding="utf-8"))["testResults"]:
        path = _repo_path(module["name"], known)
        if path is None:
            raise SystemExit(f"{report.name} holds {module['name']}, which the checkout does not track")
        tier = _counts_for(named, path, run)
        if not module["assertionResults"]:
            run.empty.add(path)
        for case in module["assertionResults"]:
            ident = case_id(path, [*case["ancestorTitles"], case["title"]])
            _record(run, ident, Case(tier, path, _status(case["status"]), case.get("meta") or {}))


def read_junit(tier: str, report: Path, known: set[str], run: Run) -> None:
    """Folds one pytest junit report into `run`, counting each file as `read_vitest` does.

    pytest names a case's module by its dotted path, so the tracked file is the
    longest dotted prefix that names one; what follows is its class.
    """
    modules = {path[: -len(".py")].replace("/", "."): path for path in known if path.endswith(".py")}
    for case in ElementTree.parse(report).getroot().iter("testcase"):
        dotted = case.get("classname", "")
        prefix = dotted
        while prefix and prefix not in modules:
            prefix = prefix.rpartition(".")[0]
        if not prefix:
            raise SystemExit(f"{report.name} holds a case from {dotted}, which names no tracked module")
        path = modules[prefix]
        classes = [one for one in dotted[len(prefix) :].split(".") if one]
        children = {child.tag for child in case}
        status = "failed" if children & {"failure", "error"} else "skipped" if "skipped" in children else "passed"
        properties = {prop.get("name"): prop.get("value") for prop in case.iter("property")}
        home = _counts_for(tier, path, run)
        _record(run, case_id(path, [*classes, case.get("name", "")]), Case(home, path, status, properties))


def read(reports: Path, known: set[str]) -> Run:
    """Every report in `reports`, by the tier its name starts with."""
    run = Run()
    for report in sorted(reports.iterdir()):
        tier = re.split(r"[-.]", report.name, maxsplit=1)[0]
        if tier not in OWNED or report.suffix not in {".json", ".xml"}:
            raise SystemExit(f"{report.name} is not a report of a tier this reads: {sorted(OWNED)}")
        (read_vitest if report.suffix == ".json" else read_junit)(tier, report, known, run)
        run.ran.setdefault(tier, set())
    return run


def renders_a_screen(path: str) -> bool:
    """Whether a client test file renders a screen or an app container.

    Read from the file rather than the run, so one case in it can still test a helper.
    """
    text = (REPO_ROOT / path).read_text(encoding="utf-8")
    under = path.startswith(("ui/src/app/", "ui/src/screens/"))
    imports = re.search(r"from '@/(app|screens)/", text)
    return "@testing-library/react" in text and bool(under or imports)


def entry_level(ident: str, case: Case, capability: str) -> bool:
    """Whether a passing case reached the product through its actor's surface.

    A server case says so in its report, where the booted app tags a request or
    a socket, unless `STORE_SURFACE` names it for a `state` row. A story counts
    only where `DRAWN_SURFACE` names it for the row's capability, and a Compose
    case is tagged by the fixture that raised the stack.
    """
    if case.tier == "server":
        served = bool(case.meta.get("served") or case.meta.get("socket"))
        return served or (capability == "state" and ident in STORE_SURFACE)
    if case.tier == "screen":
        return (ident, capability) in DRAWN_SURFACE
    if case.tier == "containers":
        return case.meta.get("entry") == "compose"
    if case.tier == "client":
        return renders_a_screen(case.path)
    return False


def completeness(run: Run, files: list[str], partial: bool) -> list[str]:
    """Every owned file a tier's reports lack, every empty file, every unowned test file."""
    refused = []
    for path in files:
        tiers = owners(path)
        if not tiers:
            named = any(convention.search(path) for convention in CONVENTIONS)
            if named and not any(path.startswith(prefix) for prefix in UNREAD):
                refused.append(f"{path} is named like a test and no tier owns it")
            continue
        for tier in tiers:
            if tier not in run.ran:
                if not partial:
                    refused.append(f"{path}: the {tier} tier wrote no report")
            elif path not in run.ran[tier]:
                refused.append(f"{path}: the {tier} tier's reports do not hold it")
    refused += [f"{path}: ran no test" for path in sorted(run.empty)]
    return refused


def _function(ident: str) -> str:
    """A parametrised case's id without its parameters."""
    return re.sub(r"\[.*\]$", "", ident)


def _allowed(tier: str, ident: str) -> bool:
    """Whether ALLOWED_SKIPS excuses `ident` in `tier`, by its id or by its function's."""
    return (tier, ident) in ALLOWED_SKIPS or (tier, _function(ident)) in ALLOWED_SKIPS


def skips(run: Run, partial: bool) -> list[str]:
    """Every skip not allowed, and, where every tier reported, every allowance naming no test."""
    refused = [
        f"{ident}: skipped by the {tier} tier, and ALLOWED_SKIPS gives no reason it may be"
        for (tier, ident), statuses in run.by_tier.items()
        if "skipped" in statuses and not _allowed(tier, ident)
    ]
    if not partial:
        for (tier, ident), reason in ALLOWED_SKIPS.items():
            held = [
                statuses
                for (ran, one), statuses in run.by_tier.items()
                if ran == tier and ident in {one, _function(one)}
            ]
            if not held:
                refused.append(f"{ident}: no {tier} report holds it, so ALLOWED_SKIPS excuses nothing ({reason})")
            elif not any("skipped" in statuses for statuses in held) and (tier, ident) not in ARMED_IN_THE_MERGE_GROUP:
                refused.append(f"{ident}: the {tier} tier ran it, so ALLOWED_SKIPS excuses nothing ({reason})")
    return refused


def certified(run: Run, capability: str, evidence: str) -> str | None:
    """Why a `demonstrated` row's evidence does not certify, or None when it does."""
    for path, title in citations(evidence):
        if not title:
            return f"cites {path} rather than a test in it"
        ident = path + FILE_AND_TITLE + title
        case = run.cases.get(ident)
        if case is None:
            return f"cites {ident}, which no report holds"
        twice = sorted(tier for tier, one in run.twice if one == ident)
        if twice:
            return f"cites {ident}, which the {twice[0]} tier reports more than once"
        if case.status != "passed":
            return f"cites {ident}, which {case.status}"
        if not entry_level(ident, case, capability):
            return f"cites {ident}, which never reached the product through its entry point"
    return None


def unbuilt_closed(ledger: list[Row], closes: set[int]) -> list[str]:
    """Every `unbuilt` row citing an issue the landing closes."""
    return [
        f"{capability}: {scenario!r} is unbuilt and cites #{number}, which this landing closes"
        for capability, _, scenario, status, reason in ledger
        if status == "unbuilt"
        for number in sorted({int(n) for n in re.findall(r"#(\d+)", reason)} & closes)
    ]


def certify(
    reports: Path, closes: set[int], partial: bool, files: list[str], ledger: list[Row]
) -> tuple[list[str], dict[str, int]]:
    """The refusals and the four numbers for the run whose reports are in `reports`.

    `files` is what the checkout tracks and `ledger` the scenario rows.
    """
    run = read(reports, set(files))
    refused = completeness(run, files, partial) + skips(run, partial) + unbuilt_closed(ledger, closes)

    counted = dict.fromkeys(("scenarios", *STATUSES, "uncertified here"), 0)
    for capability, _, scenario, status, evidence in ledger:
        counted["scenarios"] += 1
        named = status or STATUSES[0]
        if named != "demonstrated":
            counted[named] += 1
            continue
        tiers = {owner for path, _ in citations(evidence) for owner in owners(path)}
        if partial and tiers and not tiers & set(run.ran):
            counted["uncertified here"] += 1
            continue
        why = certified(run, capability, evidence)
        if why is None:
            counted["demonstrated"] += 1
        else:
            refused.append(f"{capability}: {scenario!r} {why}")
    return refused, counted


def main() -> int:
    parsed = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parsed.add_argument("reports", type=Path)
    parsed.add_argument("--closes", default="", help="issue numbers the landing closes, comma-separated")
    parsed.add_argument("--partial", action="store_true", help="certify only the tiers that wrote a report")
    args = parsed.parse_args()

    closes = {int(n) for n in args.closes.split(",") if n.strip()}
    refused, counted = certify(args.reports, closes, args.partial, tracked(), rows(LEDGER))
    for line in refused:
        print(line)
    print(" ".join(f"{label} {number}" for label, number in counted.items()))
    return 1 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
