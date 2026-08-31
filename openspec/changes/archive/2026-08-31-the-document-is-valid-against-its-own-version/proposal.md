# The document is valid against the version it declares

## Why

`The interface describes itself, and the description is generated` requires a caller to be able to learn the interface from the interface, derived from what is served. It says nothing about the description being **usable**, and those are not the same claim: a document can describe every route accurately and still be refused by every generator, because it declares one specification and carries the keywords of another.

That is what the application was doing, and it was doing it in two dialects at once. The document declared OpenAPI 3.0. Half its schemas were asked for 3.0 explicitly and emitted `nullable: true`; the other half came through a generator that emitted JSON Schema 2020-12, the dialect 3.1 adopts and 3.0 predates. A third-party decorator wrote a third hand. Nothing noticed while no emitted keyword was one 3.0 forbids outright. A nullable column then arrived as `type: "null"`, which 3.0 has no spelling for, and the description became invalid in forty-nine places at once -- from a dependency resolution, with no route added and no shape changed.

A caller cannot build against a description a generator refuses. `The interface describes itself, and the description is generated` is met and the promise behind it is not, which is the gap.

## What Changes

- The `the-api` capability gains a requirement that the description is valid against the specification version it declares, and that the declared version is the one its schemas are actually written in.
- **No version is named.** Which specification the document declares follows from the dialect the schemas are generated in, and naming 3.1 in a requirement would fix an implementation detail that moves when the generator does. The requirement is that the two agree.
- **No mechanism is specified.** That the check runs in the suite, which linter performs it and which rules are selected are the design record's and the repository's. Nor does a requirement say how a document assembled from several generators is made to agree with itself; that a normaliser exists is implementation.

## Capabilities

### Modified Capabilities

- `the-api`: one requirement added, beside `The interface describes itself, and the description is generated`. Nothing existing is altered -- the new requirement constrains the description's form where the existing one constrains its content and its provenance.

### New Capabilities

None.
