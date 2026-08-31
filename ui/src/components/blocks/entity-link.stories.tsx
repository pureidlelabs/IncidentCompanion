import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { expect, within } from 'storybook/test'

import { keys } from '@/api/queryKeys'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EntityCardProvider } from '@/components/blocks/entity-card'
import { EntityLink } from '@/components/blocks/entity-link'
import type { LinkedEntity } from '@/components/ui/entity-ref'

/**
 * One linked entity: its name, its identity in the DOM, and the way to its
 * section.
 *
 * A link needs an `EntityCardProvider` for the case it belongs to and a router
 * to navigate with. Without the provider it renders an inert span, which is
 * the last story here.
 */

const CASE_ID = 'DEMO-CAMPAIGN'

const system = campaignCase.systems[0]!
const account = campaignCase.accounts[0]!

const systemEntity: LinkedEntity = {
  id: system.id,
  target: 'system',
  name: system.hostname,
}
const accountEntity: LinkedEntity = {
  id: account.id,
  target: 'account',
  name: account.accountName,
}
/** An id the case does not hold. Its name is empty, which is the missing state. */
const dangling: LinkedEntity = { id: 'deleted-row', target: 'system', name: '' }

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(keys.specs(), specsFixture)
  client.setQueryData(keys.collection(CASE_ID, 'systems'), campaignCase.systems)
  client.setQueryData(keys.collection(CASE_ID, 'accounts'), campaignCase.accounts)
  client.setQueryData(keys.collection(CASE_ID, 'timeline'), campaignCase.timeline)
  return client
}

function Grounded({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={seededClient()}>
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/timeline`]}>
        <EntityCardProvider caseId={CASE_ID}>{children}</EntityCardProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** No provider, so the same link has no case to resolve a path against. */
function Ungrounded({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={seededClient()}>
      <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

/** One entity's name, resolved and linked through to its section. */
const meta = {
  title: 'Blocks/List/Entity link',
  component: EntityLink,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EntityLink>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A resolved name, navigable to its section.
 *
 * At rest this is pixel-identical to `NoScope`: the link carries no border and
 * no persistent underline, so an `<a>` and a `<span>` holding the same text
 * paint the same until hover. `play` is what tells them apart - it asserts the
 * accessible role, which is where the two stories actually diverge.
 */
export const Resolved: Story = {
  name: 'A resolved reference',
  args: { entity: systemEntity },
  render: (args) => (
    <Grounded>
      <p className="text-sm">
        Beacon traffic from <EntityLink {...args} />
      </p>
    </Grounded>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: system.hostname })).toBeInTheDocument()
  },
}

/**
 * Two targets in one line, which is the shape a timeline row draws.
 *
 * Both links resolve against the same case and go to different sections, so the
 * sentence reads as prose while each name stays its own door. The second is the
 * story's own arg: the Controls panel drives what was signed in to.
 */
export const TwoTargets: Story = {
  name: 'Two targets in a line',
  args: { entity: systemEntity },
  render: (args) => (
    <Grounded>
      <p className="text-sm">
        <EntityLink entity={accountEntity} /> signed in to <EntityLink {...args} />
      </p>
    </Grounded>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Two anchors in one sentence, each to its own section: a row that linked
    // only the first would still read correctly and be half a door.
    await expect(canvas.getByRole('link', { name: account.accountName })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: system.hostname })).toBeInTheDocument()
  },
}

/** The referenced row is gone. The link still goes to the section. */
export const Dangling: Story = {
  name: 'A reference nothing resolves',
  args: { entity: dangling },
  render: (args) => (
    <Grounded>
      <p className="text-sm">
        Beacon traffic from <EntityLink {...args} />
      </p>
    </Grounded>
  ),
}

/** `navigable={false}` where the surrounding chrome already owns the click. */
export const NotNavigable: Story = {
  name: 'Inside chrome that owns the click',
  args: { entity: systemEntity, navigable: false },
  render: (args) => (
    <Grounded>
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm">
        <EntityLink {...args} />
      </button>
    </Grounded>
  ),
}

/**
 * With no provider above it the name is a span, not an anchor.
 *
 * Pixel-identical to `Resolved` at rest, for the reason recorded there.
 */
export const NoScope: Story = {
  name: 'Outside a case',
  args: { entity: systemEntity },
  render: (args) => (
    <Ungrounded>
      <p className="text-sm">
        Beacon traffic from <EntityLink {...args} />
      </p>
    </Ungrounded>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: system.hostname })).toBeNull()
    await expect(canvas.getByText(system.hostname)).toBeInTheDocument()
  },
}
