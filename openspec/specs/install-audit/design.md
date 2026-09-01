# Scope

**The record lives at the operator's destination; the install holds a buffer.** That is what makes the absolute in the accounts and access specification — an entry never changed or removed, at any level of privilege — a property that can actually hold, rather than an aspiration the store cannot deliver.

**Append-only inside the install is the second line, not the claim.** Whoever holds the credential that shapes the store can remove that protection, so the install's own copy is not proof against them. It defends against a defect, a stray operation, or a well-meant tidying route, which is what removes records in practice.

**No destination configured means the install is the record.** Article V requires an install with nothing configured to be complete, so the absence of a destination cannot make the record optional. It makes the local copy the record, governed as one.

**Which is why the account for what was let go is conditional rather than dropped.** With a destination, pruning a delivered copy loses nothing and an entry saying so is noise. Without one, the same act removes the only copy — so the record has to say it did, or a gap in it reads the same as a quiet week. The two modes want opposite things from the same operation, and treating them alike is how one of them goes wrong.

**An account of a deletion is worth nothing where it cannot be read back.** It belongs in the record itself rather than beside it: an operational log the deployment may discard, or may never persist at all, does not answer the question a gap in the record raises.

**Case content is never in it.** The audit is read by people who do not reach the case data the install holds, so bodies, prose and evidence stay out by construction rather than by redaction.

**Reads are not logged, with three named exceptions.** Logging every read drowns the record in page loads. Reading evidence, exporting data and reading the audit itself are named individually, because those are the reads an investigation asks about.

**The record is pushed, not pulled.** A monitoring system paging an endpoint depends on the install answering honestly about its own history, which is the thing under investigation when the record matters most. Lines leave as they are written.

**The destination is the operator's, and choosing it is theirs.** Article V names a log destination among the infrastructure an operator points the application at; the test is who owns the thing at the other end, and this end of it is theirs.

**Connections are a gap.** No interceptor runs on a connection upgrade, so anything the socket records is written by hand and is not guaranteed by the same mechanism as everything else.

# Design

## What enforces immutability is the store, not the code

The rules live in the store as policies rather than as checks in the application, so a route added later inherits them without anybody remembering.

**There is no update policy at all.** Not a restrictive one — none, so no statement the application can make will edit a line.

**An insert must claim a time close to now**, so a line cannot be written as having happened at some other moment.

**A delete matches only rows past the declared window**, and only when that window meets the floor. An unset window matches nothing. The floor is checked in the application as well, and the store's copy is the one that decides — the application's is there to produce a legible refusal.

**What this does not defend against is named.** A credential that can drop a policy can drop these. The protection is against a defect, a stray operation, or a well-meant tidying route — which is what actually removes audit records in practice.

## Two retention classes, because one window cannot serve both

Evidence of who did what to the install is kept for a long time. A note that the install started is operational and keeping it as long buries the first kind.

The class is decided by what the line records, at write time, from a fixed list. It is not a field anybody sets, because a class chosen per line is a way to have a line deleted early.

Each class has its own floor.

## Seriousness is derived, and what is stored is a floor

How serious a line is comes from what it records rather than from whoever wrote it.

**A run reads as worse than one.** One failed sign-in is a typo; thirty in a minute is an attack, and the line for each of them looks identical. The run is recognised when the record is read, over a window the install sets.

**Reading may raise it and never lower it.** The stored value is a floor. Computing entirely at read time would let a change to the policy make historic lines look less serious than they were assessed as; computing entirely at write time cannot see the run the line turned out to be part of.

**Shortening what is kept is the loudest ordinary setting change**, because it is the act of somebody covering their tracks and it must not be indistinguishable from lengthening it.

## Identity is stamped, not referenced

Who acted is recorded both as a reference and as the label they had at the time. The reference is for joining; the copied label is what survives the account being renamed or deleted.

An audit that stops naming somebody once their account is removed cannot answer the question it exists for, and removing an account is a thing somebody does on the way out.

## What a caller supplies is never what is recorded

The recorded address is taken from what the edge determined rather than from a header a caller can set, because a caller who can write their own address into the audit can write somebody else's.

**The route recorded is the pattern that matched, not the text sent.** Recording the raw path lets a caller write whatever they like into the record, including something that reads as a different event.

## The vocabulary is somebody else's on purpose

Lines identify themselves in a published schema, and the version is stamped on each line.

This is an application whose users already run security monitoring. A private vocabulary would make ingesting the audit a mapping exercise per install, and the mapping would be the thing that is wrong. Stamping the version means an upgrade does not change what an already-written line means.

## Reading the audit is audited, at a rate that does not drown it

The read is recorded, because who has been through the record is part of the record. It is recorded at most once per administrator per window, so working through the audit does not fill it with the fact that somebody was working through it.
