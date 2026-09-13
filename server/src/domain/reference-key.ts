/**
 * "Which row did the source mean?" - asked by every file that crosses a case.
 *
 * **Not a deduplication identity, and the two must never be merged.** An
 * identity answers whether two rows are the same fact, and some collections
 * deliberately have none: a method and a piece of evidence are a judgement and
 * an event, so two that look alike are two acts. A reference key answers only
 * which row a reference meant, and claims nothing about sameness -- which is
 * why every collection that can be pointed at has one and only some have an
 * identity. -> `openspec/specs/data-exchange/design.md`
 *
 * **One field, not the identity's tuple.** An identity qualifies -- an account
 * is the pair, so `admin@corp.local` never merges into `admin@partner.local`.
 * A reference resolves instead of merging, and resolution refuses on anything
 * but a single match: two accounts named `admin` make a reference to `admin`
 * unresolvable, which is the honest answer and needs no second column in the
 * file to reach it.
 *
 * **Several fields where a row can be named more than one way.** A binary is
 * named by its digest or by its filename and carries either, so the export
 * writes whichever it has and the import matches against both.
 */
import type { Collection } from './collections.js'

/**
 * What a row of each referenceable collection is named by, strongest first.
 *
 * **Every `refTarget` in the tree is here**, and
 * `every-reference-target-can-be-named.test.ts` is what keeps that true: a
 * reference added to a collection missing from this table would travel as
 * nothing and be reported lost on every import.
 */
export const REFERENCE_KEY_FIELDS: Partial<Record<Collection, readonly string[]>> = {
  systems: ['hostname'],
  accounts: ['accountName'],
  network_indicators: ['value'],
  malware: ['hash', 'filename'],
  cloud_apps: ['appName'],
  // The three with no deduplication identity, and the reason this module is
  // separate from `identity.ts`.
  methods: ['name'],
  evidence: ['name'],
  /**
   * **Reachable by no file today**, because neither `reports` nor
   * `report_blocks` publishes a write schema and `IMPORTABLE` is built from
   * the ones that do. It is here because the set is read off the schemas: a
   * reference declared on `report_blocks.reportId` is a reference, and leaving
   * the target out would make this table's own guard the thing that has to be
   * remembered rather than the thing that reminds you.
   */
  reports: ['label'],
} as const

/** Whether a reference to this collection can be written in a file at all. */
export function canBeNamed(collection: string): boolean {
  return Object.hasOwn(REFERENCE_KEY_FIELDS, collection)
}

/**
 * What to write in a file for a reference to this row, or `null`.
 *
 * `null` where the row answers to none of its own key fields -- a binary with
 * neither digest nor filename cannot be named, and a reference to it is one the
 * file cannot carry.
 */
export function nameOf(collection: string, row: Record<string, unknown>): string | null {
  const fields = Object.hasOwn(REFERENCE_KEY_FIELDS, collection)
    ? REFERENCE_KEY_FIELDS[collection as Collection]
    : undefined
  if (!fields) return null

  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/**
 * Whether a stored row answers to the name a file used.
 *
 * **Compared the way the name was written, case-folded.** A hostname in a file
 * is the hostname somebody typed, and refusing `WKS-001` against a stored
 * `wks-001` makes the ordinary export-and-reimport lose its links. Any of the
 * row's key fields may answer, for the reason `REFERENCE_KEY_FIELDS` carries
 * more than one.
 */
export function answersTo(
  collection: string,
  row: Record<string, unknown>,
  named: string,
): boolean {
  const fields = Object.hasOwn(REFERENCE_KEY_FIELDS, collection)
    ? REFERENCE_KEY_FIELDS[collection as Collection]
    : undefined
  if (!fields) return false

  const wanted = named.trim().toLowerCase()
  if (wanted === '') return false

  return fields.some((field) => {
    const value = row[field]
    return typeof value === 'string' && value.trim().toLowerCase() === wanted
  })
}
