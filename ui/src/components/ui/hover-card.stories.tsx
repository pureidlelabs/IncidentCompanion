import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShieldAlert } from 'lucide-react'
import { expect, within } from 'storybook/test'

import { Badge } from './badge'
import { Button } from './button'
import { HoverCard, HoverCardPanel } from './hover-card'
import { Link } from './link'

/**
 * A preview that opens on hover, focus or long press, and unlike a tooltip may
 * hold interactive content.
 *
 * **That is the whole choice between the two.** A tooltip closes the moment
 * focus leaves its trigger, so anything inside it is unreachable; this stays
 * while the pointer or focus is in the panel, so a link or a button in the
 * preview can actually be used.
 *
 * The cost is that it is not a hint. A hover card is a preview an analyst may
 * choose to go into, and putting one on every chip turns a page into a
 * minefield of panels.
 */
const meta = {
  title: 'Components/HoverCard',
  component: HoverCard,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof HoverCard>

export default meta
type Story = StoryObj<typeof meta>

/** Its own docs frame, `height` tall, so an open panel is not drawn over the story below it. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** Open, with a record preview. The panel may hold interactive content. */
export const Open: Story = {
  parameters: frame('420px'),
  render: () => (
    <p className="max-w-md text-sm">
      {'The mailbox rule was created by '}
      <HoverCard defaultOpen>
        <Link href="#">j.okonkwo@example.org</Link>
        <HoverCardPanel size="lg">
          <div className="flex items-start gap-3">
            <span className="flex size-(--control-h-md) shrink-0 items-center justify-center rounded-full bg-muted text-ink-muted">
              <ShieldAlert aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Joy Okonkwo</p>
              <p className="text-ink-muted">Finance, London</p>
            </div>
            <Badge variant="outlined" className="ms-auto">
              Compromised
            </Badge>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-muted">
            <dt>First seen</dt>
            <dd className="text-ink">2026-08-18 09:14 UTC</dd>
            <dt>Sign-ins</dt>
            <dd className="text-ink">4 from 2 countries</dd>
            <dt>Entities</dt>
            <dd className="text-ink">Linked to 3 timeline entries</dd>
          </dl>
          <Button size="sm" variant="outline" className="mt-3">
            Open the record
          </Button>
        </HoverCardPanel>
      </HoverCard>
      {' on the morning of the breach.'}
    </p>
  ),
  /**
   * **The panel survives focus moving into it**, which is the difference from a
   * tooltip and the reason a button inside one is usable at all.
   *
   * A tooltip closes as soon as focus leaves its trigger, so the same markup
   * there would put a button on screen that nobody can reach.
   */
  play: async ({ canvasElement }) => {
    const inside = within(canvasElement.ownerDocument.body).getByRole('button', {
      name: 'Open the record',
    })

    inside.focus()
    await expect(inside).toHaveFocus()
    await expect(inside).toBeInTheDocument()
  },
}

/**
 * The panel with far more in it than fits, which is the state that decides
 * whether a preview is still a preview.
 *
 * It scrolls rather than growing past the viewport. A hover card long enough to
 * need scrolling is usually a sign the analyst wanted the record itself.
 */
export const Overflowing: Story = {
  parameters: frame('460px'),
  play: async ({ canvasElement }) => {
    // A preview that grew with its content would run past the viewport and
    // take its own last line off screen, with no way to reach it -- the panel
    // closes the moment the pointer leaves on the way to a scrollbar that is
    // not there. It scrolls inside itself instead.
    const panel = canvasElement.ownerDocument.querySelector('[data-slot="hover-card-panel"]')
    if (panel === null) throw new Error('the hover card never opened')
    await expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
    await expect(panel.getBoundingClientRect().height).toBeLessThan(
      canvasElement.ownerDocument.documentElement.clientHeight,
    )
  },
  render: () => (
    <p className="max-w-md text-sm">
      {'Traffic reached '}
      <HoverCard defaultOpen>
        <Link href="#">198.51.100.24</Link>
        <HoverCardPanel size="lg">
          <p className="font-medium">198.51.100.24</p>
          {/* Enough to overflow the height a popover is given, which twenty
              lines did not: the story's whole subject is the state past that. */}
          {Array.from({ length: 60 }, (_, index) => (
            <p key={index} className="text-ink-muted">
              Seen in case E2E-{String(index).padStart(4, '0')}.
            </p>
          ))}
        </HoverCardPanel>
      </HoverCard>
      {' twice.'}
    </p>
  ),
}

/** Shut. Hover, focus or long-press the chip to open it. */
export const OnHover: Story = {
  play: async ({ canvas, canvasElement }) => {
    // Shut at rest, and the trigger is a link rather than a control invented
    // for the preview: the address is the thing on the page, and the card is
    // what opening it offers.
    await expect(canvas.getByRole('link', { name: '198.51.100.24' })).toBeVisible()
    await expect(
      canvasElement.ownerDocument.querySelector('[data-slot="hover-card-panel"]'),
    ).toBeNull()
  },
  render: () => (
    <p className="max-w-md text-sm">
      {'Traffic reached '}
      <HoverCard>
        <Link href="#">198.51.100.24</Link>
        <HoverCardPanel>
          <p className="font-medium">198.51.100.24</p>
          <p className="text-ink-muted">
            Hosting provider, Frankfurt. Seen in 2 other cases.
          </p>
        </HoverCardPanel>
      </HoverCard>
      {' twice.'}
    </p>
  ),
}

/** The three panel widths, each open. */
export const Sizes: Story = {
  parameters: frame('460px'),
  render: () => (
    // The rows are spaced by a panel's height, not by a reading gap: three
    // panels open at once are anchored to their own links and would otherwise
    // land on each other.
    <div className="flex flex-col gap-24 text-sm">
      {(['sm', 'default', 'lg'] as const).map((size) => (
        <HoverCard key={size} defaultOpen>
          <Link href="#" standalone>{`Preview at ${size}`}</Link>
          <HoverCardPanel size={size}>
            <p className="font-medium">E2E-0001</p>
            <p className="text-ink-muted">Opened 2026-08-20 by Dev Analyst.</p>
          </HoverCardPanel>
        </HoverCard>
      ))}
    </div>
  ),
  /**
   * Each trigger clears the 24px target floor.
   *
   * These three stand on their own in a column rather than inside a sentence,
   * unlike `Open` and `OnHover`, which WCAG 2.5.8 exempts. jsdom gives every
   * element a zero box, so only this tier can read the height back.
   */
  play: async ({ canvasElement }) => {
    const links = [...canvasElement.querySelectorAll('a[data-slot="link"]')]
    await expect(links).toHaveLength(3)
    for (const el of links) {
      await expect(
        el.getBoundingClientRect().height,
        `"${el.textContent}" is below the 24px target floor`,
      ).toBeGreaterThanOrEqual(24)
    }
  },
}
