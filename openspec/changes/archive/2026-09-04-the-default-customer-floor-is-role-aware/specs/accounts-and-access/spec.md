# accounts-and-access

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

### Requirement: Managing the install and reaching case data are separate grants

Administering the install and reading a customer's cases are different powers and MUST be granted separately.

The **management plane** is the install itself: accounts, groups and their memberships, which customers exist and which group they sit in, federation, retention, and the install's own settings. The **data plane** is what a case holds: its entries, its evidence, its report, its compliance record.

Creating a group, deciding which customers it holds, and deciding who is in it at what level are management-plane acts and belong to an administrator alone.

Holding one MUST NOT imply holding the other over any customer somebody has been onboarded as. An administrator who has granted themselves no data access reaches no such customer's cases, and an analyst who reaches every customer's cases administers nothing.

**The default customer is the stated exception, and the role decides the level there.** It holds only incidents nobody has been named for, so an administrator reaching them is not reaching anybody's data; what it buys is an install that can dispose of an untriaged case without first building the access model. The exception reaches that customer and stops.

An administrator can grant themselves data access, and that is deliberate. The power to manage groups is the power to join one, and no rule an administrator administers protects anybody from them.

**The product's answer to this is the record, not a restriction.** What is technically possible and what an organisation permits are different questions, and the second belongs to whoever runs the install: their screening, their separation of duty, their four-eyes rule, enforced by their own procedure. This application makes the act possible, makes it attributable, and makes it visible in a log the organisation can audit against its own controls. It MUST NOT build the approval workflow that organisation may or may not want.

#### Scenario: An administrator has granted themselves no data access

- GIVEN an administrator belonging to no group
- WHEN they request the contents of a case belonging to a customer somebody has been onboarded as
- THEN it is refused
- AND they may grant themselves the access and try again

#### Scenario: An analyst with wide data access administers nothing

- GIVEN an analyst reaching every customer through groups
- WHEN they attempt to create an account, a group, or a customer
- THEN it is refused

#### Scenario: An administrator grants themselves access

- GIVEN an administrator
- WHEN they add themselves to a group
- THEN they reach that group's customers at that membership's level
- AND the grant is logged naming them as both the grantor and the subject
