import { List, Maximize2, Network, ZoomIn, ZoomOut } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ENTITY_TARGETS, sectionPathFor, targetOf } from '@/api/entityTargets'
import type { Case } from '@/api/model'
import { EmptyState } from '@/components/blocks/empty-state'
import { Chip, FilterBar, FilterGroup } from '@/components/blocks/filter-bar'
import { Section } from '@/components/blocks/section'
import { Button, ButtonLink } from '@/components/ui/button'
import { Link } from '@/components/ui/link'

import { timelinePath } from '@/components/blocks/case-paths'
import { IncidentCanvas, type CanvasViewport } from '@/components/blocks/incident-canvas'
import {
  bundleThroughJunctions,
  buildIncidentGraph,
  type IncidentNode,
} from '@/components/blocks/incident-graph'
import { KIND_LABEL } from '@/components/blocks/graph-kinds'
import { buildGraphMenu } from '@/components/blocks/graph-menu'
import type { Specs } from '@/api/specs'

/** The five kinds of entity a case names, which the chips narrow by. */
export type EntityKind = 'system' | 'account' | 'network' | 'malware' | 'cloud_app'

/**
 * What the case names, and what names it: every kind of event the timeline
 * holds, joined to the assets, accounts, indicators, malware and cloud apps it
 * reaches.
 */
