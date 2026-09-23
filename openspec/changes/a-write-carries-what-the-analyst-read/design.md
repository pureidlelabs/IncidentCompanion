# Scope

**The server's check stays per row.** A write names the version of the whole record, and nothing here adds a per-field version to the wire. What is per field is the client's judgement of a refusal: a change to a field nobody else moved is sent again against the version that moved it, and only a field somebody else changed is a collision.

**A tab is the writer the chain orders.** Two tabs of one analyst are two writers, each with its own view of the record, and are checked against each other as two analysts are.

**A selection's change answers which rows took it, not what they became.** So a row with a change in flight offers no second change until the first is answered and the row read again, rather than the client guessing the version the first one reached.

**The not-live line says the screen may be behind. It does not say what is behind.** A dropped connection's announcements are gone; the re-read after it returns is the whole answer.

# Design

## A version is captured with what the analyst looked at

A write's version is taken where the analyst read the value it carries, never where the request leaves. Three places read a row for a write:

- **A change to a field** holds the version the record had when the analyst began changing that field, the value it held then, and the value the analyst has put there.
- **A selection** holds the version each row had when the analyst pressed the act, and the dialog confirming it acts on those.
- **A dialog** holds the row as it opened, and holds each field it changes the way a form does.

A version read at send time is not a fourth kind. The type that carries a read version is minted only at these places, so a caller handing the version it happens to have in hand does not compile.

## A record served again moves a change's version only where the field did not move

Every time the record is served newer than a held change was read at, each held field is judged against it:

- the server holds the analyst's value: the change is settled and the hold goes;
- the analyst's value is the one they started from: nothing of theirs is left, and the field follows the server;
- the field still holds the value the change began from: nobody else touched it, and the hold takes the newer version;
- otherwise somebody else changed it: the field keeps the analyst's value and shows the other beside it.

A field with no hold follows the server. The caret alone holds nothing. A hold with a write out is not judged until that write is answered, because its answer decides it.

## A collision is settled by a choice, never by leaving

A held field showing another analyst's value is not written when the analyst leaves it. Keeping their own writes it against the version that holds the other value. Taking the other's drops the hold. Both are presses made with both values on screen.

A refusal of a field nobody else moved, which happens when the other write landed but its announcement had not, is sent again against the newer version once the record is read again. A refusal of a field somebody else moved becomes the collision above.

## One tab's writes to a record leave in order, chained through its own answers

Writes to one record leave one after another from the tab that made them. A write queued behind the tab's own earlier write to the same record is sent against the version that earlier write produced, when it was read at the version the earlier one was sent against. The chain records only transitions this tab's own answers reported, so a record read again never lends a queued write a newer version.

The chain is the tab's own, not the request library's: a queued request that waits for the tab to be visible holds the analyst's last answer until they come back, and loses it if they close the tab.

## The screen holds only answers

No write is drawn before it is answered, and no copy of the record is put back after a refusal. What the analyst is changing lives in their hold or their dialog until the server answers; the record itself changes only when it is read again. A copy put back after a refusal can hold another write's refused value, and a copy drawn before the answer can show a value the server refused.

## A form writes a field when the analyst leaves it

Text and numbers are written on leaving the field. A choice made in one act — a select, a box, a set of options — is written as it is made. A keystroke is not an answer, and writing each one records partial values the analyst never meant and recomputes a verdict through each of them.

## A held row warns and stays editable

A row another analyst holds names them on the row and in the dialog that opens it. Its controls stay live. The version check decides the write.

## A screen that cannot know it is current says so

The case frame says the screen is not live from the moment its connection drops, and goes on saying so until the connection is back and the whole case has been read again. A re-read that fails leaves the line up and offers to read again. A connection still opening for the first time is not a drop; one that never opens is.

## The presence bound is served

The time after which a lost connection's name leaves the roster is the value the store enforces, served by the install's own description, so what is stated and what is enforced cannot differ.
