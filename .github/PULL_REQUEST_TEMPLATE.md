<!-- One finished feature, opened after the maintainer has signed off on it.
     A branch nobody has said is finished does not get a pull request, however
     green it is. -> rules/git-workflow.md §8 -->

## What this changes, and why

<!-- The outcome a reader needs before they open the diff, in a few sentences.
     The argument belongs in the commit messages; do not repeat it here.
     Link the issue: Closes #123. "None" is an answer. -->

## The run that says it passes

<!-- No tier here is enforced, so an approval is a claim about a run somebody
     did. This is the evidence for that claim rather than the claim itself.

     Paste the command and the "what ran" block, including its skipped lines.
     A tier that declined to run is not a tier that passed: name the ones that
     did not, and why. -->

```console

```

## What else this reaches

<!-- Other call sites, other tiers, the same shape elsewhere, another session's
     branch. "Not looked" is an answer; blank is not. -->

## Where the claims went

<!-- Behaviour the application owes -> a spec. Why it is met this way -> a design
     record. A measurement that decided something -> the commit that acted on it.
     Assertable about the code -> a test. Derivable by reading it -> nowhere.
     -> rules/claim-homes.md

     "Nothing to file" is an answer. -->

## For whoever reviews it

<!-- What you would want pointed out if you were reading this cold. The decision
     you are least sure of, the thing that looks wrong and is not, the file to
     start in. -->

## Before it is approved

- [ ] Zero lint errors, and `test_scope.py` prints the commands. → §8
- [ ] `npx --yes @fission-ai/openspec@latest validate --strict` is clean, if anything under `openspec/` moved. → §7a
- [ ] Reviewed adversarially by a context that did not write it, if the diff touches `.claude/hooks/`, `.claude/scripts/`, `server/src/`, `ui/src/`, `docker/` or `compose.yaml`. A diff of only prose, skills, rules, tests or stories does not owe one. → §3
- [ ] Every fix and new behaviour owes a test written before it, and the mutation that proves the test connected was shown to apply.
- [ ] Nothing person-bound reaches the tree: employment, nationality, budget, direct quotes, or a reading of how somebody behaves.
