import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import { ProseBody } from './prose-body'

/**
 * A refused document stops taking text, and says so.
 *
 * **The failure is silent and costs the analyst their work.** `useProseSync`
 * settles on `refused` when the report is filed underneath the writer, and
 * `settled` is true for a refusal -- so the screen drew an ordinary editor,
 * every keystroke went into a channel that discards it, and the first sign was
 * the text missing on reload. -> #415
 *
 * Asserted on the body rather than on either screen: both take the same
 * component, so a fix in one screen leaves the other silently losing text.
 */

/**
 * A channel over a real document, because a refused one still reads.
 *
 * The text is not the failure -- the server answers a state request even for a
 * filed report -- so the body still builds its collaboration editor and the
 * only question is whether it takes input.
 */
function refusedChannel(refusedAt: string | null) {
  const doc = new Y.Doc()
  return { doc, awareness: new Awareness(doc), refusedAt } as never
}

describe('a body whose document was refused', () => {
  it('is not writable, whatever the caller asked for', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        readOnly={false}
        sync={{ channel: refusedChannel(null), status: 'refused', field: 'block-1' }}
      />,
    )
    const box = document.querySelector('[contenteditable]')
    expect(box, 'the body draws no editor at all').not.toBeNull()
    expect(box?.getAttribute('contenteditable')).toBe('false')
  })

  it('says what happened rather than looking finished', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        sync={{ channel: refusedChannel(null), status: 'refused', field: 'block-1' }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/filed/i)
  })

  it('names when it was filed, so the analyst can match it against what they typed', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        sync={{
          channel: refusedChannel('2026-03-04T09:15:00.000Z'),
          status: 'refused',
          field: 'block-1',
        }}
      />,
    )
    // The moment, not the fact: "filed while you were writing" is only
    // answerable against a time the analyst can place.
    expect(screen.getByRole('alert').textContent).toMatch(/\d/)
  })

  it('leaves a ready document alone', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        sync={{ channel: refusedChannel(null), status: 'ready', field: 'block-1' }}
      />,
    )
    expect(screen.queryByRole('alert'), 'a live document is not an alert').toBeNull()
  })

  it('leaves a body with no channel alone, which is the gallery and every test', () => {
    render(<ProseBody label="Findings" value="" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
