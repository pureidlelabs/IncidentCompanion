# An install says what it does not encrypt

## Why

The state capability already says confidentiality at rest is the operator's, that the application must not encrypt durable state itself, and that what it owes in exchange is saying so: an operator who has not encrypted the storage beneath must be able to learn it from the application rather than from an auditor.

Nothing says it. Every mention of encryption in the tree is about a case archive, which is a file an analyst exports and which does have optional passphrase encryption — not the state the install keeps:

```
$ grep -rniE "unencrypted|not encrypt|at rest" server/src ui/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.\|\.stories\.'
server/src/archive/envelope.ts:54           a case archive's passphrase
server/src/case-archive/import.service.ts   "This archive is not encrypted, so it needs no passphrase."
ui/src/screens/case-archive.tsx             the export dialog
ui/src/components/blocks/archive-passphrase-fields.tsx
```

The install reference describes where the database, the cache and the evidence live, and carries a note about the zip wrapping — which is a good statement about scanning and says nothing about encryption.

**The requirement is also unmeasurable as written.** That paragraph sits after the last scenario of its requirement and has none of its own, so there is nothing to demonstrate and no ledger row to be undemonstrated. A MUST nothing can show is how this went unnoticed.

## What Changes

- The install reference states that durable state — the database, the cache and the evidence store — is written unencrypted by the application, and that confidentiality at rest is whatever the storage underneath provides.
- The requirement gains the scenario it was missing, so the obligation is demonstrable rather than only stated.

## Impact

- `openspec/specs/state/spec.md` — one scenario added to an existing requirement.
- `server/src/health/install.controller.ts` — a second note beside the evidence one, on the same route.
- An operator reading the install reference learns what the application does not do to its own storage, and whose job the rest is. Nothing about what is stored changes.
