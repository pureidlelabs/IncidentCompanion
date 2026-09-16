/**
 * The parts a block is built from are the block's to import.
 *
 * **`blocks.test.ts` beside this one names a block and a smell; this names
 * none.** That file needs somebody to notice a block wants a rule, so a block
 * nobody thought about has none -- which is how a shell comes to draw two rail
 * rows by hand out of the kit's rail row, `NavLink` and the exported active
 * edge, with a rule on the edge and none on the row.
 *
 * **The oracle is mechanical: a primitive that only blocks import is the
 * blocks'.** `RailRow` only makes sense inside a rail, `Cell`
 * inside the table, `TimelineItem` inside the activity feed - so a screen
 * importing one is not borrowing a control, it is rebuilding the composite. No
 * regex per block, and a new block is covered the day it is written.
 *
 * **The naive form of this does not work, and it was measured.** "Imported by
 * exactly one block" catches most of the kit, nearly all of it falsely:
 * `Field`, `Input`, `Dialog` and `Popover` are general controls that happen to
 * have one block among their callers, and a sign-in form using `Input` is not
 * re-implementing the entity dialog. What
 * separates a part from a control is that no screen needs it on its own -
 * which is exactly "no feature file imports it", and is what `OWNED` records.
 *
 * **It is a ratchet, not an audit.** The list is the boundary as it stands, so
 * it cannot find a duplication that already existed when the list was taken -
 * it stops the next one. `blocks.test.ts`'s smells are the other half: they
 * catch a copy that imports nothing and retypes the classes instead.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const BLOCK_DIR = dirname(fileURLToPath(import.meta.url))
const SRC = join(BLOCK_DIR, '..', '..')
// One tree now: the frames that were `layouts/` moved into `blocks/`.
const BLOCK_DIRS = [BLOCK_DIR]

/**
 * Every primitive that blocks import and no screen does, with the block that
 * holds it.
 *
 * **Add a line here deliberately, never to make the test pass.** A new entry
 * says "this part now belongs to that block"; deleting one says a screen may
 * hold it directly, which is a decision about the block's boundary rather
 * than a fix.
 *
 * **A name no block imports from the kit is outside the reach of `names the
 * block that imports it`** - the blind spot `imported()` has everywhere.
 */
