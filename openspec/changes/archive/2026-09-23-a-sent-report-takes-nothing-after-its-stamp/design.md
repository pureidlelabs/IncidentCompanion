# Scope

**A send freezes the case as its render read it.** A change elsewhere in the case landing while the document is produced is the case moving after the read, and stays out of what was sent exactly as it would a moment later. What a send checks is the report and its own parts.

**One application process serves an install.** Holding a report's prose still while it is sent is that process's to do. The store's refusal is what stands behind it, for a second process or a path that holds no prose at all, and it is refused at that path's next write rather than at the keystroke.

**Where a report's freeze is refused, it is refused whole.** There is no partial write to a sent report, and no path that may write one for a reason of its own.

# Design

## The store holds the freeze

A sent report refuses every change from every path, because the store refuses it: an update or removal of a report stamped as sent, and an insertion, change or removal of a part whose report, before or after the change, is stamped. A path added later is refused without being written to be.

The rules the store keeps are statements the schema's own tooling does not manage, so every preparation of a database applies them after the schema, and applying them again changes nothing.

A part's write waits for a send already deciding on its report and then reads the stamp that send left. That is what closes the window between checking a report and writing to it: the check and the write are one statement.

A write issued by the store itself on behalf of another write passes: a case deleted with its reports, and an account deleted and nulled out of what it wrote. Neither is a change to what was sent.

The refusal names the report and when it was sent, and every door answers it with the one refusal a client can read.

A path that brings a sent report in whole, from an archive or a demonstration, writes it as a draft and stamps it last.

## A send is one checked act

A send holds the report's prose still, produces the document from it, and then, in one act under a lock on the report, checks that nothing it drew from has moved and stamps the report with the document, the prose and a record of the change. The document is produced outside the lock, because producing it is unbounded.

What the document drew from is the report's version and each part's; a part added, removed or changed since, or a change to the report, refuses the send and names what moved. The report stays a draft holding the change.

Prose arriving while a send decides waits. A send that stamps refuses it with the stamp; one that does not applies it in order. Prose for a sent report is refused wherever it arrives, from the report's own stored stamp, so a writer who never heard of the send is still refused.

## Correcting and restoring are one act each

A correction writes the further report, its parts, their records and its prose together. For a sent report, the prose it inherits is what was sent.

A restore locks the report, works out what its shape expects that it does not hold, and writes those sections with their records in the same act, so a second restore waiting behind the first finds nothing missing.
