"""The thing that makes a decline loud, attacked at its own silence.

A helper whose whole job is to stop a suite passing vacuously is exactly the
kind that can itself go quiet: read the variable wrong, and every caller
carries on skipping while the summary says the fix landed.

The two implementations are asserted to agree on the variables they read.
Nothing shares code across the language boundary, so the agreement is the
thing that can drift.
"""

import os
import re
import subprocess

import pytest

from tests._must_run import declined, must_run
from tests._repo import REPO_ROOT


def test_nothing_certifying_means_an_ordinary_skip(monkeypatch):
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("IC_SUITE_MUST_RUN", raising=False)
    assert must_run() is False
    with pytest.raises(pytest.skip.Exception):
        declined("a tier", "no docker")


@pytest.mark.parametrize("name", ["CI", "IC_SUITE_MUST_RUN"])
def test_a_certifying_run_fails_instead_of_skipping(monkeypatch, name):
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("IC_SUITE_MUST_RUN", raising=False)
    monkeypatch.setenv(name, "1")
    assert must_run() is True
    with pytest.raises(pytest.fail.Exception, match="no docker on PATH"):
        declined("The missing-credential message", "no docker on PATH")


def test_an_empty_ci_still_reads_the_other_variable(monkeypatch):
    """`or`, not a chained default, and this is the case that tells them apart.

    Read the pair the wrong way and an empty `CI` is an answer, so a
    certifying local run skips silently.
    """
    monkeypatch.setenv("CI", "")
    monkeypatch.setenv("IC_SUITE_MUST_RUN", "1")
    assert must_run() is True


def test_the_two_languages_read_the_same_variables():
    """A drift here is silent: each side keeps working and they stop agreeing.

    Asserted against the TypeScript source text rather than by running it,
    because this suite has no node.
    """
    ts = (REPO_ROOT / "server" / "test" / "must-run.ts").read_text(encoding="utf-8")
    named = set(re.findall(r"process\.env\['([A-Z_]+)'\]", ts))
    assert named == {"CI", "IC_SUITE_MUST_RUN"}, (
        f"the TypeScript side reads {sorted(named)}; this one reads CI and IC_SUITE_MUST_RUN"
    )


def test_the_hooks_tier_cannot_be_skipped_for_want_of_an_interpreter():
    """`verify.sh` asks for its interpreter the way `test.sh` does.

    A `.venv` existing is not evidence it runs: a worktree built on macOS
    carries one whose `bin/python` dangles in the container, so `-x` says yes
    and the interpreter still will not start. `scripts/venv_python.sh` settles
    it by *executing* each candidate, falls back to the main checkout itself,
    and `--ensure` builds or repairs one -- so there is no state left where the
    tier has nothing to run and says so in a SKIPPED line.

    The comment above that block records what one silent skip already cost
    here: four failures sat at head unseen, three of them caused by files the
    branch had deleted. -> #653
    """
    verify = (REPO_ROOT / "verify.sh").read_text(encoding="utf-8")

    assert "venv_python.sh --ensure" in verify, (
        "verify.sh picks its own interpreter, so it can miss one test.sh would have built"
    )
    assert "-x \"$VENV\"" not in verify, (
        "a file test cannot tell a dangling interpreter from a working one"
    )
    assert not re.search(r"SKIPPED\+=\(\"hooks", verify), (
        "the tier that four unseen failures hid in can be skipped again"
    )


def test_verify_sh_turns_the_mode_on_where_it_certifies():
    """`verify.sh` is the run that certifies, so it is where the mode belongs.

    Four tiers arm it separately, and the argument is in the script: the
    server suite sets it only on the branch that found a stack, because the
    branch below it runs deliberately degraded; the two browser tiers set it
    because their per-spec skips are otherwise invisible in an exit code.
    """
    verify = (REPO_ROOT / "verify.sh").read_text(encoding="utf-8")
    joined = verify.replace("\\\n", " ")
    armed = re.findall(r'step "([^"]+)"[^\n]*IC_SUITE_MUST_RUN=1', joined)
    tiers = [
        "browser tier (the app)",
        "browser tier (the kit)",
        "client: suite",
        "repository: suite (with the container files)",
        "server: suite",
    ]
    assert sorted(armed) == tiers, (
        f"verify.sh arms {sorted(armed)}; the tiers that certify are {tiers}"
    )
    assert "export IC_SUITE_MUST_RUN" not in verify, (
        "set globally, this turns verify.sh's deliberate in-process fallback into a failure"
    )


def test_the_client_tier_refuses_a_certifying_run_that_ran_nothing():
    """The client tier's own silence, attacked where a pool timeout leaves it.

    `--passWithNoTests` is what makes this an attack rather than a formality: a
    plain empty client run already exits 1, so without the flag this is green
    before the arm as well as after. What it cannot reach is the timeout
    itself, whose pool deadlines are not configurable. -> #797
    """
    if not (REPO_ROOT / "node_modules" / "vitest").exists():
        declined("The client must-run arm", "no node_modules -- run npm ci at the root")

    done = subprocess.run(  # noqa: S603
        [
            "npx",
            "vitest",
            "run",
            "--project=unit",
            "--passWithNoTests",
            "src/__matches_no_test_file__",
        ],
        cwd=REPO_ROOT / "ui",
        env={**os.environ, "IC_SUITE_MUST_RUN": "1"},
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    output = done.stdout + done.stderr

    assert done.returncode != 0, (
        f"the client tier reported green having run no test files:\n{output}"
    )
    assert "IC_SUITE_MUST_RUN" in output, (
        f"the run failed for a reason other than the arm:\n{output}"
    )
