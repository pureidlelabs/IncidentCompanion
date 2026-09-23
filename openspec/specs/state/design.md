# Scope

**No migration path exists, and its absence is deliberate.** Data stored under an older shape is refused rather than converted, and nothing reads an older shape and adapts it. This holds while the application is in development and nothing is installed; when something is installed the question reopens, and it reopens as reading forward from what is stored rather than as a ladder of conversions.

**The wrapping around evidence is containment, not confidentiality.** Its password is a convention rather than a secret, and stating it plainly is the point: the wrapping exists so nothing between the store and the analyst treats a specimen as a live file.

**A copy that has never been restored is not a backup.** Producing one is not the whole obligation; returning to one has to be something an operator has done deliberately before an incident.

**The server's check stays per row.** A write names the version of the whole record, and nothing here adds a per-field version to the wire. What is per field is the client's judgement of a refusal: a change to a field nobody else moved is sent again against the version that moved it, and only a field somebody else changed is a collision.

**A tab is the writer the chain orders.** Two tabs of one analyst are two writers, each with its own view of the record, and are checked against each other as two analysts are.

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

## A version is captured with what the analyst looked at

A write's version is taken where the analyst read the value it carries, never where the request leaves. Three places read a row for a write:

- **A change to a field** holds the version the record had when the analyst began changing that field, the value it held then, and the value the analyst has put there.
- **A selection** holds the version each row had when the analyst pressed the act, and the dialog confirming it acts on those.
- **A dialog** holds the row as it opened, and holds each field it changes the way a form does.

A version read at send time is not a fourth kind. The type that carries a read version is minted only at these places, so a caller handing the version it happens to have in hand does not compile.

## A record served again moves a change's version only where the field did not move

Every time the record is served newer than a held change was read at, each held field is judged against it:

- the server holds the analyst's value: the change is settled and the hold goes;
- the analyst's value is the one they started from: nothing of theirs is left, and the field follows the server;
- the field still holds the value the change began from: nobody else touched it, and the hold takes the newer version;
- otherwise somebody else changed it: the field keeps the analyst's value and shows the other beside it.

A field with no hold follows the server. The caret alone holds nothing. A hold with a write out is not judged until that write is answered, because its answer decides it.

## A collision is settled by a choice, never by leaving

A held field showing another analyst's value is not written when the analyst leaves it. Keeping their own writes it against the version that holds the other value. Taking the other's drops the hold. Both are presses made with both values on screen.

A refusal of a field nobody else moved, which happens when the other write landed but its announcement had not, is sent again against the newer version once the record is read again. A refusal of a field somebody else moved becomes the collision above.

## One tab's writes to a record leave in order, chained through its own answers

Writes to one record leave one after another from the tab that made them. A write queued behind the tab's own earlier write to the same record is sent against the version that earlier write produced, when it was read at the version the earlier one was sent against. The chain records only transitions this tab's own answers reported, so a record read again never lends a queued write a newer version.

The chain is the tab's own, not the request library's: a queued request that waits for the tab to be visible holds the analyst's last answer until they come back, and loses it if they close the tab.

## The screen holds only answers

No write is drawn before it is answered, and no copy of the record is put back after a refusal. What the analyst is changing lives in their hold or their dialog until the server answers; the record itself changes only when it is read again. A copy put back after a refusal can hold another write's refused value, and a copy drawn before the answer can show a value the server refused.

## A form writes a field when the analyst leaves it

Text and numbers are written on leaving the field. A choice made in one act — a select, a box, a set of options — is written as it is made. A keystroke is not an answer, and writing each one records partial values the analyst never meant and recomputes a verdict through each of them.

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

**The reconciliation asks case by case.** Records of evidence are reachable only within the case they belong to, and a question asked outside any case is answered with an empty set rather than a refusal -- so the direct form of the question reports every install as expecting nothing, which is indistinguishable from an install that is whole. Asking within each case in turn asks only what the application may already ask, at the cost of one act per case each time the count is taken.
