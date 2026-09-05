import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { expect, waitFor, within } from 'storybook/test'

import { DialogActions, DialogFrame, DialogMark } from '@/components/blocks/dialog-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, type DialogProps } from '@/components/ui/dialog'
import { TextField } from '@/components/ui/text-field'
import { campaignCase } from '@/fixtures/campaign'

const SYSTEMS = campaignCase.systems
const EVENTS = campaignCase.timeline

const LONG_TITLE =
  'Link this event to the systems, accounts and evidence it already names elsewhere in the case'

/**
 * A trigger and the dialog it opens, controlled.
 *
 * Every story goes through this. `startOpen` puts the arrangement on the page
 * rather than behind a press, and every story that passes it also renders in
 * its own docs frame - the autodocs page is one document, so a dialog open on
 * mount there stacks un-dismissably and locks that page's scroll.
 */
function Opens({
  label,
  size,
  startOpen = false,
  children,
}: {
  label: string
  size: NonNullable<DialogProps['size']>
  startOpen?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(startOpen)
  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          setOpen(true)
        }}
      >
        {label}
      </Button>
      <Dialog isOpen={open} onOpenChange={setOpen} size={size}>
        {children(() => {
          setOpen(false)
        })}
      </Dialog>
    </>
  )
}

/**
 * The arrangement inside a kit `Dialog`: a head, a body, and a footer whose
 * left half says what the controls will do.
 *
 * The `Dialog` decides the box - `size` picks the width, the height rule and
 * the vertical placing, and nothing here takes either back. Every story
 * arrives open, and keeps the trigger that reopens it.
 */
const meta = {
  title: 'Blocks/Overlay/Frame',
  component: DialogFrame,
  parameters: { layout: 'centered' },
  // Every story renders its own trigger, so these only feed the props table.
  args: { title: 'Add system' },
} satisfies Meta<typeof DialogFrame>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The dialog that is on screen now, once it has finished arriving.
 *
 * Stories share a page: one left over from an earlier story stays in the
 * document while it animates out, and the one this story opened is in the
 * document a frame before it is painted. A single-match query answers with
 * whichever of those the story order happens to leave first.
 */
async function liveDialog(canvasElement: HTMLElement) {
  const screen = within(canvasElement.ownerDocument.body)
  let live: HTMLElement | undefined
  await waitFor(() => {
    live = screen.queryAllByRole('dialog').filter((el) => el.checkVisibility()).at(-1)
    if (live === undefined) throw new Error('no dialog on screen')
    if (live.getBoundingClientRect().height === 0) throw new Error('still arriving')
  })
  return live!
}

