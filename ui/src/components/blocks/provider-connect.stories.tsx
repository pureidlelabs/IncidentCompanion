import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { ProviderConnect } from '@/components/blocks/provider-connect'

/**
 * The importer's connect step: no provider, an empty form, and the signed-in
 * summary with its way back.
 */
const meta = {
  title: 'Blocks/Form/Provider connect',
  component: ProviderConnect,
  parameters: { layout: 'padded' },
  args: {
    connected: true,
    identity: '',
    tenantId: '',
    clientId: '',
    onTenantId: () => undefined,
    onClientId: () => undefined,
  },
} satisfies Meta<typeof ProviderConnect>

export default meta
type Story = StoryObj<typeof meta>

/**
 * An install with no importer: the form is not drawn, and a line says so.
 *
 * A form that cannot go anywhere is worse than none -- it invites an analyst
 * to fill in coordinates nothing will use. The alert also says what still
 * works, so the absence reads as a limit rather than a fault.
 */
export const NoProvider: Story = {
  name: 'No importer configured',
  args: { connected: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('This install cannot reach a provider')).toBeVisible()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}

/**
 * The form with nothing in it, which is what a fresh install draws.
 *
 * Both coordinates are the organisation's to supply, so the form is open
 * rather than behind an edit control until there is something to put away.
 */
export const EmptyForm: Story = {
  name: 'The form, empty',
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Directory (tenant) ID')).toHaveValue('')
    await expect(canvas.getByLabelText('Application (client) ID')).toHaveValue('')
  },
}

/**
 * Coordinates entered and nobody signed in yet.
 *
 * Filling the form is not signing in: the two are separate acts, and the form
 * stays open until the second has happened.
 */
export const Filled: Story = {
  name: 'The form, filled but not yet signed in',
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText('Directory (tenant) ID')).toHaveValue(args.tenantId)
    await expect(canvas.getByLabelText('Application (client) ID')).toHaveValue(args.clientId)
  },
  args: { tenantId: 'meridian-logistics.example', clientId: '7b1c0f4e-3a8d-4a11-9f2e-1d5c6b8a0e93' },
}

/**
 * Signed in, with the coordinates folded away behind an edit control.
 *
 * They are set once and read never, so leaving two long identifiers on screen
 * costs the pane its whole width for something nobody rereads. The line names
 * who is signed in, which is the fact that does get checked.
 */
export const SignedIn: Story = {
  name: 'Signed in, coordinates put away',
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(`Signed in as ${args.identity}.`)).toBeVisible()
    // Put away, not merely scrolled past.
    await expect(canvas.queryByDisplayValue(args.clientId)).not.toBeInTheDocument()
  },
  args: {
    tenantId: 'meridian-logistics.example',
    clientId: '7b1c0f4e-3a8d-4a11-9f2e-1d5c6b8a0e93',
    identity: 'rin.okafor@meridian-logistics.example',
  },
}
