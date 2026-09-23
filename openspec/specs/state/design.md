# Scope

**No migration path exists, and its absence is deliberate.** Data stored under an older shape is refused rather than converted, and nothing reads an older shape and adapts it. This holds while the application is in development and nothing is installed; when something is installed the question reopens, and it reopens as reading forward from what is stored rather than as a ladder of conversions.

**The wrapping around evidence is containment, not confidentiality.** Its password is a convention rather than a secret, and stating it plainly is the point: the wrapping exists so nothing between the store and the analyst treats a specimen as a live file.

**A copy that has never been restored is not a backup.** Producing one is not the whole obligation; returning to one has to be something an operator has done deliberately before an incident.

**Evidence is deduplicated within a case and never across one.** The same bytes attached in two cases are two stored artefacts.

**Inside a case the database holds, the database is the authority on what the case holds.** An evidence directory is kept with the database it was written beside; bytes that database's evidence records and sent reports do not name are removed at start, whichever copy is newer.

**A case the database does not hold is not a deleted case.** Its artefacts leave the install on the install's record of its deletion, or with the rebuild that removes a demonstration. Bytes of a case no database holds and no record says was deleted stay until an operator removes them.

**A deleted or replaced evidence row's bytes go at the next start**, not at the moment of deletion.

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

## An artefact belongs to the case that stored it

**A case is the key, and the digest is only a name within it.** Every way into the store takes the case the bytes belong to, and the case decides where they live, so no path names bytes by digest alone. Only the store opens the evidence directory, and it answers no question without a case; which case a caller may name is decided by the caller's reach before the store is asked. A case id is checked before a path is built from it, as a digest is.

**Deduplication inside a case is what content addressing is for there**: two rows naming one attachment hold one file. Across cases it would make one case's upload, deletion and filename observable from another.

**An output asks only about what the case says it holds.** An evidence row carrying a digest and no record of the bytes being stored is evidence held elsewhere, and an export neither reads it nor counts it as lost.

**A sent report keeps its figures.** The figures a sent report froze are named by that report for as long as it exists, so they travel in an archive and survive the removal of the rows that first placed them.

**An import creates its case before its artefacts land**, so they are stored under the case they belong to and a refused import removes that case's artefacts whole.

**Deletion removes a case's artefacts after the case is gone.** A failure there does not undo the deletion; the start removes what is left, because the record of the deletion outlives the case. A demonstration's removal leaves no record, so the rebuild that removes demonstrations removes their artefacts once it commits, from the directory the server writes.

**At start, before the install serves, what nothing names is removed.** The cases are asked once, for the removal and the count together: what each case's evidence records say it holds and which figures its sent reports place, read by the definition render draws from, naming the case in every question. Every other file in that case goes. A case the database does not list goes only when the install's record of deletions names it, and a database that does not list a case is read as knowing nothing about it. What an earlier layout left outside any case directory goes too, since nothing reads it. A file written within the last hour is left, because an upload's bytes land before the row naming them commits and an import's before its whole case does; storing bytes a case already holds counts as writing them.

## Recovery is exercised, not assumed

An install can produce a copy of its durable state and return to that copy. Returning is an ordinary operator action with a stated procedure rather than something first attempted under pressure.

## What an install expects beside it is counted at start, and never fatal

An install reconciles the artefacts its records name against the artefacts it holds, at start and on demand, so a restore reports what it is short of instead of waiting to be found out.

**Holding the bytes is the question, not naming a digest.** A record carries the digest of the file it stands for whether the bytes are here or in an evidence locker somewhere else, and evidence held elsewhere is the ordinary case rather than the exception. Counting every digest would tell an install that received a handover without its files that it has lost them, at every start, with no action that clears it -- and a standing false alarm is how the line stops being read, which is the failure the requirement exists to prevent.

**The count is said twice because two moments ask it.** At start, for the operator watching a restore come up; in the install's own description, for the same operator once the restore is finished and the start-up line has scrolled away. The second is also what reports the evidence whole again when the artefacts are put back.

**A shortfall never refuses the start.** An install missing an artefact still holds every case and every record, so failing to start would withdraw the whole product to report a gap in part of it. A count that cannot be taken is said and stepped over for the same reason.

**The reconciliation asks case by case.** Records of evidence are reachable only within the case they belong to, and a question asked outside any case is answered with an empty set rather than a refusal -- so the direct form of the question reports every install as expecting nothing, which is indistinguishable from an install that is whole. Asking within each case in turn asks only what the application may already ask, at the cost of one act per case each time the count is taken.
