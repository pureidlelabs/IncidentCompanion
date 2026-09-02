/**
 * A CSV text into rows of raw string cells, via `csv-parse`'s browser bundle -
 * the same library the server's importer uses, so a preview built here does
 * not disagree with what `POST .../{collection}/bulk` will accept.
 *
 * **Column count is not enforced here.** `buildPreview` reports a short or
 * long row as a per-row problem rather than failing the whole file, so
 * `relax_column_count` is on and csv-parse does not throw over it.
 */
import { parse } from 'csv-parse/browser/esm/sync'

const OPTIONS = {
  columns: false,
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
} as const

export function parseCsv(text: string): string[][] {
  return parse(text, OPTIONS)
}

/** The header and the data rows, or `null` for an empty file. */
export interface CsvTable {
  header: string[]
  rows: string[][]
}

/** `parseCsv`, split into a header and the rows beneath it. */
export function parseCsvTable(text: string): CsvTable | null {
  const [header, ...rows] = parseCsv(text)
  if (!header) return null
  return { header, rows }
}
