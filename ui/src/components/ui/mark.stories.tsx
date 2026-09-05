import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Mark } from './mark'

/**
 * The product's mark, drawn inline so it follows the ground switcher.
 *
 * An `<img>` is its own document and resolves none of the page's variables, so
 * a served mark ships two files and picks between them. This is one drawing
 * that re-colours when `data-theme` moves.
 *
 * At `tone="brand"` its two groups set `text-ink` and `text-primary` and read
 * `currentColor` from themselves, so it keeps its own ink on any surface rather
 * than taking the ground's. `tone="inherit"` is the panel variant: both groups
 * take `currentColor`, for a ground that has already chosen the ink.
 *
 * `aria-hidden`: whatever places it owns the naming. Geometry comes from
 * `server/assets/logo-light.svg`, which `mark.test.ts` holds it to.
 */
const meta = {
  title: 'Components/Mark',
  component: Mark,
  parameters: { layout: 'centered' },
  args: { className: 'size-12' },
  render: (args) => <Mark {...args} />,
} satisfies Meta<typeof Mark>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The masthead size, as the three auth screens draw it.
 *
 * **It is decoration and carries no accessible name.** `aria-hidden` is set and
 * `focusable="false"` keeps it out of the tab order in the browsers that still
 * put SVGs there. Whatever places it owns the naming - a masthead says the
 * product's name in text beside it rather than relying on this.
 */
export const Default: Story = {
  name: 'The mark',
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!
    await expect(svg).toHaveAttribute('aria-hidden', 'true')
    await expect(svg).toHaveAttribute('focusable', 'false')
  },
}

/**
 * The sizes it is actually asked for.
 *
 * It is a drawing rather than a glyph, so the question at each size is whether
 * the beat inside it still reads. The rail draws it at `size-6`.
 *
 * **This story is also where the per-instance ids are checked**, because it is
 * the one that puts several marks on a page. The gradient and its mask are
 * referenced by `url(#...)`, and a document-wide id would make every mark after
 * the first resolve to the first one's mask. Five identical marks look correct
 * whether or not that is true, so it has to be asserted rather than seen.
 */
export const Sizes: Story = {
  name: 'At the sizes it is drawn',
  render: ({ className: _className }) => (
    <div className="flex items-end gap-6">
      {['size-5', 'size-6', 'size-8', 'size-12', 'size-20'].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Mark className={size} />
          <span className="text-2xs text-ink-muted">{size}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const marks = [...canvasElement.querySelectorAll('svg')]
    await expect(marks).toHaveLength(5)

    await step('Every mark owns its gradient and its mask', async () => {
      const ids = marks.flatMap((svg) =>
        [...svg.querySelectorAll('[id]')].map((el) => el.id),
      )
      await expect(ids).toHaveLength(10)
      await expect(new Set(ids).size).toBe(10)
    })

    await step('And the ladder ascends', async () => {
      const widths = marks.map((svg) => svg.getBoundingClientRect().width)
      for (let index = 1; index < widths.length; index += 1) {
        await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
      }
    })
  },
}

/**
 * **The mark carries its own two colours and does not take them from its
 * ground.**
 *
 * `currentColor` here resolves against the mark's own `text-ink` and
 * `text-primary` groups, not against the surface it is placed on - so all three
 * of these are painted identically. What follows the ground switcher is the
 * *tokens*: `text-ink` is one colour in Light and another in Dark, which is the
 * whole reason the drawing is inlined rather than served as an `<img>`.
 *
 * **So do not place it on a coloured surface at `tone="brand"` expecting it to
 * adapt.** On `bg-primary` it stays dark ink on mid-blue rather than becoming
 * the ground's own foreground -- and `--sidebar-primary` is `--primary`, so on
 * the rail head's tile the beat group is painted in the colour behind it.
 * `tone="inherit"` is what a coloured panel takes.
 *
 * The `play` measures rather than trusting this note: the prose here and in
 * `mark.tsx` both used to claim the opposite, and three marks that look the
 * same is exactly what inheriting *and* not inheriting would each produce for a
 * reader glancing at the row.
 */
export const OnAColouredGround: Story = {
  name: 'Keeping its own ink on any ground',
  render: () => (
    <div className="flex items-center gap-4">
      <div data-testid="on-primary" className="rounded-lg bg-primary p-4 text-on-primary">
        <Mark className="size-10" />
      </div>
      <div data-testid="on-muted" className="rounded-lg bg-muted p-4 text-ink-muted">
        <Mark className="size-10" />
      </div>
      <div data-testid="on-surface" className="rounded-lg border border-border p-4">
        <Mark className="size-10" />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const inkOf = (id: string) => {
      const group = canvas.getByTestId(id).querySelector('svg > g')!
      return getComputedStyle(group).color
    }

    // One ink across three grounds. Were the mark inheriting, these would be
    // three different colours and the mark on `bg-primary` would be legible.
    const inks = [inkOf('on-primary'), inkOf('on-muted'), inkOf('on-surface')]
    await expect(new Set(inks).size).toBe(1)
  },
}
