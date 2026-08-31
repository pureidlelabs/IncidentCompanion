import type { Meta, StoryObj } from '@storybook/react-vite'
import { Download, Filter, Plus, Trash2 } from 'lucide-react'

import { expect, userEvent } from 'storybook/test'

import { Button } from './button'
import { Separator } from './separator'
import { Toolbar } from './toolbar'

/**
 * A row of controls that behaves as one control to the keyboard.
 *
 * **The arrow keys walk the row, and every control is still its own tab stop.**
 * Measured: `tabindex` is 0 on all three, and a right arrow moves from the first
 * to the second. React Aria's `Toolbar` is described as a container with arrow
 * key navigation and nothing more, so the roving index the WAI-ARIA toolbar
 * pattern calls for is not part of it and is not added here.
 *
 * What that costs is real and worth knowing before wiring one into a screen: Tab
 * steps through every control on the way past, so a page with three action rows
 * is a page an analyst tabs through a dozen buttons to cross. What it buys is
 * that nothing is unreachable to somebody who only presses Tab.
 *
 * No screenshot shows either half. Both are an attribute and a key press, so
 * both are measured below rather than checked by hand.
 */
const meta = {
  title: 'Components/Toolbar',
  component: Toolbar,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A section's action row: one filled control, the rest outlined.
 *
 * One filled, because a row where everything is filled says every action is the
 * one to take.
 */
export const Default: Story = {
  render: () => (
    <Toolbar aria-label="Entity actions">
      <Button size="sm">
        <Plus />
        Add entity
      </Button>
      <Button size="sm" variant="outline">
        <Filter />
        Filter
      </Button>
      <Button size="sm" variant="outline">
        <Download />
        Export
      </Button>
    </Toolbar>
  ),
  play: async ({ canvas, step }) => {
    const buttons = canvas.getAllByRole('button')

    await step('Every control is its own tab stop', async () => {
      await expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(3)
    })

    await step('And the arrows walk the rest', async () => {
      buttons[0]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      await expect(buttons[1]).toHaveFocus()
      await userEvent.keyboard('{ArrowRight}')
      await expect(buttons[2]).toHaveFocus()
    })

    await step('And Tab steps to the next of them rather than out of the row', async () => {
      buttons[0]!.focus()
      await userEvent.tab()
      await expect(buttons[1]).toHaveFocus()
    })
  },
}

/**
 * The banded variant, for a row sitting above the content it acts on.
 *
 * It draws a ground and a rule, so the row reads as attached to what is under it
 * rather than floating over it.
 */
export const Banded: Story = {
  render: () => (
    <Toolbar aria-label="Entity actions" variant="banded">
      <Button size="sm">
        <Plus />
        Add entity
      </Button>
      <Separator orientation="vertical" spacing="sm" />
      <Button size="sm" variant="outline">
        <Download />
        Export
      </Button>
      <Button size="sm" variant="destructive" aria-label="Delete selected">
        <Trash2 />
      </Button>
    </Toolbar>
  ),
  play: async ({ canvas, step }) => {
    const row = canvas.getByRole('toolbar')

    await step('It carries a ground of its own', async () => {
      await expect(getComputedStyle(row).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    })

    await step('And the icon-only control is still named', async () => {
      await expect(canvas.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument()
    })
  },
}

/**
 * Vertical, which React Aria also reports back as a render prop.
 *
 * The walk turns with the row: down and up rather than right and left, so the
 * keys match what the analyst sees rather than what the markup was before.
 */
export const Vertical: Story = {
  render: () => (
    <Toolbar aria-label="Report actions" orientation="vertical" variant="banded">
      <Button size="sm" variant="outline">
        <Plus />
        Add section
      </Button>
      <Button size="sm" variant="outline">
        <Download />
        Export
      </Button>
    </Toolbar>
  ),
  play: async ({ canvas, step }) => {
    const buttons = canvas.getAllByRole('button')

    await step('The controls stack', async () => {
      await expect(buttons[1]!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        buttons[0]!.getBoundingClientRect().bottom - 1,
      )
    })

    await step('And the walk goes down with them', async () => {
      buttons[0]!.focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect(buttons[1]).toHaveFocus()
    })
  },
}

/**
 * The density ladder, so a row drifting from the rest is visible.
 *
 * It moves the space between controls and nothing else -- the controls keep
 * their own size, so a tight row is closer rather than smaller and stays at the
 * same target floor.
 */
export const Density: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Toolbar aria-label="Tight row" density="tight">
        <Button size="sm" variant="outline">
          First
        </Button>
        <Button size="sm" variant="outline">
          Second
        </Button>
      </Toolbar>
      <Toolbar aria-label="Default row">
        <Button size="sm" variant="outline">
          First
        </Button>
        <Button size="sm" variant="outline">
          Second
        </Button>
      </Toolbar>
      <Toolbar aria-label="Loose row" density="loose">
        <Button size="sm" variant="outline">
          First
        </Button>
        <Button size="sm" variant="outline">
          Second
        </Button>
      </Toolbar>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const rows = canvas.getAllByRole('toolbar')
    const gapOf = (row: HTMLElement) => {
      const [first, second] = [...row.querySelectorAll('button')]
      return second!.getBoundingClientRect().left - first!.getBoundingClientRect().right
    }

    await step('The space between opens up', async () => {
      await expect(gapOf(rows[1]!)).toBeGreaterThan(gapOf(rows[0]!))
      await expect(gapOf(rows[2]!)).toBeGreaterThan(gapOf(rows[1]!))
    })

    await step('And the controls do not change size with it', async () => {
      const heights = rows.map((row) => row.querySelector('button')!.getBoundingClientRect().height)
      await expect(new Set(heights).size).toBe(1)
    })
  },
}

/**
 * Disabled controls in a live row. A toolbar has no disabled state of its own --
 * each control carries `isDisabled`.
 *
 * **A row where every control is disabled has no tab stop at all**, measured:
 * `isDisabled` puts the native attribute on the button, so nothing in the row
 * can take focus and the toolbar disappears from the keyboard entirely. A row
 * that keeps one live control keeps its stop. Pinned, and the question of which
 * disabled controls should stay reachable is open.
 */
export const Disabled: Story = {
  render: () => (
    <Toolbar aria-label="Entity actions" variant="banded">
      <Button size="sm" isDisabled>
        <Plus />
        Add entity
      </Button>
      <Button size="sm" variant="outline" isDisabled>
        <Download />
        Export
      </Button>
    </Toolbar>
  ),
  play: async ({ canvas, step }) => {
    const buttons = canvas.getAllByRole('button')

    await step('Every control refuses, through the native attribute', async () => {
      for (const button of buttons) {
        await expect(button).toBeDisabled()
        await expect(button).not.toHaveAttribute('aria-disabled')
      }
    })

    await step('So the row cannot be reached at all', async () => {
      buttons[0]!.focus()
      await expect(buttons[0]).not.toHaveFocus()
    })
  },
}
