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

## A rule between two fields is published as an example, and the example is posted

A schema states what one field may hold. A rule holding *between* two fields -- a password and its repeat -- has no spelling in a schema at all, so a caller building a body from the published shape alone assembles one the route refuses, by a rule the description does not carry.

**The route publishes an example whose fields satisfy the rule.** That is what a caller reads and what a generated client offers as a starting body.

**An example is authored beside the schema, so it is held to what is served by being posted.** A description derived from the routes cannot derive this one, because the rule it states is not in the schema to derive from -- and an example nothing sends is prose that ages exactly as any second description of the wire does. So the sweep that posts a generated instance at every documented body posts the example too, and only where the generated one was refused: the example is the answer to a refusal, never a way for a route to opt out of being generated at all.

## What a route owes regardless of its shape

**Reach is enforced in the store**, not at the entry point. A route is not the boundary; it is a caller of one.

**A single request has a bound on what it may cost.** A question whose cost is decided by the data it happens to touch is a question that can be made expensive from outside.

**A cross-case answer reveals nothing about customers the asker does not reach** — not by count, not by timing, not by the shape of the answer. An empty result and a withheld result are indistinguishable to the asker.

**A read carries the version it was read at**, so a caller can write against it and be refused where it moved.

**A refusal discriminates.** Not permitted, not found, and not decidable are different answers, and a route that collapses them either leaks or misleads.

**A refusal carries its status, never a success carrying bad news.** A write that did not happen answers a refusing status with the sentence in its body, rather than a 200 or a 201 saying it did not work. Anything reading the status rather than the body -- a proxy, a log, a client somebody writes later -- is right to believe it, and a surface that unwraps both shapes lets the two drift because each works.

**The shape a refusal carries is described once, and every route answers with that description.** A body assembled at the door is a second description of the wire, and the tier that reads it cannot tell which door it came from -- so a door that disagrees is found by an analyst rather than by a check.
