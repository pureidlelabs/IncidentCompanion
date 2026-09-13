# A feed carries the restriction the analyst chose

## Why

The export vocabulary offered two versions of one sharing scheme under identical spellings. Three of its levels resolved to the older version's markings and two to the newer one's, and nothing on either end said which was which.

The two versions define one of those levels differently. The older AMBER admits the recipient's organisation *and its clients*; the newer is the organisation alone, which is exactly what the newer scheme added a stricter level to distinguish. So an analyst marking a feed AMBER shipped the wider permission, and a conforming receiver acted on it -- a disclosure the analyst did not make, invisible because both ends say the same word.

The report side of the product already chose the newer version and recorded why. The export vocabulary is the one that did not follow.

## What Changes

- A feed is marked under the version the application offers, so a level means to its receiver what it meant to the analyst.
- The one level belonging to the older version says so where it is chosen. It is the level the newer scheme replaced and has no successor, so it stays as the way to mark a feed for a receiver that speaks the older version.

## Impact

- `openspec/specs/data-exchange/spec.md` -- one requirement gains a paragraph and two scenarios.
- `server/src/domain/tlp.lists.ts` -- three levels take their newer markings.
- `ui/src/screens/indicators.tsx` -- the picker names the odd one out.
- A feed marked with one of those three now carries a different identifier than before, which is the point: the previous one granted a wider audience.
