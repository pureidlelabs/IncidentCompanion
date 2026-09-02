"""The difference between a suite that declined and a suite that passed.

A conditional skip is the right mechanism for a developer without Docker, and
this does not remove one. What it adds is a second mode: on a run that claims
to certify a branch, declining is a failure.

The TypeScript counterpart is `server/test/must-run.ts`, and the two agree on
the environment variables rather than on any shared code.
"""

import os

import pytest

def must_run() -> bool:
    """Whether this run is certifying rather than exploring.

    Read per call rather than once at import, which is what lets this be tested
    at all: a module constant fixes the answer before a case can set anything.
    """
    # `or`, not a chained `get`: an empty `CI` is not a certifying run.
    return bool(os.environ.get("CI") or os.environ.get("IC_SUITE_MUST_RUN"))


def declined(what: str, because: str) -> None:
    """Skip, or fail instead when this run is certifying.

    Does not return: it raises `pytest.skip.Exception` or `pytest.fail.Exception`.

    Args:
        what: the case declining, named as a person would look for it.
        because: what is missing, specifically enough to go and fix.
    """
    if must_run():
        pytest.fail(
            f"{what} declined to run: {because}. "
            "This run is certifying (CI or IC_SUITE_MUST_RUN), where a skip is a "
            "failure. Install what is missing, or run without IC_SUITE_MUST_RUN "
            "to skip it deliberately."
        )
    pytest.skip(f"{what}: {because}")
