import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import {
  ProviderWorkspacePicker,
  type SourceChoice,
} from '@/components/blocks/provider-workspace-picker'

/** Four workspaces, two of which share a name. */
const SOURCES: readonly SourceChoice[] = [
  {
    id: 'ws-1',
    name: 'meridian-soc',
    detail: 'westeurope - rg-security',
    subscription: 'Meridian Production',
    incidents: 42,
  },
  {
    id: 'ws-2',
    name: 'meridian-soc',
    detail: 'northeurope - rg-security-dr',
    subscription: 'Meridian Recovery',
    incidents: 6,
  },
  {
    id: 'ws-3',
    name: 'northwind-ops',
    detail: 'uksouth - rg-northwind',
    subscription: 'Northwind',
    incidents: 18,
  },
]

/**
 * Open one of the two dials and read back the entries it offers.
 */
async function offered(trigger: HTMLElement): Promise<string[]> {
  await userEvent.click(trigger)
  await waitFor(async () => {
    await expect(screen.getAllByRole('listbox')).toHaveLength(1)
  })
  const box = screen.getByRole('listbox')
  return within(box)
    .getAllByRole('option')
    .map((one) => one.textContent)
}

/**
 * The importer's workspace step: name and subscription narrow what one
 * sign-in already fetched, and the picker shows what is left.
 */
const meta = {
  title: 'Blocks/Form/Provider workspace picker',
  component: ProviderWorkspacePicker,
  parameters: { layout: 'padded' },
  args: {
    sources: SOURCES,
    name: '',
    subscription: 'Any',
    value: '',
    onName: () => undefined,
    onSubscription: () => undefined,
    onValue: () => undefined,
    onDisconnect: () => undefined,
  },
} satisfies Meta<typeof ProviderWorkspacePicker>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every workspace the account can see, two of them named the same.
 */
export const Default: Story = {
  name: 'Every workspace the account can see',
  play: async ({ canvas, step }) => {
    const rows = await offered(canvas.getByRole('button', { name: /Workspace/ }))
    await step('two entries share a name', async () => {
      await expect(rows.filter((one) => one.startsWith('meridian-soc'))).toHaveLength(2)
    })
    await step('and are told apart by their region, with what each holds', async () => {
      await expect(rows).toContain('meridian-socwesteurope - rg-security \u00b7 42 incidents')
      await expect(rows).toContain('meridian-socnortheurope - rg-security-dr \u00b7 6 incidents')
    })
    await step('typing reaches the second one, so the region is in the text value', async () => {
      // Typeahead matches the item's `textValue`, not its rendered content. A
      // value of the name alone leaves both entries under one prefix, which is
      // a list of two identical rows to anybody not looking at the screen.
      await userEvent.keyboard('meridian-soc north')
      await waitFor(async () => {
        await expect(document.activeElement?.textContent).toContain(
          'northeurope - rg-security-dr',
        )
      })
    })
  },
}

/**
 * Typing into the name narrows the list without asking the provider anything.
 */
export const Narrowing: Story = {
  name: 'Narrowing by name',
  render: (args) => {
    const Held = () => {
      const [name, setName] = useState('')
      return <ProviderWorkspacePicker {...args} name={name} onName={setName} />
    }
    return <Held />
  },
  play: async ({ canvas, step }) => {
    await step('every workspace is offered to begin with', async () => {
      await expect(await offered(canvas.getByRole('button', { name: /Workspace/ }))).toHaveLength(3)
      await userEvent.keyboard('{Escape}')
    })
    await step('a name leaves only what carries it', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), 'northwind')
      const left = await offered(canvas.getByRole('button', { name: /Workspace/ }))
      await expect(left).toHaveLength(1)
      await expect(left[0]).toContain('northwind-ops')
    })
  },
}

/**
 * The subscription dial, whose choices are read off the workspaces themselves.
 */
export const BySubscription: Story = {
  name: 'Narrowing by subscription',
  render: (args) => {
    const Held = () => {
      const [subscription, setSubscription] = useState('Any')
      return (
        <ProviderWorkspacePicker
          {...args}
          subscription={subscription}
          onSubscription={setSubscription}
        />
      )
    }
    return <Held />
  },
  play: async ({ canvas, step }) => {
    await step('the choices are the subscriptions the workspaces bill to', async () => {
      const choices = await offered(canvas.getByRole('button', { name: /Subscription/ }))
      await expect(choices).toEqual([
        'Any',
        'Meridian Production',
        'Meridian Recovery',
        'Northwind',
      ])
    })
    await step('and choosing one leaves the workspaces that bill to it', async () => {
      await userEvent.click(screen.getByRole('option', { name: 'Meridian Recovery' }))
      const left = await offered(canvas.getByRole('button', { name: /Workspace/ }))
      await expect(left).toHaveLength(1)
      await expect(left[0]).toContain('northeurope - rg-security-dr')
    })
  },
}

/**
 * The tenant holds no workspace at all.
 */
export const NoWorkspace: Story = {
  name: 'No workspace in the tenant',
  args: { sources: [] },
  play: async ({ canvas, step }) => {
    await step('the empty state blames the account rather than the dials', async () => {
      await expect(
        canvas.getByText(
          'The account this install signed in as can see no workspace in that tenant.',
        ),
      ).toBeVisible()
    })
    await step('and the way back out is still offered', async () => {
      await expect(canvas.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    })
  },
}

/**
 * Workspaces exist; none of them answers what was typed.
 */
export const NoMatch: Story = {
  name: 'Nothing matches the name typed',
  args: { name: 'no such workspace' },
  play: async ({ canvas, step }) => {
    await step('the empty state blames the dials rather than the account', async () => {
      await expect(
        canvas.getByText('Nothing in that subscription matches the name typed above.'),
      ).toBeVisible()
    })
    await step('and what was typed is still on screen to be cleared', async () => {
      await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveValue('no such workspace')
    })
  },
}

/**
 * A tenant with far more workspaces than a list is comfortable with, and the
 * longest name and region among them.
 */
export const TooMany: Story = {
  name: 'Forty workspaces, one very long name',
  args: {
    sources: [
      {
        id: 'ws-long',
        name: 'meridian-managed-detection-and-response-production-primary',
        detail: 'switzerlandnorth - rg-meridian-managed-detection-response-prod',
        subscription: 'Meridian Production',
        incidents: 1_284,
      },
      ...SOURCES,
      ...Array.from({ length: 36 }, (_, at) => ({
        id: `ws-bulk-${String(at)}`,
        name: `tenant-${String(at + 1)}-soc`,
        detail: `westeurope - rg-tenant-${String(at + 1)}`,
        subscription: at % 2 === 0 ? 'Meridian Production' : 'Northwind',
        incidents: at * 3,
      })),
    ],
  },
  play: async ({ canvas, step }) => {
    const rows = await offered(canvas.getByRole('button', { name: /Workspace/ }))
    await step('the long name is offered whole to a reader', async () => {
      await expect(
        rows.some((one) =>
          one.startsWith('meridian-managed-detection-and-response-production-primary'),
        ),
      ).toBe(true)
    })
    await step('and a workspace with nothing to import says zero', async () => {
      await expect(rows).toContain('tenant-1-socwesteurope - rg-tenant-1 \u00b7 0 incidents')
    })
  },
}
