# Scope

**The connection inherits nothing.** No guard, filter, pipe or interceptor that runs on an ordinary request runs on this one. Every check is re-applied here by hand, and their absence is silent rather than an error — which is what makes this the surface where a missing check is least likely to be noticed.

**A claim warns; it never locks.** An analyst saying they are editing something does not stop anybody else writing it.

**The change itself does not travel.** A screen learns that something moved and asks for it through the ordinary interface, so what a reader may see is decided in one place rather than two.

**Presence and claims are disposable.** Losing all of it costs a repaint. Nothing durable is inferred from either.

**The not-live line says the screen may be behind. It does not say what is behind.** A dropped connection's announcements are gone; the re-read after it returns is the whole answer.

**Prose is attributed per saved change and per writer, never per word.** Two analysts writing into one passage before a save are both named for it, and nothing says which words each wrote. That is the attribution every other write carries: who changed a record, never which characters.

**Only a writer on this process is named for a save it made.** Prose arriving from another process is named by the process it was written on.

**Order is kept per connection, and nowhere wider.** Two connections, including two tabs of one analyst, are two writers whose frames interleave however they arrive; prose merges them and a version check judges everything else.

**One application process per install.** Every open connection lives in the process that judges it, so an ending reaches it when it is announced, or within the sweep where nothing announced it.

**A document leaves the server as the live sync, as a rendered report, or copied into an archive**, and no read of a row returns it. What it holds is what it reads: deleted content is collected, and a removed section takes its prose with it.

# Design

## Admission is re-derived, not assumed

Opening a connection is subject to every check that guards an ordinary request, applied here explicitly: the caller is who they say, their session is live, and they reach the case they are asking for at a level that permits it.

A connection is refused unless all of them hold. It is admitted against the caller's own session, never against whoever else has the case open.

## Presence expires on its own

An analyst in a case is visible to the others in it. Presence is kept alive by the connection while it lasts and stops the moment it does not.

Expiry does not depend on a departure being announced: a crashed browser, a sleeping laptop and a dropped network all look the same from here, and none of them sends a goodbye.

A claim on an entry dies with the connection that made it, on the same principle. Closing a laptop leaves nothing held.

## The presence bound is served

The time after which a lost connection's name leaves the roster is the value the store enforces, served by the install's own description, so what is stated and what is enforced cannot differ.

## A held row warns and stays editable

A row another analyst holds names them on the row and in the dialog that opens it. Its controls stay live. The version check decides the write.

## A change announces its location, not its content

A write anywhere reaches every screen open on that case. What is delivered is enough to know what to re-read and no more.

The change itself does not cross: a screen learns that a part of the case moved and re-reads it through the ordinary interface, which is where what a reader may see is already decided.

## Prose is the exception to last-write-wins

Prose an analyst writes into a report is edited by two people at once without either losing work and without one waiting for the other.

A version check is the wrong instrument here. Two people typing in one paragraph are not making conflicting claims about a fact; they are writing different parts of one sentence, and refusing the second is refusing the work. This is the only place in the application where that holds.

## A connection hears from its first moment, one frame at a time

A connection listens from the moment it is accepted, before anything about it is prepared. Every frame it receives joins one sequence, and each is acted on to completion before the next one starts, so what a frame does can never overtake what the frame before it did.

Preparing the connection heads that sequence. What arrives while it is still being prepared waits behind it, and a preparation that fails ends the connection with nothing in the sequence acted on.

The connection's own end is the last thing in the sequence. A frame sent just before a tab closes is acted on before the connection lets go of what it had open, which is what keeps prose typed during a drop from being lost when the tab closes straight after the return.

The number of frames waiting is bounded, and a connection past the bound is ended rather than allowed to hold an unbounded backlog.

The sequence holds up when a frame fails. A frame that parses but is not an object is set aside without a word, the same as one that does not parse, because it is the client's mistake and not the install's. A frame whose action fails is reported to the operator and set aside. Either way the frames behind it and the connection's end still run in their turn.

## A reconnection either catches up or says it cannot

A connection that drops and returns leaves the analyst where they were, without a reload.

Where the gap cannot be filled, the analyst is told to re-read. A screen is never presented as current when the application cannot know that it is.

## A screen that cannot know it is current says so

The case frame says the screen is not live from the moment its connection drops, and goes on saying so until the connection is back and the whole case has been read again. A re-read that fails leaves the line up and offers to read again. A connection still opening for the first time is not a drop; one that never opens is.

## The connection dies with the reach that admitted it

Reach withdrawn while an analyst is connected ends the connection. A connection admitted once does not outlive its admission.

That covers every way reach ends: the session ended, the group revoked, the customer moved, the account disabled at the provider, the case deleted. Reach is therefore re-checked on the connection's own terms rather than trusted from the moment it opened.

## A save names whoever wrote into it

Each connection's change to prose is remembered against the analyst it came from, where it changed the document; a frame that changed nothing names nobody. A save stores the words, names the latest writer on the record, and writes a record of the change per writer, all in one act. A save that fails keeps its writers for the next one. Saves of one record run one at a time and in order, so a later save never lands before an earlier one.

A send holds a report's prose still only after saving what was typed and not yet saved, this same way, and after waiting out a save already under way, so the words a send stores are already named. A save that fails there leaves the report unsent.

Once stored, the save is announced to the case and recorded in the install's audit, one line per writer, as the collection routes record a write.
