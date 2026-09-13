# Install audit

## MODIFIED Requirements

### Requirement: Refusals are recorded, and a run of them is louder than one

A refusal MUST be recorded. An attempt that failed is the thing an investigation is looking for, and a log holding only what succeeded describes an install where nothing was ever tried.

How serious a line is MUST be derived from what it records rather than chosen by whoever writes it.

A run of the same failure MUST be able to read as more serious than one of them, because one failed sign-in is a typo and thirty is an attack. What was stored MUST NOT be lowered by this — a line's recorded seriousness is a floor, and reading it may raise it but never reduce it.

What makes two refusals the same refusal MUST NOT be anything the caller chooses. A caller who can vary it decides whether their own attempts are counted together, and one attempt each at a hundred accounts is the attack a run is meant to reveal. Where a refusal names what was asked for, that name MUST be the install's own; what the caller supplied is recorded where it cannot separate one run into many.

#### Scenario: A sign-in fails

- GIVEN a failed sign-in
- WHEN the audit is read
- THEN it is there

#### Scenario: One failure and a run of them

- GIVEN one failed attempt, and elsewhere a run of the same failure in a short window
- WHEN the audit is read
- THEN the run reads as more serious than the single one

#### Scenario: A stored seriousness is not lowered

- GIVEN a line stored as serious
- WHEN it is read
- THEN it does not read as less serious than it was stored

#### Scenario: One caller, a different account each time

- GIVEN a caller making failed sign-ins, naming a different account at each attempt
- WHEN the audit is read
- THEN they read as one run rather than as unrelated single failures
- AND the run reads as more serious than one of them

#### Scenario: What the caller supplied is still recorded

- GIVEN a refusal naming something the caller asked for
- WHEN it is recorded
- THEN what they supplied is in the line
- AND it is not what decides which run the line belongs to
