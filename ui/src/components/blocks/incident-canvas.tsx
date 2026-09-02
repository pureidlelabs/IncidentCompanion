import { SkipForward } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Types only: cytoscape itself is loaded lazily, and a value import here
// would pull the whole engine into this module's own chunk.
import type { Core, EdgeSingular, LayoutOptions, NodeSingular } from 'cytoscape'

import type { Specs } from '@/api/specs'

import { Button } from '@/components/ui/button'
import { Disclosure, DisclosureHeader, DisclosurePanel } from '@/components/ui/disclosure'
import { PointerContextMenu, type PointerAt } from '@/components/ui/context-menu'
import { Dialog } from '@/components/ui/dialog'
import { OverlayAnchor } from '@/components/ui/overlay-anchor'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { Menu } from '@/components/ui/menu'
import { EntityHoverCard } from '@/components/blocks/entity-card'
import { RowMenuItems, type RowMenuGroup } from '@/components/blocks/row-menu'
import { GraphCanvas, type GraphViewport } from '@/components/ui/graph-canvas'
import { Transport } from './transport'
import { cn } from '@/lib/cn'
import { tokenColour } from '@/lib/tokenColour'

import { heldBackAt, type IncidentGraph, type IncidentNode } from './incident-graph'
import { KIND_LABEL } from './graph-kinds'
import { SEVERITY_TONE, toneOf, type Tone } from './graph-tones'

/**
 * The incident graph, drawn by Cytoscape.
 *
 * **Cytoscape rather than more hand-rolled SVG.** The component policy prefers
 * a library to code this project has to maintain, and the layout is the part
 * that was never going to be good hand-rolled: `fcose` settles this case into
 * something readable where the ring collided at 25 labels. MIT, bundled, no
 * CDN - 134 kB gzipped, behind the dynamic import below so it stays out of the
 * app's main chunk.
 *
 * **It draws to `<canvas>`, so nothing in the DOM describes the picture.** Two
 * consequences, both deliberate: `visual-check`'s probes see one opaque
 * element and a graph-specific probe in `e2e/` asks Cytoscape instead; and the
 * drawing has no accessible tree at all, which is what the Nodes list beside
 * it exists to answer.
 *
 * **Colours are read off the document, not written here.** `--severity-*` is
 * resolved from the container at paint time and pushed into the style, so the
 * ground switcher repaints the graph with the analyst's own theme rather than
 * a second palette living in this file.
 */

const TONE_TOKEN: Record<Tone, string> = {
  bad: '--severity-critical',
  warn: '--severity-medium',
  good: '--severity-low',
  info: '--severity-info',
  none: '--severity-none',
}

export interface IncidentCanvasProps {
  graph: IncidentGraph
  specs: Specs
  /** Group keys the analyst has pulled apart. */
  expanded: ReadonlySet<string>
  onToggleGroup: (groupKey: string) => void
  onSelect: (node: IncidentNode | null) => void
  /** What the pointer is over, so the strip can name it.
   *
   *  **Not a hover card.** Hover already means "isolate what this touches",
   *  and a card floating over a graph covers the thing being pointed at - the
   *  reason the selection panel is docked. This answers the question a card
   *  would ("what is this dot") in the strip that is already there, and costs
   *  the drawing nothing. */
  onHover?: (node: IncidentNode | null) => void
  /** What the analyst last clicked, drawn as a panel inside the pane. */
  picked: IncidentNode | null
  /** Playback: everything first seen after this moment is dimmed. `null` shows
   *  the whole incident. */
  cursor: number | null
  /** Moves the cursor. Without it the transport is not drawn. */
  onCursor?: ((at: number | null) => void) | undefined
  /** Top right, floating over the drawing: zoom, fit, what is shown. */
  toolbar?: ReactNode | undefined
  /** Bottom right: a node count, a scale, what is selected. */
  status?: ReactNode | undefined
  /**
   * The whole surface, over the drawing.
   *
   * For a state the drawing cannot show while it is drawing -- an empty case,
   * a layout still running, a refusal.
   */
  overlay?: ReactNode | undefined
  /** Utilities for where the pane sits. */
  className?: string | undefined
  /**
   * Handed the viewport's controls once cytoscape is mounted.
   *
   * The frame owns the toolbar, so zoom and fit are pressed from outside this
   * block. Called again with `null` when the canvas goes.
   */
  onViewport?: ((controls: CanvasViewport | null) => void) | undefined
  /**
   * Right-click items for the node under the pointer, or for bare canvas when
   * it is `null`. The canvas appends its own viewport group.
   *
   * **Additive only** - every item must also be reachable from a visible
   * control (`context-menu.tsx` carries the reason). That is why there is no
   * "isolate this" item: isolation is a hover effect, and a hover is not a
   * door.
   */
  menuFor?: (node: IncidentNode | null) => RowMenuGroup[]
  children?: ReactNode
}

