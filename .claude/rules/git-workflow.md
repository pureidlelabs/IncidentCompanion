# Rules: branches, worktrees, review, and what reaches origin

*Read before starting work, merging, or pushing. `git log -S<symbol>` for the argument behind any rule. Sections are ordered by **when you read them**, not by git noun.*

## 1. The feature branch, and whether it needs a worktree

**A session starts by branching off what the work is against — usually `main`.** The unit of work is a feature, and the feature owns a branch for as long as it takes.

```bash
git switch -c feature/<what-it-is>     # off main, or off another feature branch
#   ... the first commit, which is as much work as the branch needs to exist
git push -u origin feature/<what-it-is>
gh pr create --repo pureidlelabs/IncidentCompanion --draft \
  --base main --head feature/<what-it-is> \
  --title "<what the feature is>" --body-file <path>
```

**The draft opens on the first commit, not on the tenth.** It is the branch's own page rather than a report on finished work — a draft cannot be merged, so opening one early is safe, and what the maintainer's sign-off gates is *marking it ready*. Leaving this to §8 put it far enough from the branch that it read as a landing step, which is exactly when it is too late to have been useful. → §8 for the body, the issue links and how to read a `Fixes` line back; §9 for why an unpushed branch is the larger risk.

**`gh pr create` refuses an empty branch** — *"No commits between main and feature/…"* — so the commit is genuinely first and this is not a sequence to run in one breath. What the rule asks is that the pull request exists from the first thing worth pushing, which in practice is the same moment.

**`feature/<what-it-is>` names the work, not the session.** `feature/ui-storyboard-refactor`, not `feature/tuesday` and not `feature/claude-3`. A second session picking the work up joins the branch rather than starting a parallel one.

**A feature branch may itself be branched from.** Work that only makes sense inside a larger feature branches off that feature rather than off `main`.

**The branch is yours; a worktree is a second directory, and you need one only when something else needs the first.** That is the whole test.

| Situation | Shape | Because |
| --- | --- | --- |
| One session, one feature | **the branch alone** | Nothing contends for the working directory. A worktree here buys nothing and costs §4. |
| Parallel agents | **a worktree each** | Two agents cannot share a working directory. This is the only thing a worktree is *for*. |
| Another session is live | **worktree** | A half-finished change in a shared tree is indistinguishable from theirs. |
| A throwaway spike | **worktree** | Abandon by deleting a directory rather than unpicking edits. |
| A background job | **worktree** | It cannot see whether you are live in the checkout. |
| Segmenting a feature you own | **worktree, if you want one** | A section per directory is allowed and merges back to the feature branch when it is done. |

- **Check before assuming you are alone.** `git worktree list` showing more than the main checkout, or a `git status` you did not cause, means the answer is a worktree. Both take one call; the cost of guessing wrong is another session's work.
- **The main checkout's `git status` is yours to read again.** That is the gain: an unexpected dirty file is a real signal instead of ambiguity between you and someone else.
- **Claude Code enforces one direction of this, and only one.** A session inside a worktree is refused an `Edit` or `Write` into the main checkout, and a git command redirected there through `git -C`, `--git-dir`, `GIT_DIR`, `GIT_WORK_TREE` or a `cd`. Subagents carry the same checks, which is what holds an agent in its own tree. → <https://code.claude.com/docs/en/worktrees>
- **Nothing enforces the other direction, and nothing enforces a shell write.** Two sessions both standing in the main checkout is the row above that no machine answers — read `git status` and `git worktree list` rather than assuming you are alone. And a redirection to an absolute main-checkout path from inside a worktree runs: `cd <main checkout> && echo x > file` was measured at rc=0 on 2026-08-31, with the file written. The documented working-directory check did not fire on it. That is §4's whole subject — `cp`, `sed -i`, shell redirection — so treat §4 as unguarded advice rather than something a check backs up.
- **No documentation exception in either direction.** `CLAUDE.md` and `rules/` are the files most likely to be edited by two sessions at once, so the row that governs them is the second one, not the first. **The one real exception is work the user asks to be done in place.**

