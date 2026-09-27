# Design

## Context

See `proposal.md` for motivation and `specs/dependencies/spec.md` for the requirements.

Two constraints shape everything below.

**There is no continuous integration, and the verification suite cannot run without a stack.** `verify.sh` is the gate, it needs Postgres and Redis listening, and it reports a tier that declined to run separately from one that failed. A hosted runner cannot observe that gate without building the whole stack, which is the cost the project has repeatedly chosen not to pay.

**The suite declines rather than fails when the stack is absent.** A substantial share of the server files are skipped when nothing is listening, and the run still exits successfully. This is why the specification requires a tier that did not run to be reported as undemonstrated: the failure mode is a green run that exercised almost nothing.

## Goals / Non-Goals

**Goals.** Discovery, policy and the standing record are automated and answerable without a person. Adoption is decided by a person and demonstrated locally.

**Non-Goals.** Automatic merging is out of scope while no observable gate exists. The gate is what the condition waits on, not a change of intent.

Reproducibility of the container components is answered here. Every external image carries a digest beside its tag, so a rebuild resolves to the bytes the previous one used. A tag is republished under its own name, which makes it both irreproducible and repointable by anyone who can write to the registry -- the same property that made a version tag the vector in the action supply chain.

## Decisions

**Discovery, policy and the record are delegated rather than built.** The requirements describe an observation period, vulnerability handling, grouping of things that move together, and a standing record of what is outstanding. These are the standard behaviours of a dependency bot, and every one of them is a moving target: which registry to ask, how a vulnerability is looked up, which packages are one release train. A local implementation of any of it is a second thing to maintain that drifts from the ecosystem it models.

*Alternative considered:* a repository script driving the package manager directly. Rejected on scope. It reimplements discovery, grouping, vulnerability lookup and the record, and each of those is where the value is; the part that would be genuinely local — running the suite — is the part already written.

**The gate stays local, and nothing merges automatically.** Automatic merging requires a status the platform can observe, and the only trustworthy status here is a local run with the stack up. The available alternative is to instruct the tool to merge without observing any status, which converts an unverified change into a landed one.

*Alternative considered:* a reduced continuous-integration tier — typecheck, lint, the suites that do not need a stack — as an automatic merge condition. Rejected for now rather than on principle: it is a real option, it would cover most routine adoptions, and it is the natural next step. It is excluded here because a partial gate presented as a pass is precisely the failure the specification names, and drawing that line properly is its own decision.

**Adoption is a person's decision, and a major is a separate piece of work.** A version that crosses a compatibility boundary is not a build task but a migration, so it waits in the record until somebody takes it, rather than being raised as work nobody asked for.

**A hold is expressed where the policy is, and it names the constraint rather than the outcome.** The record has to say what holds a dependency and what would release it, because a hold that names only its outcome cannot be checked and outlives its reason.

**The observation period is stated in the policy, not in a requirement.** The specification requires that a period exists, is recorded and is applied. Fixing the number in a requirement would put a value that is tuned by evidence into a document that is read before the work.

## Risks / Trade-offs

**Adoption is bounded by how often somebody runs the suite.** → Discovery is cheap and continuous, so the backlog stays visible; what accumulates is visible rather than unknown, which is the property the specification actually asks for.

**A vulnerability is offered immediately but still lands only when a person acts.** → The requirement is that it is not queued behind routine work; landing it remains a human step. If this proves too slow in practice, it is the strongest argument for the reduced continuous-integration tier above.

**No peer constraint is enforced at install.** `.npmrc` disables it repository-wide for a documented reason, so a version excluded by another package's declared range installs successfully and silently. → The two known holds are recorded with the constraint that blocks them; the general case is not covered, and this is a live gap rather than a solved problem.

**A passing build is a sufficient verdict for one class of update, and one only.** A base-image digest moves the layers beneath the application without altering anything it declares, so a build that succeeds has demonstrated the whole of what changed. No other update type carries that property: a version bump changes what the code is compiled and run against, and only the suite establishes that. Automatic merging, once something exists to observe it, is therefore scoped to digests rather than granted generally.

**A held dependency is only as visible as its record.** → The condition that would release a hold is recorded with it, so the hold can be checked rather than believed.

## Open Questions

- Whether a digest update may merge without a person, given that its class is the one a build fully verifies. It changes no requirement here, only who acts on one.
