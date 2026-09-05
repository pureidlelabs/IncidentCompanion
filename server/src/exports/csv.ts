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
 * How a value reaches a cell. A list is `;`-joined, which is a contract with
 * `csv-import.ts` - it splits on `;`, and a comma would round-trip a two-item
 * list back as one value. A `Date` goes out as ISO 8601.
 */
function cell(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return neutralise(value.map((item) => String(item)).join(';'))
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
