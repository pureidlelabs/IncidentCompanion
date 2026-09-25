# Design

## An identifier has one spelling after it is admitted

An identifier is accepted in either letter case, as a uuid is, and carried from that moment in lower case. Admission takes the connection's case identifier as a uuid and keeps its lower-case form for every key after it: the room, the roster, the claims, the open documents and the audit. A claimed entry is keyed by its identifier in lower case too. Every path parameter spelled as a uuid reaches its handler in lower case, and the case guard, which runs before that, asks and records in lower case too. A connection naming a case by anything that is not a uuid is refused as a case that is not there, and only once its session has been read: a caller without one is told to sign in whatever the path names.

## A caret belongs to the connection that announced it

The first connection to announce a caret on a case holds it until that connection ends, and the caret stays its analyst's for thirty seconds after, the time a peer takes to forget it, so a reconnecting browser takes it back rather than finding it taken. An update is read whole before anything is held: one that does not decode, or carries anything but a state, is dropped entire. An update for a caret held by, or kept for, another analyst is dropped entry by entry, and the rest of the update is still relayed. A caret leaving takes nothing: it is relayed only from the connection that holds it, since other browsers send one for a peer they stopped hearing from. A caret frame still queued when its connection ends is not acted on. A connection of the same analyst takes a held caret over, because a reconnecting browser keeps its caret while the connection it left may not have ended yet. Every relayed caret is named for the analyst the connection was admitted as; the colour stays the sender's, since it names nobody and the editor draws only a plain hex colour. A connection holds at most 256 carets, and a reader keeps a caret as any analyst in the case does.

## The bounds, and what they sit above

A browser tab holds one connection per open case, reconnects with a backoff that starts at half a second, and on reconnecting sends, per open document, a state request, its whole state and its caret. A keystroke is one sync frame and one caret frame, and an idle caret is renewed every fifteen seconds. Each bound sits well above that:

| Bound | Value | Answer past it |
| --- | --- | --- |
| Connections one account holds | 32 | the upgrade is refused 429 |
| Upgrades one account opens | 60 at once, then one a second | the upgrade is refused 429 |
| Upgrades one address has refused before anybody is known | 30 at once, then one every two seconds | the upgrade is refused 429 |
| Frames one connection sends | 1,000 at once, then 100 a second | the connection is closed 4429 |
| Bytes one connection sends | 4 MiB at once, then 256 KiB a second | the connection is closed 4429 |

A refusal made before anybody is known is counted against the caller's address once it is made, so a flood of them cannot pass the count by arriving together. A refusal made for a signed-in analyst is counted against their account. The count of connections an account holds runs from admission until the underlying socket closes, however it closes, and a socket already closed when the checks finish is never counted.

**A run is recorded once.** A refusal inside the address bound is recorded as any refused upgrade is. Past a bound, the first refusal writes one line in the class a throttled request writes, naming which bound, and nothing more is written until that caller is admitted within the bound again. A connection closed for its rate writes one line as it closes.

**The counts live in the process**, as the connections do: one application process per install.
