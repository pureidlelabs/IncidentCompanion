import { FileText, Newspaper, Pencil } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'

import type { Case, Report, ReportBlock } from '@/api/model'
import { EmptyState } from '@/components/blocks/empty-state'
import { ReportAddSectionMenu } from '@/components/blocks/report-add-section-menu'
import { ReportPaperPage, sectionDomId } from '@/components/blocks/report-paper-page'
import { ReportPreviewPane } from '@/components/blocks/report-preview-pane'
import { idsAfterDrop } from '@/components/blocks/report-reorder'
import {
  WRITTEN_KINDS,
  blocksOf,
  demoReport,
  factsFor,
  headingIsFinal,
  headingOf,
  isFrozen,
  railSectionsOf,
  sectionTally,
  stateOf,
  type RailSection,
} from '@/components/blocks/report-shape'
import { Badge } from '@/components/ui/badge'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { TextArea } from '@/components/ui/textarea'
import { ToggleButton, ToggleButtonGroup } from '@/components/ui/toggle-button'
import { cn } from '@/lib/cn'

/**
 * One report, in the three ways there are to look at it.
 *
 * Takes the report, the whole `report_blocks` table, the case its generated
 * sections count from, and two doors - adding a section, and rearranging them.
 * Draws the document strip, the section rail, the column of prose, the page
 * beside it and the preview. Holds the caret and the live text itself; a
 * container hands it the document and takes back the section kind that was
 * asked for and the order the sections were left in.
 *
 * **One surface with a view control, not three.** Compose, the page it
 * prints as, and the document that leaves are three views of one thing, and an
 * analyst moves between them while writing a paragraph. Modelled as separate
 * destinations they are three places to lose your caret.
 *
 * **Three columns, and the third is the point of the second.** The rail answers
 * *where is Root cause* and *what have I not written*, neither of which is
 * answerable from the column of prose - the answer to the second is the absence
 * of something. The page answers *does this read as a document*, which is a
 * question asked while writing rather than after.
 *
 * **The rail follows the caret, not the scroll.** A scroll spy has to pick a
 * section when several are on screen and the rule for that is arbitrary:
 * measured in the app, an `IntersectionObserver` keyed on visible ratio put a
 * 36px generated row ahead of the section being read, and the rail sat wrong
 * for three sections. Which section holds the caret has no such ambiguity.
 *
 * **The page is off by default.** A permanent split costs half the width to a
 * document nobody is reading while they type; a keystroke costs a keystroke.
 *
 * What this tier does not have: the prose here is local state, where the app's
 * is one CRDT per report carrying every analyst's caret; and Preview on a live
 * report is the server's rendered PDF, which nothing here can produce. Both say
 * so on screen rather than drawing something that stands in for them.
 */
export type ViewMode = 'compose' | 'paper' | 'preview'

export interface ReportWorkspaceProps {
  /** The report being worked on. */
  report?: Report
  /** The whole `report_blocks` table; this takes the report's own. */
  blocks: readonly ReportBlock[] | undefined
  /** The case the generated sections count from. */
  kase: Case | undefined
  /** Text per block id, standing in for the collaboration channel. */
  prose?: Readonly<Record<string, string>>
  /** Which view it opens on. */
  view?: ViewMode
  /** Adding a section. Absent on a report nobody may edit. */
  onAddSection?: (kind: string) => void
  /**
   * Commit a new running order: this report's block ids, every one, once, in
   * the order wanted.
   *
   * That is the body `POST /cases/:id/report_blocks/order` takes, and the list
   * it renumbers `position` from - so the seam is the route's own shape rather
   * than a move this would have to be turned into. `useEntryReorder` is what a
   * container reaches it through.
   *
   * Absent on a report nobody may reorder, and then the column is a plain
   * list with no grip on it: a grip that answers a press with nothing reads
   * worse than an absent one.
   */
  onReorder?: (ids: string[]) => void
}

const VIEWS: readonly { id: ViewMode; label: string; icon: typeof FileText }[] = [
  { id: 'compose', label: 'Compose', icon: Pencil },
  // The live one, which is what separates it from Preview.
  { id: 'paper', label: 'Compose beside the page', icon: Newspaper },
  { id: 'preview', label: 'The document that leaves', icon: FileText },
]

