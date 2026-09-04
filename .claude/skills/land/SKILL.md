---
name: land
description: Complete one feature — merge main down, prove it green locally, review it, then mark its draft pull request ready once the maintainer has signed off. Then clean up the worktree. Use when a feature is finished, not when a section of one is. Opening the draft happens when the branch is created, not here.
---

# Landing a feature

**One finished feature, onto `main`, through a pull request.** It ends with the PR approved, the branch gone and the worktree with it.

**The maintainer signs off on the feature before any of this runs.** Not on the merge — on the work. The branch's pull request has been open as a draft since it was created; what waits on the sign-off is marking it ready, which is the act that offers the work. → `rules/git-workflow.md` §8.

**A section of a feature is not a landing.** Merging a slice back onto its own feature branch is an ordinary merge and owes none of this; the whole sequence below is about what reaches `main`.

**This skill owns the landing procedure.** `.claude/rules/git-workflow.md` keeps the decisions that hold whether or not you are landing — the branch and worktree split, the review gate, what reaches origin — and the steps live here, where a reader reaches them by running the landing rather than by starting a session. Everything below is the runnable order, and the traps at the end are mistakes made in this repo rather than hypotheticals.

---

## 1 — Merge `main` down

`main` moves while a feature is being built, so work committed on a tree that branched last week is built on a tree that no longer exists. This is first because the suite below is the expensive tier: run it before the merge-down and it measures a tree you are not shipping, and then you run it again.

```bash
cd <worktree>
git fetch origin main
git merge origin/main
```

**A plain merge, not `--ff-only`.** A feature that took any time has commits of its own, so it cannot fast-forward onto a `main` that also moved, and demanding one only produces a refusal you then work around. `--ff-only` belongs at the far boundary — what reaches `main` — and the pull request is what holds it there now.

**Settle every conflict here**, in the branch, where the suite can be re-run against the result. A conflict resolved inside a pull request is one nothing has tested.

## 2 — Green, and green for the right reason

```bash
python3 .claude/scripts/test_scope.py main  # committed work: diff the *branch*,
                                            #   or a clean tree reads "none"
```

**Run the commands it prints, not `./test.sh`.** They are not the same command and the difference is silent: `test.sh` ends in `pytest tests`, so it runs the *app* tier and never `.claude/tests` — the hook, the skills, and the stale-reference checks. Substituting one for the other is a green landing with the guidance tier unrun.

**A prose change does not land on a red linter either.** `test_scope.py` prints it when it is owed:

```bash
npm run lint:prose
```

**Zero errors.** Vale is not in `./test.sh`, so this line and the router are the only things that run it before the pull request; CI runs it there. A rule edit re-lints every file rather than the pages in the diff, so a branch can go red on files it never touched.

**A `ui/` change does not land on a red linter.** `test_scope.py` prints the line when it is owed, and it is a gate rather than a suggestion:

```bash
cd ui && npm run lint && npm run typecheck && npm test
```

**`npm run typecheck`, never `npx tsc --noEmit`.** `ui/tsconfig.json` is a solution file holding nothing but `references`, so the bare command typechecks an empty program and exits 0.

**Zero errors.** Warnings are a standing set of 8 (`react-refresh`, `react-hooks/incompatible-library`, one `exhaustive-deps`) and are not a blocker; an error is. eslint is not in `./test.sh`, so before the pull request nothing but this line tells you. A rule that has to be broken gets an `// eslint-disable-next-line <rule>` with the reason in a comment *above* it, never a wholesale disable: two are in `incident-canvas.tsx`, both because the rule's heuristic misreads a callback that touches a ref when invoked.

**`tsc` is separate from the build.** `npm run build` does not type-check, so a type error ships a working bundle.

**Once, not twice.** Collection order is byte-identical between runs and no randomiser is installed, so a repeat re-rolls nothing but worker interleaving. No wall clock belongs here: a shared machine's is unverifiable.

**Name the weakest state that would satisfy each new test's assertions**, and do it before break-verifying. If you can name one that is not the claim, the test is a proxy — and a red break-verify will certify it anyway, because the mutation and the weak assertion are on the same axis. One sentence, and it catches what nothing else here does.

