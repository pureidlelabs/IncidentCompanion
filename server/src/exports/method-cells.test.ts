/**
 * That a cell which arrived from a dropped console export cannot execute when
 * the case is written back out.
 *
 * **This is the first inbound file in the app**, and the guard it needs turned
 * out to already exist pointing the other way: `neutralise` runs on the *write*
 * side, and every path a stored cell can reach a spreadsheet by goes through
 * `toCsv`. So the control is real; what it was missing is a test saying so for
 * the one collection whose values come out of somebody else's file.
 *
 * **An untested control and an absent one fail the same way**, which is why
 * this file exists rather than a sentence in a docstring.
 */
import { describe, expect, it } from 'vitest'

import { neutralise, toCsv } from './csv.js'
import { methodSchema } from '../domain/entities/method.js'

/** What a header row out of a hostile export looks like. */
const HOSTILE = [
  '=cmd|\'/c calc\'!A1',
  '+1+1',
  '-2+3',
  '@SUM(1+1)',
  ' =1+1',
  '\t=1+1',
  "'=1+1",
]

describe('a formula that arrived in a dropped export', () => {
  it.each(HOSTILE)('is neutralised on the way back out: %j', async (cell) => {
    const csv = await toCsv([{ result_columns: cell }], ['result_columns'])
    const written = csv.split('\n')[1] ?? ''

    // The value survives; what changes is that a spreadsheet reads it as text.
    expect(neutralise(cell)).toBe(`'${cell}`)
    expect(written).toContain("'")
  })

  /** The trim matters: a spreadsheet trims before deciding, so a naive check misses. */
  it('catches a formula hiding behind whitespace', () => {
    expect(neutralise('   =1+1')).toBe("'   =1+1")
  })

  /** And an already-quoted one, since some importers strip one quote back off. */
  it('catches a formula behind a quote a previous export added', () => {
    expect(neutralise("'=1+1")).toBe("''=1+1")
  })

  it('leaves an ordinary column name alone', () => {
    for (const name of ['SourceIP', 'DestinationHostName', 'Sent', 'TimeGenerated']) {
      expect(neutralise(name)).toBe(name)
    }
  })
})

describe('what the schema does to a hostile cell before it is ever stored', () => {
  const parse = (columns: string) =>
    methodSchema.parse({ name: 'M', resultColumns: columns }).resultColumns

  /**
   * **A header row is analyst-supplied text and never a schema.** It is stored
   * as one string in one column, so no column name can become a field name.
   */
  it('stores the header row as one opaque string', () => {
    expect(parse('SourceIP;DestinationIP;Sent')).toBe('SourceIP;DestinationIP;Sent')
  })

  it('strips the characters nobody can see, bidi overrides included', () => {
    expect(parse('Source\u202eIP\u0000;Sent\u200b')).toBe('SourceIP;Sent')
  })

  /** A header row is one line. A newline in it is a shape nobody exported. */
  it('keeps a formula lead rather than editing the analyst\u2019s evidence', () => {
    // Cleaning is not neutralising: the value is stored as it arrived, and the
    // export is where it is defused. Editing it here would leave the case
    // saying a column was named something it was not.
    expect(parse('=1+1')).toBe('=1+1')
  })

  it('refuses a header row past the column ceiling', () => {
    expect(methodSchema.safeParse({ name: 'M', resultColumns: 'a'.repeat(2001) }).success).toBe(
      false,
    )
  })
})
