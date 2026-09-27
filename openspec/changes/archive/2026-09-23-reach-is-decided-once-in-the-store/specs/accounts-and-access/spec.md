# Accounts and access

## MODIFIED Requirements

### Requirement: Case data is reached through groups, at a level

A group holds customers. An analyst joins a group at a level, and that level is what they may do to the cases of every customer in it.

The levels are:

- **Read** — see the customer's cases and everything in them.
- **Read and write** — and change what a case holds, which includes removing entries, entities, evidence and report sections from it. Everything inside a case is the analyst's working material, and taking a wrong entry out is ordinary work rather than destruction.
- **Read, write and delete** — and destroy the case itself.

Delete is about the case as a whole and nothing smaller.

A customer MAY belong to more than one group and an analyst MAY belong to more than one. Where memberships overlap the most permissive applies. An analyst belonging to no group reaches no customer's cases beyond the default customer.

Membership and its level MUST be grantable and revocable one at a time, and a revocation MUST take effect for sessions already open rather than at their next sign-in.

**A list names only what its analyst reaches.** Where the application answers with a list that names cases rather than the contents of one case, it MUST name only the cases the asking analyst reaches, decided by the same rule that decides whether they reach one case by name. A list built from what an analyst has already opened MUST be decided when it is read rather than when it was written, so that reach withdrawn after the visit withdraws the case from the list, and a case kept in such a list deliberately MUST be withdrawn on the same terms as one that was not.

**The default customer is the one exception in this specification, and it is stated here so that every other rule can be read without one.** Every account reaches it regardless of groups, federation or mapping, and that MUST NOT be revocable. The level is the account's role: an analyst reaches it at read and write, and an administrator reaches it at read, write and delete, so that an install can dispose of a case nobody has attributed without first building the access model.

This is a floor rather than a ceiling: a group holding the default customer MAY raise an account above it, and no membership lowers an account below it.

It is not an inherited grant to somebody's data. The default customer holds only incidents whose origin is not yet known, which by definition are nobody's yet; the moment an incident is attributed to a real customer it leaves, and reach to it becomes that customer's business like any other. Holding the administrator role grants nothing over any other customer. Wherever this specification says an analyst reaches no customer, the default customer is excepted.

#### Scenario: A group is built for a sector

- GIVEN a group holding a set of customers
- WHEN an administrator adds an analyst to it at read and write
- THEN that analyst reaches the cases of every customer in the group, and may change them
- AND reaches no customer outside it, save the default customer
- AND a customer added to the group later is reached without touching the analyst

#### Scenario: Two memberships disagree

- GIVEN a customer in two groups
- AND an analyst in one at read and the other at read and write
- WHEN they act on that customer's cases
- THEN they may write

#### Scenario: A level is reduced while the analyst is working

- GIVEN an analyst writing to a case
- WHEN their membership is reduced to read
- THEN further writes are refused
- AND what they have already written stands

#### Scenario: Reach is withdrawn while the analyst is working

- GIVEN an analyst with a case open
- WHEN the group that reached it is revoked, or the customer leaves it
- THEN they stop being served that case
- AND anything they had open on it stops updating

#### Scenario: An analyst removes something inside a case

- GIVEN an analyst at read and write
- WHEN they remove an entry, an entity, a piece of evidence or a report section
- THEN it is removed
- AND the removal is attributed like any other change

#### Scenario: An analyst attempts to delete the case itself

- GIVEN an analyst at read and write
- WHEN they attempt to delete the case
- THEN it is refused

#### Scenario: The default customer cannot be withheld

- GIVEN any analyst
- WHEN an administrator attempts to withhold the default customer from them
- THEN it is refused

#### Scenario: An administrator disposes of a case nobody has attributed

- GIVEN an administrator who belongs to no group
- AND a case that no customer has been named for
- WHEN they delete it
- THEN it is deleted
- AND no group had to be made to allow it

#### Scenario: An analyst is refused the same deletion

- GIVEN an analyst who belongs to no group
- AND a case that no customer has been named for
- WHEN they attempt to delete it
- THEN it is refused
- AND they may still read it and write to it

#### Scenario: A group raises an account above the floor

- GIVEN an analyst who belongs to a group holding the default customer at delete
- WHEN they delete a case nobody has attributed
- THEN it is deleted

#### Scenario: An identity the install does not hold

- GIVEN a session whose account no longer exists
- WHEN it asks for a case, one of the default customer's included
- THEN it is refused

#### Scenario: A list is asked for by an analyst in no group

- GIVEN an administrator belonging to no group
- WHEN they ask for a list that names cases
- THEN no case of a customer somebody has been onboarded as is named by it
- AND a case the install has attributed to nobody is named by it
- AND they may grant themselves the access and ask again

#### Scenario: Reach is withdrawn after the case was opened

- GIVEN an analyst who has opened a case, and kept it in their list
- WHEN the group that reached it is revoked
- THEN the list stops naming that case
