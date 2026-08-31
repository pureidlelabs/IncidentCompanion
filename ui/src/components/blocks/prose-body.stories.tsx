import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'

import { blockItems } from './prose-slash'

import { ProseBody } from './prose-body'

/**
 * The report's written field: a rich-text body that stores markdown.
 *
 * **Markdown in and markdown out.** `value` is what is stored and `onCommit`
 * fires on blur, only when something changed -- so a caret that visits a
 * section and leaves writes nothing.
 *
 * **The two menus are different doors.** Select some text and the bubble menu
 * appears with the marks; press slash on an empty line and the insert menu
 * offers blocks. `slashItems` being absent means no menu at all, because a
 * body with nothing to insert should not answer a key with an empty list --
 * `NoSlashMenu` is that state.
 *
 * **The multi-writer variant is not here.** `sync` takes an *open* channel,
 * and a story has no server to open one against; the states it adds -- other
 * analysts' carets, the window where the channel is still `opening` and
 * nothing may be written -- are only observable against a running stack.
 *
 * **Both menus are the kit's.** The table verbs are `components/ui/menu.tsx`
 * with the axes behind `SubmenuTrigger`, and the insert menu is a non-modal
 * `components/ui/popover.tsx` anchored at the caret -- non-modal because the
 * caret has to stay in the prose while you type the query.
 */
const meta = {
  title: 'Blocks/Report/Prose body',
  component: ProseBody,
  parameters: { layout: 'padded' },
  args: { label: 'Executive summary', value: '', onCommit: () => undefined },
  render: (args) => <Live label={args.label} value={args.value} readOnly={args.readOnly ?? false} />,
} satisfies Meta<typeof ProseBody>

export default meta
type Story = StoryObj<typeof meta>

const NARRATIVE = [
  '## What happened',
  '',
  'The mailbox was read in bulk over the Graph API. An inbox rule forwarded anything',
  'matching the invoice thread to an external address, and an archive was staged under',
  '`Temp` before the session was closed.',
  '',
  '- Bulk read, 2026-08-20 14:32Z',
  '- Rule created, 2026-08-20 14:41Z',
  '- Archive staged, 2026-08-20 15:02Z',
].join('\n')

/** A harness, because the body reports markdown back up on blur. */
function Live({
  label,
  value,
  readOnly = false,
  withSlash = true,
}: {
  label: string
  value: string
  readOnly?: boolean
  withSlash?: boolean
}) {
  // Opens empty whatever the body opens with, so the panel below shows what
  // was *committed* rather than what was handed in. Seeded from `value` it
  // reads the same before and after a commit, and a body that wrote back on
  // every caret visit would look identical to one that never wrote at all.
  const [stored, setStored] = useState('')
  return (
    <div className="w-[42rem]">
      <div className="rounded-lg border p-3">
        <ProseBody
          label={label}
          value={value}
          readOnly={readOnly}
          onCommit={setStored}
          {...(withSlash ? { slashItems: () => blockItems() } : {})}
        />
      </div>
      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-2xs text-ink-muted">
        {stored === '' ? '(nothing stored)' : stored}
      </pre>
    </div>
  )
}

/** Empty, so the placeholder is what says the field is writable. */
export const Empty: Story = {
  play: async ({ canvas }) => {
    // A contenteditable carries no implicit role, so the field is reachable by
    // role only because the editor is given one by hand. Finding it this way
    // is the assertion: a screen reader looks for a textbox and nothing else.
    const field = canvas.getByRole('textbox', { name: 'Executive summary' })
    await expect(field).toHaveAttribute('contenteditable', 'true')
    await expect(field).toHaveAttribute('aria-multiline', 'true')
  },
}

