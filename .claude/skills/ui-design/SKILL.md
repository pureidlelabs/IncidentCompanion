---
name: ui-design
description: What IncidentCompanion's interface is built out of and how it should read — the one kit every control comes from (React Aria plus Tailwind, in `ui/src/components/ui/`), the shared blocks a screen may not re-grow, type and density, colour meaning, and the states every data surface owes. Use when building or changing any React screen, adding a component, judging whether a change reads right, or deciding whether something may be hand-rolled. The failure mode is a screen that looks correct alone and is the fourth version of a block that already existed.
---

# UX/UI: what the interface is built out of, and how it should read

*The reference screen is the timeline. When a new screen is unsure, copy that one.*

## Routing

| You are | Read |
| --- | --- |
| Adding a control, or wondering if it may be hand-rolled | this file → *one kit*, then `references/hand-rolled-log.md` |
| Building a screen that loads, filters or writes data | `references/state-lattice.md` |
| Adding a control, a dialog, a field or an icon-only button | `references/accessibility-floor.md` |
| Adding a transition, a spinner or anything that moves | `references/motion.md` |
| Wondering whether this reads as designed or as generated | `references/anti-slop.md` |
| Judging a finished change | *judging a UI change*, below |

---

## One kit, and it is React Aria plus Tailwind

`ui/src/components/ui/` **is** the kit. React Aria Components supplies behaviour and accessibility, `tokens.css` supplies every colour and measure, `tailwind-variants` carries the variants.

**Nothing outside the kit imports `react-aria-components`.** A screen, a block or a layout that needs something the kit does not have gets it *added to the kit*, with its `.stories.tsx` beside it. Never a raw primitive at the call site, and never a second implementation next to the first. `kit-owns-the-primitives.rule.test.ts` holds the boundary; `lib/locale.ts` is the one file outside it that reaches for React Aria, and it is kit code that exports hooks rather than components.

**The reason is not taste.** A primitive reached for directly is a component nobody documented, nobody gave states to and nobody can find - which is how this tree came to hold two `Field`s, one with 22 callers and one with 1.

**So there is no ladder to climb any more.** The question is not *which library answers this* but *is it in the kit*:

```bash
python3 .claude/scripts/kit_migration_map.py   # what is in, what is not
```

Adding one is the `button.tsx` shape: a `tv` block extending `focusRing`, look props in an **explicitly declared** exported interface, and `composeRenderProps` threading React Aria's render props into the variants. Variants key on `isDisabled` and `isPending`, never on `disabled:` - React Aria leaves a disabled control focusable and writes no `disabled` attribute for the CSS pseudo-class to hit.

**The look interface is spelled out, never `VariantProps<typeof tv>`.** `react-docgen-typescript` cannot follow the type `tailwind-variants` generates, so a derived interface documents nothing: the prop is absent from the docs page's table rather than shown undescribed. `ui/.storybook/main.ts` is what selects that docgen.

**Hand-rolled still needs the maintainer's yes** and a row in `references/hand-rolled-log.md` - but the bar moved. A component with no React Aria primitive under it is not hand-rolled: `Card`, `Badge`, `Kbd`, `Empty` and `IconTile` are markup and tokens, and that is a normal kit component.

### A link drawn as a button is `ButtonLink`, and the trade is recorded

Base UI refused the shape and ReUI shipped it anyway; the app followed ReUI, `useButton` added `role="button"`, and eleven tests moved onto the button role. React Aria answers it outright - `Link` is its own component, so `ButtonLink` is a real `<a>` wearing the button's `tv` block and answers `getByRole('link')`.

---

## Build a block, then recycle it

**A screen may not grow its own version of something another screen already has.** This is the rule the rest of the file depends on: every "how it should read" below is only true of the whole app while one component decides it.

Divergence of this kind is invisible per screen: three expanded-row designs and three filter rows can differ in label tier, typeface, separators and spacing while nothing is red and every screen looks right on its own. It is only found by putting two side by side.

**Each one had been made by copying a neighbour and editing it**, which is the only way this ever happens and feels like the careful choice at the time.

