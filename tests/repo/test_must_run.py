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

    Read the pair the wrong way and an empty `CI` is an answer, so a certifying
    local run skips silently -- the exact defect being fixed, with the fix in
    place.
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


def test_verify_sh_turns_the_mode_on_where_it_certifies():
    """`verify.sh` is what the issue names as the run that certifies.

    Two tiers, and the argument for each being separate is in the script: the
    server suite sets it only on the branch that found a stack, because the
    branch below it runs deliberately degraded.
    """
    verify = (REPO_ROOT / "verify.sh").read_text(encoding="utf-8")
    assert verify.count("IC_SUITE_MUST_RUN=1") == 2, (
        "verify.sh no longer arms both the server suite and the container tier"
    )
    assert "export IC_SUITE_MUST_RUN" not in verify, (
        "set globally, this turns verify.sh's deliberate in-process fallback into a failure"
    )
