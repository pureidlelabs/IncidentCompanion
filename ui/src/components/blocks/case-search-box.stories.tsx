import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import { campaignCase } from '@/fixtures/campaign'

import { CaseSearchBox } from './case-search-box'

/**
 * The header's search box: a field, and the case's own hits under it.
 *
 * The same matcher and the same rows as the command palette, without the
 * commands - `Mod+K` is where those live. The list is non-modal, so the caret
 * stays in the field while the arrow keys walk the rows.
 */
const meta = {
  title: 'Blocks/App shell/Case search box',
  component: CaseSearchBox,
  parameters: { layout: 'padded' },
  args: { kase: campaignCase, query: '', onQueryChange: () => undefined },
} satisfies Meta<typeof CaseSearchBox>

export default meta
type Story = StoryObj<typeof meta>

/** Controlled, and reporting what the analyst chose so a play can read it. */
function Choosing({ onAction }: { onAction: (id: string) => void }) {
  const [query, setQuery] = useState('dc-01')
  const [chosen, setChosen] = useState('')
  return (
    <>
      <CaseSearchBox
        kase={campaignCase}
        query={query}
        onQueryChange={setQuery}
        onAction={(id) => {
          setChosen(id)
          onAction(id)
        }}
      />
      <span data-testid="chosen">{chosen}</span>
    </>
  )
}

/** Controlled from outside, the way the container drives it. */
function Typing({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial)
  return <CaseSearchBox kase={campaignCase} query={query} onQueryChange={setQuery} />
}

/** The box before anything is typed, which is all the header ever shows. */
export const Empty: Story = { name: 'Nothing typed' }

/** A hostname typed, which opens the list against the field. */
export const Typed: Story = {
  name: 'A hostname typed',
  render: () => <Typing initial="dc-01" />,
}

/**
 * The arrow keys walk the rows and the caret stays in the field.
 *
 * **Both halves, because either one alone is a different control.** A list
 * that takes the focus is a menu the analyst has to leave to keep typing; one
 * the keyboard cannot reach is a list for the pointer only. The box is built
 * as a non-modal popover to get both, and nothing held either. -> #963
 *
 * jsdom cannot answer it: which element has the focus after a key, and what a
 * press does once it is there, are facts about a browser.
 */
export const KeyboardWalksTheRows: Story = {
  name: 'The arrows walk, the caret stays',
  render: () => <Choosing onAction={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The surface portals to `body`, so a canvas-scoped query misses it.
    const rows = await screen.findAllByRole('option')
    await expect(rows.length, 'no rows to walk').toBeGreaterThan(1)

    const field = canvas.getByRole('searchbox')
    await userEvent.click(field)
    await userEvent.keyboard('{ArrowDown}')

    await expect(field, 'the list took the focus, so typing would go to it').toHaveFocus()
    await waitFor(async () => {
      await expect(
        canvasElement.ownerDocument.querySelector('[role="option"][data-focused="true"]'),
        'the arrow key moved nothing, so the keyboard cannot reach a row',
      ).not.toBeNull()
    })

    await userEvent.keyboard('{Enter}')
    await waitFor(async () => {
      await expect(
        canvas.getByTestId('chosen'),
        'Enter on a walked row chose nothing',
      ).toHaveTextContent(/^.+$/)
    })
  },
}

/**
 * A press away from the list closes it.
 *
 * React Aria wires no outside press for a non-modal popover, so this is the
 * box's own. The browser is where the ordering has to hold: the press that
 * chooses a row must finish choosing it before the dismissal takes it away.
 * -> #908
 */
export const PressedAway: Story = {
  name: 'Pressed away from the list',
  render: () => {
    const chose = fn()
    return (
      <div className="flex flex-col gap-4">
        <Choosing onAction={chose} />
        <p data-testid="elsewhere">Chrome with nothing to focus.</p>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The surface portals to `body`, so a query scoped to the canvas misses
    // it and reads as a list that never opened.
    const rows = await screen.findAllByRole('option')

    // The ordering only a browser answers: the dismissal runs on the same
    // press that is choosing the row, so a row taken away too early commits
    // nothing and the analyst's press is lost.
    await userEvent.click(rows[0]!)
    await expect(canvas.getByTestId('chosen')).toHaveTextContent(/^.+$/)

    // Choosing does not close it -- the container navigates on the action --
    // so the press away is what the analyst has left, and it still works
    // after a row has been chosen.
    await userEvent.click(canvas.getByTestId('elsewhere'))
    await waitFor(async () => {
      await expect(screen.queryByRole('listbox')).toBeNull()
    })
  },
}
