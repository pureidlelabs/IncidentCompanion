# Words are stored without their writer

## Why

Prose whose every writer's account was deleted before it was saved was lost unless an analyst who could write the record asked for it first (#1228): the save acted as a writer or as whoever asked, and a writer with no account reaches nothing. Every announcement of a write carried its writer, which no screen read (#1229).

## What Changes

- **live**: words whose every writer's account is gone are stored, naming nobody; words whose writer still has an account and no longer writes are not stored that way.

## Impact

- The install stores such words on every save: the quiet moment, the last reader leaving and the application stopping.
- A save's audit lines are written in the act that stores the words, so neither lands without the other.
- The application ends its connections before it stops listening, and waits for a save already under way.
- An announcement no longer carries its writer.