**Break-verify what you wrote.** Revert the clause each new test is named for and check *that* test fails — not a neighbour. A mutation gets caught by something other than the thing under test in more ways than anyone expects: assert the mutation applied, and check the named test is the one that went red. Delegable: the **`test-verifier` agent** takes test ids, plants each defect in a fresh context that does not share your belief the test works, and returns a verdict per test.

Clear the bytecode cache between mutations. A same-size, same-second revert matches the cached `.pyc`'s stamp and the broken bytecode keeps running, which reads as "my fix does not work":

```bash
find tests .claude -name __pycache__ -type d -exec rm -rf {} +
```

**Did this change replace something?** Then the predecessor and its tests are in scope for *this* landing, not a later sweep — a superseded implementation never fails, because its own tests keep certifying it (four instances landed that way before this step existed; −846 lines). Retire them together, re-anchoring any property only the old tests held; the `dead-code-hunt` skill owns the steps. Genuinely deferring the removal is a decision, so it goes in the report and in a change under `openspec/changes/`, not into silence.

## 3 — What the suite cannot see

Skip these when they do not apply; do not skip them because the suite is green, which is the state they exist for.

| the change touches | run | because |
| --- | --- | --- |
| themes, shell, nav, tables, dialogs, picker, graphs | `visual-check` | `.mark()` never reaches the DOM, nothing bubbles, `ui.table` renders client-side |
| a write path or a form | `server/e2e/prodding.spec.ts` | it is the only tier that sees two halves which are each correct and disagree — a client posting one body while its own route demands another passes both suites and renders perfectly |
| the container, the launcher, permissions, shutdown | `INCIDENTCOMPANION_CONTAINER_TESTS=1 python -m pytest tests/docker/test_container_runtime.py` | the suite never runs the app as a process, so entrypoint, signals and bind-mount modes sit outside every assertion in it |

**`visual-check` must be run from the worktree** — see the traps below.

## 4 — Did this turn up something the next person needs?

**Each sentence goes to exactly one place, and `rules/claim-homes.md` owns the order.** The behaviour the branch established goes in a requirement; why it is met that way, where the choice was live, goes in the capability's `design.md`; a claim about the code goes in a test whose name is the claim; a measurement that decided something goes in the commit message that acted on it. What survives none of those is not written down.

**Two questions while you are here**, because this is the one checkpoint every piece of work passes:

- **Did the session learn something *around* the change** — a dead end, an approach abandoned for a reason — that no diff shows? If it would have changed the decision, it is a design record. If it only explains this commit, it is the commit body.
- **Did something you were told turn out to be wrong?** A rule, a specification or a comment that misled you is the worst failure here, and this is the only moment anyone grades one. Fix it on the branch rather than filing it.

## 5 — Did the branch move a file that more than one thing reads?

**A sweep driven by grepping the old path cannot find a reader that computes it**, and this repo computes them in three languages.

```js
join(dirname(scriptDir), 'db', 'roles.sql')   // server/scripts/stack.mjs
readFile('db/roles.sql', 'utf8')              // global-setup.ts, twice
```

The consequence was the dev loop, `db:up` and **every `npm run check` dead** — and it reached review because the three suites reported green contained no Node tier at all. The branch was verified by the suites that structurally could not see it.

**Build the reader list by resolving, not by searching.** Two probes, both cheap:

```bash
# Every path-shaped literal, resolved against the repo root and its own dir.
rg -n 'parents\[|dirname\(|readFile\(.[a-z]+/|join\([^)]*,' --glob '!node_modules'
# Then the basename, which catches the shorter spelling a path sweep misses.
rg -n '<basename>' --hidden --glob '!node_modules' --glob '!.git'
```

The second is the half that is easy to skip: a sweep for the full old path does not see the same file cited by its last two segments, and six stale prose citations survived on exactly that.

**Then ask which suite executes each reader.** One of the three sat behind `IC_TEST_DB=embedded`, which nothing automated runs — so its fix was correct and unverified, and the comment claiming otherwise was the same false assurance as the defect.

## 6 — Fold the specifications in

