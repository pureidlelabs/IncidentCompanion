# Scope

What a case is opened with, where the import opens it. The analyst's own corrections afterwards are the ordinary write path and are not this change's business.

**One provider.** The ladder mapped here is Sentinel's, in the provider's own directory. A second provider brings a second table beside it rather than a lookup keyed by provider name; nothing here is shaped for a registry, because there is one entry.

**Severity only.** The reference and the first activity already cross as the incident's own, and this change does not revisit which of the case's fields a provider may seed.

# Design

## The vocabulary boundary has one side, and it is the server's

A provider spells its ladder in its own words and this product's vocabulary is lower-case. Somebody has to translate, and the choice is which tier.

The browser cannot. It holds the provider's token and nothing else -- that is the whole of why any of this work happens there -- and a level composed in the client is a translation table in the tier that was emptied of them. It also fails in the worst available way: the create body validates the level against the case form, so a spelling the vocabulary does not carry is refused as the whole request rather than as one field, and an import that would otherwise have succeeded does not happen at all.

So the provider's word crosses the boundary as the provider sent it, beside the title that already does, and the mapper turns it into a level on the far side. That keeps the refusal where it can be absorbed: an unmapped word costs the case its marking and nothing else.

## The level is derived, not accepted

The create door offered a `severity` and no caller filled it. A field a caller may set *and* the server may derive has two answers and the caller's wins, which is the arrangement that hid this: the door looked like it carried the severity, the write path was tested through that door with a level no provider spells, and the case an analyst actually opened was unmarked.

Deriving it from the payload already in the request removes the second answer. The door refuses a caller that names one, so there is no spelling of the request in which the derived level loses.

## The worst, not the first

A case can be opened from several incidents, and the sibling seeds -- the reference, the first activity -- take the first incident's. Severity does not follow them.

Under-marking and over-marking are not symmetric. An analyst reading a case marked worse than it is opens it and corrects it; one marked milder than it is does not open it, so the correction never happens. The ladder that decides this is the vocabulary's own ordering rather than a second list, which is what keeps the two from drifting apart.

## What an unmapped word becomes belongs to the caller, not the table

The table answers nothing for a word it does not carry, and each caller decides what nothing means. A timeline entry owes its column a level, so the alert mapper supplies a cautious default. A case may honestly be unmarked, so the seed leaves it unmarked rather than inventing a level the provider never reported.

Folding that decision into the table would force one answer on both, and the cautious default is wrong for a case: `informational` asserts a judgement, where an empty field asks for one.