const OWNED: Readonly<Record<string, string>> = {
  // These parts are held by a block and reached by no screen. Recorded rather
  // than decided: a line leaves this list when a screen legitimately holds the
  // part directly.
  AlertDialog: 'blocks/confirm-delete-dialog.tsx',
  Autocomplete: 'blocks/case-search-box.tsx',
  Avatar: 'blocks/presence.tsx',
  AvatarProps: 'blocks/presence.tsx',
  Cell: 'blocks/data-table.tsx',
  CheckboxGroup: 'blocks/compliance-field.tsx',
  Column: 'blocks/data-table.tsx',
  ComboBox: 'blocks/entity-combobox.tsx',
  Disclosure: 'blocks/field-row.tsx',
  DisclosureHeader: 'blocks/field-row.tsx',
  DisclosurePanel: 'blocks/field-row.tsx',
  DropZone: 'blocks/file-slot.tsx',
  Empty: 'blocks/empty-state.tsx',
  // The wizard's step marker, once it stopped drawing its own.
  MENU_SURFACE: 'blocks/case-search-box.tsx',
  SearchField: 'blocks/case-search-box.tsx',
  Spinner: 'blocks/wizard.tsx',
  EmptyActions: 'blocks/empty-state.tsx',
  EmptyDescription: 'blocks/empty-state.tsx',
  EmptyMedia: 'blocks/empty-state.tsx',
  EmptyTitle: 'blocks/empty-state.tsx',
  Field: 'blocks/case-fields.tsx',
  FileTrigger: 'blocks/file-slot.tsx',
  Form: 'blocks/auth-form.tsx',
  // Re-taken when the cheat sheet moved from `screens/` to `blocks/`: it was
  // the one screen holding a `Frame` directly, and an overlay is a block.
  Frame: 'blocks/cheat-sheet.tsx',
  FrameDescription: 'blocks/cheat-sheet.tsx',
  FrameHeader: 'blocks/cheat-sheet.tsx',
  FramePanel: 'blocks/cheat-sheet.tsx',
  FrameTitle: 'blocks/cheat-sheet.tsx',
  GraphCanvas: 'blocks/incident-canvas.tsx',
  GraphViewport: 'blocks/incident-canvas.tsx',
  GroupInput: 'blocks/library-collection.tsx',
  HoverCardPanel: 'blocks/entity-card.tsx',
  IconTile: 'blocks/demos-pane.tsx',
  Input: 'blocks/case-fields.tsx',
  Kbd: 'blocks/chord-keys.tsx',
  KbdGroup: 'blocks/chord-keys.tsx',
  KbdKeyName: 'blocks/chord-keys.tsx',
  LabelledSeparator: 'blocks/sso-sign-in.tsx',
  ListBox: 'blocks/palette-results.tsx',
  ListBoxSection: 'blocks/palette-results.tsx',
  Mark: 'blocks/auth-masthead.tsx',
  Menu: 'blocks/data-table.tsx',
  MenuItem: 'blocks/picker-frame.tsx',
  MenuLabel: 'blocks/picker-frame.tsx',
  // Re-taken when the session menu moved from `app/` to `blocks/`: the rows
  // the app hands both rails are markup, so they belong in a tier with a
  // story rather than in a container.
  MenuRadioItem: 'blocks/session-menu.tsx',
  MenuSectionGroup: 'blocks/picker-frame.tsx',
  MenuSeparator: 'blocks/picker-frame.tsx',
  MenuShortcut: 'blocks/session-menu.tsx',
  MenuTrigger: 'blocks/prose-body.tsx',
  Meter: 'blocks/health-pane.tsx',
  OverlayAnchor: 'blocks/incident-canvas.tsx',
  PointerAt: 'blocks/incident-canvas.tsx',
  PointerContextMenu: 'blocks/data-table.tsx',
  PopoverTrigger: 'blocks/incident-canvas.tsx',
  Radio: 'blocks/choice-row.tsx',
  ResizableTableContainer: 'blocks/import-csv-dialog.tsx',
  Row: 'blocks/data-table.tsx',
  ScrollArea: 'blocks/activity-door.tsx',
  Sheet: 'blocks/case-key-times-sheet.tsx',
  RailItem: 'blocks/case-frame.tsx',
  RailList: 'blocks/case-frame.tsx',
  RailSection: 'blocks/rail-nav.tsx',
  RailSubItem: 'blocks/case-frame.tsx',
  RailSubList: 'blocks/case-frame.tsx',
  RailSwitcher: 'blocks/rail-header.tsx',
  Slider: 'blocks/transport.tsx',
  Sortable: 'blocks/report-workspace.tsx',
  SortableItem: 'blocks/report-workspace.tsx',
  SubmenuTrigger: 'blocks/prose-body.tsx',
  Switch: 'blocks/administration-pane.tsx',
  Table: 'blocks/data-table.tsx',
  TableBody: 'blocks/data-table.tsx',
  TableHeader: 'blocks/data-table.tsx',
  TablePager: 'blocks/activity-log.tsx',
  Tag: 'blocks/compliance-field.tsx',
  TagGroup: 'blocks/compliance-field.tsx',
  TagsInput: 'blocks/field-control.tsx',
  TextArea: 'blocks/case-fields.tsx',
  ToastMessage: 'blocks/notify.tsx',
  ToastQueue: 'blocks/notify.tsx',
  ToastTone: 'blocks/notify.tsx',
  Toolbar: 'blocks/prose-body.tsx',
  FieldGroup: 'blocks/library-collection.tsx',
  DateTimeInput: 'case-fields',
  ItemDescription: 'pick-pane',
  ItemMedia: 'pick-pane',
  RadioGroup: 'pick-pane',
  Stepper: 'wizard',
  StepperDescription: 'wizard',
  StepperIndicator: 'wizard',
  StepperItem: 'wizard',
  StepperNav: 'wizard',
  StepperSeparator: 'wizard',
  StepperTitle: 'wizard',
  StepperTrigger: 'wizard',
  AmbientField: 'auth-atmosphere',
  CHANGED_RAIL: 'entity-dialog / field-row',
  HIGHLIGHT_MS: 'data-table',
  HOVER_CARD_CLOSE_DELAY: 'entity-card',
  HOVER_CARD_OPEN_DELAY: 'entity-card',
  HoverCard: 'entity-card',
  ImportPreview: 'import-csv-dialog',
  IconStack: 'empty-state',
  LinkedEntity: 'entity-link / entity-card',
  MISSING_REFERENCE: 'field-row',
  PROBLEM_RAIL: 'field-row',
  RowClaim: 'data-table',
  Rail: 'rail',
  RailBody: 'rail',
  RailCount: 'rail-nav',
  RailFoot: 'rail',
  RailHead: 'rail',
  RailPage: 'app-shell',
  RailRow: 'rail-nav',
  RailSectionHeading: 'rail-nav',
  RailShell: 'app-shell',
  RailToggle: 'app-shell',
  Timeline: 'activity-feed',
  TypedLine: 'auth-atmosphere',
  TimelineContent: 'activity-feed',
  TimelineDate: 'activity-feed',
  TimelineHeader: 'activity-feed',
  TimelineIndicator: 'activity-feed',
  TimelineItem: 'activity-feed',
  TimelineSeparator: 'activity-feed',
}

/**
 * The severity and field-tone tables, which are not parts of any one block.
 *
 * The kit's own data: they are read from outside `blocks/` too, which a rule
 * counting only block importers cannot see. -> #713
 */
const TONE_TABLES = [
  'FIELD_TONE_SEVERITY',
  'FieldTone',
  'SeverityTone',
  'TONE_CLASS',
  'TONE_FILL',
  'TONE_INK',
  'SEVERITY_FILL',
  'SEVERITY_INK',
]

