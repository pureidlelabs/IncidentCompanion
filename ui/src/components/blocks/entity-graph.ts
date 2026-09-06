import type {
  AccountEntry,
  Case,
  CloudAppEntry,
  EvidenceEntry,
  ImpactEntry,
  MalwareEntry,
  NetworkIndicator,
  SystemEntry,
} from '@/api/model'
import { COLLECTION_TO_CASE_KEY } from '@/api/model'

import {
  refDeclarations,
  refTargets,
  timelineListFields,
  type EntityCaseKey,
  type RefDeclaration,
} from './graph-references'
import type { Specs } from '@/api/specs'

/**
 * The case as a graph of entities.
 *
 * Built here rather than fetched because nothing serves it: no route publishes
 * nodes, links or positions. The inputs are all on the wire already - the
 * build reads reference fields off the `Case` and nothing else - so it needs
 * no endpoint.
 *
 * Two kinds of edge, and the distinction is the analyst's:
 *
 *   structural  a direct entity -> entity reference. `MalwareEntry.systemId`
 *               says this file was found on this host, and stays true whatever
 *               the timeline says.
 *   event       carried by a timeline entry, which can name a host, a source
 *               host and several accounts, indicators, malware and evidence at
 *               once. That hyperedge is dissolved into a star from the entry's
 *               host, never a clique: a clique is O(refs^2) and asserts links
 *               between entities that merely co-occurred.
 *
 * **Timeline entries are not nodes.** Ten of the demo case's entries reference
 * two or more entities, so drawing them roughly doubles the graph and makes it
 * a picture of events rather than of what the case holds.
 */
export interface GraphNode {
  id: string
  /** A `REF_TARGETS` key: `system`, `account`, `network`, `malware`, `cloud_app`, `evidence`. */
  kind: string
  label: string
  sub: string
  /**
   * The assessment (compromised / malicious / suspicious), and the only thing
   * a renderer may colour. Never folded together with `contained`: a blocked
   * C2 address painted the same green as a clean host says "this is fine"
   * about the most dangerous node on the canvas.
   */
  danger: string
  /**
   * Which field `danger` was read from, so a renderer can look its tone up in
   * the served `specs.fieldTones` instead of carrying a colour table.
   *
   * Empty where the value has no served tone - `cloudApp.verifiedPublisher`
   * is the case: "unverified" is stated in the sub-label and left unpainted,
   * because inventing a tone for it here is exactly the classification the
   * client is not allowed to make.
   */
  dangerField: string
  /** What the SOC has since done - blocked / disabled / isolated. A tooltip, never a colour. */
  contained: string
}

export type LinkKind = 'structural' | 'event' | 'movement'

export interface GraphLink {
  src: string
  dst: string
  kind: LinkKind
  /**
   * Data only. The investigation graph draws an edge's `kind` and never this,
   * so which of two declarations wins a duplicated pair is unobservable.
   */
  label: string
}

export interface EntityGraph {
  nodes: ReadonlyMap<string, GraphNode>
  links: readonly GraphLink[]
}

interface Described {
  label: string
  sub: string
  danger: string
  dangerField: string
  contained: string
}

/**
 * What to show for an entity of each kind, keyed by `REF_TARGETS` key.
 *
 * A missing key throws rather than falling back: a node drawn with whatever
 * description happened to be last is worse than a loud failure, because
 * nothing about the canvas says which one it got.
 *
 * **Two kinds carry no assessment at all, on purpose.** An account has no
 * verdict field - `privileges` says what it could do, not that it was abused,
 * and inferring danger from "it appears in this case" paints every account
 * red, the cleared ones included. Evidence is a record of something, never
 * itself a threat.
 */
