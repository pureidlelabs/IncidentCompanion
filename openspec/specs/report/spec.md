# The report

## Purpose

What leaves the investigation. A report is the document an analyst hands to somebody who was not in the case — a customer, a regulator, a board — and it is the only artefact of this application that is read by people who will never see the application.

It is assembled from the case rather than written beside it, so that what it says and what the investigation found cannot drift apart.

## Requirements

### Requirement: A report is assembled from the case, not transcribed from it

A report MUST be built from parts, and a part that presents what the case holds MUST draw from the case rather than from a copy somebody pasted.

An analyst MUST be able to write prose that exists only in the report, because a report says things an investigation does not record — what it means, what was concluded, what is recommended.

Those are the two kinds of part, and the distinction MUST be visible: what is drawn from the case moves when the case moves, and what was written stays as written.

#### Scenario: The case changes under a draft report

- GIVEN a draft report presenting the case's timeline
- WHEN the timeline changes
- THEN the report presents the change

#### Scenario: An analyst writes an assessment

- GIVEN an analyst writing prose into a report
- WHEN the case changes
- THEN what they wrote is unchanged

### Requirement: A sent report is frozen, and the freeze is one rule

Once a report has been sent it MUST NOT change. Not its parts, not their order, not the prose in them, not what they draw from.

**The freeze MUST be declared once, where a report's parts are described, rather than at each place that writes one.** Several paths reach a part, and a rule written at each of them is written as many times as there are paths and forgotten on the next one.

**Moving a part into a sent report is a write to that report.** A rule that only inspects the part being changed will permit it, because the part was not in a frozen report when the write began. The rule MUST read what the write intends as well as what exists.

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

### Requirement: Sending stamps and preserves in one act

Sending MUST record that the report was sent and preserve what was sent, and these MUST be one act.

Two acts leave a window in which a report is sent and what it said is unknown, which is the state nobody can recover from: the document has left, and the application cannot say what it contained.

What is preserved MUST be what was produced, not the instructions for producing it. A report rebuilt later from a changed case is not what was sent.

Where a report cannot be produced, it MUST NOT be marked sent.

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

### Requirement: A correction is a new report, not an edit

An analyst who must correct something already sent MUST produce a further report that supersedes the first.

The superseded report MUST remain, and MUST remain marked as superseded. A recipient asking what they were told MUST be answerable, including where what they were told was wrong.

A report MUST NOT be superseded twice in a way that leaves which one stands ambiguous.

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

### Requirement: The destination decides what a part may be

A report leaves as a document, and what a document can contain is decided by the format it leaves as — not by what the application finds convenient to produce.

Where a format cannot present something, the application MUST produce a form that format can present rather than something that renders in the application and is absent, broken or unreadable in the document.

A visual MUST NOT be presented in a form the destination cannot draw. A generated picture is a picture; a structured comparison is a table; and which of the two something is MUST be decided by what it is, not by which is easier.

Colour in a document MUST be a separate decision from colour on a screen. A document has no theme to consult, and a colour chosen against a screen's background is not legible against a page.

#### Scenario: A report is exported

- GIVEN a report containing every kind of part
- WHEN it is exported in each offered format
- THEN every part is present and readable in each

#### Scenario: A part cannot be drawn by a format

- GIVEN a part whose usual presentation a format cannot draw
- WHEN the report is exported in that format
- THEN a form that format can draw is produced
- AND the part is not silently omitted

### Requirement: A report says what is missing before it is sent

An analyst MUST be able to see what a report does not yet say: parts left empty, sections a chosen shape expects and the report does not have, and anything the case owes that the report was meant to carry.

This MUST be available before sending, not discovered by a reader.

#### Scenario: A report is checked before sending

- GIVEN a report with empty parts and missing sections
- WHEN the analyst asks what is outstanding
- THEN each is named

#### Scenario: A section was removed and is wanted back

- GIVEN a report whose shape expects a section the analyst removed
- WHEN they restore it
- THEN it returns in the place that shape gives it

### Requirement: The application's own words are in the report's language; the analyst's are the analyst's

Everything the application supplies — headings, labels, the names of things, generated sentences, the vocabulary a field draws from — MUST be in the language the report is produced in. That is the part the application can guarantee, and it MUST be complete: a heading left in another language is the application failing at its own job.

**What an analyst wrote is not the application's to translate or refuse.** A report in one language legitimately quotes a log line, a command, a ransom note or a customer's own words in another, and an application that blocked sending until everything matched would be wrong more often than it was right.

Where written prose is in a different language from the report, the analyst MUST be told which parts before sending, and MUST be able to send anyway. Being told is the requirement; the decision is theirs.

#### Scenario: A report is produced in a second language

- GIVEN a report produced in a language other than the one it was drafted in
- WHEN it is exported
- THEN everything the application supplies is in that language
- AND nothing it supplies is left in the other

#### Scenario: Written prose is in another language

- GIVEN a report whose written parts are in a different language from the report
- WHEN the analyst prepares to send it
- THEN they are told which parts

#### Scenario: The analyst meant it

- GIVEN a report whose written parts are deliberately in another language
- WHEN the analyst sends it having been told
- THEN it is sent

### Requirement: A report is for an audience, and the audience decides what it owes

A report MUST record who it is for. What a report owes — what it must carry, and what it must not — MUST attach to that audience rather than to the layout an analyst picked.

A layout is content an operator edits. An obligation is not: a layout MUST NOT relax what the audience requires, and choosing a different layout MUST NOT change what a report of that audience owes.

#### Scenario: A report is created

- GIVEN an analyst creating a report
- WHEN they choose who it is for
- THEN what that audience requires is stated before they begin

#### Scenario: A layout omits something the audience requires

- GIVEN a report whose layout has no section for something its audience requires
- WHEN the analyst prepares to send it
- THEN the requirement is named as unmet
- AND the layout is not treated as having settled it

### Requirement: A report never carries another customer's data

A report prepared for one customer MUST NOT be exportable while it carries data belonging to another. The export MUST be refused, and the refusal MUST name what was found and which customer it belongs to.

This is the one obligation an analyst cannot decide past. Every other judgement about what belongs in a report is theirs; a case boundary is not, because it is the boundary only the application can see across.

#### Scenario: A report carries a row from another customer

- GIVEN a report for one customer containing a part sourced from another customer's case
- WHEN the analyst exports it
- THEN the export is refused
- AND the refusal names the part and the customer it belongs to

#### Scenario: The offending part is removed

- GIVEN a report whose export was refused for crossing a customer boundary
- WHEN the analyst removes the part
- THEN the export proceeds

### Requirement: Material an audience does not expect is named, and the analyst decides

Where a report carries material its audience does not usually receive — internal working notes, unverified findings, anything the audience does not expect — the analyst MUST be told before sending, and MUST be able to send anyway.

What was named and not resolved MUST be recorded with the send, so that what the recipient was given is answerable afterwards without reopening the case.

#### Scenario: An internal note is in a customer report

- GIVEN a customer report carrying material meant for internal readers
- WHEN the analyst prepares to send it
- THEN they are told which parts, and why the audience does not expect them

#### Scenario: The analyst sends it anyway

- GIVEN an analyst who has been told and judges the material appropriate
- WHEN they send the report
- THEN it is sent
- AND what was unmet is recorded with it