/**
 * The right-click's reach, wider than the pointer's.
 *
 * `HOVER_REACH` is tuned for something that fires continuously and must not
 * grab a node the pointer is merely passing. A right-click is deliberate and
 * costs a menu the analyst then has to dismiss, so missing by 30px should still
 * mean the node they aimed at rather than opening the bare-canvas menu.
 */
const MENU_REACH = 34

/**
 * The nearest real node to a rendered point, or `null` past `reach`.
 *
 * Cytoscape hit-tests the drawn shape, and at the zoom this pane fits at that
 * is a 9-16px circle with the label not a target at all - so both hover and the
 * right-click menu would only fire on a dead-centre landing, which is nobody's
 * aim. Junctions are skipped: they are a drawing device, and neither isolating
 * nor offering a menu on a routing dot means anything.
 */
function nearestNode(cy: Core, at: { x: number; y: number }, reach: number): NodeSingular | null {
  let best: NodeSingular | null = null
  let bestGap = reach
  cy.nodes().forEach((node) => {
    if (Number(node.data('junction')) === 1) return
    const p = node.renderedPosition()
    const gap = Math.hypot(p.x - at.x, p.y - at.y) - node.renderedWidth() / 2
    if (gap < bestGap) {
      bestGap = gap
      best = node
    }
  })
  return best
}

/**
 * Pull each junction onto the line from its hub toward the middle of its fan.
 *
 * A layout engine treats it as an ordinary node and puts it in the middle of
 * everything it touches, which draws a star with an extra dot in it. Near the
 * hub instead, the edges leave as one stem and open late - the shape the fan is
 * for.
 */
function placeJunctions(cy: Core): void {
  cy.nodes()
    .filter((node) => Number(node.data('junction')) === 1)
    .forEach((junction) => {
      const near = junction.neighborhood('node').nodes()
      const hub = near.max((n) => n.degree(false)).ele
      // cytoscape types `.max().ele` as always present; on an empty collection
      // it is undefined at runtime. The guard stays because the types are
      // optimistic, not because the check is redundant.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!hub) return
      const fan = near.difference(hub)
      if (fan.empty()) return
      let x = 0
      let y = 0
      fan.nodes().forEach((n) => {
        x += n.position('x')
        y += n.position('y')
      })
      const at = hub.position()
      junction.position({
        x: at.x + (x / fan.length - at.x) * 0.28,
        y: at.y + (y / fan.length - at.y) * 0.28,
      })
    })
}

/** What the frame's toolbar presses. The kit's box publishes it. */
export type CanvasViewport = GraphViewport

/** The element cytoscape was mounted into, for the measurements that need a box. */
function hostOf(core: Core): HTMLDivElement {
  return core.container() as HTMLDivElement
}

