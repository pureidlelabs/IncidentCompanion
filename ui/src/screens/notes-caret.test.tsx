import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

/**
 * A new note takes the caret however late its editor is built.
 *
 * **The clear was timed rather than caused.** The screen held the new note's
 * id and dropped it on a `a zero-delay timer`, which races the editor's own
 * ready callback: under load the tick won, the id was gone before the editor
 * asked for the caret, and `New note` opened a field the analyst was not in.
 * It failed 4 runs in 40 on `origin/main` under concurrent load, and never
 * serially. -> #410
 *
 * The editor here reports ready on demand, so *late* is a decision the test
 * makes rather than a timing it hopes for. `notes-writing.test.tsx` covers the
 * ordinary path and cannot see this, because in isolation the tick always
 * loses.
 */

/** The last `onReady` the screen handed its body, held so the test can fire it late. */
let ready: ((editor: unknown) => void) | undefined

vi.mock('@/components/blocks/prose-body', () => ({
  ProseBody: (props: { label?: string; onReady?: (editor: unknown) => void }) => {
    ready = props.onReady
    return <div data-testid="prose-body" aria-label={props.label} />
  },
}))

/**
 * Hand the screen a ready editor and let React settle.
 *
 * Outside `act` the state the callback sets has not been applied by the next
 * line, so a second hand-off reads the first render's answer.
 */
function reportReady(editor: unknown): void {
  act(() => {
    ready?.(editor)
  })
}

/** An editor that records having been asked for the caret. */
function editorStub() {
  const focused: string[] = []
  return {
    focused,
    editor: { commands: { focus: (at: string) => focused.push(at) } },
  }
}

const { NotesScreen } = await import('./notes')

describe('a new note takes the caret', () => {
  it('is asked for the caret when its editor reports ready', async () => {
    const user = userEvent.setup()
    ready = undefined
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    expect(ready, 'the screen drew no body to report ready').toBeTypeOf('function')

    const { focused, editor } = editorStub()
    reportReady(editor)
    expect(focused, 'the editor was never asked for the caret').toEqual(['end'])
  })

  it('still takes it when the editor is built several ticks late', async () => {
    const user = userEvent.setup()
    ready = undefined
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))

    // What load does: the editor is not ready on the tick after the press.
    // A clear on a timer has already run by here.
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((settle) => setTimeout(settle, 0))
    }

    const { focused, editor } = editorStub()
    reportReady(editor)
    expect(focused, 'the caret was dropped before the editor could take it').toEqual(['end'])
  })

  it('lets the caret go once the editor has taken it', async () => {
    const user = userEvent.setup()
    ready = undefined
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    const first = editorStub()
    reportReady(first.editor)
    expect(first.focused).toEqual(['end'])

    // The other half of the behaviour: a body rebuilt later -- returning to the
    // note, a re-render -- must not pull the caret out of wherever the analyst
    // moved it. Without the release this passes for having never let go.
    const again = editorStub()
    reportReady(again.editor)
    expect(again.focused, 'the caret was taken a second time').toEqual([])
  })

  it('does not take it again when an existing note is opened', async () => {
    const user = userEvent.setup()
    ready = undefined
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    // No new note: opening one the analyst already has must leave the caret
    // wherever they put it.
    const { focused, editor } = editorStub()
    reportReady(editor)
    expect(focused).toEqual([])
    await user.click(screen.getByRole('button', { name: 'New note' }))
  })
})
