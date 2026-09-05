import type { Meta, StoryObj } from '@storybook/react-vite'

import { AmbientField } from './ambient-field'

/**
 * The unauthenticated screens' ground: entities and the relations between
 * them, drifting.
 */
const meta = {
  title: 'Styling/Ambient field',
  component: AmbientField,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AmbientField>

export default meta
type Story = StoryObj<typeof meta>

/** The sign-in panel, near the 720x900 the split gives it: about 65 nodes. */
export const AuthPanel: Story = {
  render: () => (
    <div className="relative h-[600px] w-[480px] overflow-hidden rounded-lg border bg-background">
      <AmbientField />
    </div>
  ),
}

/** Under the form it sits behind, which is the only judgement that matters. */
export const BehindTheForm: Story = {
  render: () => (
    <div className="relative h-[600px] w-[480px] overflow-hidden rounded-lg border bg-background">
      <AmbientField />
      <div className="relative flex h-full items-center justify-center">
        <div className="w-72 rounded-lg border bg-card/90 p-6 backdrop-blur-sm">
          <p className="mb-1 text-sm font-medium">Sign in</p>
          <p className="text-xs text-ink-muted">
            The field animates no pixel the form covers, because it fills its own box
            rather than the viewport.
          </p>
        </div>
      </div>
    </div>
  ),
}

/** A small box: the node count follows the area, so it does not crowd. */
export const Small: Story = {
  render: () => (
    <div className="relative h-40 w-64 overflow-hidden rounded-lg border bg-background">
      <AmbientField />
    </div>
  ),
}

/** A wide one, where the twelve-node floor stops a short box emptying out. */
export const Wide: Story = {
  render: () => (
    <div className="relative h-32 w-full overflow-hidden rounded-lg border bg-background">
      <AmbientField />
    </div>
  ),
}
