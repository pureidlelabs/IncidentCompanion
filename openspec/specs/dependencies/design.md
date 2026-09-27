# Scope

**Discovery, the observation period, vulnerability handling and the standing record are delegated to a dependency bot rather than built.** Each is a moving target -- which registry to ask, how a vulnerability is looked up, which packages share a release -- and a local implementation of any of it is a second thing to maintain that drifts from the ecosystem it models.

**A version crossing a compatibility boundary waits for a person.** It is a migration rather than a build task, so it rests in the record until somebody takes it.

**The observation period's length is policy, not a requirement.** The specification requires that a period exists, is recorded and is applied; its length is tuned by evidence and stated where the policy is.

# Design

## A hold names its constraint, not its outcome

The record says what holds a dependency and what would release it. A hold naming only its outcome cannot be checked, and it outlives its reason.

## Every component is named by its content

An external image carries a digest beside its tag and a lockfile fixes every package, so a rebuild resolves what the previous one used. A tag is republished under its own name, which makes it both irreproducible and repointable by anyone who can write to the registry.

## The observation floor covers every ecosystem

Images, workflow actions and packages wait out the same period, because a compromised release of any of them reaches the install the same way. An update whose age cannot be established -- a lockfile refresh, a pin, a digest naming something already released -- is not held by it, since checking anyway holds it for ever.
