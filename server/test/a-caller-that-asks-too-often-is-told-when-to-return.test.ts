/**
 * A caller over the limit is refused, and the refusal says when to come back.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { TIERS } from '../src/throttle/tiers.js'

/** 25 a second. Named from the tier list so a retuned limit is not a failure here. */
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
   * carry.**
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
