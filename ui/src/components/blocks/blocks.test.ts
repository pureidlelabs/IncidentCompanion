import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { openingTags } from '@/test/openingTags'

/**
 * A screen may not re-implement a block that already exists.
 *
 * **This is the anti-drift mechanism, and it exists because good intentions
 * were not one.** Three screens each grew their own expanded-row panel and
 * their own filter row, all four times by copying a neighbour and editing it.
 * Nothing was red, every screen looked right on its own, and the drift was
 * only ever found by the maintainer looking at two screens side by side. Measured
 * on 2026-08-02, before they were merged: **three detail-panel designs and
 * three filter rows**, differing in label tier, typeface, separators and
 * spacing.
 *
 * Each rule below names the block, and fires on the *shape* rather than on a
 * class list - a copy that renamed its utilities is still a copy.
 *
 * **Source text, not the DOM.** jsdom lays nothing out, and by the time a
 * duplicate renders it looks correct; the defect is that there are two of
 * them, which only the source can show.
 */

/**
 * **Three trees, because a block and its callers live apart.**
 * `blocks/` holds the compositions this file is the guard over, `ui/` holds
 * the wrappers over single primitives, and `screens/` holds the pages most
 * likely to re-grow one. Walking a subset leaves a duplicate in the rest
 * invisible - and the largest duplicate this rule ever missed was missed for
 * exactly that reason, being a whole screen's rail rather than a block inside
 * one. The frames that were `layouts/` are in `blocks/` since that tier
 * collapsed, so they are walked with everything else.
 */
const BLOCK_DIR = dirname(fileURLToPath(import.meta.url))
const KIT = join(BLOCK_DIR, '..', 'ui')
// **The gallery tier, added because it was invisible here.** A composite review
// planted `h-[42px]` in a screen and every guard stayed green; the same line in
// a block went red. Nothing violates it today, which is the moment to add it -
// this file's own docstring says walking a subset leaves a duplicate in the
// rest invisible.
const SCREENS = join(BLOCK_DIR, '..', '..', 'screens')

function sourcesUnder(dir: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      found.push(...sourcesUnder(full))
      continue
    }
    if (!/\.tsx?$/.test(name)) continue
    if (/\.(test|stories)\.tsx?$/.test(name)) continue
    const label = full.startsWith(BLOCK_DIR)
      ? 'blocks/' + full.slice(BLOCK_DIR.length).replace(/^\//, '')
      : 'ui/' + full.slice(KIT.length).replace(/^\//, '')
    found.push({ path: label, text: readFileSync(full, 'utf8') })
  }
  return found
}

/** Prose may name a class the code may not use - this file's own docstrings do. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Every block's owner, so a rule can allow the one file that defines it.
 *
 * `smell` is matched against the file; `tagSmell` walks every opening tag of
 * one element and matches inside it, for a rule whose subject is an attribute
 * that the house style puts behind an expression.
 */
interface Block {
  block: string
  owner: string
  smell: RegExp
  tagSmell?: { element: string; needle: RegExp }
  allow: readonly string[]
  instead: string
}

