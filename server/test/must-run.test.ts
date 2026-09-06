/**
 * **The thing that makes a decline loud, attacked at its own silence.**
 *
 * A helper whose whole job is to stop a suite passing vacuously is exactly the
 * kind that can itself go quiet: read the variable wrong, and every caller
 * carries on skipping while the summary says the fix landed.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { declined, mustRun, mustRunWithAStack } from './must-run.js'

const before = { ...process.env }
afterEach(() => {
  process.env = { ...before }
})

/** Sets exactly these two, so a case never inherits the runner's own `CI`. */
function env(ci: string | undefined, must: string | undefined): void {
  if (ci === undefined) delete process.env['CI']
  else process.env['CI'] = ci
  if (must === undefined) delete process.env['IC_SUITE_MUST_RUN']
  else process.env['IC_SUITE_MUST_RUN'] = must
}

describe('a declined suite says so', () => {
  it('returns false where nothing is certifying, so the skip still works', () => {
    env(undefined, undefined)
    expect(mustRun()).toBe(false)
    expect(declined('a tier', 'no stack')).toBe(false)
  })

  it.each([
    ['CI', 'true', undefined],
    ['IC_SUITE_MUST_RUN', undefined, '1'],
  ])('throws when %s says the run certifies', (_name, ci, must) => {
    env(ci, must)
    expect(() => declined('the server tier', 'DATABASE_URL names no database')).toThrow(
      /DATABASE_URL names no database/,
    )
  })

  /**
   * **`||` rather than `??`, and this is the case that tells them apart.** With
   * `??` an empty `CI` is an answer, so `IC_SUITE_MUST_RUN` is never read and a
   * certifying local run skips silently.
   */
  it('reads IC_SUITE_MUST_RUN even when CI is set but empty', () => {
    env('', '1')
    expect(mustRun()).toBe(true)
  })

  /**
   * **A case CI cannot run, told apart from one CI declines to run.**
   *
   * CI raises Postgres and Redis as service containers, so a case needing a
   * *compose project* cannot run there however carefully the workflow is
   * written. Arming it on `CI` turns an honest inability into a failure, and
   * the merge group is where that is discovered rather than the pull request.
   */
  describe('a case that needs a compose stack, which CI does not have', () => {
    it('skips under CI rather than failing', () => {
      env('true', undefined)
      expect(mustRunWithAStack()).toBe(false)
      expect(declined('the roles mode', 'no compose project', { needsAComposeStack: true })).toBe(
        false,
      )
    })

    it('still fails under IC_SUITE_MUST_RUN, which is a run that raised one', () => {
      env(undefined, '1')
      expect(mustRunWithAStack()).toBe(true)
      expect(() =>
        declined('the roles mode', 'no compose project', { needsAComposeStack: true }),
      ).toThrow(/no compose project/)
    })

    it('leaves a case that needs no stack armed by CI', () => {
      env('true', undefined)
      expect(() => declined('the server tier', 'no database')).toThrow(/no database/)
    })
  })

  it('names what declined and why, so the message is actionable', () => {
    env('true', undefined)
    expect(() => declined('The roles mode', 'no postgres container is up')).toThrow(
      /The roles mode declined to run: no postgres container is up/,
    )
  })
})
