#!/usr/bin/env python3
"""Refuse the first stop of a turn that names outstanding work and hands nothing back.

Reads a `Stop` payload on stdin. Exit 0 lets the turn end; exit 2 returns the
stderr text to the model, which then either does the work, says what blocks it,
or hands back in words a reader can act on.

A claim to be acting now -- `starting on it now` -- blocks on its own, whatever
else the message carries. A handback bolted onto such a claim is not a
handback: it announces the work is running and asks permission in one breath,
leaving the reader unable to tell which.

Otherwise blocks only when all three hold:

- the message names work that is not done -- a promise, or a remainder;
- it makes no handback, meaning no closing question and no offer to continue;
- it carries no completion marker (`result:`, `needs input:`, `failed:`).

`stop_hook_active` arrives true once a block has already held this turn, and
short-circuits everything, so each turn is nudged at most once and the stop
after a nudge always lands. A new user message arms it again. Every error path
exits 0: the failure this hook can cause is a trapped session, which is worse
than the one it prevents.

This is not a guard and is deliberately outside the `*_guard.py` family --
those fail closed on an old interpreter, and blocking a stop is the wrong
direction to fail in.
"""

import json
import re
import sys

# Work named as not done. Each is a phrase that survives being read aloud out
# of context; a bare verb tense is not enough, because a report of finished
# work is written in the same one.
OUTSTANDING = [
    r"\bremaining\b",
    r"\bleft open\b",
    r"\bstill (?:open|to|need|outstanding)\b",
    r"\bto go\b",
    r"\byet to\b",
    r"\bnot yet\b",
    r"\bwhich I have ?n[o']t\b",
    r"\bI have ?n[o']t (?:run|done|checked|written|touched)\b",
    r"\bnext\s*:",
    r"\bnext (?:up|I['’]ll|,? I will)\b",
    r"\bI['’]ll (?:now|then|pick|carry|continue|start|move|come back|do that|run|write|fix)\b",
    r"\bI will (?:now|then|pick|carry|continue|start|move)\b",
    r"\b(?:continuing|moving on) (?:with|to|onto)\b",
    r"\blet me (?:now|then)\b",
    r"\bstill (?:has|have|leaves)\b",
    r"\boutstanding\b",
]

# A claim to be acting immediately. These block whatever else the message
# carries: a turn that says the work is starting now and then ends is wrong in
# a way no closing question repairs, because the reader cannot tell whether it
# is waiting for them or already running.
IMMEDIATE = [
    r"\b(?:starting|beginning|kicking off|picking (?:it|that) up|carrying on|"
    r"continuing|getting on|cracking on|moving) (?:on |with |onto |to )?"
    r"(?:it |that |them )?now\b",
    r"\bon (?:it|that) now\b",
    r"\bdoing (?:it|that|this) now\b",
    r"\bI['’]m (?:starting|beginning|running|doing) (?:it|that|this)\b",
    r"\bstarting (?:on|with) (?:it|that|the)\b",
    r"\brunning (?:it|that) now\b",
    r"\bhere goes\b",
]

# A handback puts the next move with the reader. A closing question is the
# commonest form and is checked against the tail, where an answer is being
# waited for, rather than the whole message.
HANDBACK = [
    r"\bwant me to\b",
    r"\bshall I\b",
    r"\bwould you like\b",
    r"\bsay the word\b",
    r"\blet me know\b",
    r"\bunless you\b",
    r"\bif you['’]d (?:rather|prefer)\b",
    r"\byour call\b",
    r"\bup to you\b",
    r"\bready for\b",
    r"\btell me (?:which|what|if|whether)\b",
    r"\bwhich (?:would you|do you)\b",
    r"\bwaiting on\b",
    r"\bneeds? (?:your )?(?:input|decision|steer|ruling)\b",
]

# Written at the start of a line, which is what the job conventions ask for.
COMPLETION = r"(?mi)^\s*(?:result|needs input|failed)\s*:"

TAIL = 400


def verdict(message: str) -> str | None:
    """The phrase that should stop the turn ending, or None to let it end.

    Returns the matched outstanding-work phrase so the caller can quote it
    back; a nudge naming nothing is one nobody can act on.
    """
    if not message or not message.strip():
        return None

    tail = message[-TAIL:]

    # Read against the tail alone. Mid-message the same words weigh an option
    # -- *doing it now stops drift, doing it later means retrofitting* -- and
    # only a closing claim is one the reader acts on.
    for pattern in IMMEDIATE:
        found = re.search(pattern, tail, re.IGNORECASE)
        if found:
            return found.group(0)

    if re.search(COMPLETION, message):
        return None
    if "?" in tail:
        return None
    for pattern in HANDBACK:
        if re.search(pattern, message, re.IGNORECASE):
            return None

    for pattern in OUTSTANDING:
        found = re.search(pattern, message, re.IGNORECASE)
        if found:
            return found.group(0)
    return None


def main(payload: dict | None = None) -> int:
    """Reads stdin when called with nothing, which is how the harness runs it."""
    if payload is None:
        try:
            payload = json.load(sys.stdin)
        except (json.JSONDecodeError, ValueError, OSError):
            return 0

    if not isinstance(payload, dict):
        return 0
    if payload.get("stop_hook_active"):
        return 0

    message = payload.get("last_assistant_message")
    if not isinstance(message, str):
        return 0

    phrase = verdict(message)
    if phrase is None:
        return 0

    print(
        f'This turn is ending on "{phrase}", with no closing question and no '
        f"completion marker, which is the shape of a report that trails off.\n"
        f"Do one of three things, then stop:\n"
        f"  1. Carry on and finish the work you named.\n"
        f"  2. Say what blocks you, concretely enough for someone to unblock it.\n"
        f"  3. Hand back in words -- ask the question you need answered, or "
        f"state that the named work is deliberately for later.\n"
        f"Whichever you pick, the next stop is allowed through.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException:
        raise SystemExit(0)
