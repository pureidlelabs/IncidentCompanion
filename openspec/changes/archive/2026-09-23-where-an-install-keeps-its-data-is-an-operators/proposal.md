# Where an install keeps its data is an operator's to read

## Why

*What the install is made of is management-plane* names the install's storage among the facts an administrator alone may reach. One route served it to every analyst: signed in as an analyst, `GET /api/settings` answered 200 with where the database and the cache point, the evidence directory, and how many artefacts the install holds across every customer, including customers the analyst reaches no case of.

The route beside it that reports host resources is an administrator's, and so is the one that reports table sizes. The analyst scenarios named only table sizes and host resources, so the route that carried the storage passed every scenario while breaking the requirement above them.

## What Changes

- The analyst scenario names where the install keeps its data and how many artefacts it holds, beside its table sizes and row counts.
- The requirement's list of what is management-plane says how much the storage holds, not only where it is.
- An analyst asking for the install's settings is refused, and an administrator is answered.

## Impact

No screen an analyst is offered reads the install's settings, so an analyst sees no change. An operator sees none either.
