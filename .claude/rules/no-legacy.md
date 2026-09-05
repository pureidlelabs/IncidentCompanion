# Rules: nothing here is legacy yet

*Read before preserving anything. `rules/claim-homes.md` owns where a claim goes; this owns whether the thing you are about to keep has any claim on you at all.*

**Before the first release, existing implementation has no preservation value by default. If the cleaner design breaks it, break it.**

Check rather than assume, because this rule ends the day the first release exists:

```bash
gh release list --repo pureidlelabs/IncidentCompanion
git tag
```

Both empty is the state this rule describes. Either one answering is the state where it stops applying and the ordinary care about a published contract begins.

## What has no claim

A URL, a slug, a route, a field name, a wire shape, a component, a prop, a table column, a stored preference, a chord, a persisted flag. Anything the code does today. None of it is evidence about what the code should do tomorrow.

**Back-compatibility is a promise to somebody running the old thing, and nobody is running it.** Preserving it invents a constraint nobody asked for, widens the diff past the change being made, and leaves a second path through the code that outlives the reason it was added. A redirect written today is read next year as a requirement.

**The worse cost is to the design.** Preserving the current shape quietly converts *what exists* into *what is required*, which is how a design ends up decided by its own first draft. → `rules/claim-homes.md`, which refuses reportage about the present tree for the same reason.

## What this forbids

- **A redirect, an alias, a deprecation window, a compatibility shim or a fallback**, added so an old address or an old call keeps working. Delete the old one and rewire every caller; a grep for the old name is what proves it done.
- **Offering preservation as an option.** It is not one, so it does not go in a list of approaches for somebody to weigh.
- **Arguing for a shape on the grounds that it is what the code does now.** That is a description, not a reason.
- **Reading a stale comment or a parked allowlist entry as a constraint.** Both describe a draft. A comment saying the parent has no screen of its own, written when that was true, is not a decision that it must stay true.

## What still travels

**Data an analyst has typed.** A case in a database is not a URL, and a schema change that cannot read what is already written is a different question with a different answer.

**A specification.** `openspec/` says what the application must do, and a requirement is amended deliberately rather than broken in passing. → `rules/claim-homes.md`. This rule frees the implementation, never the intent.

**Nothing enforces this**, and no glob can express it. Follow it because a promise nobody is owed is a cost with no payer.