## 2. Parallelising: the topology

**One prefix, and it names the work:** `feature/<what-it-is>`. A branch carrying one agent's slice of a feature is `feature/<the-feature>/<the-slice>`, so the branch list reads as a tree of what is being built rather than of who built it.

**Fanning out is a branch-topology decision, and there are two shapes.** *Flat* — each branch off `main`, landing on its own — for items that compose into nothing. *Nested* — agent branches off one `feature/<name>` branch — when the pieces compose into one behaviour, because then the composite diff is the only place a reviewer can see two implementations surviving side by side. **Choose by whether there is a composite to review, not by how many agents there are.**

**`--ff-only` is load-bearing at the `main` boundary and nowhere inside a feature.** Merge the slices down onto the feature branch however they land; merge `main` up into the feature whenever it moves. What reaches `main` is §8's business.

## 3. The review gate

**A branch that rewrote something is reviewed adversarially before it lands, and the reviewer is not its author.** The gap is the one a green suite creates: a branch whose tests certify a second implementation passes everything, and only a reader who distrusts the branch finds it.

Two tiers. Neither substitutes for the other.

| Tier | base..head | Catches |
| --- | --- | --- |
| Piece | `feature/<name>..feature/<name>/<slice>` | What one agent wrote and abandoned; a test pointed at nothing. |
| Composite | `main..feature/<name>` | **Two implementations side by side**; the shipping path running agent A's module while agent B's tests certify it. |

- **The composite tier only exists in the nested shape.** That is what the session branch's extra suite run buys — not tidiness, and not revertability.
- **Review after the merge-down, not before.** The tree you review has to be the tree you ship; `main` moved while the agents worked.

**Two passes, and they catch different classes.** One reads the diff for reuse, simplification and altitude — the cheapest defect to fix is the one in code you delete instead — and runs first, on a branch that *built* something. The other distrusts the branch and hunts defects. **Neither asks whether the feature should exist in that shape**, which is the gap above both and the one only a person closes.

**Both run in a context that did not write the code.** A reviewer that produced the diff is grading its own reasoning, and it passes.

**Nothing enforces this.** Run the review because the branch needs one, not because something asks.

**It is owed only when the branch touched something a defect can ship through**, and that is a path list rather than a judgement: `.claude/hooks/`, `.claude/scripts/`, `server/src/`, `ui/src/`, `docker/` and `compose.yaml`. A branch of nothing but prose, skills, rules, tests or stories lands unreviewed — a test cannot fail open into the product, and demanding the adversarial pass for a specification edit is what made the gate read as a tax. **A mixed diff takes the union**: one screen among forty notes still owes the review.

**Depth is the judgement**: an extension gets a short pass, a rewrite gets the full walk. **The lint gate does not scale with it** — a lint is a fact, so every branch owes one.

## 4. You are not in the worktree you just made

**`git worktree add` does not move you, and the Bash tool's working directory persists between calls.** Every relative path after it — `cat >> tests/foo.py`, `cp`, `sed -i`, `./test.sh`, a `python` heredoc — resolves against wherever you were standing.

**Persistence itself is not guaranteed — an agent thread resets cwd to the repo root on every call, `cd` included.** The fix holds for both: absolute paths, or an inline `cd` on the same command.

The cause is easy to know; the *consequence* is what goes unrecognised, and it arrives in these shapes:

1. **A class from a deleted module was still importable** — the edit deleting it had gone to the other tree.
2. **A worktree was clean immediately after writing a file to it.**
3. **A visual-check baseline already contained the change it was supposed to predate.**

**So the check is not "did I remember the rule" but "does what I am seeing make sense".** A result that can only be true in the other tree is the signal — treat it as a wrong-directory symptom before you treat it as a bug.

