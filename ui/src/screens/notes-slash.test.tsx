/**
 * **The insert menu, which no screen ever asked for.**
 *
 * `ProseBody` registers the slash extension only when it is given the items --
 * `prose-body.tsx`: `...(slashItems ? [slash] : [])` -- and the prop was passed
 * by a story and a unit test and by nothing in the application. So typing `/`
 * in a note inserted a slash, and the blocks `blockItems()` offers, tables
 * included, were unreachable. -> #399
 *
 * Driven through the real editor rather than by asserting the prop: what is
 * claimed is that the key opens a menu, and the prop is how that happens to be
 * arranged today.
 *
 * **Present rather than visible.** jsdom gives every element a zero box, so
 * `toBeVisible` refuses a popover that rendered perfectly well -- measured, it
 * fails on the row it just found. Whether the menu can be *seen* is the browser
 * tier's to answer; that it is offered at all is this one's.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { NotesScreen } from './notes'

function noteField(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Note' })
}

describe('the insert menu in a note', () => {
  it('offers blocks when the analyst types a slash', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.click(noteField())
    await user.keyboard('/')

    expect(
      await screen.findByText('Bulleted list'),
      'typing a slash inserted a slash: the body was given no items to offer',
    ).toBeInTheDocument()
  })

  /**
   * The one the browser tier reaches for, and the reason a table can be put in
   * a note at all -- there is no other route to `insertTable`.
   */
  it('offers a table among them', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.click(noteField())
    await user.keyboard('/')

    expect(await screen.findByText('Table')).toBeInTheDocument()
  })
})