**Only if the branch touched `openspec/`.** The delta lives under `openspec/changes/<id>/` while the branch is live; landing is where it becomes what the application says it does.

```bash
npx openspec validate --strict
```

Then sync the delta into `openspec/specs/`, archive the change into `openspec/changes/archive/`, and commit both on the branch — the `openspec-sync-specs` and `openspec-archive-change` skills drive the two steps.

- **Before the merge, not after.** A change archived afterwards is one the release branch never carried, and `specs/` then describes a release that has already moved.
- **`validate --strict` is owed whenever the branch touched `openspec/`**, at the same moment as the lint. It is a fact rather than a judgement, so depth does not apply. → `rules/git-workflow.md` §7a
- **The CLI is a pinned dev dependency**, so `npx openspec` finds the local binary. `openspec` itself is not on `PATH`.

## 7 — The lint, and it does not scale with the review

```bash
npm run lint:prose
(cd server && npm run --silent lint) && (cd ui && npm run --silent lint)
```

**Zero errors is the gate, and every branch owes it** — a review is a judgement whose depth follows what the branch did, and a lint is a fact that does not. Five errors reached the release branch the last time this was left to a checklist, three of them non-ASCII characters a scripted edit typed into source, which is what `local/ascii-only` exists to catch.

## 8 — Review the branch before it lands

**A branch that touched something a defect can ship through owes a review** — `.claude/hooks/`, `.claude/scripts/`, `server/src/`, `ui/src/`, `docker/`, `compose.yaml`. A branch of nothing but prose, skills, rules, tests or stories does not, and a mixed diff takes the union. It is a path list rather than a judgement because *"did this branch rewrite something?"* is answered by the person who wants to land.

**Nothing enforces this.** No guard refuses a merge without a review record, so the only thing standing between a branch and `main` is whoever is landing it. **Running the review needs no permission** — it is part of landing, not a decision to put to the maintainer.

Review it in a context that did not write it — a fresh session, or a subagent handed the diff — with base `main` and head `feature/<name>`, after the merge-down and a green suite.

**Four questions are worth asking yourself first**, because they are the ones that have paid and three of them are cheap:

1. For each module the branch touched, does anything **outside a test** import it? (Read the matching lines — a docstring mention is not an import.)
2. Do the branch's tests import what the app imports?
3. What did the branch add to `package.json` / `requirements*.txt`, and what imports it?
4. What did it write and then abandon — a lab, a spike, a second copy of a helper the codebase already exports?

`ui/src/structure.test.ts` fails on the first automatically, so what the agent adds is the other three and the mutation that proves the second. **You cannot answer them from your own context alone**: knowing what the code is meant to do is exactly what makes a wrong import invisible.

- **What it catches, nothing else can.** A branch whose tests certify a *second* implementation passes everything; only a reader who distrusts the branch finds it. That failure is invisible per-agent and obvious across the composite.
- **Brief the *first* pass on the map, never on your conclusions.** What it is worth is that it does not share your model of the code — the model that decided which inputs you imagined and which state you held constant. Give it the entry points, the contract and where things live. "I built X this way, check it" hands over the model and turns the review into confirmation of your own reasoning, which is the one thing you could have done yourself.
- **Brief a *re-review* narrowly, on purpose.** Name the fixes, ask whether they hold and whether they created new surface, and say to skip what it has already cleared. The search bias is real and you are accepting it: an unbounded re-review does not terminate, and each round costs a full pass. Scoping is what ends the loop — a scoped fourth round here ran in a fraction of the first round's time and was the one that ended it.
- **Paste the previous round's findings verbatim, and name the test file its probe table became.** A re-invoked agent is a *fresh instance*: it has no memory of the round before, so "count what this round's findings were caused by" — the escalation signal the whole gate rests on — is uncomputable unless you hand it the list. Without that it silently degrades to "no fix-caused findings observed", which reads exactly like convergence.
- **Ask it to split "fails open on a command someone would type" from "advisory limit".** Without that split there is no landing condition and the loop is unbounded again, whatever the brief said.
- **State your stopping rule in the brief, before it looks.** Not "find everything" but what you will do if it finds the same thing again — *"if this guard is still wrong I revert it rather than write a third version"*. It converts an open-ended search into a decision the reviewer can answer, and it is the one instruction that cannot be added later without looking like a reaction to the findings.
- **Count the fix-caused findings out loud, and say the count rather than the verdict.** CLAUDE.md's rule is that twice means the mechanism is wrong. A reviewer that reports "one of two, and here is which" leaves the judgement where it belongs; one that reports "no escalation observed" reads identically to convergence and is not the same claim.
- **After the merge-down, never before.** The tree you review has to be the tree you ship, and `main` moved while the agents worked.
- **Capture its probe table as a test before you fix anything.** The shapes it tried and the ones that passed are the regression corpus your fixes have to survive; discarding them is what makes round three find what round two created.
- **A commit landed after the review invalidates it.** Anything committed afterwards needs a fresh look, and nothing tracks that for you.
- **Depth is the judgement, not whether to run it.** A branch that extended something gets a short pass; one that rewrote something gets the full walk, because that is where two implementations survive side by side.

