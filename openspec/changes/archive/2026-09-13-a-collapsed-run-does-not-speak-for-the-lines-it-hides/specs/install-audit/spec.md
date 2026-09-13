# Install audit

## MODIFIED Requirements

### Requirement: Refusals are recorded, and a run of them is louder than one

A refusal MUST be recorded. An attempt that failed is the thing an investigation is looking for, and a log holding only what succeeded describes an install where nothing was ever tried.

How serious a line is MUST be derived from what it records rather than chosen by whoever writes it.

A run of the same failure MUST be able to read as more serious than one of them, because one failed sign-in is a typo and thirty is an attack. What was stored MUST NOT be lowered by this — a line's recorded seriousness is a floor, and reading it may raise it but never reduce it.

Where a run stands for lines that did not all record the same thing, the reading MUST say so rather than presenting one line's record as the run's. A specimen drawn from a run reads as every line in it, and a reader cannot tell the two apart.

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

#### Scenario: A run whose lines recorded different things

- GIVEN a run of the same failure whose lines recorded different values
- WHEN the audit is read
- THEN the run says its lines disagreed, and reports none of them as the run's

#### Scenario: A run whose lines recorded the same thing

- GIVEN a run of the same failure whose lines all recorded the same value
- WHEN the audit is read
- THEN the run reports that value
