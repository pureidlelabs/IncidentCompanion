# Scope

**No migration path exists, and its absence is deliberate.** Data stored under an older shape is refused rather than converted, and nothing reads an older shape and adapts it. This holds while the application is in development and nothing is installed; when something is installed the question reopens, and it reopens as reading forward from what is stored rather than as a ladder of conversions.

**The wrapping around evidence is containment, not confidentiality.** Its password is a convention rather than a secret, and stating it plainly is the point: the wrapping exists so nothing between the store and the analyst treats a specimen as a live file.

**A copy that has never been restored is not a backup.** Producing one is not the whole obligation; returning to one has to be something an operator has done deliberately before an incident.

**There is no system principal.** Everything the serving application reads or writes of a case is done for somebody. The few acts that have to see past every caller's reach -- counting the cases behind a customer, a customer merge's reference check and move, how many cases stand in each state, and which stored artefacts a case names -- are acts the store performs and answers narrowly: counts, identifiers and digests, never a case's contents. A merge's acts refuse anybody who is not an administrator.

**The seeding role is the one exemption.** It writes cases nobody is asking for, on an install that may hold no account yet, so each table exempts it by a policy of its own, and the seed one-shot acts as it throughout. Nothing that serves a request connects as it for case data.

**The principal lives within one process.** It is held for a request or a socket frame in the process serving it.

# Design

## Two kinds of state, decided rather than inherited

Every piece of state is durable or disposable, and which one is a decision recorded with the thing rather than a consequence of where it was written.

**Durable** is the record of investigations: cases and what they hold, evidence, reports, the compliance record, accounts, groups, customers, and the log of who did what. Losing any of it is data loss.

**Disposable** is what makes a running install responsive: sessions, presence, rate-limit counters, queues and caches. Losing it costs a sign-in and a warm cache. Nothing durable is inferred from it, and nothing durable is stored only there.

**A one-time token is disposable, and the test is what holding it lets somebody do rather than where it is stored.** Anything that admits a bearer to an account without a fresh credential belongs here: a session, and equally the tokens that verify an address or reset a password. Each is a claim about a moment, and a copy restored later re-arms it -- a reset token an attacker already holds is the same failure as their session coming back, and the copy is usually restored *because* of them. Losing them costs somebody a second click.

**Credentials are not tokens and stay durable.** What proves who somebody is -- a password hash, an enrolled factor -- is what an install is restored *with*; dropping it locks every analyst out of the install they just recovered.

## Three identities against the store, and none of them is two

The identity that serves requests, the identity that changes the shape of the store, and the identity that seeds demonstration content are three separate powers. The serving identity holds none of the other two.

The serving identity does not own the schema and cannot read past a boundary or alter the rules that define one. The store refuses rows outside the boundary the caller reaches rather than returning them to an application trusted to filter, so a defect in the application is not a disclosure.

The shape-changing identity is not available to the running application.

## The store decides reach, and knows who is asking

**One decision.** The store answers two questions: the level an account holds over a customer, and whether a case exists, whose it is and the level an account holds over it. The route guard, the live connection, every list of cases and every row-level policy ask them, and nothing in the application settles a level of its own. A case with no customer is the default customer's. An account the install does not hold reaches nothing, the default customer included: the default's floor is an account's by role, and a membership goes with its account.

**The same work either way.** The case question resolves the customer and the level whether or not the case exists and says separately whether it is there, so an absent case and one out of reach are answered after one question each. A refused reach is recorded once the answer has gone.

**The decision reads past the caller.** The functions answering it read the rows they decide about as the tables' owner, with a fixed search path and every table named by schema, and only the serving and seeding identities may call them. Every schema application creates them before the policies that call them.

**Who is asking is set once.** A request names its principal when it arrives, as the account its session belongs to; a socket names it per frame, as the account the connection admitted. Every scope opened for case data carries the principal beside the case, and a scope with nobody named is refused before it reaches the store. Work that outlives the frame that asked for it carries that frame's principal: a live document writes itself as the analyst whose edit it last took.

**One policy per command.** Every table holding a case's rows answers a row only to a scope naming its case and a principal who reaches it: read to see a row, write to add, change or remove one. A case itself is answered by its own customer, and destroying one needs delete. A visit to a case is its analyst's alone while they reach the case, and removing one asks only whose it is, so a list pruned after reach was withdrawn still drops what it no longer shows. A record the first reader raises from defaults may be raised at read. A write the store refuses for reach is answered as the case not being there.

## A version travels with the row

Anything an analyst may change carries a version that moves when it does. A write states the version it was made against and is refused where that no longer matches.

A refusal is an answer rather than an error: it means somebody wrote first, and the caller is told which fields moved so a merge can be raised naming them.

The check, the change and the record of the change succeed or fail together, in one act. A change stored while its record is not leaves every other screen believing something untrue.

## Everything that accumulates has a stated life

Durable state that grows without bound — the record of changes to a case, the log of administrative acts, anything else that accumulates — carries a stated retention and a stated fate at the end of it.

An install never reaches a state where the only way to keep working is to delete something nobody decided was disposable.

## Evidence is stored wrapped

Evidence is a file taken from a compromised system, stored inside the wrapping the industry already uses for specimens, so an analyst who meets it recognises it and their own tooling opens it.

The wrapping is applied on the way in and is what the store holds. Nothing in the path between the store and the analyst is asked to treat the contents as inert; the wrapping is what makes that unnecessary.

## Recovery is exercised, not assumed

An install can produce a copy of its durable state and return to that copy. Returning is an ordinary operator action with a stated procedure rather than something first attempted under pressure.

## What an install expects beside it is counted at start, and never fatal

An install reconciles the artefacts its records name against the artefacts it holds, at start and on demand, so a restore reports what it is short of instead of waiting to be found out.

**Holding the bytes is the question, not naming a digest.** A record carries the digest of the file it stands for whether the bytes are here or in an evidence locker somewhere else, and evidence held elsewhere is the ordinary case rather than the exception. Counting every digest would tell an install that received a handover without its files that it has lost them, at every start, with no action that clears it -- and a standing false alarm is how the line stops being read, which is the failure the requirement exists to prevent.

**The count is said twice because two moments ask it.** At start, for the operator watching a restore come up; in the install's own description, for the same operator once the restore is finished and the start-up line has scrolled away. The second is also what reports the evidence whole again when the artefacts are put back.

**A shortfall never refuses the start.** An install missing an artefact still holds every case and every record, so failing to start would withdraw the whole product to report a gap in part of it. A count that cannot be taken is said and stepped over for the same reason.

**The reconciliation is the store's to answer.** Records of evidence are reachable only by somebody who reaches their case, and the count is taken at start, for nobody -- so a question asked as the application is answered with an empty set, which reports every install as expecting nothing and is indistinguishable from one that is whole. The store answers it itself, with the digests its records name and nothing else.
