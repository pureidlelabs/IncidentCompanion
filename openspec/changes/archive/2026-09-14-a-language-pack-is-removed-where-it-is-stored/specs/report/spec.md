# Report

## ADDED Requirements

### Requirement: Which languages an install can write reports in is the administrator's to change

An installation MUST be able to add a language it can produce reports in, and remove one, without being rebuilt. A set of languages fixed at build time makes an organisation's own language a release it has to wait for.

A language that ships with the application MUST NOT be removable. Removal that the next start undoes is a control that lies about what it did.

**Adding and removing are install-wide and take effect for everybody.** Removing a language MUST be confirmed before it happens, and the confirmation MUST name the language and say what stops being possible — there is no undo, and no export to put one back from.

A document already exported in a language MUST be unaffected by that language later being removed. What an analyst has already sent is not the application's to change.

A file offered as a language that the application cannot read as one MUST be refused in terms of the file the analyst chose, before the installation is asked to store anything. A refusal naming fields of a request body describes something the analyst never typed.

A language MAY be offered incomplete, and where it is, how much of the application's words it carries MUST be stated where the languages an installation holds are managed. A language that carries some of the words produces a document mixing two, and an administrator deciding whether to keep it is owed the number rather than a name that looks like every other.

Where a language carries words the application has no place for, it MUST still be taken, and how many were not stored MUST be said. Words translated against another version of the application are the ordinary case, and refusing the whole for them would leave the install with no way to take a language at all.

#### Scenario: A language is added

- GIVEN an installation offering some set of languages
- WHEN an administrator adds a language
- THEN a report can be produced in it
- AND no restart is needed for that to be true

#### Scenario: A language that ships with the application

- GIVEN a language that ships with the application
- WHEN an administrator looks at what can be removed
- THEN that language is not offered for removal

#### Scenario: A language is removed

- GIVEN an administrator removing a language an installation had added
- WHEN they ask for it to be removed
- THEN they are asked to confirm
- AND the confirmation names the language
- AND the confirmation says what stops being possible

#### Scenario: A document exported before the language was removed

- GIVEN a document exported in a language
- WHEN that language is later removed
- THEN the exported document is unchanged

#### Scenario: A report produced after its language was removed

- GIVEN a report recorded as being produced in a language
- WHEN that language has been removed and the report is exported
- THEN the application supplies its words in the language every other falls back to

#### Scenario: A file that is not a language

- GIVEN an administrator choosing a file that the application cannot read as a language
- WHEN they offer it
- THEN it is refused in terms of the file
- AND the installation is not asked to store anything

#### Scenario: A language carrying words the application has no place for

- GIVEN a language carrying words the application has no place for
- WHEN it is added
- THEN it is added
- AND how many words were not stored is said

#### Scenario: An incomplete language is managed

- GIVEN a language carrying some of the application's words
- WHEN an administrator looks at the languages the installation holds
- THEN how much of the application's words it carries is stated
