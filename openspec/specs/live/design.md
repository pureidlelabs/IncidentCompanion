# Scope

**The connection inherits nothing.** No guard, filter, pipe or interceptor that runs on an ordinary request runs on this one. Every check is re-applied here by hand, and their absence is silent rather than an error — which is what makes this the surface where a missing check is least likely to be noticed.

**A claim warns; it never locks.** An analyst saying they are editing something does not stop anybody else writing it.

**The change itself does not travel.** A screen learns that something moved and asks for it through the ordinary interface, so what a reader may see is decided in one place rather than two.

**Presence and claims are disposable.** Losing all of it costs a repaint. Nothing durable is inferred from either.

**The not-live line says the screen may be behind. It does not say what is behind.** A dropped connection's announcements are gone; the re-read after it returns is the whole answer.

**Prose is attributed per saved change and per writer, never per word.** Two analysts writing into one passage before a save are both named for it, and nothing says which words each wrote. That is the attribution every other write carries: who changed a record, never which characters.

**Reach over prose is decided when a word is accepted, and nowhere after.** A connection's frame is accepted only while its analyst can write the record, and a frame after that is refused. What was accepted is stored, named for its writers, whatever they reach by then. Nothing re-decides it at the save. -> constitution, Article III, 1.2.0

**The identity that stores accepted prose is not a caller.** It serves no request, is named in no session, and reaches per save one record in one case, which somebody who could write it was accepted into. It is the one exception Article III grants, and it holds nothing the article does not name.

**A save names whoever the words were accepted from, whichever process makes it.** Prose arriving from another process is named by the writers the store accepted it from. Where no acceptance names anybody, this process does not store it: the words are the accepting process's to store, and are stored already or can no longer be.

**A section's removal is its own attributed act.** Emptying a removed section's prose is stored as whoever removed it and names no writer; the removal's own change row and audit line name them.

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

The save is recorded in the install's audit, one line per writer, as the collection routes record a write, and once stored it is announced to the case.

**Accepting a word is where reach is decided, and it is decided twice over.** The connection refuses a frame unless the analyst's session still covers it and they still hold write, which the application asks on every frame. The first frame since the last save that changes the document is also recorded as an acceptance, in the store, as that analyst, before the document holds it and before it is measured against a send. The store refuses the acceptance unless they hold write on the case at that moment, so a word the store has no acceptance for is never applied, and a send that seals the report meanwhile refuses or holds the word rather than losing it.

**Every save of words written on this instance runs as the prose role**, whoever is still connected or permitted: the quiet moment, the last reader leaving, a socket closing, shutdown and an analyst asking all store the same way. A save with no writer here names the writers the store holds current acceptances for on that record, the latest accepted last, exactly as the accepting process would, and runs as the prose role under the same policies. It leaves those acceptances to the save that took them. Where the store holds none, it stores nothing and says so in the log. Only a section's removal stores as whoever asks.

**The store, not the code that enters the role, holds each of its boundaries:**

- It stores a record only where the store holds an acceptance for that record.
- It names as the last writer, in a change row or in an audit line only a writer accepted into that record. Where one of those writers has no account left, it names nobody.
- It reaches no row outside the record and case the save names.
- Column grants limit it to the words, who last wrote them and when, and the change and audit rows.
- It reads only that record's acceptances, the keys its save filters and answers on, and whether an account exists.
- It may bring that record's current acceptances up to the present, and nothing else about them. It cannot bring back a lapsed one.
- It can run the reach function every case policy calls. That answers nothing the application, the only role that can enter it, cannot already ask.
- A sent report takes no words from it, as from anybody.

**An acceptance lasts a day after it was written or last kept current, and authorises nothing after.** The store holds that lasting in one place, which its policies and its sweep both ask. It is long because only orphans are meant to reach it, and a longer one concedes nothing beyond the residual below. The store dates an acceptance itself, as the moment it is written, and nobody may date one otherwise. Only its own writer, or the prose role for the record it accepts, may remove a current acceptance. The application sees no acceptance of a case its caller does not reach, current or lapsed.

**A document holding acceptances keeps them current on its own clock.** From its first acceptance until a save stores them, the document brings them up to the present every hour, as the prose role, whether or not any save is attempted. Every failed save does the same at once. Keeping an accepted word current is not a second decision: reach was decided when the word was accepted, and nothing asks it again. The same therefore holds whether the writer lost write or had their account disabled.

**A save is always attempted, and always ends.** A stream of writing defers a save by at most a few seconds, however steadily it arrives. Each statement of a save that waits on a lock for more than a few seconds, or runs for more than half a minute, gives up, and the save takes the failure path. The bound is per statement, and a save is as many statements as it names writers plus a few, so it ends. A document with words unsaved tries again every five minutes.

**What can still lapse.** An acceptance lapses only when nothing keeps it current for a day. That happens when the application stops or drops the document with a save still failing, or when the store refuses even the refresh for longer than a day. Words whose acceptance has lapsed cannot be stored. The failure is logged saying so, the analysts holding the document are told, and the words go when the last reader leaves, as any unsaved words do.

**Deleted prose is not kept, even while it is held.** When the store answers that a record is gone, the document stops retrying and removes the acceptances it held for it.

**Acceptances do not outlive their use.** The save removes the acceptances it stored, in the same act. A document dropped with nothing left to store removes the acceptances it holds. Every save made as the prose role, and every start of the application, removes the acceptances past their lasting, through a store act that removes only those and answers nothing.

**What the prose role adds beyond a request.** An application that enters it can keep a current acceptance current for the record it names, so that record stays storable, and its accepted writers nameable, for as long as the application keeps doing so. That reaches exactly the records with a live acceptance, and never another record, column or case, nor a record whose every acceptance has lapsed.

**The application enters the role for one save and leaves it with the transaction.** Nothing inherits it, so none of its policies or grants reach a request. The serving process refuses to start where it cannot enter the role or the role holds no grant, and says which role is missing. The seeder never stores prose and does not ask.

Stopping the application ends its connections before it stops listening, and waits for saves already under way. An open connection holds the listener open, so ending them last never ends them; and a save started by the last reader leaving is finished before the store closes.

A save of words written on this instance and its audit lines are one act. Words are not stored where the lines naming their writers cannot be written, and neither lands without the other, whichever path made the save.

## Words held unsaved are said to be

A failed save tells every connection holding the document that its words are unsaved, once; a save that then stores them tells them they are saved; an acceptance found lapsed tells them the words are lost. A connection opening a document whose words are unsaved, or asking again for its state, is told at once. The states are one closed vocabulary both ends read.

The screen draws one notice per document, with the text to copy, and locks nothing. Words given up raise a dialog, once. While words are unsaved, the screen asks before a change of route or an unload takes the analyst away: a connection's end is when the install lets go of a document, and a connection that has ended can be told nothing.
