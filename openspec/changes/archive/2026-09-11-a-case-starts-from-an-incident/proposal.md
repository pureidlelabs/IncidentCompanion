# A case starts from an incident

## Why

`openspec/specs/incident-import/spec.md` says what an import asked to create a case must do, and says nothing about an analyst ever asking for one. The requirement opens on *where an import is asked to create the case as well as fill it*, which reads as a condition somebody else satisfies -- so the behaviour is fully specified and nothing in the specifications obliges a route to it to exist.

That is how a route comes to be reached by nothing. A conditional requirement is met by an implementation nobody can call, and the suites agree: the write path has its own tests and passes them, against a door no screen opens.

The half an analyst notices is the shape of the door that does exist. Starting a case and filling it from an incident is two acts, so the case is written before the incidents have been looked at, and a wizard left halfway leaves the empty case the requirement refuses -- reached by abandoning the second act rather than by any failure in it.

## What Changes

- Starting a case from a live source is one of the choices an analyst is offered where a case is started.
- The wizard is the one the importer inside a case already uses, and its ending is what differs: the case is made when the rows are.
- What the case is called is asked once the analyst has seen the incidents, while nothing is written.

## Impact

- `openspec/specs/incident-import/spec.md` -- one requirement added.
- The chooser, the wizard screen and the container behind it.
- The rail's name for a case, which read the optional field and fell back to an identifier. A case with no reference is what this door makes.
