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
 * How a row of each referenceable collection is named in a file.
 *
 * **Qualified the way the identity is, where the identity qualifies.** A name
 * that carried only the leading field was less discriminating than the row's
 * own identity, so a case holding `admin@corp.local` and `admin@partner.local`
 * lost the link on a round trip through its *own* file: both answered to
 * `admin`, the match was ambiguous, and an ambiguous match resolves to
 * nothing. Two indicators of one value and different kinds, and two instances
 * of one cloud app, are the same shape. -> #51
 *
 * **A qualifier the row has not got is left off**, so an account with no
 * domain is `admin` and still answers to a file that says `admin`. The
 * identity's own `floor` makes the same allowance.
 *
 * **Rendered, never parsed.** The import compares a file's value against each
 * candidate row's rendered name, so these forms are read by people and by
 * nothing else -- which is why they are written the way an analyst would type
 * them rather than joined by a separator chosen for a parser.
 *
 * **Several alternatives where a row can be named more than one way.** A
 * binary is named by its digest or by its filename and carries either.
 */
type Naming = readonly ((row: Record<string, unknown>) => string | null)[]

/** A row's field, trimmed, or `null` where it has none worth using. */
function held(row: Record<string, unknown>, field: string): string | null {
  const value = row[field]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** The leading field, with a qualifier appended where the row carries one. */
function qualified(lead: string, qualifier: string, between: string) {
  return (row: Record<string, unknown>): string | null => {
    const first = held(row, lead)
    if (first === null) return null
    const second = held(row, qualifier)
    return second === null ? first : `${first}${between}${second}`
  }
}

/** A row named by one field alone. */
function only(field: string) {
  return (row: Record<string, unknown>): string | null => held(row, field)
}

const NAMINGS: Partial<Record<Collection, Naming>> = {
  systems: [only('hostname')],
  accounts: [qualified('accountName', 'domain', '@')],
  network_indicators: [qualified('value', 'type', ' as ')],
  malware: [only('hash'), only('filename')],
  cloud_apps: [qualified('appName', 'instance', ' at ')],
  // The three with no deduplication identity, and the reason this module is
  // separate from `identity.ts`.
  methods: [only('name')],
  evidence: [only('name')],
  /**
   * **Reachable by no file today**, because neither `reports` nor
   * `report_blocks` publishes a write schema and `IMPORTABLE` is built from
   * the ones that do. It is here because the set is read off the schemas: a
   * reference declared on `report_blocks.reportId` is a reference, and leaving
   * the target out would make this table's own guard the thing that has to be
   * remembered rather than the thing that reminds you.
   */
  reports: [only('label')],
}

/** Published so a test can hold the table to the schemas. */
export const REFERENCE_KEY_FIELDS = NAMINGS

function namingOf(collection: string): Naming | undefined {
  return Object.hasOwn(NAMINGS, collection) ? NAMINGS[collection as Collection] : undefined
}

/** Whether a reference to this collection can be named in a file at all. */
export function canBeNamed(collection: string): boolean {
  return Object.hasOwn(REFERENCE_KEY_FIELDS, collection)
}

/**
 * What to write in a file for a reference to this row, or `null`.
 *
 * `null` where the row answers to none of its own namings -- a binary with
 * neither digest nor filename cannot be named, and a reference to it is one
 * the file cannot carry.
 */
export function nameOf(collection: string, row: Record<string, unknown>): string | null {
  for (const naming of namingOf(collection) ?? []) {
    const named = naming(row)
    if (named !== null) return named
  }
  return null
}

/**
 * Whether a stored row answers to the name a file used.
 *
 * **Compared the way the name was written, case-folded.** A hostname in a file
 * is the hostname somebody typed, and refusing `WKS-001` against a stored
 * `wks-001` makes the ordinary export-and-reimport lose its links. Any of the
 * row's namings may answer, for the reason a binary carries two.
 */
export function answersTo(
  collection: string,
  row: Record<string, unknown>,
  named: string,
): boolean {
  const wanted = named.trim().toLowerCase()
  if (wanted === '') return false

  for (const naming of namingOf(collection) ?? []) {
    const mine = naming(row)
    if (mine !== null && mine.toLowerCase() === wanted) return true
  }
  return false
}
