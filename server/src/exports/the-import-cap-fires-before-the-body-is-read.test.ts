/**
 * **The import cap refuses while the body is arriving, not once it has
 * arrived**, which is the difference between a bound and a post-mortem.
 *
 * `csv-import.test.ts` covers the parser's own copy of the limit. That one
 * fires on a string already in memory, so it cannot see the property this file
 * is about: a caller sending a hundred megabytes must be refused without a
 * hundred megabytes ever being buffered.
 *
 * Asserted by counting what the route pulls off the stream. A cap applied
 * after the loop leaves the count at the whole body and still throws, so the
 * count is the only thing that separates the two implementations -- the
 * refusal alone looks identical.
 *
 * Needs no database: both collaborators are reached only after the cap, which
 * is why they are `null` here and why this file runs anywhere.
 */
import { describe, expect, it } from 'vitest'

import { MAX_CSV_BYTES } from './csv-import.js'
import { ExportsController } from './exports.controller.js'

const A_MEGABYTE = 1024 * 1024

const CHUNKS_TO_CROSS = Math.floor(MAX_CSV_BYTES / A_MEGABYTE) + 1

/**
 * A body far larger than the cap, which reports how much of it was taken.
 *
 * Generated per chunk rather than allocated up front: building the whole
 * oversized body would do in the test the thing the route is being asserted
 * not to do.
 */
function aBodyOf(megabytes: number): { stream: AsyncIterable<Buffer>; pulled: () => number } {
  let pulled = 0
  return {
    pulled: () => pulled,
    stream: {
      async *[Symbol.asyncIterator]() {
        for (let n = 0; n < megabytes; n += 1) {
          pulled += 1
          yield Buffer.alloc(A_MEGABYTE, 'x')
        }
      },
    },
  }
}

describe('the CSV import cap', () => {
  const route = new ExportsController(null as never, null as never)
  const session = { user: { id: 'nobody' } } as never

  it('stops reading once the cap is crossed, rather than after the body ends', async () => {
    const body = aBodyOf(64)

    await expect(
      route.importCsv('c-1', 'systems', undefined, body.stream, session),
    ).rejects.toThrow(/import limit/)

    expect(
      body.pulled(),
      'the whole body was read before the cap was applied, so a caller can make the ' +
        'server hold any amount of memory it likes and still be refused politely',
    ).toBeLessThanOrEqual(CHUNKS_TO_CROSS)
  })

  /**
   * The other half, without which a route that refused every body would pass
   * the case above.
   *
   * **Getting past the cap is what is asserted, not succeeding.** A one
   * megabyte body reaches the import service, which is `null` here, so the
   * failure it produces is the evidence: anything other than the cap's message
   * means the cap let it through.
   */
  it('lets a body under the cap reach the work behind it', async () => {
    const body = aBodyOf(1)

    const refusal = await route
      .importCsv('c-1', 'systems', undefined, body.stream, session)
      .then(() => null)
      .catch((error: unknown) => error)

    expect(
      String(refusal),
      'a body well under the cap was refused as too large',
    ).not.toMatch(/import limit/)

    expect(body.pulled(), 'the body was not read at all').toBe(1)
  })
})
