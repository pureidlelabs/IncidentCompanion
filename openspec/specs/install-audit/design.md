# Scope

**The audit is append-only to the application, and that is the claim.** Whoever holds the credential that shapes the store can remove the protection, so the record is not proof against them. Where tamper-evidence beyond the application is wanted, the answer is a copy outside the install rather than a stronger rule inside it — which is the control the gap list already names. An audit described as proof against more than it is, is worse than one described accurately.

**Case content is never in it.** The audit is read by people who do not reach the case data the install holds, so bodies, prose and evidence stay out by construction rather than by redaction.

**Reads are not logged, with two named exceptions.** Logging every read drowns the record in page loads. Reading evidence and exporting data are named individually because those are the reads an investigation asks about.

**There is no bulk export.** The record is read a page at a time. Whether a monitoring system pulling it that way is sufficient has not been decided.

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
