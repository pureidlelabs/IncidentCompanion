import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import { ApiError } from '@/api/client'
import { refOptions } from '@/api/refOptions'
import { formSpec } from '@/api/specs'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

/**
 * `EntityDialog` on the React Aria kit, at the shapes the served specs take:
 * a create, an edit holding a row, and a form whose references resolve against
 * the campaign case's own rows.
 */
const Dialog = EntityDialog<Record<string, unknown>>

/**
 * The create-and-edit dialog every entity screen opens, at the shapes a served
 * field spec can take.
 */
const meta = {
  title: 'Blocks/Overlay/Entity',
  component: Dialog,
  parameters: { layout: 'centered' },
  args: {
    // Shut by default, and `openInFrame` is what turns it on per story: a docs
    // page renders every story into one document, and this dialog is modal --
    // five open there at once cannot be dismissed.
    open: false,
    onOpenChange: () => undefined,
    // Typed as the prop is, so a story may answer a promise: the meta's
    // default would otherwise narrow every story to a caller returning nothing.
    onCreate: (): unknown => undefined,
  },
  decorators: [
    (Story, context) => {
      const [open, setOpen] = useState(context.parameters.startOpen === true)
      return (
        <>
          <Button variant="outline" onPress={() => { setOpen(true) }}>
            {String(context.parameters.openLabel ?? 'Open the dialog')}
          </Button>
          <Story args={{ ...context.args, open, onOpenChange: setOpen }} />
        </>
      )
    },
  ],
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/** Open on mount, in its own docs frame `height` tall. */
function openInFrame(height: string) {
  return { startOpen: true, docs: { story: { inline: false, height } } }
}

/**
 * The dialog is on the page, under the title the story asked for.
 */
async function showsDialog(canvasElement: HTMLElement, title: string) {
  const body = within(canvasElement.ownerDocument.body)
  await expect(await body.findByRole('dialog')).toBeInTheDocument()
  await expect(await body.findByText(title)).toBeInTheDocument()
}

const system = campaignCase.systems[0]!

/** No `entry`, so the same spec draws the same boxes with nothing in them. */
export const Create: Story = {
  parameters: openInFrame('760px'),
  name: 'Systems \u2014 a blank draft',
  play: async ({ canvasElement, step }) => {
    await showsDialog(canvasElement, 'Add system')
    const body = within(canvasElement.ownerDocument.body)

    await step('The boxes the spec asked for are empty', async () => {
      const boxes = body.getAllByRole('textbox')
      await expect(boxes.length).toBeGreaterThan(0)
      for (const box of boxes) await expect(box).toHaveValue('')
    })
  },
  args: {
    title: 'Add system',
    form: formSpec(specsFixture, 'SYSTEM_FIELDS'),
    references: { methods: refOptions(campaignCase.methods, (row) => row.name) },
    suggestions: { analyst: ['Alex Rivera', 'Sam Okafor'], tags: ['exfil', 'phishing'] },
  },
}

/**
 * The server refuses the write.
 */
export const Refused: Story = {
  parameters: { docs: { story: { inline: false, height: '760px' } } },
  name: 'Systems \u2014 the write is refused',
  args: {
    title: 'Add system',
    form: formSpec(specsFixture, 'SYSTEM_FIELDS'),
    references: { methods: refOptions(campaignCase.methods, (row) => row.name) },
    onCreate: () => Promise.reject(new ApiError(409, 'A. Okonkwo saved this first.', null)),
  },
  /**
   * Its own harness, because presence cannot answer the question.
   */
  render: function Refused(args) {
    const [open, setOpen] = useState(true)
    const [closes, setCloses] = useState(0)
    return (
      <>
        <p data-testid="closes-asked">{String(closes)}</p>
        <Dialog
          {...args}
          open={open}
          onOpenChange={(next) => {
            if (!next) setCloses((count) => count + 1)
            setOpen(next)
          }}
        />
      </>
    )
  },
  play: async ({ canvasElement, step }) => {
    await showsDialog(canvasElement, 'Add system')
    const body = within(canvasElement.ownerDocument.body)

    const hostname = body.getAllByRole('textbox')[0]
    if (hostname === undefined) throw new Error('the form drew no boxes')
    await userEvent.type(hostname, 'WKS-FIN09')
    await userEvent.click(body.getByRole('button', { name: 'Create' }))

    // **The refusal first, because it is what settles the render.** A
    // `findBy*` retries until it matches, so asking whether the dialog is
    // there before the rejection has been handled matches the dialog that is
    // still closing -- the assertion passes whether it stays or goes, which
    // is a check that reports nothing.
    await step('it says why, in the server`s own words', async () => {
      await expect(await body.findByText(/saved this first/)).toBeInTheDocument()
    })

    await step('and nothing asked the dialog to close', async () => {
      await expect(within(canvasElement).getByTestId('closes-asked')).toHaveTextContent('0')
      await expect(hostname).toHaveValue('WKS-FIN09')
    })
  },
}

/**
 * The same spec with a row handed to it.
 */
export const Edit: Story = {
  parameters: openInFrame('760px'),
  name: 'Systems \u2014 editing a row',
  play: async ({ canvasElement, step }) => {
    await showsDialog(canvasElement, 'Edit system')
    const body = within(canvasElement.ownerDocument.body)

    await step('The row it was given is in the boxes', async () => {
      await expect(
        body.getAllByRole('textbox').some((box) => (box as HTMLInputElement).value !== ''),
      ).toBe(true)
      await expect(body.getByRole('dialog')).toHaveTextContent(/Edit system/)
    })
  },
  args: {
    title: 'Edit system',
    form: formSpec(specsFixture, 'SYSTEM_FIELDS'),
    entry: system,
    references: { methods: refOptions(campaignCase.methods, (row) => row.name) },
  },
}

/**
 * A form whose references resolve against the case's own rows.
 */
export const WithReferences: Story = {
  parameters: openInFrame('900px'),
  name: 'Network indicators \u2014 two references',
  play: async ({ canvasElement, step }) => {
    await showsDialog(canvasElement, 'Add indicator')
    const body = within(canvasElement.ownerDocument.body)

    await step('The dialog carries pickers for its references', async () => {
      await expect(body.getAllByRole('button').length).toBeGreaterThan(2)
    })
  },
  args: {
    title: 'Add indicator',
    form: formSpec(specsFixture, 'NETWORK_FIELDS'),
    references: {
      systems: refOptions(campaignCase.systems, (row) => row.hostname),
      malware: refOptions(campaignCase.malware, (row) => row.filename),
      methods: refOptions(campaignCase.methods, (row) => row.name),
    },
  },
}

/**
 * A form declaring no `tier`, which is every timeline form and the case form.
 */
export const NoIdentityTier: Story = {
  parameters: openInFrame('760px'),
  name: 'Timeline event \u2014 no identity tier',
  play: async ({ canvasElement, step }) => {
    await showsDialog(canvasElement, 'New event')
    const body = within(canvasElement.ownerDocument.body)

    // Absent rather than empty: a plate held open with nothing in it is a band
    // of blank at the top of every timeline form.
    await step('No identity plate is drawn', async () => {
      await expect(
        body.getByRole('dialog').querySelector('[data-slot="entity-dialog-identity"]'),
      ).toBeNull()
    })

    // The claim the footer band exists for, asserted on what rendered. Without
    // it the band can be deleted outright and every tier stays green: the
    // dialog draws perfectly and posts a body with the three fields missing.
    await step('The settings the form marks `footerRow` are drawn in the footer', async () => {
      const footer = body.getByRole('dialog').querySelector('[data-slot="dialog-footer"]')
      await expect(footer).not.toBeNull()
      for (const name of ['Colour', 'Hide on investigation graph', 'Flag for follow-up']) {
        const control = body.getByText(name)
        await expect(control).toBeVisible()
        await expect(footer?.contains(control)).toBe(true)
      }
    })
  },
  args: {
    title: 'New event',
    form: formSpec(specsFixture, 'EVENT_FIELDS'),
    // All seven the form points at: a collection left out logs a wiring
    // mistake, which the story runner turns into a failure.
    references: {
      systems: refOptions(campaignCase.systems, (row) => row.hostname),
      accounts: refOptions(campaignCase.accounts, (row) => row.accountName),
      cloud_apps: refOptions(campaignCase.cloudApps, (row) => row.appName),
      network_indicators: refOptions(campaignCase.networkIndicators, (row) => row.value),
      malware: refOptions(campaignCase.malware, (row) => row.filename),
      evidence: refOptions(campaignCase.evidence, (row) => row.name),
      methods: refOptions(campaignCase.methods, (row) => row.name),
    },
  },
}

/**
 * Shut: the draft is unmounted, so reopening starts blank.
 */
export const Shut: Story = {
  args: {
    open: false,
    title: 'Add system',
    form: formSpec(specsFixture, 'SYSTEM_FIELDS'),
    // Wired, because this story now opens the dialog: a section left without
    // options for a reference it declares logs a mistake, which the runner
    // turns into a failure.
    references: { methods: refOptions(campaignCase.methods, (row) => row.name) },
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    const open = async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Open the dialog' }))
      return within(await body.findByRole('dialog'))
    }

    await step('Nothing is on the page until it is opened', async () => {
      await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
    })

    let typed = ''
    await step('A draft is started and abandoned', async () => {
      const dialog = await open()
      const box = dialog.getAllByRole('textbox')[0]!
      await userEvent.type(box, 'WKS-ABANDONED')
      typed = box.getAttribute('name') ?? ''
      await expect(box).toHaveValue('WKS-ABANDONED')
      await userEvent.keyboard('{Escape}')
      await waitFor(() => {
        void expect(body.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    await step('And opening it again starts from nothing', async () => {
      const dialog = await open()
      const box = typed === ''
        ? dialog.getAllByRole('textbox')[0]!
        : dialog.getAllByRole('textbox').find((one) => one.getAttribute('name') === typed)!
      await expect(box).toHaveValue('')
    })
  },
}
