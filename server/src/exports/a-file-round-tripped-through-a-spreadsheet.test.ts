/**
 * A file that has been opened and saved by a spreadsheet still cannot execute
 * when it comes back, and still says what the analyst recorded.
 *
 * **What this does not cover:** what a spreadsheet actually does. These are the
 * shapes the application defends against, and no spreadsheet was run to confirm
 * that a particular one produces them.
 */
import { describe, expect, it } from 'vitest'

import { parseCsv } from './csv-import.js'
import { neutralise, toCsv } from './csv.js'

const shape = {
  allowed: new Set(['hostname']),
  ignored: new Set<string>(),
  lists: new Set<string>(),
  booleans: new Set<string>(),
}

/** What the analyst typed. A hostname column is where an indicator lands. */
const RECORDED = '=cmd|/c calc'

/** Leading characters a spreadsheet reads as the start of a formula. */
const EXECUTES = ['=', '+', '-', '@']

/**
 * How a spreadsheet hands a defused cell back, given the guarded form.
 */
const AS_A_SPREADSHEET_RETURNS_IT = [
  ['unchanged', (guarded: string) => guarded],
  ['with the guard stripped', (guarded: string) => guarded.slice(1)],
  ['with a NUL behind the guard', (guarded: string) => `'\u0000${guarded.slice(1)}`],
  ['with a space behind the guard', (guarded: string) => `' ${guarded.slice(1)}`],
] as const

const executes = (cell: string) => EXECUTES.some((lead) => cell.trimStart().startsWith(lead))

describe('a value a spreadsheet would run', () => {
  it('leaves this application guarded, so there is something for a spreadsheet to return', async () => {
    const written = await toCsv([{ hostname: RECORDED }], ['hostname'])
    const cell = written.trim().split('\n')[1]!

    expect(executes(RECORDED), 'the recorded value is not one a spreadsheet would run').toBe(true)
    expect(
      executes(cell),
      'the export wrote a cell a spreadsheet would run, so the cases below are about a file ' +
        'that was never defused',
    ).toBe(false)
  })

  it.each(AS_A_SPREADSHEET_RETURNS_IT)(
    'comes back as itself when the file returns %s',
    async (_how, mangle) => {
      const guarded = neutralise(RECORDED)
      const returned = `hostname\n"${mangle(guarded).replace(/"/g, '""')}"\n`

      const [row] = parseCsv(returned, shape)

      expect(
        row!['hostname'],
        'the value that came back is not the one the analyst recorded, so exporting the case ' +
          'and opening it edited the evidence',
      ).toBe(RECORDED)
    },
  )

  it.each(AS_A_SPREADSHEET_RETURNS_IT)(
    'cannot execute when written out again after returning %s',
    async (_how, mangle) => {
      const guarded = neutralise(RECORDED)
      const returned = `hostname\n"${mangle(guarded).replace(/"/g, '""')}"\n`

      const [row] = parseCsv(returned, shape)
      const again = await toCsv([row!], ['hostname'])
      const cell = again.trim().split('\n')[1]!

      expect(
        executes(cell),
        'the value went out unguarded after a trip through a spreadsheet, so the second file ' +
          'runs what the first would not',
      ).toBe(false)
    },
  )
})