const DESCRIBE: Record<string, (entity: never) => Described> = {
  system: (entity: SystemEntry) => ({
    label: entity.hostname || '(unnamed host)',
    sub: entity.systemType,
    danger: entity.verdict,
    dangerField: 'verdict',
    contained: entity.isolated ? 'isolated' : '',
  }),
  account: (entity: AccountEntry) => ({
    label: entity.accountName || '(unnamed account)',
    sub: entity.privileges || 'account',
    danger: '',
    dangerField: '',
    contained: entity.disabled ? 'disabled' : '',
  }),
  network: (entity: NetworkIndicator) => ({
    label: entity.value || '(indicator)',
    sub: entity.port ? `port ${entity.port}` : 'indicator',
    danger: entity.disposition,
    dangerField: 'disposition',
    contained: entity.blocked ? 'blocked' : '',
  }),
  malware: (entity: MalwareEntry) => ({
    label: entity.filename || '(file)',
    sub: 'file',
    danger: entity.verdict,
    dangerField: 'verdict',
    contained: '',
  }),
  cloud_app: (entity: CloudAppEntry) => ({
    label: entity.appName || '(app)',
    sub: entity.publisher || 'cloud app',
    danger: entity.verifiedPublisher === 'verified' ? '' : 'unverified',
    dangerField: '',
    contained: '',
  }),
  evidence: (entity: EvidenceEntry) => ({
    label: entity.name || entity.type || '(evidence)',
    sub: entity.type || 'evidence',
    danger: '',
    dangerField: '',
    contained: '',
  }),
  /**
   * **`disposition` is the danger, and it is the only one here that is not a
   * judgement about a thing but about what happened to it.** Exfiltrated and
   * destroyed are outcomes; the tone map already paints them, so the node
   * reads at the same weight as a compromised host - which is right, since
   * this is usually the reason the case exists.
   */
  impact: (entity: ImpactEntry) => ({
    label: entity.label || '(data)',
    sub: entity.category || 'data',
    danger: entity.disposition,
    dangerField: 'disposition',
    contained: '',
  }),
}

function describe(kind: string, entity: { id: string }): Described {
  const describer = DESCRIBE[kind]
  if (!describer) {
    throw new Error(
      `${kind} is a reference target with no description, so its nodes would render unlabelled`,
    )
  }
  return (describer as (value: { id: string }) => Described)(entity)
}

function idsOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}

function rowsOf(kase: Case, key: keyof Case): readonly { id: string }[] {
  const value: unknown = kase[key]
  return Array.isArray(value) ? (value as readonly { id: string }[]) : []
}

