# Scope

**There is no query language, and a caller composes no query.** The interface is routes. A caller names which fields it wants of a route's answer; it does not describe a shape for the application to satisfy.

**The set of cross-case questions is a list, not an open surface.** Each is a route somebody designs, with an answer shape somebody chose. A question nobody anticipated is a route nobody has written yet rather than something a caller may assemble.

**One description of the data, shared directly.** The client takes the server's schemas as types with no generator between them, so a schema change is a compile error rather than a drift. Nothing may introduce a second description of the same data.

**No entry point for a caller outside this product.** An integration surface is deferred by the constitution, and the shape here answers to this product's own screens.

# Design

## Routes that can be asked for less

Every route has an answer shape its author decided. A caller may ask for fewer of its fields, and may ask for explicit inclusions it would not receive by default.

That is what keeps a screen from reading a whole case to draw a summary of it, without putting a second description of the data anywhere.

## A cross-case question is a route of its own

Asking something of the whole corpus — whether an indicator has been seen before, which cases touched a system, what a customer's history is, what is near a regulatory deadline — is a route per question.

Each is designed rather than composed: cacheable, boundable, and enforced where every other read is enforced. A traversal question is still one question with one answer shape.

## What a route owes regardless of its shape

**Reach is enforced in the store**, not at the entry point. A route is not the boundary; it is a caller of one.

**A single request has a bound on what it may cost.** A question whose cost is decided by the data it happens to touch is a question that can be made expensive from outside.

**A cross-case answer reveals nothing about customers the asker does not reach** — not by count, not by timing, not by the shape of the answer. An empty result and a withheld result are indistinguishable to the asker.

**A read carries the version it was read at**, so a caller can write against it and be refused where it moved.

**A refusal discriminates.** Not permitted, not found, and not decidable are different answers, and a route that collapses them either leaks or misleads.
