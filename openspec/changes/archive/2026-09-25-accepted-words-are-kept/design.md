# Scope

**Reach over prose is decided when a word is accepted, and nowhere after.** A connection's frame is accepted only while its analyst can write the record, and a frame after that is refused. What was accepted is stored, named for its writers, whatever they reach by then. Nothing re-decides it at the save. -> constitution, Article III, 1.2.0

**The identity that stores accepted prose is not a caller.** It serves no request, is named in no session, and reaches per save one record in one case, which somebody who could write it was accepted into. It is the one exception Article III grants, and it holds nothing the article does not name.

# Design

**Accepting a word is where reach is decided, and it is decided twice over.** The connection refuses a frame unless the analyst's session still covers it and they still hold write, which the application asks on every frame. The first frame since the last save that changes the document is also recorded as an acceptance, in the store, as that analyst, before the document holds it and before it is measured against a send. The store refuses the acceptance unless they hold write on the case at that moment, so a word the store has no acceptance for is never applied, and a send that seals the report meanwhile refuses or holds the word rather than losing it.

**Every save of words written on this instance runs as the prose role**, whoever is still connected or permitted: the quiet moment, the last reader leaving, a socket closing, shutdown and an analyst asking all store the same way. A save with no writer here runs as whoever asks, under their own reach.

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

**What can still lapse.** An acceptance lapses only when nothing keeps it current for a day. That happens when the application stops or drops the document with a save still failing, or when the store refuses even the refresh for longer than a day. Words whose acceptance has lapsed cannot be stored. The failure is logged saying so, and the words go when the last reader leaves, as any unsaved words do.

**Deleted prose is not kept, even while it is held.** When the store answers that a record is gone, the document stops retrying and removes the acceptances it held for it.

**Acceptances do not outlive their use.** The save removes the acceptances it stored, in the same act. A document dropped with nothing left to store removes the acceptances it holds. Every save made as the prose role, and every start of the application, removes the acceptances past their lasting, through a store act that removes only those and answers nothing.

**What the prose role adds beyond a request.** An application that enters it can keep a current acceptance current for the record it names, so that record stays storable, and its accepted writers nameable, for as long as the application keeps doing so. That reaches exactly the records with a live acceptance, and never another record, column or case, nor a record whose every acceptance has lapsed.

**The application enters the role for one save and leaves it with the transaction.** Nothing inherits it, so none of its policies or grants reach a request. The serving process refuses to start where it cannot enter the role or the role holds no grant, and says which role is missing. The seeder never stores prose and does not ask.

**A save of words written on this instance and its audit lines are one act.** Words are not stored where the lines naming their writers cannot be written, and neither lands without the other, whichever path made the save.

**Stopping the application ends its connections before it stops listening, and waits for saves already under way.** An open connection holds the listener open, so ending them last never ends them; and a save started by the last reader leaving is finished before the store closes.
