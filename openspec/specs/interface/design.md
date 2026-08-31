# Scope

**Nothing above the controls layer builds a control.** A control assembled where it is needed is one nobody documented and nobody finds again, so the next person builds a second and the two diverge without either being wrong.

**A screen does not fetch and does not place itself.** Geometry belongs to whatever arranges screens.

**A screen introduces no colour, spacing, type or motion value of its own.** The vocabulary is one named set.

**Layering is caught, not encouraged.** A layer reaching upward is a failure something reports, because layering held by convention lasts until somebody is in a hurry.

# Design

## Layers, each knowing only what is beneath

The interface is built in layers and a layer knows nothing about one above it. The direction is the whole of the rule: a lower layer that knows its caller can serve only that caller.

## The controls layer exists for accessibility

Every control an analyst touches comes from one layer, and that layer is built on a foundation supplying keyboard behaviour, focus management and the semantics assistive technology reads.

That is why the layer exists rather than a property it happens to have. Hand-rolling a control means hand-rolling those, and they are the part whose absence nobody notices until it is the only part that matters.

## A screen renders what it is given

A screen draws from what it receives. Fetching belongs to whatever wraps it; position belongs to whatever arranges it.

A screen that positions itself can be placed one way, and the second place somebody wants it is where that is discovered.

## Every part is exercisable alone, in its real states

Every control and every composition can be seen in isolation, in each state it can actually be in.

For anything presenting data that includes the states nobody reaches by using the application normally, which are therefore the ones nobody has looked at: empty, loading, failed, far more data than fits, and values at their extremes.

## One vocabulary, and every name in it resolves

Colour, spacing, type and motion come from one named set. A name referred to and never defined renders as nothing, which is indistinguishable from a deliberate choice — so an unresolved name is a failure rather than an absence.

## A shared answer is derived once

Where two parts of the interface need the same answer about a value, it is derived in one place, and that place does not know who is asking.

Two screens computing it separately will disagree, and the argument will be about which is right rather than which is stale.
