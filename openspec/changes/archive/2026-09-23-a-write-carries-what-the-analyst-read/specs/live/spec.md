# Live

## MODIFIED Requirements

### Requirement: A claim warns; it does not lock

An analyst editing an entry MUST be able to say so, and the others MUST see it. A claim MUST NOT prevent anybody from writing.

A claim MUST die with the connection that made it. An analyst who closes their laptop MUST NOT leave an entry held.

Two analysts MUST NOT both hold the same entry believing they are alone. Where a claim is contested the loser MUST be told rather than shown a badge that says the same thing to both of them.

Nothing MUST be built on a claim as though it were a lock. The record of who wrote what, and the refusal of a write made against a version that moved, are what make concurrent work safe. A claim is a courtesy on top of those.

#### Scenario: An analyst claims an entry

- GIVEN an entry nobody holds
- WHEN an analyst begins editing it
- THEN the others see that it is held, and by whom

#### Scenario: Two analysts claim the same entry

- GIVEN an entry already held
- WHEN a second analyst claims it
- THEN they are told it is held rather than shown the same badge as the holder

#### Scenario: A holder disappears

- GIVEN an entry held by an analyst
- WHEN their connection ends
- THEN the claim is released without anybody acting

#### Scenario: Somebody writes to a claimed entry

- GIVEN an entry held by one analyst
- WHEN another writes to it anyway
- THEN the write is judged on the version it was made against, not on the claim

#### Scenario: An analyst opens an entry another holds

- GIVEN an entry held by one analyst
- WHEN another opens it
- THEN they are told who holds it
- AND they may still edit it

### Requirement: A reconnection catches up rather than starts over

A connection that drops and returns MUST leave the analyst where they were. They MUST NOT have to reload to trust what is on their screen.

An install MUST NOT present a screen as current when it cannot know that it is. Where a gap cannot be filled, the analyst MUST be told to re-read rather than shown stale content silently.

A screen MUST say it is not live for as long as its connection is down, and until what changed while it was down has been read again.

#### Scenario: A connection drops briefly

- GIVEN an analyst with a case open
- WHEN their connection drops and returns
- THEN they are present again
- AND what changed while they were away reaches them

#### Scenario: The gap is too large to fill

- GIVEN a connection that was away long enough that what it missed cannot be replayed
- WHEN it returns
- THEN the analyst is told their screen may be stale
- AND it is not presented as current

#### Scenario: A connection is lost

- GIVEN an analyst with a case open
- WHEN their connection drops
- THEN the screen says it is not live
- AND it goes on saying so until what changed while it was down has been read again