const BLOCKS: readonly Block[] = [
  {
    block: 'detail-grid.tsx',
    owner: 'detail-grid.tsx',
    // **A copy keeps the slot.** This is how a duplicate is really made -
    // by copying a neighbouring file wholesale - and it is the only anchor
    // that survives the panel being built on a `<div>`, which the shape rule
    // below cannot see at all: `<div className="grid grid-cols-...">` is a
    // layout every screen writes legitimately.
    smell: /data-slot="detail-grid"/,
    // A `<dl>` laid out as a grid *is* an expanded-row panel, whatever it
    // calls its columns. `entity-card.tsx`'s is the documented exception: a
    // 288px popover, where the wrapping grid does not fit.
    //
    // **The tag is walked, not matched.** The first cut required a quote
    // immediately after `className=` and so read past every tag in the kit,
    // where a class list is `className={cn('grid grid-cols-...')}` - which is
    // how `detail-grid.tsx`'s own `<dl>` is written, so the rule could not see
    // the shape it is named for.
    tagSmell: { element: 'dl', needle: /\bgrid\b/ },
    // Moved to `blocks/` when the tier rule found it importing a block.
    allow: ['blocks/entity-card.tsx'],
    instead: 'DetailGrid + Fact from components/blocks/detail-grid',
  },
  {
    block: 'filter-bar.tsx',
    owner: 'filter-bar.tsx',
    smell: /data-slot="filter-(chip|picker)"/,
    allow: [],
    instead: 'Chip / FilterPicker from components/blocks/filter-bar',
  },
  {
    block: 'row-actions.tsx',
    owner: 'row-actions.tsx',
    smell: /data-slot="row-actions"/,
    allow: [],
    instead: 'RowActions, which data-table.tsx\u2019s actionsColumn already renders',
  },
  {
    // **The rail was re-implemented for a whole screen and nothing noticed.**
    // `PickerShell.tsx` drew its own - same 240px, same 31px rows, and
    // underneath: 4px corners against the kit's 8px, group-label tracking of
    // 0.275px against 0.55px, no active edge, no tooltip when folded, headings
    // that did not fold. Found by the maintainer, not by this file, because every
    // rule here named a block inside a screen and the rail *is* the screen.
    //
    // `--rail-width` is the tell: a second rail has to size itself, and this
    // is how it does it honestly. A copy that hardcodes `w-60` instead escapes
    // this rule and is worth knowing about - the width token is one signal,
    // not a proof.
    block: 'sidebar.tsx',
    owner: 'sidebar.tsx',
    smell: /w-\(--rail-width/,
    allow: [],
    instead: 'Sidebar from components/ui/sidebar \u2014 there is one rail component',
  },
  {
    // **The same choice drawn three ways.** `StartCasePane` had two doors, the
    // empty case list four, and an empty section its stacked offers - a glyph
    // in a square, a title, one line, the whole row pressable - differing in
    // the glyph's size and ground and in whether the title alone was the
    // accessible name. The registry's dialog blocks are where the shape comes
    // from and there is one of it now.
    block: 'choice-row.tsx',
    owner: 'blocks/choice-row.tsx',
    smell: /data-slot="choice-row"/,
    allow: [],
    instead: 'ChoiceRow / ChoiceRows from components/blocks/choice-row',
  },
  {
    // **Three copies of one span, and the third was found by a failed
    // find-and-replace rather than by this file.** The active edge - the bar
    // down the left of the row the analyst is on - was written out in
    // `CaseShell` twice and `PickerShell` once, byte-identical apart from
    // indentation, comment included. A rule anchored on the testid catches a
    // fourth wherever it lands.
    block: 'rail-nav.tsx',
    owner: 'blocks/rail-nav.tsx',
    smell: /data-testid="rail-active-edge"/,
    allow: [],
    instead: 'RailActiveEdge from components/blocks/rail-nav',
  },
  {
    // **The edge rule above guards the mark, not the row - and a screen can
    // import the mark.** `CaseShell` drew two rail rows by hand from
    // `NavLink`, `SidebarMenuButton` and `RailActiveEdge`: one for a parent
    // with static children, one per report. Both called the exported edge, so
    // the testid rule saw nothing, and the two copies drifted exactly as this
    // file predicts - only one of them hid its sub-rail when the rail folded,
    // so folding it left twenty icons and two rows marked current at once, and
    // only one picked up the centring a folded rail needs.
    //
    // **`SidebarMenuButton` is the anchor because it is what a row cannot do
    // without.** A screen may legitimately want the rail, the group or the
    // scroller; rendering the button is building a row, and there is one of
    // those. Found by the maintainer across three separate complaints, on a rail
    // this same session had just rewritten - which is the argument for the
    // rule rather than for more care.
    block: 'rail-nav.tsx',
    owner: 'blocks/rail-nav.tsx',
    smell: /<SidebarMenuButton/,
    allow: [],
    instead: 'RailRow from components/blocks/rail-nav \u2014 it takes a mark, a qualifier and an active of your own',
  },
  {
    // **The rail component was shared and the frame around it was not.** The
    // rule above stopped a second `Sidebar` being written; it says nothing
    // about the screen that mounts one, and both screens that do had grown
    // their own provider, their own collapse flag, their own header and their
    // own scroller. Measured before this rule: the case header computed to
    // 52px (28px of control inside `py-3`) and the picker's was a fixed 56px,
    // on two screens one analyst switches between all day.
    //
    // **`SidebarProvider` is the anchor because it is what a frame cannot do
    // without.** A screen can borrow the rail, the header or the scroller
    // alone and be doing something legitimate; mounting the provider is
    // claiming to *be* a shell, and there is one of those per layer.
    block: 'blocks/app-shell.tsx',
    owner: 'blocks/app-shell.tsx',
    smell: /<SidebarProvider/,
    // Nothing else may mount the provider: `rail-layout` was the second shell
    // and went with the ReUI tier.
    allow: [],
    instead: 'AppShell from components/blocks/app-shell',
  },
  {
    // **Two panes had grown their own card**, alike enough that nothing said
    // so and already drifting in their tiers underneath.
    //
    // **A bordered `<li>` is the wrong anchor**, and the first cut used it: a
    // dropdown option, a tag chip and a search result are all bordered `<li>`s
    // that copy nothing, and the rule named four such files. `data-slot` is
    // what the filter-bar rule uses for the same reason - it catches the way
    // this actually happens, which is copying a neighbouring file wholesale,
    // slot and all. A card invented from scratch escapes it; none ever was.
    // They draw shadcn's `Item` now - the shape built for a dense list row.
    block: 'item.tsx',
    owner: 'item.tsx',
    smell: /data-slot="item(-group|-media|-content|-title|-description|-actions)?"/,
    allow: [],
    instead: 'Item + ItemGroup from components/ui/item',
  },
  {
    // The same border, tint and padding was retyped four times across three
    // files - a registry is drop-in by design, so "this file would not parse"
    // is an ordinary event every pane over a registry has to draw.
    // shadcn's `Alert` carries the `role="alert"` none of the four copies had.
    block: 'alert.tsx',
    owner: 'alert.tsx',
    smell: /border-destructive\/40 bg-destructive\/5/,
    allow: [],
    instead: 'Alert from components/ui/alert',
  },
  {
    // **Eight panes wrote their own heading**, already drifted: one used
    // `<section>` with `gap-3` where the rest used `<div>` with `gap-4`.
    //
    // **The tier alone is the wrong anchor**, and the first cut used it: the
    // dialog title, the report's rendered `h1`/`h2` and a preview heading all
    // carry `text-lg font-semibold` legitimately, so the rule fired on three
    // files that copy nothing. What makes this block is the *shape* - a
    // heading element opening at that tier.
    block: 'pane-head.tsx',
    owner: 'pane-head.tsx',
    smell: /<h2 className="text-lg font-semibold"/,
    allow: [],
    instead: 'Pane from components/blocks/pane-head',
  },
  {
    // **Nine screens wrote the same count ternary**, each owning the badge's
    // variant and size and its own pluralisation - and two of them dropped the
    // noun once a filter was on, leaving `3 of 12`.
    //
    // **The slot, not the badge.** `<Badge variant="outlined" size="xs">` has
    // twelve legitimate callers in this tree - a stage, a ticket in mono, a
    // role inside a column - so a rule on the shape would need an allow list
    // longer than the rule, which is a boundary the block does not hold. The
    // slot catches what actually makes a duplicate: a copied file.
    block: 'section-head.tsx',
    owner: 'section-head.tsx',
    smell: /data-slot="section-(count|add)"/,
    allow: [],
    instead: 'CountBadge / AddAction from components/blocks/section-head',
  },
]

/** Whether one file re-implements one block. Comments are not markup. */
function reimplements(block: Block, text: string): boolean {
  const code = withoutComments(text)
  if (block.smell.test(code)) return true
  const tag = block.tagSmell
  return tag !== undefined && openingTags(code, tag.element).some((one) => tag.needle.test(one))
}

/**
 * Control heights come from `--control-h-*`, never a literal.
 *
 * `toolbar.tsx` hardcoded `h-8` and `TimelineList` then overrode a toggle to
 * `h-7` at its call site, which is how one row ended up carrying 32px buttons
 * beside a 28px one. Measured: four heights across two rows doing one job.
 *
 * **Any string, not just `className=`.** The first cut anchored on the
 * attribute and so read none of the kit, where every class list goes through
 * `cn()` - it stayed green with `toolbar.tsx` put back to `h-8`, which is the
 * exact defect it is named for.
 *
 * **A height in brackets is the same defect and escaped the scale rule.**
 * `h-[26px]` is not on the scale at all - the tokens are 28, 32 and 40px - so
 * it is a fourth height by construction, and three screens carry it. `min-` and
 * `max-` prefixes are excluded: those bound a container rather than size a
 * control, and every live one is a `vh` or `rem` viewport cap.
 *
 * **`size-*` is deliberately not read, and that is this rule's blind spot.** It
 * sets both axes and is the icon, avatar and lockup idiom here - ten of the
 * twelve live uses are `Mark`, `PersonAvatar` and `ItemMedia`. A rule firing on
 * those is one that gets allow-listed until it means nothing, so the two that
 * really are controls (`sidebar.tsx`'s fold button, the library editor's colour
 * swatch) go unread rather than buying ten exemptions.
 */
const SCALE_HEIGHT = /['"`\s]h-(7|8|9|10|11)['"`\s]/
const PIXEL_HEIGHT = /(?<![\w-])h-\[\d+(?:\.\d+)?px\]/

describe('the kit\u2019s blocks are not re-implemented', () => {
  const sources = [
    ...sourcesUnder(SCREENS),
    ...sourcesUnder(KIT),
    ...sourcesUnder(BLOCK_DIR),
  ]

  it('finds source to read', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it.each(BLOCKS)('$block is the only $block', (block) => {
    const { owner, allow, instead } = block
    const offenders = sources
      .filter(
        ({ path }) =>
          !path.endsWith(owner) && !allow.some((one) => path.endsWith(one)),
      )
      .filter(({ text }) => reimplements(block, text))
      .map(({ path }) => path)
    expect(offenders, `re-implements a block \u2014 use ${instead}`).toEqual([])
  })

  it('reads a detail grid written in the house style', () => {
    // The guard on the guard: the `<dl>` rule required a quote immediately
    // after `className=`, so the one spelling every file in the kit uses -
    // and `detail-grid.tsx`'s own - was the one spelling it could not see. A
    // fixture rather than a real file, because planting the shape in someone
    // else's screen is planting a defect.
    const detailGrid = BLOCKS.find((one) => one.block === 'detail-grid.tsx')!
    const copied = [
      '<dl',
      '  className={cn(',
      "    'grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-6 gap-y-3',",
      "    'rounded-sm bg-muted/40 px-3 py-2.5',",
      '  )}',
      '>',
      '  <dt>Host</dt>',
      '</dl>',
    ].join('\n')
    expect(reimplements(detailGrid, copied)).toBe(true)

    // And a `<dl>` that is not a grid is not this block. `prose-shortcuts.tsx`
    // and the cascade's metrics row are both live examples.
    expect(reimplements(detailGrid, '<dl className="flex flex-col">')).toBe(false)

    // The slot half, which is what a copy hung on a `<div>` still carries.
    expect(reimplements(detailGrid, '<div data-slot="detail-grid" className="grid">')).toBe(true)
  })

  it('sizes every control from --control-h-*, not a literal height', () => {
    // Rows and cells are not controls: `DataTable` sets the row height itself,
    // and `RowActions` is the 24px tier with its own floor.
    const offenders = sources
      // `data-table.tsx` sets the *row* height, and a slider's track and thumb
      // are its own geometry - neither is a control the density tokens
      // describe. That geometry lives in `components/ui/slider.tsx` and, for
      // the brush's own track, in `components/ui/time-brush.tsx`;
      // `ui/src/components/ui/time-brush.tsx` is the Base UI one it replaces.
      // `TimelineCascade`'s `h-[13px]` is the same class of thing: a drawn
      // tick in a graph, not a control.
      .filter(
        ({ path }) =>
          !/data-table\.tsx$|TimeBrush\.tsx$|ui\/slider\.tsx$|ui\/time-brush\.tsx$|TimelineCascade\.tsx$/.test(
            path,
          ),
      )
      .filter(({ text }) => {
        const code = withoutComments(text)
        return SCALE_HEIGHT.test(code) || PIXEL_HEIGHT.test(code)
      })
      .map(({ path }) => path)
    expect(offenders, 'use h-(--control-h-sm|md|lg)').toEqual([])
  })

  it('reads a height written in brackets', () => {
    // The guard on the guard: the scale rule enumerates 7-11, so the one
    // spelling that cannot be on the scale at all was the one it could not
    // see. Fixtures, because the three live sites are other screens' files.
    expect(PIXEL_HEIGHT.test("cn('[&_button]:h-[26px] [&_button]:px-2.5')")).toBe(true)
    expect(PIXEL_HEIGHT.test("'h-[13px] w-1'")).toBe(true)
    // A container's cap is not a control's height, and neither is the token.
    expect(PIXEL_HEIGHT.test("'flex max-h-[70vh] flex-col'")).toBe(false)
    expect(PIXEL_HEIGHT.test("'grid h-(--document-viewport-h) min-h-[24rem]'")).toBe(false)
    expect(SCALE_HEIGHT.test("cn(controlBase, 'h-(--control-h-md)')")).toBe(false)
  })
})
