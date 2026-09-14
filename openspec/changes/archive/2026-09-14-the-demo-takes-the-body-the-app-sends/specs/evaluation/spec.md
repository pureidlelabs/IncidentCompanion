# Evaluation

## MODIFIED Requirements

### Requirement: A draft is judged as an install would judge it

A write made in the evaluation build SHALL be accepted exactly when an install would accept it, and refused exactly when an install would refuse it, for the same reasons and naming the same fields.

The rules SHALL be the install's own rather than a description of them. A build that judges a write by its own copy satisfies every check written against the copy, and parts from the install the first time either moves.

#### Scenario: The analyst types something an install would accept

- GIVEN the evaluation build
- WHEN the analyst submits a draft that an install would accept
- THEN it is accepted
- AND what the analyst typed is what the build holds afterwards

#### Scenario: The analyst types something an install would refuse

- GIVEN the evaluation build
- WHEN the analyst submits a draft that an install would refuse
- THEN it is refused
- AND the fields named are the fields an install would name

#### Scenario: A write reaches a row somebody else has moved

- GIVEN a row the build holds at a version the draft does not name
- WHEN the write is submitted
- THEN it is refused in the words an install would use
- AND the build holds what it held before

#### Scenario: The rules an install enforces change

- GIVEN a change to what an install accepts
- WHEN an evaluation build is published after it
- THEN the evaluation build accepts and refuses by the changed rules
