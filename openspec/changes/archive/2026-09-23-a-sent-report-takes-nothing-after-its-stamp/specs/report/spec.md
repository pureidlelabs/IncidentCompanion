# The report

## MODIFIED Requirements

### Requirement: A sent report is frozen, and the freeze is one rule

Once a report has been sent it MUST NOT change. Not its parts, not their order, not the prose in them, not what they draw from.

**The freeze MUST be declared once, where a report's parts are described, rather than at each place that writes one.** Several paths reach a part, and a rule written at each of them is written as many times as there are paths and forgotten on the next one.

**Moving a part into a sent report is a write to that report.** A rule that only inspects the part being changed will permit it, because the part was not in a frozen report when the write began. The rule MUST read what the write intends as well as what exists.

**The prose is a part of the report, and the freeze holds on it however the words arrive.** An analyst still writing into a report when it is sent MUST be told that what they type is not taken and when the report was sent, and MUST NOT depend on having been told of the send some other way first.

#### Scenario: A sent report is edited

- GIVEN a sent report
- WHEN anybody attempts to change any part of it
- THEN it is refused

#### Scenario: A part is moved into a sent report

- GIVEN a part belonging to a draft
- WHEN it is changed so as to belong to a sent report
- THEN it is refused

#### Scenario: A new way to write a part is added

- GIVEN a further path that can change a report's parts
- WHEN it writes to a sent report
- THEN it is refused
- AND nobody had to remember to guard it

#### Scenario: Prose reaches a sent report

- GIVEN an analyst with a report open for writing
- WHEN the report is sent and they go on typing
- THEN what they type is refused
- AND they are told the report was sent, and when
- AND the report still holds exactly the prose that was sent

### Requirement: Sending stamps and preserves in one act

Sending MUST record that the report was sent and preserve what was sent, and these MUST be one act.

Two acts leave a window in which a report is sent and what it said is unknown, which is the state nobody can recover from: the document has left, and the application cannot say what it contained.

What is preserved MUST be what was produced, not the instructions for producing it. A report rebuilt later from a changed case is not what was sent.

Where a report cannot be produced, it MUST NOT be marked sent.

**What is sent MUST be the report as it stood when it was stamped.** A change to the report or one of its parts that was answered as written before the stamp MUST be in what was sent. Where one lands while the document is being produced, the send MUST be refused, MUST say what moved, and MUST leave the report a draft holding the change. A change answered as written and missing from what left is the silent loss Article II refuses.

**Prose being typed while a report is sent MUST end in what was sent or be refused to the typist.** Nothing typed may be kept in the report and missing from what was sent. Where the send does not complete, nothing typed while it was deciding is lost.

Sending MUST be recorded as a change to the case like any other, naming who sent it, in the same act as the stamp.

#### Scenario: A report is sent

- GIVEN a report ready to send
- WHEN it is sent
- THEN it is stamped and what it said is preserved together
- AND no failure can produce one without the other

#### Scenario: The document cannot be produced

- GIVEN a report that fails to render
- WHEN sending is attempted
- THEN it is not marked sent

#### Scenario: The case changes after sending

- GIVEN a sent report
- WHEN the case it drew from changes
- THEN what was preserved is unchanged

#### Scenario: A part changes while the report is being sent

- GIVEN a report being sent
- WHEN another analyst changes one of its parts before it is stamped
- THEN either the change is in what was sent, or the send is refused saying what moved and the report stays a draft holding the change
- AND no change answered as written is missing from what was sent

#### Scenario: Prose is typed while the report is being sent

- GIVEN an analyst typing into a report
- WHEN another analyst sends it
- THEN the report holds exactly the prose that was sent
- AND anything they typed that was not sent was refused to them

#### Scenario: A send that fails while prose is typed

- GIVEN an analyst typing into a report
- WHEN a send of it is attempted and does not complete
- THEN everything they typed is kept
- AND none of it was refused

#### Scenario: A send is recorded

- GIVEN a report
- WHEN it is sent
- THEN the case's record of changes names who sent it
- AND that record is stored in the same act as the stamp

### Requirement: A correction is a new report, not an edit

An analyst who must correct something already sent MUST produce a further report that supersedes the first.

The superseded report MUST remain, and MUST remain marked as superseded. A recipient asking what they were told MUST be answerable, including where what they were told was wrong.

A report MUST NOT be superseded twice in a way that leaves which one stands ambiguous.

A correction MUST be made in one act: the further report, its parts and its prose exist together or not at all, and the act is recorded as a change naming who made it.

#### Scenario: A sent report is wrong

- GIVEN a sent report containing an error
- WHEN the analyst corrects it
- THEN a further report supersedes it
- AND the first remains, marked superseded

#### Scenario: Two corrections race

- GIVEN a sent report
- WHEN two supersessions are attempted
- THEN one succeeds
- AND which report stands is unambiguous

#### Scenario: A correction is recorded

- GIVEN a sent report
- WHEN it is corrected
- THEN the case's record of changes names who made the further report and each of its parts
- AND that record is stored in the same act as the report

### Requirement: A report says what is missing before it is sent

An analyst MUST be able to see what a report does not yet say: parts left empty, sections a chosen shape expects and the report does not have, and anything the case owes that the report was meant to carry.

This MUST be available before sending, not discovered by a reader.

Restoring the sections a shape expects MUST be one act, recorded as a change naming who made it. Two restores at the same moment MUST put each section back once.

#### Scenario: A report is checked before sending

- GIVEN a report with empty parts and missing sections
- WHEN the analyst asks what is outstanding
- THEN each is named

#### Scenario: A section was removed and is wanted back

- GIVEN a report whose shape expects a section the analyst removed
- WHEN they restore it
- THEN it returns in the place that shape gives it

#### Scenario: Two analysts restore the missing sections at once

- GIVEN a report whose shape expects sections it does not have
- WHEN two analysts restore them at the same moment
- THEN each section returns once
- AND both are told the restore succeeded
- AND the case's record of changes names who restored them
