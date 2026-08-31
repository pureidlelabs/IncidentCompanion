# Scope

**The connection inherits nothing.** No guard, filter, pipe or interceptor that runs on an ordinary request runs on this one. Every check is re-applied here by hand, and their absence is silent rather than an error — which is what makes this the surface where a missing check is least likely to be noticed.

**A claim warns; it never locks.** An analyst saying they are editing something does not stop anybody else writing it.

**The change itself does not travel.** A screen learns that something moved and asks for it through the ordinary interface, so what a reader may see is decided in one place rather than two.

**Presence and claims are disposable.** Losing all of it costs a repaint. Nothing durable is inferred from either.

# Design

## Admission is re-derived, not assumed

Opening a connection is subject to every check that guards an ordinary request, applied here explicitly: the caller is who they say, their session is live, and they reach the case they are asking for at a level that permits it.

A connection is refused unless all of them hold. It is admitted against the caller's own session, never against whoever else has the case open.

## Presence expires on its own

An analyst in a case is visible to the others in it. Presence is kept alive by the connection while it lasts and stops the moment it does not.

Expiry does not depend on a departure being announced: a crashed browser, a sleeping laptop and a dropped network all look the same from here, and none of them sends a goodbye.

A claim on an entry dies with the connection that made it, on the same principle. Closing a laptop leaves nothing held.

## A change announces its location, not its content

A write anywhere reaches every screen open on that case. What is delivered is enough to know what to re-read and no more.

The change itself does not cross: a screen learns that a part of the case moved and re-reads it through the ordinary interface, which is where what a reader may see is already decided.

## Prose is the exception to last-write-wins

Prose an analyst writes into a report is edited by two people at once without either losing work and without one waiting for the other.

A version check is the wrong instrument here. Two people typing in one paragraph are not making conflicting claims about a fact; they are writing different parts of one sentence, and refusing the second is refusing the work. This is the only place in the application where that holds.

## A reconnection either catches up or says it cannot

A connection that drops and returns leaves the analyst where they were, without a reload.

Where the gap cannot be filled, the analyst is told to re-read. A screen is never presented as current when the application cannot know that it is.

## The connection dies with the reach that admitted it

Reach withdrawn while an analyst is connected ends the connection. A connection admitted once does not outlive its admission.

That covers every way reach ends: the session ended, the group revoked, the customer moved, the account disabled at the provider, the case deleted. Reach is therefore re-checked on the connection's own terms rather than trusted from the moment it opened.
