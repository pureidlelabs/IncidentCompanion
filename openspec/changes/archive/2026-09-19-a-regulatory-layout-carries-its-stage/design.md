# Scope

The step a layout files, and how it reaches a report. Which submissions a case owes and when they fall due is the compliance capability's, and untouched here.

**The stage vocabulary is not renamed.** One layout's title differs from its step by a word, and that mismatch is only a problem for an implementation that reads a step off a title. Once nothing does, the two never have to agree, and changing a served vocabulary to make them agree would be a contract change bought with nothing.

**No validation of a step authored by an operator.** No layout row can be authored today, so the seeder is what puts steps in the library and a check over the shipped constants is what holds them to the vocabulary. A route that accepted an authored layout would owe one.

# Design

## A step is declared, never read off a title

A title is written for a reader and a step is matched against a vocabulary, so only one of them is a value. A title is content an operator edits and an analyst's own layout carries whatever they called it.

Reading a step off a title fails in the shape hardest to notice: the titles that match set their step and the one that does not sets nothing, so most of the obligation appears to work while the step that went missing is whichever one somebody retitled.

So the layout states its step as a value, beside the regime it belongs to.

## The value travels with the regime flag, or not at all

The flag saying which regime a layout belongs to already crosses the builtin, the seeded payload, the payload read back, the wire and the demo capture. The step is the same kind of statement and takes the same hops, so a hop that carries one and not the other is the defect rather than a variation.

The seeded payload is built once for both branches of the upsert. The update branch is the one every restart after the first takes, so a payload built per branch can gain a field on one side and answer differently after a reboot than it did on install.

## A route answers with what its schema declares

The layout list is serialized through a schema before it leaves, and a field the answer carries and the schema does not is dropped on the way out. Nothing above the wire sees it: the route's return type is that schema's own inference, and a test calling the function rather than the route never meets the serializer.

So the field is added to both together, held by a test over the parsed result rather than the built one, asserting the whole object so a later field is covered without anybody remembering.