## 9 — Mark the draft ready, and approve it

**Nothing merges into `main` from a shell.** The pull request is the landing, and it has been open since the branch was created — this step offers it.

```bash
git push origin "$(git branch --show-current)"   # the head the PR reads
gh pr edit <n> --repo pureidlelabs/IncidentCompanion --body-file <path>
gh pr ready <n> --repo pureidlelabs/IncidentCompanion   # after the sign-off
gh pr review --approve <n>                                  # once CI is green
```

**Update the body before offering it.** It was written when the branch was empty, so what it says the branch does is a plan rather than a report. Every issue the branch picked up wants its `Fixes #n` in there too — that is what closes them on merge.

- **CI decides; the local run is what stops you finding out in public.** The gate fires on the pull request and nowhere else, so steps 2 to 7 are the same ground reached earlier and cheaper. **Never approve around a red tier** without saying which and why in the PR body.
- **The body says what was run and what it answered.** A reviewer arriving later cannot re-derive which tiers were exercised, and "tests pass" names none of them.
- **The draft opens with the branch; marking it ready is what waits on the sign-off.** A draft cannot be merged, so it is safe against the automerge — offering the work is the act that needs asking. → `rules/git-workflow.md` §8.
- **Push after every commit, not only before this step.** The PR reads the pushed head, so a fix committed and not pushed is a PR still showing the defect — and CI is measuring that head.
- **A rejected push means `main` moved.** Fetch, merge it down again — step 1 — **re-run the suite** against the new head, push again. Never `--force`.
- **The branch name is read, never typed.** `git branch --show-current` in the worktree; typing it is how a landing reaches the wrong branch.

## 9a — What the `updateInstead` push was for

**`main` is reached through a pull request and through nothing else.** The repository carries `receive.denyCurrentBranch=updateInstead`, which lets a worktree push straight onto a checked-out branch and moves that checkout's tree to match — a landing route for a feature branch, never for `main`.

The setting is still there and still useful for the one thing it does: moving the main checkout onto a branch it is not sitting on, without going to that directory. Treat it as a convenience, never as a way to skip step 9.

- **It refuses a dirty main checkout** — *"Working directory has unstaged changes"* — and that refusal is what makes it safe unattended: it will not overwrite work in progress there. Untracked files do not block it and are left alone.
- **The config is not versioned.** `git config` writes `.git/config`, which no clone inherits, so a fresh clone has none of it: `git config receive.denyCurrentBranch updateInstead`. Every worktree of one clone shares it.
- **`--receive-pack`, not `git -c`, if you ever need it inline.** `-c` configures the *sending* side and the setting is read by the receiving one; `git -c receive.denyCurrentBranch=updateInstead push .` is refused exactly like the unconfigured form.
- **A background job cannot reach the main checkout at all**: the harness refuses git aimed at the shared checkout, including `cd`, `-C` and reading `$CLAUDE_PROJECT_DIR`. This is not a reason to go looking for a form it does not catch — `gh pr` operates on the remote and needs no checkout at all, which is one more reason the PR is the route.

### `land_worktree.sh` merged onto the release branch

