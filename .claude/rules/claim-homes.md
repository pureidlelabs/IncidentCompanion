# Rules: where a claim goes

*Read before writing a requirement, a docstring, a comment or a skill section.*

**This project is specification-driven.** What the application must do is described in `openspec/`, and the code is what answers to that description rather than the other way round. Where the two disagree, the specification is the statement of intent and the code is what needs changing — unless the specification is wrong, in which case it is amended deliberately and the change says why.

That decides where almost everything goes. Try these in order and stop at the first that fits.

**On a live branch, rules 2 and 3 aim at the change rather than at `specs/`.** The delta lives in `openspec/changes/<id>/` until the branch lands and the sync folds it in. → `rules/git-workflow.md` §7a

1. **A rule that constrains work not yet done → `openspec/constitution.md`.** An article states a property the system must have, never the mechanism that achieves it and never what the code does today. A sentence describing the present tree is a specification, not an article.

2. **Behaviour the application owes → `openspec/specs/<capability>/spec.md`.** A requirement, with the scenarios that would show it false. Observable behaviour only: not internal names, not library choices, and nothing that could change without the behaviour changing.

3. **How that behaviour is achieved → `openspec/specs/<capability>/design.md`.** The specification is the high-level design: what the application must do, in terms the analyst reading it would recognise. The design record is the low-level one: the rules and structures that make it true, concrete enough to build from. Mechanism belongs here and nowhere in a specification.

   **Rules and structures, never names.** *Every write carries a version, and a write that matches nothing is an answer rather than an error* is a low-level requirement. The module implementing it, the table it lives in and the column it is called are not: an externally visible name is part of a contract and belongs in the specification, and an internal one is derivable, so writing it down is how a record starts drifting from the thing it describes.

   **No rejected alternatives, but scope is recorded.** A mechanism decided against is a road not taken.

   **A choice that sets where the system stops is different, and it is recorded.** *The application assesses and the organisation reports*; *the set of audiences is closed*; *there is no migration layer yet*. A boundary is a live constraint on work not yet done, and one nobody wrote down reads as an oversight. State the boundary, not the debate that arrived at it.

   **Scope leads the file.** A design record opens with `# Scope` — where the system stops, what it does not do, what is derived rather than stated — and then `# Design`. OpenSpec constrains only `spec.md`, so the shape of this file is ours.

4. **Assertable about the code → a test.** Its name is the claim, and it goes red rather than quietly wrong.

5. **Derivable by reading the code → nowhere.** Regenerate it when it is wanted. What a case holds, what a field accepts, which vocabularies exist — all of it comes from the schemas that already validate every write, so writing it down makes a second description that drifts from the one doing the work.

6. **Procedural → the skill for that action.** A practice has no file to govern, so a path glob for it either misses or fires on everything.

7. **A rule holding across every tier and every task → `rules/`,** which is here. Four of them, and the bar is that no glob can express it.

**The first three are written in the desired state, never the present one.** A constitution article, a requirement and a design record are all read *before* the work, by somebody deciding what to build.

The tell is the tense and a handful of words: *already*, *today*, *currently*, *no shipped X does this*, *it works that way*. Each states a fact about the present rather than a property the system must have.

**Reading the code is right; writing down what you read is not.** Evidence from the implementation is what makes a decision well-founded — which options are cheap, what a mechanism can and cannot express, where a boundary already falls. That evidence belongs in the reasoning as an argument, not in the record as a description. *"An audience must be a value, not a sentence, because a rule cannot be written against a summary line"* is a design decision; *"every layout already names its reader in a summary"* is reportage that will be wrong the first time somebody adds one.

**What survives none of these is probably not worth writing.** Most of what fails every test above is derivable, restates a test, or is history a commit message already holds.

**A measurement that decided something goes in the commit message that acted on it.** The number is evidence for a change; the change is where a reader looks for it, and `git log -S` finds it by the symbol it moved.

**A note prescribing a command has made a claim about that command.** Run it against the failure it describes before writing it down — a tier that serves a stale build cannot see the defect the note is about, and the advice lands inert.
