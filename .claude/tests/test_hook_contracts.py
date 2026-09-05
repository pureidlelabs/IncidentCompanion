"""Every wired hook emits only what its own event accepts.

**This is the defect that shipped, generalised** -- a hook emitting a key its
event rejects, while five tests asserting the message's *wording* stayed
green.

`knowledge.py` has the same hole: it emits `"hookEventName": "PreToolUse"` and
nothing asserted that string. Change it, or add a stray key beside it, and the
entire knowledge layer goes silently inert with a green suite -- there is no
second signal, because a note that was never delivered looks exactly like a
file no note governs.

**The hook list is read from `settings.json`, not written here.** A fourth hook
gets this guard on the day it is wired, which is the only version of this test
that stays true.
"""

import json
import os
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
SETTINGS = REPO / ".claude" / "settings.json"

# Universal keys, accepted on any event.
UNIVERSAL = {"continue", "stopReason", "suppressOutput", "systemMessage",
             "terminalSequence", "decision", "reason"}

# The events that accept a `hookSpecificOutput` block at all. Everything else
# -- PreCompact among them -- has its whole payload rejected for carrying one.
SUPPORTS_SPECIFIC = {"SessionStart", "Setup", "SubagentStart", "PreToolUse",
                     "PostToolUse", "PostToolUseFailure", "PostToolBatch",
                     "Stop", "SubagentStop"}


def wired_hooks():
    """(event, command) for every hook the settings actually install."""
    if not SETTINGS.is_file():
        return []
    data = json.loads(SETTINGS.read_text(encoding="utf-8"))
    out = []
    for event, groups in (data.get("hooks") or {}).items():
        for group in groups:
            for hook in group.get("hooks") or []:
                command = hook.get("command", "")
                if command:
                    out.append((event, command))
    return out


def test_the_settings_actually_wire_some_hooks():
    """Built from a discovered collection, so it passes vacuously the day the
    settings move or the key is renamed."""
    assert wired_hooks(), "no hooks discovered in settings.json -- the shape changed"


@pytest.mark.parametrize("event,command", wired_hooks(),
                         ids=lambda v: str(v).split("/")[-1][:40])
def test_a_hook_emits_only_what_its_event_accepts(event, command, tmp_path):
    """The envelope, not the message.

    A payload carrying one key the event does not know is not partially
    honoured -- validation is whole-payload, so the error replaces everything
    the hook meant to say.
    """
    payload = json.dumps({
        "session_id": "contract-probe",
        "trigger": "auto",              # PreCompact: the path that never blocks
        "tool_name": "Edit",
        "tool_input": {"file_path": str(REPO / "app" / "storage.py")},
    })
    done = subprocess.run(
        ["bash", "-c", command], input=payload, capture_output=True, text=True,
        cwd=str(REPO),
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(REPO),
             "CLAUDE_KNOWLEDGE_STATE_DIR": str(tmp_path)})

    assert done.returncode in (0, 2), (
        f"{command} exited {done.returncode}; a hook either passes or blocks")
    if not done.stdout.strip():
        return
    try:
        emitted = json.loads(done.stdout)
    except json.JSONDecodeError:
        return                    # plain text is not a payload to validate

    unknown = set(emitted) - UNIVERSAL - {"hookSpecificOutput"}
    assert not unknown, f"{command} emits {sorted(unknown)}, which {event} rejects"

    specific = emitted.get("hookSpecificOutput")
    if specific is None:
        return
    assert event in SUPPORTS_SPECIFIC, (
        f"{command} emits hookSpecificOutput, which {event} does not accept -- "
        "the whole payload is rejected, message and all")
    assert specific.get("hookEventName") == event, (
        f"{command} declares hookEventName "
        f"{specific.get('hookEventName')!r} but is wired to {event!r}")


def test_every_guard_on_disk_is_actually_wired():
    """A guard nobody registered is a file that reads as protection.

    **The other tests here iterate what `settings.json` declares**, so an
    unregistered hook produces one parameter fewer and nothing goes red -- the
    empty-set shape, arriving as a pass. Stripping one guard from the
    `PreToolUse` block once left the whole of `pytest .claude/tests` green.

    Asserted over the whole `*_guard.py` family rather than one name, because
    the next guard is written by someone who will not read this test.
    `settings.json` is the only wiring route, which is what makes a plain
    substring test sound.

    **Every hook, not every guard.** Scoped to `*_guard.py` this asserted
    nothing the day the last guard was deleted -- an empty glob, an empty
    difference, and a green test certifying no file at all. Which is the
    empty-set pass the paragraph above says this test exists to catch, arriving
    in the test itself.
    """
    wired = SETTINGS.read_text()
    hooks = REPO / ".claude" / "hooks"
    on_disk = sorted(p.name for p in hooks.glob("*.py"))
    assert on_disk, "no hooks found -- the directory moved"

    unwired = [name for name in on_disk if name not in wired]
    assert not unwired, (
        f"{unwired} sit in .claude/hooks/ and are named nowhere in "
        f"settings.json, so they never run. A hook that cannot fire is worse "
        f"than no hook: it reads as protection."
    )


@pytest.mark.parametrize("event,command", wired_hooks(),
                         ids=lambda v: str(v).split("/")[-1][:40])
def test_a_hook_survives_a_stale_project_dir(event, command, tmp_path):
    """`CLAUDE_PROJECT_DIR` is fixed for the life of a session and outlives
    the directory it names.

    A job launched from a worktree keeps that path after the worktree is
    removed. `python3 "$STALE/.claude/hooks/worktree_guard.py"` then exits 2
    -- the interpreter's code for a file it cannot open, and the same code the
    harness reads as *block*. Every Write and Edit in that session is refused,
    on every path, by a guard that never ran, with Python's message standing
    in for the guard's own.

    So an invocation may not hand the interpreter a path it has not checked.
    The two ways out are not equivalent, and which one is right depends on what
    the hook is for. A guard resolves, because skipping disarms it silently. A
    nudge skips, because its safe failure is to be absent -- which is why
    `stop_nudge.py` carries `[ -f "$f" ] || exit 0` and is deliberately outside
    the `*_guard.py` family. Passing here by skipping is a pass for a nudge and
    would not be one for a guard.

    Asserted on the interpreter's wording, because the exit code cannot tell
    the two apart: a real refusal is also 2.
    """
    stale = tmp_path / "worktrees" / "wt-removed-when-the-branch-landed"
    payload = json.dumps({
        "session_id": "stale-project-dir-probe",
        "trigger": "auto",
        "tool_name": "Edit",
        "tool_input": {"file_path": str(REPO / "app" / "storage.py")},
    })
    done = subprocess.run(
        ["bash", "-c", command], input=payload, capture_output=True, text=True,
        cwd=str(REPO),
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(stale),
             "CLAUDE_KNOWLEDGE_STATE_DIR": str(tmp_path)})

    assert "can't open file" not in done.stderr, (
        f"{command} never ran: the interpreter could not open it under a "
        f"stale CLAUDE_PROJECT_DIR, and exit 2 reaches the session as a "
        f"refusal.\n{done.stderr.strip()}")
    assert done.returncode in (0, 2), (
        f"{command} exited {done.returncode} under a stale CLAUDE_PROJECT_DIR")