- **A worktree is cut from the feature branch the session is on, never from `main`** (`worktree.baseRef: head`, set in `.claude/settings.json`, which is what makes `EnterWorktree` branch from where the session stands). A worktree exists so agents can work in parallel on the feature the session already has, so the feature branch is its base.
- **Bringing `main` into a feature branch is the session's act, and never an agent's.** A worktree cut from `main` picks up whatever landed while the agents worked, and merging that slice back into the feature performs the `main` merge as a side effect — settled by an agent that does not know the feature, at a moment nobody chose, and arriving where the session has no reason to look for it. → §8, step 1, which is where that merge belongs and who owns it.
- **The cost of `head` sits at the other end**: a *new* feature takes whatever the local branch is at, stale included. Bring it up to date before making the worktree rather than after.
- **When `ExitWorktree`'s remove refuses because the branch reads ahead of its base**, check `git log <base>..<branch>` — empty means merged — and remove with `ExitWorktree keep` plus `git worktree remove` and `git branch -d`, which keeps `-d` as the real check.
- **`git worktree add` takes the path relative to *your cwd*, and succeeds.** Run from `ui/`, it creates `ui/.claude/worktrees/<name>` — a real worktree in a directory nothing else looks in. Use `"$(git rev-parse --show-toplevel)/.claude/worktrees/<name>"`.
- **An inline `cd` to *another tree* persists exactly as well as one into your own**, and every later command reads the wrong checkout — which looks exactly like `git stash pop` having eaten the work. `pwd` answers it in one call; the recovery reflex answers it in ten.
- **`cd` into it as the first command after creating it, and `pwd` before the first write.** Edit and Write take absolute paths; it is shell redirection, `cp`, `sed -i` and inline scripts that inherit the wrong directory silently.
- **A script that edits a file fails silently**, in ways no tool reports: an anchor that does not match exits 0, Read caches and normalises, `ugrep` and `rg -r` lie about what a file holds, and a typed character can arrive as a NUL or as CJK. Edit is the default and a script is the exception.
- **The symptom is camouflaged by §5.** A dirty main checkout and a clean worktree is exactly what another session's in-flight edit looks like. Run `git status` in **both** trees; your own worktree being clean when you have just written a file is the tell.
- **`visual-check` serves whichever checkout you launch it from.** Run from the main checkout while your change sits in a worktree, it captures the code *without* your change and reports it clean. A `--baseline` recorded from a tree that already holds the change is not a baseline either.
- Recover rather than committing from the wrong tree: `git diff <paths> > /tmp/x.patch`, `git -C <worktree> apply /tmp/x.patch`, then restore. **Check both trees afterwards** — work splits across them, with the Edit-tool changes in one and the script-driven ones in the other.
- **Merging, pushing and cleaning up happen in the main checkout**, so a completed piece of work ends with `cd <repo-root>` and the next task starts there.

## 5. While another session is live

Another Claude Code session (or a human) may be working in this checkout.

- **Check `git status` before reacting to a file changing underneath you.**
- **An agent you spawned is one of them, and a *read-only* agent is not read-only about the tree.** An agent proving a claim by mutation edits a file, runs a suite, and restores from `HEAD` — taking any uncommitted change in that file with it, unwarned, and the loss reads exactly like the edit never having applied. **So commit before you delegate**, and keep your own edits out of any file an agent is probing. A mutation-based reviewer and an editor cannot share a file, and the reviewer is the one that restores from `HEAD`.
- A `./test.sh` failure in a test you did not write may be an in-progress edit. Treat it as unrelated only when sure: re-run once, diff the failing test's own file. Any doubt, chase it down.
- A brand-new test that is not yours can legitimately fail mid-flight — everyone here writes the test before the fix. Confirm it is genuinely new and that neither it nor the path it exercises overlaps your diff.
- **Re-run a visual-check sweep against current `HEAD` before you *act* on a finding**, not just before reporting one. A sweep reported the Timeline kill chain chip at 2.59:1; by the time it was worked through the chip had moved onto `app-kc-*` tokens and the finding no longer existed. What was nearly built on it was a change to `COLOR_PALETTE` — persisted per entry, no migration layer, feeding the graphs and the swatch picker. The cheap check is one `shot` or a single-section `findings()`.

