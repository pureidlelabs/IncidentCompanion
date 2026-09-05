/**
 * Writing a collection out as CSV.
 */
import { stringify } from 'csv-stringify'

/** Trimmed by a spreadsheet before it decides whether a cell is a formula. */
const TRIMMED = ' \t\r\n\u0000'

const FORMULA_LEADS = ['=', '+', '-', '@']

/**
 * Defuse a cell a spreadsheet would execute - a leading `=`, `+`, `-` or `@`
 * is a formula in Excel and Sheets, and these values come from an incident.
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
 * How a value reaches a cell.
 */
function cell(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return neutralise(value.map((item) => String(item)).join(';'))
  if (value instanceof Date) return value.toISOString()
  return neutralise(value)
}

/**
 * Rows to CSV text, with a header in the order given.
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
