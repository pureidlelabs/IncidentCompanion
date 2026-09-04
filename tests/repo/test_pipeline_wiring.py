"""The dependency pipeline's wiring, which nothing else can see.

**Every defect found while building this pipeline was green.** A label `ci.yml`
read that no configuration applied; a dashboard tick no workflow listened for; a
manager name `renovate-config-validator` accepts and Renovate silently matches
nothing with; a workflow expression `actionlint` parses and never resolves. None
failed. Each one reported success while doing nothing.

That is the class this file refuses: a reference from one half of the pipeline
to a thing the other half does not provide. Every assertion below names a
crossing that was actually broken, rather than a rule somebody thought of.

`renovate.json5` is read by targeted patterns rather than parsed -- JSON5 wants
a parser this repository does not carry, and the fields wanted here are few.
That makes a structural change able to render these vacuous, so
`test_the_extractor_still_sees_the_pipeline` holds the denominators awake, the
same guard `tests/docs/test_issue_forms.py` uses for the same reason.
"""

from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from tests._repo import REPO_ROOT

CI = REPO_ROOT / ".github" / "workflows" / "ci.yml"
POLICY = REPO_ROOT / ".github" / "renovate.json5"
VERIFY = REPO_ROOT / "verify.sh"
PACKAGE = REPO_ROOT / "package.json"

#: Where a tier can invoke an npm script from.
CALLERS = (CI, VERIFY)

#: Every composite action in this repository, which a workflow reaches by path.
LOCAL_ACTIONS = tuple(sorted((REPO_ROOT / ".github" / "actions").glob("*/action.yml")))

#: Every workflow, found rather than listed. A named pair let `nightly-build.yml`
#: arrive carrying unpinned actions and be checked by nothing.
WORKFLOWS = tuple(sorted((REPO_ROOT / ".github" / "workflows").glob("*.yml")))


def scope_outputs_written() -> set[str]:
    """The names the scope step writes to `$GITHUB_OUTPUT`.

    Some are written straight from `match` and some from a shell variable the
    lines above set, so the name is what is read rather than its right side.
    """
    return set(re.findall(r'echo\s+"(\w+)=', CI.read_text(encoding="utf-8")))


def scope_outputs_read() -> set[str]:
    """The names a later step branches on."""
    return set(re.findall(r"steps\.scope\.outputs\.(\w+)", CI.read_text(encoding="utf-8")))


def scripts_invoked() -> set[tuple[str, str]]:
    """Every npm script a tier runs, as `(manifest directory, script)`.

    A tier reaches a package's own script by changing directory first, so the
    manifest a name has to appear in is the one that `cd` names -- and the root
    when there is none.
    """
    found: set[tuple[str, str]] = set()
    for path in CALLERS:
        for where, script in re.findall(
            r"(?:cd (\S+) && )?npm run (?:--silent )?([\w:]+)",
            path.read_text(encoding="utf-8"),
        ):
            found.add((where or ".", script))
    return found


def custom_managers() -> list[tuple[str, str]]:
    """Each custom manager as `(managerFilePatterns, matchStrings)`, unescaped.

    Both arrive as JSON5 single-quoted strings, so a backslash is doubled in the
    file and single by the time Renovate compiles it.
    """
    text = POLICY.read_text(encoding="utf-8")

    # **Only inside `customManagers`.** `managerFilePatterns` is also a key on a
    # built-in manager's own config block, and a pattern spanning the whole file
    # pairs that block's paths with the next `matchStrings` below it -- a
    # manager this file would then assert about that does not exist.
    start = text.index("customManagers: [")
    depth, end = 0, None
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    assert end is not None, "customManagers is not a closed array"

    # **`\s*` after the bracket, because a manager with more than one pattern
    # writes them over several lines.** Without it the second custom manager
    # added here was invisible to every assertion below, including the one
    # counting them -- which went on passing because it was still counting one.
    blocks = re.findall(
        r"managerFilePatterns:\s*\[\s*'([^']+)'.*?matchStrings:\s*\[\s*'([^']+)'",
        text[start:end],
        re.S,
    )
    return [(f.replace("\\\\", "\\"), m.replace("\\\\", "\\")) for f, m in blocks]


