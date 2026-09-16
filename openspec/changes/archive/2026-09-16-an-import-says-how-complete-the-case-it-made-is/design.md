# Scope

The count is of ids, not of rows or of links. An entry naming three deleted evidence rows counts three.

It says nothing about which rows lost links or what they pointed at. Naming them would be a per-collection breakdown like the CSV door's, and the archive door's ids are opaque by the time they fail to resolve.

Reference lists are not scrubbed when a row is deleted, and that is unchanged here. → #731

# Design

**Counted where the drop happens, not by a second pass.** The remap is the only place an id fails to resolve, and it already distinguishes the two shapes: a list is filtered and a scalar becomes null. A pass afterwards would have to re-derive which columns are references and which of their values were originally present, and would answer a different question — what the case holds now, rather than what the archive asked for and did not get.

**Scalars are counted and are expected to be zero.** Every scalar reference is a foreign key with `on delete set null`, so a deleted row leaves null rather than a dangling id and the archive carries null. A scalar that does dangle came from somewhere else — a hand-written archive, or one from an install whose schema differs — and is worth the same line as a list's.

**One requirement covers the attachments too.** The attachment count already existed with no requirement behind it. Both answer *what does this case name that is not here*, they are told in one place, and splitting them would put two halves of one sentence under two requirements.

**Not a refusal, and the wording carries that.** The count is told as a warning beside what did arrive, never as an error and never as a claim about the file. *This case names rows that are not in it* is true whether the cause was a tidied case or a partial archive, and the operator can tell those apart and the application cannot.