**It is superseded by step 9 and lands nothing to `main`.** What survives is its cleanup half, which step 10 calls: `stack_check.py` before a removal, and the refusal when a stack is still up.

## 10 — Clean up, in the same breath

```bash
git -C .claude/worktrees/<name> status --porcelain --ignored   # look first
(cd .claude/worktrees/<name> && node server/scripts/stack.mjs --compose down)
git worktree remove .claude/worktrees/<name>
git branch -d feature/<name>
```

**The stack goes down before the directory does, and that order is the point.** `git worktree remove` stops nothing: the Postgres and Redis it started keep running and the slot stays registered. The dev database is a tmpfs, so each abandoned pair holds RAM rather than disk. `.claude/scripts/stack_check.py` refuses the removal while they are up, and `land_worktree.sh` calls it — but nothing checks `ExitWorktree`, which is a harness tool, so this line is the one that covers the common case.

**Unless the session that did the work is the one inside that worktree** — then this step is not yours and not now, *even if you did the merge yourself* with the `updateInstead` push in step 9a. The worktree is locked while that session lives, so both lines fail after a merge that succeeded:

```text
fatal: cannot remove a locked working tree, lock reason: claude session <name> (pid …)
use 'remove -f -f' to override or unlock first
error: cannot delete branch 'feature/<name>' used by worktree at '…'
```

That is the same rule as "you cannot remove the worktree you are standing in" — it just arrives at the maintainer rather than at you, one minute after a merge that worked. Hand the two lines over as a *separate* step, to run once the session exits.

**`git worktree unlock <path>` is the remedy, and `remove -f -f` is not.** Git refuses a locked worktree **without checking whether the locking process is alive** — a lock naming a dead pid refuses exactly the same way. So "wait for the session to exit" is not sufficient on its own if the lock outlives it, which a crash leaves behind:

```bash
git worktree unlock .claude/worktrees/<name>   # only if the session is gone
git worktree remove .claude/worktrees/<name>
git branch -d feature/<name>
```

`remove -f -f` deletes the directory out from under a *running* session, so it is never the answer while one is live — and once the session is gone, `unlock` does the job without the force.

### `ExitWorktree` is how the session that owns the lock cleans up

**A session that entered a worktree with `EnterWorktree` is the only thing that can remove it, and `ExitWorktree` is the tool** — it drops the lock, deletes the directory and returns the session to the main checkout in one step. The `unlock`/`remove`/`branch -d` sequence above is for a worktree whose session is already gone.

**Its refusal counts commits against the branch's own base, not against the release branch**, so a fully-landed branch still reads as data loss:

```text
Worktree has 13 commits on <branch>. Removing will discard this work permanently.
```

All thirteen were on the branch they landed to and on origin. **Check before believing it, and check every branch the worktree has held** — not just the one `EnterWorktree` made, because a session that switched branches inside the worktree leaves the others behind:

```bash
git rev-list --count origin/main..<branch>   # 0 for each, then it is safe
git rev-list --count origin/<branch>..<branch>  # 0, so it is off this laptop
```

With those zero, `discard_changes: true` discards a ref and nothing else. With any of them non-zero it discards work — so run them rather than reasoning about whether the merge happened.

- **It removes only the branch `EnterWorktree` created.** Branches made *inside* the worktree survive and need their own `git branch -d` afterwards, from the main checkout. A long session that branched twice leaves two.
- **It only touches worktrees `EnterWorktree` made in this session.** One added by hand, or inherited from an earlier session, is the manual path above.
- **"Discarded N commits" is printed on success too.** It means the ref; the commits are wherever you merged them.
- **A background job cannot edit the shared checkout**, so `ExitWorktree` ends its ability to do further work — run it when the work is done, not to tidy up mid-task. `git switch -c` in the main checkout also moves the *maintainer's* working tree off the release branch; put it back if you do it by reflex.

### The rest of the cleanup

- **Reclaim the disk docker is holding, which is mostly build cache.** Nothing prunes it, and the images half is the smaller share.

  ```bash
  docker builder prune --filter until=168h -f
  docker image prune -f
  ```

  **Neither belongs to a worktree stack** - `server/compose.dev.yaml` builds nothing and declares no named volumes, so an abandoned pair costs RAM and not disk. This is housekeeping for the *shipped* stack's image builds, worth doing occasionally rather than per landing.
