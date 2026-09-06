/**
 * Reading a CSV back, attacked at the round trip and at the malformed file.
 *
 * **The round trip is the property that matters.** The app hands out a file it
 * has to be able to take back, so the writer's two transformations - the id
 * column and the formula quote - each need an inverse, and a test that only
 * parses a hand-written CSV never exercises either.
 */
import { describe, expect, it } from 'vitest'

import { parseCsv, CsvInvalid, MAX_CSV_BYTES } from './csv-import.js'
import { toCsv } from './csv.js'

const shape = {
  allowed: new Set(['hostname', 'system_type', 'isolated', 'tags']),
  ignored: new Set(['version', 'created_at']),
  lists: new Set(['tags']),
  booleans: new Set(['isolated']),
}

describe('parsing', () => {
  it('reads a header and one object per row', () => {
    const rows = parseCsv('hostname,system_type\nWKS-01,laptop\nWKS-02,server\n', shape)
    expect(rows).toEqual([
      { hostname: 'WKS-01', system_type: 'laptop' },
      { hostname: 'WKS-02', system_type: 'server' },
    ])
  })

  it('splits a list column on semicolons and drops the empties', () => {
    const [row] = parseCsv('hostname,tags\nWKS-01,a;;b;\n', shape)
    expect(row!['tags']).toEqual(['a', 'b'])
  })

  it.each([
    ['true', true],
    ['1', true],
    ['YES', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['', false],
  ])('reads %j as the boolean %s', (given, expected) => {
    const [row] = parseCsv(`hostname,isolated\nWKS-01,${given}\n`, shape)
    expect(row!['isolated']).toBe(expected)
  })

  /**
   * **Refused, not guessed.** "maybe" is a file somebody edited by hand, and
   * choosing `false` for it writes an answer the analyst never gave.
   */
  it('refuses a boolean it does not recognise, naming the row', () => {
    expect(() => parseCsv('hostname,isolated\nWKS-01,maybe\n', shape)).toThrow(/row 2/)
  })
})

describe('a file that is not this collection\u2019s CSV', () => {
  /**
   * **The header is what says which collection a file is for**, and a file with
   * none is refused rather than reported as an import of nothing. A JSON body is
   * the sharp case: `columns: true` makes its first line the header, no data rows
   * follow, and the unknown-column check has nothing to look at unless the header
   * is read from the file itself.
   */
  it('refuses a body that is not a CSV for this collection', () => {
    expect(() => parseCsv('{"__not_a_field__":{"nested":[1,2,3]}}', shape)).toThrow(CsvInvalid)
  })

  it('refuses an unknown header even when no rows follow it', () => {
    expect(() => parseCsv('nonsense,other\n', shape)).toThrow(/unknown columns/)
  })

  /**
   * **An empty body is what this route receives for a JSON request.** The
   * handler reads the raw request stream and Nest's JSON body parser has already
   * consumed it, so the import runs on an empty string - which is a refusal, not
   * an import of nothing.
   */
  it('refuses a body with no header at all', () => {
    expect(() => parseCsv('', shape)).toThrow(CsvInvalid)
    expect(() => parseCsv('   \n', shape)).toThrow(CsvInvalid)
  })

  /**
   * **The other half, and the one that costs something to get wrong.** A file
   * the app exported with nothing in it yet is a legitimate import of zero
   * rows - refusing it would make the app's own file the one file it will not
   * take back, which is the property `ignored` exists to protect.
   */
  it('accepts its own header with no rows as an import of nothing', () => {
    expect(parseCsv('hostname,system_type\n', shape)).toEqual([])
  })
})

describe('the round trip', () => {
  it('drops an id column instead of refusing the file', async () => {
    const csv = await toCsv([{ id: 'abc', hostname: 'WKS-01' }], ['id', 'hostname'])
    const rows = parseCsv(csv, shape)
    expect(rows).toEqual([{ hostname: 'WKS-01' }])
  })

  it('removes the quote that defused a formula, so a cycle is lossless', async () => {
    const original = '=cmd|/c calc'
    const csv = await toCsv([{ hostname: original }], ['hostname'])
    expect(csv).toContain("'=cmd")

    const [row] = parseCsv(csv, shape)
    expect(row!['hostname']).toBe(original)
  })

  it("keeps a leading apostrophe that is part of the value", () => {
    const [row] = parseCsv("hostname\n'tis a name\n", shape)
    expect(row!['hostname']).toBe("'tis a name")
  })

  /**
   * **The separator is `;` on both sides.** A comma would come back as one value
   * holding a comma, and it forces the cell to be quoted as well - the worse
   * choice twice over.
   */
  it('round-trips a list column', async () => {
    const csv = await toCsv([{ tags: ['alpha', 'beta'] }], ['tags'])
    const [row] = parseCsv(csv, shape)
    expect(row!['tags']).toEqual(['alpha', 'beta'])
  })

  /**
   * **An empty list comes back empty, not as `['']`.** The second column is
   * not decoration: a row whose every cell is blank *is* a blank line, and
   * `skip_empty_lines` drops it - so a one-column fixture would test the
   * parser's line handling rather than its list handling.
   */
  it('round-trips a list holding one value, and an empty one', async () => {
    const one = parseCsv(await toCsv([{ hostname: 'A', tags: ['solo'] }], ['hostname', 'tags']), shape)
    expect(one[0]!['tags']).toEqual(['solo'])

    const none = parseCsv(await toCsv([{ hostname: 'B', tags: [] }], ['hostname', 'tags']), shape)
    expect(none[0]!['tags']).toEqual([])
  })

  it('survives a value holding a comma, a quote and a newline', async () => {
    const original = 'a,b "c"\nd'
    const csv = await toCsv([{ hostname: original }], ['hostname'])
    const [row] = parseCsv(csv, shape)
    expect(row!['hostname']).toBe(original)
  })

  it('ignores a _display column rather than calling it unknown', () => {
    const rows = parseCsv('hostname,tags_display\nWKS-01,Some Host\n', shape)
    expect(rows).toEqual([{ hostname: 'WKS-01' }])
  })
})

describe('a byte order mark from a spreadsheet', () => {
  /**
   * **A spreadsheet writes a BOM on save, and this app's own export must
   * survive going through one.** The mark sits in front of the first header
   * name, so a parser that ignores it reads `hostname` as an unknown column.
   */
  it("takes back its own export after a spreadsheet has put a byte order mark on it", async () => {
    const csv = await toCsv([{ hostname: 'WKS-01' }], ['hostname'])
    const rows = parseCsv('\uFEFF' + csv, shape)
    expect(rows).toEqual([{ hostname: 'WKS-01' }])
  })

  it('accepts a BOM-marked header with no rows as an import of nothing', () => {
    expect(parseCsv('\uFEFFhostname,system_type\n', shape)).toEqual([])
  })
})

describe('refusing a bad file', () => {
  it('refuses a column the collection does not have, naming it', () => {
    expect(() => parseCsv('hostname,nonsense\nWKS-01,x\n', shape)).toThrow(/nonsense/)
  })

  /**
   * **A short row is missing a value, not full of empties.** Guessing which
   * column the analyst omitted is how an import writes into the wrong field.
   */
  it('refuses a row with fewer values than headers', () => {
    expect(() => parseCsv('hostname,system_type\nWKS-01\n', shape)).toThrow(CsvInvalid)
  })

  it('refuses a row with more values than headers', () => {
    expect(() => parseCsv('hostname\nWKS-01,extra\n', shape)).toThrow(CsvInvalid)
  })

  it('refuses an empty column name', () => {
    expect(() => parseCsv('hostname,,\nWKS-01,x,y\n', shape)).toThrow(CsvInvalid)
  })

  it('refuses a file past the byte limit before parsing it', () => {
    const huge = `hostname\n${'x'.repeat(MAX_CSV_BYTES)}\n`
    expect(() => parseCsv(huge, shape)).toThrow(/import limit/)
  })

  it('reads an empty file as no rows rather than failing', () => {
    expect(parseCsv('hostname\n', shape)).toEqual([])
  })
})
