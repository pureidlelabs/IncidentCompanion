# Scope

**One grant, in one place.** What the system itself gives over the default customer is a single rule, and its level depends on the asking account's role. It is not a second exception and it is not a check anywhere else.

**The floor reaches the default customer and nothing else.** A role grants no level over any customer somebody has been onboarded as.

**A floor, not a ceiling.** A group may raise an account above it; no membership lowers an account below it.

# Design

## Why the level belongs to the resolution rather than to the guard

Reach is resolved in one place and enforced wherever it is needed. A guard that decided a level for itself would be a second answer to a question the resolution already answers, and the two would disagree the moment either moved — the case guard granting a level while the resolution reported another, with the socket and any access review reading the second.

So the role is consulted where the level is worked out. Every reader of reach then agrees without being told about roles, including readers that do not exist yet: the review surface that answers *what does this account reach, and why* reports the administrator's level over the default because it asks the same question the guard does.

## Why a role and not a group

The alternative is to grant an administrator `delete` over the default through an ordinary group at install time. That keeps the access model uniform and produces an auditable grant, and it was rejected because the grant would be indistinguishable from one somebody made deliberately: a reviewer reading the membership cannot tell the install's own arrangement from a decision, and revoking it would silently remove a guarantee the specification says is not revocable.

Stating it as the floor keeps the guarantee where the other guarantee about the default customer already is, and leaves the group model meaning only what somebody chose.

## What the floor does not decide

Which cases the default customer stands for is the cases specification's, not this one's. The floor says what an account holds over that customer; how many cases that reaches follows from what a case is created against, and nothing here changes it.
