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

import { LayoutGrid } from 'lucide-react'

import {
  ENTRY_SLUG,
  RAIL_GROUPS,
  SECTIONS,
  groupHolding,
  type RailRowSpec,
  type SectionIdentity,
} from '@/components/blocks/case-sections'
import {
  MenuItem,
  MenuLabel,
  MenuSectionGroup,
  MenuSeparator,
} from '@/components/ui/menu'
import type { ActivityEntry } from '@/api/activity'
import { RailFold, RailGroup, RailRow } from '@/components/blocks/rail-nav'
import { Rail, type RailSignedIn } from '@/components/blocks/rail'
import { PresenceStack, type Person } from '@/components/blocks/presence'
import { Mark } from '@/components/ui/mark'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { usePersistedFlag } from '@/lib/persistedFlag'

import { ActivityDoor } from './activity-door'
import { AppShell } from './app-shell'

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
 * **Two things a screen knows and the frame cannot**, both declared from
 * inside the pane rather than passed in: the rows under a row marked
 * `hasSubrail`, through `useCaseRailRow`, and the shape of the pane itself,
 * through `useCasePane`. A section that declares neither renders exactly as it
 * did before either existed.
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
  /** Where a row points. The gallery sends it nowhere real. */
  hrefFor?: ((slug: string) => string) | undefined
  children: ReactNode
}

export interface PaneShape {
  /** Replaces the pane's own `px-6 py-5` inset. */
  className?: string | undefined
  /** Changing it takes the pane back to the top. */
  resetOn?: string | undefined
}

interface CaseFrameSlots {
  /** Takes the rail row for `slug`; the returned function gives it back. */
  claim: (slug: string) => () => void
  /** The element a claimed row's content is drawn into, once it exists. */
  nodes: Readonly<Record<string, HTMLElement | null>>
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
  hrefFor = (slug) => `/${slug}`,
  children,
}: CaseFrameProps) {
  const open = groupHolding(section)
  const [claimed, setClaimed] = useState<readonly string[]>([])
  const [nodes, setNodes] = useState<Readonly<Record<string, HTMLElement | null>>>({})
  const [pane, setPane] = useState<PaneShape>({})
  const paneRef = useRef<HTMLDivElement>(null)

  // The pane back to the top, rather than a key that remounts it: the screen
  // asking for the reset is drawn *inside* the pane, so remounting it would
  // take the screen's own state -- which is what the reset is keyed on -- with
  // it, and the screen would spring back to what it opened on.
  useLayoutEffect(() => {
    if (paneRef.current !== null) paneRef.current.scrollTop = 0
  }, [pane.resetOn])

  const claim = useCallback((slug: string) => {
    setClaimed((was) => (was.includes(slug) ? was : [...was, slug]))
    return () => {
      setClaimed((was) => was.filter((one) => one !== slug))
    }
  }, [])

  const hold = useCallback((slug: string, node: HTMLElement | null) => {
    setNodes((was) => (was[slug] === node ? was : { ...was, [slug]: node }))
  }, [])

  const shapePane = useCallback((shape: PaneShape) => {
    setPane(shape)
    return () => {
      setPane({})
    }
  }, [])

  const slots = useMemo(
    () => ({ claim, nodes, shapePane }),
    [claim, nodes, shapePane],
  )

  return (
    <Slots.Provider value={slots}>
      <AppShell
        triggerTestId="rail-trigger"
        collapsedKey="case-rail"
        paneKey={section}
        paneRef={paneRef}
        {...(pane.className === undefined ? {} : { paneClassName: pane.className })}
        rail={
          <Rail
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
                <SidebarMenu>
                  {group.rows.map((row) => (
                    <Row
                      key={row.slug}
                      row={row}
                      section={section}
                      fragment={fragment}
                      counts={counts}
                      hrefFor={hrefFor}
                      claimed={claimed.includes(row.slug)}
                      hold={hold}
                    />
                  ))}
                </SidebarMenu>
              </RailGroup>
            ))}
          </Rail>
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
 *
 * A row a screen has claimed is drawn by that screen instead: the item is
 * still the frame's, so the rows sit in the same list as every other, and what
 * goes in it is the only part the frame does not know.
 */