def test_the_extractor_still_sees_the_pipeline() -> None:
    """A rename or a reshape that leaves every assertion below vacuously true."""
    assert CI.exists() and POLICY.exists() and VERIFY.exists()
    assert len(scope_outputs_written()) >= 5, "the scope step no longer writes what it did"
    assert len(scope_outputs_read()) >= 5, "no step branches on the scope any more"
    assert len(scripts_invoked()) >= 8, "the tiers no longer invoke npm scripts"
    assert len(custom_managers()) >= 1, "the custom managers are no longer readable"


def test_every_scope_output_read_is_one_the_scope_step_writes() -> None:
    """The `deps-lint` shape: a step branching on a name nothing sets.

    An unset output is the empty string, never `'true'`, so the step it guards
    silently never runs and the job is green for having skipped it.
    """
    dangling = scope_outputs_read() - scope_outputs_written()
    assert not dangling, (
        "these are read but never written, so the steps they guard never run: "
        f"{sorted(dangling)}"
    )


def test_every_scope_name_a_job_branches_on_is_declared_as_a_job_output() -> None:
    """The same shape one level up, and `scope_outputs_read` cannot see it.

    A name reaches a downstream `if:` through three places: the step writes it
    to `$GITHUB_OUTPUT`, the job republishes it under `outputs:`, and the job
    reads it as `needs.scope.outputs.<name>`. Miss the middle one and the
    expression is the empty string rather than an error, so the job it guards
    never runs and the gate passes it as skipped.

    Found by `actionlint`, which is not installed on every machine and skips
    there -- so this holds without it.
    """
    text = CI.read_text(encoding="utf-8")
    published = set(re.findall(r"^\s+(\w+):\s*\$\{\{\s*steps\.scope\.outputs\.\w+",
                               text, flags=re.MULTILINE))
    branched = set(re.findall(r"needs\.scope\.outputs\.(\w+)", text))
    missing = branched - published
    assert not missing, (
        "a job branches on a scope name the scope job never publishes under "
        f"`outputs:`, so the expression is empty and the job never runs: "
        f"{sorted(missing)}"
    )


def test_every_npm_script_a_tier_runs_exists() -> None:
    """A tier invoking a script that was renamed or never added."""
    missing = []
    for where, script in sorted(scripts_invoked()):
        manifest = REPO_ROOT / where / "package.json"
        if not manifest.exists():
            missing.append(f"{where}/package.json does not exist, for {script}")
            continue
        if script not in json.loads(manifest.read_text(encoding="utf-8")).get("scripts", {}):
            missing.append(f"{script} is not in {where}/package.json")
    assert not missing, "a tier runs a script nothing declares:\n  " + "\n  ".join(missing)


def test_every_custom_manager_matches_something_in_the_tree() -> None:
    """A manager whose pattern matches nothing reports no dependencies, not an error.

    This is the failure that hides best: Renovate finishes clean, the dashboard
    lists everything it did find, and the pins the manager was written for stay
    invisible exactly as they were before it existed.
    """
    assert custom_managers(), "no custom manager was read"
    for file_pattern, match_string in custom_managers():
        # `managerFilePatterns` is a slash-delimited regex, not a glob.
        expr = re.compile(file_pattern.strip("/"))
        targets = [
            p
            for p in REPO_ROOT.rglob("*")
            if p.is_file() and expr.search(p.relative_to(REPO_ROOT).as_posix())
        ]
        assert targets, f"no file matches managerFilePatterns {file_pattern!r}"

        # Renovate compiles with re2, which spells a named group the way Python
        # does not; the group names are irrelevant to whether it matches.
        #
        # **Per file, not across them.** One pattern serves several files, and a
        # total counted over all of them lets a file with six matches hide a
        # file with none -- which is the manager quietly not reading half of
        # what it names.
        pattern = re.compile(match_string.replace("(?<", "(?P<"))
        for target in targets:
            hits = len(pattern.findall(target.read_text(encoding="utf-8")))
            assert hits, (
                f"{target.relative_to(REPO_ROOT)} is named by managerFilePatterns "
                f"{file_pattern!r} and matches none of {match_string!r}"
            )


