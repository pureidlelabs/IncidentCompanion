import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import type { LibraryEntry } from '@/api/library'
import { specsFixture } from '@/fixtures/specs'

import { NewCaseScreen, type NewCaseWrites } from './new-case'

/** Four shipped templates, read from the seeded rows. */
const DEMO_SHIPPED_TEMPLATES: readonly LibraryEntry[] = [
  {
    name: 'phishing',
    label: 'Phishing campaign',
    description:
      'A malicious message reached users: scope the campaign, find who acted on it, and pull what is still in mailboxes.',
    origin: 'built-in',
    canEdit: false,
    canDelete: false,
    canDuplicate: true,
  },
  {
    name: 'bec',
    label: 'Business email compromise',
    description:
      'Somebody else controls a mailbox: audit logs, inbox rules, and the payments that may already have moved.',
    origin: 'built-in',
    canEdit: false,
    canDelete: false,
    canDuplicate: true,
  },
  {
    name: 'ransomware',
    label: 'Ransomware',
    description:
      'Encryption has fired: scope the blast radius, find the entry point, and record what was recoverable.',
    origin: 'built-in',
    canEdit: false,
    canDelete: false,
    canDuplicate: true,
  },
  {
    name: 'insider',
    label: 'Insider / data theft',
    description:
      'An authorized user is the subject: evidence handling and HR involvement change how this one is run.',
    origin: 'built-in',
    canEdit: false,
    canDelete: false,
    canDuplicate: true,
  },
]

/** One analyst's own, which is what the "Yours" chip is for. */
const DEMO_OWN_TEMPLATE: LibraryEntry = {
  name: 'vendor-breach',
  label: 'Third-party breach',
  description: 'A supplier told us they were breached. Scope what of ours they held.',
  origin: 'yours',
  canEdit: true,
  canDelete: true,
  canDuplicate: true,
}

const DEMO_TEMPLATES: readonly LibraryEntry[] = [...DEMO_SHIPPED_TEMPLATES, DEMO_OWN_TEMPLATE]

function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * The picker's blank-case door: a dialog held open by the caller, with no
 * trigger of its own.
 *
 * Every story but `OpenedByAPress` renders it already open, the same reason
 * `Dialog`'s own archetype stories do - the surface is what is being judged,
 * not the press that reaches it.
 */
const meta = {
  title: 'Screens/System/New case',
  component: NewCaseScreen,
  parameters: { layout: 'centered' },
  args: { templates: DEMO_TEMPLATES, specs: specsFixture },
} satisfies Meta<typeof NewCaseScreen>

export default meta
type Story = StoryObj<typeof meta>

/** Open on mount, with nothing yet typed. */
export const Opening: Story = {
  parameters: frame('520px'),
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New case' })
    within(dialog).getByRole('textbox', { name: 'Title' })
    within(dialog).getByRole('button', { name: 'Create case' })
  },
}

/**
 * A template picked from the list.
 *
 * `PickPane` names each row's radio by the template's own title, so pressing
 * a template is a press on that radio - the same control the keyboard drives.
 */
export const TemplateChosen: Story = {
  parameters: frame('520px'),
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New case' })
    const radio = within(dialog).getByRole('radio', { name: 'Phishing campaign' })
    await userEvent.click(radio)
    await waitFor(() => {
      void expect(radio).toBeChecked()
    })
  },
}

/** `writes.create` never resolves during the story, so the pending state holds. */
export const RequestInFlight: Story = {
  parameters: frame('520px'),
  args: {
    writes: {
      create: () => new Promise(() => undefined),
    } satisfies NewCaseWrites,
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New case' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Ransomware in finance')
    const submit = within(dialog).getByTestId('new-case-submit')
    await userEvent.click(submit)
    await waitFor(() => {
      void expect(submit).toBeDisabled()
    })
  },
}

/**
 * The server refuses the create.
 *
 * **Nothing typed is lost.** The problem line renders what the server said,
 * and Customer keeps the value the analyst entered - a refused create is not a
 * reason to retype the rest of the form.
 */
export const ServerRefusing: Story = {
  parameters: frame('520px'),
  args: {
    writes: {
      create: () => Promise.reject(new Error('A case with this title already exists.')),
    } satisfies NewCaseWrites,
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'New case' })
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    const customer = within(dialog).getByRole('textbox', { name: 'Customer' })
    await userEvent.type(title, 'Ransomware in finance')
    await userEvent.type(customer, 'Meridian Logistics')

    await userEvent.click(within(dialog).getByTestId('new-case-submit'))

    await within(dialog).findByText('A case with this title already exists.')
    void expect(customer).toHaveValue('Meridian Logistics')
  },
}

/**
 * Controlled, with no trigger above it, opened by the caller pressing something.
 *
 * The shape every real mount uses: the screen never renders its own trigger,
 * so a story showing the open transition has to build one, the same way
 * `Dialog`'s own `ClosedByTheCaller` story does for the primitive underneath.
 */
export const OpenedByAPress: Story = {
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
            Start a blank case
          </Button>
          <NewCaseScreen
            isOpen={open}
            onOpenChange={setOpen}
            onCreated={() => {
              setOpen(false)
            }}
            templates={DEMO_TEMPLATES}
            specs={specsFixture}
          />
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Start a blank case' }))

    // Presence, not visibility - this harness runs no animation, so the
    // overlay settles at opacity 0 and `toBeVisible` would answer false for a
    // dialog that is genuinely open.
    await screen.findByRole('dialog', { name: 'New case' })
  },
}
