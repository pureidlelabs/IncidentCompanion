# evaluation

## ADDED Requirements

### Requirement: The application can be judged without being installed

The application SHALL be publishable in a form that a person can use to judge it without installing it, without an account, and without providing any data of their own.

That form SHALL open on a case with enough in it to judge the product, rather than on an empty one the visitor must fill before anything is visible.

#### Scenario: An analyst opens the published form

- GIVEN a person who has installed nothing and holds no account
- WHEN they open the published evaluation build
- THEN they reach a case with its content in it
- AND they are asked for no credential, no data and no installation first

#### Scenario: The evaluation build is judged on the product, not on a description of it

- GIVEN the published evaluation build
- WHEN the analyst reads a screen the application also serves to an install
- THEN it is the screen the install serves, rather than a picture or a description of it

### Requirement: What it cannot honestly do, it refuses

The evaluation build SHALL refuse anything it cannot perform as an install would, and the refusal SHALL be visible to the analyst as a refusal.

It SHALL NOT answer such a request with an empty or fabricated result. A capability that cannot be honestly demonstrated is absent and says so.

A capability added to the application after an evaluation build is published SHALL be refused by that build until it is deliberately included.

#### Scenario: The analyst reaches something only an install can do

- GIVEN the evaluation build
- WHEN the analyst asks for something that an install performs outside the browser
- THEN the request is refused
- AND the analyst is told it is unavailable in this form, rather than shown an empty result

#### Scenario: A capability is added to the application

- GIVEN a published evaluation build
- WHEN the application gains a capability the build was not built with
- THEN the build refuses it
- AND the absence is detectable before the build is published rather than by a visitor meeting it

### Requirement: A draft is judged as an install would judge it

A write made in the evaluation build SHALL be accepted exactly when an install would accept it, and refused exactly when an install would refuse it, for the same reasons and naming the same fields.

#### Scenario: The analyst types something an install would refuse

- GIVEN the evaluation build
- WHEN the analyst submits a draft that an install would refuse
- THEN it is refused
- AND the fields named are the fields an install would name

#### Scenario: The rules an install enforces change

- GIVEN a change to what an install accepts
- WHEN an evaluation build is published after it
- THEN the evaluation build accepts and refuses by the changed rules

### Requirement: The visitor's work is their own, and they can discard it

Work done in the evaluation build SHALL be visible only to the person who did it, and SHALL NOT reach another visitor.

The visitor SHALL be able to return to the case as first published, discarding what they have done.

The evaluation build SHALL carry no analyst's data and nothing an install would hold in confidence.

#### Scenario: Two people open the same published build

- GIVEN two visitors opening the same published evaluation build
- WHEN one of them writes to the case
- THEN the other does not see it

#### Scenario: The visitor wants a clean case

- GIVEN a visitor who has written to the case
- WHEN they ask to start again
- THEN the case is as first published
- AND what they had written is gone
