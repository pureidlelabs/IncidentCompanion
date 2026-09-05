import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { Button } from './button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

/**
 * A bordered surface holding one subject, with a header, a footer and the
 * content between them.
 */
const meta = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The whole shape, with every slot filled.
 */
export const Default: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Mailbox read in bulk</CardTitle>
        <CardDescription>Graph API, 2 March, 04:12 UTC</CardDescription>
      </CardHeader>
      <CardContent>
        A single principal enumerated 1,204 messages across four mailboxes in
        under a minute.
      </CardContent>
      <CardFooter>
        <Button size="sm">Open entry</Button>
        <Button size="sm" variant="ghost">
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="card"]')!

    await step('The parts are in the order the markup gives them', async () => {
      const slots = [...card.querySelectorAll('[data-slot^="card-"]')]
        .map((part) => part.getAttribute('data-slot'))
        .filter((slot) => slot !== 'card-title' && slot !== 'card-description')
      await expect(slots).toEqual(['card-header', 'card-content', 'card-footer'])
    })

    await step('And the footer takes the card\u2019s own bottom space', async () => {
      await expect(getComputedStyle(card).paddingBottom).toBe('0px')
      const footer = card.querySelector('[data-slot="card-footer"]')!.getBoundingClientRect()
      await expect(footer.bottom).toBeCloseTo(card.getBoundingClientRect().bottom, 0)
    })

    await step('Both actions sit on one row', async () => {
      const [open, dismiss] = canvas.getAllByRole('button').map((b) => b.getBoundingClientRect())
      await expect(open!.top).toBeCloseTo(dismiss!.top, 0)
    })
  },
}

/**
 * Every variant.
 */
export const Variants: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card variant="default">
        <CardHeader>
          <CardTitle>Default</CardTitle>
        </CardHeader>
        <CardContent>The card ground.</CardContent>
      </Card>
      <Card variant="muted">
        <CardHeader>
          <CardTitle>Muted</CardTitle>
        </CardHeader>
        <CardContent>A quieter ground.</CardContent>
      </Card>
      <Card variant="ghost">
        <CardHeader>
          <CardTitle>Ghost</CardTitle>
        </CardHeader>
        <CardContent>No border, no fill.</CardContent>
      </Card>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const cards = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="card"]')]

    await step('Three grounds, and the ghost has none', async () => {
      const grounds = cards.map((card) => getComputedStyle(card).backgroundColor)
      await expect(new Set(grounds).size).toBe(3)
      await expect(grounds[2]).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    })

    await step('And the ghost drops its ring with it', async () => {
      const rings = cards.map((card) => getComputedStyle(card).boxShadow)
      await expect(rings[2]).not.toBe(rings[0])
    })
  },
}

/**
 * Elevation, from the token layer's three steps.
 */
export const Elevation: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card elevation="none">
        <CardHeader>
          <CardTitle>None</CardTitle>
        </CardHeader>
      </Card>
      <Card elevation="sm">
        <CardHeader>
          <CardTitle>Small</CardTitle>
        </CardHeader>
      </Card>
      <Card elevation="md">
        <CardHeader>
          <CardTitle>Medium</CardTitle>
        </CardHeader>
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const shadows = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="card"]')].map(
      (card) => getComputedStyle(card).boxShadow,
    )

    // Three rungs, all different: a ladder where two steps resolve alike is one
    // that cannot say which of two things is nearer.
    await expect(new Set(shadows).size).toBe(3)
  },
}

/**
 * Padding, including `none` for a card wrapping a table edge to edge.
 */
export const Padding: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card padding="none">
        <CardContent className="py-3">None</CardContent>
      </Card>
      <Card padding="sm">
        <CardContent>Small</CardContent>
      </Card>
      <Card padding="md">
        <CardContent>Medium</CardContent>
      </Card>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const cards = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="card"]')]
    // The resolved padding, not the property: `--card-spacing` reads back as
    // the unevaluated `calc()` Tailwind wrote, which parses to NaN and compares
    // false against everything.
    const spacing = (card: HTMLElement) =>
      Number.parseFloat(getComputedStyle(card).paddingTop)

    await step('The ladder ascends from nothing', async () => {
      await expect(spacing(cards[0]!)).toBe(0)
      await expect(spacing(cards[1]!)).toBeGreaterThan(0)
      await expect(spacing(cards[2]!)).toBeGreaterThan(spacing(cards[1]!))
    })

    await step('And the card with none takes its content to the edge', async () => {
      const card = cards[0]!.getBoundingClientRect()
      const content = cards[0]!
        .querySelector('[data-slot="card-content"]')!
        .getBoundingClientRect()
      await expect(content.left).toBeCloseTo(card.left, 0)
      await expect(content.right).toBeCloseTo(card.right, 0)
    })
  },
}

/**
 * A card with a header and nothing else yet.
 */
export const HeaderOnly: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>No findings</CardTitle>
        <CardDescription>Nothing has been recorded against this host.</CardDescription>
      </CardHeader>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-slot="card"]')!

    await expect(Number.parseFloat(getComputedStyle(card).paddingBottom)).toBeGreaterThan(0)
    await expect(card.querySelector('[data-slot="card-footer"]')).toBeNull()
  },
}
