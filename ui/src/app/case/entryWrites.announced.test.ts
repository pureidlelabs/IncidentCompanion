/**
 * A write announced and then let go: the failure reaches the toast, and no
 * rejection escapes to the console beside it.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { toastQueue } from '@/components/blocks/notify'

import { announced, announcing } from './entryWrites'

beforeEach(() => {
  toastQueue.clear()
})

describe('announced', () => {
  it('resolves to nothing after a refusal, having announced it', async () => {
    const outcome = await announced('the import', () =>
      Promise.reject(new ApiError(501, 'Not available in the demo', null)),
    )
    expect(outcome).toBeUndefined()
    expect(toastQueue.visibleToasts).toHaveLength(1)
  })

  it('resolves to the written value where nothing failed', async () => {
    expect(await announced('the import', () => Promise.resolve({ added: 3 }))).toEqual({ added: 3 })
    expect(toastQueue.visibleToasts).toHaveLength(0)
  })

  it('is the form for a caller that voids the promise; announcing still rethrows', async () => {
    await expect(
      announcing('the entry', () => Promise.reject(new ApiError(422, 'refused', null))),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
