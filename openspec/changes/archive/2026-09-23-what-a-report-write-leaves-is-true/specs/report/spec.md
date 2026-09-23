# Report

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

#### Scenario: What a sent report points at is removed

- GIVEN a sent report correcting an earlier draft, with a part drawing a piece of evidence
- WHEN anybody removes that evidence or that draft
- THEN it is refused, naming the sent report and when it was sent
- AND the sent report still points at both
