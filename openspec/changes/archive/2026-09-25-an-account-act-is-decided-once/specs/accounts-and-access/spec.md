# Accounts and access

## MODIFIED Requirements

### Requirement: An install always has somebody who can administer it

An install MUST NOT be able to reach a state where nobody can administer it. The last administrator MUST NOT be removable or demotable.

#### Scenario: The last administrator is removed

- GIVEN an install with one administrator
- WHEN somebody attempts to remove or demote them
- THEN it is refused
- AND they are told they are the last

#### Scenario: Two administrators act on each other at once

- GIVEN an install whose only two administrators each demote or disable the other at the same moment
- WHEN both are answered
- THEN one succeeds and the other is refused
- AND somebody who can administer the install remains
