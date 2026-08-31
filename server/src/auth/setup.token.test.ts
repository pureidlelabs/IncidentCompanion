/**
 * The token that gates claiming a fresh install: that it is unguessable, that
 * it matches only itself, and that a null expectation refuses everything.
 *
 * **The constant-time property is held by asserting `timingSafeEqual` is the
 * function that ran, not by timing anything** - a timing assertion is flaky
 * on a shared machine. The boolean outcome alone cannot hold this: `===`
 * returns the same true/false as `timingSafeEqual` for every input, so a test
 * that only reads `matchesToken`'s return value cannot tell them apart. Two
 * same-length wrong tokens are what forces the comparison to run at all
 * rather than being answered by the length guard first.
 */
import { timingSafeEqual } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})

import { matchesToken, mintToken } from './setup.token.js'

describe('the setup token', () => {
  it('accepts the token it minted', () => {
    const token = mintToken()
    expect(matchesToken(token, token)).toBe(true)
  })

  it('refuses anything else', () => {
    const token = mintToken()
    expect(matchesToken(token, `${token}x`)).toBe(false)
    expect(matchesToken(token, token.slice(0, -1))).toBe(false)
    expect(matchesToken(token, '')).toBe(false)
  })

  /**
   * **A different token every time, and enough of it.** A predictable token is
   * no gate at all, and a short one is a gate somebody can walk through in the
   * seconds an install is unclaimed.
   */
  it('mints an unguessable token', () => {
    const one = mintToken()
    const two = mintToken()
    expect(one).not.toBe(two)
    expect(one.length).toBeGreaterThanOrEqual(32)
    expect(one).toMatch(/^[0-9a-f]+$/)
  })

  /**
   * **No token means no claim, not a free one.** If the process never minted
   * one - the install is already claimed, so none exists - every candidate
   * must fail rather than an empty expectation matching an empty submission.
   */
  it('refuses everything when there is no token to match', () => {
    expect(matchesToken(null, '')).toBe(false)
    expect(matchesToken(null, 'anything')).toBe(false)
  })

  /**
   * **A same-length wrong token is the case the length guard cannot answer**,
   * so this is the only input that reaches the comparison. Asserting the real
   * `timingSafeEqual` ran is the one thing a return-value assertion cannot
   * do: `===` gives the identical `false` for two unequal same-length
   * strings, so this test would stay green under that swap unless it checks
   * which function actually ran.
   */
  it('reaches the constant-time comparison on a same-length wrong token', () => {
    const spy = vi.mocked(timingSafeEqual)
    spy.mockClear()

    const token = mintToken()
    const wrongSameLength = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0')

    expect(matchesToken(token, wrongSameLength)).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
