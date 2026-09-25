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
- It can run the reach function every case policy calls. That answers nothing the application, the only role that can enter it, cannot already ask.
- A sent report takes no words from it, as from anybody.

**An acceptance lasts an hour, and authorises nothing after.** That is far longer than a quiet moment and the retries a failed save waits for, and short enough that an acceptance outliving its words cannot be used against a record whose reach has since changed. The store dates an acceptance itself, as the moment it is written, and nobody may change one afterwards. Only its own writer may remove a current acceptance; anybody may remove one past its hour.

**A save that fails keeps its acceptances, and its writers, for the next save.** Once a save has failed, each writer whose acceptance has lapsed is given a fresh one, under their reach at that moment, so the next save can name them. A writer the store no longer lets write the record gets none. Their words stay in the document unsaved, the document stays unsaved while it is held, and the failure is logged, naming the writer and saying that their acceptance lapsed. When the last reader leaves such a document, its unsaved words are lost with it, as any unsaved words are.

**Acceptances do not outlive their use.** The save removes the acceptances it stored, in the same act. A document dropped with nothing left to store removes the acceptances it holds. Every save made as the prose role, and every start of the application, removes the acceptances past their hour.

**The application enters the role for one save and leaves it with the transaction.** Nothing inherits it, so none of its policies or grants reach a request. The serving process refuses to start where it cannot enter the role or the role holds no grant, and says which role is missing. The seeder never stores prose and does not ask.

**A save of words written on this instance and its audit lines are one act.** Words are not stored where the lines naming their writers cannot be written, and neither lands without the other, whichever path made the save.

**Stopping the application ends its connections before it stops listening, and waits for saves already under way.** An open connection holds the listener open, so ending them last never ends them; and a save started by the last reader leaving is finished before the store closes.
