import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { NotesScreen } from './notes'
import { EMPTY_CAMPAIGN } from './timeline-entries'
import { inACase } from '@/fixtures/in-a-case'

/**
 * The analyst's scratchpad.
 *
 * The split fills, so every story mounts it in a box with a height. Without
 * one both panes grow instead of scrolling and the index runs off the page.
 */
const meta = {
  title: 'Screens/Case/Notes',
  component: NotesScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [inACase('notes')],
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof NotesScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The two notes the campaign demo ships, newest open. */
export const Populated: Story = {
  name: 'Two notes, the newest open',
}

/**
 * Forty notes, which is what a week of a live case leaves.
 *
 * The index scrolls on its own and the open note does not move with it.
 */
export const Many: Story = {
  name: 'A shift of notes',
  args: { kase: withManyNotes() },
  // The claim is that the index holds every note. A split that renders the
  // detail and drops the list looks correct until the count is read.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const index = await canvas.findByRole('navigation', { name: 'Case notes' })
    await expect(within(index).getAllByRole('button')).toHaveLength(40)
  },
}

/**
 * Pressing `New note`: a note, with the caret already in it.
 *
 * **What it is showing is that there is nothing to press.** No dialog, no
 * Create, no Save - the note is what you typed, and the index line follows the
 * writing rather than a commit.
 *
 * **Every story here is the single-writer body**, because no story passes a
 * `caseId` and there is no socket to open behind one. In the running app the
 * same component is a Yjs document shared with whoever else has the note open
 * (`api/proseSync.ts`), and the difference is `ProseBody`'s own `sync` prop
 * rather than a second code path in the screen - which is what keeps these
 * representative. Two analysts in one note is asserted where it can be seen,
 * in `server/e2e/two-analysts.spec.ts`.
 */
export const Writing: Story = {
  name: 'Writing a new note',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'New note' }))

    const field = canvas.getByRole('textbox', { name: 'Note' })
    await expect(field).toHaveFocus()
    await expect(canvas.queryByRole('dialog')).toBeNull()

    const written = 'Proxy logs for the staging window pulled; nothing in the 03:00 band.'
    await userEvent.type(field, written)

    // The index, not the field: the claim is that what was typed is what the
    // screen kept, and a field holding its own text proves nothing.
    const index = canvas.getByRole('navigation', { name: 'Case notes' })
    await expect(within(index).getAllByTestId('note-row')[0]).toHaveTextContent(
      'Proxy logs for the staging window',
    )
  },
}

/**
 * Correcting a note that was already written, on the same surface.
 *
 * The index row follows the correction, so the two never disagree about what
 * the note opens with.
 */
export const Editing: Story = {
  name: 'Editing an existing note',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('textbox', { name: 'Note' })

    await userEvent.clear(field)
    await userEvent.type(field, 'Re-read after the NTDS finding: assume full domain compromise.')

    const index = canvas.getByRole('navigation', { name: 'Case notes' })
    await expect(within(index).getAllByTestId('note-row')[0]).toHaveTextContent(
      'Re-read after the NTDS finding',
    )
  },
}

/**
 * Taking a note away.
 *
 * **The question is the story.** A note's words are the whole of the record -
 * there is no other copy and nothing restores them - so the control raises a
 * dialog rather than acting, and what it promises is what confirming costs.
 */
export const Deleting: Story = {
  name: 'Deleting a note',
  args: { writes: { create: fn(), remove: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getAllByTestId('note-row').length

    await userEvent.click(canvas.getByTestId('delete-note'))

    const dialog = await screen.findByRole('alertdialog')
    await expect(dialog).toHaveTextContent('Delete this note?')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete/i }))

    // The index is the surface the answer shows on, not the dialog.
    await expect(canvas.getAllByTestId('note-row')).toHaveLength(before - 1)
  },
}

/** A case nobody has written a note on. The words say what the pad is for. */
export const Empty: Story = {
  name: 'No notes on this case',
  args: { kase: EMPTY_CAMPAIGN },
  play: async ({ canvas, step }) => {
    await step('it says the pad is empty, not that nothing is open', async () => {
      // Two different emptinesses: no note written, against notes written and
      // none picked. The second sends an analyst to the index; the first would
      // send them to an index with nothing in it.
      await expect(canvas.getByText('No case notes yet')).toBeVisible()
      await expect(canvas.queryByText('Nothing open')).toBeNull()
    })
    await step('and says what the pad is for, which is what it is not', async () => {
      await expect(
        canvas.getByText(/Nothing written here reaches the report unless you put it there/),
      ).toBeVisible()
    })
    await step('with the door to write the first one, twice', async () => {
      // The section head carries one at every state; the empty body adds its
      // own, because an analyst who has just read *no case notes yet* should
      // not have to look back up to act on it.
      await expect(canvas.getAllByRole('button', { name: /New note/ })).toHaveLength(2)
    })
  },
}

/** A 480px pane: the index keeps its measure and the note takes what is left. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="flex min-h-0 w-[480px] flex-1 flex-col border border-dashed border-border p-2">
      <NotesScreen {...args} />
    </div>
  ),
}

/**
 * A note of several paragraphs, and an unsigned one.
 *
 * The prose is held to a reading measure inside a pane that is wider than
 * one, and the index row clamps at two lines rather than growing with it.
 */
export const Overlong: Story = {
  name: 'A long note, and an unsigned one',
  args: { kase: withLongNote() },
}

/** Forty notes an hour apart, so the index has something to scroll. */
function withManyNotes() {
  const seed = campaignCase.casenotes[0]
  if (seed === undefined) return campaignCase
  const at = Date.parse(seed.createdAt)
  return {
    ...campaignCase,
    casenotes: Array.from({ length: 40 }, (_, step) => ({
      ...seed,
      id: `${seed.id}-${String(step)}`,
      author: step % 3 === 0 ? 'Demo Analyst' : 'Second Analyst',
      note: `Pass ${String(step + 1)}: ${seed.note}`,
      createdAt: new Date(at + step * 3_600_000).toISOString(),
    })),
  }
}

/** One note of three paragraphs, and one nobody signed. */
function withLongNote() {
  const [first, ...rest] = campaignCase.casenotes
  if (first === undefined) return campaignCase
  return {
    ...campaignCase,
    casenotes: [
      {
        ...first,
        note: [
          'Human-operated ransomware, and the operator was in the estate for the better part of three days before anything encrypted.',
          'Initial access was a macro-enabled attachment on nine finance mailboxes. Escalation ran through svc-backup, which holds domain admin and is reachable from every workstation in the finance VLAN. Spread was PsExec over SMB, one hop at a time, with no attempt to hide it.',
          'The key gap is that backups were reachable from a domain-admin account. Everything after the escalation follows from that one fact, and it is the recommendation the report should open with.',
        ].join('\n\n'),
      },
      ...rest.map((note) => ({ ...note, author: '' })),
    ],
  }
}