export function IncidentCanvas({
  graph,
  specs,
  expanded,
  onToggleGroup,
  onSelect,
  picked,
  cursor,
  onCursor,
  onViewport,
  toolbar,
  status,
  overlay,
  className,
  onHover,
  menuFor,
  children,
}: IncidentCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const core = useRef<Core | null>(null)
  // Held in a ref as well: the effect that wires events runs once, and reading
  // the prop from its closure would keep calling the first render's callback.
  const toggle = useRef(onToggleGroup)
  const select = useRef(onSelect)
  const hover = useRef(onHover)
  // **Written in an effect, not during render.** The latest-ref idiom is
  // usually spelled as a bare assignment in the body; that is a write during
  // render, which `react-hooks/refs` refuses and which is unsafe under
  // concurrent rendering, where a render can be thrown away after the write.
  // The wiring effect below only ever reads these from a cytoscape callback,
  // which runs long after commit, so an effect is early enough.
  useEffect(() => {
    toggle.current = onToggleGroup
    select.current = onSelect
    hover.current = onHover
  })
  /**
   * Where every node this canvas has ever drawn was left standing.
   *
   * Snapshotting only what is *currently* on the canvas meant a node that had
   * been filtered out came back as an arrival and was placed in a ring around
   * its neighbour - so switching a kind off and on again rearranged that whole
   * kind. Remembered across renders, a returning node goes back where the
   * analyst last saw it.
   */
  const placed = useRef(new Map<string, { x: number; y: number }>())
  /**
   * Where the hovered node is on screen, so the app's own entity card has
   * something to open against.
   *
   * The card is `components/ui/entity-card` - the same one every entity name
   * in the app carries, verdict badge, reference count, fields and the way to
   * its section. A canvas has no element per node, so an empty anchor is
   * placed over the node and the card is opened from here rather than by the
   * trigger's own pointer. The anchor takes no pointer events: it sits on top
   * of the drawing, and swallowing the click would break selection and drag.
   *
   * **Opened by a click, not by hovering.** On dwell it covered the drawing
   * every time the pointer rested, and it said what the docked panel already
   * said on click - two surfaces for one job. Hover now names the node in the
   * strip, which occludes nothing; the card is the click, and it stays until
   * something else is chosen.
   */
  const [anchor, setAnchor] = useState<{
    nodeId: string
    /** Set for a node standing for one entity - the app's card. Absent for a
     *  fold or an event, which open the members panel at the same spot. */
    entity?: { id: string; target: string; name: string }
    x: number
    y: number
    size: number
  } | null>(null)
  const [failed, setFailed] = useState(false)
  /** What the last right-click landed on, `null` for bare canvas. */
  const [menuNode, setMenuNode] = useState<IncidentNode | null>(null)
  // Where the menu opens. The kit's context menu takes the pointer rather than
  // an element: cytoscape owns the host's children, so there is no node of
  // ours for a trigger to wrap.
  const [menuAt, setMenuAt] = useState<PointerAt | null>(null)
  // Cytoscape arrives asynchronously, so the effect that fills the graph runs
  // first, finds no core and returns. Without this flag to depend on, nothing
  // ever runs it again and the canvas stays blank under a correct frame.
  const [ready, setReady] = useState(false)

  /**
   * Everything the drawing answers with, wired once the engine arrives.
   *
   * `GraphCanvas` owns the mount, the layout and the fit; this owns what a
   * hover, a tap and a drag mean here, which is the half that knows about
   * events and entities.
   */
  useEffect(() => {
    const cy = core.current
    if (cy === null) return
    const HOVER_REACH = 26
    /**
     * A moment of stillness before anything dims.
     *
     * Isolation applied on every node the pointer passed, so sweeping the
     * graph strobed the whole drawing - dozens of dim/undim cycles a second.
     * Waiting for the pointer to settle means crossing the canvas changes
     * nothing, and the fade below turns the change that does happen into a
     * transition rather than a jump.
     */
    const SETTLE_MS = 110
    let settling = 0
    let over: string | null = null
    /** Dragging moves the node under the pointer, so the proximity test
     *  re-fired on every frame and the drawing flipped between isolated and
     *  whole while a node was being placed. */
    let grabbing = false
    cy.on('grab', () => {
      grabbing = true
      window.clearTimeout(settling)
    })
    cy.on('free', () => {
      grabbing = false
    })
    cy.on('mousemove', (event) => {
      if (grabbing) return
      const found = nearestNode(cy, event.renderedPosition, HOVER_REACH)
      const id = found?.id() ?? null
      if (id === over) return
      over = id
      window.clearTimeout(settling)
      if (!found) {
        cy.elements().removeClass('faded')
        hover.current?.(null)
        return
      }
      const data = (found.data('node') as IncidentNode | undefined) ?? null
      settling = window.setTimeout(() => {
        // Stepped through the junctions: `closedNeighborhood()` stops at the
        // dot, so with bundling on a hub lit its stems and nothing else - the
        // isolation quietly stopped meaning "what this touches".
        let near = found.closedNeighborhood()
        for (let hop = 0; hop < 2; hop += 1) {
          const dots = near.nodes().filter((n) => Number(n.data('junction')) === 1)
          if (dots.empty()) break
          near = near.union(dots.closedNeighborhood())
        }
        cy.elements().addClass('faded')
        near.removeClass('faded')
        hover.current?.(data)
      }, SETTLE_MS)
      // One entity, and an entity rather than an event: a folded puck stands
      // for several records and has no single card to show, which is what
      // the selection panel is for.
    })
    cy.on('mouseout', () => {
      over = null
      window.clearTimeout(settling)
      cy.elements().removeClass('faded')
      hover.current?.(null)
      // The card is not closed here: it belongs to the click, and taking it
      // away when the pointer wanders off makes it unreadable - the whole
      // reason it moved off hover.
    })
    // The card would otherwise hang over the drawing while it moves under it.
    // Follows rather than closes: a card opened by a click is a thing the
    // analyst is reading, and panning away from it should move it, not take
    // it away.
    cy.on('pan zoom drag position', () => {
      setAnchor((current) => {
        if (!current) return current
        const node = cy.getElementById(current.nodeId)
        if (node.empty()) return null
        const seat = node.renderedPosition()
        return { ...current, x: seat.x, y: seat.y, size: node.renderedWidth() }
      })
    })

    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular
      if (Number(node.data('junction')) === 1) return
      const data = (node.data('node') as IncidentNode | undefined) ?? null
      // One entity gets the app's own card, anchored where it was clicked.
      // A fold stands for several records and an event is not an entity at
      // all, so those get the docked panel with their members and controls.
      if (data?.entityId && data.count === 1 && data.kind !== 'event') {
        const seat = node.renderedPosition()
        setAnchor({
          nodeId: node.id(),
          entity: { id: data.entityId, target: data.kind, name: data.members[0] ?? '' },
          x: seat.x,
          y: seat.y,
          size: node.renderedWidth(),
        })
        select.current(null)
        return
      }
      const spot = node.renderedPosition()
      setAnchor({
        nodeId: node.id(),
        x: spot.x,
        y: spot.y,
        size: node.renderedWidth(),
      })
      select.current(data)
    })
    cy.on('tap', (event) => {
      if (event.target !== cy) return
      select.current(null)
      setAnchor(null)
    })
    cy.on('dbltap', 'node', (event) => {
      const node = event.target as NodeSingular
      const data = node.data('node') as IncidentNode | undefined
      if (data && data.members.length > 1) toggle.current(data.groupKey)
    })
  }, [ready])

  // Elements and paint. Re-runs on every fold, filter or theme change; the
  // layout only runs when the element set actually changed, or an unfold would
  // rearrange the whole drawing and lose the analyst's place.
  useEffect(() => {
    const cy = core.current
    const container = host.current
    if (!cy || !container) return

    const read = (token: string): string => tokenColour(container, token)

    const paint = (node: IncidentNode): string => {
      if (node.kind === 'event') {
        return read(TONE_TOKEN[SEVERITY_TONE[node.severity] ?? 'none'])
      }
      const from = node.paintedBy
      return read(TONE_TOKEN[from ? toneOf(specs, from.dangerField, from.danger) : 'none'])
    }

    for (const node of cy.nodes()) placed.current.set(node.id(), { ...node.position() })
    const held = placed.current
    cy.elements().remove()
    cy.add([
      ...graph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          node,
          junction: node.kind === 'junction' ? 1 : 0,
          count: node.count,
          isEvent: node.kind === 'event' ? 1 : 0,
          bridge: node.bridge ? 1 : 0,
          entry: node.entry ? 1 : 0,
          unnarrated: node.unnarrated ? 1 : 0,
          seen: node.seen,
          colour: paint(node),
        },
      })),
      ...graph.links.map((link, index) => ({
        data: {
          id: `l${String(index)}`,
          source: link.src,
          target: link.dst,
          seen: link.seen,
          unnarrated: link.unnarrated ? 1 : 0,
        },
      })),
    ])

    cy.style()
      .resetToDefault()
      .selector('node')
      .style({
        'background-color': 'data(colour)',
        'border-color': read('--card'),
        'border-width': 2,
        width: (n: NodeSingular) => 16 + Math.min(24, Math.sqrt(Math.max(1, n.degree(false))) * 5),
        height: (n: NodeSingular) => 16 + Math.min(24, Math.sqrt(Math.max(1, n.degree(false))) * 5),
        label: 'data(label)',
        color: read('--ink-muted'),
        // Mono for an identifier, sans for a sentence - the app's split, and
        // the reason `--text-data` exists. A hostname, a filename, an address
        // and an account name are all strings an analyst selects and pastes;
        // an event's description is prose and reads worse in a code face.
        'font-family':
          getComputedStyle(container).getPropertyValue('--font-mono') ||
          'ui-monospace, SFMono-Regular, Menlo, monospace',
        'font-size': 10,
        'text-halign': 'center',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-max-width': '130px',
        'text-wrap': 'ellipsis',
        'min-zoomed-font-size': 5,
        // Cytoscape animates a style change only if the property is named
        // here; without it every isolation is an instant repaint.
        'transition-property': 'opacity',
        'transition-duration': 120,
      })
      // An event is the hub here, so it is the heavier thing: a ring in its
      // severity rather than a filled disc.
      // The dot a bundle splits at. Not a thing in the case: no label, no
      // events, and the isolation below steps straight through it.
      .selector('node[junction = 1]')
      .style({
        width: 6,
        height: 6,
        'background-color': read('--ink-muted'),
        'border-width': 0,
        label: '',
        // No `events: 'no'`: that stops it being a hover or click target and
        // stops it being draggable in the same breath. Hover skips it by
        // checking the flag, and so does tap, which leaves the fan nudgeable.
      })
      .selector('node[isEvent = 1]')
      .style({
        'font-family':
          getComputedStyle(container).getPropertyValue('--font-sans') ||
          'ui-sans-serif, system-ui, sans-serif',
        'background-color': read('--card'),
        'border-width': 4,
        'border-color': 'data(colour)',
      })
      // A folded group: the disc plus the pile showing behind it.
      .selector('node[count > 1]')
      .style({
        'underlay-color': read('--ink-muted'),
        'underlay-opacity': 0.4,
        'underlay-padding': 8,
        // Cytoscape's underlay defaults to a round-rectangle, which draws a
        // grey box behind a circular node instead of the disc the stack is
        // meant to be.
        'underlay-shape': 'ellipse',
        'outline-width': 2,
        'outline-color': read('--card'),
        'outline-offset': 3,
      })
      // What joins two kinds of event, and never folded.
      .selector('node[bridge = 1]')
      .style({ 'border-width': 3, 'border-color': read('--ink') })
      // Recorded, and no entry accounts for it. A dashed edge and a hollow
      // node, never a danger colour: a missing classification is work, not a
      // fault, and painting it red would state a verdict nobody reached.
      .selector('node[unnarrated = 1]')
      .style({
        'background-opacity': 0.25,
        'border-width': 2,
        'border-style': 'dashed',
        'border-color': read('--ink-muted'),
      })
      .selector('edge[unnarrated = 1]')
      .style({ 'line-style': 'dashed', opacity: 0.5 })
      .selector('node[entry = 1]')
      .style({ 'border-width': 5, 'border-color': read('--ring') })
      .selector('edge')
      .style({
        width: 1.1,
        'line-color': read('--ink-muted'),
        opacity: 0.4,
        'transition-property': 'opacity',
        'transition-duration': 120,
        'curve-style': 'unbundled-bezier',
        // Typed loosely on purpose: cytoscape's mapper signature widens the
        // argument to `SingularElementArgument`, which has no `position`.
        'control-point-distances': (edge: EdgeSingular) => {
          const ends = edge as unknown as {
            source: () => { position: () => { x: number; y: number } }
            target: () => { position: () => { x: number; y: number } }
          }
          const a = ends.source().position()
          const b = ends.target().position()
          const span = Math.max(80, Math.hypot(a.x - b.x, a.y - b.y))
          // Stable per edge, so a repaint never flips an arc to the other side
          // and read as the drawing having changed. Capped hard: a bow that
          // grows with the edge swings out of view and two nodes one hop apart
          // read as unconnected.
          const sign =
            edge
              .id()
              .split('')
              .reduce((t, c) => t + c.charCodeAt(0), 0) % 2
              ? 1
              : -1
          return String(Math.round(sign * Math.min(38, 10 + span * 0.07)))
        },
        'control-point-weights': '0.5',
      })
      // **Nothing grey over a node being moved.** cytoscape draws an
      // `overlay` on a grabbed node in its own neutral, a round-rectangle over
      // a disc -- a grey box on a drawing whose every other mark means
      // something.
      // The stack behind a fold says "there are more of these", which is a
      // resting state: while the node is held it is a grey disc on a field the
      // isolation has just emptied, and it reads as the drag itself.
      .selector('node:active')
      .style({ 'overlay-opacity': 0, 'underlay-opacity': 0 })
      .selector('edge:active')
      .style({ 'overlay-opacity': 0 })
      .selector('.unseen')
      .style({ opacity: 0.07, 'text-opacity': 0, 'underlay-opacity': 0, 'outline-opacity': 0 })
      .selector('.faded')
      .style({ opacity: 0.08, 'text-opacity': 0, 'underlay-opacity': 0, 'outline-opacity': 0 })
      .update()

    const arrivals = cy.nodes().filter((n) => !held.has(n.id()))
    if (held.size > 0 && arrivals.length < cy.nodes().length) {
      // Anything seen before goes back exactly where it was - whether it
      // survived this change or is returning from behind a filter - and only
      // genuinely new nodes are placed. A full relayout here rearranges the
      // drawing under the analyst for one click on a chip.
      cy.nodes().forEach((n) => {
        const at = held.get(n.id())
        if (at) n.position(at)
      })
      arrivals.forEach((n, index) => {
        const anchor = n
          .neighborhood('node')
          .filter((other) => held.has(other.id()))
          .first() as unknown as {
          nonempty: () => boolean
          position: () => { x: number; y: number }
        }
        const at = anchor.nonempty() ? anchor.position() : { x: 0, y: 0 }
        const angle = (index / Math.max(1, arrivals.length)) * Math.PI * 2
        n.position({ x: at.x + Math.cos(angle) * 90, y: at.y + Math.sin(angle) * 90 })
      })
      return
    }

    cy.resize()

    /**
     * One case, one picture - without giving up the layout fcose produces.
     *
     * `randomize: true` starts it from `Math.random`, so the drawing came out
     * different on every open: the defect the roadmap records for the
     * server-rendered graphs, where "a layout that moves for no reason is one
     * an analyst cannot learn or point at in a meeting".
     *
     * **Seeding the node positions instead and running `randomize: false` is
     * the obvious fix and it is worse than the problem** - handed a ring as a
     * starting point fcose settles into a clump, with the two largest events
     * overlapping. So the randomness is seeded rather than removed: `Math.random`
     * is swapped for a fixed-seed generator across the run and put straight
     * back. Same input, same arrangement, same quality of arrangement.
     */
    const realRandom = Math.random
    let seed = 0x6d2b79f5
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    cy.layout({
      name: 'fcose',
      quality: 'proof',
      randomize: true,
      animate: false,
      nodeSeparation: 220,
      idealEdgeLength: 190,
      nodeRepulsion: 26000,
      padding: 30,
    } as LayoutOptions).run()
    // Fits the pane, and is allowed to go below the zoom where Cytoscape stops
    // drawing labels. Holding a floor instead left the drawing larger than its
    // box with nothing saying it could be panned - legible and cut off is
    // worse than whole and quiet, and hovering names anything too small to read.
    Math.random = realRandom
    placeJunctions(cy)
    cy.fit(undefined, 30)
  }, [graph, specs, expanded, ready])

  // The pane is resizable - the rail folds, the window changes - and cytoscape
  // renders into a fixed-size canvas that knows nothing about either.
  useEffect(() => {
    const container = host.current
    if (!container || !ready) return
    const observer = new ResizeObserver(() => {
      const cy = core.current
      if (!cy) return
      cy.resize()
      placeJunctions(cy)
      cy.fit(undefined, 30)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [ready])

  // Escape closes the panel and the card. The primitive would have brought
  // this; a positioned panel has to say it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setAnchor(null)
      select.current(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  /** Playback dims rather than removes: the point is that nothing moves while
   *  it runs, so a node arriving cannot rearrange the drawing. */
  useEffect(() => {
    const cy = core.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().forEach((element) => {
        element.toggleClass('unseen', heldBackAt(Number(element.data('seen')), cursor))
      })
    })
  }, [cursor, graph, ready])

  // Forwarded, never rebuilt: the box the drawing sits in publishes the
  // viewport, and a second pair here would be two answers to "where is the
  // view" with nothing keeping them in step.
  const publish = useRef(onViewport)
  /** The published viewport, for this block's own menu item. */
  const view = useRef<GraphViewport | null>(null)
  useEffect(() => {
    publish.current = onViewport
  })

  /**
   * Which node the right-click meant, decided on the *capture* phase.
   *
   * Base UI opens the menu from the same `contextmenu` event on the bubble
   * phase, so resolving the subject here means the popup's first render already
   * has it - read after, and the menu opens once against the previous node.
   * Cytoscape's own `cxttap` was the obvious source and is not usable for this:
   * it fires from the library's internal dispatch, with no ordering guarantee
   * against the DOM event Base UI listens for.
   */
  const aimMenu = useCallback((event: React.MouseEvent<HTMLElement>): void => {
    event.preventDefault()
    const cy = core.current
    const box = host.current?.getBoundingClientRect()
    if (!cy || !box) {
      setMenuNode(null)
      setMenuAt(null)
      return
    }
    const found = nearestNode(
      cy,
      { x: event.clientX - box.left, y: event.clientY - box.top },
      MENU_REACH,
    )
    setMenuNode((found?.data('node') as IncidentNode | undefined) ?? null)
    setMenuAt({ x: event.clientX, y: event.clientY })
  }, [])

  /** The canvas's own items, appended to whatever the screen contributes: it
   *  owns the viewport, so nothing above it can offer these. Both mirror a
   *  button in the zoom cluster, which is what keeps the menu additive. */
  const viewGroup: RowMenuGroup = [
    {
      id: 'fit',
      label: 'Fit to the pane',
      slot: 'menu-fit',
      onSelect: () => {
        view.current?.fitToPane()
      },
    },
  ]
  // The rule sees `viewGroup` reaching a function and assumes a ref is read
  // during render. It is not: `fitToPane` is a menu item's `onSelect`, and it
  // touches `core.current` when the analyst picks it - an event handler.
  // eslint-disable-next-line react-hooks/refs
  const groups = [...(menuFor?.(menuNode) ?? []), viewGroup].filter((group) => group.length > 0)

  return (
    <div
      data-slot="canvas"
      className={cn(
        'relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm border border-border bg-card',
        className,
      )}
    >
      <div data-slot="canvas-surface" className="relative min-h-0 min-w-0 flex-1">
        {/* Sized, never positioned: cytoscape adds `__________cytoscape_container`
          to whatever element it is given, and that rule sets `position:
          relative` - which beats an `absolute inset-0` here, leaving the
          element 0px tall inside a 614px pane and the graph invisible under a
          perfectly correct frame. */}
        {graph.nodes.length === 0 ? (
          /* **Said in words, because a blank canvas is not an answer.** The
             drawing is pixels rather than DOM, so an empty case, a layout that
             threw and a build that returned early all look identical -- and
             only one of the three is somebody's cue to go and add an event.
             The failure below says its own thing for the same reason. */
          <p data-slot="canvas-empty" className="p-4 text-sm text-ink-muted">
            Nothing to draw yet. A case gets a graph once its timeline has
            entries.
          </p>
        ) : failed ? (
          /* Only the drawing is replaced. The strip stays: the Nodes list is
             the fallback for a canvas that cannot draw, so putting its door
             inside the failure would take it away exactly when it is needed. */
          <p className="p-4 text-sm text-ink-muted">
            The graph could not be drawn. The Nodes list has the same entities.
          </p>
        ) : (
          <>
            {/* `onContextMenuCapture`, not `onContextMenu`: see `aimMenu`. The
                wrapper takes the event rather than the host itself, because
                cytoscape owns the host's attributes and children. */}
            <div className="size-full" onContextMenuCapture={aimMenu}>
              <GraphCanvas
                className="size-full"
                onFailed={() => {
                  setFailed(true)
                }}
                // The pane is resizable -- the rail folds, the window changes
                // -- and a junction is placed by hand at the middle of its
                // bundle, so it has to be placed again before the view is
                // fitted or the dots drift off their fans.
                onResize={() => {
                  const cy = core.current
                  if (!cy) return
                  placeJunctions(cy)
                  cy.fit(undefined, 30)
                }}
                onViewport={(published) => {
                  core.current = published?.core ?? null
                  view.current = published
                  host.current = published === null ? null : hostOf(published.core)
                  setReady(published !== null)
                  publish.current?.(published)
                }}
              />
            </div>
            <PointerContextMenu
              at={menuAt}
              onClose={() => {
                setMenuAt(null)
              }}
              label={menuNode?.label ?? 'the graph'}
            >
              <Menu aria-label={`More for ${menuNode?.label ?? 'the graph'}`}>
                <RowMenuItems groups={groups} as="context" />
              </Menu>
            </PointerContextMenu>
          </>
        )}
        {/* One anchor, two surfaces: an empty span over the clicked node,
            which both the entity card and the members panel hang off. It takes
            no pointer events - sitting on the drawing, it would swallow the
            click that selects and drags. */}
        {anchor?.entity && (
          <EntityHoverCard
            entity={anchor.entity}
            open
            onOpenChange={(shown) => {
              if (!shown) setAnchor(null)
            }}
          >
            {/* The node's own box, so the card opens over the dot rather than
                the pane's corner. */}
            <OverlayAnchor
              label={anchor.entity.name}
              at={{
                left: anchor.x - anchor.size / 2,
                top: anchor.y - anchor.size / 2,
                width: anchor.size,
                height: anchor.size,
              }}
            />
          </EntityHoverCard>
        )}
        {children}
        {/* Opens at the node rather than in a corner, so it appears where the
            click was - the same bargain the entity card makes. Base UI's
            `Popover` was the obvious way to get that and renders nothing at
            all against a virtual anchor: it positions from a trigger, and a
            pointer-transparent span is not one. Clamped inside the pane so a
            node near an edge does not open a panel off it. */}
        {/* The same overlay the entity card is, against the same anchor: one
            click on a dot opened a React Aria popover for a single entity and
            a hand-placed box for a fold, so only one of them flipped at an
            edge, dismissed on Escape or took focus. */}
        {picked && anchor && (
          <PopoverTrigger
            isOpen
            onOpenChange={(shown) => {
              if (!shown) onSelect(null)
            }}
          >
            <OverlayAnchor
              label={picked.label}
              at={{
                left: anchor.x - anchor.size / 2,
                top: anchor.y - anchor.size / 2,
                width: anchor.size,
                height: anchor.size,
              }}
            />
            <Popover className="w-72">
              <Dialog aria-label={picked.label} size="compact">
                <div data-slot="graph-selection" className="p-3">
                  <p className="text-2xs uppercase tracking-wide text-ink-muted">
                    {picked.kind === 'event' ? 'Event' : (KIND_LABEL[picked.kind] ?? picked.kind)}
                    {picked.severity && ` \u00b7 ${picked.severity}`}
                    {picked.count > 1 && ` \u00b7 ${String(picked.count)} together`}
                    {picked.bridge && ` \u00b7 in ${String(picked.spans)} kinds of event`}
                    {picked.entry && ' \u00b7 entry point'}
                  </p>
                  <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto text-sm">
                    {picked.members.map((member) => (
                      <li key={member} className="break-words">
                        {member}
                      </li>
                    ))}
                  </ul>
                  {picked.count > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onPress={() => {
                        onToggleGroup(picked.groupKey)
                        onSelect(null)
                      }}
                    >
                      {picked.unfolded ? 'Re-fold this group' : `Separate ${String(picked.count)}`}
                    </Button>
                  )}
                </div>
              </Dialog>
            </Popover>
          </PopoverTrigger>
        )}
        {toolbar !== undefined && (
          <div
            data-slot="canvas-toolbar"
            // **Bounded on the left and allowed to wrap.** Anchored on the right
            // alone, a toolbar wider than the pane runs off the other edge.
            className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex flex-wrap items-start justify-end gap-2 *:pointer-events-auto"
          >
            {toolbar}
          </div>
        )}
        <div
          data-slot="canvas-legend"
          className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[18rem] *:pointer-events-auto"
        >
          <IncidentLegend />
        </div>
        {status !== undefined && (
          <div
            data-slot="canvas-status"
            className="pointer-events-none absolute right-4 bottom-4 z-10 text-2xs text-ink-muted *:pointer-events-auto"
          >
            {status}
          </div>
        )}
        {overlay !== undefined && (
          <div data-slot="canvas-overlay" className="absolute inset-0 z-20">
            {overlay}
          </div>
        )}
      </div>

      {onCursor !== undefined && (
        <IncidentTransport nodes={graph.nodes} cursor={cursor} onCursor={onCursor} />
      )}
    </div>
  )
}