## 6. Committing

- **A backtick in `git commit -m "..."` runs as a command, and the commit still lands.** This project's message style is full of them — module names, symbols, `[[wikilinks]]`. The shell prints an unrelated-looking `no matches found` **before** the commit succeeds, and the follow-up commit is then a no-op on a clean tree, which reads exactly like the fix having worked. **Write the message to a file and use `-F`**, or single-quote it. Verify with `git log -1 --format=%B | python3 -c "...repr..."`; `cat -A` is unavailable on macOS, and the corruption is invisible in normal output because what is missing simply is not there.
- **`git add -A` sweeps up everything else in flight**, so **name the paths on the `git add` line** whenever the tree holds more than the change you are describing — on a long session, always. The shorthand stages by *state* where the message is about *intent*.
- **`git commit -am` on a throwaway branch stages your real branch's uncommitted work.** `-a` stages every modified tracked file, not the one you edited. Commit the real work first, or probe in a separate clone.

## 7. Undoing

- **`git checkout -- <path>` and `git restore <path>` destroy uncommitted work in that path, silently.** Commit or diff to a patch file first — the recovery costs ten commands and the check costs one.
- **`git checkout <commit> -- <path>` restores files and never deletes them**, so recovering a lost commit brings back the files it *removed* — silently un-resolving a merge that was resolved by deleting them. Check `git status` after any such recovery.

## 7a. The specifications move with the branch

**`openspec/changes/` is the in-flight form and `openspec/specs/` is the landed truth.** While a branch is live its spec work is a delta under `openspec/changes/<id>/` — the proposal, the delta spec, the design where the choice was live, the tasks. `specs/` is not edited by hand on a branch; it is written by the sync at the end. That is what makes `specs/` answerable as *what the application does today* rather than what somebody intends.

```bash
npx --yes @fission-ai/openspec@latest validate --strict   # before the merge
```

- **Every branch touching `openspec/` owes a clean `validate --strict`**, at the same moment as the lint. → §8
- **Sync, then archive, then land** — the change folds into `specs/`, the change moves to `changes/archive/`, and both land in the branch's own commits. A change archived after the merge is one `main` never carried.
- **A wording fix is not a change.** Editing `specs/` directly is right when every requirement still says the same thing: a typo, a clearer sentence, a cross-reference. The moment a requirement is added, removed or altered, it is a change.

## 8. The draft pull request, and landing

**The draft pull request opened in §1** is the branch's own page: what the work is, which issues it is picking up, and the surface CI runs on. The commands are there, beside the branch that needs one; what is here is everything read while landing rather than while starting.

**A draft cannot be merged**, by GitHub, which is what makes opening one early safe against an automerge. Marking it ready is the act that offers the work, and that is the one the maintainer's sign-off gates — not the opening.

**The pull request is enforced; the green build is not, yet.** A ruleset on the default branch refuses deletion, non-fast-forward pushes and any merge that did not arrive by pull request. It carries **no required status check on purpose** — requiring one, and automerging on it, waits until the pipeline has been watched long enough to be trusted with the decision. Until then a red build can merge and the person merging is the check.

Read the ruleset rather than assuming: the legacy branch-protection endpoint answers 404 whatever is configured, so `gh api /repos/{owner}/{repo}/rulesets` is where it lives.

**Issues are linked to the PR as they are picked up**, which is what fills each issue's Development panel. Editing the body is the whole of it:

- `Fixes #n` for an issue this branch closes. GitHub closes it when the PR merges, which is exactly when the fix reaches `main` — so this and §9a's rule are the same rule.
- A bare `#n` for one it only touches: a decision it raised, a tracking issue it advances but does not finish.

**Read the link back, because a keyword that did not take fails silently.** `Fixes #n` is prose: a typo, the wrong verb or an issue in another repository all render as ordinary text and link nothing, and the PR looks right either way.

```bash
gh pr view <n> --repo pureidlelabs/IncidentCompanion \
  --json closingIssuesReferences --jq '[.closingIssuesReferences[].number] | sort'
```

