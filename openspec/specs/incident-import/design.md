# Scope

**The install never holds a credential to a detection platform, and never calls one.** The analyst's browser holds the credential and makes the call, and the install receives only what the browser sends it. This is what keeps Article V true for a capability whose whole purpose is reaching somebody else's data.

**A platform is supported one at a time.** Translating a platform's vocabulary into this application's is work per platform, and nothing about supporting one makes the next one free. The capability is written so a second can be added; it is not written as though the set were open.

**An import proposes; it never writes unattended.** There is no scheduled import, no watcher, and no route that ingests without a person having looked. Whether there should be is a live question, and the answer changes the credential story above entirely.

**Provenance is stamped, never accepted.** What a row says about where it came from is decided here, so a platform cannot describe its own data as analyst-written or as reviewed.

**A demonstration source exists, and it reaches nothing.** Showing what an import does is a real need, and doing it against somebody's live tenant is not acceptable.

# Design

## The credential never reaches the install

The browser signs in to the platform directly and holds the resulting credential in memory only. It is not written anywhere that survives the tab.

What does persist locally is only what identifies which platform to offer next time — enough to save the analyst retyping it, and useless to anybody who reads it.

**A credential is sent only to the origin it was issued for.** A platform pages its results by handing back a location to fetch next, and that location is data from outside the install. Attaching the credential to whatever it names would let a platform's response redirect the analyst's token to somewhere the analyst never chose, so the destination is checked against the origin the credential belongs to before anything is sent.

## Preview and commit are one derivation run twice

The preview and the write are derived from the same incoming payload rather than from a stored intermediate. The commit re-derives from the payload the browser resends, and applies the analyst's approvals and corrections to that.

The alternative is holding the proposed rows server-side between the two, which means a per-analyst staging area with its own lifetime, its own reach question, and its own way of going stale. Re-deriving costs a second pass over data that is already small.

**Matching is done against the store, not against what the browser was told.** The preview a browser holds is a snapshot, and a case is not. Deciding what is a duplicate against the snapshot would duplicate anything another analyst added while the import was being read.

## A correction goes through the ordinary write path

An analyst's correction is validated by the same description that governs the collection, and the write goes through the same path as any other. An import is a source of proposed values, never a second way into the store, so the case-boundary check and the attribution come along without being re-implemented.

An incoming collection the application does not recognise is refused rather than passed through, because passing it through is how a write reaches a table nothing validates.

## An import is one act, and the ordering inside it is a dependency

Entities are written before the events that refer to them, because an event naming an entity that does not yet exist cannot be checked. That ordering is a dependency, not a reason for two acts.

The whole import is one transaction, including the creation of the case where the import was asked to make one. A failure anywhere leaves nothing: no rows, and no case.

**The alternative was to report a partial write and let the analyst reconcile it.** That puts the analyst back to reading the case against the platform's screen row by row, which is exactly the labour the import exists to remove — and it does it at the worst moment, when something has already gone wrong.

## Degrading rather than refusing

Data from a platform is malformed often enough that refusing the import on the first unparseable entity would make the feature unusable. An item that cannot be read is counted and skipped.

**Counted, not dropped.** The distinction between what was not recognised and what was recognised and unusable is kept, because the first says this install does not map something and the second says the platform sent something broken. They lead to different actions.
