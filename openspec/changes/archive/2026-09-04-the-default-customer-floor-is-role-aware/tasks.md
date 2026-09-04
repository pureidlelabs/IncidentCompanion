# Tasks

- [ ] Make the default customer's floor answer to the account's role in `ReachService`, so the level is decided where reach is resolved.
- [ ] Remove the clause in the case guard that decided a level for itself, and the request shape it needed.
- [ ] Assert each scenario: an administrator in no group deletes an unattributed case; an analyst in the same position is refused and keeps read and write; the role reaches no further than the default; a group still raises an account above the floor.
- [ ] Assert the readers agree — the resolution and the guard answer the same level for the same account and customer.
- [ ] Trace the ASVS controls the modified requirement answers in `openspec/matrix/asvs.md`.
- [ ] Sync into `openspec/specs/`, archive the change, and land both in the branch's own commits.
