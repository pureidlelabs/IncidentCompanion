import { describe, expect, it } from 'vitest'

import { blockValues } from './content.seeder.js'
import { DEMO_REPORTS } from './reports.js'

/**
 * What a seeded report block carries out of its fixture.
 *
 * **The row was composed inline inside the insert**, where no test could reach
 * it - so a field the fixture declared and the insert did not name was lost in
 * silence, and the only way to see it was to seed a database and read a screen.
 * This is the same mapping, in a function a unit test can hold.
 */
describe('a seeded block carries every heading its fixture declares', () => {
  /**
   * **`heading` and `headingKey` are two fields, not one.** A generated section
   * wants a title the language pack supplies; a written one wants the words the
   * analyst typed. The seeder named only the key, so every block declaring a
   * typed heading arrived with none - measured across the fixture: 13 blocks,
   * 9 of them the whole written section of a sent report.
   */
  it('keeps a typed heading', () => {
    const row = blockValues({ kind: 'written', heading: 'Handover to the incoming shift' }, 0)

    expect(row.heading).toBe('Handover to the incoming shift')
    expect(row.headingKey).toBe('')
  })

  it('keeps a language-pack key', () => {
    const row = blockValues({ kind: 'written', headingKey: 'heading.exec_summary' }, 3)

    expect(row.headingKey).toBe('heading.exec_summary')
    expect(row.heading).toBe('')
    expect(row.position).toBe(3)
  })

  /**
   * A generated section declares neither, and both columns are `text()` rather
   * than nullable - an undefined would be written as null and read back as a
   * heading the screen cannot render.
   */
  it('defaults both to the empty string where a fixture names neither', () => {
    const row = blockValues({ kind: 'case_header' }, 0)

    expect(row).toMatchObject({ kind: 'case_header', heading: '', headingKey: '', position: 0 })
  })

  /**
   * The claim the fixture makes about itself, held against the mapping: every
   * heading either tier declares survives. Break this function's `heading` line
   * and this fails with the count, which is what the inline version could not
   * do.
   */
  it('loses nothing the shipped fixtures declare', () => {
    const declared = Object.values(DEMO_REPORTS)
      .flat()
      .flatMap((report) => report.blocks)
      .filter((block) => block.heading !== undefined || block.headingKey !== undefined)

    const carried = declared.filter((block) => {
      const row = blockValues(block, 0)
      return row.heading === (block.heading ?? '') && row.headingKey === (block.headingKey ?? '')
    })

    expect(carried).toHaveLength(declared.length)
    expect(declared.length).toBeGreaterThan(0)
  })
})
