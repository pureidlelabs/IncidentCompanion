/**
 * That an entity's add door names the thing it adds, not the section it is in.
 *
 * **A trailing `s` is not a plural.** The label was derived by stripping one
 * from the scope's title, which is right for *Assets* and *Accounts* and wrong
 * for the two mass nouns: `Network` and `Malware` lose an `s` that was never
 * there, so the door named the whole section and an analyst pressing it was
 * adding one address or one file. -> #16
 *
 * **The word is the application's own.** Each collection publishes a noun, and
 * the screens read it rather than carrying a second vocabulary that can drift
 * from it.
 */
import { NOUNS } from '@contract/collections'
import { describe, expect, it } from 'vitest'

import { ENTITY_KINDS, addLabel } from './entity-scope'

describe('the add door', () => {
  it('offers one for every kind, so none is checked by nothing', () => {
    expect(ENTITY_KINDS.length).toBe(5)
  })

  it.each(ENTITY_KINDS.map((kind) => [kind.title, kind] as const))(
    'names what it adds on %s',
    (_title, kind) => {
      const noun = NOUNS[kind.collection]
      expect(noun, `${kind.collection} publishes no noun for a door to use`).toBeDefined()
      expect(addLabel(kind)).toBe(`Add ${noun!}`)
    },
  )

  /**
   * The two the derivation got wrong, named rather than left to the loop
   * above: a rule that stops deriving would pass it while these are the
   * labels a reader wants to see written down.
   */
  it.each([
    ['Network', 'Add network indicator'],
    ['Malware', 'Add malware sample'],
    ['Assets', 'Add asset'],
    ['Cloud Apps', 'Add cloud app'],
  ])('reads %s as "%s"', (title, expected) => {
    const kind = ENTITY_KINDS.find((one) => one.title === title)
    expect(kind, `no kind titled ${title}`).toBeDefined()
    expect(addLabel(kind!)).toBe(expected)
  })
})
