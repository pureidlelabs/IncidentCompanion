import { describe, expect, it } from 'vitest'

import { orderedLanguages } from './document/packs.js'
import { reportLayoutsSchema } from './views.js'

/**
 * **Coverage reaches the control the choice is made in.**
 *
 * A pack carries any fraction of the application's words, and a pack at 12%
 * and one at 100% must not read identically in the picker a report is set
 * from.
 *
 * **Asserted against the published schema rather than the handler**, because
 * the schema is what the serializer enforces: a field the handler computes and
 * the schema omits does not cross.
 */
describe('the languages the report screen is given', () => {
  const view = {
    layouts: [],
    stages: [''],
    tlp: [''],
    headings: [],
    languages: [
      { code: 'en', label: 'English', coverage: 1 },
      { code: 'nl', label: 'Nederlands', coverage: 0.12 },
    ],
  }

  it('carry what fraction of the words each one holds', () => {
    const parsed = reportLayoutsSchema.parse(view)

    expect(parsed.languages).toEqual([
      { code: 'en', label: 'English', coverage: 1 },
      { code: 'nl', label: 'Nederlands', coverage: 0.12 },
    ])
  })

  /**
   * The control for the case above: the service always answers with coverage,
   * so a schema that dropped it would be dropping something real rather than
   * declining to invent one.
   */
  it('is what the service answers with, English included', () => {
    const listed = orderedLanguages([
      { code: 'nl', label: 'Nederlands', coverage: 0.12, builtin: false },
    ])

    expect(listed.every((one) => typeof one.coverage === 'number')).toBe(true)
  })
})