def test_the_configured_manager_paths_name_files_that_exist() -> None:
    """A built-in manager pointed at a path that matches nothing.

    Overriding `managerFilePatterns` replaces a manager's defaults rather than
    adding to them, so a typo does not fall back -- the manager reads no file,
    reports no dependency, and the run is clean for having looked nowhere. That
    is the same silence as a custom manager matching nothing, one layer up.
    """
    text = POLICY.read_text(encoding="utf-8")

    # Every `managerFilePatterns` outside the `customManagers` array, which the
    # test above owns.
    start = text.index("customManagers: [")
    outside = text[:start]

    patterns = re.findall(r"managerFilePatterns:\s*\['([^']+)'\]", outside)
    assert patterns, "no built-in manager is pointed at a path"

    for raw in patterns:
        expr = re.compile(raw.replace("\\\\", "\\").strip("/"))
        hits = [
            p
            for p in REPO_ROOT.rglob("*")
            if p.is_file() and expr.search(p.relative_to(REPO_ROOT).as_posix())
        ]
        assert hits, f"managerFilePatterns {raw!r} matches no file in the tree"


@pytest.mark.parametrize("path", [*WORKFLOWS, *LOCAL_ACTIONS], ids=lambda p: p.name)
def test_every_action_is_pinned_to_a_commit(path: Path) -> None:
    """A tag is repointable by whoever can write to the repository.

    That is how `tj-actions/changed-files` distributed a secret-scraping commit
    in March 2025: the tags were moved onto it, and every workflow naming one
    picked it up on its next run.

    A `./`-relative reference is exempt and the file it names is scanned
    instead: it resolves to this tree at the commit under test, so there is no
    tag to move -- but the third-party actions it wraps are as repointable as
    any other, and moving them out of a workflow is what would take them out of
    this assertion's sight.
    """
    unpinned = [
        ref
        for ref in re.findall(r"uses:\s*(\S+)", path.read_text(encoding="utf-8"))
        if not ref.startswith("./") and not re.fullmatch(r"[^@]+@[0-9a-f]{40}", ref)
    ]
    assert not unpinned, f"not pinned to a commit in {path.name}: {unpinned}"


def test_every_local_action_a_workflow_uses_exists() -> None:
    """A `./`-relative reference to a directory holding no action file.

    The exemption above is only safe while the file it defers to is really
    there: a renamed directory leaves a workflow naming nothing, and the
    pinning assertion would pass it for the same reason it passes a real one.
    """
    referenced = {
        ref
        for path in (CI,)
        for ref in re.findall(r"uses:\s*(\./\S+)", path.read_text(encoding="utf-8"))
    }
    missing = [ref for ref in referenced if not (REPO_ROOT / ref[2:] / "action.yml").exists()]
    assert not missing, f"a workflow uses a local action that does not exist: {sorted(missing)}"
    assert referenced, "no workflow uses a local action; the exemption above is now dead"


#: The Python trees a runner installs `requirements-dev.txt` for and then runs.
PY_TREES = (
    REPO_ROOT / "tests",
    REPO_ROOT / ".claude" / "tests",
    REPO_ROOT / "scripts",
)

#: Trees holding repository modules a suite reaches through `sys.path`, which
#: are resolved without an install and so are never a manifest's business.
LOCAL_TREES = PY_TREES + (
    REPO_ROOT / ".claude" / "hooks",
    REPO_ROOT / ".claude" / "scripts",
)