/** How many columns the density strip is cut into. */
const BUCKETS = 140

/**
 * The key to the shapes, in the corner the drawing is least likely to fill.
 *
 * **Shut by default.** A key is read once and is then in the way, and the
 * canvas is the thing that needs the room -- but it is read *while* looking at
 * the drawing, so it folds here rather than sitting under the pane where
 * answering "what does the ring mean" costs a change of gaze.
 *
 * Shapes only: colour is already named in words by the severity vocabulary,
 * and a key that lists only hues is unreadable in greyscale.
 */
function IncidentLegend() {
  const rows: readonly { mark: string; text: string }[] = [
    {
      mark: 'size-3 rounded-full border-2 border-severity-critical',
      text: 'Event, ringed by severity',
    },
    { mark: 'size-3 rounded-full bg-ink-muted', text: 'Entity it names' },
    {
      mark: 'size-3 rounded-full bg-ink-muted ring-2 ring-ink-muted/45 ring-offset-1 ring-offset-card',
      text: 'Several folded together',
    },
    {
      mark: 'size-3 rounded-full bg-ink-muted ring-2 ring-ink ring-offset-1 ring-offset-card',
      text: 'In more than one kind of event',
    },
    { mark: 'size-3 rounded-full border-[3px] border-ring', text: 'Where the case starts' },
    {
      mark: 'w-5 border-t-2 border-dashed border-ink-muted',
      text: 'Recorded, in no timeline entry',
    },
  ]
  return (
    <Disclosure
      data-slot="graph-legend"
      className="rounded-md border border-border bg-card"
    >
      <DisclosureHeader className="text-2xs tracking-wide uppercase">Legend</DisclosureHeader>
      <DisclosurePanel>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.text} className="flex items-center gap-2 text-2xs text-ink-muted">
              <span aria-hidden className={row.mark} />
              {row.text}
            </li>
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  )
}

