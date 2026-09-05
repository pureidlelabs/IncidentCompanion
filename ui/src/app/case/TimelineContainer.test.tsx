/**
 * **What the container actually sends, which is the seam nothing looked at.**
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const created: Record<string, unknown>[] = []
const patched: Record<string, unknown>[] = []

vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined }) }))
vi.mock('@/api/specs', () => ({ useSpecs: () => ({ data: undefined }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => 'case-1' }))
vi.mock('@/api/useEntryDelete', () => ({ useEntryDelete: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryCreate', () => ({
  useEntryCreate: () => ({
    mutateAsync: (one: Record<string, unknown>) => {
      created.push(one)
      return Promise.resolve({})
    },
  }),
}))
vi.mock('@/api/useEntryMutation', () => ({
  useEntryMutation: () => ({
    mutateAsync: (one: Record<string, unknown>) => {
      patched.push(one)
      return Promise.resolve({})
    },
  }),
}))

/**
 * The screen stands in for itself: it is handed the writes the container
 * built, and hands them straight back, so the test can call `save` exactly as
 * the screen does without rendering a timeline.
 */
let writes: {
  save: (
    entry: { id: string; version: number } | null,
    fields: Record<string, unknown>,
    kind: 'event' | 'action',
  ) => Promise<unknown>
} | null = null

vi.mock('@/screens/timeline', () => ({
  TimelineScreen: (props: { writes: typeof writes }) => {
    writes = props.writes
    return null
  },
}))

const { TimelineContainer } = await import('./TimelineContainer')

describe('what the timeline container sends', () => {
  function mount() {
    created.length = 0
    patched.length = 0
    render(<TimelineContainer />)
    if (!writes) throw new Error('the container handed the screen no writes')
    return writes
  }

  it('gives the create its kind, which the union is discriminated on', async () => {
    await mount().save(null, { description: 'Something happened' }, 'event')

    expect(created).toHaveLength(1)
    expect(
      (created[0]?.fields as Record<string, unknown>).kind,
      'a create without kind cannot pick an arm of the write schema',
    ).toBe('event')
  })

  /**
   * The defect. `kind` is not a patchable column, and a strict schema refuses
   * the whole body over it -- so an edit that named one field fails entirely.
   */
  it('keeps kind out of the patch, which the schema refuses', async () => {
    await mount().save({ id: 'row-1', version: 3 }, { description: 'Edited' }, 'event')

    expect(patched).toHaveLength(1)
    const fields = patched[0]?.fields as Record<string, unknown>

    expect(
      'kind' in fields,
      'the patch carries kind, which the timeline patch schema omits -- the server answers ' +
        '422 unrecognized_keys and the edit is lost',
    ).toBe(false)
    expect(fields.description, 'the field the analyst edited did not survive').toBe('Edited')
  })

  /**
   * The same body by the other door: *Mark reviewed* calls `save` with only
   * `unreviewed`, so it is the same request shape and the same failure.
   */
  it('keeps kind out of a review, which goes through the same door', async () => {
    await mount().save({ id: 'row-1', version: 3 }, { unreviewed: false }, 'event')

    const fields = patched[0]?.fields as Record<string, unknown>
    expect('kind' in fields).toBe(false)
    expect(fields.unreviewed).toBe(false)
  })
})
