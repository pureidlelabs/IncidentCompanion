# Scope

**The install never holds a credential to a detection platform, and never calls one.** The analyst's browser holds the credential and makes the call, and the install receives only what the browser sends it. This is what keeps Article V true for a capability whose whole purpose is reaching somebody else's data.

**A platform is supported one at a time.** Translating a platform's vocabulary into this application's is work per platform, and nothing about supporting one makes the next one free. The capability is written so a second can be added; it is not written as though the set were open.

**An import proposes; it never writes unattended.** There is no scheduled import, no watcher, and no route that ingests without a person having looked. Whether there should be is a live question, and the answer changes the credential story above entirely.

**Provenance is stamped, never accepted.** What a row says about where it came from is decided here, so a platform cannot describe its own data as analyst-written or as reviewed.

**A demonstration source exists, and it reaches nothing.** Showing what an import does is a real need, and doing it against somebody's live tenant is not acceptable.

# Design

## Starting a case is the wizard's ending, not a second door

The wizard that fills a case and the one that makes the case it fills are the same conversation with the provider, and only the last step differs. Two screens would be the same translation written twice, and the second copy is the one that stops matching the provider.

So the ending is chosen by whether a create call was supplied. A door that starts a case supplies one and the importer inside a case does not, which also decides where the title is asked: at the review, once the analyst has seen the incidents and while nothing is written, rather than before the wizard runs when the name could only be a guess from an identifier.

**What the one call does and does not promise.** It answers the requirement that abandoning the wizard leaves no case: nothing is written until the review is accepted, so walking away writes nothing. It does not yet make the case and its rows atomic against a failure part way through the write -- the case is written first because the rows need its id to be scoped -- so a write that fails after the case exists leaves the case. That gap is what the ledger records as unbuilt against *An import asked to create a case fails*.

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

## Translating the platform's vocabulary is the install's side of the boundary

A platform spells its vocabularies in its own words, and somebody has to turn them into this application's. The browser cannot: it holds the credential, which is the whole reason any work happens there, and a translation table in that tier is one written where none of the schemas that judge a write can be seen. So a platform's word crosses the boundary as the platform sent it, and the mapping happens on the far side.

Where it happens also decides how a mismatch fails. A level composed in the browser is validated as one field of the request that creates the case, so a spelling this application does not carry refuses the whole act rather than the field — an import that would otherwise have succeeded does not happen at all. Mapped on the install's side, an unrecognised word costs only what it describes.

**What a case is opened with is derived from the payload, never accepted from the caller.** A field the caller may set and the install may derive has two answers, and the caller's wins; that is the arrangement in which a door appears to carry a value, is tested through that door with a spelling no platform uses, and hands the analyst a case without it.

**Where one case is opened from several incidents, it takes the worst level any of them reported.** Over-marking and under-marking are not symmetric: a case that reads worse than it is gets opened and corrected, and one that reads milder does not get opened, so nothing corrects it. The ordering is the vocabulary's own rather than a second list beside it.

**What an unrecognised word becomes belongs to the caller rather than to the table.** A timeline entry owes its column a level and takes the most cautious one; a case may honestly be unmarked, and is left so. Folding that into the mapping would force one answer on both, and the cautious default is the wrong one for a case — a level asserts a judgement where an empty field asks for one.

## The boundary between the two seams, which are not the same failure

Entities are written before the events that refer to them, because an event naming an entity that does not yet exist cannot be checked. That ordering is a dependency rather than a choice.

**A failure between those two writes is recoverable, and that is what makes it acceptable.** Matching runs against the store rather than against the preview, so an import run again recognises the entities already written and finishes rather than doubling. The cost of the seam is bounded by a retry the analyst can perform without understanding what happened.

**A failure after the case is created is not recoverable, and that is why it is one act with the import.** Nothing retries an empty case out of existence. It is offered in every list from then on, indistinguishable from a case somebody opened and abandoned, and the person deciding what to pick up pays for it every time they look rather than once.

The two seams look alike and are not: the first costs a retry, the second costs a permanent wrong entry in the list that drives what gets worked on.

**What makes the first seam acceptable is a property, not an accident.** If matching ever stopped running against the store, the retry would duplicate and the seam would become as bad as the second one. That is why the specification states the retry rather than the transaction.

## Degrading rather than refusing

Data from a platform is malformed often enough that refusing the import on the first unparseable entity would make the feature unusable. An item that cannot be read is counted and skipped.

**Counted, not dropped.** The distinction between what was not recognised and what was recognised and unusable is kept, because the first says this install does not map something and the second says the platform sent something broken. They lead to different actions.