function Row({
  row,
  section,
  fragment,
  counts,
  hrefFor,
  claimed,
  hold,
}: {
  row: RailRowSpec
  section: string
  fragment: string | undefined
  counts: Readonly<Record<string, number>> | undefined
  hrefFor: (slug: string) => string
  claimed: boolean
  hold: (slug: string, node: HTMLElement | null) => void
}) {
  // Stable, because a fresh ref callback is detached and re-attached on every
  // render -- and each detach reports `null`, which is a state change, which is
  // another render.
  const attach = useCallback(
    (node: HTMLElement | null) => {
      hold(row.slug, node)
    },
    [hold, row.slug],
  )

  // Persisted per parent, exactly as the report's sub-rail is, and open by
  // default: standing on a child with its parent folded shut hides the row
  // that is current.
  const [folded, toggleFolded] = usePersistedFlag(`case-rail-fold-${row.slug}`, false)

  const identity = SECTIONS[row.slug]
  if (identity === undefined) return null

  // Only a row that declares a sub-rail may be given away. Without this, a
  // screen naming any slug takes that section off the rail wherever it is
  // drawn, and a row that is simply absent is what a rail cannot show.
  if (claimed && row.hasSubrail === true) {
    return (
      <SidebarMenuItem
        data-slot="rail-row-slot"
        data-testid={`rail-slot-${row.slug}`}
        ref={attach}
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
        <RailRow
          icon={identity.icon}
          label={identity.title}
          to={hrefFor(row.slug)}
          active={row.slug === section}
          alsoActive={holdsSection}
          reserveRight={row.hasSubrail === true}
          {...(count === undefined
            ? {}
            : { count, countLabel: `${String(count)} in ${identity.title}` })}
        />
      ) : (
        // Folded the same way the report's sub-rail is, because they are one
        // idea: a row reached through another. The registry declares these and
        // a screen claims that one, which is the only difference an analyst
        // must never see.
        <div className="relative flex items-center">
          <div className="min-w-0 flex-1">
            <RailRow
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
          <RailFold
            open={!folded}
            title={identity.title}
            slug={row.slug}
            onToggle={toggleFolded}
          />
        </div>
      )}
      {folded
        ? null
        : children.map((slug) => {
        const child = SECTIONS[slug]
        if (child === undefined) return null
        const childCount = counts?.[slug]
        return (
          <RailRow
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

export interface ClaimedRailRow {
  /** Where to draw the row, or `null` outside a frame and before one exists. */
  node: HTMLElement | null
  /** The glyph the frame would have drawn on the row. */
  icon: SectionIdentity['icon'] | undefined
  /** What the frame would have called the row. */
  title: string
}

/**
 * The rail row a screen draws for its own section, and the identity the frame
 * would have drawn there.
 *
 * Claims the row while the screen is mounted and hands back the element to
 * draw into, which is `null` until the frame has one and outside a frame
 * altogether. The icon and title come from the section registry, so a screen
 * drawing its own row still shows the row every other section shows.
 */
export function useCaseRailRow(slug: string): ClaimedRailRow {
  const slots = useContext(Slots)
  const claim = slots?.claim

  useLayoutEffect(() => {
    if (claim === undefined) return
    return claim(slug)
  }, [claim, slug])

  const identity = SECTIONS[slug]
  return {
    node: slots?.nodes[slug] ?? null,
    icon: identity?.icon,
    title: identity?.title ?? slug,
  }
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
  const { className, resetOn } = shape

  useLayoutEffect(() => {
    if (shapePane === undefined) return
    return shapePane({ className, resetOn })
  }, [shapePane, className, resetOn])
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
  others: readonly { id: string; reference?: string | null | undefined }[],
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
              textValue={one.reference ?? one.id}
              onAction={() => {
                go(`/cases/${encodeURIComponent(one.id)}/${ENTRY_SLUG}`)
              }}
            >
              {one.reference ?? one.id}
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
