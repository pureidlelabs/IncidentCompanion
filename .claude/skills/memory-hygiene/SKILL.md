---
name: memory-hygiene
description: Decide what earns a memory file, and check the ones already there against the repository — paths that moved, commits that never existed, entries missing from the index, facts the code now records itself. Use when saving something to memory, when a recalled memory contradicts what you are looking at, or when the memory directory has grown past what a session can usefully be handed. The failure mode is a confident memory outranking the code it disagrees with.
---

# Memory hygiene

**A memory is written by a session holding the answer and read by one that is not.** That asymmetry is the whole hazard: where a memory and the code disagree, the memory wins, because the reader has no cheaper source. A stale memory is worse than a missing one.

The system prompt already says *how* to write a file — frontmatter, four types, an index line in `MEMORY.md`. This skill is the other two questions: **what earns a file**, and **what to delete**.

## Where it lives

```
~/.claude/projects/-Users-<you>-Repos-IncidentCompanion/memory/
```

Per project, outside the repo, untracked by git — so **nothing versions it and nothing reviews it**. It is the one text in this project's context with no history to fall back on: a wrong line deleted is gone, and a wrong line kept is loaded into every session. That is what the audit is for.

`MEMORY.md` is the only file loaded at startup. A memory absent from it is recalled only if a search happens to surface it, so an unindexed file is close to a deleted one.

## Running the audit

```bash
python3 .claude/skills/memory-hygiene/audit.py .

python3 .claude/skills/memory-hygiene/audit.py . --quiet          # counts only
python3 .claude/skills/memory-hygiene/audit.py . --only PATH
python3 .claude/skills/memory-hygiene/audit.py . --stale-days 30
```

It resolves the memory directory from the repo path. Exit status is 1 when a gating check fires; **that is "read these", not "fix these"** — two of the seven checks nominate rather than decide.

| check | gates | what it catches |
| --- | --- | --- |
| `INDEX` | yes | a file missing from `MEMORY.md`, or an entry pointing at a file that is gone |
| `FRONT` | yes | no frontmatter, a `name` that is not the filename, an unknown `type` |
| `PATH` | yes | a repo path named in a memory that no longer exists |
| `COMMIT` | yes | a cited SHA that is not a commit here |
| `LINK` | no | `[[name]]` resolving to no memory |
| `STALE` | no | untouched for `--stale-days`; a re-read prompt, never a verdict |
| `OVERLAP` | no | two memories sharing >50% of their vocabulary — one fact or two? |

**First run over 13 memories: 2 PATH, 2 LINK, everything else zero.** Both classes of false positive showed up in that one run, so expect them:

- **A path named because it must *not* exist.** `tests/platform.py` is cited as the name that would shadow the stdlib — the check cannot tell a warning from a pointer.
- **`[[…]]` used to emphasise a concept**, not to name a memory. The `[[contributes]]` model is a plugin term; written that way it reads as a link to a memory nobody will ever write. Backticks, not brackets.

The one that paid: `.claude/improvement-plan.md`, deleted deliberately in the docs refactor, still named by a memory telling a future session to record its revisions there — an instruction that cannot be followed, in a file with no git history to catch it.

**LINK does not gate on purpose.** A dangling `[[name]]` is legal by design; the memory instructions call it a marker for a memory worth writing later.

## What earns a file

The test is not "is this true" or "was this hard" — it is **would the next session get this wrong without it**, and **is the repo already the better source**.

| write it | do not |
| --- | --- |
| a decision and its *reason*, especially a rejected one | what the code says — the reader is looking at the code |
| a constraint holding outside the repo (a customer, a language, an unreviewed artefact) | what a commit message says; cite the SHA instead |
| a correction to something the docs still state wrongly | a summary of work that landed — `git log` has it, in more detail |
| open work and what it is blocked behind | anything true only inside this conversation |

**One file, one fact.** A memory that answers two questions is recalled for one of them and read for both.

**Check for the file that already covers it before writing a new one.** The default is to *update* — a second memory on one subject splits it, and recall surfaces whichever is worded closer to the question rather than whichever is right. `OVERLAP` names the pairs that already happened.

**A memory naming a path, a flag or a field is making a checkable claim, and those go stale silently.** Prefer the durable form: cite the commit, name the rule file, or state the constraint without the path. Where the path is the point, expect `PATH` to find it the day it moves.

## Purging

Delete on evidence, not on age. The four that pay:

- **Wrong.** Delete it the moment it is disproved, in the same turn — a half-corrected memory is a memory.
- **Absorbed.** The fact is now in `CLAUDE.md`, a `rules/` file or a docstring. The repo copy is reviewed and versioned; the memory copy is neither, and they will drift.
- **Spent.** An open item that closed, a blocker that lifted, a plan that landed. Keep only what a future session would still get wrong — usually the *reason*, not the status.
- **Split.** Two files on one subject: merge into the older name, keep both index lines' worth of hook in one, delete the other.

**Correcting beats deleting where the wrongness is itself the lesson.** `test-suite-cleanup-pass` is worth more as a memory carrying its own correction than it was as the original claim, because the failure recurred with the rule in view.

**Deleting a memory is two edits.** Remove the file *and* its `MEMORY.md` line; an index entry pointing at nothing is what `INDEX` exists to catch, and it costs startup context while pointing at nothing. Same for a rename.

**Re-read before deleting anything the audit merely nominated.** `STALE` and `OVERLAP` are ranked lists, not findings — a memory nobody has touched in a year may be the most valuable one there, precisely because nothing has re-derived it.

## After a purge

```bash
python3 .claude/skills/memory-hygiene/audit.py . --quiet
python3 -m pytest .claude/tests/test_memory_audit.py
wc -c ~/.claude/projects/*IncidentCompanion/memory/MEMORY.md
```

`MEMORY.md` is loaded unconditionally, so its size is the recurring cost; the individual files are paid for only when recalled.
