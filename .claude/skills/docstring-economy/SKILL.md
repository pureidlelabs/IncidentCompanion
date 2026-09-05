---
name: docstring-economy
description: Decide what belongs in a docstring, what belongs in a specification or design record, what belongs in the commit message, and what belongs nowhere. Use before writing a docstring, not only when trimming one — the failure mode is a paragraph that reads as insight and is knowledge filed in the wrong store.
---

# Docstring economy

**A docstring documents an interface: what this does, how to call it, what it takes and returns.** A precondition or a side effect the signature cannot carry earns a line. Everything past that is knowledge, and it goes to `openspec/`. → `rules/docstrings.md`

**There is no note store, and rebuilding one is not the answer.** It existed and was removed: a second copy of every claim under `.claude/` made a grep of the tree answer twice, once from the code and once from a file describing it, and the describing copy is the one that goes stale. So a reason that generalises past this file goes to the capability's `design.md`, which is read before the work rather than during it, and a reason that does not goes nowhere.

## Write it last

**The drift is an ordering failure, not a vigilance one.** Working something out produces understanding that has to go somewhere, and if the docstring is the first prose written it is the only place available. It absorbs the lot; the note and the commit message are then written *from* it, and nobody goes back to cut the first copy.

So the order is:

1. **Draft into scratch while you work.** Whatever the job's temporary directory is. Not a file in the repository, and not the docstring.
2. **Route it, before writing any docstring.** `rules/claim-homes.md` owns the order: the constitution, then a requirement, then a design record, then a test, then nowhere, then a skill, then `rules/`.
3. **Write the commit message** — what changed, why, and the measurement that decided it.
4. **Write the docstring last**, for a reader who has the specification and the design record.

**Scratch dies with the job.** It is a staging area, never a destination: anything left there when the job ends is gone, with no commit and no note.

## Write it by subtraction

**The reader has the specification and the design record**, which is what `rules/claim-homes.md` puts in front of somebody deciding what to build. So anything either of them says is redundant here, and the docstring is whatever remains once you assume both have been read.

That is a subtraction, and it is why this file gives no length guidance and never will. A stated allowance is a target: told a number, you write to it and feel compliant. The question is never *how long may this be* but *what does this say that the design record does not*.

## The line

**Keep:**

- The claim, on the first line, as a statement about behaviour.
- What it takes, returns and raises, where the signature does not say.
- A precondition — *call after `flush`*, *the path must exist*.
- A consequence outside the return value — it writes, it locks, it evicts.
- **In a test, what the test does not cover.** A test whose name overstates its coverage is worse than no test, and that is its contract, not history.

**Move it, and `rules/claim-homes.md` owns which home:**

| in the docstring | where it goes |
| --- | --- |
| a rejected alternative | the capability's `design.md` |
| why this way and not the obvious way | the capability's `design.md` |
| a measured number — `2.59:1`, `~376ms`, `83px` | the commit message that acted on it |
| a framework or tool trap | `CLAUDE.md`'s gotchas, or the skill for that action |

**Cut entirely:**

| cut | example |
| --- | --- |
| a claim a test asserts | name the test and stop; prose goes quietly wrong |
| the route to the answer | "found the hard way", "which is what sent me here" |
| announcing importance | "this is not hypothetical", "worth writing down" |
| prose about the prose | "stated plainly", "rather than implying" |
| first person | "I", "my", "we", "us" |
| a status report on another module | it goes stale unread |
| re-deriving a rule `CLAUDE.md` holds | point at it in four words |
| history, dates, what changed | the commit message |

## Moving is not deleting

**The middle column is the repo's most valuable documentation, and a trim pass that drops it instead of filing it destroys it.** Two tells that you are holding something that must survive the edit:

- **The sentence contains a number.**
- **The sentence says something failed** — "left the suite green", "passed with the fix reverted". That is break-verification evidence.

Neither is a reason to keep it in the docstring, and both are a reason to write the commit message before you cut the paragraph — `git log -S` finds a measurement by the symbol it moved, which is the only retrieval route left once the line is gone. `rules/claim-homes.md` owns the order of homes.

**History already in the tree is cut rather than filed.** The commit that acted on it was written months ago and git holds it; copying it forward into a new commit message files it twice. `Shared.NoHistory` is what finds it.

## Worked example

`test_the_reveal_flag_is_built_per_render`, 21 lines → 5, and one note:

```text
A fresh render of the API rows starts masked.

Asserted structurally: the rebuilt frame is byte-identical to the stale one, so the two failure modes have no observable difference.
```

The contract stays — what it asserts, and that the assertion is structural because the harness cannot see the difference. *Hoisting the flag to module level leaves the whole suite green* is a rejected alternative that rules out a refactor across every per-render flag in the file, so it belongs in the capability's `design.md`. Cut outright: "worth writing down", "which is what sent me here", and a paragraph on deferred refreshes `rules/` already covers.

## Where the effort pays

**Across the live trees** — `server/`, `ui/src`, `tests`, `.claude/scripts`:

| tier | doc lines | code lines | ratio |
| --- | --- | --- | --- |
| `server/src` | 27,487 | 56,051 | 49% |
| `ui/src` | 39,402 | 93,555 | 42% |
| `server/e2e` | 3,941 | 5,934 | 66% |
| `server/test` | 4,172 | 7,767 | 54% |
| `tests` | 784 | 5,890 | 13% |
| `.claude/scripts` | 56 | 409 | 14% |

**45% overall, measured 2026-09-05, and that is the number this skill exists to bring down.** The padding concentrates in the long ones — trim there and leave the one-liners alone, since a pass over a short docstring costs more than it returns.

## Three things a comment is not

**Not version control.** `# changed 2026-07-03`, `// was 5, now 8`, and a commented-out block kept "in case" all belong in git.

**Careful with the near-miss**: this repo dates measurements constantly, and those stay. A measurement date says *when the number was true*, which a reader needs to judge whether to re-measure. A change date says *when somebody edited the line*, which git answers.

**Not a restatement of the line**, and **not a parameter table**. That guide, like most, wants a docstring to list parameters and their types; **do not add those here**, because the annotations already carry them and a second copy goes stale. If you arrive from a style guide that says otherwise, this paragraph is why the codebase looks the way it does.

## Why this repo diverges from the workshop at all

→ <https://utrechtuniversity.github.io/workshop-computational-reproducibility/chapters/comments-and-docstrings.html>

**It assumes a human writes the prose and a human reads it.** Here an agent writes most of it, and the guidance is read by an agent that follows whatever it says. Two consequences, and they are the whole of the divergence:

- **Padding is the failure mode, not omission.** A human under time pressure writes too little; a model writes plausible filler indefinitely and it reads well. The cut list carries weight the workshop has no reason to give it.
- **Guidance has to be retrievable, not merely correct.** An agent sees only the files it is handed, so a claim filed where nothing points at it is a claim nobody reads. → `rules/claim-homes.md`

**Everything else we take**, and where the two disagree without one of those reasons behind it, the workshop wins.

## Why there is no test

A length cap is worse than nothing: it cuts the contract and keeps every short padded paragraph. **One subset is mechanical and is linted** — `Shared.NoHistory` refuses the code's own past across every tree `lint:prose` walks, so `npm run lint:prose` answers that much. The rest is a reading, and there are no project agents to hand it to: it is a pass you make over your own diff before the commit.
