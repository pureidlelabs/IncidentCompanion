import type { Meta, StoryObj } from '@storybook/react-vite'

import { CaseReadouts } from '@/components/blocks/case-readouts'

/** The readouts as they sit on the header strip, which is the rail's ground. */
const meta = {
  title: 'Blocks/App shell/Case readouts',
  component: CaseReadouts,
  parameters: { layout: 'padded' },
  args: {
    title: 'Phishing with credential theft at Acme',
    openedAt: '2026-09-09T21:00:00Z',
    now: Date.parse('2026-09-10T08:00:00Z'),
  },
  decorators: [
    (Story) => (
      <div className="flex h-14 items-center bg-rail px-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CaseReadouts>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Detected days before it was opened, so the day count runs from detection. */
export const DetectedEarlier: Story = {
  args: { detectedAt: '2026-09-07T09:00:00Z' },
}