#: Distributions whose import name is not their name lowercased.
IMPORT_NAMES = {"pyyaml": "yaml"}


def declared_modules() -> set[str]:
    """Import names `requirements-dev.txt` makes available, from its pins."""
    text = (REPO_ROOT / "requirements-dev.txt").read_text()
    names = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        dist = re.split(r"[<>=!~\[;\s]", line, maxsplit=1)[0].lower()
        names.add(IMPORT_NAMES.get(dist, dist.replace("-", "_")))
    return names


def local_modules() -> set[str]:
    """Module names the repository's own trees resolve without an install."""
    names = {t.name for t in LOCAL_TREES}
    for tree in LOCAL_TREES:
        for path in tree.rglob("*.py"):
            names.add(path.stem)
            names.add(path.parent.name)
    return names


def imported_modules() -> dict[str, set[Path]]:
    """Top-level module each file imports, mapped to the files importing it.

    Parsed rather than matched: a line reading `from how it ended` inside a
    docstring is prose, and a regular expression counts it as an import.
    """
    found: dict[str, set[Path]] = {}
    for tree in PY_TREES:
        for path in tree.rglob("*.py"):
            parsed = ast.parse(path.read_text(), filename=str(path))
            for node in ast.walk(parsed):
                if isinstance(node, ast.Import):
                    roots = [a.name.split(".")[0] for a in node.names]
                elif isinstance(node, ast.ImportFrom):
                    if node.level or node.module is None:
                        continue
                    roots = [node.module.split(".")[0]]
                else:
                    continue
                for root in roots:
                    found.setdefault(root, set()).add(path)
    return found


def test_the_import_scan_still_sees_the_suites() -> None:
    """Holds the assertion below awake if the trees or the parse move."""
    found = imported_modules()
    assert len(found) > 20, f"only {len(found)} modules imported"
    assert "pytest" in found, "the scan found no `pytest` import, so it read nothing"
    assert declared_modules().issuperset({"pytest", "yaml"}), declared_modules()


def test_every_third_party_import_is_declared() -> None:
    """A suite importing what no manifest names is green here and red on a runner.

    `markdown2` reached the gate's first run as a **collection** error, which
    takes the whole tier rather than one test: it was installed in the
    developer's virtual environment and required by nothing, so every local run
    for as long as it existed proved only that the machine had it.
    """
    known = set(sys.stdlib_module_names).union(declared_modules(), local_modules())
    undeclared = {
        module: sorted(str(p.relative_to(REPO_ROOT)) for p in files)
        for module, files in imported_modules().items()
        if module not in known and not module.startswith("_")
    }
    assert not undeclared, (
        "imported but named in no manifest, so absent on a clean runner: "
        f"{undeclared}"
    )


def test_the_postgres_client_matches_the_server_it_talks_to() -> None:
    """One image, named twice: the service, and the client run against it.

    A service container has no roles, so `docker/db/roles.sql` is applied
    through a `psql` the runner is not documented to carry -- taken from the
    image the service is already running. That makes the pin appear twice, and
    Renovate moves the two independently: `services.postgres.image` is the
    `github-actions` manager's, the one inside `run:` is nobody's.
    """
    text = CI.read_text()
    pinned = set(re.findall(r"(postgres:\d[\w.-]*)", text))
    assert len(pinned) == 1, f"`ci.yml` names more than one Postgres image: {pinned}"
    assert text.count(pinned.pop()) > 1, "the client reference is gone, so this is vacuous"


#: The cheap tiers answer about the branch's own tree, so they run wherever it
#: is, a draft included. The expensive ones are held until it is offered.
CHEAP_TIER = ("lint", "build", "repository")
EXPENSIVE_TIER = (
    "server-suite",
    "client-suite",
    "client-screen",
    "devcontainer",
    "containers",
)


def ci_jobs() -> dict:
    """`ci.yml`'s jobs, parsed."""
    return yaml.safe_load(CI.read_text(encoding="utf-8"))["jobs"]


