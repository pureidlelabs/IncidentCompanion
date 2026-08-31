import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import { Button } from './button'
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTrigger } from './dialog'

/**
 * A modal dialog: focus moves into it and back out, the scroll behind it is
 * locked, and it closes on Escape or the scrim.
 *
 * **Dismissable, against React Aria's default.** The foundation leaves an
 * overlay closed to outside clicks; the kit opts in here and opts out for
 * `AlertDialog`, so a panel can be waved away and a decision cannot.
 *
 * `size` is four archetypes rather than a measurement: `compact` for a prompt,
 * `form` for two columns of fields, `workbench` for a fixed height that does
 * not resize as groups fold, and `finder` anchored to the top so a list growing
 * downward does not move what is being read.
 *
 * Every story that opens one renders in its own docs frame, since the panel
 * resolves its height against the viewport and the autodocs page would give it
 * the whole document.
 */
const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
  args: {
    size: 'compact',
    children: (
      <DialogBody>
        <p className="text-sm text-ink-muted">Everything recorded on the case is kept.</p>
      </DialogBody>
    ),
  },
  render: (args) => <Dialog {...args} defaultOpen />,
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A trigger and the dialog it opens.
 *
 * `startOpen` puts the archetype on the page rather than behind a press, and
 * every story that passes it also renders in its own docs frame - see `frame`.
 */
function Demo({
  size,
  startOpen = false,
}: {
  size: 'compact' | 'form' | 'workbench' | 'finder'
  startOpen?: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline">Open {size}</Button>
      <Dialog size={size}>
        <DialogHeader
          title="Close this case"
          description="The report stays readable after closing."
          onClose={() => {
            setOpen(false)
          }}
        />
        <DialogBody>
          <p className="text-sm text-ink-muted">
            Everything recorded on the case is kept. Reopening restores it exactly.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button
            onPress={() => {
              setOpen(false)
            }}
          >
            Close case
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  )
}

/**
 * Story parameters that give the story its own docs frame, `height` tall.
 *
 * The frame is what an open modal needs to be showable on the autodocs page:
 * inline, every story shares one document, so an overlay open on mount stacks
 * un-dismissably and locks that page's scroll. The height is the frame's
 * viewport, which is what a dialog's own `max-h`/`h` resolve against.
 */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** The default archetype: a prompt or a short form. */
export const Compact: Story = {
  parameters: frame('340px'),
  render: () => <Demo size="compact" startOpen />,
}

/** Two columns of fields. */
export const Form: Story = {
  parameters: frame('340px'),
  render: () => <Demo size="form" startOpen />,
}

/** Fixed height, so the box does not resize as groups fold. */
export const Workbench: Story = {
  // 824px, so `h-[min(760px,calc(100vh-4rem))]` resolves to the 760 the
  // archetype is: a shorter frame shows a box sized by the frame instead.
  parameters: frame('824px'),
  render: () => <Demo size="workbench" startOpen />,
}

/**
 * Top-anchored: a list that grows downward does not move what you are reading.
 *
 * The anchoring is the whole archetype, and it is the one thing about it that
 * cannot be seen from the markup -- a finder that lost its anchor centres like
 * every other dialog and still looks deliberate.
 */
export const Finder: Story = {
  // 660px, for `h-[min(520px,calc(100vh-8rem))]` plus the 12vh top anchor.
  parameters: frame('660px'),
  render: () => <Demo size="finder" startOpen />,
  play: async ({ canvasElement }) => {
    const panel = (await screen.findByRole('dialog')).getBoundingClientRect()
    const viewport = canvasElement.ownerDocument.documentElement.clientHeight

    // Nearer the top than a centred panel of the same height would be.
    const centred = (viewport - panel.height) / 2
    await expect(panel.top).toBeLessThan(centred)
  },
}

/**
 * **Focus moves into the dialog and returns to the trigger when it closes.**
 *
 * The interface specification asks for exactly this, and it is the part an
 * analyst working from the keyboard loses silently: a dialog that does not take
 * focus leaves them tabbing the page behind it, and one that does not give it
 * back drops them at the top of the document.
 */
