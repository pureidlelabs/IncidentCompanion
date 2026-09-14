# Report

## MODIFIED Requirements

### Requirement: The application's own words are in the report's language; the analyst's are the analyst's

Everything the application supplies — headings, labels, the names of things, generated sentences, the vocabulary a field draws from — MUST be in the language the report is produced in. That is the part the application can guarantee, and it MUST be complete: a heading left in another language is the application failing at its own job.

This holds wherever the application says those words, not only in the file it produces. A screen that names a section differently from the document it is composing describes a report nobody will receive, and the analyst has no way to tell which of the two is wrong.

**What an analyst wrote is not the application's to translate or refuse.** A report in one language legitimately quotes a log line, a command, a ransom note or a customer's own words in another, and an application that blocked sending until everything matched would be wrong more often than it was right.

Where written prose is in a different language from the report, the analyst MUST be told which parts before sending, and MUST be able to send anyway. Being told is the requirement; the decision is theirs.

#### Scenario: A report is produced in a second language

- GIVEN a report produced in a language other than the one it was drafted in
- WHEN it is exported
- THEN everything the application supplies is in that language
- AND nothing it supplies is left in the other

#### Scenario: A report is composed in a second language

- GIVEN a report produced in a language other than the install's own
- WHEN the analyst composes it
- THEN the headings the screen draws are in the report's language
- AND they are the words the exported document will carry

#### Scenario: The language a report is produced in is changed

- GIVEN a report open on the composing screen
- WHEN the analyst changes the language it is produced in
- THEN the headings the screen draws follow it

#### Scenario: Written prose is in another language

- GIVEN a report whose written parts are in a different language from the report
- WHEN the analyst prepares to send it
- THEN they are told which parts

#### Scenario: The analyst meant it

- GIVEN a report whose written parts are deliberately in another language
- WHEN the analyst sends it having been told
- THEN it is sent