export interface InvestigationGraphScreenProps {
  kase: Case | undefined
  /** The served form, which the model reads a reference's target from. */
  specs: Specs | undefined
  /** Kinds left out of the drawing. */
  hidden?: readonly EntityKind[]
  /** Open on the list rather than the drawing. */
  listing?: boolean
  /** The node the drawing opens selected, by id. */
  selected?: string
  /** Where the time cursor opens, in minutes from the incident's start. */
  upToMinutes?: number
  /**
   * The case is still being read.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

const KINDS: readonly EntityKind[] = ['system', 'account', 'network', 'malware', 'cloud_app']

/** One press of a zoom control. The floor, the ceiling and the box are the
 *  drawing's own: cytoscape clamps and centres them. */
const ZOOM_STEP = 1.2

/** The fill each kind of node takes. An event is a ring rather than a disc. */
export function InvestigationGraphScreen({
  kase,
  specs,
  hidden: initialHidden = [],
  listing: initialListing = false,
  selected,
  upToMinutes,
  busy = false,
  problem,
  onRetry,
}: InvestigationGraphScreenProps) {
  const [hidden, setHidden] = useState<ReadonlySet<EntityKind>>(new Set(initialHidden))
  const [listing, setListing] = useState(initialListing)
  const [picked, setPicked] = useState<string | undefined>(selected)
  /** Groups the analyst has separated into their members. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** Only the entities more than one kind of event names. */
  const [sharedOnly, setSharedOnly] = useState(false)
  /** What the pointer is over. At a zoom where labels are hidden this is the
   *  only thing that says what a dot is. */
  const [hovered, setHovered] = useState<IncidentNode | null>(null)
  /** The drawing's own viewport, published once cytoscape has mounted. */
  const [viewport, setViewport] = useState<CanvasViewport | null>(null)
  /**
   * How far through the incident the drawing is shown, in minutes from its
   * start. `null` is all of it, which is where it rests.
   */
  const [minutes, setMinutes] = useState<number | null>(upToMinutes ?? null)

  // The whole case, before the chips have had their say: the counts on the
  // chips are of what the case holds, not of what is drawn.
  const whole = useMemo(
    () =>
      kase && specs
        ? buildIncidentGraph(kase, specs, { expanded })
        : { nodes: [], links: [], disconnected: [] },
    [kase, specs, expanded],
  )

  /**
   * What the chips leave.
   */
  const figure = useMemo(() => {
    const keep = whole.nodes.filter(
      (node) =>
        node.kind === 'event' ||
        (!hidden.has(node.kind as EntityKind) && (!sharedOnly || node.bridge)),
    )
    const ids = new Set(keep.map((node) => node.id))
    const bundled = bundleThroughJunctions(
      keep,
      whole.links.filter((link) => ids.has(link.src) && ids.has(link.dst)),
    )
    return { ...whole, nodes: bundled.nodes, links: bundled.links }
  }, [whole, hidden, sharedOnly])

  const entities = figure.nodes.filter((node) => node.kind !== 'event' && node.kind !== 'junction')
  /** The readout's own number: one node per kind of event, which is the fold. */
  const eventKinds = figure.nodes.filter((node) => node.kind === 'event').length
  // **By the entity as well as by the drawn node.** A caller has an entity's
  // id -- from a link, from the rail, from the URL -- and the drawing may have
  // folded that entity in with its siblings under an id nothing outside can
  // know.
  const open =
    picked === undefined
      ? undefined
      : figure.nodes.find((node) => node.id === picked || node.paintedBy?.id === picked)
  /** The incident's own extent, from the moment each node was first seen. */
  const span = useMemo(() => {
    const moments = whole.nodes.map((node) => node.seen).filter((at) => at > 0)
    return moments.length === 0 ? null : { from: Math.min(...moments), to: Math.max(...moments) }
  }, [whole])
  const cursor = span === null || minutes === null ? null : span.from + minutes * 60
  /** What the readout names: the pointer first, then the selection. */
  const naming = hovered ?? open ?? null
  /** Every entity drawn, counting the records folded inside a node. */
  const drawn = entities.reduce((total, node) => total + node.count, 0)
  /**
   * Where each kind of entity is edited. Only the kinds the drawing paints:
   * evidence and methods are not entities here, so neither earns a door.
   */
  const screenFor = new Map(
    KINDS.flatMap((kind) => {
      const target = ENTITY_TARGETS[kind]
      return target ? [[kind, { slug: target.slug, title: target.title }] as const] : []
    }),
  )
  const menuFor = (node: IncidentNode | null) =>
    buildGraphMenu(node, {
      expanded,
      hidden,
      screenFor,
      hrefFor: (kind, entityId) => (kase ? sectionPathFor(kase.id, kind, entityId) : undefined),
      toggleGroup: (key) => {
        setExpanded((was) => {
          const next = new Set(was)
          if (!next.delete(key)) next.add(key)
          return next
        })
        setPicked(undefined)
      },
      hideKind: (kind) => {
        setHidden((was) => new Set(was).add(kind as EntityKind))
      },
      refold: () => {
        setExpanded(new Set())
        setPicked(undefined)
      },
      showEveryKind: () => {
        setHidden(new Set())
        setSharedOnly(false)
      },
    })
  const zoomBy = (factor: number) => {
    viewport?.zoomBy(factor)
  }

  const countOf = (kind: EntityKind) =>
    whole.nodes.reduce((total, node) => (node.kind === kind ? total + node.count : total), 0)

  return (
    <Section
      title="Investigation graph"
      fills
      toolbar={
        <FilterBar label="Narrow the graph">
          <FilterGroup label="Kinds" first>
            {KINDS.map((kind) => (
              <Chip
                key={kind}
                label={KIND_LABEL[kind] ?? kind}
                count={countOf(kind)}
                pressed={!hidden.has(kind)}
                onToggle={() => {
                  setHidden((was) => {
                    const next = new Set(was)
                    if (!next.delete(kind)) next.add(kind)
                    return next
                  })
                }}
              />
            ))}
          </FilterGroup>
          {/* A different question from the kinds: not *what is this* but *what
              did more than one kind of event touch*, which is where a campaign
              joins up. */}
          <FilterGroup label="Reach">
            <Chip
              label="In several events"
              count={whole.nodes.filter((node) => node.bridge).length}
              pressed={sharedOnly}
              onToggle={() => {
                setSharedOnly(!sharedOnly)
              }}
            />
          </FilterGroup>
        </FilterBar>
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      {listing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              data-testid="node-list-toggle"
              onPress={() => {
                setListing(false)
              }}
            >
              <Network aria-hidden />
              Back to the graph
            </Button>
            <p className="text-xs text-ink-muted">
              {figure.disconnected.length === 0
                ? 'Every entity in this case is named by an entry.'
                : `${String(figure.disconnected.length)} entities no entry names.`}
            </p>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-sm border border-border p-2">
            {[...entities]
              .sort((left, right) => left.label.localeCompare(right.label))
              .map((node) => (
                <li key={node.id} className="flex items-baseline gap-2 px-2 py-1">
                  <span className="truncate font-mono text-data">{node.label}</span>
                  <span className="text-2xs text-ink-muted">
                    {KIND_LABEL[node.kind] ?? node.kind}
                  </span>
                </li>
              ))}
            {figure.disconnected.map((node) => (
              // **Set back at three quarters, not three fifths.** The row dims
              // as a whole so it reads as put aside, and the kind inside it
              // stays the muted token so the row keeps the same two-step shape
              // as a connected one. At 60% the pair compounded and the kind
              // read 2.53:1; taking the token off the kind instead fixed the
              // number and cost the shape -- in dark it made a set-aside row's
              // kind *brighter* than a connected row's, 7.14 against 6.44.
              <li key={node.id} className="flex items-baseline gap-2 px-2 py-1 opacity-75">
                <span className="truncate font-mono text-data">{node.label}</span>
                <span className="text-2xs text-ink-muted">
                  {`${KIND_LABEL[node.kind] ?? node.kind} \u00b7 in no entry`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : specs ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <IncidentCanvas
            toolbar={
              <>
                <div className="flex min-w-0 items-center gap-2 rounded-sm border border-border bg-card px-2 py-1">
                  <p className="w-72 max-w-full min-w-0 truncate text-xs text-ink-muted">
                    {naming
                      ? [
                          naming.count > 1
                            ? `${naming.members[0] ?? ''} and ${String(naming.count - 1)} more`
                            : naming.label,
                          naming.kind === 'event'
                            ? naming.severity || 'event'
                            : (KIND_LABEL[naming.kind] ?? naming.kind).toLowerCase(),
                        ].join(' \u00b7 ')
                      : `${String(eventKinds)} kinds of event over ${String(drawn)} entities`}
                  </p>
                  {/* **The way to the record the dot stands for.** The drawing
                    answers what is connected to what and nothing else; the
                    fields, the verdict and the edit are on the entity's own
                    screen, and the node is where an analyst is standing when
                    they want them. An event node opens nothing: it is a fold
                    over entries rather than a row anywhere. */}
                  {kase && <NodeDoor caseId={kase.id} node={open} />}
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="node-list-toggle"
                    onPress={() => {
                      setListing(true)
                    }}
                  >
                    <List aria-hidden />
                    {`Nodes (${String(entities.length)})`}
                  </Button>
                </div>
                {/* Its own cluster, and the last thing on the row: it acts on the
                  viewport rather than on the case. */}
                <div className="flex items-center gap-1 rounded-sm border border-border bg-card px-1 py-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom out"
                    onPress={() => {
                      zoomBy(1 / ZOOM_STEP)
                    }}
                  >
                    <ZoomOut aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom in"
                    onPress={() => {
                      zoomBy(ZOOM_STEP)
                    }}
                  >
                    <ZoomIn aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fit to the pane"
                    onPress={() => {
                      viewport?.fitToPane()
                    }}
                  >
                    <Maximize2 aria-hidden />
                  </Button>
                </div>
              </>
            }
            status={
              figure.disconnected.length > 0 ? (
                // A count the analyst cannot act on is a dashboard. The list is
                // the only surface that can show these at all - the drawing has
                // nowhere to put an entity no entry names.
                <Button
                  variant="ghost"
                  size="xs"
                  onPress={() => {
                    setListing(true)
                  }}
                >
                  {`${String(figure.disconnected.length)} recorded, in no entry`}
                </Button>
              ) : undefined
            }
            overlay={
              figure.nodes.length === 0 ? (
                <EmptyState
                  icon={Network}
                  title="Nothing to show yet"
                  detail="Record a timeline entry naming an asset, account, indicator, malware or evidence to build the investigation graph."
                  action={
                    kase ? (
                      <ButtonLink variant="outline" href={timelinePath(kase.id)}>
                        Open the Timeline
                      </ButtonLink>
                    ) : undefined
                  }
                />
              ) : undefined
            }
            graph={figure}
            specs={specs}
            expanded={expanded}
            onToggleGroup={(id) => {
              setExpanded((was) => {
                const next = new Set(was)
                if (!next.delete(id)) next.add(id)
                return next
              })
            }}
            onSelect={(node) => {
              setPicked((was) => (was === node?.id ? undefined : node?.id))
            }}
            picked={open ?? null}
            cursor={cursor}
            onHover={setHovered}
            menuFor={menuFor}
            onCursor={(at) => {
              setMinutes(at === null || span === null ? null : (at - span.from) / 60)
            }}
            onViewport={setViewport}
          />
        </div>
      ) : null}
    </Section>
  )
}

/**
 * The way from a node to the record it stands for, or nothing.
 */
function NodeDoor({ caseId, node }: { caseId: string; node: IncidentNode | undefined }) {
  // **The entity behind the node, never the node's own id.** A drawn node can
  // be a fold over several entities or a junction, and its id is the fold's;
  // `paintedBy` is the one record a door can open.
  const entity = node?.paintedBy
  if (node === undefined || node.kind === 'event' || entity == null) return null
  const href = sectionPathFor(caseId, entity.kind, entity.id)
  const title = targetOf(entity.kind)?.title
  if (href === undefined || title === undefined) return null
  return (
    <Link variant="default" standalone className="shrink-0 text-xs whitespace-nowrap" href={href}>
      {`Open in ${title}`}
    </Link>
  )
}
