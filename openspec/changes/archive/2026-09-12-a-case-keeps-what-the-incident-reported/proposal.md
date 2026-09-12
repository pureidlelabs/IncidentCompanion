# A case keeps what the incident reported

## Why

A case started from an incident is created with no severity at all, whatever the provider reported. `openspec/specs/incident-import/spec.md` does not notice, because nothing in it says a case opened from an incident owes anything to the incident it was opened from. The requirement covers what the import writes into the case and stops at the case's own fields.

So the loss is not a rule being broken. Severity is one of the first columns an analyst sorts a case list by, and a provider that already judged the incident is the best answer the install will get; a case arriving unmarked reads as one nobody has triaged.

What made it unmarked is a vocabulary boundary nobody owns. The provider spells the ladder `High` and this product's vocabulary is lower-case, so a seed composed in the browser is refused by the case form -- and because it is one field of the create body, the refusal is a 400 on the whole act rather than a complaint about one value. The client is the wrong tier to translate in: it was deliberately emptied of mapping, and the next provider's spelling is not lower-case either.

The seed the browser cannot compose is one the server already can. The payload the create body carries is the provider's own, and the tier that maps it onto this product's vocabularies is the one the import already runs in.

## What Changes

- A case opened from an incident carries the severity the provider reported, in this product's vocabulary.
- Where several incidents open one case, the case carries the worst of them: under-marking is the direction an analyst does not go back and check.
- A level the vocabulary cannot say leaves the case unmarked rather than guessed at.
- The severity is derived from the payload rather than accepted from the caller, so the create door no longer offers a field whose spelling it would refuse.

## Impact

- `openspec/specs/incident-import/spec.md` -- one requirement added.
- The create door's body, which loses a parameter no caller could fill.
- The provider's severity table, which the alert mapper and the case seed now read from one place.
