/**
 * Writing a collection out as CSV.
 *
 * **`csv-stringify` writes it, not this file.** Quoting a comma, a quote and a
 * newline is where hand-rolled writers fail, and they fail by producing a file
 * that opens and is wrong rather than one that errors. What stays here is the
 * part a library will not do: rendering this app's non-scalar values.
 *
 * The formula guard is `domain/spreadsheet.lists.ts`, because the browser
 * writes a CSV too and needs the same one.
 */
import { stringify } from 'csv-stringify'

import { neutralise } from '../domain/spreadsheet.lists.js'

/**
 * The separator between a list's items, and how an item carrying one survives.
 *
 * **A backslash escape, because an item is analyst text now.** A list column
 * held `z.array(z.uuid())` until a reference travelled as the name of what it
 * points at; a name is free text, and one holding `;` split into two names on
 * the way back -- the row landing with the link gone and two losses reported
 * for one reference. -> #51
 */
const SEPARATOR = ';'

function escaped(item: string): string {
  return item.replaceAll('\\', '\\\\').replaceAll(SEPARATOR, `\\${SEPARATOR}`)
}

/**
 * How a value reaches a cell. A list is `;`-joined, which is a contract with
 * `csv-import.ts`: it splits on the same character, and a comma would
 * round-trip a two-item list back as one value. A `Date` goes out as ISO 8601.
 *
 * **Every item is neutralised, not the string they were joined into.**
 * `neutralise` reads what a cell *leads* with, so joining first left every
 * item but the first unexamined -- and a formula in the second one reached the
 * spreadsheet. Unreachable while a list held only uuids, which is what changed.
 */
function cell(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map((item) => neutralise(escaped(String(item)))).join(SEPARATOR)
  }
  if (value instanceof Date) return value.toISOString()
  return neutralise(value)
}

/**
 * Rows to CSV text, with a header in the order given.
 *
 * **The column list is the caller's, not the rows'.** Deriving it from the
 * first row makes the header depend on which row happened to be first, and a
 * row missing an optional field would silently drop that column for everyone.
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    stringify(
      rows.map((row) => Object.fromEntries(columns.map((name) => [name, cell(row[name])]))),
      { header: true, columns },
      (error, output) => {
        if (error) reject(error)
        else resolve(output)
      },
    )
  })
}
