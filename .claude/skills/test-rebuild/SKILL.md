---
name: test-rebuild
description: Rebuild one capability's tests from its specification — derive what should be tested before reading any existing test, classify what is there by the oracle it answers to, and reconcile into write, keep and cut. Use for one capability at a time, when the question is whether the tests prove anything rather than whether they pass. The failure mode is reading the suite first, which produces a tidier version of what is already there.
---

# Rebuilding a capability's tests

**One capability, derived from its specification, reconciled against what exists.** The output is three lists — what to write, what to keep and cite, what to cut — and a ledger that says which scenarios are demonstrated.

**This is not a tidying pass.** The question is not whether the tests pass or read well. It is whether they can be wrong: whether anything about them would fail if the application were incorrect rather than merely different from yesterday.

## The order, which is the whole method

1. **Read the capability's `spec.md`. Nothing else.**
2. **Write what should be tested, to a file, before opening a single test.**
3. **Then** inventory what exists.
4. **Then** reconcile.

**Step 2 before step 3 is not a preference.** Read the existing tests first and every one of them will look justified — they were written by somebody with reasons — and the output becomes a tidier arrangement of the current suite. Writing the derived list to a file first also makes the order checkable afterwards, by somebody who was not there.

The evidence that this matters: in the pilot, the two properties the capability most needed turned out to be the two nothing tested. They reached the derived list only because nothing had yet shown they were absent.

## What a test's oracle is

**Where its notion of correct comes from.** A test written by reading the code has the code as its oracle: it detects change, never wrongness, and will hold a defect in place forever while passing.

Classify every test as exactly one of these. Be strict — the classes are only useful if the boundaries hold.

| | Oracle | Test |
| --- | --- | --- |
| **world** | An external published authority, read at test time | Does it *read* the standard, or hard-code a value from it? A hard-coded literal is an example. |
| **specification** | A scenario written before the code | Was it? A scenario written afterwards from the implementation is not this. |
| **invariant** | A property holding without knowing the right answer | Round trip, idempotence, conservation, commutativity, monotonicity. A hand-written expected value is never this. |
| **enumerated** | The subject list comes from a registry, schema or generated document | A hard-coded list of subjects is not enumerated, however long. |
| **adversarial** | Asserts something must *not* happen | A refusal, a boundary, an injection defeated. |
| **change-detector** | The code's past behaviour | Would it need editing if the behaviour legitimately changed? Then it is this. |

Only the first five can ever be cited as a demonstration. The last is regression safety, which is worth having and is not evidence.

## Deriving what should be tested

Read each requirement and ask **what would falsify it**, not what would exercise it.

**The question that does the most work: does this requirement quantify?** A requirement saying "a collection exported can be imported" is falsified by *any* collection, so the test iterates the registry rather than picking one and hoping. Most requirements in this project quantify and most tests do not, which is why the counts come out so far apart.

Look for these, in this order, because they are strongest first:

- **A property that needs no expected value.** Round trip, idempotence, conservation. Conservation is the most overlooked: *every row in the file is accounted for in the report*, *every reference either resolves or is counted*. It is what turns "never silently" from a promise into a check.
- **A relation between two paths.** The same act through two doors must reach the same answer — an import and an ordinary write refusing the same stale version. This is the shape that catches one path bypassing a guard, which is the defect class that matters on a write path.
- **A standard that is not ours.** Unicode categories, a published schema, a regulation's text. If the requirement rests on somebody else's definition, the test should read theirs.
- **A subject list that should not be hand-written.** Anything the application already enumerates — collections, vocabularies, routes, schema fields.
- **What must not happen.** The "must not" space is more stable than the "must" space, so these age well.

**Record a scenario nothing can demonstrate as undemonstrable** rather than inventing a weak test for it. Asserting that work did *not* happen, or that a refusal revealed nothing by its timing, is usually beyond a suite. The constitution requires these to be recorded rather than quietly counted, and `openspec/matrix/scenarios.md` has the status for it.

## Inventorying what exists

Delegate this — it is wide, mechanical reading, and the reconciliation is the part that needs judgement. **Do not show the agent the derived list**, or the comparison becomes a search for agreement.

Ask for, per test case: the file and test name verbatim, what it *actually* asserts in one clause, its oracle class from *What a test's oracle is*, whether it quantifies or exemplifies, and whether it asserts on a mock being called. Then ask for three summaries: counts per class, which tests genuinely quantify, and **any test whose assertion is weaker than its name implies**.

That last one earns its place. In the pilot it found three, including a test named `carries every column the table has` whose docstring warned against hand-written column lists and whose assertion was a hand-written column list.

## Reconciling

Three lists.

**Write** — derived items nothing demonstrates. Expect these to be mostly invariants, because invariants are what nobody writes without being asked.

**Keep and cite** — existing tests with an oracle independent of the implementation that demonstrate something the spec asks for. These become the ledger's `demonstrated` rows. Cite the path; the ledger's test checks it exists.

**Cut** — in descending order of confidence:

- Tests pinning behaviour the specification now contradicts. These are worse than useless: they will fail when the code is corrected, and read as the correction being wrong.
- Tests asserting framework metadata rather than behaviour — module wiring arrays, route decorator metadata.
- Tests asserting a collaborator was called.
- Self-labelled sanity or smoke checks.
- Example clusters a quantified test subsumes. Judgement, not arithmetic — say so.

## The traps

**Asserting the constant against itself.** The obvious repair for a hand-written list is to derive it from the same source the code uses, which tests nothing. Ask "independent of *what*?" out loud each time. In the pilot the answer was the database's own `information_schema` rather than the ORM's view of the table.

**Naming a culprit before finishing the investigation.** A per-capability pass surfaces code findings, and a surfaced finding is a hypothesis about a cause. In the pilot a duplicated CSV parser looked like the defect; the client was in fact correct, the server was wrong, and the fix was one option flag rather than deleting a module. The finding was real and the direction was inverted.

**Trusting a docstring about what a test asserts.** Read the assertion. Three of the pilot's findings were tests whose names and docstrings claimed a property the body did not have — which is the same failure the audit-logging comments once had, where a guarantee was documented and gone.

**Counting a green suite as evidence.** It is the state of the tree, not proof of a requirement. The constitution says a test written against an implementation is not evidence that a specification is met, however much of the implementation it covers.

## Where the state lives, so a session can pick this up cold

**`openspec/matrix/scenarios.md`** holds every scenario and its status, and `tests/docs/test_scenario_ledger.py` holds it against the specifications. A session reads it and knows what is demonstrated without reading anybody's notes. Update it in the same commit as the tests it describes; a `demonstrated` row must cite a path that exists.

**The issue list** holds which capabilities are done and what each pass found. → `rules/git-workflow.md` §9a.

**Nothing else is written down.** The derived list is scratch and dies with the job — its conclusions live in the tests that were written, the ledger rows that were filled, and the issues that were filed.

## When a capability is done

Every scenario in it carries a status that is not the default, each `demonstrated` one cites something that exists, and each `undemonstrable` one carries a reason a later reader can judge. The cut list is applied. Anything the pass found about the code is an issue rather than a note.

**A capability with far more tests than scenarios is not finished by counting.** The pilot ended at 174 tests for 21 scenarios with 25 derived — the number that matters is how many scenarios can be shown false, not how many tests exist.
