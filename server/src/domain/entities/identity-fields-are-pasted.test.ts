import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { IDENTITY_FIELDS } from '../../collections/identity.js'
import { COLLECTION_SCHEMAS } from '../collections.js'

/**
 * **A ratchet, not an audit.** Every field the case is keyed or laddered on
 * must survive a paste, and the list is read from `identity.ts` rather than
 * written here -- so a field added to a ladder demands the normaliser on the
 * same day rather than whenever somebody next reads this file.
 *
 * **What it is holding closed is silent in three directions at once.** An
 * invisible character renders as nothing, so the dialog looks right; `keyOf`
 * compares the stored string, so the row never matches its own re-import and
 * the table doubles; `hashTypeOf` reads a digest's algorithm from its length,
 * so a padded hash leaves the STIX export with no algorithm. Measured
 * 2026-08-26 before the fix: every one of these fields stored the character.
 */
const ZWSP = '\u200b'

describe('every field an identity is made of survives a paste', () => {
  const named = Object.entries(IDENTITY_FIELDS)

  it('names at least the five collections that have an identity', () => {
    expect(named.length).toBeGreaterThanOrEqual(5)
  })

  it.each(named.flatMap(([collection, fields]) => fields.map((f) => [collection, f] as const)))(
    'strips an invisible character from %s.%s',
    (collection, field) => {
      const schema = COLLECTION_SCHEMAS[collection]
      expect(schema, `${collection} publishes no schema`).toBeDefined()

      const shape = schema!.shape[field] as z.ZodType | undefined
      expect(shape, `${collection} has no ${field} column`).toBeDefined()

      // **A closed vocabulary is skipped rather than exempted.** `type` on an
      // indicator is an enum, so it cannot hold a character that is not one of
      // its members and there is nothing for a normaliser to do. Detected by
      // asking whether the column takes free text at all, so a column that
      // stops being an enum is covered the same day.
      if (!shape!.safeParse('web01').success) return

      const held = shape!.parse(`web01${ZWSP}`)
      expect(held, `${collection}.${field} stored an invisible character`).toBe('web01')
    },
  )
})

/**
 * **The other door onto the same key.** `keyOf` runs on a mapped provider row
 * before any schema has parsed it, so a clean store is only half the fix: an
 * incoming row carrying an invisible character keys differently from the
 * stored row it *is*, and the import writes a second one.
 */
describe('the key a row is known by ignores what nobody can see', () => {
  it('keys a pasted hostname as the hostname', async () => {
    const { keyOf } = await import('../../collections/identity.js')
    expect(keyOf('systems', { hostname: `web01${ZWSP}` })).toBe(
      keyOf('systems', { hostname: 'web01' }),
    )
  })

  it('keys a padded digest as the digest', async () => {
    const { keyOf } = await import('../../collections/identity.js')
    const digest = 'd41d8cd98f00b204e9800998ecf8427e'
    expect(keyOf('malware', { hash: `d41d8cd98f00b204${ZWSP}e9800998ecf8427e` })).toBe(
      keyOf('malware', { hash: digest }),
    )
  })
})
