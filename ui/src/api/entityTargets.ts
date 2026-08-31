import type { CollectionName } from './model'
import { fieldsOf, formSpec } from '@/api/specs'
import { isSection, type FieldSpec, type FormSpec, type Specs } from './specs'

/**
 * Where a `ref.target` lives: its table, and the screen that renders it.
 *
 * **The `collection` half is a mirror of the served `ref.collection` and is
 * pinned as one** - `entityTargets.test.ts` walks every reference field
 * `GET /api/specs` publishes and fails if this map disagrees or omits a target.
 * Read from the specs at render instead and every entity link on an 86-row
 * timeline would hold a subscription to the specs query to compute one href.
 *
 * **The `slug` half cannot be derived at all.** A section slug is not its
 * collection: `cloud_apps` is registered as `cloud-apps` while
 * `network_indicators` keeps its underscore, so the transformation between
 * them is a coin toss. Importing `SECTIONS` here would close a cycle -
 * `sections.tsx` imports every table, every table imports `EntityLink` - so
 * the agreement is asserted in the test, which is outside the cycle.
 */
export interface EntityTarget {
  collection: CollectionName
  /** The `SECTIONS` slug, and the `/cases/{id}/{slug}` path segment. */
  slug: string
  /** The section's own title, for "Open in Assets". `entityTargets.test.ts`
   *  holds it equal to the `SECTIONS` entry's - the analyst's label, not the
   *  feature directory's name. */
  title: string
}

export const ENTITY_TARGETS: Readonly<Record<string, EntityTarget>> = {
  system: { collection: 'systems', slug: 'assets', title: 'Assets' },
  account: { collection: 'accounts', slug: 'accounts', title: 'Accounts' },
  network: {
    collection: 'network_indicators',
    slug: 'network',
    title: 'Network',
  },
  malware: { collection: 'malware', slug: 'malware', title: 'Malware' },
  cloud_app: { collection: 'cloud_apps', slug: 'cloud-apps', title: 'Cloud Apps' },
  evidence: { collection: 'evidence', slug: 'evidence', title: 'Evidence' },
  method: { collection: 'methods', slug: 'methods', title: 'Methods' },
}

export function targetOf(target: string): EntityTarget | undefined {
  return ENTITY_TARGETS[target]
}

/**
 * Where a section link for this target points. `undefined` when nothing
 * renders it.
 *
 * `entityId`, when given, becomes `?highlight={id}` - a search param rather
 * than a fragment because a section already owns `#capture`/`#entry-{id}` for
 * its own hand-offs (`TimelineSection`); a second consumer of the fragment on
 * the same URL would collide with those. The six entity sections read it back
 * with `useSearchParams` and hand it to `DataTable` as `highlightId`.
 */
export function sectionPathFor(
  caseId: string,
  target: string,
  entityId?: string,
): string | undefined {
  const entry = targetOf(target)
  if (!entry) return undefined
  const base = `/cases/${encodeURIComponent(caseId)}/${entry.slug}`
  return entityId ? `${base}?highlight=${encodeURIComponent(entityId)}` : base
}

/**
 * The form that describes a collection's rows, found by what it declares.
 *
 * Keyed by `collection` rather than by the Python constant's name, which is
 * the only key `specs.forms` has: a card knows which *table* it is showing and
 * would otherwise need a second hand-written map from table to constant.
 * `timeline` is the one collection two forms claim (`EVENT_FIELDS` and
 * `TIMELINE_ACTION_FIELDS`) and is not an entity target, so first-match is
 * unambiguous for every target this resolves.
 */
export function formForCollection(
  specs: Specs,
  collection: CollectionName,
): FormSpec | undefined {
  return Object.values(specs.forms).find((form) => form.collection === collection)
}

/** Every reference field the whole specs document declares, in no order. */
export function referenceFieldsOf(specs: Specs): FieldSpec[] {
  const out: FieldSpec[] = []
  for (const form of Object.values(specs.forms)) {
    for (const field of form.fields) {
      if (!isSection(field) && field.ref) out.push(field)
    }
  }
  for (const field of fieldsOf(formSpec(specs, 'CASE_FIELDS'))) if (field.ref) out.push(field)
  return out
}
