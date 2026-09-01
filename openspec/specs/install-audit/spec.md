# Install audit

## Purpose

An organisation running this install has to be able to answer what happened on it, to somebody who does not take their word for it. That is a different question from what happened in a case, which the case's own activity answers.

The accounts and access spec says that administrative events are logged. This spec says what that log is: what a line carries, what may be done to a line once written, how long lines are kept, and how the record reaches the organisation's own security monitoring. Case content is not in it.

## Requirements

### Requirement: A line, once written, cannot be changed

A line in the audit MUST NOT be alterable by the application. There MUST be no route, no administrative act and no ordinary operation of the install that edits what a line says.

The application MUST NOT be able to write a line claiming a time other than the time it was written, so that a record cannot be made to say something happened when it did not.

The protection MUST NOT depend on the application choosing to apply it. A line is written through the same store as everything else, and what refuses to change it MUST refuse a statement the application makes at all, so that a route added later inherits the refusal without anybody remembering.

#### Scenario: An attempt to change a line

- GIVEN a line in the audit
- WHEN anything in the application attempts to change what it says
- THEN it is refused

#### Scenario: A line claiming another time

- GIVEN an attempt to write a line timed other than when it is written
- WHEN the write is made
- THEN it is refused

### Requirement: A line is deleted only by having aged out, never by being unwanted

A line MUST NOT be deletable because somebody wants it gone. The only thing that removes a line MUST be that it has outlived the window the install declared for it.

The window MUST have a floor the install refuses to go below, and the floor MUST be enforced where the deletion happens rather than only where it is asked for. An install cannot be configured into keeping nothing.

Where no window has been declared, nothing MUST be deleted.

#### Scenario: An administrator wants a line gone

- GIVEN an administrator who wants a particular line removed
- WHEN they attempt it
- THEN there is no way to do it

#### Scenario: A window below the floor

- GIVEN an attempt to set a retention window below the install's floor
- WHEN it is made
- THEN it is refused
- AND lines older than the requested window are not removed

#### Scenario: No window declared

- GIVEN an install with no retention window declared
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
