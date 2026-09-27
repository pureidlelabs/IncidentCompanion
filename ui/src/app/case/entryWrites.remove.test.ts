import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/blocks/notify', () => ({
  reportBulkMissing: vi.fn(),
  reportBulkRefused: vi.fn(),
  reportWriteFailure: vi.fn(),
}))

const { entryWrites } = await import('./entryWrites')
const { drawn } = await import('@/api/rowWrite')

/**
 * **A selection is deleted in one request, whichever screen deletes it.**
 *
 * A loop cannot: the route counts references against what survives the call,
 * so a loop's outcome depends on the order the client happened to send, and it
 * half-deletes when a row is refused. -> `api/useBulkDelete.ts`
 *
 * **What this does not cover:** what the route counts as a reference, which is
 * the server's.
 */
const rows = [
  { id: 'a', version: drawn({ version: 3 }).version },
  { id: 'b', version: drawn({ version: 7 }).version },
]

function build() {
  const bulkDelete = vi.fn(() => Promise.resolve({ deleted: [], missing: [], refused: [] }))
  const writes = entryWrites(
    {
      create: { mutateAsync: vi.fn() },
      patch: { mutateAsync: vi.fn() },
      bulk: { mutateAsync: vi.fn() },
      bulkDelete: { mutateAsync: bulkDelete },
    },
    { one: 'action', many: 'actions' },
    () => Promise.resolve([] as never),
    () => '',
    'actions',
  )
  return { writes, bulkDelete }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('removing a selection of entries', () => {
  it('is one request rather than one per row', async () => {
    const { writes, bulkDelete } = build()

    await writes.remove(rows)

    expect(
      bulkDelete.mock.calls.length,
      'the selection went row by row, so it half-deletes and the order decides the outcome',
    ).toBe(1)
  })

  it('names the collection and carries the version each row was read at', async () => {
    const { writes, bulkDelete } = build()

    await writes.remove(rows)

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
