/**
 * A query notification scheduled in a test is dropped when the test ends.
 *
 * Schedules through `notifyManager.schedule`, the path every observer
 * notification takes, rather than through a rendered query: it is the pending
 * timer that reaches React after jsdom is gone, whatever queued it. -> #1316
 */
import { notifyManager } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

const delivered: string[] = []

describe('a query notification', () => {
  it('is scheduled as the test ends', () => {
    notifyManager.schedule(() => delivered.push('late'))
  })

  it('never arrives in the test after it', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(delivered).toEqual([])
  })
})
