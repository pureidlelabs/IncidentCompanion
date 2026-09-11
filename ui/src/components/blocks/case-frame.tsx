import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { LayoutGrid, Plus, type LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import {
  ENTRY_SLUG,
  RAIL_GROUPS,
  SECTIONS,
  groupHolding,
  type RailRowSpec,
} from '@/components/blocks/case-sections'
import { MenuItem, MenuLabel, MenuSectionGroup, MenuSeparator } from '@/components/ui/menu'
import type { ActivityEntry } from '@/api/activity'
import type { RailReport } from '@/api/case'
import { RailFold, RailGroup, NavRow } from '@/components/blocks/rail-nav'
import { NavRail, type RailSignedIn } from '@/components/blocks/rail'
import { PresenceStack, type Person } from '@/components/blocks/presence'
import { isFrozen } from '@/components/blocks/report-shape'
import { Mark } from '@/components/ui/mark'
import { RailList, RailItem, RailSubList, RailSubItem } from '@/components/ui/rail'
import { COMMAND_PARAM } from '@/lib/command-request'
import { usePersistedFlag } from '@/lib/persistedFlag'

import { ActivityDoor } from './activity-door'
import { AppShell, type PaneInset } from './app-shell'

/**
 * A case, framed: the rail, the header bar, and the section in the pane.
 *
 * **`AppShell` owns the geometry and this owns the content.** The shell takes
 * slots and knows nothing about a case, which is right for a layout and leaves
 * every caller to write the rail out for itself -- so a story, another story
 * and the app each drew a different one.
 *
 * **So this is the only place a case's rail is composed.** Move the rail,
 * rename a group, add a section: one edit, and every screen and every story
 * follows, because none of them says anything about it.
 *
 * The counts are optional and per-slug rather than a prop per section, so a
 * screen that knows one number passes one entry instead of a widening list.
 *
 * **The shape of the pane is the one thing a screen knows and the frame cannot**,
 * declared from inside the pane through `useCasePane` rather than passed in. A
 * section that declares nothing renders exactly as it did before it existed.
 *
 * **The header carries what is true of the case rather than of the section**:
 * who else is in the case, and what has been written to it. Both arrive as
 * data, so a screen mounting the frame neither chooses them nor can forget
 * them.
 */
export interface CaseFrameProps {
  /** The slug whose row reads as current. */
  section: string
  /** Which view of that section is on screen, without the `#`. */
  fragment?: string | undefined
  caseName: string
  /** Beneath the case name -- its customer, its severity. */
  caseCaption?: string | undefined
  /** Beside the case name in the rail's head -- `Open`, `Closed`. */
  caseStatus?: string | undefined
  switcher?: ReactNode | undefined
  /** Right of the header bar -- a sheet trigger, a section's own control. */
  headerEnd?: ReactNode | undefined
  /**
   * Below the rail's rows: the signed-in analyst and their menu.
   *
   * A case page without it is missing the only control that signs out.
   */
  user?: RailSignedIn | undefined
  /**
   * Who else is in the case, yourself first. `casePresence.peopleFrom` builds
   * it from the roster the socket serves.
   */
  people?: readonly Person[] | undefined
  /** What has been written to the case, for the header's activity door. */
  activity?:
    | {
        entries: readonly ActivityEntry[]
        /** Turns an entity key into the analyst's word for it. */
        nameFor?: ((entity: string) => string) | undefined
        /** The newest `seq` already shown. Absent marks nothing. */
        seen?: number | undefined
      }
    | undefined
  /** Left of the header bar -- the search box. */
  headerStart?: ReactNode | undefined
  /** How a row's count chip is filled, by slug. Absent means no chip. */
  counts?: Readonly<Record<string, number>> | undefined
  /** The case's reports, which the rail draws under the Report row. */
  reports?: readonly RailReport[] | undefined
  /**
   * The report the pane is showing, as the address asks for it.
   *
   * Resolved against `reports` rather than trusted: a link naming a report
   * that has since been removed lands on the index, and marking the row by the
   * id would leave that screen with no row marked at all.
   */
  openReport?: string | null | undefined
  /** Where a row points. The gallery sends it nowhere real. */
  hrefFor?: ((slug: string) => string) | undefined
  children: ReactNode
}

export interface PaneShape {
  /**
   * The pane's inset: the frame's own, or none for a screen that fills it
   * edge to edge -- a document, a graph.
   *
   * **Not a class.** A sticky offset is measured from the padding edge, so
   * the pane declares one that cancels its inset; a screen that replaced the
   * padding with a class of its own left that offset behind and pinned
   * anything sticky above the scrollport's edge. -> #306
   */
  inset?: PaneInset | undefined
  /** Changing it takes the pane back to the top. */
  resetOn?: string | undefined
}

interface CaseFrameSlots {
  /** Shapes the pane; the returned function restores the frame's own. */
  shapePane: (shape: PaneShape) => () => void
}

const Slots = createContext<CaseFrameSlots | null>(null)

export function CaseFrame({
  section,
  fragment,
  caseName,
  caseCaption,
  caseStatus,
  switcher,
  headerEnd,
  headerStart,
  user,
  people,
  activity,
  counts,
  reports,
  openReport,
  hrefFor = (slug) => `/${slug}`,
  children,
}: CaseFrameProps) {
  const open = groupHolding(section)
  const [pane, setPane] = useState<PaneShape>({})
  const paneRef = useRef<HTMLDivElement>(null)

  // The pane back to the top, rather than a key that remounts it: the screen
  // asking for the reset is drawn *inside* the pane, so remounting it would
  // take the screen's own state -- which is what the reset is keyed on -- with
  // it, and the screen would spring back to what it opened on.
  useLayoutEffect(() => {
    if (paneRef.current !== null) paneRef.current.scrollTop = 0
  }, [pane.resetOn])

  const shapePane = useCallback((shape: PaneShape) => {
    setPane(shape)
    return () => {
      setPane({})
    }
  }, [])

  const slots = useMemo(() => ({ shapePane }), [shapePane])

  return (
    <Slots.Provider value={slots}>
      <AppShell
        triggerTestId="rail-trigger"
        collapsedKey="case-rail"
        paneKey={section}
        paneRef={paneRef}
        {...(pane.inset === undefined ? {} : { paneInset: pane.inset })}
        rail={
          <NavRail
            testId="rail"
            label="Case sections"
            head={{
              // The product's mark, not the section's icon. The head is where
              // a reader looks to know what they are running, and drawing the
              // section there moved it on every navigation while repeating
              // what the marked rail row already says.
              mark: <Mark className="size-5" />,
              name: caseName,
              caption: caseCaption,
              status: caseStatus,
              menu: switcher,
            }}
            {...(user === undefined ? {} : { user })}
          >
            {RAIL_GROUPS.map((group, at) => (
              <RailGroup
                key={group.label ?? `group-${String(at)}`}
                label={group.label}
                storageKey={`case-rail-${group.label ?? 'top'}`}
                holdsCurrent={group === open}
                testId={`rail-${(group.label ?? 'top').toLowerCase()}`}
              >
                <RailList>
                  {group.rows.map((row) => (
                    <Row
                      key={row.slug}
                      row={row}
                      section={section}
                      fragment={fragment}
                      counts={counts}
                      hrefFor={hrefFor}
                      reports={reports}
                      openReport={openReport}
                    />
                  ))}
                </RailList>
              </RailGroup>
            ))}
          </NavRail>
        }
        {...(headerStart === undefined ? {} : { headerStart })}
        headerEnd={
          <>
            {people !== undefined && <PresenceStack people={people} />}
            {activity !== undefined && (
              <ActivityDoor
                entries={activity.entries}
                {...(activity.nameFor === undefined ? {} : { nameFor: activity.nameFor })}
                {...(activity.seen === undefined ? {} : { seen: activity.seen })}
              />
            )}
            {headerEnd}
          </>
        }
      >
        {children}
      </AppShell>
    </Slots.Provider>
  )
}

/**
 * One rail row, and its children when it has them.
 *
 * A parent with `children` is a fold rather than a destination, so it reads as
 * current when any of its children is -- which is what stops the rail
 * collapsing the group an analyst is standing in.
 */
function Row({
  row,
  section,
  fragment,
  counts,
  hrefFor,
  reports,
  openReport,
}: {
  row: RailRowSpec
  section: string
  fragment: string | undefined
  counts: Readonly<Record<string, number>> | undefined
  hrefFor: (slug: string) => string
  reports: readonly RailReport[] | undefined
  openReport: string | null | undefined
}) {
  // Persisted per parent and open by default: standing on a child with its
  // parent folded shut hides the row that is current.
  const [folded, toggleFolded] = usePersistedFlag(`case-rail-fold-${row.slug}`, false)

  const identity = SECTIONS[row.slug]
  if (identity === undefined) return null

  if (row.hasSubrail === true) {
    return (
      <ReportRailRows
        icon={identity.icon}
        title={identity.title}
        reports={reports ?? []}
        base={hrefFor(row.slug)}
        here={row.slug === section}
        openReport={openReport}
        folded={folded}
        onToggleFold={toggleFolded}
      />
    )
  }

  const children = row.children ?? []
  // A child is a fragment of this row's page, so it is current only when the
  // page is current and the fragment names it.
  const holdsSection = row.slug === section && fragment !== undefined && children.includes(fragment)
  const count = counts?.[row.slug]

  return (
    <>
      {children.length === 0 ? (
        <NavRow
          icon={identity.icon}
          label={identity.title}
          to={hrefFor(row.slug)}
          active={row.slug === section}
          alsoActive={holdsSection}
          {...(count === undefined
            ? {}
            : { count, countLabel: `${String(count)} in ${identity.title}` })}
        />
      ) : (
        // Folded the same way the report's sub-rail is, because they are one
        // idea: a row reached through another. The registry declares these and
        // the case carries those, which is the only difference an analyst must
        // never see.
        <div className="relative flex items-center">
          <div className="min-w-0 flex-1">
            <NavRow
              icon={identity.icon}
              label={identity.title}
              to={hrefFor(row.slug)}
              active={row.slug === section}
              alsoActive={holdsSection}
              // Only while the child is on screen to carry it: folded, the row
              // that would have been marked is not drawn, and the rail stops
              // saying where the analyst is at all. And only when a child is
              // the one being stood on - the parent is a section itself, so
              // deferring on its own page marks nothing at all.
              deferToChild={!folded && holdsSection}
              reserveRight
              {...(count === undefined
                ? {}
                : { count, countLabel: `${String(count)} in ${identity.title}` })}
            />
          </div>
          <RailFold open={!folded} title={identity.title} slug={row.slug} onToggle={toggleFolded} />
        </div>
      )}
      {folded
        ? null
        : children.map((slug) => {
            const child = SECTIONS[slug]
            if (child === undefined) return null
            const childCount = counts?.[slug]
            return (
              <NavRow
                key={slug}
                level="sub"
                icon={child.icon}
                label={child.title}
                to={`${hrefFor(row.slug)}#${slug}`}
                active={row.slug === section && fragment === slug}
                {...(childCount === undefined
                  ? {}
                  : { count: childCount, countLabel: `${String(childCount)} in ${child.title}` })}
              />
            )
          })}
    </>
  )
}

/**
 * The Report row, the case's documents under it, and the door that starts one.
 *
 * **A bullet, not a status code.** Hollow against filled is a key nothing on
 * screen teaches, and drafts are the common case - so the quiet shape marks the
 * majority and a sent report says so in a word.
 *
 * **`replace` only from inside the section.** Arriving from another section is
 * a navigation and replacing it makes Back skip where the analyst came from.
 */
function ReportRailRows({
  icon: Icon,
  title,
  reports,
  base,
  here,
  openReport,
  folded,
  onToggleFold,
}: {
  icon: LucideIcon
  title: string
  reports: readonly RailReport[]
  /** The section's own address, which every row here hangs a query off. */
  base: string
  /** Whether the pane is showing this section at all. */
  here: boolean
  openReport: string | null | undefined
  folded: boolean
  onToggleFold: () => void
}) {
  // **What resolved, not what was asked for.** A link naming a report that has
  // since been removed lands on the index, and marking the row by the id would
  // leave that screen with no row marked at all.
  const open = reports.find((one) => one.id === openReport)
  const search = useLocation().search

  /** The section's address carrying `query`, and whatever else is already on it. */
  const addressed = (query: Readonly<Record<string, string>>): string => {
    const params = new URLSearchParams(search)
    // The router's copy still names a command that has already run, because it
    // is cleared through `window.history`. -> `specs/report/design.md`
    params.delete(COMMAND_PARAM)
    params.delete('report')
    for (const [key, value] of Object.entries(query)) params.set(key, value)
    const rest = params.toString()
    return rest === '' ? base : `${base}?${rest}`
  }

  return (
    <RailItem>
      {/* The fold sits in the row rather than over it: the parent is a
          destination as well as a fold, because the index is a screen and a
          heading that only toggled would leave it unreachable. */}
      <div className="relative flex items-center">
        <div className="min-w-0 flex-1">
          <NavRow
            bare
            icon={Icon}
            label={title}
            testId="rail-report-index"
            to={addressed({})}
            replace={here}
            active={here && open === undefined}
            reserveRight
            count={reports.length}
            countLabel={`${String(reports.length)} in ${title}`}
          />
        </div>
        <RailFold open={!folded} title={title} slug="report" onToggle={onToggleFold} />
      </div>
      {!folded && (
        <RailSubList data-testid="report-subrail">
          {reports.map((report) => (
            <RailSubItem key={report.id}>
              <NavRow
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
                to={addressed({ report: report.id })}
                replace={here}
                active={here && report.id === open?.id}
                testId={`rail-report-${report.id}`}
              />
            </RailSubItem>
          ))}
          <RailSubItem>
            {/* A door, so it is never the current row however the section is
                reached. The command travels on the address because the dialog
                belongs to a screen that is not mounted anywhere else, and the
                open report travels with it so cancelling gives it back. */}
            <NavRow
              bare
              icon={Plus}
              label="New report"
              level="sub"
              to={addressed({
                ...(open === undefined ? {} : { report: open.id }),
                [COMMAND_PARAM]: 'new-report',
              })}
              replace={here}
              active={false}
              testId="rail-report-new"
            />
          </RailSubItem>
        </RailSubList>
      )}
    </RailItem>
  )
}

/**
 * How the screen wants its pane shaped, declared from inside it.
 *
 * The frame draws the pane and the screen knows what goes in it, so the two
 * facts meet here rather than in a prop the mounter would have to carry. A
 * screen that never calls this gets the frame's own inset.
 */
export function useCasePane(shape: PaneShape): void {
  const slots = useContext(Slots)
  const shapePane = slots?.shapePane
  const { inset, resetOn } = shape

  useLayoutEffect(() => {
    if (shapePane === undefined) return
    return shapePane({ inset, resetOn })
  }, [shapePane, inset, resetOn])
}

/**
 * What to call a case on screen: its reference, else its title, else its id.
 *
 * The reference is optional and the title is required, so a case with no
 * reference is an ordinary case rather than an edge. `||` rather than `??`
 * because both store as `''` as readily as null, and the id is the last
 * resort: it is addressable, and `CaseSummary.id` says it is shown to nobody.
 */
export function nameOfCase(one: {
  id: string
  title?: string | null | undefined
  reference?: string | null | undefined
}): string {
  return one.reference || one.title || one.id
}

/**
 * Where else this analyst can go, from the rail's head.
 *
 * The case's own name captions the rows rather than being one of them: the
 * menu is about leaving this case, and a row for the case you are standing in
 * is a destination that does nothing.
 *
 * **Rows rather than a component.** React Aria assembles a menu's items into a
 * collection, so a component standing between the menu and its items is a node
 * the collection has to understand.
 *
 * Here rather than in the container that calls it: markup built in `app/` is
 * markup no story can render, so the gallery and the app stop showing the same
 * menu and nothing says so.
 */
export function switcherRows(
  title: string,
  others: readonly {
    id: string
    title?: string | null | undefined
    reference?: string | null | undefined
  }[],
  go: (to: string) => void,
): ReactNode {
  return (
    <>
      <MenuLabel>{title}</MenuLabel>
      <MenuSeparator />
      {others.length > 0 && (
        <MenuSectionGroup title="Other cases">
          {others.map((one) => (
            <MenuItem
              key={one.id}
              id={one.id}
              textValue={nameOfCase(one)}
              onAction={() => {
                go(`/cases/${encodeURIComponent(one.id)}/${ENTRY_SLUG}`)
              }}
            >
              {nameOfCase(one)}
            </MenuItem>
          ))}
        </MenuSectionGroup>
      )}
      <MenuSectionGroup>
        <MenuItem
          id="picker"
          onAction={() => {
            go('/cases')
          }}
        >
          <LayoutGrid />
          All cases
        </MenuItem>
      </MenuSectionGroup>
    </>
  )
}
