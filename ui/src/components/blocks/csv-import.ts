/**
 * CSV import, entirely client-side up to the moment of submit: map columns
 * against the served form spec, flag per-row type problems, flag probable
 * duplicates, and build the exact array `POST .../{collection}/bulk` takes.
 *
 * **A header is mapped by `toCamel(header)` against `fieldsOf(form)`, and
 * nothing is special-cased.** The identity column and the `<field>_display`
 * companions an export writes match no field, so they fall into the same
 * "unmapped, excluded" bucket as an unknown column - one rule instead of two,
 * and the app's own export still round-trips.
 *
 * **`DEDUP_KEYS` holds the natural key per collection**, and a collection
 * missing from it has none, so it never reports a duplicate.
 *
 * **The row number a refusal names is the *submitted* array's, not the CSV's**,
 * skipped rows having already been dropped. `buildSubmission` returns `refs`,
 * `refs[k]` being the preview row that became the server's row `k + 1`, and
 * `previewIndexForServerRow` is the one place that arithmetic happens.
 */

import { toCamel } from '@/api/naming'
import { fieldsOf, type FieldSpec, type FormSpec } from '@/api/specs'
import type { CollectionName } from '@/api/model'
import type { CsvTable } from '@/lib/csv'

export interface ColumnMapping {
  header: string
  /** The form field this header matched, or `null` if it excluded itself. */
  field: string | null
}

export interface RowResult {
  /** 1-based, over the CSV's data rows - what the preview grid shows. */
  csvRow: number
  /** Mapped field name -> raw cell text. Unmapped columns carry no key. */
  values: Record<string, string>
  problems: string[]
  duplicate: boolean
  /** Whether this row is left out of the submitted batch. Defaults to `duplicate`. */
  skip: boolean
}

export interface ImportPreview {
  columns: ColumnMapping[]
  unmappedHeaders: string[]
  rows: RowResult[]
}

/** Each header matched against the form's own field names, camelised once. */
export function mapColumns<TData>(header: readonly string[], form: FormSpec<TData>): ColumnMapping[] {
  const known = new Set<string>(fieldsOf(form).map((field) => field.name))
  return header.map((raw) => {
    const name = toCamel(raw)
    return { header: raw, field: known.has(name) ? name : null }
  })
}

/**
 * What this field's cell value fails, if anything.
 *
 * Mirrors `storage.import_section_csv`'s own two checks - the boolean
 * vocabulary (`true`/`1`/`yes`/`false`/`0`/`no`/empty, case-insensitive) and
 * required-empty - plus a `select` field's own vocabulary, which the server
 * checks later (`_checked_fields`) but which is cheap to catch here first.
 * `autocomplete`, free text and reference kinds are not vocabulary-checked:
 * an id or an open-ended value has no closed list to fail against, so a
 * reference field is trusted through unresolved (this module's
 * docstring says why full referential-integrity checking is out of scope).
 */
export function fieldProblems<TData>(field: FieldSpec<TData>, raw: string | undefined): string[] {
  const value = raw ?? ''
  if (field.kind === 'checkbox') {
    const normalised = value.trim().toLowerCase()
    if (!['true', '1', 'yes', 'false', '0', 'no', ''].includes(normalised)) {
      return [`${field.label}: "${value}" is not a yes/no value`]
    }
    return []
  }
  if (field.required && value.trim() === '') {
    return [`${field.label} is required`]
  }
  if (field.kind === 'select' && value.trim() !== '' && field.options && !field.options.includes(value)) {
    return [`${field.label}: "${value}" is not one of the offered options`]
  }
  return []
}