### The test that means nobody has to keep checking

`ui/src/components/blocks/blocks.test.ts` fails when a screen re-implements a block. It reads *source*, not the DOM — by the time a duplicate renders it looks correct, and the defect is that there are two of them. It fires on the shape rather than a class list, so a copy that renamed its utilities is still a copy.

It found two live duplicates and one off-scale control on its first run.

**And it missed the largest one, because every rule named a block *inside* a screen.** The picker drew its own rail for a whole screen — same 240px, same 31px rows, and underneath: 4px corners against the kit's 8px, group-label tracking of 0.275px against 0.55px, no active edge, no tooltip when folded, headings that did not fold. Found by the maintainer in one sentence. The rule added after it anchors on `--rail-width`, since a second rail has to size itself.

### Where they live

**Two directories, and the boundary is what a file is made of.**

| | Holds |
| --- | --- |
| `components/blocks/` | a composition **we** own: a shared part, or a workflow whose loads vary on their own |
| `components/ui/` | the kit: one control, over a single primitive - one in, one out |

**A block is a workflow, or a part several screens share. A screen is content and total composition.** Those are two different questions and a composition earns `blocks/` by answering either:

- **A shared part** — `row-actions`, `detail-grid`, `severity-badge`. Drawn in many places, and the reason for one copy is that divergence between copies is invisible per screen.
- **A workflow** — browse a library, read the log and narrow it, review an import. It has states of its own that vary independently of whatever screen feeds it: empty, one, far too many, refused, mid-flight.

**A composition that is neither is that screen's body.** One screen's arrangement of content, with nothing to vary but that screen's own data, is not made shared by living in `blocks/` — it only costs a second file, a second story set and a second name to keep true. Reuse *count* is not the test: a workflow drawn by one screen today is still a workflow, and a section drawn by one screen is still that screen's.

**So the tiers test different things, and neither should repeat the other.**

| | Its stories drive |
| --- | --- |
| A block | **the workflow under load** — the states the specification names, at the extremes, with the screen's wiring stubbed |
| A screen | **content and total composition** — which blocks, in what arrangement, wired to what; plus enough load to show the arrangement holds |

A screen story that re-drives a block's states is testing the block twice and the screen not at all. When a state belongs to both, it belongs to the block: that is the copy every screen inherits.

`Button`, `Alert` and `Item` are blocks in the sense that a screen may not re-grow them, and they live in the kit rather than in `blocks/` because each wraps one primitive. *What the blocks are* names them there.

### What the blocks are

Change one of these in one place and every screen moves. Proven by doing it: `Fact`'s value class to 32px and `Chip`'s padding, two files, and the detail panel and filter chips on **entities, malware, evidence and timeline** all moved together — 11.5px → 32px, 26px → 50px — and came back on revert.

| Block | Owns | Drawn by |
| --- | --- | --- |
| `ui/src/components/ui/sidebar.tsx` | the rail: width, row height and corner, group headings and their fold, the active edge, the collapsed tooltip, the footer | the workspace **and** the picker |
| `ui/src/components/blocks/data-table.tsx` | the grid: row height, cell padding, alignment, selection, sort, expansion, page-vs-box scroll, and `actionsColumn` | every table |
| `ui/src/components/blocks/detail-grid.tsx` | the expanded row — `DetailGrid` + `Fact`, label tier, value tier, how facts wrap | all 9 tables, Timeline |
| `ui/src/components/blocks/filter-bar.tsx` | the filter row — `Chip`, `FilterPicker`, `PickerRow`, `FilterGroup`, separators, stickiness | Timeline, entities, Evidence |
| `ui/src/components/blocks/row-actions.tsx` | the row's controls: chevron, pencil, bin, `⋯`, hover-and-focus reveal, 24px floor | every table, Timeline |
| `ui/src/components/blocks/row-menu.tsx` | what a right-click offers, and the guarantee the `⋯` offers the same | every table, Timeline |
| `ui/src/components/ui/button.tsx`, `ui/src/components/ui/toolbar.tsx`, `ui/src/components/ui/input.tsx` | control height and corner, through `--control-h-*` | everywhere |
| `ui/src/components/blocks/severity-badge.tsx` | a state's dot, word and ink, with its measured per-ground contrast | tables, Timeline, Evidence |
| `ui/src/components/blocks/bulk-actions.tsx` | where a table's selection actions are drawn | the tables with selection |
| `ui/src/components/blocks/auth-frame.tsx` | the unauthenticated frame: field left, form right, the lockup, the panel line, and the theme control's corner | sign in, first-run setup, forced password change |
| `ui/src/components/blocks/pane-head.tsx` | a picker pane's frame: title, blurb, meta, the pane's one action | all 8 picker panes |
| `ui/src/components/ui/item.tsx` | the row you choose by *reading* — shadcn's `Item`, media / content / actions | Demo cases, Plugins |
| `ui/src/components/ui/alert.tsx` | the surface anything refused is drawn on — shadcn's `Alert`, with the `role` none of its four predecessors had | the registry panes, the library editor |