- **Look before removing**, with `--ignored`. `__pycache__/`, `.pytest_cache/`, `.ruff_cache/` and `.venv/` are regenerable and do not count; anything else in that listing is a reason to stop. **An ignored path can be the only copy of a measurement** — `worktree-round-four` carried `spike/_shots/`, eight screenshots behind a four-framework comparison, gitignored, existing nowhere else and warned about by no `git` command. A spike's *evidence* is exactly what lives under an ignore rule written for its *build output*.
- **A refused `git worktree remove` has already done half the job.** It exits non-zero with *"Directory not empty"* when an ignored path it will not delete is present — `.venv/` is the usual one — and by then it has **deleted every tracked file, unregistered the worktree, and removed `.git/worktrees/<name>`**. What is left is an orphan directory git no longer lists. The refusal takes `ui/node_modules` with it, so the next worktree needs a full `npm ci`, and `git -C <worktree> status` then answers *"not a git repository"* — which reads as corruption rather than a partial removal. The fix is `--force`, or `rm -rf` then `git worktree prune`. **So do the `--ignored` check *before* the first attempt** — after it, the evidence that check protects is already gone.
- **`git worktree prune` clears registrations whose directories are gone, and that is not safe from macOS any more.** `.claude/worktrees` is a Docker volume mounted only inside the dev container, so from the Mac every worktree reads as a missing directory and one prune drops the lot. **Run `--dry-run` first and read what it would deregister.** Inside the container the directories are there and it is harmless.
- **`-d`, never `-D`**, and from the main checkout, so the merge check is against the release branch rather than the worktree's own HEAD. `-d` refusing an unmerged branch is the only automatic check between tidying up and throwing work away.
- **Removing a worktree does not touch its branch.** The commits stay reachable and `git worktree add .claude/worktrees/<name> <branch>` brings a working copy back in seconds, so "a note depends on this branch" is not a reason to keep 1.2 GB checked out.
- **You cannot remove the worktree you are standing in.** git will do it, and the session's working directory then does not exist. Hand the two commands over instead.
- **Clean and merged does not mean unused.** `git worktree list` cannot tell you whether another session is live in one. Remove worktrees you created or ones the user named; leave anything outside `.claude/worktrees/` alone.

---

## Four ways this goes wrong, all seen here

Two are `rules/git-workflow.md` §4's — always loaded, so the full argument and the recovery commands are already in context and are not restated here (a second copy is how the traps guides went stale):

- **`visual-check` serves whichever checkout you launch it from** — run it from the worktree, or it reports the code *without* your change clean.
- **A dirty main checkout looks like someone else's work** — your own worktree being clean when you have just written a file is the tell; check `git status` in *both* trees before believing either.

The third belongs to landing, so it lives here:

### A patch belongs on its own branch, off the head it lands on

If the fix would still be wanted after your feature was abandoned, it is a patch. The trigger is ownership, not size.

```bash
git switch -c feature/<patch> origin/main   # off the *current* head
#   ...write the fix, test it, commit, review, land it...
git switch feature/<name>
git merge origin/main              # pull the patch back down
```

The fourth is this skill's own:

### A relative path resolves against the shell, not the repo

The Bash tool's working directory persists. Run `git worktree add .claude/worktrees/<new>` while standing *in another worktree* and it lands at `.claude/worktrees/<old>/.claude/worktrees/<new>` — registered, on the right branch, and nested inside a tree that is about to be removed.

**Absolute path, or `cd <repo-root>` first.** `git worktree list` is the check; the nesting is obvious there and invisible everywhere else.

---

## When a feature wants CI before it lands

**The gate fires on a pull request into `main` and on nothing else** — not on a push, and there is no dispatch to reach for. A draft PR is therefore how a branch gets CI at all, which is the second reason to open one early.

**It runs one platform, so a change touching filesystem semantics or path handling still has no second opinion coming.** Where the local suite models rather than executes the thing you changed, the options are to test it on the platform by hand or to say in the landing report that it is unverified. Do not land it quietly.
