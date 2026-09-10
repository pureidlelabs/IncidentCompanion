import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import { ProseBody } from './prose-body'
import { ProseRefusal } from './prose-refusal'

/**
 * A refused document stops taking text, and says why.
 *
 * **The failure is silent and costs the analyst their work.** `useProseSync`
 * settles on `refused` when the server stops taking frames, and `settled` is
 * true for a refusal -- so the screen drew an ordinary editor, every keystroke
 * went into a channel that discards it, and the first sign was the text
 * missing on reload. -> #415
 *
 * **The two halves are asserted apart, because they belong apart.** Whether a
 * body takes input is per body; what the analyst is told is per *document*,
 * and a report is one channel behind every section -- so a notice drawn beside
 * each body is a banner per section.
 */

/**
 * A channel over a real document, because a refused one still reads.
 *
 * The text is not the failure -- the server answers a state request even for a
 * filed report -- so the body still builds its editor and the only question is
 * whether it takes input.
 */
function channelFor(because: 'read-only' | 'report-sent' | null, refusedAt: string | null = null) {
  const doc = new Y.Doc()
  return { doc, awareness: new Awareness(doc), refusedAt, refusedBecause: because } as never
}

describe('a body whose document was refused', () => {
  it('is not writable, whatever the caller asked for', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        readOnly={false}
        sync={{ channel: channelFor('report-sent'), status: 'refused', field: 'block-1' }}
      />,
    )
    const box = document.querySelector('[contenteditable]')
    expect(box, 'the body draws no editor at all').not.toBeNull()
    expect(box?.getAttribute('contenteditable')).toBe('false')
  })

  it('states nothing itself, so a report does not draw a banner per section', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        sync={{ channel: channelFor('report-sent'), status: 'refused', field: 'block-1' }}
      />,
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves a ready document writable', () => {
    render(
      <ProseBody
        label="Findings"
        value=""
        sync={{ channel: channelFor(null), status: 'ready', field: 'block-1' }}
      />,
    )
    expect(document.querySelector('[contenteditable]')?.getAttribute('contenteditable')).toBe(
      'true',
    )
  })
})

describe('what a refused document says', () => {
  it('names the filing when the report was filed, and when', () => {
    render(<ProseRefusal channel={channelFor('report-sent', '2026-03-04T09:15:00.000Z')} />)
    const said = screen.getByRole('status')
    expect(said).toHaveTextContent(/filed/i)
    // The moment, not the fact: the analyst places it against what they typed.
    expect(said.textContent).toMatch(/\d/)
  })

  it('names the reach the analyst has, when that is the reason', () => {
    // The refusal a case note can *only* ever give. Telling this writer their
    // report was filed is two wrong facts in one sentence.
    const said = render(<ProseRefusal channel={channelFor('read-only')} />)
    expect(said.getByRole('status')).not.toHaveTextContent(/filed/i)
    expect(said.getByRole('status')).toHaveTextContent(/read-only/i)
  })

  it('says nothing about a time it cannot read', () => {
    render(<ProseRefusal channel={channelFor('report-sent', 'not-a-time')} />)
    expect(screen.getByRole('status')).not.toHaveTextContent(/Invalid Date/)
  })

  it('is a standing state rather than an assertive announcement', () => {
    // It is drawn from the first paint when the analyst navigates back into a
    // document already refused, which is not something that just changed.
    render(<ProseRefusal channel={channelFor('read-only')} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
