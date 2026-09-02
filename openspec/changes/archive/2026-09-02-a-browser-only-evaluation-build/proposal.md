# The application can be evaluated without being installed

## Why

An analyst deciding whether this is the tool for their incident has one route to finding out: install it. The install is deliberately a single command, and it is still a decision — a machine, a container runtime, a store, and a first case invented before anything is visible. The people best placed to judge the product are the ones least likely to spend that before they know whether the timeline reads the way they think.

Nothing in the specifications says the application must be judgeable before it is run. That is the gap: `It comes up with one command and no preparation` is about an install a person has already committed to, and every requirement beside it assumes an operator, a store and a door. None of them describes what somebody sees who has committed to nothing.

The risk of closing it badly is a demonstration that lies. A build that answers every request with something plausible shows a product that does not exist, and the analyst discovers the difference after installing — which is worse than never having offered a demonstration at all.

## What Changes

- A new `evaluation` capability: the application can be published in a form that is judged without installing it, and that form is honest about what it cannot do.
- **No hosting, transport or storage mechanism is named.** Where an evaluation build is published, what it is built by and where a visitor's work is kept are the design record's and the repository's.
- **No requirement says the evaluation build is complete.** It says the opposite: what it cannot honestly do it refuses, and a refusal is a met requirement rather than a gap in one.
- **Nothing existing is altered.** `deployment` continues to describe an install with an operator, a store and one door; an evaluation build has none of the three and answers to none of those requirements.

## Capabilities

### Modified Capabilities

None.

### New Capabilities

- `evaluation`: what the application owes somebody judging it who has installed nothing.
