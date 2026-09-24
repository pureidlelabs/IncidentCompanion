# Scope

**A reorder is refused whole or written whole.** There is no partial reorder, and none that keeps the rows that did not move while refusing the rest.

# Design

## An order is written under the version check

A reorder names every row of the set it arranges with the version it read. The set is locked in one fixed order before anything is compared, so two reorders of it queue rather than interleave or wait on each other; the second then finds the rows the first moved at their new versions and is refused, naming them.
