# Tasks

## 1. The bar, made mechanical

- [x] 1.1 Refuse a sibling documentation file beside a part
- [x] 1.2 Refuse a story that declares arguments its render ignores
- [x] 1.3 Require a block above every story, not only above the metadata
- [x] 1.4 Point the prose linter at every tier, red where the work has not reached
- [ ] 1.5 Drive the accessibility check from reporting to failing, once the kit is clean. **Measured, and the kit is not clean: at `'error'` the run is 431 failed of 3516.** The number in `preview.tsx` was 26 of 146 and described a much smaller gallery, so it read as nearly done. This is the one task that keeps the change in flight

## 2. Controls

- [x] 2.1 Stateful primitives: badge, button, link, kbd, spinner, skeleton, avatar, separator, mark, icon tile, icon stack
- [x] 2.2 Form controls: text field, checkbox, switch, input, radio group, text area, search field, password field, select, combo box, number field, slider, tags input, token field, date field, time field, date-time input, form, field
- [x] 2.3 Overlays: dialog, alert dialog, popover, tooltip, hover card, sheet, menu, context menu
- [x] 2.4 Data surfaces: table, table pager, list box, grid list, tree, meter, progress bar, timeline, sortable, graph canvas
- [x] 2.5 The remainder: alert, toast, problem, empty, absent, async boundary, tabs, disclosure, breadcrumbs, stepper, toolbar, card, item, tag group, toggle button, scroll area, sidebar, copy button, code block, drop zone, selection slot, router
- [x] 2.6 The tier is clear: every `components/ui` entry the rule walks carries its own documentation and drives its args

## 3. Compositions

- [x] 3.1 Every composition, by family
- [x] 3.2 Decide, for each composition, whether it is one: a part built out of several others and drawn by a single screen is that screen's body. **Made mechanical rather than decided file by file**: `shares no part between two screens` counts the callers of every part a screen reaches, so a part with one caller is that screen's body and the rule says so as soon as somebody adds a second. `timeline-entry-row` moved to `screens/` under it

## 3a. Bring the finished work up to the standard

**The standard was settled part way through the tier, so the parts done before it are documented to a weaker one.** Three of the first fifteen compositions carry a volume demonstration and two carry the longest text a reader would enter, where the specification asks both of everything that presents data.

- [x] 3a.1 Every composition already worked: the states the specification names, including the two that were missed. **Volume is a judgement per part, not a rule**: forty-one compositions draw a list and most are bounded by their domain, where a volume story would be fiction. Four were not, and carry one. Separately, every composition whose story blocks nothing held now holds them -- twenty-three files, which the count of `expect`, `findBy` and `throw` per file found
- [x] 3a.2 Every composition already worked: re-run the mutations under a harness that refuses a red baseline. **Swept the whole tree rather than the compositions**, with four edits that change behaviour wherever they land -- cap the first list, take the first accessible name away, stop refusing the first control, invert the first conditional. Of 223 story files, 125 had something to mutate and 48 of those noticed nothing. **The list is a nomination, and most of it is the heuristic rather than a hole**: the first `.map(` in a file is as often a facet's options, an id set, an optimistic payload or an `aria-label` string as it is the list on screen. Eleven capped a list the screen draws, which is the residue worth reading. The sweep also found what a per-tier run cannot: two stories that pass alone and fail when the whole tree shares a page
- [x] 3a.3 The controls tier: the same two states, and the assertions its stories still lack. **The kit was already the best-covered tier** -- four of seventy-eight files held nothing against twenty-three of ninety-eight in the compositions. Those four and the ten thinnest are done; one file holds nothing on purpose, and **styling is where the line falls**: a part with no behaviour has no claim to hold, but a preference honoured or a reading offered to a screen reader is behaviour whatever section it is filed under
- [x] 3a.4 One sweep each for the patterns found one file at a time: a fixture duplicated from a shared one, a part with nothing to select it by, an argument in a component's documentation. **Two of the three do not survive being swept for, and that is the finding.** A duplicated fixture is real and rare: one file, now spreading the shared roster rather than restating it. A part with nothing to select it by cannot be found ahead of the assertion that wants it -- reading the components nominates thirty-five files and nearly all inherit a handle from the kit part they compose; both real cases turned up while writing an assertion, and both were given a `data-slot` then. An argument in a docstring needed no sweep of mine at all: **Vale already rules on it**, and 1.4 pointed it at these tiers. `ComponentDocs.NoArgument` and `ComponentDocs.NoHistory` were 54 errors across some forty files, now zero -- the pattern is mechanical, and hand-rolled word-matching for it found 840 hits that were mostly the tree's ordinary voice

## 4. Screens

- [x] 4.1 The picker's eleven panes and the import dialog: the wiring between frame and pane
- [x] 4.2 The five entity screens, which differ only in the collection they name. **Each is `entity-scope-table` with one prop set**, so the block's stories own the scope row, the search, the filter bar, the pager, every write, the volume and the longest value. What is left to a screen is the one thing the block cannot say -- which scope it opens on, and that the search still narrows once it is -- and that is what each asserts
- [x] 4.3 The auth screens -- sign-in, first run, change password -- none of which drove a story
- [x] 4.4 The case screens, at the extremes of what each may hold
- [x] 4.5 The wait and the failure: **already owned two tiers down**, and the count that said otherwise was measuring the wrong thing. A read is drawn once by `Section`'s `read`, which fifteen case screens hand straight through; a submit is drawn and storied by the six form screens themselves. No screen draws either twice

## 5. Fold in

- [ ] 5.1 Sync the delta into the specifications and archive the change. **Waits on 1.5**, which is the whole of what is left. The branch lands without it: `changes/` is the in-flight form, and a change is archived when it is finished rather than when a branch is ready to go
