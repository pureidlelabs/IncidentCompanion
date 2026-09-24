# A page elsewhere spends nothing

## Why

`the-api` says a limit on how often a caller may ask is that caller's own, and that a page on another site sending requests through the analyst's browser does not spend it. The install held that for sign-in alone. Any other route reached the application's own limits with the cross-site request counted against the analyst's address, so a page the analyst had open could get the analyst's own requests refused for a minute. A request that the page sent without an `Origin`, an image or a `no-cors` fetch, was not recognised as another site's at all.

The install audit says an address is the one the install's one way in saw. An application that started before its edge attributed every caller to the edge until its next periodic lookup found it, so for several seconds every analyst shared one limit and one address in the audit. After a host restart, that ordering happens without anyone doing anything unusual.

## What Changes

- Every request another site's page sends through the analyst's browser is refused before any limit counts it, whether it carries that site's origin or only the browser's account of where it came from. A link from another site still opens the install.
- An application recognises its edge from the edge's first request, whichever of the two started first.

## Impact

- `openspec/specs/the-api/spec.md`: a scenario for requests other than sign-in.
- `openspec/specs/install-audit/spec.md`: a scenario for an install whose one way in started last.
- `openspec/specs/deployment/design.md`: the cross-site refusal covers every route; the edge is looked up before an unfamiliar peer is attributed.
- `docker/nginx/default.conf`, `server/src/wire/caller-address.ts` and its two callers.