export const FocusMovesAndReturns: Story = {
  parameters: frame('340px'),
  render: () => <Demo size="compact" />,
  play: async ({ canvas, canvasElement, step, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: /Open compact/ })

    await step('Opening moves focus inside', async () => {
      await userEvent.click(trigger)
      const panel = await screen.findByRole('dialog')
      await waitFor(() => {
        void expect(panel.contains(canvasElement.ownerDocument.activeElement)).toBe(true)
      })
    })

    await step('And closing gives it back to the trigger', async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(
        () => {
          void expect(trigger).toHaveFocus()
        },
        { timeout: 4000 },
      )
    })
  },
}

/** Open on mount, so the surface itself is on the page rather than behind a press. */
export const Open: Story = {
  parameters: frame('340px'),
  render: () => (
    <Dialog defaultOpen size="compact" dialogProps={{ 'aria-label': 'Close this case' }}>
      <DialogHeader title="Close this case" description="The report stays readable after closing." />
      <DialogBody>
        <p className="text-sm text-ink-muted">
          Everything recorded on the case is kept.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Close case</Button>
      </DialogFooter>
    </Dialog>
  ),
}

/**
 * Open and close it twice in quick succession. The scrim and the panel turn
 * round from wherever they had got to rather than jumping to the end state,
 * which is what a keyframe animation cannot do and is the reason these
 * overlays are driven by Motion.
 */
export const Interrupting: Story = {
  render: () => {
    function Interruptible() {
      const [open, setOpen] = useState(false)
      return (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onPress={() => {
              setOpen((was) => !was)
            }}
          >
            Toggle
          </Button>
          <Dialog
            isOpen={open}
            onOpenChange={setOpen}
            dialogProps={{ 'aria-label': 'Close this case' }}
          >
            <DialogHeader
              title="Close this case"
              onClose={() => {
                setOpen(false)
              }}
            />
            <DialogBody>
              <p className="text-sm text-ink-muted">
                Press the toggle twice quickly with this open.
              </p>
            </DialogBody>
          </Dialog>
        </div>
      )
    }
    return <Interruptible />
  },
}

/**
 * Controlled, with no trigger above it, closed by the caller.
 *
 * **The shape every section in this app actually uses**, and the one no story
 * here covered: `EntityDialog` renders `<Dialog isOpen={open}>` with no
 * `DialogTrigger`, so the open state lives in the caller rather than on
 * context. `useOverlayIsOpen` reads it from a different place in each of its
 * three cases, and this is the case a section takes.
 *
 * The claim is that the dialog **leaves the DOM** when the caller closes it.
 * React Aria drops `data-open` the moment its state flips, so a check on that
 * passes while the panel is still on screen -- which is how a stranded panel
 * survived every tier until the browser one pressed Cancel and then tried to
 * press something behind it.
 */
export const ClosedByTheCaller: Story = {
  parameters: frame('340px'),
  render: () => {
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            Edit record
          </Button>
          <Dialog
            isOpen={open}
            onOpenChange={setOpen}
            size="form"
            dialogProps={{ 'aria-label': 'Edit record' }}
          >
            <DialogHeader title="Edit record" />
            <DialogBody>
              <p className="text-sm text-ink-muted">A field would sit here.</p>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="outline"
                onPress={() => {
                  setOpen(false)
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </Dialog>
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit record' }))

    // **Presence, not visibility.** This harness runs no animation, so a
    // Motion-driven overlay settles at opacity 0 and `toBeVisible` answers
    // false for a dialog that is genuinely open. Whether it *shows* is the
    // browser tier's question.
    const dialog = await screen.findByRole('dialog', { name: 'Edit record' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(
      () => {
        void expect(screen.queryByRole('dialog', { name: 'Edit record' })).not.toBeInTheDocument()
      },
      { timeout: 4000 },
    )
  },
}
