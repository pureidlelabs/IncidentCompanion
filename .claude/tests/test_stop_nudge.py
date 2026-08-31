"""The stop nudge fires on a report that trails off, and on nothing else.

**Every fixture is written here rather than lifted from a transcript.** A real
session's text carries the maintainer's words, and this repository is published.

The three blocking shapes are the ones a hand grading of one session's stops
picked out: a remainder stated as a list, a `Left open` heading, and a check
named as not run. The allowing shapes outnumber them deliberately -- a nudge
that fires on a legitimate stop is one that gets switched off.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[1] / "hooks" / "stop_nudge.py"

sys.path.insert(0, str(HOOK.parent))
from stop_nudge import verdict  # noqa: E402


# --- what must be let through -------------------------------------------------

ALLOWED = {
    "a completion marker closes the turn":
        "Swept four files, 44 passages.\n\nresult: rules swept, pushed as abc123",
    "a needs-input marker closes the turn":
        "Remaining: the whole blocks tier.\n\nneeds input: which registry wins?",
    "a failure marker closes the turn":
        "Still open: everything.\n\nfailed: the branch has no upstream",
    "a closing question hands back":
        "Combed 13 components. Remaining: 78 blocks.\n\nWant me to carry on?",
    "acting-now words mid-message weigh an option rather than commit":
        "Every exported component needs a story, not every file. Doing it now "
        "stops drift across the rest; doing it later means retrofitting each "
        "one. " + ("Filler that pushes the phrase out of the closing window. " * 12)
        + "\n\nresult: paused for discussion, 8 commits pushed",
    "a bare closing question hands back with no offer wording":
        "Combed 13 components. Remaining: 78 blocks.\n\n"
        "Which registry should the rest follow?",
    "an offer hands back":
        "Filed as task #11; I'll pick it up after the blocks tier unless you "
        "want it sooner.",
    "waiting on a decision hands back":
        "Two shapes work here and they are not interchangeable. Ready for your "
        "call on which.",
    "a finished report names nothing outstanding":
        "Renamed 300 files, repointed 514 imports, suite green, pushed.",
    "an empty message":
        "",
    "whitespace only":
        "   \n  ",
}


@pytest.mark.parametrize("name", sorted(ALLOWED), ids=lambda n: n[:45])
def test_a_legitimate_stop_is_let_through(name):
    assert verdict(ALLOWED[name]) is None, (
        f"{name!r} was nudged; a false fire is what gets a hook switched off")


# --- what must be caught ------------------------------------------------------

BLOCKED = {
    "a remainder stated flatly":
        "The design record now carries the lessons.\n\n"
        "Remaining: 78 blocks and all 43 screens.",
    "a left-open heading":
        "`DrawnCheck` came out as its own file.\n\n"
        "## Left open\n\n**#52** - the comb itself, 78 blocks to go.",
    "a check named as not run":
        "Sanity check: 410 tests passing, tree clean. The Docker tier would "
        "also run, which I haven't.",
    "a promise to continue":
        "That is the kit tier finished. I'll now start on the blocks.",
    "a stated next step":
        "Pushed as abc123. Next up, the screens tier.",
    "a next step introduced by a colon":
        "Pushed as abc123.\n\nNext: the screens tier, 43 of them.",
    "acting now, with a handback bolted on":
        "Suite green, pushed as abc123.\n\nNext: back to the blocks tier. "
        "Starting on it now unless you want the lint backlog cleared first.",
    "acting now, under a completion marker":
        "result: swept four files, pushed as abc123\n\n"
        "Starting on the blocks tier now.",
    "acting now, followed by a question":
        "That is the kit finished. Starting on it now. Sound right?",
}


def test_a_claim_to_be_acting_now_outranks_a_handback():
    """The shape that slipped through: a promise wearing a handback's clothes."""
    message = ("Next: back to the blocks tier. Starting on it now unless you "
               "want the lint backlog cleared first.")
    assert verdict(message) is not None, (
        "a trailing 'unless you' must not rescue a claim to be acting now")


def test_a_deferred_promise_is_still_a_handback():
    """Pairs with the test above: 'later, unless you say otherwise' is honest."""
    message = ("Filed as task #11; I'll pick it up after the blocks tier "
               "unless you want it sooner.")
    assert verdict(message) is None


@pytest.mark.parametrize("name", sorted(BLOCKED), ids=lambda n: n[:45])
def test_a_trailing_report_is_nudged(name):
    got = verdict(BLOCKED[name])
    assert got is not None, f"{name!r} slipped through"
    assert got.strip(), "the nudge must quote the phrase it matched"


# --- the payload contract -----------------------------------------------------

def run(payload) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOK)], input=json.dumps(payload),
        capture_output=True, text=True, timeout=15)


def test_an_active_stop_hook_is_never_blocked_again():
    """The one guarantee against trapping a session in its own nudge."""
    done = run({"last_assistant_message": "Remaining: everything.",
                "stop_hook_active": True})
    assert done.returncode == 0


def test_the_same_message_blocks_when_the_flag_is_absent():
    """Pairs with the test above: proves the flag is what did the allowing."""
    done = run({"last_assistant_message": "Remaining: everything."})
    assert done.returncode == 2
    assert "Remaining" in done.stderr


def test_a_payload_without_the_message_is_let_through():
    """The shape the hook-contract probe sends."""
    assert run({"session_id": "probe", "tool_name": "Edit"}).returncode == 0


def test_malformed_stdin_is_let_through():
    done = subprocess.run([sys.executable, str(HOOK)], input="not json",
                          capture_output=True, text=True, timeout=15)
    assert done.returncode == 0


def test_a_non_dict_payload_is_let_through():
    done = subprocess.run([sys.executable, str(HOOK)], input="[1, 2, 3]",
                          capture_output=True, text=True, timeout=15)
    assert done.returncode == 0


def test_the_wired_command_fails_open_when_the_hook_file_is_absent():
    """A hook that is configured but not on disk must let the turn end.

    `python3 <missing file>` exits 2, which is the blocking code -- so an
    unguarded command refuses every stop in the repository, and names a Python
    error as the reason. The file is absent whenever the branch carrying it is
    not the one checked out.
    """
    settings = json.loads(
        (Path(__file__).resolve().parents[1] / "settings.json").read_text(encoding="utf-8"))
    commands = [h["command"] for group in settings["hooks"]["Stop"] for h in group["hooks"]]
    assert commands, "no Stop hook wired"

    for command in commands:
        done = subprocess.run(
            ["bash", "-c", command], input=json.dumps({"last_assistant_message": "Remaining: all"}),
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "CLAUDE_PROJECT_DIR": "/nonexistent-project-root"})
        assert done.returncode == 0, (
            f"{command!r} exits {done.returncode} with no hook file on disk; "
            "a configured-but-absent hook must fail open, not block every turn")


def test_the_reason_names_the_three_ways_out():
    """A nudge that only refuses leaves nowhere to go."""
    done = run({"last_assistant_message": "Remaining: the blocks tier."})
    assert done.returncode == 2
    for expected in ("Carry on", "blocks you", "Hand back"):
        assert expected in done.stderr, f"the reason never mentions {expected!r}"