/** Written. Select a phrase for the bubble menu; blur to commit. */
export const Written: Story = {
  args: { value: NARRATIVE },
  play: async ({ canvas, step }) => {
    await step('the markdown arrives as structure rather than as its own source', async () => {
      // Stored as markdown and drawn as a document: a body that rendered the
      // source would show `## What happened` and read the same to a test that
      // only looked for the words.
      await expect(canvas.getByRole('heading', { name: 'What happened' })).toBeVisible()
      await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
    })
    await step('and a caret that visits and leaves writes nothing', async () => {
      // `onCommit` fires on blur only when the document changed. Without that
      // guard, clicking through a report would write every section back.
      const field = canvas.getByRole('textbox', { name: 'Executive summary' })
      await userEvent.click(field)

      // Blurred by hand rather than by `tab`: nothing else on this story is
      // focusable, so tabbing leaves the caret where it was and the editor
      // never fires the blur the commit hangs off.
      field.blur()
      await waitFor(async () => {
        await expect(field).not.toHaveFocus()
      })
      await expect(canvas.getByText('(nothing stored)')).toBeVisible()
    })
  },
}

/**
 * Something typed, then the caret leaves.
 *
 * The pair with `Written`: that one says a visit writes nothing, and a body
 * that never wrote at all would satisfy it. This one says the writing does
 * come back out, and as markdown rather than as the editor's own document.
 */
export const Committed: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Executive summary' })
    await userEvent.click(field)
    await userEvent.keyboard('The mailbox was read in bulk.')

    field.blur()
    await waitFor(async () => {
      await expect(canvas.getByText('The mailbox was read in bulk.')).toBeVisible()
    })
    await expect(canvas.queryByText('(nothing stored)')).toBeNull()
  },
}

/**
 * Read-only, which is what a published report draws. The text is selectable
 * and copyable; nothing about it invites a caret.
 */
export const ReadOnly: Story = {
  args: { value: NARRATIVE, readOnly: true },
  play: async ({ canvas }) => {
    // The text is still there and still reachable; what is gone is the caret.
    await expect(canvas.getByRole('heading', { name: 'What happened' })).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'Executive summary' })).toHaveAttribute(
      'contenteditable',
      'false',
    )
  },
}

/** No insert menu: slash is an ordinary character again. */
export const NoSlashMenu: Story = {
  args: { label: 'Scope' },
  render: (args) => <Live label={args.label} value={args.value} withSlash={false} />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Scope' })
    await userEvent.click(field)
    await userEvent.keyboard('/')

    // A body with nothing to insert answering the key with an empty list is
    // worse than not answering: the writer waits for a menu that never fills.
    await waitFor(async () => {
      await expect(field).toHaveTextContent('/')
    })
    await expect(canvas.queryByRole('dialog')).toBeNull()
    await expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

/**
 * A table, which is where the second bubble comes from -- put the caret in a
 * cell and the Table menu appears. Its Row and Column verbs are submenus:
 * ArrowRight opens one, Escape closes it and leaves the menu standing.
 */
export const WithATable: Story = {
  args: {
    label: 'Indicators',
    value: [
      '| Indicator | Kind | First seen |',
      '| --- | --- | --- |',
      '| 185.62.190.4 | IPv4 | 2026-08-20 |',
      '| invoice-pay[.]top | Domain | 2026-08-20 |',
    ].join('\n'),
  },
  play: async ({ canvas, step }) => {
    await step('the markdown table is a table', async () => {
      // Pipes and dashes read as a table to a person and as a paragraph to
      // everything else, so the row and column verbs have nothing to act on
      // unless the document really holds one.
      await expect(canvas.getByRole('table')).toBeVisible()
      await expect(canvas.getAllByRole('row')).toHaveLength(3)
      await expect(canvas.getByRole('columnheader', { name: 'Indicator' })).toBeVisible()
    })
    await step('and a caret in a cell brings the table verbs', async () => {
      await userEvent.click(canvas.getByText('185.62.190.4'))
      await expect(await canvas.findByRole('button', { name: 'Table' })).toBeVisible()
    })
  },
}