def job_condition(job: dict) -> str:
    """One job's `if`, whitespace folded, for matching a clause inside it."""
    return " ".join(str(job.get("if", "")).split())


def test_a_draft_runs_the_cheap_tier_and_nothing_else() -> None:
    """What stops a suite shard paying for a lint error, now that nothing waits.

    A branch cannot reach an expensive tier without having linted and
    typechecked on the way to being offered, so a red linter is refused before
    a suite is dispatched. Nothing else provides that: `needs` is the only
    thing that holds a job back, and no expensive tier names a cheap one.

    So the two halves have to move together. Gate `scope` on the draft, or let
    an expensive tier run on one, and the guarantee is gone while every job
    still reports green.
    """
    jobs = ci_jobs()
    for name in CHEAP_TIER + EXPENSIVE_TIER:
        assert name in jobs, f"{name} is no longer a job, so this test is vacuous"

    assert "if" not in jobs["scope"], (
        "`scope` is gated, so a draft resolves no tier and every `needs` "
        "below it skips -- which is the state this test exists to refuse"
    )

    for name in CHEAP_TIER:
        assert "draft" not in job_condition(jobs[name]), (
            f"{name} is held back from a draft, so a branch can be offered "
            "without it ever having run"
        )

    for name in EXPENSIVE_TIER:
        condition = job_condition(jobs[name])
        assert "draft == false" in condition, (
            f"{name} runs on a draft, which pays for a suite on a branch "
            "nobody has offered"
        )
        assert "merge_group" in condition, (
            f"{name} does not run in the merge group, which is the only tree "
            "whose verdict decides the merge"
        )


def test_the_expensive_tier_is_not_held_behind_the_cheap_one() -> None:
    """The barrier stated as its absence, because `needs` reads as harmless.

    `build` uploads no artefact and the suites download none; they run on
    separate runners, so naming one is a gate rather than a dependency. It
    costs the whole duration of the slowest cheap tier on every queue entry,
    and nothing about a green run says it is being paid.
    """
    jobs = ci_jobs()
    held = []
    for name in EXPENSIVE_TIER:
        needs = jobs[name].get("needs") or []
        needs = [needs] if isinstance(needs, str) else needs
        for cheap in CHEAP_TIER:
            if cheap in needs:
                held.append(f"{name} waits for {cheap}")
    assert not held, (
        "an expensive tier waits for a cheap one, so the longest job in the "
        "run starts last:\n  " + "\n  ".join(held)
    )


def test_the_gate_speaks_for_every_job() -> None:
    """A job absent from `gate` reports its failure to nothing that decides.

    `gate` is the one check `main` is meant to require, so a job it does not
    wait for is one whose red cannot reach the ruleset: green gate, red tier,
    merge allowed.
    """
    jobs = ci_jobs()
    needs = set(jobs["gate"].get("needs") or [])
    unwatched = set(jobs) - {"gate"} - needs
    assert not unwatched, f"these jobs cannot fail the gate: {sorted(unwatched)}"


