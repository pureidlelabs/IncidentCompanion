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
 */
export const EmptyForm: Story = {
  name: 'The form, empty',
  play: async ({ canvas }) => {
    // Both coordinates, empty and open: nothing to put away yet.
    await expect(canvas.getByLabelText('Directory (tenant) ID')).toHaveValue('')
    await expect(canvas.getByLabelText('Application (client) ID')).toHaveValue('')
  },
}

/**
 * Coordinates entered and nobody signed in yet.
 */
export const Filled: Story = {
  name: 'The form, filled but not yet signed in',
  play: async ({ canvas, args }) => {
    // Filled and still open: entering the coordinates is not signing in, and
    // the form stays until somebody has.
    await expect(canvas.getByLabelText('Directory (tenant) ID')).toHaveValue(args.tenantId)
    await expect(canvas.getByLabelText('Application (client) ID')).toHaveValue(args.clientId)
  },
  args: { tenantId: 'meridian-logistics.example', clientId: '7b1c0f4e-3a8d-4a11-9f2e-1d5c6b8a0e93' },
}

/**
 * Signed in, with the coordinates folded away behind an edit control.
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
