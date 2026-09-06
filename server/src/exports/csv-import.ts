/**
 * Reading a CSV back into rows.
 *
 * **The inverse of `csv.ts`, and it has to be exact.** The file this app hands
 * out is a file it must be able to take back - so every transformation the
 * writer applies is undone here, and the two are edited together or a round
 * trip stops being lossless.
 *
 * **`csv-parse` does the parsing.** What stays here is the part a parser has
 * no opinion about: which columns are allowed, what a list looks like, what
 * counts as a boolean, and the two rules that exist only because of the writer
 * - dropping `id`, and removing the quote that defused a formula.
 */
import { parse } from 'csv-parse/sync'

/** A 10MB file is already far past what anyone pastes in; past it is a mistake. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024
export const MAX_CSV_ROWS = 50_000

/**
 * Columns a reference picker writes for a human and the app never reads.
 *
 * A header of `systems_display` beside `systems` is dropped rather than refused
 * as unknown, so a file carrying the pair still imports.
 */
const DISPLAY_SUFFIX = '_display'

const TRUE = new Set(['true', '1', 'yes'])
const FALSE = new Set(['false', '0', 'no', ''])

export interface CsvShape {
  /** Every column the collection accepts, spelled as the header spells it. */
  readonly allowed: ReadonlySet<string>
  /**
   * Columns to drop rather than refuse.
   *
   * **The export writes more than an import may write** - the id, the case,
   * the version, the attribution and the timestamps are all the server's, and
   * all useful to read. Refusing them would make the file this app hands out
   * the one file it will not take back; honouring them would let a client set
   * its own version and author.
   */
  readonly ignored: ReadonlySet<string>
  /** Columns holding a `;`-joined list. */
  readonly lists: ReadonlySet<string>
  readonly booleans: ReadonlySet<string>
}

export class CsvInvalid extends Error {}

/**
 * Undo `neutralise`.
 *
 * **A round trip must not accumulate quotes.** The writer prefixes `=1+1` to
 * `'=1+1`; reading that back as a literal apostrophe means every export/import
 * cycle grows one, and the value silently stops matching the indicator it came
 * from.
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
 *
 * **A second parse, limited to the first line**, because `columns: true`
 * consumes the header into the row objects and leaves no way to ask for it when
 * there are no rows. Parsed rather than split on commas so a quoted name
 * containing one is still read as a single column.
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
 *
 * **Every refusal names the row number**, counting the header as line 1. A
 * parser that says only "invalid CSV" for a 4,000-line file has told the
 * analyst to go and find it themselves.
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
   * **Read from the file, not from the first row.** `Object.keys(parsed[0])` is
   * empty when a file has a header and no rows, so the unknown-column check
   * below would have nothing to look at and any header at all would pass: a
   * spreadsheet for another collection, or a body that is not a CSV, imported
   * as nothing.
   */
  const headers = columnsOf(text, parsed).filter((name) => !name.endsWith(DISPLAY_SUFFIX))
  if (headers.length === 0) {
    throw new CsvInvalid('CSV has no header row, so there is nothing to import.')
  }
  if (headers.some((name) => !name.trim())) throw new CsvInvalid('CSV has an empty column name.')

  /**
   * **`id` is dropped whatever the caller's `ignored` set holds.** The export
   * writes it, so refusing it would make the app's own file unimportable, and
   * honouring it would collide with the rows already holding those ids.
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