Every issue meant to close is in that list, or the body is wrong.

**There is no API that links an existing branch to an issue.** `createLinkedBranch` only ever creates a new one — the schema calls `oid` *the commit SHA to base the new branch on*. The pull request is the supported route, and deleting a branch to free its name for that mutation trades a safe state for a sidebar entry.

### Landing it

1. **Merge `main` up into the feature** and settle any conflict there, so what is reviewed is what ships.
2. **Run the suites locally.** CI runs the same ground on the pull request, but only there — a push fires nothing, so a local run is the difference between finding a break now and finding it after the branch is offered. → the lint gate below.
3. **Mark the draft ready as soon as the feature is ready to start landing** — the work finished, the suites green locally — and **then watch the build**. This does not wait on the maintainer. Marking ready is what fires the gate at all, so holding it back for a sign-off means asking somebody to approve a feature nothing has yet certified; the sign-off belongs at step 4, on a diff whose build has already reported.
4. **Green, so approve it.** The gate on the pull request is what decides; the approval says a person read the diff as well. **Nothing merges it for you while the check is unrequired**, so the merge is a deliberate act rather than a consequence of going green.

**Watching the build is part of step 3, not a thing that happens to you.** A run that is offered and not read is the same as one that never ran — and the tiers each report separately, so a green summary alongside a tier that skipped for the wrong reason is a real state.

**A red suite is a PR that stays a draft.** The whole value of step 2 is that it runs before the work is offered rather than after — CI will reach the same answer, later, in front of everybody.

**Nothing here is automatic.** No hook opens the PR, none marks it ready, and none refuses the approval. → §3.

The rest of the procedure lives in the `land` skill (`skills/land/SKILL.md`), which loads when you land rather than in every session: the merge, the `updateInstead` push a worktree lands its own work with, the hand-over when it cannot, the locked-worktree remedy, `ExitWorktree`, and the cleanup. The ownership test a patch is judged by and the pipeline that deleted a worktree holding an unmerged commit are both there.

Two decisions stay here, because they are read while planning rather than while landing:

- **A worktree's stack outlives the worktree.** `git worktree remove` stops no container, frees no volume and releases no slot, and nothing reports it. `.claude/scripts/stack_check.py` refuses the removal while containers are up and prints the teardown; `land_worktree.sh` calls it before removing anything and fails closed when it cannot. `INCIDENTCOMPANION_ALLOW_ABANDONED_STACK=1` is the exception. → the `land` skill's cleanup.
- **`-d`, never `-D`.** Refusing an unmerged branch is the only automatic check between tidying up and throwing work away. Run it from the main checkout so the check is against `main` rather than the worktree's own HEAD.
- **Nothing gates the merge or the push.** The review in §3 and the lint below are both owed and neither is enforced — see §3.
- **Zero lint errors is the gate, and `test_scope.py` prints both commands at every landing.** Run them.

## 9. What reaches origin

**There is one remote and it is public.** `origin` is `pureidlelabs/IncidentCompanion`, and everything below happens in the open.

| Repository | Holds | Visibility |
| --- | --- | --- |
| `pureidlelabs/IncidentCompanion` — **`origin`** | every branch, every issue, all development from here | **public** |
| `pureidle/IncidentCompanion-private` | the development history up to the move, frozen | private, archived, never pushed to |

**The history before the move was never published and never will be.** The public repository received the tree as a single commit, not this history rewritten or filtered, so no commit message, branch name or merge from before the move is public. The archive holds them and stays private. Nothing is pushed to it, nothing is merged into it, and a branch cut from it is a mistake.

**Everything after the move is published as you write it.** A branch name, a commit message, an issue title and a pull request body are all world-readable the moment they leave the laptop -- there is no later release that publishes them, because the publishing already happened. So `CLAUDE.local.md`'s rule about what may not go in the repository governs the history as well as the tree, and it governs it *now* rather than at some point before v1.0.

Check rather than assume:

