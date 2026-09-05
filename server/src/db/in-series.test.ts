/**
 * `inSeries` is the whole fix, so its own overlap claim is worth asserting.
 */
import { describe, expect, it } from 'vitest'

import { inSeries } from './in-series.js'

/** A thunk that records how many of its siblings were running beside it. */
function overlapping(record: number[], value: string, ticks = 3) {
  let inFlight = 0
  return {
    peak: () => Math.max(...record, 0),
    thunk: async () => {
      inFlight += 1
      record.push(inFlight)
      // Several turns of the loop: one `await` is not enough to interleave,
      // and a test that cannot interleave cannot fail on concurrency.
      for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve()
      inFlight -= 1
      return value
    },
  }
}

describe('inSeries', () => {
  it('never has two thunks in flight', async () => {
    const seen: number[] = []
    let live = 0
    const track = async <T>(value: T): Promise<T> => {
      live += 1
      seen.push(live)
      for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
      live -= 1
      return value
    }

    await inSeries(
      () => track('a'),
      () => track('b'),
      () => track('c'),
    )

    expect(Math.max(...seen)).toBe(1)
  })

  it('is the assertion Promise.all fails', async () => {
    // The control: the same thunks under `Promise.all` do overlap, so the
    // measurement above is capable of reporting a difference.
    const seen: number[] = []
    let live = 0
    const track = async (): Promise<void> => {
      live += 1
      seen.push(live)
      for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
      live -= 1
    }

    await Promise.all([track(), track(), track()])

    expect(Math.max(...seen)).toBe(3)
  })

  it('returns the values in order', async () => {
    const answers = await inSeries(
      () => Promise.resolve(1),
      () => Promise.resolve('two'),
      () => Promise.resolve([3]),
    )

    expect(answers).toEqual([1, 'two', [3]])
  })

  it('stops at the first rejection rather than issuing the rest', async () => {
    // **The behaviour that differs from `Promise.all`, and it is the one we
    // want.** `Promise.all` has already started everything, so the queries
    // behind a failing one still reach a transaction that is rolling back.
    const ran: string[] = []
    const attempt = inSeries(
      async () => {
        ran.push('first')
      },
      async () => {
        ran.push('second')
        throw new Error('no')
      },
      async () => {
        ran.push('third')
      },
    )

    await expect(attempt).rejects.toThrow('no')
    expect(ran).toEqual(['first', 'second'])
  })

  it('answers an empty list without calling anything', async () => {
    await expect(inSeries()).resolves.toEqual([])
  })

  it('keeps a helper that reports its own peak honest', async () => {
    // `overlapping` exists for readers of this file; assert it works rather
    // than leaving an unused fixture that drifts.
    const record: number[] = []
    const one = overlapping(record, 'x')
    await inSeries(one.thunk, one.thunk)
    expect(one.peak()).toBe(1)
  })
})
