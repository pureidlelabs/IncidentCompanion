# The reference

## Purpose

What the application can tell somebody about itself. Not what it did or what a case holds, but what a case *may* hold: the collections that exist, what a row of each is made of, what a field accepts, what a report can be built from, and which of it this install carries because somebody added it.

The specifications state the rules. This states what the application knows about its own contents — the part no specification should hold, because it is derived and would be stale the moment it was written down.

**There are two doors, and what they answer is different.** One is open to anybody and describes the product: what a case can hold in any install of this version. The other requires a session and describes *this* install, including whatever its operator added.

The description of the interface's own routes is the API's own business; this covers what the application is made of rather than how it is reached.

## Requirements

### Requirement: It is generated, and cannot disagree with what it describes

The reference MUST be derived from the same description that checks a write, draws a screen and reads an import. It MUST NOT be authored, and there MUST be no step at which somebody transcribes anything into it.

A reference that can drift MUST NOT exist. The value of this over prose is precisely that it cannot be wrong while the thing it describes is right, and a single hand-maintained corner destroys that for the whole.

Where something cannot be derived, it MUST be absent rather than approximated.

#### Scenario: A field is added

- GIVEN a collection whose description gains a field
- WHEN the reference is read
- THEN the field is described
- AND nobody wrote it down

#### Scenario: A vocabulary changes

- GIVEN a field drawing from a vocabulary
- WHEN the vocabulary's values change
- THEN the reference shows the new values

#### Scenario: Something is not derivable

- GIVEN a fact about the application that cannot be derived
- WHEN the reference is produced
- THEN it is absent
- AND is not written in by hand to make the reference look complete

### Requirement: It answers the question an analyst has while working

The reference MUST answer *what can I put here, and what does the system mean by it* — asked mid-investigation, by somebody who will not read source and cannot wait.

It MUST therefore be reachable from the application, in the language the application is being used in, and MUST present a field's meaning rather than only its name and kind.

A field's meaning MUST come from where the field is described, so that explaining a field and defining it are the same act.

#### Scenario: An analyst does not know what a field wants

- GIVEN an analyst filling in a field
- WHEN they ask what it accepts
- THEN they are told, without leaving the application

#### Scenario: The application is used in another language

- GIVEN an install used in a language other than the one it was built in
- WHEN the reference is read
- THEN what the application supplies is in that language

### Requirement: It says what it does not cover

The reference MUST state its own boundaries. Something absent from it MUST NOT be readable as something the application does not have.

Where a part of the application is not described here — because it is not derivable, or belongs to another description — the reference MUST say so and say where to look.

#### Scenario: Somebody asks whether the application does something

- GIVEN a capability not described in the reference
- WHEN somebody looks for it and does not find it
- THEN the reference tells them what it covers and what it does not
- AND they are not left to conclude the capability is absent

### Requirement: The open door describes the product and nothing else

A reference to what the product is MUST be readable without a session, without an account, and without anything having been configured.

It MUST carry only what is true of every install of a version: the collections, what a row of each is made of, what each field accepts, the vocabularies the product ships, the kinds of thing a report can be built from, and the layouts and templates that shipped.

It MUST carry nothing an install acquired: no vocabulary somebody extended, no template somebody added, no setting somebody chose, no count of anything, and nothing naming a customer. **What is answerable here MUST be answerable from the software alone**, so that two installs of one version answer identically and neither reveals it exists by answering differently.

That is why it can be open. It discloses what reading the source would disclose, to somebody who could read the source.

#### Scenario: Somebody with no account asks what the product holds

- GIVEN a caller with no session
- WHEN they ask what a case can hold
- THEN they are told

#### Scenario: Two installs of one version are asked

- GIVEN two installs of the same version, one heavily configured
- WHEN each is asked through the open door
- THEN both answer identically

#### Scenario: An install has been extended

- GIVEN an install carrying vocabularies and templates its operator added
- WHEN it is asked through the open door
- THEN none of them appears
- AND the answer does not indicate that anything was added

### Requirement: The door behind a session describes this install

A reference to what *this* install holds MUST require a session, and MUST describe everything the open door does plus what the install acquired: the operator's own vocabularies, templates, layouts and anything else dropped in.

What was added MUST be distinguishable from what shipped, because the two are supported differently and change for different reasons.

Reading it MUST be a permission an analyst holds, granted when their account is created and revocable afterwards. Granted by default, because an analyst who cannot ask what a field accepts must ask a colleague what the software means; a grant rather than a property of holding a session, because access nobody granted is access this application does not have.

#### Scenario: An analyst reads what their install holds

- GIVEN an analyst with a session
- WHEN they read the install's reference
- THEN they see what shipped and what their operator added
- AND which is which

#### Scenario: The permission is withdrawn

- GIVEN an analyst whose permission to read the reference is revoked
- WHEN they request the install's reference
- THEN they are refused
- AND the open door still answers them

#### Scenario: An account is created

- GIVEN an administrator creating an account
- WHEN it is created
- THEN its holder can read the install's reference
- AND that is recorded as a grant like any other

### Requirement: Configuration naming a customer is scoped to that customer

The reference MUST carry no case content: no value an analyst entered, no count of what exists, no evidence, no name of a customer an analyst does not reach. What a field *accepts* is structure; what somebody *put* in it is a case.

**Configuration is not exempt from that.** Where an operator adds a template, layout, vocabulary value or anything else particular to one customer, it MUST carry that customer, and MUST reach only analysts who reach that customer. Configuration is a place a customer's name will end up, and a registry everybody can read is a way to learn who the customers are.

Configuration that is not scoped to a customer MUST NOT carry anything identifying one. Where somebody attempts to add a customer's name, an address they operate, or anything else identifying them, to configuration that everybody reads, it MUST be refused rather than warned about.

Telling operators not to do it is not a control. The one who does it will not have read the sentence, and the disclosure it causes is silent and permanent.

#### Scenario: Configuration is added for one customer

- GIVEN an operator adding a template for a particular customer
- WHEN they add it
- THEN it carries that customer
- AND reaches only analysts who reach that customer

#### Scenario: An analyst reads the reference

- GIVEN an analyst who reaches some customers and not others
- WHEN they read the reference
- THEN configuration scoped to customers they reach is present
- AND configuration scoped to customers they do not reach is absent, and its absence is not apparent

#### Scenario: A customer is named in shared configuration

- GIVEN an operator adding a value identifying a customer to configuration everybody reads
- WHEN they add it
- THEN it is refused
- AND they are told to scope it to that customer instead

#### Scenario: The reference is read by two analysts

- GIVEN two analysts reaching different customers
- WHEN each reads the reference
- THEN what the application itself provides is identical for both
- AND neither can tell what the other's differs by
