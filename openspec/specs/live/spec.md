# Live

## Purpose

What makes a case a shared room rather than a document two people happen to have open. Who else is here, what they are holding, and what just changed — delivered while it happens rather than when somebody reloads.

This is the application's second interface, and it is not a variation of the first. Nothing that guards an ordinary request guards a connection, so every check the first interface performs is performed again here, by hand, and a missing one looks like nothing at all.

## Requirements

### Requirement: A connection is admitted by its own checks, and their absence is silent

Opening a connection MUST be subject to every check that guards an ordinary request. None of them may be assumed: the machinery that applies them elsewhere does not run here, and its absence produces no error, no warning, and a working connection.

A connection MUST be refused unless all of the following hold:

- **It was opened from this application.** A connection is not subject to the origin negotiation that governs ordinary requests, and a browser sends the analyst's cookie regardless. Without this check, any page an analyst visits can open a connection to their install and read the case they are working on.
- **It carries a session**, established the same way every request establishes one. Otherwise the roster shows names nobody proved.
- **The session reaches this case.** Authenticating and then trusting the case named in the connection is how any signed-in analyst reads any case. This is the same decision the first interface makes, made again.
- **The account is not held.** An account required to change its password is refused everywhere else and MUST be refused here, or it reads the change feed and holds rows against other analysts while unable to sign in properly.

Each of these MUST be verified by something that fails when it is removed. A check nobody can observe failing is a check nobody knows is gone.

#### Scenario: A connection is opened from another site

- GIVEN an analyst signed in, visiting an unrelated page
- WHEN that page opens a connection to their install carrying their cookie
- THEN it is refused

#### Scenario: A connection names a case the session does not reach

- GIVEN a signed-in analyst
- WHEN they open a connection naming a case belonging to a customer they do not reach
- THEN it is refused
- AND the refusal does not reveal whether that case exists

#### Scenario: A held account connects

- GIVEN an account required to change its password
- WHEN it opens a connection
- THEN it is refused

#### Scenario: A check is removed

- GIVEN the checks that admit a connection
- WHEN any one of them is removed
- THEN something fails that names which one

### Requirement: Presence says who is here now, and stops saying it by itself

An analyst in a case MUST be visible to the others in it. Presence MUST expire on its own rather than depend on a departure being announced: a browser that crashes, a laptop that sleeps and a network that drops all leave without saying so, and none of them may leave a name on the roster.

A connection MUST keep its own presence alive while it lasts, and MUST stop the moment it does not.

Presence MUST be reachable only by somebody who reaches the case. Who is working an investigation is itself information about the investigation.

#### Scenario: An analyst joins

- GIVEN a case with analysts in it
- WHEN another joins
- THEN everybody present is told
- AND the newcomer receives who is already there

#### Scenario: A connection is lost without warning

- GIVEN an analyst present in a case
- WHEN their connection ends without notice
- THEN their name leaves the roster without anybody acting
- AND it does so within a bounded time the install states

#### Scenario: An analyst is in two places

- GIVEN one analyst with the case open twice
- WHEN one of the two ends
- THEN they remain present
- AND leaving one place does not remove them from the other

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

### Requirement: A change reaches every open screen, and says only what changed

A write anywhere MUST reach every screen open on that case, so that an analyst reading a case sees what another has just done without asking for it.

What is delivered MUST be enough to know what to re-read and no more. The change itself MUST NOT travel: a screen learns that something in a part of the case moved, and asks for it through the interface that decides whether it may have it.

This is what keeps one boundary rather than two. A connection that carried case content would be a second place where reach is decided, and it is the place with no guards.

#### Scenario: Another analyst writes

- GIVEN two analysts with the same case open
- WHEN one changes something
- THEN the other's screen shows it without being reloaded

#### Scenario: What travels over the connection

- GIVEN a change to a case
- WHEN it is announced
- THEN the announcement names what moved
- AND does not carry the content that moved

#### Scenario: A screen re-reads after an announcement

- GIVEN a screen told that something changed
- WHEN it asks for the new state
- THEN that request is subject to every check any other request is

### Requirement: Written prose is edited together, not saved over

Prose an analyst writes into a report MUST be editable by two analysts at once without either losing work, and without one having to wait for the other.

This is the one place where the last write does not win and a version check is the wrong instrument: two people typing in one paragraph are not making conflicting claims about a fact, they are writing a sentence together.

Where an analyst is disconnected while writing, their work MUST survive and MUST merge when they return.

#### Scenario: Two analysts write in one section

- GIVEN two analysts editing the same passage
- WHEN both type
- THEN both sets of words survive
- AND neither is asked to resolve a conflict

#### Scenario: An analyst writes while disconnected

- GIVEN an analyst who loses their connection mid-sentence
- WHEN they reconnect
- THEN what they wrote is present
- AND merged with whatever arrived while they were away

### Requirement: A reconnection catches up rather than starts over

A connection that drops and returns MUST leave the analyst where they were. They MUST NOT have to reload to trust what is on their screen.

An install MUST NOT present a screen as current when it cannot know that it is. Where a gap cannot be filled, the analyst MUST be told to re-read rather than shown stale content silently.

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

### Requirement: The connection dies with the reach that admitted it

Reach withdrawn while an analyst is connected MUST end the connection. A connection admitted once MUST NOT outlive the reach that admitted it.

This covers every way reach ends: the session ended, the group revoked, the customer moved, the account disabled at the identity provider, the case deleted.

A connection MUST be carried over the same protected transport every other request uses. There is no plain connection, and no setting that permits one.

#### Scenario: Reach is withdrawn mid-session

- GIVEN an analyst connected to a case
- WHEN the reach that admitted them is withdrawn
- THEN the connection ends
- AND they stop receiving anything about that case

#### Scenario: The case is deleted underneath a connection

- GIVEN analysts connected to a case
- WHEN it is deleted
- THEN their connections end
- AND nothing further about it reaches them
