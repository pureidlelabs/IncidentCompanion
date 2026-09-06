/**
 * That a count accepts what a form sends, and keeps unanswered apart from zero.
 *
 * **Written from the defect.** `z.number()` on a field an analyst types into is
 * refused for every value they can produce, because an HTML input posts a
 * string - and it surfaces as a save that quietly does nothing rather than as
 * a message on the field.
 *
 * **The zero case is the one worth the test.** `z.coerce.number()` turns both
 * `''` and `null` into `0`, which would answer "nobody was affected" to a
 * question nobody has counted yet - under Art 33(3)(a) that is a different
 * notification.
 */
import { describe, expect, it } from 'vitest'

import { impactSchema } from './entities/impact.js'
import { optionalCount } from './vocabularies.js'

const count = optionalCount()

describe('a count an analyst may leave unanswered', () => {
  it.each([
    ['1240', 1240],
    [1240, 1240],
    ['0', 0],
    [0, 0],
  ])('takes %p and stores %p', (given, stored) => {
    const parsed = count.safeParse(given)
    expect(parsed.success && parsed.data).toBe(stored)
  })

  it.each([[''], [null], [undefined]])('reads %p as unanswered, not as zero', (given) => {
    const parsed = count.safeParse(given)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toBeNull()
  })

  it.each([['-1'], ['1.5'], ['abc'], [true], [{}]])('refuses %p', (given) => {
    expect(count.safeParse(given).success).toBe(false)
  })

  /**
   * Through the real schema, not only the helper: a field wired with the wrong
   * builder passes every case above and still refuses the analyst.
   */
  it('is what impact writes its three counts through', () => {
    for (const name of ['subjectCount', 'recordCount', 'volumeBytes']) {
      const parsed = impactSchema.safeParse({ label: 'x', [name]: '42' })
      expect(parsed.success, `${name} refused a typed number`).toBe(true)
      expect((parsed as { data: Record<string, unknown> }).data[name]).toBe(42)
    }
  })
})
