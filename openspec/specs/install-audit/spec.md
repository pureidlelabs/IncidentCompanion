# Install audit

## Purpose

An organisation running this install has to be able to answer what happened on it, to somebody who does not take their word for it. That is a different question from what happened in a case, which the case's own activity answers.

The accounts and access spec says which events are logged, and that an entry once written is never changed or removed. This spec says what that record is: where it lives, what a line carries, what may be done to a line, and how long the install itself holds one. Case content is not in it.

## Requirements

### Requirement: The record's home is a destination the operator keeps, not this install

An install MUST be able to send its audit to a destination the operator chooses, and that destination MUST be where the record durably lives.

A record kept only by the system it describes is a record that system can lose. Everything the install can enforce about its own copy stops at whoever holds the install, and an administrator investigating their own compromise is asking the compromised machine to testify. Sending each line somewhere the install does not control is the only thing that answers it.

A line MUST reach the destination, and the install MUST NOT report a line as recorded that it has not either delivered or is still holding to deliver. A destination that cannot be reached MUST NOT cause a line to be lost, and MUST NOT cause the act being recorded to fail.

An install with no destination configured MUST still keep the full record itself. Article V means an install configured with nothing is complete, so the absence of a destination makes the install's own copy the record rather than making the record optional.

#### Scenario: An install with a destination configured

- GIVEN an install sending its audit to a destination the operator keeps
- WHEN something happens that is recorded
- THEN the line reaches that destination

#### Scenario: The destination cannot be reached

- GIVEN an install whose destination is unreachable
- WHEN something happens that is recorded
- THEN the act itself still succeeds
- AND the line is held until the destination can be reached

#### Scenario: An install with no destination configured

- GIVEN an install where no destination has been configured
- WHEN something happens that is recorded
- THEN the install's own copy is the record
- AND nothing about the install is incomplete for it

### Requirement: A line, once written, cannot be changed

A line in the audit MUST NOT be alterable by the application. There MUST be no route, no administrative act and no ordinary operation of the install that edits what a line says.

The application MUST NOT be able to write a line claiming a time other than the time it was written, so that a record cannot be made to say something happened when it did not.

A route added later MUST inherit the refusal without anybody having remembered it. Immutability that each write path applies for itself is immutability the next write path will not have.

#### Scenario: An attempt to change a line

- GIVEN a line in the audit
- WHEN anything in the application attempts to change what it says
- THEN it is refused

#### Scenario: A line claiming another time

- GIVEN an attempt to write a line timed other than when it is written
- WHEN the write is made
- THEN it is refused

### Requirement: What the install holds is a buffer, and letting it go is not deleting the record

Once a line has reached the destination, what the install still holds is a copy. The install MUST be able to let that copy go, and doing so MUST NOT be the record being deleted.

A line MUST NOT be lettable go before it has reached the destination. Letting go is bounded by delivery rather than by time alone, so a destination that has been unreachable for a week does not cost a week of the record.

A line MUST NOT be deletable because somebody wants it gone. What removes a copy MUST be that it has been delivered and has outlived the window the install declared, and nothing else.

Where the install is the record because no destination is configured, its copy MUST be governed as the record rather than as a buffer: a window with a floor the install refuses to go below, enforced where the deletion happens rather than only where it is asked for, and nothing removed at all where no window is declared.

In that mode, letting a line go removes the only copy there is, so it MUST itself be recorded in the record: what was removed, how much, and under which window. The record MUST NOT be able to lose lines without saying that it did, or a gap in it cannot be told apart from a period when nothing happened.

Where a destination holds the record, that account MUST NOT be required, because nothing was lost to account for.

#### Scenario: A delivered line ages out of the install

- GIVEN a line that has reached the destination
- AND that has outlived the window the install holds copies for
- WHEN the install lets it go
- THEN the record still holds it at the destination

#### Scenario: The destination has been unreachable

- GIVEN lines that have not reached the destination
- WHEN they outlive the window the install holds copies for
- THEN they are kept
- AND they are let go only once they have been delivered

#### Scenario: An install that is the record lets a line go

- GIVEN an install with no destination configured
- WHEN lines are removed for having outlived the window
- THEN the record says what was removed, how much, and under which window

#### Scenario: An administrator wants a line gone

- GIVEN an administrator who wants a particular line removed
- WHEN they attempt it
- THEN there is no way to do it

#### Scenario: A window below the floor, on an install that is the record

- GIVEN an install with no destination configured
- AND an attempt to set its retention window below the floor
- WHEN it is made
- THEN it is refused
- AND lines older than the requested window are not removed

#### Scenario: No window declared, on an install that is the record