def test_no_tier_runs_on_neither_event() -> None:
    """A tier the gate waits for that no event can start.

    The queue splits the work: a pull request proves the branch, a merge group
    proves the tree that ships. A tier gated on neither does not error, it
    skips -- and `gate` passes on `skipped`, so the suites would report success
    having run nothing.

    The direction it fails in has changed rather than gone: a `merge_group`
    trigger shipped here once when the event could never arrive, and only the missing checkbox in the ruleset UI gave it away.
    The event exists now, so the same silence is one condition away in the
    other direction.
    """
    ci = yaml.safe_load(CI.read_text(encoding="utf-8"))
    # YAML reads a bare `on:` key as the boolean True.
    triggers = ci.get(True) or ci.get("on") or {}
    names = set(triggers) if isinstance(triggers, dict) else set(triggers)
    assert {"pull_request", "merge_group"} <= names, (
        f"ci.yml triggers on {sorted(names)}; the split needs both events"
    )

    jobs = ci.get("jobs") or {}
    gated = set(jobs["gate"]["needs"])

    for name in gated:
        condition = str(jobs[name].get("if", ""))
        pr_only = "github.event_name == 'merge_group'" in condition
        mg_only = "github.event_name == 'pull_request'" in condition
        assert not (pr_only and mg_only), (
            f"{name} is gated on both event names at once, so it runs on neither"
        )

    # The expensive tiers are the reason the split exists: their answer is only
    # worth computing against the tree that ships.
    for name in ("server-suite", "client-suite", "devcontainer"):
        assert "github.event_name == 'merge_group'" in str(jobs[name].get("if", "")), (
            f"{name} no longer runs in the merge group, so nothing proves the "
            "merged tree before it lands"
        )

    # `github.event.pull_request` is null in a merge group and null compares
    # false, so a job reading one without checking the event skips in silence.
    for name, job in jobs.items():
        condition = str(job.get("if", ""))
        if "github.event.pull_request" in condition:
            assert "github.event_name" in condition, (
                f"{name} reads github.event.pull_request without checking the "
                "event first, so it skips silently in a merge group"
            )


def test_the_cheap_tiers_run_on_a_pull_request() -> None:
    """The half of the split that gives a branch an answer before it is offered.

    The queue takes the expensive tiers, which is the whole point of the split.
    Move the cheap ones there too and a pull request reports green having run
    nothing at all, with the first real verdict arriving only once the change
    is already in the queue -- which is the feedback loop the tiers exist to
    shorten, lengthened to its maximum.
    """
    jobs = ci_jobs()
    for name in ("lint", "build", "repository"):
        cond = str(jobs[name].get("if", ""))
        assert "merge_group" not in cond, (
            f"{name} is held back for the merge group, so a pull request gets "
            "no verdict from it"
        )


def test_every_renovate_annotation_has_a_manager_that_reads_it() -> None:
    """A `# renovate:` comment above a pin that nothing is configured to read.

    The convention is only a convention. Renovate attaches no meaning to the
    comment on its own -- a `customManagers` entry has to name the file before
    any of it is true. Annotate without one and the pin reads as tracked to
    everybody who opens the file, while drifting exactly as it did before.

    That is what `.devcontainer/Dockerfile` did: both `NPM_VERSION` and
    `PLAYWRIGHT_VERSION` carried the annotation, no manager named the file, and
    `PLAYWRIGHT_VERSION` went on diverging from the `@playwright/test` in
    `server/package.json` -- the drift the comment appeared to rule out.
    """
    # **Relative to the root, never the absolute path.** Written against the
    # absolute one this excluded every file whenever the suite ran from a
    # worktree, because the root itself sits under `.claude/worktrees` -- and a
    # test that sweeps nothing passes.
    def wanted(path: Path) -> bool:
        rel = path.relative_to(REPO_ROOT).as_posix()
        # `.claude/worktrees/` is another session's checkout, whose config is
        # its own. Matched relative to the root, so a run from inside a
        # worktree still sweeps its own tree -- the absolute path excluded
        # every file there, and a sweep of nothing passes.
        if rel.startswith((".git/", ".claude/worktrees/")) or "node_modules/" in rel:
            return False
        return path.suffix in {"", ".yml", ".yaml", ".toml", ".sh"}

    annotated = sorted(
        path
        for path in REPO_ROOT.rglob("*")
        if path.is_file() and wanted(path) and "# renovate:" in _read(path)
    )
    assert annotated, "no `# renovate:` annotation was found at all; this sweeps nothing"


    read_by = [re.compile(pattern.strip("/")) for pattern, _ in custom_managers()]
    unread = [
        str(path.relative_to(REPO_ROOT))
        for path in annotated
        if not any(expr.search(path.relative_to(REPO_ROOT).as_posix()) for expr in read_by)
    ]

    assert not unread, (
        "these carry a `# renovate:` annotation that no custom manager reads, so "
        f"the pin looks tracked and is not: {unread}"
    )


