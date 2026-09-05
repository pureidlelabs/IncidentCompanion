import { text } from '@/api/wireText'
import type { Case, TimelineEntry } from '@/api/model'
import type { Specs } from '@/api/specs'

import { buildEntityGraph, type GraphNode } from './entity-graph'
import { refDeclarations, timelineListFields } from './graph-references'

/**
 * The case as events with their entities attached, rather than entities linked
 * to each other.
 */

/** An event or an entity, after folding. */
export interface IncidentNode {
  id: string
  /** A `REF_TARGETS` key, or `event`. */
  kind: string
  label: string
  /** What this node stands for, deduplicated for reading: 40 identical beacon
   *  check-ins are one line, not forty. */
  members: readonly string[]
  /** How many entries or entities are folded in here. Distinct from
   *  `members.length`, which dedupes - the beacon puck stands for 40 entries
   *  and reads as one line, and counting the lines drew it as unfolded. */
  count: number
  /** Painted from the worst member, and never from the count. */
  paintedBy: GraphNode | null
  /** An event's severity, empty for an entity. */
  severity: string
  /** Epoch seconds: the earliest moment any member appears in the case. */
  seen: number
  /** An entity taking part in more than one kind of event - what joins two
   *  events together, and the reason it is never folded. */
  bridge: boolean
  spans: number
  entry: boolean
  /** The entity's own id, when this node stands for exactly one - what the
   *  app's entity card needs to look it up. Empty for an event or a fold. */
  entityId: string
  /** Recorded in the case and named by no timeline entry - the artefact is
   *  there, the story is not. Drawn on whatever it is attached to, never
   *  coloured as a fault. */
  unnarrated: boolean
  /** The group this node belongs to, so unfolding can name it. */
  groupKey: string
  unfolded: boolean
}

export interface IncidentLink {
  src: string
  dst: string
  seen: number
  /** An entity-to-entity reference rather than an event naming something -
   *  the only edge in this graph no timeline entry accounts for. */
  unnarrated?: boolean
}

export interface IncidentGraph {
  nodes: readonly IncidentNode[]
  links: readonly IncidentLink[]
  /**
   * Entities nothing reaches at all - no event, no reference.
   */
  disconnected: readonly GraphNode[]
}

/** A group smaller than this is drawn as its members. A `+1` hides one thing
 *  that could perfectly well have been drawn; the fold has to earn itself. */
export const FOLD_FROM = 5

export interface CaseEvent {
  entry: TimelineEntry
  /** Entity ids the entry names, in declaration order. */
  refs: readonly string[]
  at: number
}

/** Epoch seconds, or `Infinity` for a time the case cannot parse - which sorts
 *  last everywhere, matching `models.timestamp_sort_key`. */
export function momentOf(time: string): number {
  const parsed = Date.parse(time)
  return Number.isNaN(parsed) ? Infinity : Math.floor(parsed / 1000)
}

/**
 * Every entity a timeline entry names, through the reference fields the specs
 * document publishes - so a field added to the model appears here with no
 * change to this file.
 */
export function eventsOfCase(kase: Case, specs: Specs, known: ReadonlySet<string>): CaseEvent[] {
  const listFields = timelineListFields(refDeclarations(specs))
  const events: CaseEvent[] = []
  for (const entry of kase.timeline) {
    if (entry.hideFromGraph) continue
    const row = entry as unknown as Record<string, unknown>
    const refs: string[] = []
    for (const field of ['systemId', 'sourceSystemId', ...listFields]) {
      const value = row[field]
      if (typeof value === 'string' && known.has(value)) refs.push(value)
      else if (Array.isArray(value)) {
        for (const item of value) if (typeof item === 'string' && known.has(item)) refs.push(item)
      }
    }
    const unique = [...new Set(refs)]
    // An entry naming nothing is a note about the case, not a link in it.
    if (unique.length === 0) continue
    events.push({ entry, refs: unique, at: momentOf(entry.time) })
  }
  return events
}

/**
 * What an event *is*, rather than how it was worded.
 */
