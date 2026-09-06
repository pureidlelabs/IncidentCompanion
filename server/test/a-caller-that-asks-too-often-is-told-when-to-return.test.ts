/**
 * A caller over the limit is refused, and the refusal says when to come back.
 *
 * Driven through a booted app rather than against the guard, because the
 * property is what a caller receives: a guard that computes the right answer
 * and a response that does not carry it are the same thing from outside.
 *
 * **The general tiers, not the strict one.** `TIERS[0]` (`auth`) applies only
 * to `/api/auth/*`, which Better Auth's middleware answers before any guard
 * runs -- so it can never refuse anything and there is nothing here to
 * demonstrate. -> #190. What limits the credential routes is Better Auth's own
 * rules, production-gated, which a suite outside production cannot reach
 * without changing what it is testing.
 *
 * **`/api/health` is chosen because it needs no session.** A 401 and a 429 both
 * being refusals, a route that also refuses anonymously would leave the test
 * unable to say which control answered.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { TIERS } from '../src/throttle/tiers.js'

/** Named from the tier list, so a retuned limit is not a failure here. */
const BURST = TIERS.find((tier) => tier.name === 'burst')!

let harness: Harness | null = null

describe.skipIf(!(await bootable()))('a caller asking faster than the install permits', () => {
  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * Fired at once rather than in a loop: the burst window is one second, and a
   * sequential loop over a real socket can outlast it and never exceed
   * anything.
   */
  const rush = (n: number) =>
    Promise.all(Array.from({ length: n }, () => fetch(`${harness!.base}/api/health`)))

  it('lets the permitted number through and refuses the rest', async () => {
    const answers = await rush(BURST.limit * 3)

    const allowed = answers.filter((one) => one.status === 200)
    const refused = answers.filter((one) => one.status === 429)

    expect(allowed).toHaveLength(BURST.limit)
    expect(refused).toHaveLength(BURST.limit * 2)
  })

  /**
   * **The second half of the scenario, and the half a status code cannot
   * carry.** A 429 alone tells a caller to stop and not when to resume, which
   * leaves polling as the only strategy available to it.
   *
   * The header is `retry-after-burst` rather than `Retry-After`:
   * `@nestjs/throttler` 6.5.0 suffixes the name of every tier that is not
   * called `default` (`throttler.guard.js:117`), and all three of ours are
   * named. Matched by prefix so that naming a fourth tier does not fail this,
   * and the value is asserted as a number of seconds because that is the part
   * a caller acts on.
   */
  it('names how long the caller must wait', async () => {
    const answers = await rush(BURST.limit * 3)
    const refused = answers.find((one) => one.status === 429)
    expect(refused, 'nothing was refused, so there is no refusal to read').toBeDefined()

    const told = [...refused!.headers.entries()].filter(([name]) =>
      name.toLowerCase().startsWith('retry-after'),
    )
    expect(told, 'refused without saying when to try again').not.toHaveLength(0)

    for (const [, value] of told) {
      expect(Number(value), `${value} is not a number of seconds`).toBeGreaterThan(0)
      expect(Number(value)).toBeLessThanOrEqual(BURST.ttl / 1000)
    }
  })
})