def _read(path: Path) -> str:
    """Text, or nothing when the file is not text at all."""
    try:
        return path.read_text(errors="ignore")
    except OSError:
        return ""


def test_the_scope_diffs_from_the_merge_base() -> None:
    """Two dots make a branch behind `main` scope in what `main` changed.

    `git diff A B` is the difference between two trees, so anything that landed
    on the base after this branch was cut appears in it -- inverted, but a path
    is a path and the scope step only counts names. A branch touching two files
    scoped in both suites and both builds because `main` had merged a lockfile
    bump in the meantime, which is most branches most of the time.

    `A...B` diffs from the merge base instead: what this branch changed, and
    nothing else. Measured on the branch that found it, eleven files became
    two.
    """
    step = next(
        s for s in ci_jobs()["scope"]["steps"] if s.get("id") == "scope"
    )
    run = step["run"]

    assert 'git diff --name-only "$BASE_SHA"..."$HEAD_SHA"' in run, (
        "the scope step no longer diffs from the merge base, so a branch behind "
        "`main` will scope in tiers it does not touch"
    )


def test_a_called_run_reaches_every_tier_the_gate_waits_for() -> None:
    """`nightly-build.yml` calls `ci.yml`, where `github.event_name` is `schedule`.

    So every condition reading `merge_group` is false in a called run: the
    expensive tiers skip, `gate` passes on `skipped`, and the nightly reports
    green having run none of the suites -- the same silence the `merge_group`
    trigger shipped once, arriving through a third event.
    """
    nightly = yaml.safe_load(
        (REPO_ROOT / ".github" / "workflows" / "nightly-build.yml").read_text(encoding="utf-8")
    )
    calls = [j for j in nightly["jobs"].values() if str(j.get("uses", "")).endswith("ci.yml")]
    assert calls, "nightly-build.yml no longer calls ci.yml, so this is vacuous"
    for job in calls:
        assert job.get("with", {}).get("all") is True, "the nightly calls ci.yml without `all`"

    jobs = ci_jobs()
    deaf = [
        name
        for name in jobs["gate"]["needs"]
        if "merge_group" in str(jobs[name].get("if", ""))
        and "inputs.all" not in str(jobs[name].get("if", ""))
    ]
    assert not deaf, (
        "these skip in a called run, so the nightly reports green without them: "
        f"{sorted(deaf)}"
    )


def test_the_server_tier_probes_both_services_before_judging_it() -> None:
    """Redis alone was probed, and the verdict needs Postgres too.

    The suite has two tiers: with no daemon `global-setup.ts` starts PGlite in
    process, where the write paths cannot pass because they need two concurrent
    transactions and there is one backend. Probing Redis alone cannot tell those
    failures from a defect, so the tier reported `FAILED` on a machine with no
    stack -- an environment gap read as a verdict.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert 'port_of pgPort' in text, "the server tier no longer reads the Postgres port"
    assert 'port_of redisPort' in text, "the server tier no longer reads the Redis port"
    server = text.split("# ---------------------------------------------------------------- server")[1]
    server = server.split("# -------------------------------------------------------------------")[0]
    assert 'reachable 127.0.0.1 "$PG_PORT"' in server
    assert 'reachable 127.0.0.1 "$REDIS_PORT"' in server


def test_no_tier_is_reported_as_both_skipped_and_run() -> None:
    """The database files were announced as skipped and run inside `server: suite`.

    One cause reported as two states, so a red tier read as an environment gap
    and an environment gap read as a red tier.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert "the database-backed files" not in text, (
        "a SKIPPED line announces files that `server: suite` runs anyway"
    )