export function eventType(description: string, entityLabels: readonly string[]): string {
  let text = description.trim()
  for (const label of entityLabels) {
    if (label.length > 3 && text.includes(label)) text = text.split(label).join('\u2026')
  }
  return text
}

function worst(members: readonly GraphNode[]): GraphNode | null {
  // Grey is the honest answer and red is the safe direction: a group holding
  // one compromised host is painted compromised, never averaged down.
  const rank = (node: GraphNode): number => (node.danger ? 1 : 0)
  return [...members].sort((a, b) => rank(b) - rank(a))[0] ?? null
}

/**
 * @param expanded group keys the analyst has pulled apart.
 */
export function buildIncidentGraph(
  kase: Case,
  specs: Specs,
  { expanded = new Set<string>(), foldFrom = FOLD_FROM }: {
    expanded?: ReadonlySet<string>
    foldFrom?: number
  } = {},
): IncidentGraph {
  const entities = buildEntityGraph(kase, specs).nodes
  const labels = [...entities.values()].map((node) => node.label)
  const events = eventsOfCase(kase, specs, new Set(entities.keys()))

  const byType = new Map<string, CaseEvent[]>()
  for (const event of events) {
    const key = eventType(event.entry.description, labels)
    const bucket = byType.get(key)
    if (bucket) bucket.push(event)
    else byType.set(key, [event])
  }

  // Which kinds of event each entity takes part in. An entity in more than one
  // is what ties two events together.
  const takesPartIn = new Map<string, Set<string>>()
  for (const [key, group] of byType) {
    for (const event of group) {
      for (const ref of event.refs) {
        const set = takesPartIn.get(ref) ?? new Set<string>()
        set.add(key)
        takesPartIn.set(ref, set)
      }
    }
  }

  const nodes: IncidentNode[] = []
  const nodeOf = new Map<string, string>()

  /**
   * Fold the leaves, never the bridges.
   */
  const entityGroups = new Map<string, GraphNode[]>()
  const unmentionedNodes: GraphNode[] = []
  for (const [id, node] of entities) {
    const inEvents = takesPartIn.get(id)
    if (!inEvents || inEvents.size === 0) {
      unmentionedNodes.push(node)
      continue
    }
    const key =
      inEvents.size > 1
        ? `bridge:${id}`
        : `${node.kind}:${[...inEvents][0] ?? ''}`
    const bucket = entityGroups.get(key)
    if (bucket) bucket.push(node)
    else entityGroups.set(key, [node])
  }


  const firstSeen = new Map<string, number>()
  for (const event of events) {
    for (const ref of event.refs) {
      firstSeen.set(ref, Math.min(firstSeen.get(ref) ?? Infinity, event.at))
    }
  }
  const entryId = [...firstSeen.entries()]
    .filter(([id]) => entities.get(id)?.kind === 'system')
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0]

  for (const [key, members] of entityGroups) {
    members.sort((a, b) => a.label.localeCompare(b.label))
    const split = members.length > 1 && (expanded.has(key) || members.length < foldFrom)
    for (const part of split ? members.map((member) => [member]) : [members]) {
      const head = part[0]
      if (!head) continue
      const id = split ? `entity:${head.id}` : `group:${key}`
      const spans = takesPartIn.get(head.id)?.size ?? 0
      nodes.push({
        id,
        kind: head.kind,
        label: part.length > 1 ? `+ ${String(part.length - 1)}  ${head.label}` : head.label,
        members: part.map((member) => member.label),
        count: part.length,
        paintedBy: worst(part),
        severity: '',
        seen: Math.min(...part.map((member) => firstSeen.get(member.id) ?? Infinity)),
        bridge: spans > 1,
        spans,
        entry: part.some((member) => member.id === entryId),
        entityId: part.length === 1 ? head.id : '',
        unnarrated: false,
        groupKey: key,
        unfolded: split && expanded.has(key),
      })
      for (const member of part) nodeOf.set(member.id, id)
    }
  }

  /**
   * The entities no entry names, split by whether anything reaches them.
   */
  const links: IncidentLink[] = []
  const seenPair = new Set<string>()
  const disconnected: GraphNode[] = []
  const attachedGroups = new Map<string, { members: GraphNode[]; anchors: string[] }>()
  const structural = buildEntityGraph(kase, specs).links.filter(
    (link) => link.kind === 'structural',
  )
  for (const node of unmentionedNodes) {
    const anchors = [
      ...new Set(
        structural
          .filter((link) => link.src === node.id || link.dst === node.id)
          .map((link) => (link.src === node.id ? link.dst : link.src))
          .map((other) => nodeOf.get(other) ?? '')
          .filter(Boolean),
      ),
    ].sort()
    if (anchors.length === 0) {
      disconnected.push(node)
      continue
    }
    const key = `unnarrated:${node.kind}:${anchors.join(',')}`
    const bucket = attachedGroups.get(key)
    if (bucket) bucket.members.push(node)
    else attachedGroups.set(key, { members: [node], anchors })
  }
  disconnected.sort((a, b) => a.label.localeCompare(b.label))

  const seenOfNode = new Map(nodes.map((node) => [node.id, node.seen]))
  for (const [key, { members, anchors }] of attachedGroups) {
    // Nothing in the timeline says when this appeared - that is what makes it
    // unnarrated - so it arrives with whatever it was recorded against. A
    // clock of its own would either show it from the start, before the host
    // it hangs off exists, or never.
    const withAnchor = Math.min(...anchors.map((id) => seenOfNode.get(id) ?? Infinity))
    members.sort((a, b) => a.label.localeCompare(b.label))
    const split = members.length > 1 && (expanded.has(key) || members.length < foldFrom)
    for (const part of split ? members.map((member) => [member]) : [members]) {
      const head = part[0]
      if (!head) continue
      const id = split ? `entity:${head.id}` : `group:${key}`
      nodes.push({
        id,
        kind: head.kind,
        label: part.length > 1 ? `+ ${String(part.length - 1)}  ${head.label}` : head.label,
        members: part.map((member) => member.label),
        count: part.length,
        paintedBy: worst(part),
        severity: '',
        seen: withAnchor,
        bridge: false,
        spans: 0,
        entry: false,
        entityId: part.length === 1 ? head.id : '',
        unnarrated: true,
        groupKey: key,
        unfolded: split && expanded.has(key),
      })
      for (const anchor of anchors) {
        // The moment both ends exist, not the group's earliest: a puck hung
        // off two hosts must not draw its edge to the later one before that
        // host has appeared.
        links.push({
          src: anchor,
          dst: id,
          seen: Math.max(withAnchor, seenOfNode.get(anchor) ?? withAnchor),
          unnarrated: true,
        })
      }
    }
  }

  for (const [key, group] of byType) {
    const split = group.length > 1 && (expanded.has(key) || group.length < foldFrom)
    for (const part of split ? group.map((event) => [event]) : [group]) {
      const head = part[0]
      if (!head) continue
      const id = split ? `event:${head.entry.id}` : `events:${key}`
      const at = Math.min(...part.map((event) => event.at))
      nodes.push({
        id,
        kind: 'event',
        label:
          part.length > 1
            ? `+ ${String(part.length - 1)}  ${eventType(head.entry.description, labels)}`
            : head.entry.description.trim(),
        members: [...new Set(part.map((event) => event.entry.description.trim()))],
        count: part.length,
        paintedBy: null,
        // Absent on a response record and null on an unrated event; the band
        // draws nothing for either, which is what an empty string already meant.
        severity: text(head.entry.severity),
        seen: at,
        bridge: false,
        spans: 0,
        entry: false,
        entityId: '',
        unnarrated: false,
        groupKey: key,
        unfolded: split && expanded.has(key),
      })
      // The fan is the union of every member's entities: folding the events
      // must not lose an entity only one of them named.
      //
      // **Each edge carries the moment that pair first co-occurred, not the
      // group's earliest.** Taking the group's time drew an edge before the
      // entity it points at existed, because the earliest member of a folded
      // event need not be the one that named this entity.
      const firstTogether = new Map<string, number>()
      for (const event of part) {
        for (const ref of event.refs) {
          const target = nodeOf.get(ref)
          if (!target) continue
          firstTogether.set(target, Math.min(firstTogether.get(target) ?? Infinity, event.at))
        }
      }
      for (const [target, when] of firstTogether) {
        const pair = `${id} ${target}`
        if (seenPair.has(pair)) continue
        seenPair.add(pair)
        links.push({ src: id, dst: target, seen: when })
      }
    }
  }

  return { nodes, links, disconnected }
}

