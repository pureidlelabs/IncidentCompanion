/**
 * **What a refused key time tells the client.**
 *
 * The form commits a field on blur and a stamp is two controls, so filling the
 * date and moving to the time sends the pair still incomplete. That was refused
 * with *Invalid input: expected date, received Date* -- the same thing named
 * twice, describing neither what was sent nor what would be taken. -> #345
 *
 * **What this does not settle:** whether an empty value should be *accepted*,
 * clearing a stamp somebody set by mistake. `openspec/specs/cases/spec.md`
 * states no requirement about clearing one, so that is a decision rather than
 * something to infer from a validator, and it is still open on #345.
 */
import { describe, expect, it } from 'vitest'

import { caseFormSchema } from './case.js'

/** The first refusal for `containedAt`, or nothing if it was taken. */
function refusalFor(value: unknown): string | undefined {
  const parsed = caseFormSchema.partial().safeParse({ containedAt: value })
  if (parsed.success) return undefined
  return parsed.error.issues.find((one) => one.path[0] === 'containedAt')?.message
}

describe('a key time the server will not take', () => {
  /**
   * The half-filled pair the form actually sends. Named as the shape rather
   * than as "empty string", because that is what reaches the route.
   */
  it('names the condition rather than restating the type', () => {
    const said = refusalFor('')

    expect(said, 'an incomplete stamp was accepted').toBeDefined()
    expect(
      said,
      'the refusal is the coercion\'s own, which names the same thing twice',
    ).not.toMatch(/expected date, received Date/)
    expect(said).toBe('Not a date.')
  })

  /** Anything unreadable gets the same answer, since by then it is the same value. */
  it('answers the same for a value that is not a date at all', () => {
    expect(refusalFor('not-a-date')).toBe('Not a date.')
  })

  /**
   * The other direction, so the fix cannot be "refuse everything": what the
   * field takes today it still takes. `null` is the field's own contract --
   * it is `nullable()` -- and is not the empty string this issue is about.
   */
  it.each([
    ['a full stamp', '2026-03-14T09:30:00Z'],
    ['a date with no time', '2026-03-14'],
    ['null', null],
  ])('still takes %s', (_name, value) => {
    expect(refusalFor(value)).toBeUndefined()
  })
})
