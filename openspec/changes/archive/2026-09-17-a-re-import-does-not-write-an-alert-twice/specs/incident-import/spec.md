# Incident import

## MODIFIED Requirements

### Requirement: An import is matched against what the case already holds

An import MUST decide whether each proposed row is something the case already holds or something new, and MUST show the analyst which it is.

The decision MUST be made against what the case holds at the moment of import rather than against anything the analyst's browser was told earlier, so that a row another analyst added while the import was being reviewed is still recognised.

An entry an earlier import wrote into this case MUST be recognised when the same material is imported again, and MUST NOT be written a second time. A platform's record of an event is one event however many times it is sent, and an import is run again often: to finish what a failure left, and to pick up alerts a platform has added to an incident since.

Only an entry an import wrote may be recognised this way. An entry an analyst wrote is their own record of what happened, and an import MUST write its own entry rather than treating theirs as already holding it.

What an import reports MUST account for every row the analyst approved. A row it recognised MUST be counted as already in the case rather than as added, whichever collection it belongs to, so the two figures an analyst is shown can be reconciled against each other.

#### Scenario: An imported thing is already in the case

- GIVEN a case already holding a host
- WHEN an import proposes that same host
- THEN the analyst is shown that it already exists
- AND accepting it does not create a second one

#### Scenario: The case changed while the import was reviewed

- GIVEN a preview taken before another analyst added a host
- WHEN the import is accepted
- THEN the host they added is recognised as existing
- AND it is not duplicated

#### Scenario: An event is imported twice

- GIVEN a case holding what an earlier import of an incident wrote
- WHEN the same incident is imported into it again and every row is approved
- THEN no entry that import already wrote is written again
- AND every row it recognised is reported as already in the case rather than as added

#### Scenario: An analyst's own entry resembles one arriving

- GIVEN a case holding a timeline entry an analyst wrote
- WHEN an import proposes an entry that looks like it
- THEN the import writes its own entry
- AND the analyst's entry is untouched
