# Evidence leaves with its record, and the start removes nothing

## Why

The start removed stored bytes the database did not name. A database restored from an older copy, rebuilt, or pointed at the wrong directory names none of what was stored after its copy was taken, so its first start removed artefacts that may have been the only copy -- and the record of a deletion was no protection against an older database that had never seen the case change. The same removal was the only thing that took away a deleted evidence record's bytes, so those stayed on disk for as long as the install ran.

## What Changes

- **state**: the requirement that an artefact is reached only through its case says that bytes leave a case when nothing in it names them any more -- when the record naming them is deleted, alone or in a selection, or comes to name other bytes -- and that bytes arriving for no record the case keeps do not stay. Starting removes nothing: the install says how many stored artefacts nothing names, at start and in its own description, and leaves them for an operator.
- The scenario for an install starting beside a database that does not hold a case gains the count. Three scenarios are added: bytes attached to one record while another record naming them goes, bytes that arrive for no record, and an install starting beside a database older than a record.

## Impact

- The start-up sweep, its grace period and its reading of the deletion record are gone; the census counts what nothing names and removes none of it.
- A deleted or replaced evidence record's bytes, a refused attachment's bytes and an archive member no record names leave the case at once, unless something else in it still names them.
- A case's deletion, a record's deletion and an attachment are one at a time within a case, from the bytes landing to the record naming them.
- The install's description gains the count of stored artefacts nothing names.