/** Its own docs frame, `height` tall, so a modal can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** Title, a two-column form body, and one filled action against a footnote. */
export const Form: Story = {
  name: 'Head, body, actions',
  parameters: frame('420px'),
  render: () => (
    <Opens label="Add system" size="form" startOpen>
      {(close) => (
        <DialogFrame
          title="Add system"
          subtitle="The host is created in this case only. Other analysts see it at once."
          onClose={close}
          footnote={<span className="text-xs text-ink-muted">Saved as you go</span>}
          actions={
            <>
              <Button variant="outline" onPress={close}>
                Cancel
              </Button>
              <Button onPress={close}>Create</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Hostname" defaultValue="WKS-FIN01" />
            <TextField label="Zone" defaultValue="internal - workstation" />
            <TextField label="Analyst" defaultValue="R. Okonkwo" />
            <TextField label="Tags" defaultValue="crown-jewel" />
          </div>
        </DialogFrame>
      )}
    </Opens>
  ),
  play: async ({ canvasElement, step }) => {
    const dialog = within(await liveDialog(canvasElement))

    await step('the head names the dialog to a screen reader', async () => {
      // A title drawn but not associated announces as an unnamed dialog,
      // which is the one thing a modal must not be.
      await expect(dialog.getByRole('heading', { name: 'Add system' })).toBeVisible()
    })

    await step('and the footnote sits opposite the controls', async () => {
      // The left half says what the controls will do. Drawn among them it
      // reads as a third control.
      const footnote = dialog.getByText('Saved as you go').getBoundingClientRect()
      const create = dialog.getByRole('button', { name: 'Create' }).getBoundingClientRect()
      await expect(footnote.left).toBeLessThan(create.left)
    })
  },
}

/**
 * A body long enough to scroll under a head and footer that stay put.
 *
 * `compact` caps at `calc(100vh-4rem)`, so the box stops growing and the kit's
 * `DialogBody` takes the overflow.
 */
export const ScrollingBody: Story = {
  name: 'A body that scrolls under a pinned footer',
  // Tall, so the cap is the frame rather than the content: a short frame
  // shows a box the body happens to fit in, which is the opposite claim.
  parameters: frame('620px'),
  render: () => (
    <Opens label={`Review ${String(EVENTS.length)} timeline entries`} size="compact" startOpen>
      {(close) => (
        <DialogFrame
          title="Timeline"
          subtitle="Every event and action captured for this case."
          onClose={close}
          footnote={
            <span className="text-xs text-ink-muted">
              {EVENTS.length} entries &middot; oldest first
            </span>
          }
          actions={<Button onPress={close}>Done</Button>}
        >
          <ol className="flex flex-col gap-2">
            {EVENTS.map((entry, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Badge variant="soft" size="xs">
                  {entry.kind}
                </Badge>
                <span className="min-w-0 flex-1">{entry.description}</span>
              </li>
            ))}
          </ol>
        </DialogFrame>
      )}
    </Opens>
  ),
  play: async ({ canvasElement, step }) => {
    const box = await liveDialog(canvasElement)
    const dialog = within(box)

    await step('the body scrolls rather than the box growing', async () => {
      // `compact` caps the box, so the entries overflow inside it. Without
      // the cap the dialog grows past the window and the footer with it.
      const list = dialog.getByRole('list')
      const scroller = list.closest('[data-slot="dialog-body"]') ?? list.parentElement!
      await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
    })

    await step('and the footer stays inside the box', async () => {
      const done = dialog.getByRole('button', { name: 'Done' }).getBoundingClientRect()
      await expect(done.bottom).toBeLessThanOrEqual(box.getBoundingClientRect().bottom + 1)
    })
  },
}

/**
 * A title longer than the frame, on the narrowest archetype.
 *
 * The head wraps and keeps its dismiss control on the first line; the body and
 * footer do not move.
 */
export const OverlongTitle: Story = {
  name: 'A title longer than the frame',
  parameters: frame('360px'),
  render: () => (
    <Opens label="Open the long one" size="compact" startOpen>
      {(close) => (
        <DialogFrame
          title={LONG_TITLE}
          subtitle="Every one of these already appears somewhere else in the case."
          onClose={close}
          actions={<Button onPress={close}>Close</Button>}
        >
          <p className="text-sm text-ink-muted">
            {SYSTEMS.slice(0, 6)
              .map((row) => row.hostname)
              .join(', ')}
          </p>
        </DialogFrame>
      )}
    </Opens>
  ),
  play: async ({ canvasElement, step }) => {
    const box = await liveDialog(canvasElement)
    const dialog = within(box)

    await step('the title wraps inside the frame', async () => {
      // Wrapping rather than widening: a title that sized the box would make
      // every dialog as wide as its longest sentence.
      const title = dialog.getByRole('heading', { name: LONG_TITLE })
      await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
        box.getBoundingClientRect().right + 1,
      )
      await expect(title.getBoundingClientRect().height).toBeGreaterThan(24)
    })

    await step('and the dismiss keeps the first line', async () => {
      // It is the way out. Pushed down the wrap it moves with the title's
      // length, which the reader cannot predict.
      // "Close" also names the story's own action button, so the dismiss is
      // the one in the head rather than the one in the footer.
      const close = dialog
        .getAllByRole('button', { name: /close/i })[0]!
        .getBoundingClientRect()
      const title = dialog.getByRole('heading', { name: LONG_TITLE }).getBoundingClientRect()
      await expect(close.top).toBeLessThan(title.top + 24)
    })
  },
}

/** No footnote, no actions and no body: the head alone is a valid dialog. */
export const HeadOnly: Story = {
  name: 'An empty body',
  parameters: frame('260px'),
  render: () => (
    <Opens label="Nothing to show" size="compact" startOpen>
      {(close) => (
        <DialogFrame
          title="No merge to review"
          subtitle="Nobody has written over a field you were editing."
          onClose={close}
        />
      )}
    </Opens>
  ),
  play: async ({ canvasElement }) => {
    const box = await liveDialog(canvasElement)
    const dialog = within(box)

    // A head with no body and no actions: the only control is the way out,
    // and the footer is absent rather than drawn empty. An empty bar across
    // the foot of a dialog reads as controls that failed to render.
    await expect(dialog.getByRole('heading', { name: 'No merge to review' })).toBeVisible()
    await expect(dialog.getAllByRole('button')).toHaveLength(1)
    await expect(box.querySelector('[data-slot="dialog-actions"]')).toBeNull()
  },
}

/**
 * The footer on its own, and the mark on its own.
 *
 * `DialogActions` is what the kit's `DialogFooter` is not: a footnote on the
 * left against the controls on the right. Drawn here outside a dialog, at the
 * width one would give it.
 */
export const Parts: Story = {
  name: 'The footer and the mark, alone',
  render: () => (
    <div className="flex w-[32rem] flex-col gap-6">
      <div className="flex items-center gap-4">
        <DialogMark icon={ShieldAlert} />
        <DialogMark icon={Trash2} tone="danger" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <DialogActions
          footnote={
            <span className="text-xs text-ink-muted">
              {SYSTEMS.length} systems will keep their rows
            </span>
          }
        >
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogActions>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <DialogActions>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </DialogActions>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    // Outside a dialog, which is the point: the footer is a block in its own
    // right, and the footnote against the controls is its whole arrangement.
    const footnote = canvas.getByText(/systems will keep their rows/).getBoundingClientRect()
    const remove = canvas.getByRole('button', { name: 'Delete' }).getBoundingClientRect()
    await expect(footnote.left).toBeLessThan(remove.left)

    // The second footer carries no footnote, and its controls sit where the
    // first one's do rather than sliding left into the empty half.
    const save = canvas.getByRole('button', { name: 'Save' }).getBoundingClientRect()
    await expect(Math.abs(save.right - remove.right)).toBeLessThan(2)
  },
}
