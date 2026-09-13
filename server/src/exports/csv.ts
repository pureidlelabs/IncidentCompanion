/**
 * Writing a collection out as CSV.
 *
 * **`csv-stringify` writes it, not this file.** Quoting a comma, a quote and a
 * newline is where hand-rolled writers fail, and they fail by producing a file
 * that opens and is wrong rather than one that errors. What stays here is the
 * part a library will not do: neutralising spreadsheet formulas, and rendering
 * this app's non-scalar values.
 */
import { stringify } from 'csv-stringify'

/** Trimmed by a spreadsheet before it decides whether a cell is a formula. */
const TRIMMED = ' \t\r\n\u0000'

const FORMULA_LEADS = ['=', '+', '-', '@']

/**
 * Defuse a cell a spreadsheet would execute - a leading `=`, `+`, `-` or `@`
 * is a formula in Excel and Sheets, and these values come from an incident.
 *
 * Whitespace is trimmed before the test, because the spreadsheet trims first
 * and `" =1+1"` is otherwise missed. An already-quoted formula is prefixed
 * again, since some importers strip one quote back off.
 */
export function neutralise<T>(value: T): T | string {
  if (typeof value !== 'string') return value

  const bare = value.replace(new RegExp(`^[${TRIMMED}]+`), '')
  if (FORMULA_LEADS.some((lead) => bare.startsWith(lead))) return `'${value}`

  if (bare.startsWith("'")) {
    const behind = bare.slice(1).replace(new RegExp(`^[${TRIMMED}]+`), '')
    if (FORMULA_LEADS.some((lead) => behind.startsWith(lead))) return `'${value}`
  }
  return value
}

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
