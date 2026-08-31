import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import { keys } from '@/api/queryKeys'
import { EntityCardProvider, EntityHoverCard } from '@/components/blocks/entity-card'
import { MISSING_REFERENCE, type LinkedEntity } from '@/components/ui/entity-ref'
import { Link } from '@/components/ui/link'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

const CASE_ID = 'DEMO-CAMPAIGN'

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(keys.specs(), specsFixture)
  client.setQueryData(keys.collection(CASE_ID, 'systems'), campaignCase.systems)
  client.setQueryData(keys.collection(CASE_ID, 'accounts'), campaignCase.accounts)
  client.setQueryData(keys.collection(CASE_ID, 'malware'), campaignCase.malware)
  client.setQueryData(keys.collection(CASE_ID, 'timeline'), campaignCase.timeline)
  return client
}

/** A client, a router and the scope, which is what the card assumes above it. */
function Grounded({ children, scoped = true }: { children: ReactNode; scoped?: boolean }) {
  return (
    <QueryClientProvider client={seededClient()}>
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/timeline`]}>
        {scoped ? <EntityCardProvider caseId={CASE_ID}>{children}</EntityCardProvider> : children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const system = campaignCase.systems[0]!
const account = campaignCase.accounts[0]!
const missing: LinkedEntity = { id: 'deleted-row', target: 'system', name: '' }

/**
 * The card an entity's name opens: what the row holds, how often the timeline
 * mentions it, and one way through to it.
 *
 * **It reads and never writes.** Every control on it is a link, so a card
 * opened by a passing pointer cannot change the case under the analyst.
 *
 * **The trigger is the caller's own element**, so the stories wrap a `Link`
 * rather than a bare `span`: a card no keyboard can open is a card half the
 * readers of a case never see.
 *
 * Its queries live in the body and cost nothing until a card opens, so a
 * timeline of four hundred names issues no requests until one is pointed at.
 *
 * Outside a case, or for a target the app does not know, the children render
 * alone and nothing opens.
 */
const meta = {
  title: 'Blocks/Card/Entity hover card',
  component: EntityHoverCard,
  parameters: { layout: 'padded' },
  args: {
    entity: { id: system.id, target: 'system', name: system.hostname },
    children: <span />,
  },
  // Every story renders the trigger through `args.entity`, so the Controls
  // panel changes what the card is about rather than nothing.
  render: (args) => (
    <Grounded>
      <p className="text-sm">
        Beacon traffic from{' '}
        <EntityHoverCard entity={args.entity} open>
          <Link href="#" data-slot="entity-link">
            {args.entity.name || MISSING_REFERENCE}
          </Link>
        </EntityHoverCard>
      </p>
    </Grounded>
  ),
} satisfies Meta<typeof EntityHoverCard>

export default meta
type Story = StoryObj<typeof meta>

/** Its own docs frame, `height` tall, so an open card is not drawn over the story below it. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** The panel, which floats out of the story's own canvas. */
function panel(name: string) {
  // React Aria opens a hover card on a delay, so the default wait is short of
  // it by design -- a card that opened at once would flash past a pointer
  // crossing the name on its way somewhere else.
  return screen.findByRole('dialog', { name }, { timeout: 3000 })
}

/**
 * Over a system's hostname: the fields the spec marks for the card, and how
 * many timeline entries name it.
 */
export const OverASystem: Story = {
  name: "Over a system's hostname",
  parameters: frame('230px'),
  play: async ({ args }) => {
    const card = within(await panel(args.entity.name))
    // `system` is titled `Assets`, which is what the section is called.
    await expect(card.getByText(/^Assets/)).toBeVisible()
    // A link out, never a control that writes. React Aria puts its own hidden
    // `Dismiss` button inside every overlay, so the claim is about the ones
    // this block draws rather than about every button in the panel.
    await expect(card.getByRole('link', { name: /open in assets/i })).toBeVisible()
    const ours = card
      .queryAllByRole('button')
      .filter((el) => el.getAttribute('aria-label') !== 'Dismiss')
    await expect(ours).toHaveLength(0)
  },
}

/**
 * Over an account name, which reads a different collection through the same
 * card: the target decides which rows are searched and what the heading says.
 */
export const OverAnAccount: Story = {
  name: 'Over an account name',
  parameters: frame('250px'),
  args: { entity: { id: account.id, target: 'account', name: account.accountName } },
  play: async ({ args }) => {
    const card = within(await panel(args.entity.name))
    await expect(card.getByRole('link', { name: /open in accounts/i })).toBeVisible()
  },
}

/**
 * A link whose row was deleted.
 *
 * The name is gone, so the id takes its place: that is what an analyst
 * searches an export or an archive for, and the only thing left that
 * identifies what the timeline was pointing at. No way through is offered,
 * because there is nothing to open.
 */
export const ADanglingReference: Story = {
  name: 'A reference nothing resolves',
  parameters: frame('170px'),
  args: { entity: missing },
  play: async ({ args }) => {
    const card = within(await panel(MISSING_REFERENCE))
    await expect(card.getByText(args.entity.id)).toBeVisible()
    await expect(card.queryByRole('link', { name: /open in/i })).not.toBeInTheDocument()
  },
}

/**
 * Shut, and opened by the pointer rather than on mount.
 *
 * The card costs nothing until something points at it, so a timeline of names
 * is a page of links and no requests.
 */
export const Shut: Story = {
  name: 'Shut, opened by the pointer',
  render: (args) => (
    <Grounded>
      <p className="text-sm">
        Beacon traffic from{' '}
        <EntityHoverCard entity={args.entity}>
          <Link href="#" data-slot="entity-link">
            {args.entity.name}
          </Link>
        </EntityHoverCard>
      </p>
    </Grounded>
  ),
  play: async ({ canvas, args, userEvent: press }) => {
    await expect(screen.queryByRole('dialog')).toBeNull()

    // Reached by the keyboard, which is the route the trigger has to be
    // focusable for: a pointer hover is the same door and the one this tier
    // cannot drive reliably.
    await press.tab()
    await expect(canvas.getByRole('link', { name: args.entity.name })).toHaveFocus()

    // Waited for rather than read at once: the card animates in, so it is in
    // the document a frame before it is painted.
    const card = await panel(args.entity.name)
    await waitFor(() => {
      void expect(card).toBeVisible()
    })
  },
}

/**
 * No provider above it: the name renders alone and nothing opens.
 *
 * At rest this is pixel-identical to `Shut` - both draw the same closed link,
 * because a card that never opens and a card that has not opened yet look the
 * same until something tries to open one. `play` is what tells them apart: it
 * hovers the name, waits past the open delay, and confirms no card appears.
 */
export const NoScope: Story = {
  name: 'Outside a case',
  render: (args) => (
    <Grounded scoped={false}>
      <p className="text-sm">
        Beacon traffic from{' '}
        <EntityHoverCard entity={args.entity}>
          <Link href="#" data-slot="entity-link">
            {args.entity.name}
          </Link>
        </EntityHoverCard>
      </p>
    </Grounded>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('link', { name: args.entity.name }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    await waitFor(async () => {
      await expect(screen.queryByRole('dialog')).toBeNull()
    })
  },
}

/**
 * A name longer than the card is wide.
 *
 * The name wraps inside the card rather than widening it, and the field values
 * under it are clamped to two lines: a card that grew with its content would
 * cover the sentence it was opened from.
 */
export const TheLongestText: Story = {
  name: 'A name longer than the card',
  parameters: frame('320px'),
  args: {
    entity: {
      id: system.id,
      target: 'system',
      name: 'srv-prod-euw1-appserver-0142.internal.meridian-logistics.example.corp',
    },
  },
  play: async ({ args }) => {
    const card = await panel(args.entity.name)
    const name = within(card).getByText(args.entity.name)

    // Wrapped, not overflowing. The panel carries its own maximum width, so
    // reading the card's width tests that rather than the name: what says the
    // name broke is that it stays inside the card it is drawn in.
    await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
      card.getBoundingClientRect().right + 1,
    )
    // And it took more than one line to do it.
    const line = Number.parseFloat(getComputedStyle(name).lineHeight)
    await expect(name.getBoundingClientRect().height).toBeGreaterThan(line * 1.5)
  },
}

/**
 * A timeline that names one entity many times over.
 *
 * The count is a number rather than a list however high it goes, so the card
 * stays the same size whether the entity is mentioned twice or four hundred
 * times.
 */
export const TooMuchData: Story = {
  name: 'An entity the timeline names throughout',
  parameters: frame('230px'),
  render: (args) => {
    const client = seededClient()
    // The same row repeated, so every entry references this one entity.
    const first = campaignCase.timeline[0]!
    client.setQueryData(
      keys.collection(CASE_ID, 'timeline'),
      Array.from({ length: 400 }, (_, i) => ({ ...first, id: `t-${String(i)}` })),
    )
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/cases/${CASE_ID}/timeline`]}>
          <EntityCardProvider caseId={CASE_ID}>
            <p className="text-sm">
              Beacon traffic from{' '}
              <EntityHoverCard entity={args.entity} open>
                <Link href="#" data-slot="entity-link">
                  {args.entity.name}
                </Link>
              </EntityHoverCard>
            </p>
          </EntityCardProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  },
  play: async ({ args }) => {
    const card = await panel(args.entity.name)
    // A count, not a list: the card is no taller for four hundred mentions.
    await expect(card.getBoundingClientRect().height).toBeLessThan(400)
    await expect(within(card).getByText(/timeline entr/)).toBeVisible()
  },
}
