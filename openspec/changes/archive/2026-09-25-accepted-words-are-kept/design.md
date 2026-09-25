# Scope

**Reach over prose is decided when a word is accepted, and nowhere after.** A connection's frame is accepted only while its analyst can write the record, and a frame after that is refused. What was accepted is stored, named for its writers, whatever they reach by then. Nothing re-decides it at the save. -> constitution, Article III, 1.2.0

**The identity that stores accepted prose is not a caller.** It serves no request, is named in no session, and reaches one record in one case per save. It is the one exception Article III grants, and it holds nothing the article does not name.

# Design

**Every save runs as one identity, whoever wrote and whoever is asking.** The quiet moment, the last reader leaving, a socket closing, shutdown and an analyst asking all store the same way. The identity may write the accepted record's words and who last wrote them, and add a change-feed row and an audit line for that record. It reads only the keys its own save filters and answers on, and whether an account still exists. Every other column, row, table and case is refused to it by the store itself, not by the code that enters it.

**The application enters the identity for one save and leaves it with the transaction.** Nothing inherits it, so none of its policies or grants reach a request. The accepted record and case are set in the same transaction, so the store refuses a save that names anything else.

**The store's own guards still apply to it.** A sent report takes no words from it, as from anybody.

**A missing identity is refused at start, not at the first save.** An install where the application cannot enter it, or where it holds no grant on the prose, does not start, and says which role is missing.

**A save and its audit lines are one act.** Words are not stored where the lines naming their writers cannot be written, and neither lands without the other, whichever path made the save.

**Stopping the application ends its connections before it stops listening, and waits for saves already under way.** An open connection holds the listener open, so ending them last never ends them; and a save started by the last reader leaving is finished before the store closes.
