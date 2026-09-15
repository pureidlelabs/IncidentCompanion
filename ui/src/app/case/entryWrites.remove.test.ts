import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/blocks/notify', () => ({
  reportBulkMissing: vi.fn(),
  reportBulkRefused: vi.fn(),
  reportWriteFailure: vi.fn(),
}))

const { entryWrites } = await import('./entryWrites')

/**
 * **A selection is deleted in one request, whichever screen deletes it.**
 *
 * `useBulkDelete` says why a loop cannot work: the route counts references
 * against what survives the call, so a loop's outcome depends on the order the
 * client happened to send -- and a loop half-deletes, stopping at the first
 * refusal with the earlier rows already gone. #665 moved the Entities screen
 * onto the route and left this helper looping, which is every other collection
 * screen: Actions, Impact and Methods share it.
 *
 * **The reason each loop gave is no longer true.** *One at a time, because the
 * version check is per row* was the trade while the bulk route carried no
 * version check. #682 gave it one, so the route now refuses a row that moved
 * and takes the whole selection or none of it.
 *
 * **What this does not cover:** what the route counts as a reference, which is
 * the server's.
 */
const rows = [
  { id: 'a', version: 3 },
  { id: 'b', version: 7 },
]

function build() {
  const single = vi.fn(() => Promise.resolve({}))
  const bulkDelete = vi.fn(() => Promise.resolve({ deleted: [], missing: [], refused: [] }))
  const writes = entryWrites(
    {
      create: { mutateAsync: vi.fn() },
      patch: { mutateAsync: vi.fn() },
      bulk: { mutateAsync: vi.fn() },
      remove: { mutateAsync: single },
      bulkDelete: { mutateAsync: bulkDelete },
    },
    { one: 'action', many: 'actions' },
    () => rows as never,
    () => Promise.resolve([] as never),
    'actions',
  )
  return { writes, single, bulkDelete }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('removing a selection of entries', () => {
  it('is one request rather than one per row', async () => {
    const { writes, single, bulkDelete } = build()

    await writes.remove(['a', 'b'])

    expect(
      bulkDelete.mock.calls.length,
      'the selection went row by row, so it half-deletes and the order decides the outcome',
    ).toBe(1)
    expect(single.mock.calls.length, 'the single-row door was still used').toBe(0)
  })

  it('names the collection and carries the version each row was read at', async () => {
    const { writes, bulkDelete } = build()

    await writes.remove(['a', 'b'])

    expect((bulkDelete.mock.calls as unknown as unknown[][])[0]?.[0]).toEqual({
      targets: {
        actions: [
          { id: 'a', version: 3 },
          { id: 'b', version: 7 },
        ],
      },
    })
  })

  it('sends nothing at all for an empty selection', async () => {
    const { writes, bulkDelete } = build()

    await writes.remove([])

    expect(bulkDelete.mock.calls.length).toBe(0)
  })
})