/** Undirected adjacency, for hover isolation and for the bundler. */
export function incidentNeighbours(
  links: readonly IncidentLink[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>()
  const add = (from: string, to: string): void => {
    const set = adjacency.get(from) ?? new Set<string>()
    set.add(to)
    adjacency.set(from, set)
  }
  for (const link of links) {
    add(link.src, link.dst)
    add(link.dst, link.src)
  }
  return adjacency
}


/**
 * Route a hub's edges through a shared stem.
 */
export const JUNCTION_MIN = 3

/** A separator no node id can contain. Keying on a printable one and splitting
 *  it back produced a source id that did not exist, and cytoscape refused the
 *  edge silently. */
const KEY_SEP = '\u0001'

export interface BundledGraph {
  nodes: readonly IncidentNode[]
  links: readonly IncidentLink[]
}

export function bundleThroughJunctions(
  nodes: readonly IncidentNode[],
  links: readonly IncidentLink[],
  min = JUNCTION_MIN,
): BundledGraph {
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]))
  const degree = new Map<string, number>()
  for (const link of links) {
    degree.set(link.src, (degree.get(link.src) ?? 0) + 1)
    degree.set(link.dst, (degree.get(link.dst) ?? 0) + 1)
  }

  // Grouped by (hub, the kind at the far end). The hub is whichever end has
  // the higher degree, so a leaf never becomes a stem.
  const bundles = new Map<string, { hub: string; edges: IncidentLink[] }>()
  const loose: IncidentLink[] = []
  for (const link of links) {
    const [hub, leaf] =
      (degree.get(link.src) ?? 0) >= (degree.get(link.dst) ?? 0)
        ? [link.src, link.dst]
        : [link.dst, link.src]
    if ((degree.get(hub) ?? 0) < min + 1) {
      loose.push(link)
      continue
    }
    const key = `${hub}${KEY_SEP}${kindOf.get(leaf) ?? ''}`
    const bundle = bundles.get(key)
    if (bundle) bundle.edges.push(link)
    else bundles.set(key, { hub, edges: [link] })
  }

  const out: IncidentNode[] = [...nodes]
  const wired: IncidentLink[] = [...loose]
  for (const [key, { hub, edges }] of bundles) {
    if (edges.length < min) {
      wired.push(...edges)
      continue
    }
    const junction = `junction${KEY_SEP}${key}`
    const seen = Math.min(...edges.map((edge) => edge.seen))
    out.push({
      id: junction,
      kind: 'junction',
      label: '',
      members: [],
      count: 1,
      paintedBy: null,
      severity: '',
      seen,
      bridge: false,
      spans: 0,
      entry: false,
      entityId: '',
      unnarrated: false,
      groupKey: '',
      unfolded: false,
    })
    wired.push({ src: hub, dst: junction, seen })
    for (const edge of edges) {
      const far = edge.src === hub ? edge.dst : edge.src
      wired.push({
        src: junction,
        dst: far,
        seen: edge.seen,
        ...(edge.unnarrated === true ? { unnarrated: true } : {}),
      })
    }
  }
  return { nodes: out, links: wired }
}

/**
 * Whether the cursor holds this moment back: it has not happened yet.
 */
export function heldBackAt(seen: number, cursor: number | null): boolean {
  if (cursor === null) return false
  return !Number.isFinite(seen) || seen > cursor
}
