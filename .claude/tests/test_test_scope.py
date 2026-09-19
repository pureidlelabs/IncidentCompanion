"""The router, against the tiers as they are.

One property per tier: **a change under a tree names that tree's command, and
names no other tree's.** That is the whole contract, and a selection naming
the wrong runner is the defect it exists to catch — pytest handed a `.spec.ts`
collects nothing and reports green.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / ".claude" / "scripts" / "test_scope.py"

spec = importlib.util.spec_from_file_location("test_scope", SCRIPT)
assert spec and spec.loader
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


def only(paths: list[str]) -> list[str]:
    """The commands a change selects, with the reasons dropped."""
    found, _ = scope.decide(paths)
    return [command for command, _ in found]


# One representative path per tier, and the command it must produce. A path
# here that stops existing is itself a finding, so they are real files.
TIERS = [
    ("server", ["server/src/openapi.ts"], "npm run check"),
    ("ui", ["ui/src/app/RouteError.tsx"], "npm test"),
    ("python", ["tests/docker/test_container_config.py"], "./test.sh"),
    ("agent", [".claude/tests/test_skills.py"], "pytest .claude/tests"),
    ("prose", ["openspec/constitution.md"], "lint:prose"),
    ("browser", ["server/e2e/picker.spec.ts"], "playwright"),
    ("stories", ["ui/src/components/ui/button.stories.tsx"], "visual:storybook"),
]


@pytest.mark.parametrize("label,paths,expected", TIERS, ids=[t[0] for t in TIERS])
def test_a_change_names_its_own_tier(label: str, paths: list[str], expected: str) -> None:
    assert any(expected in c for c in only(paths)), f"{label}: {only(paths)}"


@pytest.mark.parametrize("label,paths,_expected", TIERS, ids=[t[0] for t in TIERS])
def test_the_paths_these_tests_name_still_exist(label, paths, _expected) -> None:
    """A fixture naming a deleted file makes every assertion above vacuous."""
    for p in paths:
        assert (ROOT / p).exists(), f"{label}: {p} is gone; this test proves nothing"


def test_a_specification_change_selects_the_tier_that_reads_it() -> None:
    """`tests/docs` reads `openspec/`, and the ledger is not Python.

    A branch moving a ledger row usually edits `server/` too, which routed it
    here for the wrong reason; one that moves only a row was routed past the
    only check that holds the rows against the specifications they name. The
    rule this restores is the one the routing already states for the
    TypeScript trees: a tier whose tests read a tree is touched by a change to
    it. -> `tests/docs/test_scenario_ledger.py`
    """
    routed = only(["openspec/matrix/scenarios.md"])

    assert any("tests/docs" in one for one in routed), (
        f"a ledger-only change runs nothing that reads the ledger: {routed}"
    )


def test_the_corpus_routes_to_nothing() -> None:
    """`app/` is read, not run — so it owes no command at all.

    Selecting `app/tests` would name a suite that collects import errors and
    reports them as a failing run, which reads as coverage that is broken
    rather than coverage that was never there.
    """
    found, why = scope.decide(["app/storage.py", "app/tests/test_report.py"])
    assert found == []
    assert "retired" in why


def test_a_corpus_change_beside_a_live_one_still_names_the_live_tier() -> None:
    assert any("npm run check" in c for c in only(["app/storage.py", "server/src/main.ts"]))


def test_nothing_changed_is_not_a_pass() -> None:
    found, why = scope.decide([])
    assert found == []
    assert "nothing changed" in why


def test_a_path_no_tier_claims_widens_rather_than_going_quiet() -> None:
    """**The cheap default is the one that ships a regression.**

    A map cannot cover a directory nobody has created yet, so the question is
    what the router says about one. Answering "no suite" for an unrecognised
    source path is the failure that reads as permission: a new top-level tier,
    or a rename this file has not been told about, would land with nothing run
    and the router agreeing that nothing was owed.

    Asserted on a path deliberately unlike any tier's, so it fails the day a
    glob stops matching rather than the day somebody notices.
    """
    found, why = scope.decide(["some/new/tier/thing.ts"])
    assert found, f"an unclaimed source path routed to no suite at all: {why}"


def test_an_unclaimed_path_still_widens_when_a_claimed_one_is_beside_it() -> None:
    """**The rename case, which is the one this was written for.**

    `changed()` passes `--no-renames` so both sides of a move appear. A file
    leaving `server/src` for a new tier therefore arrives as two paths -- the
    old one matching the server, the new one matching nothing -- and a widen
    that only fires when *nothing* matched is silenced by its own motivating
    case.

    A diff almost never holds one path, so this is the shape that decides
    whether the rule does anything at all.
    """
    found, _ = scope.decide(["server/src/x.ts", "worker/x.ts"])
    commands = {command for command, _ in found}
    assert any("ui" in command for command in commands), (
        f"an unclaimed path was swallowed by a claimed one: {sorted(commands)}")


def test_the_retired_corpus_does_not_widen_because_something_else_changed() -> None:
    """**`app/**.py` is source by suffix, and must not be treated as unclaimed.**

    The corpus rule fires only when *every* path is under `app/`. One unrelated
    file alongside it flips that off, and the corpus files then fall into the
    widen -- so reading the corpus and touching one asset runs every suite.
    """
    found, why = scope.decide(["app/models.py", "some/new/tier/logo.png"])
    assert found == [], f"the corpus widened the run: {why}"


@pytest.mark.parametrize("path", ["compose.yaml", "docker/app/Dockerfile",
                                  "docker/nginx/nginx.conf", "server/package.json"])
def test_a_stack_declaration_owes_the_tier_that_asserts_on_it(path: str) -> None:
    """A stack declaration is claimed, and by the tier that reads it.

    Root `tests/` reads these directly -- `test_container_config.py` parses
    `compose.yaml`, `test_stack_images.py` the Dockerfiles -- so editing one
    and being told nothing is owed is the same silence the widen exists to
    prevent. Widening to *every* suite would be the opposite error: something
    does test them, and it is one command.
    """
    found, why = scope.decide([path])
    assert any("test.sh" in command for command, _ in found), (
        f"{path} is asserted on by root tests/ and routed to: {why}")


def test_a_fixture_or_asset_is_still_allowed_to_owe_nothing() -> None:
    """The other half, or the rule above becomes "always run everything".

    A binary, a lockfile or a generated bundle has no suite and saying so is
    correct -- what must not happen is *source* falling into that answer.
    """
    found, _ = scope.decide(["some/new/tier/logo.png"])
    assert found == []


def test_the_browser_tier_is_never_handed_to_pytest() -> None:
    for command in only(["server/e2e/picker.spec.ts"]):
        if "playwright" in command:
            assert "pytest" not in command
            return
    pytest.fail(f"no playwright command: {only(['server/e2e/picker.spec.ts'])}")


def test_a_server_change_owes_the_lint_that_holds_its_rules() -> None:
    """**A server change owes the server's own lint, or nothing loads it.**
    `npm run check` is typecheck plus vitest; the root's `lint:ascii` passes an
    explicit `--config`, which turns off flat-config discovery, so `server/`'s
    own config and every plugin it adopts are read by nothing unless this
    command is named.

    Named beside the suite the way the UI tier already names its own.
    """
    got = only(["server/src/openapi.ts"])
    assert any("npm run lint" in c for c in got), got


def test_a_ui_source_change_owes_the_browser_tier_as_well() -> None:
    """A position is not visible to the React suite; jsdom gives every element
    a zero box."""
    got = only(["ui/src/features/picker/panes/AccountsPane.tsx"])
    assert any("npm test" in c for c in got)
    assert any("playwright" in c for c in got)


def test_a_rule_edit_re_lints_every_page() -> None:
    assert any("lint:prose" in c for c in only([".vale/styles/Shared/Filler.yml"]))


@pytest.mark.parametrize("path", ["ui/src/App.tsx", "server/src/main.ts"])
def test_a_source_change_owes_the_checks_that_sweep_that_tree(path: str) -> None:
    """**The repository checks read the TypeScript trees**, so a change to one
    owes them while touching no Python at all -- `test_docstring_claims` walks
    `ui/src/` and `test_history_is_not_narrated` names `server/src` among its
    trees.

    A branch green in the three tiers the router used to print went red in a
    fourth it never named. -> #413
    """
    got = only([path])
    assert any("pytest" in c for c in got), got


def test_no_printed_command_is_one_a_worktree_cannot_run() -> None:
    """**`python3` is not the interpreter the suites need.**

    A worktree has no `.venv`, and `CLAUDE.md` records what the bare
    invocation answers there: `No module named pytest`. Worktrees are where
    the rules send parallel work, and this script is what an agent reads to
    decide what to run -- so a command it prints has to be one that runs
    where it is read. `scripts/venv_python.sh` is the answer `verify.sh` and
    `test.sh` already use. -> #654
    """
    # **No `tests/` path here.** One sets `whole_python_tier`, whose `elif`
    # then suppresses the repo-and-contract command -- so a list carrying one
    # checks the agent line alone, and a half-fix leaving the other on
    # `python3` passes. #654 named both lines.
    printed = only([".claude/hooks/some_hook.py", "ui/src/App.tsx", "server/src/main.ts"])
    handed_to_pytest = [c for c in printed if "-m pytest" in c]

    assert len(handed_to_pytest) >= 2, handed_to_pytest
    # Positive rather than a ban on one spelling: `python -m pytest` and a
    # bare interpreter mid-string are the same defect, and a site added later
    # is covered without this test being edited.
    assert all(c.startswith(scope.PYTEST) for c in handed_to_pytest), handed_to_pytest


@pytest.mark.parametrize(
    "path",
    [
        "ui/src/components/blocks/report-layouts.ts",
        "server/src/report/block-kinds.ts",
    ],
)
def test_a_source_change_owes_the_contract_tier_that_reads_it_by_path(path: str) -> None:
    """**`tests/contract` reads source across both workspaces**, because
    neither suite can import the other -- so a change to either owes it, the
    same way the repository checks are owed for sweeping those trees.

    `test_heading_labels_agree` opens the client's layouts by path, and three
    of the five contract modules read `server/src` -- so both workspaces are
    asserted, not the one the issue happened to name. Following this script,
    four contract tests went red in CI on a branch whose local tiers were all
    green. -> #677
    """
    got = only([path])
    assert any("tests/contract" in c for c in got), got


def test_a_source_change_is_not_told_to_run_the_whole_python_tier() -> None:
    """The sweep over source, not the tier that builds containers.

    `./test.sh` ends in `pytest tests`, which raises the app tier; what a
    source change owes is the half that reads source.
    """
    got = only(["ui/src/App.tsx"])
    assert not any("test.sh" in c for c in got), got


def test_a_python_change_is_told_once_rather_than_twice() -> None:
    """The whole tier already contains the narrow half, so naming both is a
    reader running the same checks twice."""
    got = only(["tests/repo/test_source_scan.py", "ui/src/App.tsx"])
    assert any("test.sh" in c for c in got), got
    assert not any(c.startswith(f"{scope.PYTEST} tests/repo") for c in got), got


def test_a_docstring_edit_in_the_server_does_not_summon_the_browser() -> None:
    """The narrow half of the browser rule: `server/src` is not a position."""
    got = only(["server/src/openapi.ts"])
    assert not any("playwright" in c for c in got), got


@pytest.mark.parametrize("ref", ["no-such-ref-anywhere", "app/models.py"])
def test_a_non_ref_argument_exits_loudly(ref: str) -> None:
    """A path where a ref belongs must not read as "nothing changed".

    `git diff --name-only <path>` is valid and answers with the paths that
    differ *in that file* — usually none — so the tool would print "run:
    nothing" for a typo.
    """
    done = subprocess.run([sys.executable, str(SCRIPT), ref],
                          cwd=str(ROOT), capture_output=True, text=True)
    assert done.returncode == 2, done.stdout
    assert "is not a ref" in done.stderr


def test_landing_reads_the_branch_and_widens_nothing() -> None:
    """A `.claude`-only branch owes the agent guards, not every suite."""
    done = subprocess.run([sys.executable, str(SCRIPT), "--landing", "HEAD~1..HEAD"],
                          cwd=str(ROOT), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "landing --" in done.stdout


def test_every_command_names_a_runner_that_exists() -> None:
    """A command whose entry point is gone is the failure this file is about.

    Checked by spelling rather than by running them: the point is that the
    router cannot name `pytest tests/` after `tests/` moves, or `npm run check`
    after the script is renamed.
    """
    import json

    server_scripts = json.loads((ROOT / "server" / "package.json").read_text())["scripts"]
    ui_scripts = json.loads((ROOT / "ui" / "package.json").read_text())["scripts"]
    root_scripts = json.loads((ROOT / "package.json").read_text())["scripts"]

    assert "check" in server_scripts and "lint" in server_scripts
    assert "test" in ui_scripts and "lint" in ui_scripts
    assert "lint:prose" in root_scripts
    assert (ROOT / "test.sh").exists()
    assert (ROOT / ".claude" / "tests").is_dir()
    assert (ROOT / "server" / "e2e" / "playwright.config.ts").exists()


#: **A landing gate has to say what will not run.** Much of the server tier is
#: `describe.skipIf(!bootable())` and `bootable()` is false with no Redis --
#: the authorisation model among it -- so `npm run check` reports a pass on a
#: machine with no stack and names none of what it skipped. The failures the
#: embedded engine produces for its own reasons are the noise that hides
#: them.
#:
#: Both probes are injected here because a checker that can only observe the
#: machine it runs on is the shape this whole guard exists to catch: with the
#: real probes these cases would assert whatever the developer happens to have
#: running.
def test_it_says_what_a_missing_stack_will_skip() -> None:
    gap = scope.stackless(port_of=lambda: 56379, reachable=lambda _port: False)
    assert gap is not None
    assert "56379" in gap, "the reader cannot check a port the message does not name"
    assert "silence" in gap


def test_it_says_nothing_when_the_stack_is_up() -> None:
    assert scope.stackless(port_of=lambda: 56379, reachable=lambda _port: True) is None


#: A port that cannot be derived is not the same as a stack that is down, and
#: reporting it as one would tell a developer to start something they already
#: have running. `verify.sh` makes the same distinction.
def test_no_port_is_reported_as_unknown_rather_than_as_absent() -> None:
    gap = scope.stackless(port_of=lambda: None, reachable=lambda _port: False)
    assert gap is not None and "unknown" in gap


#: Three things have to agree for the trigger to fire: the script name in
#: `server/package.json`, the command in `commands()`, and this substring.
#: `test_every_command_names_a_runner_that_exists` holds the first against the
#: second; these hold the second against the third.
def test_the_landing_says_what_will_not_run(monkeypatch, capsys) -> None:
    monkeypatch.setattr(scope, "stackless", lambda: "SENTINEL: the stack is down")
    monkeypatch.setattr(scope, "changed", lambda _base: ["server/src/report/word.ts"])
    monkeypatch.setattr(sys, "argv", ["test_scope.py"])
    scope.main()
    assert "SENTINEL: the stack is down" in capsys.readouterr().out


def test_it_stays_quiet_when_the_server_tier_is_not_owed(monkeypatch, capsys) -> None:
    monkeypatch.setattr(scope, "stackless", lambda: "SENTINEL: the stack is down")
    monkeypatch.setattr(scope, "changed", lambda _base: [".claude/scripts/x.py"])
    monkeypatch.setattr(sys, "argv", ["test_scope.py"])
    scope.main()
    out = capsys.readouterr().out
    assert "SENTINEL" not in out and "pytest .claude/tests" in out


def test_a_story_owes_the_probe_that_can_see_a_colour() -> None:
    """The probe is the only tier that measures contrast, hit area, overlap and
    clipping; every other tier reads source or a zero-box DOM. A story added
    outside `components/` or `screens/` would otherwise owe nothing that can
    see what it draws.
    """
    commands = only(["ui/src/lib/motion.stories.tsx"])
    assert any("visual:storybook" in c for c in commands), commands


def test_the_probe_is_not_folded_into_the_browser_tier() -> None:
    """
    Two commands, because they have two preconditions -- the browser tier needs
    a built `ui/dist` and a served stack, and the probe needs a Storybook. One
    command carrying both means the half that cannot run is indistinguishable
    from the half that found nothing.
    """
    commands = only(["ui/src/components/ui/button.tsx"])
    browser = [c for c in commands if "playwright test --config" in c]
    probe = [c for c in commands if "visual:storybook" in c]
    assert browser and probe, commands
    assert browser != probe


def test_the_probe_says_its_exit_code_carries_no_verdict() -> None:
    """The reason beside the Storybook probe has to say that a pass is not a
    clean catalogue.

    `storybook.spec.ts` asserts that every story rendered and that the sweep
    finished; the geometry findings are printed and asserted on by nothing, so
    the command exits 0 with any number of them outstanding. The reason string
    is the only place a reader meets that.
    """
    found, _ = scope.decide(["ui/src/components/ui/button.stories.tsx"])
    why = " ".join(r for c, r in found if "visual:storybook" in c)
    assert why, found
    assert "exits 0" in why, why


def test_a_component_change_names_the_kit_tier_as_well_as_the_walk() -> None:
    """Both Storybook tiers, because they answer different questions.

    The walk probes every story for what `probe.js` can measure; the kit specs
    beside it assert component behaviour -- a ring that is not clipped, a
    sticky head, a row handing over its actions. They ran together only because
    the walk's config selected them by accident, and nothing else prescribes
    them. -> #885
    """
    commands = only(["ui/src/components/ui/button.tsx"])
    walk = [one for one in commands if "visual:storybook" in one]
    kit = [one for one in commands if "e2e:kit" in one]
    assert walk, commands
    assert kit, (
        "a component change prescribes the walk but not the kit tier, which is the "
        f"only other thing that runs the *.storybook.spec.ts checks locally: {commands}"
    )


def _pushed_branch(root: Path) -> None:
    """A repository shaped like a branch that has been pushed.

    `origin/HEAD` names the trunk, the branch carries one commit past it, and
    the branch's upstream is its own remote copy at the same commit -- which is
    what `git push -u` leaves behind and what made the range empty.
    """
    run = lambda *args: subprocess.run(args, cwd=str(root), check=True, capture_output=True)
    run("git", "init", "-q", "-b", "main")
    run("git", "config", "user.email", "a@b.c")
    run("git", "config", "user.name", "A")
    (root / "README.md").write_text("base\n", encoding="utf-8")
    run("git", "add", "README.md")
    run("git", "commit", "-qm", "base")
    trunk = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(root),
                           capture_output=True, text=True, check=True).stdout.strip()
    run("git", "update-ref", "refs/remotes/origin/main", trunk)
    run("git", "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")

    run("git", "checkout", "-qb", "feature/a-thing")
    (root / "server").mkdir()
    (root / "server" / "src").mkdir()
    (root / "server" / "src" / "a.ts").write_text("export const a = 1\n", encoding="utf-8")
    run("git", "add", "server/src/a.ts")
    run("git", "commit", "-qm", "a server change")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(root),
                          capture_output=True, text=True, check=True).stdout.strip()
    # `git push -u` leaves the upstream at the branch's own remote copy. Set
    # through config rather than `--set-upstream-to`, which wants a remote with
    # a URL behind it.
    run("git", "update-ref", "refs/remotes/origin/feature/a-thing", head)
    run("git", "remote", "add", "origin", str(root))
    run("git", "config", "branch.feature/a-thing.remote", "origin")
    run("git", "config", "branch.feature/a-thing.merge", "refs/heads/feature/a-thing")


def test_a_landing_on_a_pushed_branch_still_names_its_tiers(tmp_path: Path) -> None:
    """The bare form, which is the one `CLAUDE.md` prescribes.

    A pushed branch's `@{upstream}` is its own remote copy, so a range against
    it is empty and every tier is skipped -- silently, and in the direction
    that lets a branch land unrun.
    """
    _pushed_branch(tmp_path)
    done = subprocess.run([sys.executable, str(SCRIPT), "--landing"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "run: nothing" not in done.stdout, (
        "a pushed branch's landing scope is empty, so the tool answers that a branch "
        f"with a server change owes no tier:\n{done.stdout}"
    )
    assert "server" in done.stdout, done.stdout


def test_a_landing_ignores_what_the_trunk_did_after_the_branch_left(tmp_path: Path) -> None:
    """The scope is the branch's own work, not everything the trunk gained.

    `git diff a..HEAD` compares two commits, so a trunk that moved while the
    branch was open reports its later files as this branch's -- which widens
    the scope with tiers the diff never touched, and reads as a landing owing
    a suite it has no reason to run.
    """
    _pushed_branch(tmp_path)
    run = lambda *args: subprocess.run(args, cwd=str(tmp_path), check=True, capture_output=True)
    # The trunk gains a client file after the branch forked from it.
    run("git", "checkout", "-q", "main")
    (tmp_path / "ui").mkdir()
    (tmp_path / "ui" / "src").mkdir()
    (tmp_path / "ui" / "src" / "b.tsx").write_text("export const b = 1\n", encoding="utf-8")
    run("git", "add", "ui/src/b.tsx")
    run("git", "commit", "-qm", "a client change on the trunk")
    moved = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(tmp_path),
                           capture_output=True, text=True, check=True).stdout.strip()
    run("git", "update-ref", "refs/remotes/origin/main", moved)
    run("git", "checkout", "-q", "feature/a-thing")

    done = subprocess.run([sys.executable, str(SCRIPT), "--landing"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "ui/src/b.tsx" not in done.stdout, (
        "the trunk's own later file is counted as this branch's change:\n" + done.stdout
    )
    assert "server/src/a.ts" in done.stdout, done.stdout


def test_a_landing_reads_origin_head_where_there_is_no_origin_main(tmp_path: Path) -> None:
    """The first entry of the chain, pinned where nothing else can answer.

    A fixture carrying both refs cannot pin either: the literal `origin/main`
    the chain falls back to resolves the same commit, so emptying the tuple
    outright leaves such a test green -- measured. Here the trunk is called
    something else, so only reading `origin/HEAD` answers.
    """
    _pushed_branch(tmp_path)
    run = lambda *args: subprocess.run(args, cwd=str(tmp_path), check=True, capture_output=True)
    trunk = subprocess.run(["git", "rev-parse", "refs/remotes/origin/main"], cwd=str(tmp_path),
                           capture_output=True, text=True, check=True).stdout.strip()
    run("git", "update-ref", "refs/remotes/origin/trunk", trunk)
    run("git", "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
    run("git", "update-ref", "--no-deref", "-d", "refs/remotes/origin/main")

    done = subprocess.run([sys.executable, str(SCRIPT), "--landing"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "server/src/a.ts" in done.stdout, (
        "the chain did not read `origin/HEAD`, so a repository whose trunk is not "
        f"called main found no base:\n{done.stdout}{done.stderr}"
    )


def test_a_landing_falls_back_when_origin_head_is_absent(tmp_path: Path) -> None:
    """`origin/HEAD` is written by `git remote set-head`, and a clone may not have it."""
    _pushed_branch(tmp_path)
    # `symbolic-ref --delete`, not `update-ref -d`: the latter follows the
    # symref and deletes `refs/remotes/origin/main` with it, which is a
    # different fixture from the one this test is about.
    subprocess.run(["git", "symbolic-ref", "--delete", "refs/remotes/origin/HEAD"],
                   cwd=str(tmp_path), check=True, capture_output=True)

    done = subprocess.run([sys.executable, str(SCRIPT), "--landing"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "server/src/a.ts" in done.stdout, (
        "with no `origin/HEAD` the landing found no base and named no tier:\n" + done.stdout
    )


def test_a_ref_given_positionally_ignores_what_the_trunk_did_after(tmp_path: Path) -> None:
    """`test_scope.py main` is the form `skills/land/SKILL.md` prints.

    It carries the same defect as the landing form did: `git diff <ref>`
    compares the ref as it stands now, so a trunk that moved while the branch
    was open reports its files as this branch's.
    """
    _pushed_branch(tmp_path)
    run = lambda *args: subprocess.run(args, cwd=str(tmp_path), check=True, capture_output=True)
    run("git", "checkout", "-q", "main")
    (tmp_path / "ui").mkdir()
    (tmp_path / "ui" / "src").mkdir()
    (tmp_path / "ui" / "src" / "b.tsx").write_text("export const b = 1\n", encoding="utf-8")
    run("git", "add", "ui/src/b.tsx")
    run("git", "commit", "-qm", "a client change on the trunk")
    run("git", "checkout", "-q", "feature/a-thing")

    done = subprocess.run([sys.executable, str(SCRIPT), "main"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    assert "ui/src/b.tsx" not in done.stdout, (
        "the trunk's own later file is counted as this branch's change:\n" + done.stdout
    )
    assert "server/src/a.ts" in done.stdout, done.stdout


def test_a_landing_with_no_trunk_to_land_on_says_so(tmp_path: Path) -> None:
    """A repository with no `origin` answers, rather than handing over git's error.

    The range is built from a ref that is not there, so the failure surfaced
    inside `git diff` as a traceback naming git and not this file.
    """
    run = lambda *args: subprocess.run(args, cwd=str(tmp_path), check=True, capture_output=True)
    run("git", "init", "-q", "-b", "main")
    run("git", "config", "user.email", "a@b.c")
    run("git", "config", "user.name", "A")
    (tmp_path / "README.md").write_text("base\n", encoding="utf-8")
    run("git", "add", "README.md")
    run("git", "commit", "-qm", "base")

    done = subprocess.run([sys.executable, str(SCRIPT), "--landing"],
                          cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 2, f"rc={done.returncode}\n{done.stdout}{done.stderr}"
    assert "no branch to land on" in done.stderr, done.stderr
    assert "Traceback" not in done.stderr, done.stderr