def test_a_partial_tier_is_stated_rather_than_counted_as_a_pass() -> None:
    """The rule the script already applies to a skip, applied to a degraded run.

    A tier that ran and could not cover what it names is neither a pass nor a
    failure, and silence about it is the outcome this script exists to prevent.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert "PARTIAL=()" in text, "there is no partial state"
    assert 'PARTIAL+=(' in text, "nothing ever records a partial tier"
    assert '"${PARTIAL[@]:-}"' in text, "the summary never prints the partial tiers"


def test_the_fast_mode_runs_nothing_that_executes() -> None:
    """`--quick` skipped only the browser tier, so it built containers.

    A sweep nobody runs proves nothing, and the fast mode took twenty minutes
    because `test.sh` runs `pytest tests` unqualified and `tests/docker` builds
    images. The seam is that static analysis needs no database, no browser and
    no Docker.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert "MODE=quick" in text and "MODE=detailed" in text, "the three modes are gone"
    assert "behaviour()" in text and "expensive()" in text, "no predicate gates a tier"
    for tier in ("server: build", "client: suite"):
        line = next(one for one in text.splitlines() if f'"{tier}"' in one and "step " in one)
        assert line.lstrip().startswith("behaviour &&"), f"{tier} runs in the fast mode"


def test_the_container_files_are_only_in_the_expensive_mode() -> None:
    """`tests/docker` builds images, and every mode paid for it.

    `CLAUDE.md` names the everyday selection that excludes it; `test.sh` runs
    `pytest tests` unqualified, so the exclusion has to happen at the caller.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert "--ignore=tests/docker" in text, "the default sweep still builds containers"
    assert "./verify.sh --detailed runs it" in text, "nothing says where the tier went"


def test_the_expensive_mode_starts_what_its_question_needs() -> None:
    """Otherwise it asks the expensive question against the in-process engine.

    Starting them is the point: the write paths need two concurrent transactions,
    which one backend cannot give. What it starts, it says it left running.
    """
    text = VERIFY.read_text(encoding="utf-8")
    assert "--compose up -d --wait postgres redis" in text, "it starts no services"
    assert "--roles" in text and "db:push" in text, "a started service carries no schema"
    assert "STARTED_SERVICES" in text, "nothing reports the stack it left behind"


def test_the_openspec_commands_the_rules_prescribe_validate_something() -> None:
    """A flag change turns the gate into a no-op that still looks like a run.

    `validate --strict` alone prints usage and exits 1, and its item count is
    zero — the same shape a clean run has if nothing reads the total.
    """
    rules = (REPO_ROOT / ".claude" / "rules" / "git-workflow.md").read_text(encoding="utf-8")
    commands = re.findall(r"^(npx --no-install openspec validate .+)$", rules,
                          flags=re.MULTILINE)
    assert commands, "the rules prescribe no openspec validate command"

    # **Every line naming the CLI is held to the one form, and the absence is
    # the half a positive check cannot hold.** The rules prescribe two
    # commands, so a check that only asks whether *some* line is right passes
    # while its sibling reaches the registry. Matching every runner spelling
    # rather than one: `-y`, `npm exec`, `dlx`, `bunx` and a bare
    # `openspec@latest` all fetch, and `openspec` unscoped on npm belongs to
    # somebody else.
    runners = re.compile(r"\bnpx\b|\bnpm exec\b|\bdlx\b|\bbunx\b")
    stray = [
        line.strip()
        for line in rules.splitlines()
        if "openspec" in line and runners.search(line)
        and not line.strip().startswith("npx --no-install openspec ")
    ]
    assert not stray, (
        f"a line runs the CLI in a form that can reach the registry, rather "
        f"than `npx --no-install openspec`: {stray}"
    )
    # The binary is local, so each command takes about a second. The timeout
    # is a guard against a hang rather than a budget for a download.
    for command in commands:
        done = subprocess.run(command, shell=True, cwd=REPO_ROOT,
                              capture_output=True, text=True, timeout=120)
        total = re.search(r"Totals: (\d+) passed", done.stdout)
        assert total and int(total.group(1)) > 0, (
            f"`{command}` validated nothing:\n{done.stdout}{done.stderr}")