**A screen still owns its own data**: which columns it has, which facets, its empty state's words. That is not design, and sharing it would be the opposite mistake.

### A list is a table unless its rows are read rather than scanned

**Converting the picker:** four of its six lists became tables; two did not, and the difference is whether a row carries prose:

| pane | per row | shape |
| --- | --- | --- |
| Your cases, Case templates, Reports ×2, Accounts | short fields only | table |
| Demo cases | a 114–123 character summary, and it is what you choose by | card |
| Plugins | a description, plus a failure and missing requirements when wrong | card |

A 32px row truncates 120 characters to nothing, and at three rows a table's sorting and scanning buy zero. **The exception is one design, not a licence** — both prose panes draw shadcn's `Item`, so "this one is different" cannot become "this one is its own".

**Take the upstream shape and note what you changed.** Both these came in from shadcn after being hand-rolled first, which was the wrong order and cost a round trip. Two departures were kept and both are in the copies' docstrings: `ItemDescription` drops upstream's `line-clamp-2`, because not cutting the prose is the whole reason these rows are not table rows; `Alert` keeps a tinted ground where upstream uses `bg-card`, because every place it appears sits on `bg-card` already.

**Two deliberate non-blocks.** `entity-card.tsx`'s hover card is a 288px popover, not an expanded row — the wrapping grid does not fit, and the test allows it by name. Timeline's `Recorded`/`GhostSlots` draw *through* the shared grid but choose their own facts.

---

## How the app should read

**The timeline is the reference screen.** Every rule below was settled by building it.

### Two type sizes, and mono only for what you would copy

A code face has even colour and no word shape, so a row set mostly in one turns scanning into reading — the largest fatigue cost on a screen someone sits in for a shift. Keep monospace for the values that are literally code.

- **Sans** for the sentence and every word of prose.
- **Mono** for the clock, technique ids, hostnames, hashes: strings that get selected and pasted. `--text-data` exists for this and says so in its own definition.
- **The uppercase micro tier labels things.** It is not a way to make prose look technical.

### Density: roomy where you read, tight where you scan

*"The problem with dense information is that it's fatiguing while analysts will have to spend hours in this app."* The **timeline row** got taller for that — 12px padding against 7px — and it is a row you read.

**A table row is not**: entity rows are **32px**, set once on `DataTable` and floored by the 24px control the row's actions sit on. A grid is scanned down a column, and height between rows is distance the eye crosses for nothing.

Both numbers live in code, not here — `DataTable`'s `h-8` and the timeline card's padding.

### Colour says what kind of thing this is

- **Severity is the ramp, starting at `high`** — `models.SEVERITY_LEVELS` has no `critical`. Red, orange, yellow, grey.
- **An activity is off the ramp entirely**: notification blue, containment green, investigation violet, mirroring `models.ACTION_TYPE_COLOURS`' three groups. An activity has no severity, and reusing the ramp would file SOC response under a detection's colour language.
- **A colour as a fill and the same colour as lettering are two decisions.** The ramp carries `--severity-foreground` on top of it; two steps are illegible *as ink*, one per ground, and only those two have a `-ink` token.
- **Hue is never the sole carrier.** The rail's colour is always named in words beside it, so a row survives a greyscale print.
- **The accent is chrome and never data.** Presence and conflict take it, which is what stops them colliding with severity once the app is multi-user.

