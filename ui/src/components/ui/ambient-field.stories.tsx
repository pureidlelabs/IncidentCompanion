import type { Meta, StoryObj } from '@storybook/react-vite'

import { AmbientField } from './ambient-field'

/**
 * The unauthenticated screens' ground: entities and the relations between
 * them, drifting.
 *
 * Hand-rolled with the maintainer's approval -- neither shadcn nor Base UI ships an
 * ambient field, and the shape is this app's own: nodes are hosts, accounts
 * and indicators, and a link lights as it is traversed.
 *
 * **Nodes orbit a fixed home; they do not drift.** A node free to travel
 * stretches its links without bound, which degenerates into long crossing
 * lines and reads as the field getting busier when nothing was added. An orbit
 * cannot exceed its amplitude.
 *
 * **Radius comes from degree, not from a random.** Uniform dots read as
 * noise however many there are; a well-connected node reads as a hub, which
 * a starfield has none of.
 *
 * **Sized to its own box**, at roughly one node per 10,000 square pixels. The
 * three stories below are the three boxes it is actually given, so the density
 * can be judged at each rather than at one. Move the pointer over it: energy
 * carries about 190px.
 *
 * **Nothing here is asserted, on purpose.** The field has no behaviour: it is
 * looked at rather than used, and every claim above is about how it appears.
 * A story holding a node count or an orbit would be pinning an appearance,
 * which is what changes every time somebody tunes it -- and would fail on a
 * field that is working. The stories are a viewing surface; `visual-check` is
 * where a change to them is judged.
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
