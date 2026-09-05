import type { CollectionName } from '@/api/model'
import { COLLECTION_TO_CASE_KEY } from '@/api/model'
import type { Specs } from '@/api/specs'
import { isSection } from '@/api/specs'

/**
 * Which entity fields point at which other table - read off `GET /api/specs`,
 * never transcribed.
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