```bash
gh repo view pureidlelabs/IncidentCompanion --json visibility,defaultBranchRef
```

**A public repository does not mean a cautious one.** Push a branch, open an issue, get it wrong and fix it in the next commit -- that posture is unchanged, and it was never really about who could see. An unpushed branch exists on one laptop, and that is still the larger risk by far.

| Ref | Reaches origin | Why |
| --- | --- | --- |
| `feature/*` | **yes, unasked, after every commit** | Code on GitHub is code that is safe. Public is not a reason to hold it back; a private laptop is not a backup. |
| `main` | **pull request only, and the ruleset refuses anything else** | → §8. |

```bash
git push origin "$(git branch --show-current)"
```

**Strangers cannot write here.** Public grants read. A branch, a push or a pull request from inside this repository requires write access, which is the organisation's members and nobody else -- so the branch rules govern you, not the internet. What an outsider can do is fork, open a pull request from their fork, and file issues, and the controls for that are the fork-approval setting and interaction limits rather than anything in this file.

**Push after the commit, not after the tier.** Holding a finished commit back until some larger unit is done is the failure this rule exists to prevent, and it looks like diligence from the inside.

**A branch that has landed is deleted, and the remote half is automatic.** `delete_branch_on_merge` is on, so merging removes the remote branch; the local copy is yours to delete. Pushing freely and never tidying is how a branch list stops being readable, and an unreadable one is worse than no list: nobody can tell what is in flight from what was abandoned in July.

```bash
git branch -d feature/<name>    # -d, never -D. The remote copy is already gone.
```

- **`-d`, never `-D`.** Refusing an unmerged branch is the only automatic check between tidying up and throwing work away. §8 says the same and means it more now that pushing is free.
- **A branch that never merged still has both copies.** The setting fires on a merge and on nothing else, so an abandoned branch is the case that still needs `git push origin --delete`. `git branch -r` is the list to read.
- **A branch kept on purpose gets a reason**, told to the maintainer or written in the issue it belongs to. A spike worth keeping is not the same as one nobody got round to deleting, and from the outside they look identical.

**What did not relax:** the review gate in §3, the lint gate in §8, and `main`.

## 9a. Issues are how work is tracked

**A GitHub issue on `origin` is the unit of work**, in the open, like everything else in §9. What is being done, what is waiting and what was decided is answerable from the issue list rather than from a transcript.

```bash
gh issue list --repo pureidlelabs/IncidentCompanion   # what is open
gh issue create --repo pureidlelabs/IncidentCompanion --title "..." --body-file <path>
gh issue comment <n> --repo pureidlelabs/IncidentCompanion --body-file <path>
```

**An issue is the work; a change is the specification delta it produces.** They are not alternatives. Work that alters what the application must do gets an issue *and* a change under `openspec/changes/` — the issue is what somebody picks up and closes, the change carries the delta and the reasoning an issue cannot hold, and §7a folds it into `openspec/specs/` at landing. Work that alters no requirement is an issue alone.

**An issue is closed by reaching `main`, not by being fixed.** A fix living on a feature branch is not in the product, and an issue closed at that moment reads as done to anyone looking at the list — including whoever is deciding what is left before a release. Flag it instead:

