# The case socket admits one spelling of a case, and a connection has a bounded rate

## Why

A case id typed in capitals was admitted, and every key after admission was the string the caller sent, so the connection sat in a room of its own: absent from the roster, a case deleted around it, and its accepted words never stored (#1252). A send naming its report in capitals missed the live document the same way. Awareness frames were relayed unread, so any reader could draw a caret under another analyst's name or take over theirs (#1253). And nothing limited how often a connection is opened or how much it sends, while an ordinary request is throttled at 25 a second (#1260, from #1099 and #538).

## What Changes

- **live**: a case is one case whichever spelling of its identifier names it, over a connection or a request.
- **live**: a caret names the analyst the install admitted, and only the connection that announced a caret moves it.
- **live**: an analyst holds and opens connections at a bounded rate, an address has a bounded number of upgrades refused before anybody is known, and a connection that sends past its budget is ended with a code that says so. A run of limited attempts is recorded once.

## Impact

- Admission, the case guard and every path parameter carry an identifier's lower-case form.
- A relayed awareness update carries only the sender's own carets, named for them.
- A limited upgrade answers 429; a limited connection closes with 4429, and the client reconnects under its own backoff.
- The HTTP half of the audit-volume question on #538 is not changed here.