function edgeLabel(field: string): string {
  return field
    .replace(/Ids$/, '')
    .replace(/Id$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
}

export function buildEntityGraph(kase: Case, specs: Specs): EntityGraph {
  const declarations = refDeclarations(specs)
  return buildFromDeclarations(kase, declarations)
}

/**
 * Every kind that gets nodes: what is referenced, **and what does the
 * referencing.**
 *
 * `refTargets` answers only the first, which was the whole node set - so a
 * collection that points at others and is pointed at by none never appeared,
 * and the structural loop below then dropped all of its edges silently,
 * because `add` refuses a pair whose source is not a node.
 *
 * **Impact is the collection that made this visible.** It names a host, an
 * account and its evidence, and nothing names it - reasonably, since what was
 * taken is a conclusion rather than something another row cites. It was absent
 * from the investigation graph entirely, which is the one screen an analyst
 * uses to answer "what is this case about".
 *
 * Derived rather than listed, like everything else here: a new entity table
 * that references anything joins the graph with no edit. `actions` and
 * `casenotes` declare no references and stay out, which is right - they are
 * the analyst's own work rather than part of the picture.
 */
function graphKinds(
  declarations: readonly RefDeclaration[],
): ReadonlyMap<string, EntityCaseKey> {
  const kinds = new Map<string, EntityCaseKey>(refTargets(declarations))
  /**
   * **Deduped on the case key, not the name.** A collection and its screen key
   * are different words for the same rows - `cloud_apps` against `cloud_app` -
   * so checking the name adds a second kind for the same table, under a key
   * `DESCRIBE` has never heard of, and every graph throws.
   */
  const covered = new Set(kinds.values())
  for (const declaration of declarations) {
    if (declaration.collection === 'timeline') continue
    const caseKey = COLLECTION_TO_CASE_KEY[declaration.collection]
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition --
       `declaration` comes off the *served* specs, so its collection is whatever
       the server sent rather than a member of the union this map is total over.
       The type says the lookup cannot miss; a server one release ahead says
       otherwise, and the miss is a crash rather than a missing row. */
    if (!caseKey || covered.has(caseKey)) continue
    covered.add(caseKey)
    kinds.set(declaration.collection, caseKey)
  }
  return kinds
}

export function buildFromDeclarations(
  kase: Case,
  declarations: readonly RefDeclaration[],
): EntityGraph {
  const nodes = new Map<string, GraphNode>()
  for (const [kind, caseKey] of graphKinds(declarations)) {
    for (const entity of rowsOf(kase, caseKey)) {
      nodes.set(entity.id, { id: entity.id, kind, ...describe(kind, entity) })
    }
  }

  const links: GraphLink[] = []
  const seen = new Set<string>()

  /**
   * One edge per unordered pair, keeping the first. Structural runs before
   * event below, so a pair recorded on the entity itself keeps the more
   * durable claim.
   */
  const add = (src: string, dst: string, kind: LinkKind, label = ''): void => {
    if (!src || !dst || src === dst) return
    // A dangling reference. The server's write path is what reports those;
    // drawing an edge to a node that is not there is a line into empty canvas.
    if (!nodes.has(src) || !nodes.has(dst)) return
    const pair = src < dst ? `${src}\u0000${dst}` : `${dst}\u0000${src}`
    if (seen.has(pair)) return
    seen.add(pair)
    links.push({ src, dst, kind, label })
  }

  for (const declaration of declarations) {
    if (declaration.collection === 'timeline') continue
    const caseKey = COLLECTION_TO_CASE_KEY[declaration.collection]
    for (const entity of rowsOf(kase, caseKey)) {
      const owner = entity as unknown as Record<string, unknown>
      for (const dst of idsOf(owner[declaration.field])) {
        add(entity.id, dst, 'structural', edgeLabel(declaration.field))
      }
    }
  }

  const listFields = timelineListFields(declarations)
  for (const entry of kase.timeline) {
    // `hideFromGraph` is the analyst calling an entry noise here. Actions are
    // still drawn: one of them carries real links - "malicious indicators
    // blocked at perimeter firewall" ties two indicators together - and this
    // graph asks what is connected, not what the attacker did.
    if (entry.hideFromGraph) continue
    if (entry.systemId && entry.sourceSystemId) {
      add(entry.sourceSystemId, entry.systemId, 'movement', 'movement')
    }
    const row = entry as unknown as Record<string, unknown>
    const referenced = listFields.flatMap((field) => idsOf(row[field]))
    // The star's hub is the entry's host. An entry can legitimately have none
    // - an event about the edge of the network names no machine - and dropping
    // those loses every link they carry. The first reference in declaration
    // order becomes the hub instead, so one case always draws one graph.
    const [firstReference = ''] = referenced
    const hub = entry.systemId || entry.sourceSystemId || firstReference
    const summary = entry.description.trim()
    for (const dst of referenced) add(hub, dst, 'event', summary)
  }

  return { nodes, links }
}

/**
 * Undirected adjacency. A movement's direction is a property of the edge, not
 * of who can be reached from where.
 */
export function neighbours(links: readonly GraphLink[]): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>()
  const link = (from: string, to: string): void => {
    const set = adjacency.get(from) ?? new Set<string>()
    set.add(to)
    adjacency.set(from, set)
  }
  for (const edge of links) {
    link(edge.src, edge.dst)
    link(edge.dst, edge.src)
  }
  return adjacency
}
