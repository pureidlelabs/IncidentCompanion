import type { Meta, StoryObj } from '@storybook/react-vite'
import { Boxes, FileText, HardDrive, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { DialogFrame } from '@/components/blocks/dialog-frame'
import { DialogPaneRow, DialogPanes } from '@/components/blocks/dialog-panes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, type DialogProps } from '@/components/ui/dialog'
import { campaignCase } from '@/fixtures/campaign'

const SYSTEMS = campaignCase.systems
const ACCOUNTS = campaignCase.accounts
const EVIDENCE = campaignCase.evidence
const EVENTS = campaignCase.timeline

const RAIL = [
  {
    key: 'systems',
    icon: Boxes,
    label: 'Systems',
    hint: 'Hosts, servers and appliances',
    count: SYSTEMS.length,
  },
  {
    key: 'accounts',
    icon: Users,
    label: 'Accounts',
    hint: 'Identities seen in the intrusion',
    count: ACCOUNTS.length,
  },
  {
    key: 'evidence',
    icon: HardDrive,
    label: 'Evidence',
    hint: 'What was collected, and from where',
    count: EVIDENCE.length,
  },
  {
    key: 'timeline',
    icon: FileText,
    label: 'Timeline',
    hint: 'Events and actions, in order',
    count: EVENTS.length,
  },
] as const

type RailKey = (typeof RAIL)[number]['key']

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

/** Rows for whichever rail row is pressed, so the pane is long enough to scroll. */
function paneRows(key: RailKey): { id: string; primary: string; secondary: string }[] {
  if (key === 'systems') {
    return SYSTEMS.map((row) => ({ id: row.id, primary: row.hostname, secondary: row.systemType }))
  }
  if (key === 'accounts') {
    return ACCOUNTS.map((row) => ({
      id: row.id,
      primary: row.accountName,
      secondary: row.privileges,
    }))
  }
  if (key === 'evidence') {
    return EVIDENCE.map((row) => ({ id: row.id, primary: row.name, secondary: row.type }))
  }
  return EVENTS.slice(0, 40).map((row, index) => ({
    id: String(index),
    primary: row.description,
    secondary: row.kind,
  }))
}

/** The two-pane body, with the rail deciding what the pane lists. */
function PanePicker({ showRailLabel = false }: { showRailLabel?: boolean }) {
  const [active, setActive] = useState<RailKey>('systems')
  const [picked, setPicked] = useState<readonly string[]>([])

  return (
    <DialogPanes
      railLabel="Kind"
      showRailLabel={showRailLabel}
      rail={RAIL.map((row) => (
        <DialogPaneRow
          key={row.key}
          icon={row.icon}
          label={row.label}
          hint={row.hint}
          count={row.count}
          countLabel={`${String(row.count)} ${row.label.toLowerCase()}`}
          active={active === row.key}
          onSelect={() => {
            setActive(row.key)
            setPicked([])
          }}
        />
      ))}
    >
      {paneRows(active).map((row) => (
        <Checkbox
          key={row.id}
          isSelected={picked.includes(row.id)}
          onChange={(next) => {
            setPicked((was) => (next ? [...was, row.id] : was.filter((id) => id !== row.id)))
          }}
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{row.primary}</span>
            <span className="truncate text-2xs text-ink-muted">{row.secondary}</span>
          </span>
        </Checkbox>
      ))}
    </DialogPanes>
  )
}

/**
 * `DialogPanes`: a rail that narrows the choice, and the pane holding what was
 * chosen from.
 *
 * The two scroll separately, so the story needs a body long enough to prove it
 * - the timeline row is forty entries against a rail of four.
 */
const meta = {
  title: 'Blocks/Overlay/Panes',
  component: DialogPanes,
  parameters: { layout: 'centered' },
  // Every story renders its own trigger, so these only feed the props table.
  args: { railLabel: 'Kind', rail: null, children: null },
} satisfies Meta<typeof DialogPanes>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The dialog that is on screen now, once it has finished arriving.
 *
 * Stories share a page: one left over from an earlier story stays in the
 * document while it animates out, and the one this story opened is in the
 * document a frame before it is painted.
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

/**
 * The panes as a dialog's whole body.
 *
 * `bleed` keeps the kit's `DialogBody` out of the way, because the two panes
 * scroll separately and a scroller round them would be a third.
 */
export const InADialog: Story = {
  name: 'Two panes, scrolling separately',
  // 824px, so `workbench` resolves to its own 760 rather than to the frame.
  parameters: frame('824px'),
  render: () => (
    <Opens label="Link entities" size="workbench" startOpen>
      {(close) => (
        <DialogFrame
          title="Link entities"
          subtitle="Pick what this event touched. The rail narrows to one kind at a time."
          onClose={close}
          bleed
          footnote={<span className="text-xs text-ink-muted">Nothing picked yet</span>}
          actions={
            <>
              <Button variant="outline" onPress={close}>
                Cancel
              </Button>
              <Button onPress={close}>Link</Button>
            </>
          }
        >
          <PanePicker showRailLabel />
        </DialogFrame>
      )}
    </Opens>
  ),
  play: async ({ canvasElement, step }) => {
    const dialog = within(await liveDialog(canvasElement))

    await step('the rail narrows the pane to one kind', async () => {
      // The rail opens on Systems, so the pane lists hosts. A rail that
      // changed nothing would look identical until the rows are read.
      await expect(dialog.getByText(SYSTEMS[0]!.hostname)).toBeVisible()
      await expect(dialog.queryByText(ACCOUNTS[0]!.accountName)).toBeNull()

      await userEvent.click(dialog.getByText('Accounts'))
      await expect(await dialog.findByText(ACCOUNTS[0]!.accountName)).toBeVisible()
      await expect(dialog.queryByText(SYSTEMS[0]!.hostname)).toBeNull()
    })

    await step('and the two panes scroll separately', async () => {
      // Forty entries against a rail of four: one scroller round both would
      // take the rail off screen while the analyst reads the pane.
      await userEvent.click(dialog.getByText('Timeline'))
      await dialog.findByText(EVENTS[0]!.description)

      // The rail is the labelled `nav` and the pane is the element beside it.
      const rail = dialog.getByRole('navigation', { name: 'Kind' })
      const pane = rail.nextElementSibling!
      const panes = rail.parentElement!

      // Each pane carries its own scroller and the box around them carries
      // none: one scroller round both would take the rail off the screen
      // while the analyst reads down the pane.
      await expect(getComputedStyle(pane).overflowY).toBe('auto')
      await expect(getComputedStyle(rail).overflowY).toBe('auto')
      await expect(getComputedStyle(panes).overflowY).toBe('visible')

      // And the pane really is longer than the height it was handed, which is
      // what makes that arrangement do anything at all.
      await expect(pane.scrollHeight).toBeGreaterThan(pane.clientHeight)
    })
  },
}

/**
 * The rail without its label, which is the default.
 *
 * Drawn at the measure a dialog gives it, outside one: the rail is a fixed
 * width and the pane takes what is left, and that is visible without a modal
 * over the page.
 */
export const Bare: Story = {
  name: 'The panes alone',
  // Capped against the *viewport*, which is the only box here that is not
  // sized by this one. 46rem is 736px, and inside Storybook's 16px root
  // padding that is 768px against the 720px the sweep's second pass runs at,
  // so the page scrolled sideways by 48px on every narrow run -- the one
  // finding kind that is never intended. `w-full` collapses the box to 372px
  // and `max-w-full` is inert, both because the root shrink-wraps to this
  // child: a percentage of it resolves against the width being set.
  render: () => (
    <div className="flex h-[28rem] w-[46rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border">
      <PanePicker />
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('the rail label is off by default', async () => {
      // The rows say what the rail is for. A heading over four labelled rows
      // is a word spent on something already said.
      await expect(canvas.queryByText('Kind')).toBeNull()
    })

    await step('and the rail keeps its width while the pane takes the rest', async () => {
      const rail = canvas.getByRole('navigation', { name: 'Kind' })
      const pane = rail.nextElementSibling!
      await expect(rail.getBoundingClientRect().width).toBeLessThan(
        pane.getBoundingClientRect().width,
      )
    })
  },
}
