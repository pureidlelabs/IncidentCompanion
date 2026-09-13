# A feed carries the restriction the analyst chose

## Why

The export vocabulary offered two versions of one sharing scheme under identical spellings. Three of its levels resolved to the older version's markings and two to the newer one's, and nothing on either end said which was which.

The two versions define some of those levels differently, and RED is where it costs most. The older RED admits everyone in "the specific exchange, meeting, or conversation"; the newer is "the eyes and ears of individual recipients only". So an analyst choosing the strictest level the product offers shipped the marking that hands it to a room, and a conforming receiver acted on it -- a disclosure the analyst did not make, invisible because both ends say RED. GREEN narrowed too, from a sector to a community. AMBER means the same under both.

The report side of the product already chose the newer version and recorded why. The export vocabulary is the one that did not follow.

## What Changes

- A feed is marked under the version the application offers, so a level means to its receiver what it meant to the analyst.
- The vocabulary offers one version. The level only the older one has is the one the newer renamed, so offering both is offering a synonym under two identifiers that a receiver resolves differently.

## Impact

- `openspec/specs/data-exchange/spec.md` -- one requirement gains a paragraph and two scenarios.
- `server/src/domain/tlp.lists.ts` -- three levels take their newer markings.
- A feed marked with any level now carries a different identifier, and every one of them travels with its own marking object where four used to travel bare.
- The level the older version called WHITE is no longer offered. Its successor is CLEAR, which the vocabulary already had.
