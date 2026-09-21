# Collections

## MODIFIED Requirements

### Requirement: Only some collections have an identity, and the rest are events

**A thing has an identity; an event does not.** Systems, accounts and the other collections that describe something in the world MUST have a rule for whether two rows are the same thing, so that importing the same host twice does not double it.

The timeline, actions, notes, evidence, impact, reports and their parts MUST NOT. Two entries that look alike are two facts, and merging them loses one. For these, sameness MUST NOT be inferred from what is written: not by resemblance, not by content, not by proximity in time. Two entries supplied are two rows, and nothing merges them afterwards.

An importer recognising material it has already brought into a case is a separate question, answered by the import rather than by the store, and it MUST NOT reach any other path. What reaches the store is what an import decided to write.

Where a collection has an identity, that rule MUST be one rule, used by every path that could create a row. Two importers answering "have I got this already" differently doubles a case on a re-import, and neither of them is wrong on its own.

An identity rule MUST be insensitive to what a person would consider the same: a hostname's case and surrounding space, an account's domain written either way.

#### Scenario: The same host is imported twice

- GIVEN a case already holding a host
- WHEN an import supplies the same host, cased differently and padded
- THEN it is recognised as the one already there

#### Scenario: The same timeline entry is imported twice

- GIVEN a case already holding a timeline entry
- WHEN an identical one is supplied to the store
- THEN both are kept
- AND nothing merges them

#### Scenario: A second way of creating rows is added

- GIVEN a collection with an identity rule
- WHEN a further path can create its rows
- THEN it decides sameness by the same rule
- AND cannot answer differently
