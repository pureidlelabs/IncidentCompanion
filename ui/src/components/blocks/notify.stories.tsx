import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ApiError } from '@/api/client'

import { Button } from '@/components/ui/button'
import { reportBulkMissing, reportWriteFailure, toast } from './notify'

/**
 * The vocabulary, not the surface: which control says what, and how a refused
 * write becomes a sentence an analyst can act on. The card itself is `Toast`.
 */
// No `component`. This file documents `notify` -- which control says what --
// and `notify` exports functions rather than a component. The region that
// draws them is `AppProviders`', and it has its own page.
const meta = {
  title: 'Blocks/Notice/Notify',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Every shape a screen can raise, against the one region. */
export const Raising: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {/* The four tones, in the order a screen reaches for them. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={() => toast('Timeline entry saved')}>
          Plain
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            toast.success('Report exported', { description: 'full-investigation.docx' })
          }
        >
          Success
        </Button>
        <Button variant="outline" onPress={() => toast.warning('3 systems were no longer there.')}>
          Warning
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            toast.error('The report could not be built.', {
              description: 'The template names a section this case does not have.',
            })
          }
        >
          Error &mdash; stays until dismissed
        </Button>
      </div>

      {/*
        The two 409s, which need different sentences. `refuseIfHeldByAnother`
        answers one for a row somebody has *open* - nothing was saved and
        waiting is the move. The version check answers one for a row somebody
        has *written*, where the screen is behind. Telling the analyst their
        colleague saved first when nobody saved anything sends them looking for
        a change that is not there.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onPress={() =>
            reportWriteFailure(
              new ApiError(409, 'It is open in another session.', { heldBy: 'Nadia Okonjo' }),
              'this system',
            )
          }
        >
          Held open by somebody
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            reportWriteFailure(new ApiError(409, 'Reload to see what changed.', {}), 'this system')
          }
        >
          Written first by somebody
        </Button>
      </div>

      {/*
        The card, which is what a refusal naming fields gets instead of a
        sentence. The first passes a `retry` and gets no button anyway: the
        same body sent again is the same refusal. The third names no field,
        which is the case the button exists for.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onPress={() =>
            reportWriteFailure(
              new ApiError(422, 'Validation failed', {
                message: 'Validation failed',
                errors: [
                  { path: ['hostname'], message: 'Already on this case.' },
                  { path: ['firstSeen'], message: 'Must not be in the future.' },
                ],
              }),
              'this system',
              { retry: () => toast('Retried.') },
            )
          }
        >
          Two fields refused &mdash; the retry is withheld
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            reportWriteFailure(
              new ApiError(404, 'That row is no longer there.', null),
              'this system',
            )
          }
        >
          Gone &mdash; nothing to retry
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            reportWriteFailure(new TypeError('Failed to fetch'), 'this system', {
              retry: () => toast('Retried.'),
            })
          }
        >
          No answer at all
        </Button>
      </div>

      {/*
        A bulk PATCH's stale ids. **Silent when nothing is missing**, like every
        write - the optimistic rows are the confirmation, and a toast on every
        bulk edit is noise.
      */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={() => reportBulkMissing([], 'systems')}>
          Nothing missing &mdash; silent
        </Button>
        <Button variant="outline" onPress={() => reportBulkMissing(['a'], 'system')}>
          One missing
        </Button>
        <Button variant="outline" onPress={() => reportBulkMissing(['a', 'b', 'c'], 'systems')}>
          Three missing
        </Button>
      </div>

    </div>
  ),
  // The region portals into React Aria's top layer, which is outside the
  // story's own element, so every toast is looked for on the document.
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const screen = within(canvasElement.ownerDocument.body)
    /**
     * Waits for a visible toast carrying `text`.
     */
    const shows = async (text: RegExp) => {
      await waitFor(async () => {
        const hit = screen.queryAllByText(text).filter((el) => el.checkVisibility())
        await expect(hit.length).toBeGreaterThan(0)
      })
    }

    await step('one region draws the queue, not two', async () => {
      // The gallery is on the app's provider stack, so `AppProviders` has
      // already mounted the region this queue draws through. A story that
      // mounted its own would draw every toast twice and hand React Aria two
      // landmarks with one label -- and the warning that raises carries DOM
      // nodes the worker channel cannot serialise, which fails the run while
      // every test passes.
      await userEvent.click(canvas.getByRole('button', { name: /^Plain$/ }))
      await expect(await screen.findAllByText('Timeline entry saved')).toHaveLength(1)
      await expect(
        canvasElement.ownerDocument.querySelectorAll('[data-slot="toast-region"]'),
      ).toHaveLength(1)
    })

    await step('the two 409s are told apart by who is named', async () => {
      // A row somebody has *open* and a row somebody has *written* are both
      // 409, and only one of them means a colleague saved first. Saying that
      // when nobody saved anything sends
      // the analyst looking for a change that is not there.
      await userEvent.click(canvas.getByRole('button', { name: /Held open by somebody/ }))
      await shows(/Nadia Okonjo has this system open\./)

      await userEvent.click(canvas.getByRole('button', { name: /Written first by somebody/ }))
      await shows(/Another analyst saved this system first\./)
    })

    await step('a refusal naming fields names them', async () => {
      // The card rather than a sentence: a 422 says which fields, and a
      // sentence would drop the half the analyst has to act on.
      await userEvent.click(canvas.getByRole('button', { name: /Two fields refused/ }))
      await shows(/Already on this case\./)
      await shows(/Must not be in the future\./)
    })

    await step('and offers no retry, even though the caller passed one', async () => {
      // The caller does pass `retry` here. The card withholds it because the
      // refusal names fields: the same body sent again is the same wall, and
      // a button that looks like the way out is worse than no button.
      const named = screen
        .getAllByText(/Already on this case\./)
        .filter((el) => el.checkVisibility())
        .at(-1)!
      const card = named.closest('[role="alertdialog"], [role="dialog"]')
      await expect(within(card as HTMLElement).queryByRole('button', { name: /Retry/i })).toBeNull()
    })

    await step('a failure naming no field does offer one', async () => {
      // A dropped connection refused nothing. Sending it again is the whole
      // remedy, so this is the case the button exists for.
      await userEvent.click(canvas.getByRole('button', { name: /No answer at all/ }))
      await expect((await screen.findAllByRole('button', { name: /Retry/i }))[0]!).toBeVisible()
    })

    await step('and a caller holding nothing to run again offers none', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /Gone .* nothing to retry/ }))
      await shows(/That row is no longer there\./)
      const gone = screen
        .getAllByText(/That row is no longer there\./)
        .filter((el) => el.checkVisibility())
        .at(-1)!
      const card = gone.closest('[role="alertdialog"], [role="dialog"]')
      await expect(within(card as HTMLElement).queryByRole('button', { name: /Retry/i })).toBeNull()
    })

    await step('a bulk write that left nothing missing raises nothing', async () => {
      // Silent, like every write that worked: the optimistic rows are the
      // confirmation, and a toast on every bulk edit is noise.
      const before = screen.queryAllByRole('alertdialog').length
      await userEvent.click(canvas.getByRole('button', { name: /Nothing missing/ }))
      await expect(screen.queryAllByRole('alertdialog')).toHaveLength(before)
    })

    await step('one missing is not written as three', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /^One missing$/ }))
      await shows(/1 system was no longer there\./)
    })
  },
}