### What may sit behind a click is decided by frequency, not by tidiness

This is the rule that resolves what looks like a contradiction. **Two adds collapsed into a split button was refused** — *"collapsing the event/activity in 1 button creates friction"* — and so was folding Edit and Delete into an overflow. **Theme behind a menu was waved through**: *"like you switch constantly the theme, that's fine."*

The difference is not how important the control is. It is **how often it is pressed**:

- **Many times a shift** — the add doors, edit, delete, the filter chips. Visible, and never behind a disclosure. An analyst who already knows which of two things they are recording should not be asked again by a menu.
- **Once or twice a day** — theme, sign out, export, keyboard shortcuts, import. A menu is right, and the row it frees is permanent.

A control that is *rarely used but load-bearing* still gets a visible door: the context menu is a shortcut, and the row's `⋯` is the door — the same list from both. → *"No analyst is going to press that small fucking icon."*

### One filled thing per view

A filled chip says *look here*, and 86 of them say it 86 times. Badges are outlined; the filled control is the primary action.

### A control sits with what it acts on

Sort belongs on the filter row, not the action row — both arrange the list, while the action row is things done *to* the case. The filter bar sits directly on the rows it narrows.

### Fixed vocabularies are chips; case-derived values go behind a picker

*Enforced by `filter-bar.tsx`, which owns both — see the blocks table.*

Kind and severity are the same handful in every case and hold permanent positions. Phase, host, indicator and account are whatever *this* case holds, and a case with eighteen hosts turns that row into a second toolbar, widest exactly where it helps least.

### The pane scrolls; never a box inside it

A box inside a pane that already scrolls is two scrollbars and a list that stops short of the window. `scrollbar-gutter: stable`, so a sticky band does not shift sideways when the bar appears.

### Say what is absent, and say what emptied the screen

A missing classification is work, not a fault: a dashed edge, never a danger colour. `tactic —` names the field rather than leaving a hole. A filter matching nothing names the conflict and offers to drop one side of it — "0 results, clear your filters" throws away every decision that was fine. A time window landing in a gap is a *finding* and says so.

**The full set of states a data surface owes is `references/state-lattice.md`.** Empty is the one that gets designed; loading, partial and conflict are the ones that get discovered in production.

---

## What the interface must not do

- **No dashboard.** This is a working surface; a number nobody can act on is noise however well it is drawn.
- **No design intent in analyst-facing strings.** A control needing a sentence to explain why it works that way is the wrong control.
- **Nothing load-bearing behind a disclosure.** *"No analyst is going to press that small fucking icon."* A context menu is a shortcut; the visible control is the door, and both offer the same list.
- **Nothing enumerates a theme, template or plugin by name.** They are drop-in registries.

---

## Judging a UI change

- **Never sign one off on `./test.sh`.** The suite cannot see overlap, clipped text, z-order or spacing. Run the **`visual-check` skill**; do not write a Playwright script.
- **Measure, do not only look.** Screenshots catch collisions, not a column 190px taller than it needs to be. Read `getBoundingClientRect` and assert on the number.
- **Judge it loaded, not empty.** One dialog candidate grew 661px → 815px once every link field was filled, which inverted the choice between it and the option it beat when empty.
- **A position is asserted in `e2e/`**, not in the unit tier.
- **Walk the states, not just the happy one** — `references/state-lattice.md`. A screen judged only full is a screen whose empty, loading and error copy nobody has read.

---

## Where the rest lives

| Question | Read |
| --- | --- |
| What is the app for? | `openspec/constitution.md`, and the capability specifications beside it |
| Which token, and measured at what? | `ui/src/styles/tokens.css` |
| Why is this component shaped like that? | its own docstring |
| What is coming? | `openspec/changes/`, where work in flight is a delta against the specifications |
| What an analyst-facing string may say | `rules/writing-style.md`, and `tests/docs/test_ui_copy.py`, which enforces it |
