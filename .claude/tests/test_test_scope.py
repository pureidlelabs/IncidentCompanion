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
    widen -- so reading the corpus plus touching a screenshot ran every suite.
    """
    found, why = scope.decide(["app/models.py", "some/new/tier/logo.png"])
    assert found == [], f"the corpus widened the run: {why}"


@pytest.mark.parametrize("path", ["compose.yaml", "docker/app/Dockerfile",
                                  "docker/nginx/nginx.conf", "server/package.json"])
def test_a_stack_declaration_owes_the_tier_that_asserts_on_it(path: str) -> None:
    """**Claimed, not unclaimed**, and answered by neither branch before this.

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
    """Playwright, in the server package — not a pytest selection.

    A `.spec.ts` passed to pytest collects nothing and exits 0, which is the
    mistake a Python-under-pytest habit makes available.
    """
    for command in only(["server/e2e/picker.spec.ts"]):
        if "playwright" in command:
            assert "pytest" not in command
            return
    pytest.fail(f"no playwright command: {only(['server/e2e/picker.spec.ts'])}")


def test_a_server_change_owes_the_lint_that_holds_its_rules() -> None:
    """**The four plugins were adopted and nothing ran them.** `npm run check`
    is typecheck plus vitest; the root's `lint:ascii` passes an explicit
    `--config`, which turns off flat-config discovery, so `server/`'s own
    config was loaded by nothing. It reported 363 problems the day it was first
    run -- including the `regexp` rule adopted to hold a security fix.

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


#: **The landing gate said nothing about the tests that will not run.**
#: 110 of the server tier's cases are `describe.skipIf(!bootable())` and
#: `bootable()` is false with no Redis -- among them the whole authorisation
#: model -- so `npm run check` reports a pass on a machine with no stack and
#: names none of them. Measured 2026-08-19 by running the tier twice, stack up
#: and stack down, and diffing the executed cases: 110 skipped in silence and
#: 37 failed for the embedded engine's own reasons, which is the noise that
#: hides them.
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


#: **`stackless()` was tested and its caller was not**, which is the same shape
#: the guard exists to catch: the whole feature could be deleted from `main()`
#: and all three cases above stayed green. Measured -- renaming the trigger's
#: substring, `if False and any(...)`, and replacing the `print` with `pass`
#: each left 35 passed.
#:
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
    """
    A `.stories.tsx` anywhere selects the Storybook probe, not only one under
    the directories `STORY_SURFACE` names.

    The probe is the only tier that measures contrast, hit area, overlap and
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
    """
    The reason beside the Storybook probe has to say that a pass is not a clean
    catalogue.

    `storybook.spec.ts` asserts that every story rendered and that the sweep
    finished; the geometry findings are printed and asserted on by nothing.
    Measured 2026-08-25 against the live Storybook on :6006 --
    `STORYBOOK_STORIES=Blocks VISUAL_GROUNDS=light npm run visual:storybook`
    printed 21 findings and exited 0. So the one place this command is read
    from is the one place that has to say so; a `--strict` mode was rejected
    because a gate going red on 21 pre-existing findings is one somebody
    switches off.
    """
    found, _ = scope.decide(["ui/src/components/ui/button.stories.tsx"])
    why = " ".join(r for c, r in found if "visual:storybook" in c)
    assert why, found
    assert "exits 0" in why, why
