# Scope

**No migration path exists, and its absence is deliberate.** Data stored under an older shape is refused rather than converted, and nothing reads an older shape and adapts it. This holds while the application is in development and nothing is installed; when something is installed the question reopens, and it reopens as reading forward from what is stored rather than as a ladder of conversions.

**The wrapping around evidence is containment, not confidentiality.** Its password is a convention rather than a secret, and stating it plainly is the point: the wrapping exists so nothing between the store and the analyst treats a specimen as a live file.

**A copy that has never been restored is not a backup.** Producing one is not the whole obligation; returning to one has to be something an operator has done deliberately before an incident.

# Design

## Two kinds of state, decided rather than inherited

Every piece of state is durable or disposable, and which one is a decision recorded with the thing rather than a consequence of where it was written.

**Durable** is the record of investigations: cases and what they hold, evidence, reports, the compliance record, accounts, groups, customers, and the log of who did what. Losing any of it is data loss.

**Disposable** is what makes a running install responsive: sessions, presence, rate-limit counters, queues and caches. Losing it costs a sign-in and a warm cache. Nothing durable is inferred from it, and nothing durable is stored only there.

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

## Recovery is exercised, not assumed

An install can produce a copy of its durable state and return to that copy. Returning is an ordinary operator action with a stated procedure rather than something first attempted under pressure.