/**
 * `Label`, `Separator` and the tooltip pair are block-only today and
 * deliberately unlisted: all are general controls a screen could want on its
 * own, and listing them would be the rule claiming a boundary the blocks do not
 * actually hold.
 */
const NOT_PARTS = new Set(['Label', 'Separator', 'Tooltip', 'TooltipTrigger', ...TONE_TABLES])

const IMPORT = /import\s+\{([^}]*)\}\s+from\s+'(@\/components\/ui\/[^']+)'/gs

function sources(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sources(full, into)
    } else if (
      entry.endsWith('.tsx') &&
      !entry.includes('.test.') &&
      !entry.includes('.stories.')
    ) {
      into.push(full)
    }
  }
  return into
}

function ownerFiles(owner: string): string[] {
  return owner
    .split(' / ')
    .map((part) => join(SRC, 'components', part.endsWith('.tsx') ? part : `blocks/${part}.tsx`))
}

/** The capitalised names a file imports from the component tiers. */
function imported(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const names: string[] = []
  for (const [, list] of text.matchAll(IMPORT)) {
    for (const raw of (list ?? '').split(',')) {
      // The exported name, not the local alias: `Rail as KitRail` is `Rail`.
      const name = raw.trim().replace(/^type\s+/, '').replace(/\s+as\s+\w+$/, '').trim()
      if (name && /^[A-Z]/.test(name)) names.push(name)
    }
  }
  return names
}

describe('a block owns the parts it is built from', () => {
  // **`screens/` is the caller tier**, and the count below is what holds the
  // walk to it: an earlier spelling pointed at a directory that had gone,
  // leaving every assertion below passing over nothing. It is a vacuity floor
  // rather than a census, so it sits under the real count with room for a
  // screen to leave -- a floor set at the exact count is one a retirement
  // fails on.
  const screenFiles = sources(join(SRC, 'screens'))
  const blockFiles = BLOCK_DIRS.flatMap((dir) => sources(dir))

  const inBlocks = new Map<string, Set<string>>()
  for (const file of blockFiles) {
    for (const name of imported(file)) {
      const at = inBlocks.get(name) ?? new Set<string>()
      at.add(file.slice(SRC.length + 1))
      inBlocks.set(name, at)
    }
  }

  it('finds source to read', () => {
    expect(screenFiles.length).toBeGreaterThan(30)
    expect(blockFiles.length).toBeGreaterThan(10)
  })

  it('names an owner that still exists', () => {
    const gone = Object.entries(OWNED)
      .flatMap(([name, owner]) => ownerFiles(owner).map((file) => ({ name, file })))
      .filter(({ file }) => !existsSync(file))
      .map(({ name, file }) => `${name}: ${file.slice(SRC.length + 1)}`)

    expect(
      gone.sort(),
      'an owner is what a reader consults to decide whether an entry may go - point it at the block that holds the part now',
    ).toEqual([])
  })

  /** A file that exists is not a file that holds the part, which is what the check above settles for. */
  it('names the block that imports it', () => {
    const wrong = Object.entries(OWNED)
      .filter(([name]) => inBlocks.has(name))
      .filter(([name, owner]) => {
        const rels = ownerFiles(owner).map((file) => file.slice(SRC.length + 1))
        return !rels.some((rel) => inBlocks.get(name)?.has(rel))
      })
      .map(([name, owner]) => `${name}: ${owner} imports nothing of it`)

    expect(
      wrong.sort(),
      'the owner is a block that imports the part - name one of the blocks that does',
    ).toEqual([])
  })

  /**
   * The rule itself. A screen reaching for one of these is building the
   * composite by hand, which is how two rail rows and three active edges
   * happened.
   */
  it('is the only thing that imports them', () => {
    const trespass: string[] = []
    for (const file of screenFiles) {
      const rel = file.slice(SRC.length + 1)
      for (const name of imported(file)) {
        const owner = OWNED[name]
        if (owner !== undefined) trespass.push(`${rel} imports ${name} (${owner}'s)`)
      }
    }
    expect(
      trespass.sort(),
      'a screen is building a block by hand - use the block, or move the part out of it',
    ).toEqual([])
  })

  /**
   * **The ratchet's teeth.** A part that has become block-only is a new piece
   * of a block's boundary, and listing it is the moment to say so - otherwise
   * the boundary grows silently and the rule above only ever guards what
   * somebody remembered to write down.
   */
  it('lists every part that has become block-only', () => {
    const inFeatures = new Set(screenFiles.flatMap((file) => imported(file)))

    const unlisted = [...inBlocks.keys()]
      .filter((name) => !inFeatures.has(name))
      .filter((name) => OWNED[name] === undefined && !NOT_PARTS.has(name))
      .sort()

    expect(
      unlisted,
      'these are imported by a block and by no screen: add each to OWNED, or to NOT_PARTS if a screen may hold it directly',
    ).toEqual([])
  })
})
