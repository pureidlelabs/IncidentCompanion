/**
 * **Which write a note takes out of the screen, which nothing exercised.**
 *
 * The screen says whether the *page* is going; this file decides what that
 * means. A closing tab skips the mutation, because `mutateAsync` awaits
 * `onMutate` before it reaches the request and a `pagehide` handler has no
 * later tick to be resumed on -- so the POST is issued directly, with
 * `keepalive`. A link followed inside the app is not that, and takes the
 * ordinary write so a refusal reaches the analyst.
 *
 * Driven with the screen replaced by a prop recorder: what is under test is
 * the routing, and the screen's own half is held in `notes-writing.test.tsx`.
 */
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const CASE = '11111111-1111-4111-8111-111111111111'

const direct: { collection: string; keepalive: boolean }[] = []
const mutated: unknown[] = []
const announced: string[] = []

vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }) }))
vi.mock('@/api/specs', () => ({ useSpecs: () => ({ data: undefined }) }))
vi.mock('@/api/useSession', () => ({ useSession: () => ({ username: 'Ada' }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => CASE }))
vi.mock('@/api/useEntryDelete', () => ({ useEntryDelete: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryCreate', () => ({
  useEntryCreate: () => ({
    mutateAsync: (draft: unknown) => {
      mutated.push(draft)
      return Promise.resolve({ id: 'made' })
    },
  }),
  createEntry: (_caseId: string, collection: string, _fields: unknown, keepalive: boolean) => {
    direct.push({ collection, keepalive })
    return Promise.resolve({ id: 'made' })
  },
}))
vi.mock('./entryWrites', () => ({
  announcing: <T,>(what: string, run: () => Promise<T>) => {
    announced.push(what)
    return run()
  },
}))

interface Writes {
  create: (fields: Record<string, unknown>, going?: boolean) => Promise<unknown>
}

let writes: Writes | null = null
vi.mock('@/screens/notes', () => ({
  NotesScreen: (props: { writes: Writes }) => {
    writes = props.writes
    return null
  },
}))

const { NotesContainer } = await import('./NotesContainer')

async function mounted(): Promise<Writes> {
  writes = null
  direct.length = 0
  mutated.length = 0
  announced.length = 0
  render(<NotesContainer />)
  await waitFor(() => {
    expect(writes, 'the screen was never handed its writes').not.toBeNull()
  })
  return writes!
}

describe('how a note leaves the screen', () => {
  it('issues the write itself on the way out, so it outlives the page', async () => {
    const held = await mounted()

    await held.create({ note: 'the tab is closing' }, true)

    expect(direct, 'leaving went through the mutation, which never reaches the request').toEqual([
      { collection: 'casenotes', keepalive: true },
    ])
    expect(mutated, 'the mutation was used on the way out').toHaveLength(0)
  })

  /**
   * **And announces it, which is not the other door.**
   *
   * These were told apart for a while -- the direct write for a closing page,
   * the announcing one for an in-app link -- and that lost the request an
   * unmount had in flight when the tab was closed a moment later. `announcing`
   * wraps any promise and the toast region outlives the screen, so a leaving
   * write is both.
   */
  it('announces the leaving write, so a refusal is not silent', async () => {
    const held = await mounted()

    await held.create({ note: 'a link was followed' }, true)

    expect(announced, 'a refusal on the way out had nowhere to be reported').toEqual(['the note'])
    expect(direct).toHaveLength(1)
  })

  it('keeps the mutation for an ordinary blur, which wants its optimistic row', async () => {
    const held = await mounted()

    await held.create({ note: 'an ordinary blur' })

    expect(mutated).toHaveLength(1)
    expect(announced).toEqual(['the note'])
    expect(direct, 'a blur spent the keepalive quota').toHaveLength(0)
  })
})
