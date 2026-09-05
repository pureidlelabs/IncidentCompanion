import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { caseRoster } from '@/fixtures/caseChrome'
import {
  Attribution,
  ClaimBadge,
  PersonAvatar,
  PresenceStack,
  type Person,
} from './presence'

/**
 * The marks a case wears when more than one analyst is in it.
 */
const meta = {
  title: 'Blocks/App shell/Presence',
  component: PresenceStack,
  parameters: { layout: 'centered' },
  // The default, so a story drawing something other than the stack declares
  // no people it never reads.
  args: { people: [] },
} satisfies Meta<typeof PresenceStack>

export default meta
type Story = StoryObj<typeof meta>

// The case's own roster, then the crowd this stack has to survive. Spelled
// out here it was the same three names a second time, and `caseRoster`'s own
// docstring says what that costs: written three times they drift into three
// different cases.
const ROSTER: readonly Person[] = [
  ...caseRoster,
  { name: 'Priya Raghunathan' },
  { name: 'Tomas Lindqvist' },
  { name: 'Aiko Watanabe' },
]

/** A lone analyst. The stack still draws, so presence and a dead socket differ. */
export const Alone: Story = {
  args: { people: ROSTER.slice(0, 1) },
}

/** Three in the case, overlapped and each ringed in the page ground. */
export const Three: Story = {
  args: { people: ROSTER.slice(0, 3) },
}

/**
 * More people than `max`, so the rest become a count.
 */
export const Spilling: Story = {
  args: { people: ROSTER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByTestId('presence-person')).toHaveLength(4)
    await expect(canvas.getByText('+2')).toBeInTheDocument()
  },
}

/**
 * Nobody. The stack draws nothing rather than an empty rail.
 */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-testid="presence-person"]')).toBeNull()
    // Nothing at all, not a container holding nothing: an empty rail is what a
    // socket that stopped reporting also draws, and reading the text alone
    // cannot tell the two apart.
    await expect(canvasElement.querySelector('[data-testid="presence-stack"]')).toBeNull()
  },
}

/** A name long enough to test that the disc takes initials and never the name. */
export const LongName: Story = {
  args: { people: [{ name: 'Aleksandra Wojciechowska-Nowakowska' }] },
}

/** The roster, one person at a time. */
function Joining() {
  const [count, setCount] = useState(2)
  return (
    <div className="flex flex-col items-start gap-4">
      <PresenceStack people={ROSTER.slice(0, count)} />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onPress={() => {
            setCount((n) => Math.min(n + 1, ROSTER.length))
          }}
        >
          Someone joins
        </Button>
        <Button
          size="sm"
          variant="outline"
          onPress={() => {
            setCount((n) => Math.max(n - 1, 0))
          }}
        >
          Someone leaves
        </Button>
      </div>
    </div>
  )
}

/**
 * Arriving and leaving, which is the state a static capture cannot hold.
 */
export const ComesAndGoes: Story = {
  render: () => <Joining />,
  /**
   * A departure is held on screen while it leaves, and then gone.
   *
   * jsdom gives every element a zero box and runs no layout, so the slide the
   * neighbours make into the gap is not asserted anywhere - the capture is
   * what shows that.
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByTestId('presence-person')).toHaveLength(2)

    await userEvent.click(canvas.getByRole('button', { name: 'Someone joins' }))
    // **A generous timeout, because this waits on a machine and not on the
    // animation.** The arrival is `transition.base`, 180ms; the headroom is for
    // a browser competing with several test runs, which is where this failed
    // once at load 14 and passed at load 6.
    await waitFor(
      async () => {
        await expect(canvas.getAllByTestId('presence-person')).toHaveLength(3)
      },
      { timeout: 5_000 },
    )

    // **That a leaver is animated out rather than removed instantly is NOT
    // asserted here, and the attempt is worth recording.** Holding the node for
    // the 280ms the exit lasts and checking it inside that window races: with
    // `userEvent` the click's own delays can outlast the exit on a loaded
    // machine, and with `fireEvent` the assertion runs before React has
    // re-rendered at all -- measured, deleting `exit="gone"` left that version
    // green. The exit's *shape* is held by a unit test over the variant map,
    // where nothing is racing; what this story asserts is the end state.
    await userEvent.click(canvas.getByRole('button', { name: 'Someone leaves' }))
    await waitFor(
      async () => {
        await expect(canvas.getAllByTestId('presence-person')).toHaveLength(2)
      },
      { timeout: 5_000 },
    )
  },
}

/** `You . 2 min ago` - who last wrote this, once nobody is holding it. */
export const AttributionRow: Story = {
  name: 'Attribution',
  render: () => (
    <div className="flex flex-col gap-2">
      <Attribution person={{ name: 'Dev Analyst', you: true }} when="2 min ago" />
      <Attribution person={{ name: 'Joy Okonkwo' }} when="yesterday" />
      {/* No timestamp: the separator belongs to the time, so this reads as a
          name rather than as a date that failed to load. */}
      <Attribution person={{ name: 'Sam Whitfield' }} when="" />
    </div>
  ),
}

/**
 * `R. Okonkwo editing` - somebody else is in this row right now.
 */
export const Claim: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <ClaimBadge person={{ name: 'Joy Okonkwo' }} />
      <ClaimBadge person={{ name: 'Sam Whitfield' }} />
      <ClaimBadge person={{ name: 'Dev Analyst', you: true }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Two badges from three people: your own is never drawn, because a row
    // your other tab is holding is still your row.
    await expect(canvas.queryByText('Dev Analyst editing')).not.toBeInTheDocument()
    await expect(canvas.getByText('Joy Okonkwo editing')).toBeInTheDocument()
    await expect(canvas.getAllByText(/ editing$/)).toHaveLength(2)
  },
}

/** One disc on its own, at the sizes the app draws it. */
export const OnePerson: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <PersonAvatar person={{ name: 'Joy Okonkwo' }} className="size-6 text-2xs" />
      <PersonAvatar person={{ name: 'Sam Whitfield' }} />
      <PersonAvatar person={{ name: 'Dev Analyst', you: true }} size="lg" />
    </div>
  ),
}
