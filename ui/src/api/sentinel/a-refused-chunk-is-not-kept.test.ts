import { describe, expect, it, vi } from 'vitest'

import { demoSourceFromUrl } from './demoSource'

import type * as SentinelFixture from '@/fixtures/sentinel-source'

/**
 * A chunk that failed to arrive is not held against the next attempt.
 *
 * **A file of its own, because the refusal has to be the first load.** The
 * factory is asked once per file and its result is cached from then on, so a
 * case that reached the fixture before this one would leave nothing to
 * refuse. -> #988
 */
const loaded = vi.hoisted(() => ({ refuseNext: true }))

vi.mock('@/fixtures/sentinel-source', async (importOriginal) => {
  if (loaded.refuseNext) {
    loaded.refuseNext = false
    throw new Error('chunk did not arrive')
  }
  return await importOriginal<typeof SentinelFixture>()
})

describe('the demo importer', () => {
  it('does not keep a chunk that failed to arrive', async () => {
    const address = '?importer=demo&retried=1'

    // Not matched on the message: the runner relabels a throw from a mock
    // factory with advice of its own, and the app never sees that text.
    await expect(demoSourceFromUrl(address)).rejects.toThrow()

    // What the Connect phase's retry reaches. A kept rejection is replayed to
    // every later call, so the demo importer would never open again.
    await expect(demoSourceFromUrl(address)).resolves.not.toBeNull()
  })
})
