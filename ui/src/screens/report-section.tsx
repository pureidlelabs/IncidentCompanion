import { Plus, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import type { Case, Report, ReportBlock } from '@/api/model'
import type { ReportLayout } from '@/api/reportLayouts'
import { useCasePane, useCaseRailRow } from '@/components/blocks/case-frame'
import { RailFold, RailRow } from '@/components/blocks/rail-nav'
import { ReportIndexPane } from '@/components/blocks/report-index'
import { ReportNewDialog, type NewReportChoice } from '@/components/blocks/report-new-dialog'
import { isFrozen } from '@/components/blocks/report-shape'
import type { BlockKindGroup } from '@/api/reportBlockKinds'
import { ReportWorkspace } from '@/components/blocks/report-workspace'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { SidebarMenuSub, SidebarMenuSubItem } from '@/components/ui/sidebar'
import { useCommandRequest } from '@/lib/command-request'
import { usePersistedFlag } from '@/lib/persistedFlag'

/**
 * The report section whole: the case's documents on the rail, and the one that
 * is open in the pane.
 *
 * **The reports are navigation, so they live where navigation lives.** Drawing
 * the list as a pane inside the content area gives the section two lists of the
 * same four things and puts the document you have had open all morning two
 * clicks away - the rail is already the place every other section is reached
 * from.
 *
 * **The rail they live on is the case's own.** The section claims the Report
 * row from the frame that mounts it and draws its documents under that one
 * row, so the analyst keeps every other section in reach while moving between
 * documents.
 *
 * **New report is a rail row rather than a button on the index**, because
 * creating one is a top-level act: two clicks deep behind a list is where the
 * old pair of dead buttons were, and the maintainer could not find either.
 *
 * **One destination, and which report is open is a state of it.** The rail
 * carries a single Report row, so moving between documents never leaves the
 * section: with none open the pane is the index - what each report still owes
 * - and opening one puts the workspace there instead. This screen holds that
 * one piece of state and composes both.
 */
export interface ReportSectionScreenProps {
  reports: readonly Report[] | undefined
  blocks: readonly ReportBlock[] | undefined
  kase: Case | undefined
  /** The written prose of the open report's sections, by block id. */
  prose?: Readonly<Record<string, string>>
  /** The layouts a new report can be seeded from. */
  layouts: readonly ReportLayout[] | undefined
  /** The sharing markings a document can carry. */
  markings: readonly string[] | undefined
  /** Which report the section opens on. `null` opens the index. */
  openId?: string | null
  /** Whether this install surfaces NIS2, which the New report form reads. */
  nis2Enabled?: boolean
  /**
   * Starts a report: the document, then the sections its layout seeds.
   *
   * Two writes rather than one, which is why the screen hands the whole
   * choice over rather than making them. Without it the New report form is
   * drawn and its submit does nothing, so the dialog refuses instead.
   */
  onCreate?: ((choice: NewReportChoice) => void) | undefined
  /**
   * Adds a section to the open report: the report it belongs to, and the kind.
   *
   * **The report id rides out with it**, because the section holds which
   * document is open and a container does not - a create needs the `reportId`
   * the block is written under, and reading it back off the screen is not
   * something a container can do.
   *
   * Absent, the workspace draws no Add control rather than one that does
   * nothing - which is what this screen shipped with until it was wired.
   */
  onAddSection?: ((reportId: string, kind: string) => void) | undefined
  /**
   * Every section this install can hold, from `GET /api/report-block-kinds`.
   *
   * Passed through to the workspace's insert menu. Absent, the menu falls
   * back to the fixture, which is the gallery's case and not the app's.
   */
  blockKinds?: readonly BlockKindGroup[] | undefined
  /**
   * Commits a new running order: the open report's block ids, every one, once.
   *
   * That is `POST /cases/:id/report_blocks/order`'s own body - the route reads
   * the scope off the ids it is given and renumbers `position` from the list,
   * so nothing else needs to ride along and no report id is wanted here.
   * `useEntryReorder` is what a container reaches it through.
   *
   * Absent, the sections are a list and not a thing to rearrange.
   */
  onReorder?: ((ids: string[]) => void) | undefined
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state lists another case's documents.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

export function ReportSectionScreen({
  reports: reportsGiven,
  blocks: blocksGiven,
  kase,
  prose,
  layouts,
  markings,
  openId = null,
  nis2Enabled = true,
  onCreate,
  onAddSection,
  blockKinds,
  onReorder,
  busy = false,
  problem,
  onRetry,
}: ReportSectionScreenProps) {
  const reports = reportsGiven ?? []
  const blocks = blocksGiven ?? []
  const [here, setHere] = useState<string | null>(openId)
  const [starting, setStarting] = useState(false)
  // The palette's New report: this screen owns the control, so it is where the
  // command lands after the jump.
  useCommandRequest({
    'new-report': () => {
      setStarting(true)
    },
  })
  const open = reports.find((one) => one.id === here)
  const railRow = useCaseRailRow('report')

  // A new document is a new list, and a pane carrying the last one's offset
  // opens part way down it. The workspace is full bleed and the index brings
  // its own inset, so the pane keeps none of its own.
  useCasePane({ className: 'p-0', resetOn: here ?? 'index' })

  return (
    <>
      {railRow.node !== null &&
        createPortal(
          <ReportRailRows
            icon={railRow.icon}
            title={railRow.title}
            reports={reports}
            open={open}
            onOpen={setHere}
            onIndex={() => {
              setHere(null)
            }}
            onNew={() => {
              setStarting(true)
            }}
          />,
          railRow.node,
        )}

      <AsyncBoundary
        isPending={busy}
        isError={problem !== undefined}
        error={problem}
        {...(onRetry ? { refetch: onRetry } : {})}
      >
        {open === undefined ? (
          // A height to fill, so the index's own body is the scrollport and its
          // column header pins. A plain block let the pane scroll instead.
          <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <ReportIndexPane
              reports={reports}
              blocks={blocks}
              onOpen={setHere}
              onNew={() => {
                setStarting(true)
              }}
            />
          </div>
        ) : (
          <ReportWorkspace
            report={open}
            blocks={blocks}
            kase={kase}
            {...(prose === undefined ? {} : { prose })}
            // Each door is passed only when something is behind it: the workspace
            // draws the Add control and the grips on their presence, so wiring
            // one to a function that returns is a control an analyst presses and
            // nothing happens - which is what stood here.
            {...(onAddSection === undefined
              ? {}
              : {
                  onAddSection: (kind: string) => {
                    onAddSection(open.id, kind)
                  },
                })}
            {...(blockKinds === undefined ? {} : { blockKinds })}
            {...(onReorder === undefined ? {} : { onReorder })}
          />
        )}
      </AsyncBoundary>

      <ReportNewDialog
        open={starting}
        onOpenChange={setStarting}
        nis2Enabled={nis2Enabled}
        layouts={layouts}
        markings={markings}
        {...(onCreate ? { onCreate } : {})}
      />
    </>
  )
}

/**
 * The Report row, its documents under it, and the door that starts one.
 *
 * **A bullet, not a status code.** Hollow against filled is a key nothing on
 * screen teaches, and drafts are the common case - so the quiet shape marks the
 * majority and a sent report says so in a word.
 *
 * Folded away behind a chevron, because a case with several reports otherwise
 * pushes the rest of the rail out of reach.
 *
 * **The parent row is marked by what resolved, not by what was asked for.** A
 * link naming a report that has since been removed lands on the index, and
 * marking the row by the id would leave that screen with no row marked at all.
 */
function ReportRailRows({
  icon,
  title,
  reports,
  open,
  onOpen,
  onIndex,
  onNew,
}: {
  icon: LucideIcon | undefined
  title: string
  reports: readonly Report[]
  /** The report the pane is showing, or `undefined` when it is the index. */
  open: Report | undefined
  onOpen: (reportId: string) => void
  onIndex: () => void
  onNew: () => void
}) {
  const [folded, toggleFolded] = usePersistedFlag('case-rail-report-subrail', false)

  return (
    <>
      {/* The fold sits in the row rather than over it: the parent is a
          destination as well as a fold, because the index is a screen and a
          heading that only toggled would leave it unreachable. */}
      <div className="relative flex items-center">
        <div className="min-w-0 flex-1">
          <RailRow
            bare
            {...(icon === undefined ? {} : { icon })}
            label={title}
            testId="rail-report-index"
            onSelect={onIndex}
            active={open === undefined}
            reserveRight
            count={reports.length}
            countLabel={`${String(reports.length)} in ${title}`}
          />
        </div>
        <RailFold open={!folded} title={title} slug="report" onToggle={toggleFolded} />
      </div>
      {!folded && (
        <SidebarMenuSub data-testid="report-subrail">
          {reports.map((report) => (
            <SidebarMenuSubItem key={report.id}>
              <RailRow
                bare
                mark={
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${
                      isFrozen(report) ? 'bg-current' : 'border border-current'
                    }`}
                  />
                }
                label={report.label || 'Untitled report'}
                tooltip={report.label || 'Untitled report'}
                {...(isFrozen(report) ? { qualifier: 'Sent' } : {})}
                level="sub"
                active={report.id === open?.id}
                testId={`rail-report-${report.id}`}
                onSelect={() => {
                  onOpen(report.id)
                }}
              />
            </SidebarMenuSubItem>
          ))}
          <SidebarMenuSubItem>
            {/* A door, so it is never the current row however the section is
                reached. */}
            <RailRow
              bare
              icon={Plus}
              label="New report"
              level="sub"
              active={false}
              testId="rail-report-new"
              onSelect={onNew}
            />
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      )}
    </>
  )
}
