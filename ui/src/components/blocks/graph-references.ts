import type { CollectionName } from '@/api/model'
import { COLLECTION_TO_CASE_KEY } from '@/api/model'
import type { Specs } from '@/api/specs'
import { isSection } from '@/api/specs'

/**
 * Which entity fields point at which other table - read off `GET /api/specs`,
 * never transcribed.
 *
 * A reference field added to a schema becomes an edge with no code change,
 * because the server derives `ref` from the schema's own `refTarget`. A
 * hand-written list here would throw that away and go stale silently: the
 * graph would stop drawing an edge nobody noticed was missing.
 *
 * **Every reference an analyst picks is here; the one identity reference is
 * not.** `report_blocks.reportId` draws no control, so `/api/specs` never
 * carries it - and a report block is not an entity this graph holds.
 *
 * Deduplication is required, not tidy: a field can appear in two forms
 * (`systemId` is on both the event and the action schema) and following it
 * twice would double every edge it carries.
 */
export interface RefDeclaration {
  /** The table the *referencing* entity lives in. */
  collection: CollectionName
  /** camelCase, as the entry carries it after `fromWire`. */
  field: string
  /** A `REF_TARGETS` key: `system`, `account`, `network`, ... */
  target: string
  /** The table the reference points *at*. */
  targetCollection: CollectionName
  /** A list of ids rather than one. */
  multiple: boolean
}

/**
 * The timeline's list-valued references, in the order the graph reads them.
 *
 * **Order is load-bearing and is the one thing the specs document does not
 * carry.** `buildFromDeclarations` takes the first reference in this order as
 * an entry's star hub when the entry names no host at all, so a different
 * order draws a different graph for the same case; the specs forms arrive in
 * form order, which is a question sequence rather than a decision.
 *
 * Guarded rather than trusted: `timelineListFields` throws when the served
 * specs carry a list reference this does not name, so a sixth one is a failed
 * test rather than a silently dropped edge.
 */
const TIMELINE_LIST_FIELD_ORDER = [
  'evidenceIds',
  'cloudAppIds',
  'accountIds',
  'networkIndicatorIds',
  'malwareIds',
] as const

/**
 * Reference targets the investigation graph does not draw.
 *
 * **The graph is the intrusion; a method is the analyst's working-out.** Hosts,
 * accounts, indicators, malware, cloud apps and evidence are things the
 * intruder touched or the case holds. How somebody came to know a thing is
 * provenance, and drawing it beside the attack puts the investigation's own
 * process into a picture of what happened.
 *
 * **Excluded here rather than given a describer**, and by *target* rather than
 * by field name: `methodId` and `methodIds` are two spellings of one decision,
 * and both `refTargets` and `timelineListFields` read what this function
 * returns, so one exclusion covers both.
 */
const NOT_DRAWN = new Set(['method'])

function isCollectionName(value: string): value is CollectionName {
  return value in COLLECTION_TO_CASE_KEY
}

function camelise(wireName: string): string {
  return wireName.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Every declared reference, deduplicated, in a stable order.
 *
 * Sorted by (collection, field) rather than left in specs order. What the
 * order decides is which of two declarations wins when both describe the same
 * unordered pair of entities, and that is only the edge's `label` - the
 * investigation graph draws an edge's `kind` and never its label, so the
 * choice is unobservable on the canvas and the sort exists to keep the *link
 * list* identical between two renders of one case.
 */
export function refDeclarations(specs: Specs): readonly RefDeclaration[] {
  const seen = new Map<string, RefDeclaration>()
  for (const form of Object.values(specs.forms)) {
    const owner = form.collection
    if (owner === null) continue
    for (const entry of form.fields) {
      if (isSection(entry)) continue
      const ref = entry.ref
      if (!ref) continue
      if (NOT_DRAWN.has(ref.target)) continue
      if (!isCollectionName(ref.collection)) continue
      const field = camelise(entry.name)
      const key = `${owner}.${field}`
      if (seen.has(key)) continue
      seen.set(key, {
        collection: owner,
        field,
        target: ref.target,
        targetCollection: ref.collection,
        multiple: ref.multiple,
      })
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.collection === b.collection
      ? a.field.localeCompare(b.field)
      : a.collection.localeCompare(b.collection),
  )
}

/**
 * A case key that holds an entity *table*, which is narrower than `keyof Case`.
 *
 * `keyof Case` also covers scalars like `status`, so declaring a table key as
 * `keyof Case` widens it past anything `COLLECTION_TO_CASE_KEY` can produce --
 * and a consumer keying a `Map` on the real set then cannot look one up.
 * Derived from that const rather than written out, so an entity table added
 * later needs no edit here.
 */
export type EntityCaseKey = (typeof COLLECTION_TO_CASE_KEY)[CollectionName]

/** Distinct `REF_TARGETS` keys, each with the case key holding its entities. */
export function refTargets(
  declarations: readonly RefDeclaration[],
): ReadonlyMap<string, EntityCaseKey> {
  const targets = new Map<string, EntityCaseKey>()
  for (const declaration of [...declarations].sort((a, b) => a.target.localeCompare(b.target))) {
    if (!targets.has(declaration.target)) {
      targets.set(declaration.target, COLLECTION_TO_CASE_KEY[declaration.targetCollection])
    }
  }
  return targets
}

/**
 * The timeline's list references, in dataclass order.
 *
 * Throws on a served list reference `TIMELINE_LIST_FIELD_ORDER` does not name:
 * dropping it would silently lose every edge that field carries, which is
 * invisible on a canvas whose whole content is edges.
 */
export function timelineListFields(declarations: readonly RefDeclaration[]): readonly string[] {
  const served = declarations
    .filter((declaration) => declaration.collection === 'timeline' && declaration.multiple)
    .map((declaration) => declaration.field)
  const known: readonly string[] = TIMELINE_LIST_FIELD_ORDER
  const unknown = served.filter((field) => !known.includes(field))
  if (unknown.length > 0) {
    throw new Error(
      `TimelineEntry declares list reference(s) the graph does not order: ${unknown.join(', ')}`,
    )
  }
  return known.filter((field) => served.includes(field))
}