```bash
gh issue edit <n> --repo pureidlelabs/IncidentCompanion --add-label fixed-on-branch
gh issue comment <n> --repo pureidlelabs/IncidentCompanion --body-file <path>
gh pr edit <pr> --repo pureidlelabs/IncidentCompanion --body-file <path>   # add `Fixes #n`
```

**All three, or none of it works.** The label is what a list reads, the comment is what a person reads, and the `Fixes` line is what GitHub reads — it fills the Development panel and closes the issue on merge, which is the moment the fix reaches `main`. Verify the last one took. → §8.

The comment names **the branch, the commit and the pull request**, so the issue answers *where is this* rather than only *is this done*.

**A `decision` label comes off when the decision is made.** It means *do not resolve this by picking*; once the maintainer has picked, leaving it there tells the next reader the question is still open. Take it off in the same edit that adds `fixed-on-branch`, and say in the comment what was decided and why the other way was not taken — the issue is where that argument stays reachable once the diff has scrolled away.

**Search before filing, and act on what comes back.**

```bash
gh issue list --repo pureidlelabs/IncidentCompanion --state all --search "<the symptom>"
```

- **One open → add to it**, commenting with what is new, or editing the body where the finding has changed shape.
- **One closed → comment there rather than filing again.**
- **None → file it.**

`--state all` is not the default, and titles and bodies are both searched — so search the symptom rather than the title you were about to write. `in:title` narrows where a common word drowns the result.

**File one before starting, not after.** An issue opened at the end is a record; one opened at the start is where the evidence, the count that moved and the cause that turned out to be something else get written down while they are fresh.

**Where the code contradicts a specification, that is an issue.** The specification is the statement of intent and the code is what needs changing, so the issue names the requirement it fails and what it does instead. Deciding to amend the requirement instead is a legitimate outcome, and it is a change.

- **Read them at the start of a session**, and **comment as the work happens**. A count that moved or a cause that turned out to be something else goes on the issue while it is fresh; the transcript is not a progress record.
- **The evidence and the command that produced it go in the body**, on the same standard as any claim here.
- **Type it, and never label who filed it.** Every issue carries exactly one of `bug`, `enhancement`, `chore` or `documentation`, which is what the forms in `.github/ISSUE_TEMPLATE/` set for you. Provenance is not a label: nobody filters on it to decide what to work on, and a form whose only label said who wrote it filed issues with no type at all.
- **A label earns its place by changing what somebody does.** One from each axis, and no axis GitHub already models — priority is a milestone, owner is an assignee, and a closing reason is *close as not planned*. `fixed-on-branch` is the exception that proves it: no GitHub state means *fixed, not yet landed*.
- **`security` is a property with no known attack**, and a demonstrated way through says so in the body rather than in a second label.
- **What an issue may not contain is §9's rule, not a reason to file elsewhere.** Employment, nationality, budget, direct quotes and readings of how somebody behaves stay out of the tracker as they stay out of the tree.

- **`main` is the branch a feature is cut from and returns to.** Anything still naming `dev` in `rules/`, `.claude/skills/` or a script means `main`.
- **Push the branch, including commits that are not yours.** Another session may have merged and not yet pushed; their commit is on the same shared branch.

## 9b. Code scanning files its own findings

**CodeQL posts to the Security tab rather than to the tracker**, so nothing surfaces an alert the way an issue surfaces work.

```bash
gh api /repos/pureidlelabs/IncidentCompanion/code-scanning/alerts --paginate \
  -q '.[] | [.number, .state, .rule.id, .most_recent_instance.location.path] | @tsv'
```

**A verdict on an alert is a claim, so it carries the command that produced it** — the same standard as anything else here. Read the flagged line and the guard it belongs to; a rule firing on a test assertion, a dev script or a pattern CodeQL models by an old default is a false positive, and saying so needs the measurement rather than the reasoning.

**Dismiss with the measurement, not with a category.** `false positive`, `used in tests` and `won't fix` are all the API offers, and none of the three is an argument; the comment beside it is where the evidence goes, because the alert is the only place a later reader looks for it.

```bash
gh api -X PATCH /repos/pureidlelabs/IncidentCompanion/code-scanning/alerts/<n> \
  -f state=dismissed -f dismissed_reason='false positive' -f dismissed_comment='<the evidence>'
```

**The comment is capped at 280 characters and the call fails rather than truncating**, with a 422 naming the length. So the evidence is trimmed to the measurement that settles it — the command and what it printed — and the reasoning stays in the pull request that acted on it.

**A real one becomes an issue and takes the ordinary route** — the test first, the branch, the `Fixes` line — and closes when the pull request merges, which is also what closes the alert.

**No hook here refuses anything.** What refuses a main-checkout write from inside a worktree is Claude Code's own isolation, not the project's — see §1. Everything else in this file is a rule you follow because it is right, not because something catches you.
