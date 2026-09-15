"""The thing that makes a decline loud, attacked at its own silence.

A helper whose whole job is to stop a suite passing vacuously is exactly the
kind that can itself go quiet: read the variable wrong, and every caller
carries on skipping while the summary says the fix landed.

The two implementations are asserted to agree on the variables they read.
Nothing shares code across the language boundary, so the agreement is the
thing that can drift.
"""

import re

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
    assert verify.count("IC_SUITE_MUST_RUN=1") == 4, (
        "verify.sh no longer arms the server suite, the container tier and both browser tiers"
    )
    assert "export IC_SUITE_MUST_RUN" not in verify, (
        "set globally, this turns verify.sh's deliberate in-process fallback into a failure"
    )