- GIVEN an install with no destination configured and no retention window declared
- WHEN lines are aged out
- THEN nothing is removed

### Requirement: What is kept for a long time and what is kept briefly are separated

The audit holds two kinds of line, and treating them alike makes one of them useless. A line answering who did what to the install is evidence, and MUST be kept for a long time. A line recording that the install is running is operational noise, and keeping it as long buries the first kind.

Which kind a line is MUST be decided by what the line is, at the moment it is written, and MUST NOT be a choice anybody makes later.

Each kind MUST have its own window and its own floor.

#### Scenario: A line is written

- GIVEN any line written to the audit
- WHEN it is stored
- THEN it carries which kind of line it is
- AND that was decided by what the line records

#### Scenario: The two windows differ

- GIVEN an install with both windows set
- WHEN lines are aged out
- THEN each kind is aged out against its own window

### Requirement: A line says who, what, and to what, and never says what was written

A line MUST carry who acted, what they did, what they did it to, and when.

A line MUST carry who acted in a form that survives the account being renamed or removed, because an audit that stops naming somebody once they are deleted cannot answer the question it exists for.

A line MUST NOT carry what was sent. Case content, passwords, passphrases and the bodies of requests MUST stay out of the audit, which is read by people who do not reach the case data the install holds.

Where a line records the address a request came from, it MUST be taken from something the caller cannot set. A caller who can write their own address into the audit can write somebody else's.

#### Scenario: An account is removed after acting

- GIVEN a line recording something an account did
- WHEN that account is removed
- THEN the line still says who did it

#### Scenario: A request carrying a password

- GIVEN a request whose body carries a credential
- WHEN it is recorded
- THEN the body is not in the line

#### Scenario: A caller asserts their own address

- GIVEN a caller presenting an address of their choosing
- WHEN the request is recorded
- THEN the recorded address is not the one they presented

#### Scenario: A caller invents a route

- GIVEN a caller requesting a path the install does not serve
- WHEN the refusal is recorded
- THEN what is recorded is what the install matched
- AND it is not the text the caller sent

### Requirement: Refusals are recorded, and a run of them is louder than one

A refusal MUST be recorded. An attempt that failed is the thing an investigation is looking for, and a log holding only what succeeded describes an install where nothing was ever tried.

How serious a line is MUST be derived from what it records rather than chosen by whoever writes it.

A run of the same failure MUST be able to read as more serious than one of them, because one failed sign-in is a typo and thirty is an attack. What was stored MUST NOT be lowered by this — a line's recorded seriousness is a floor, and reading it may raise it but never reduce it.

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

### Requirement: Changing what the audit keeps is itself audited, and loudly

A change to what the audit records or how long it keeps it MUST be recorded in the audit.

Where a change reduces what is kept, it MUST read as more serious than a change that increases it. Shortening the window is the act somebody covering their tracks performs, and it MUST NOT be recorded as indistinguishable from lengthening it.

#### Scenario: The retention window is shortened

- GIVEN an administrator shortening a retention window
- WHEN the change is made
- THEN it is recorded
- AND it reads as more serious than lengthening it would

### Requirement: Reading the audit is an act the audit records

Reading the audit MUST be recorded in the audit, because who has been through the record is part of the record.

Reading MUST be an administrative act and MUST be refused to anybody who is not an administrator.

Recording a read MUST NOT be allowed to drown the thing being read. An administrator working through the audit MUST NOT generate a line per page.

#### Scenario: An administrator reads the audit

- GIVEN an administrator reading the audit
- WHEN they read it
- THEN the read is recorded

#### Scenario: An analyst who is not an administrator

- GIVEN an analyst who is not an administrator
- WHEN they attempt to read the audit
- THEN it is refused

#### Scenario: An administrator pages through the audit

- GIVEN an administrator reading many pages of the audit in one sitting
- WHEN the reads are recorded
- THEN they do not produce a line for each page

### Requirement: The record is readable by the monitoring the organisation already runs

The audit MUST be published in a vocabulary the organisation's own security monitoring already understands, so that ingesting it is configuration rather than a mapping exercise.

The vocabulary MUST be a published one, and the install MUST say which version of it a line was written against. An organisation cannot map a record whose shape it has to infer.

A line MUST carry that vocabulary's own identity for what it records, decided when the line is written, so that what a line means does not change when the install is upgraded.

#### Scenario: The audit is read by an external system

- GIVEN an organisation's security monitoring
- WHEN it reads a line from the audit
- THEN the line identifies itself in a published vocabulary
- AND it names the version of that vocabulary

#### Scenario: An install is upgraded

- GIVEN lines written before an upgrade
- WHEN they are read afterwards
- THEN they still say what they said when they were written
