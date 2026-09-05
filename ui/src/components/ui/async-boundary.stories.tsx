import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, fn, userEvent } from 'storybook/test'

import { ApiError } from '@/api/client'

import { AsyncBoundary } from './async-boundary'

/**
 * The three states every query has, and the fourth that is not a failure.
 */
const meta = {
  title: 'Utilities/AsyncBoundary',
  component: AsyncBoundary,
  parameters: { layout: 'padded' },
  args: {
    isPending: false,
    isError: false,
    children: (
      <ul className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
        <li>FIN-WS-04 &mdash; workstation</li>
        <li>FIN-DC-01 &mdash; domain controller</li>
        <li>MX-EDGE-02 &mdash; mail gateway</li>
      </ul>
    ),
  },
} satisfies Meta<typeof AsyncBoundary>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Loaded: the boundary is not there at all.
 */
export const Loaded: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/FIN-WS-04/)).toBeInTheDocument()
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}

/**
 * Pending: skeleton rows at the real list's row height, under a live region.
 */
export const Loading: Story = {
  args: { isPending: true },
  play: async ({ canvas, step }) => {
    const region = canvas.getByRole('status')

    await step('The wait announces itself', async () => {
      await expect(region).toHaveAttribute('aria-live', 'polite')
      await expect(region).toHaveAttribute('aria-busy', 'true')
    })

    await step('And what it holds is not the loaded content', async () => {
      await expect(canvas.queryByText(/FIN-WS-04/)).not.toBeInTheDocument()
    })
  },
}

/**
 * Three rows rather than five, for a section that is short when it loads.
 */
export const LoadingShort: Story = {
  args: { isPending: true, skeletonRows: 3 },
  play: async ({ canvas, canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-slot="skeleton"] > *')
    const region = canvas.getByRole('status')

    await expect(region).toBeInTheDocument()
    await expect(rows.length).toBeLessThanOrEqual(3)
  },
}

/**
 * Failed, with a retry that is worth pressing.
 */
export const Failed: Story = {
  args: {
    isError: true,
    error: new ApiError(500, 'The systems could not be loaded.', null),
    refetch: fn(),
  },
  play: async ({ args, canvas, step }) => {
    const panel = canvas.getByRole('alert')

    await step('It says something is wrong, and says what', async () => {
      await expect(panel).toHaveTextContent('The systems could not be loaded.')
    })

    await step('And the retry reaches the caller', async () => {
      await userEvent.click(canvas.getByRole('button'))
      await expect(args.refetch).toHaveBeenCalled()
    })
  },
}

/**
 * Refused. Muted rather than destructive, and no button: a 403 says *not you*,
 * and that does not change by pressing anything.
 */
export const Refused: Story = {
  args: {
    isError: true,
    error: new ApiError(403, 'Insufficient permissions.', null),
    refetch: fn(),
  },
  play: async ({ canvas, step }) => {
    const panel = canvas.getByRole('status')

    await step('Nothing to press, though a retry was given', async () => {
      await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
    })

    // The calm panel keeps its border and changes its colour, so the reading is
    // the ink rather than the border's presence. The destructive colour is
    // resolved through a throwaway element, which makes the comparison absolute
    // instead of against the other story nobody can see from here.
    await step('And it is drawn calm rather than broken', async () => {
      const probe = document.createElement('span')
      probe.className = 'text-destructive'
      panel.append(probe)
      const alarmed = getComputedStyle(probe).color
      probe.remove()

      await expect(getComputedStyle(panel).color).not.toBe(alarmed)
    })
  },
}

/**
 * Failed with nothing to retry with -- a caller that holds no refetch.
 */
export const FailedWithNoRetry: Story = {
  args: {
    isError: true,
    error: new ApiError(404, 'That case is no longer there.', null),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('That case is no longer there.')
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/**
 * Something that is not an `ApiError` at all: a dropped connection.
 */
export const NotAnApiError: Story = {
  args: {
    isError: true,
    error: new TypeError('Failed to fetch'),
    refetch: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toBeInTheDocument()
    await expect(canvas.getByRole('button')).toBeInTheDocument()
  },
}

/**
 * A 409, which is another analyst rather than a fault.
 */
export const WriteConflict: Story = {
  name: 'A 409, which is another analyst',
  args: {
    isError: true,
    error: new ApiError(409, 'Version 3 is behind; the row reached version 5.', null),
    refetch: fn(),
  },
  play: async ({ canvas }) => {
    // Verbatim: the numbers are the server's and a rephrasing here would be a
    // guess at them.
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Version 3 is behind; the row reached version 5.',
    )
  },
}
