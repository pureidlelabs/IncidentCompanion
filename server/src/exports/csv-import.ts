/**
 * Reading a CSV back into rows.
 */
import { parse } from 'csv-parse/sync'

/** A 10MB file is already far past what anyone pastes in; past it is a mistake. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024
export const MAX_CSV_ROWS = 50_000

/**
 * Columns a reference picker writes for a human and the app never reads.
 */
const DISPLAY_SUFFIX = '_display'

const TRUE = new Set(['true', '1', 'yes'])
const FALSE = new Set(['false', '0', 'no', ''])

export interface CsvShape {
  /** Every column the collection accepts, spelled as the header spells it. */
  readonly allowed: ReadonlySet<string>
  /**
   * Columns to drop rather than refuse.
   */
  readonly ignored: ReadonlySet<string>
  /** Columns holding a `;`-joined list. */
  readonly lists: ReadonlySet<string>
  readonly booleans: ReadonlySet<string>
}

export class CsvInvalid extends Error {}

/**
 * Undo `neutralise`.
 */
function unquote(value: string): string {
  if (!value.startsWith("'")) return value
  // The NUL is the point: a spreadsheet writes one between the guard quote and
  // the formula, and leaving it in is how a re-imported value stops matching
  // the indicator it came from.
  // eslint-disable-next-line no-control-regex
  const behind = value.slice(1).replace(/^[ \t\r\n\u0000]+/, '')
  return ['=', '+', '-', '@'].some((lead) => behind.startsWith(lead)) ? behind : value
}

/**
 * The column names, whether or not a single data row followed them.
 */
function columnsOf(text: string, parsed: Record<string, unknown>[]): string[] {
  if (parsed.length > 0) return Object.keys(parsed[0]!)
  try {
    const [first] = parse(text, { to_line: 1, columns: false, skip_empty_lines: true, bom: true })
    return (first ?? []).filter((name) => name.trim() !== '')
  } catch {
    // A first line this parser cannot read is not a header, which the caller
    // reports as the file having none.
    return []
  }
}

/**
 * Rows from CSV text, or a `CsvInvalid` naming the row that is wrong.
 */
export function parseCsv(text: string, shape: CsvShape): Record<string, unknown>[] {
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) {
    throw new CsvInvalid(`CSV exceeds the ${MAX_CSV_BYTES / 1024 / 1024}MB import limit.`)
  }

  let parsed: Record<string, string | undefined>[]
  try {
    parsed = parse(text, {
      columns: true,
      skip_empty_lines: true,
      // **Not relaxed.** A row with more values than headers is a file that
      // was edited badly, and guessing which column the extra belongs to is
      // how an import writes a value into the wrong field.
      relax_column_count: false,
      bom: true,
    })
  } catch (error) {
    throw new CsvInvalid(`CSV is invalid: ${(error as Error).message}`)
  }

  if (parsed.length > MAX_CSV_ROWS) {
    throw new CsvInvalid(`CSV exceeds the ${MAX_CSV_ROWS} row import limit.`)
  }

  /**
   * **Read from the file, not from the first row - and that distinction was a
   * defect.**
   */
  const headers = columnsOf(text, parsed).filter((name) => !name.endsWith(DISPLAY_SUFFIX))
  if (headers.length === 0) {
    throw new CsvInvalid('CSV has no header row, so there is nothing to import.')
  }
  if (headers.some((name) => !name.trim())) throw new CsvInvalid('CSV has an empty column name.')

  /**
   * **A server-owned column is dropped, not refused.**
   */
  const wanted = headers.filter((name) => name !== 'id' && !shape.ignored.has(name))

  const unknown = wanted.filter((name) => !shape.allowed.has(name))
  if (unknown.length > 0) {
    throw new CsvInvalid(`CSV has unknown columns: ${unknown.sort().join(', ')}.`)
  }

  return parsed.map((raw, index) => {
    const line = index + 2
    const row: Record<string, unknown> = {}

    for (const name of wanted) {
      const value = raw[name]
      // `csv-parse` leaves a short row's missing cells undefined rather than
      // failing, so the check is here and not in its options.
      if (value === undefined) throw new CsvInvalid(`CSV row ${line} is missing a value.`)

      if (shape.lists.has(name)) {
        row[name] = value
          .split(';')
          .map((item) => unquote(item.trim()))
          .filter((item) => item.length > 0)
        continue
      }
      if (shape.booleans.has(name)) {
        const flag = value.trim().toLowerCase()
        if (TRUE.has(flag)) row[name] = true
        else if (FALSE.has(flag)) row[name] = false
        else throw new CsvInvalid(`CSV row ${line} has an invalid boolean in ${name}.`)
        continue
      }
      row[name] = unquote(value)
    }
    return row
  })
}
