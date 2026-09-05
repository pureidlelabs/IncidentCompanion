import type { Meta, StoryObj } from '@storybook/react-vite'
import { Link } from 'react-aria-components'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { AriaRouter } from './aria-router'

/**
 * The provider that makes a React Aria link route instead of reload.
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
