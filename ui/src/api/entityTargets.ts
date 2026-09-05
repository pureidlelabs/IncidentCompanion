import type { CollectionName } from './model'
import { fieldsOf, formSpec } from '@/api/specs'
import { isSection, type FieldSpec, type FormSpec, type Specs } from './specs'

/**
 * Where a `ref.target` lives: its table, and the screen that renders it.
 */
export interface EntityTarget {
  collection: CollectionName
  /** The `SECTIONS` slug, which names the target and titles a link to it. */
  slug: string
  /**
   * The kind's fragment on the entities page, where the target is one of its
   * five. Evidence and Methods are sections of their own and carry none.
   */
  scope?: string
  /** The section's own title, for "Open in Assets". `entityTargets.test.ts`
   *  holds it equal to the `SECTIONS` entry's - the analyst's label, not the
   *  feature directory's name. */
  title: string
}

export const ENTITY_TARGETS: Readonly<Record<string, EntityTarget>> = {
  system: { collection: 'systems', slug: 'assets', scope: 'assets', title: 'Assets' },
  account: { collection: 'accounts', slug: 'accounts', scope: 'accounts', title: 'Accounts' },
  network: {
    collection: 'network_indicators',
    slug: 'network',
    scope: 'network',
    title: 'Network',
  },
  malware: { collection: 'malware', slug: 'malware', scope: 'malware', title: 'Malware' },
  cloud_app: {
    collection: 'cloud_apps',
    slug: 'cloud-apps',
    scope: 'cloud-apps',
    title: 'Cloud Apps',
  },
  evidence: { collection: 'evidence', slug: 'evidence', title: 'Evidence' },
  method: { collection: 'methods', slug: 'methods', title: 'Methods' },
}

export function targetOf(target: string): EntityTarget | undefined {
  return ENTITY_TARGETS[target]
}

/**
 * Where a section link for this target points. `undefined` when nothing
 * renders it.
 */
export function sectionPathFor(
  caseId: string,
  target: string,
  entityId?: string,
): string | undefined {
  const entry = targetOf(target)
  if (!entry) return undefined
  const base = `/cases/${encodeURIComponent(caseId)}/${entry.scope ? 'entities' : entry.slug}`
  const query = entityId ? `?highlight=${encodeURIComponent(entityId)}` : ''
  return `${base}${query}${entry.scope ? `#${entry.scope}` : ''}`
}

/**
 * The form that describes a collection's rows, found by what it declares.
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