/** A moment as a clock. The graph's stamps are epoch *seconds*, not millis. */
function clockAt(at: number): string {
  return `${new Date(at * 1000).toISOString().slice(11, 16)} UTC`
}

/**
 * Playing the incident through: the drawing stays put and what has happened
 * lights up.
 *
 * **A reveal, not a re-layout.** Nodes arriving and pushing their neighbours
 * aside makes the drawing unlearnable, and answers a question this block is
 * not for.
 *
 * The domain is minutes from the start rather than the epoch stamp: React Aria
 * builds the grip's `aria-valuetext` from the value, and no number format
 * turns a millisecond count into a time.
 */
function IncidentTransport({
  nodes,
  cursor,
  onCursor,
}: {
  nodes: readonly IncidentNode[]
  cursor: number | null
  onCursor: (at: number | null) => void
}) {
  const [playing, setPlaying] = useState(false)

  const moments = useMemo(
    () => nodes.map((node) => node.seen).filter((at) => Number.isFinite(at) && at > 0),
    [nodes],
  )
  const span = useMemo(() => {
    if (moments.length === 0) return null
    const from = Math.min(...moments)
    const to = Math.max(...moments)
    return to > from ? { from, to } : null
  }, [moments])

  // The case's shape, under the control rather than beside it: a blank track
  // says only that there is a range.
  const columns = useMemo(() => {
    if (span === null) return []
    const counts = new Array<number>(BUCKETS).fill(0)
    const width = Math.max(1, span.to - span.from)
    for (const moment of moments) {
      const at = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor(((moment - span.from) / width) * BUCKETS)),
      )
      counts[at] = (counts[at] ?? 0) + 1
    }
    const tallest = Math.max(1, ...counts)
    return counts.map((count) => (count === 0 ? 0 : Math.max(0.18, count / tallest)))
  }, [moments, span])

  if (span === null) return null

  const runsFor = Math.max(1, Math.round((span.to - span.from) / 60))
  const minutes = cursor === null ? runsFor : (cursor - span.from) / 60
  const through = minutes / runsFor

  return (
    // **A row, not a bare track.** The grip is drawn on the track's end, so a
    // scrubber flush against the pane has half a circle cut off.
    <div
      data-slot="graph-transport"
      className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5"
    >
      <Transport
        className="min-w-0 flex-1"
        label="Show the incident up to this moment"
        value={minutes}
        min={0}
        max={runsFor}
        step={Math.max(1, Math.round(runsFor / 200))}
        isPlaying={playing}
        onPlayingChange={setPlaying}
        onChange={(value) => {
          // Dragged to the end is the same state as never having moved it, so
          // it says the same thing rather than reading a clock over a drawing
          // that shows all of it.
          onCursor(value >= runsFor ? null : span.from + value * 60)
        }}
        output={
          <span className="font-mono text-data">
            {cursor === null ? 'whole incident' : clockAt(cursor)}
          </span>
        }
        track={
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-full items-end gap-px"
          >
            {columns.map((height, at) => (
              <span
                key={at}
                className={cn(
                  'min-w-px flex-1 rounded-xs',
                  height === 0
                    ? 'bg-transparent'
                    : // The strip carries the progress: lit up to the cursor,
                      // the shape still to come after it.
                      at / BUCKETS <= through
                      ? 'bg-primary/70'
                      : 'bg-ink-muted/35',
                )}
                style={{ height: `${String(Math.round(height * 100))}%` }}
              />
            ))}
          </span>
        }
        end={
          // Absent rather than disabled once the whole incident is shown, but
          // its footprint is held or the track resizes every time the scrubber
          // leaves the end.
          <span className="flex size-(--control-h-md) shrink-0 items-center justify-center">
            {cursor !== null && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Show the whole incident"
                onPress={() => {
                  setPlaying(false)
                  onCursor(null)
                }}
              >
                <SkipForward aria-hidden />
              </Button>
            )}
          </span>
        }
      />
    </div>
  )
}