export function ReportWorkspace({
  report = demoReport(0),
  blocks: blocksGiven,
  kase,
  prose,
  view = 'compose',
  onAddSection,
  onReorder,
}: ReportWorkspaceProps) {
  const blocks = blocksGiven ?? []
  const [mode, setMode] = useState<ViewMode>(view)
  // The section holding the caret. Empty until somebody writes or jumps.
  const [here, setHere] = useState('')
  /**
   * Live text per section, so the page follows the caret rather than the save.
   *
   * Held for the whole document rather than per section: the page is one
   * document, and a section that has not been typed into yet still has to draw
   * what was stored.
   */
  const [live, setLive] = useState<Readonly<Record<string, string>>>(prose ?? {})

  const own = blocksOf(blocks, report.id)
  const rail = railSectionsOf(report, blocks)
  const frozen = isFrozen(report)
  const editable = !frozen

  const take = useCallback((id: string, text: string) => {
    setLive((all) => (all[id] === text ? all : { ...all, [id]: text }))
  }, [])

  const jump = useCallback((id: string) => {
    const section = document.getElementById(sectionDomId(id))
    section?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // The caret, not only the scroll: arriving at the section you meant to
    // write in and having to click once more is the whole cost of a rail that
    // only scrolls.
    // `textarea` as well as the role: an element's implicit role is not an
    // attribute, so a selector on `[role="textbox"]` alone matches the rich
    // editor and misses every plain field.
    section?.querySelector<HTMLElement>('textarea, [role="textbox"]')?.focus()
    setHere(id)
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DocumentStrip
        report={report}
        tally={sectionTally(report, blocks)}
        mode={mode}
        onMode={setMode}
        {...(editable && onAddSection !== undefined ? { onAddSection } : {})}
      />

      {mode === 'preview' ? (
        kase ? (
          <ReportPreviewPane report={report} blocks={own} kase={kase} live={live} />
        ) : null
      ) : own.length === 0 ? (
        <div className="px-4 py-6">
          <EmptyState
            icon={FileText}
            title="This report has no sections"
            detail="A section holds either your own text or a part of the case that is written when the report is exported."
            {...(editable && onAddSection !== undefined
              ? { action: <ReportAddSectionMenu onAddSection={onAddSection} /> }
              : {})}
          />
        </div>
      ) : (
        <div
          className={cn(
            'grid min-h-0 flex-1',
            // The rail folds away below `lg` rather than shrinking: at 13rem it
            // is already the narrowest it reads at, and a narrow window needs
            // the measure more than it needs the index.
            mode === 'paper'
              ? 'lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,26rem)]'
              : 'lg:grid-cols-[13rem_minmax(0,1fr)]',
          )}
        >
          <SectionRail sections={rail} here={here} onJump={jump} />

          <SectionColumn
            blocks={own}
            {...(editable && onReorder !== undefined ? { onReorder } : {})}
            section={(block) =>
              WRITTEN_KINDS.includes(block.kind) ? (
                <WrittenSection
                  block={block}
                  number={rail.find((one) => one.id === block.id)?.number ?? 0}
                  blank={rail.find((one) => one.id === block.id)?.blank ?? false}
                  editable={editable}
                  text={live[block.id] ?? ''}
                  onEnter={() => {
                    setHere(block.id)
                  }}
                  onWrite={(text) => {
                    take(block.id, text)
                  }}
                />
              ) : (
                <GeneratedSection
                  block={block}
                  number={rail.find((one) => one.id === block.id)?.number ?? 0}
                  facts={kase ? factsFor(block.kind, kase) : ''}
                />
              )
            }
          />

          {mode === 'paper' && kase && (
            <ReportPaperPage blocks={own} live={live} kase={kase} report={report} here={here} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The column of sections, in the running order the export prints.
 *
 * **One list, drawn as two shapes, and which one is not cosmetic.** A report
 * that may be rearranged is the kit's `Sortable` - a grid whose rows carry
 * their own controls, which is what a row holding a heading, a grip and a body
 * somebody is typing in *is*. A report nobody may rearrange stays an ordinary
 * ordered list, because there is nothing in it to operate.
 *
 * **The sections stop being `listitem`s in the first shape**, which is the
 * kit's semantics. The tier this replaces put
 * `role="listitem"` back by hand, because dnd-kit stamped `role="button"` over
 * an `li` and the outline silently became nine buttons. Nothing is stamped
 * here: a `Sortable` row is a grid row by construction and announces its
 * position and count, and the grip inside it is the only button.
 *
 * **`keyboardNavigationBehavior="tab"`, and a section is unwritable without
 * it.** Under React Aria's default, `arrow`, a row re-dispatches ArrowUp and
 * ArrowDown from its own capture handler onto its parent, so the analyst types
 * a paragraph, presses down for the next line, and lands in the next section
 * instead - and nothing inside the row can stop it, because the re-dispatch is
 * a fresh native event aimed above the row. `tab` turns that handler off and
 * stops every child-originated key at the row: the field keeps its own arrows,
 * Home and End, and Tab is how the grip is reached, which is where it belongs
 * anyway. Measured in jsdom before this was set: focus left the textarea on
 * the first press.
 *
 * **The grip is the keyboard route and the pointer drags the row.** React Aria
 * gives the drag button `pointer-events: none` on purpose, so a story or a
 * test that clicks it is told the element takes no pointer - focus it and
 * press Enter instead.
 */
function SectionColumn({
  blocks,
  onReorder,
  section,
}: {
  blocks: readonly ReportBlock[]
  /** Absent on a report nobody may rearrange. */
  onReorder?: (ids: string[]) => void
  section: (block: ReportBlock) => ReactNode
}) {
  if (onReorder === undefined) {
    return (
      <ol aria-label="Report sections" className="flex min-w-0 flex-col gap-3 px-4 py-3">
        {blocks.map((block) => (
          <li key={block.id} id={sectionDomId(block.id)}>
            {section(block)}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <Sortable
      aria-label="Report sections"
      variant="plain"
      keyboardNavigationBehavior="tab"
      // **`dependencies`, and a section is unwritable without it.** React Aria
      // caches a collection item's content by key and rebuilds it only when
      // `items` or this changes - so `section` closing over the live prose
      // renders once, the field goes on drawing the text it was first given,
      // and every keystroke is reverted by the controlled value. The browser
      // insert happens; nothing is prevented; the character simply is not
      // there afterwards. Measured in the browser tier, where typing into a
      // section left `beforeinput` fired and the value unchanged.
      dependencies={[section]}
      // `overflow-visible`: the kit's list scrolls itself, and a second
      // scroller inside the pane's own strands the page beside it.
      className="min-w-0 gap-3 overflow-visible px-4 py-3"
      items={blocks}
      onReorder={(event) => {
        const { key, dropPosition } = event.target
        if (dropPosition !== 'before' && dropPosition !== 'after') return
        const next = idsAfterDrop(
          blocks.map((block) => block.id),
          [...event.keys].map(String),
          String(key),
          dropPosition,
        )
        // `null` is a drop that landed where the section already was, and a
        // reorder posting the order the case already has is a version check,
        // a write and a change-feed row spent on nothing.
        if (next !== null) onReorder(next)
      }}
    >
      {(block: ReportBlock) => (
        <SortableItem
          id={block.id}
          // The rail names sections by `headingOf` and so does the document;
          // React Aria names the grip from this, so a third spelling would
          // give the grip a name the screen does not use.
          textValue={headingOf(block)}
          className="items-start border-t-0 px-0 py-0 hover:bg-transparent"
        >
          <div id={sectionDomId(block.id)} className="min-w-0 flex-1">
            {section(block)}
          </div>
        </SortableItem>
      )}
    </Sortable>
  )
}

/**
 * The band over the document: what it is, and how you are looking at it.
 *
 * Sticky on the pane rather than fixed, so the columns scroll under it and the
 * rail beside them stays clear of it.
 */
function DocumentStrip({
  report,
  tally,
  mode,
  onMode,
  onAddSection,
}: {
  report: Report
  tally: string
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  onAddSection?: (kind: string) => void
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-base font-semibold">{report.label || 'Untitled report'}</h1>
        <p className="truncate text-2xs text-ink-muted">{tally}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="soft" size="xs">
          {stateOf(report)}
        </Badge>
        {report.tlp !== null && (
          <Badge variant="outlined" size="xs" className="font-mono">
            {report.tlp}
          </Badge>
        )}
        {/* Icon-only: three labels in a strip that already reads
            `9 sections . 3 of 4 written` would be a toolbar grafted onto a
            caption. Each carries its name for a pointer and a screen reader. */}
        <ToggleButtonGroup
          aria-label="How you are looking at this report"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[mode]}
          onSelectionChange={(keys) => {
            const [first] = [...keys]
            if (typeof first === 'string') onMode(first as ViewMode)
          }}
        >
          {VIEWS.map(({ id, label, icon: Glyph }) => (
            <ToggleButton key={id} id={id} size="icon-sm" variant="outline" aria-label={label}>
              <Glyph aria-hidden />
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {onAddSection !== undefined && <ReportAddSectionMenu onAddSection={onAddSection} />}
      </div>
    </div>
  )
}

/**
 * Where you are in the document, and what is still empty.
 *
 * Each row carries a state mark as well as a destination: two shapes and three
 * colours, with the word beside them.
 */
function SectionRail({
  sections,
  here,
  onJump,
}: {
  sections: readonly RailSection[]
  here: string
  onJump: (id: string) => void
}) {
  return (
    <div className="hidden border-r border-border py-3 lg:block">
      <nav
        // **Not "Sections".** The case rail already carries that name, and two
        // navigation landmarks with one label are ambiguous to a screen reader
        // before they are ambiguous to a test.
        aria-label="Sections of this report"
        data-testid="report-section-rail"
        className="sticky top-14 flex flex-col"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={here === section.id}
            className={cn(
              'flex items-center gap-2 border-l-2 px-2.5 py-1 text-left text-xs',
              here === section.id
                ? 'border-l-primary bg-accent text-on-accent'
                : 'border-l-transparent text-ink-muted hover:bg-muted',
            )}
            onClick={() => {
              onJump(section.id)
            }}
          >
            <span
              // The shape carries the kind and the colour carries the state, so
              // neither fact has to be read out of one channel.
              aria-hidden
              className={cn(
                'size-1.5 shrink-0',
                section.written ? 'rounded-full' : 'rounded-xs',
                section.blank
                  ? 'bg-severity-medium'
                  : section.written
                    ? 'bg-action-contain'
                    : 'bg-ink-muted/50',
              )}
            />
            <span className="w-4 shrink-0 font-mono text-2xs tabular-nums opacity-70">
              {String(section.number).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1 truncate">{section.heading}</span>
            {section.blank && (
              // In words, because the mark is a 6px difference in hue and what
              // nobody has written is the question this rail exists for.
              <span className="shrink-0 text-2xs opacity-70">empty</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

/**
 * A section the analyst writes, at a reading measure.
 *
 * The body is a plain field, and that is a departure worth naming. The app
 * writes into a rich editor over one CRDT per report, carrying every analyst's
 * caret; that component still reaches the tier being replaced for its menus, so
 * an aria-only surface cannot draw it yet - `aria-only.rule.test.ts` is the
 * ratchet that says so, and it refuses a second exemption rather than growing
 * one. What survives the departure is what this is judged on: typing here is
 * what the page beside it draws, and the caret is what the rail follows.
 * Nothing is saved anywhere.
 */
function WrittenSection({
  block,
  number,
  blank,
  editable,
  text,
  onEnter,
  onWrite,
}: {
  block: ReportBlock
  number: number
  blank: boolean
  editable: boolean
  text: string
  onEnter: () => void
  onWrite: (text: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-right text-2xs text-ink-muted tabular-nums">
          {number}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{headingOf(block)}</h2>
        {!headingIsFinal(block) && (
          <span className="shrink-0 text-2xs text-ink-muted">heading not final</span>
        )}
        {blank && (
          <Badge variant="soft" size="xs">
            empty
          </Badge>
        )}
      </div>
      <div className="max-w-prose pl-7">
        <TextArea
          aria-label={headingOf(block)}
          className="max-w-none"
          rows={5}
          value={text}
          isReadOnly={!editable}
          placeholder={editable ? 'Write\u2026' : 'Nothing was written here.'}
          onFocus={onEnter}
          onChange={onWrite}
        />
      </div>
    </div>
  )
}

/**
 * A section the export composes from the case: one row, stating what it draws.
 *
 * Scanned rather than read, so it gets a row's height and not a card's.
 */
function GeneratedSection({
  block,
  number,
  facts,
}: {
  block: ReportBlock
  number: number
  facts: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
      <span className="w-5 shrink-0 text-right text-2xs text-ink-muted tabular-nums">{number}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{headingOf(block)}</span>
      {facts !== '' && <span className="shrink-0 text-2xs text-ink-muted">{facts}</span>}
      <Badge variant="soft" size="xs">
        generated
      </Badge>
    </div>
  )
}
