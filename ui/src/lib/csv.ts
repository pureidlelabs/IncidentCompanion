/**
 * A CSV text into rows of raw string cells. No dependency: the file this
 * reads is small (a table export, not a data lake) and the shape it must
 * accept is fixed - whatever Python's `csv` module writes, since that is
 * what `GET /api/cases/{id}/{collection}.csv` hands out and what this parser
 * has to read back for the round trip to hold.
 *
 * RFC 4180: comma-delimited, `"` quotes a field, `""` inside a quoted field
 * is one literal `"`, and a quoted field may carry a literal comma or
 * newline. `\r\n` and bare `\n` both end a row - Python's writer emits
 * `\r\n` (the `excel` dialect's default), but a file re-saved by an editor
 * commonly carries bare `\n`, and refusing that would refuse an otherwise
 * valid import over a byte the analyst never touched.
 *
 * **A blank physical line yields an empty row (`[]`), not `['']`.** This is
 * `csv.reader`'s own behaviour, not an invented rule: `import_section_csv`
 * on the server zips a short row against the header with `DictReader`'s
 * `restval` (`None`) and then refuses it as "missing a value" - matching
 * that means a stray blank line surfaces as the same problem here, at
 * preview time, instead of a row silently gaining phantom empty columns.
 */

export function parseCsv(text: string): string[][] {
  const source = text.startsWith('\ufeff') ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let sawAnyField = false
  const length = source.length
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    if (row.length === 1 && row[0] === '' && !sawAnyField) {
      rows.push([])
    } else {
      rows.push(row)
    }
    row = []
    sawAnyField = false
  }

  while (i < length) {
    // `.charAt` rather than `source[i]`: always a `string`, so no assertion
    // is needed to satisfy `noUncheckedIndexedAccess` on an index the `while`
    // condition already guarantees is in bounds.
    const char = source.charAt(i)
    if (inQuotes) {
      if (char === '"') {
        if (source.charAt(i + 1) === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
      sawAnyField = true
      i += 1
      continue
    }
    if (char === ',') {
      sawAnyField = true
      endField()
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      endField()
      endRow()
      i += 1
      continue
    }
    sawAnyField = true
    field += char
    i += 1
  }

  if (sawAnyField || field !== '' || row.length > 0) {
    endField()
    endRow()
  }

  return rows
}

/** The header and the data rows, or `null` for an empty file. */
export interface CsvTable {
  header: string[]
  rows: string[][]
}

/**
 * `parseCsv`, split into a header and the rows beneath it.
 *
 * A leading blank line (`[]`) is dropped rather than read as the header - a
 * table's own export never starts with one, and reading `[]` as the header
 * would report every real column as unknown.
 */
export function parseCsvTable(text: string): CsvTable | null {
  const rows = parseCsv(text).filter((row) => row.length > 0)
  const [header, ...data] = rows
  if (!header) return null
  return { header, rows: data }
}
