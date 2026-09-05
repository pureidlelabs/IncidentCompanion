import type { Meta, StoryObj } from '@storybook/react-vite'
import { Link } from 'react-aria-components'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { AriaRouter } from './aria-router'

/**
 * The provider that makes a React Aria link route instead of reload.
 *
 * **It draws nothing.** There is no visual state to review -- what it does is
 * intercept a link press and hand the path to a navigate function. So the
 * stories show that interception happening, with a fake router standing in for
 * the app's.
 *
 * Without it, the `Link` below is a plain anchor: the browser leaves the page,
 * the app unmounts, and this app's live case socket reconnects.
 */
const meta = {
  title: 'Utilities/AriaRouter',
  component: AriaRouter,
  parameters: { layout: 'centered' },
  // Each story renders its own tree; the meta carries the required props so a
  // story does not restate a pair it never reads.
  args: { navigate: fn(), children: null },
} satisfies Meta<typeof AriaRouter>

export default meta
type Story = StoryObj<typeof meta>

/** A fake router: it records where it was asked to go, and goes nowhere. */
function Harness({ withBase = false }: { withBase?: boolean }) {
  const [went, setWent] = useState<string | null>(null)
  return (
    <AriaRouter
      navigate={(path) => {
        setWent(path)
      }}
      {...(withBase ? { useHref: (href: string) => `/app${href}` } : {})}
    >
      <div className="flex flex-col items-start gap-3 text-sm">
        <Link href="/cases/c1/timeline?step=impact" className="underline">
          the kill chain pivot
        </Link>
        <span data-testid="went" className="font-mono text-2xs text-ink-muted">
          {went ?? 'nothing navigated'}
        </span>
      </div>
    </AriaRouter>
  )
}

/**
 * A press reaches the router rather than the browser.
 *
 * Without this, every link in the application is a full page load: the case is
 * fetched again, the socket reconnects, and whatever the analyst had scrolled to
 * is gone.
 */
export const Routes: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('went')).toHaveTextContent('nothing navigated')
    await userEvent.click(canvas.getByRole('link'))
    await expect(canvas.getByTestId('went')).toHaveTextContent('/cases/c1/timeline?step=impact')
  },
}

/**
 * With a basename, the href the link renders carries it.
 *
 * `useHref` is what applies it. Without it React Aria hands the raw path over
 * and the base is dropped -- invisible while the base is `/`, which is how it
 * reaches somebody's reverse proxy.
 */
export const UnderABasename: Story = {
  render: () => <Harness withBase />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link')).toHaveAttribute(
      'href',
      '/app/cases/c1/timeline?step=impact',
    )
  },
}