/** `normalise(value)` -> the trimmed lowercase string, or `null` for empty/absent. */
function normalise(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * The natural-key rule per collection, read off mapped CSV values.
 *
 * Keyed by the wire (snake_case) collection name, the spelling
 * `CollectionName` uses, and absent for every collection with no natural key.
 * **The rules match the server's row for row** - an importer that disagrees
 * doubles the case on a re-import.
 * -> `server/src/collections/identity.ts`
 */
const DEDUP_KEYS: Partial<Record<CollectionName, (values: Record<string, string>) => string | null>> = {
  systems: (values) => normalise(values.hostname),
  accounts: (values) => {
    const name = normalise(values.accountName)
    return name === null ? null : `${name}\u0000${normalise(values.domain) ?? ''}`
  },
  network_indicators: (values) => {
    // The pair, matching `identity.ts`: one value read two ways is two rows.
    const value = (values.value ?? '').trim()
    return value === '' ? null : `${value}\u0000${normalise(values.type) ?? ''}`
  },
  malware: (values) => normalise(values.hash),
  cloud_apps: (values) => normalise(values.appName),
}

/** Whether `collection` has a natural key at all - gates the skip-duplicate column. */
export function hasDedupKey(collection: CollectionName): boolean {
  return collection in DEDUP_KEYS
}

/**
 * Parse, map and validate a CSV against one form, flagging duplicates
 * against both `existing` (the case's own rows) and earlier rows in this
 * same file - a re-import of a file already imported once should flag every
 * row, not just the second half of a file that duplicates itself.
 *
 * A row whose cell count does not match the header is not silently padded:
 * `import_section_csv` refuses it server-side (`DictReader`'s `restval` is
 * `None`, and any `None` value raises), so it is refused here too, as a
 * problem rather than a guess at which column went missing.
 */
export function buildPreview<TData extends { id: string }>(
  csv: CsvTable,
  form: FormSpec<TData>,
  collection: CollectionName,
  existing: readonly TData[],
): ImportPreview {
  const columns = mapColumns(csv.header, form)
  const unmappedHeaders = columns.filter((column) => column.field === null).map((column) => column.header)
  const fields = fieldsOf(form)
  const dedupKey = DEDUP_KEYS[collection]

  const seen = new Set<string>()
  if (dedupKey) {
    for (const entry of existing) {
      const key = dedupKey(entry)
      if (key !== null) seen.add(key)
    }
  }

  const rows: RowResult[] = csv.rows.map((cells, index) => {
    const values: Record<string, string> = {}
    columns.forEach((column, columnIndex) => {
      if (column.field) values[column.field] = cells[columnIndex] ?? ''
    })

    const problems =
      cells.length === csv.header.length
        ? fields.flatMap((field) => fieldProblems(field, values[field.name]))
        : [`row has ${String(cells.length)} column(s); the header has ${String(csv.header.length)}`]

    let duplicate = false
    if (dedupKey) {
      const key = dedupKey(values)
      if (key !== null) {
        duplicate = seen.has(key)
        seen.add(key)
      }
    }

    return { csvRow: index + 1, values, problems, duplicate, skip: duplicate }
  })

  return { columns, unmappedHeaders, rows }
}

/** This row's values, coerced to what the wire expects: booleans and semicolon-split lists. */
function coerceRow<TData>(values: Record<string, string>, form: FormSpec<TData>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fieldsOf(form)) {
    const name = field.name
    if (!(name in values)) continue
    const raw = values[name] ?? ''
    if (field.kind === 'checkbox') {
      out[name] = ['true', '1', 'yes'].includes(raw.trim().toLowerCase())
    } else if (field.ref?.multiple) {
      out[name] = raw
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    } else {
      out[name] = raw
    }
  }
  return out
}

export interface Submission {
  rows: Record<string, unknown>[]
  /** `refs[k]` is the `preview.rows` index that became the server's `row k + 1`. */
  refs: number[]
}

/** The rows that will actually be sent - every non-skipped row, coerced. */
export function buildSubmission<TData>(preview: ImportPreview, form: FormSpec<TData>): Submission {
  const rows: Record<string, unknown>[] = []
  const refs: number[] = []
  preview.rows.forEach((row, index) => {
    if (row.skip) return
    rows.push(coerceRow(row.values, form))
    refs.push(index)
  })
  return { rows, refs }
}

const ROW_ERROR = /^row (\d+): ([\s\S]*)$/

/** `"row 3: SystemEntry has no field 'nope'"` -> `{ row: 3, detail: "..." }`. `null` if not row-shaped. */
export function parseRowError(message: string): { row: number; detail: string } | null {
  const match = ROW_ERROR.exec(message)
  if (!match?.[1] || match[2] === undefined) return null
  return { row: Number(match[1]), detail: match[2] }
}

/** A refusal naming a reference the case does not hold. */
const NO_SUCH_ROW = /^No such rows? in this case:/

/**
 * One line of advice for a refusal the sentence alone does not explain, or
 * `null` where it needs none.
 *
 * **Never says the row is in another case.** The server refuses an id that
 * exists elsewhere and one that exists nowhere in the same words, so that a
 * refusal cannot report on a case the analyst may not open.
 */
export function adviceFor(detail: string): string | null {
  if (!NO_SUCH_ROW.test(detail)) return null
  return 'A CSV exported from another case carries that case\u2019s ids. Export from this case, or clear that column before importing.'
}

/** The `preview.rows` index the server's 1-based `serverRow` refers to, via `refs`. */
export function previewIndexForServerRow(serverRow: number, refs: readonly number[]): number | null {
  return refs[serverRow - 1] ?? null
}
