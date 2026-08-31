import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Tree, TreeItem } from './tree'

/**
 * A list whose rows nest, with expansion and selection each keyed by item `id`.
 *
 * **Expanding and selecting are separate acts on separate targets.** The chevron
 * opens the branch; the rest of the row selects it. An analyst opening a branch
 * to look inside has not chosen it, and a tree that conflates the two makes
 * every exploratory click a decision.
 *
 * The kit's own layer is the row's furniture: the indent it draws from its own
 * depth, the chevron where it has children and a spacer of the same width where
 * it has none, and the checkbox under `selectionBehavior="toggle"`.
 *
 * **It renders as a `treegrid` and its rows as `row`**, not as `tree` and
 * `treeitem` -- which is what lets a row hold a control the keyboard can reach,
 * and is what to query for when wiring one up.
 */
const meta = {
  title: 'Components/Tree',
  component: Tree,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tree<object>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * `defaultExpandedKeys` names the branches that open first.
 *
 * **Every level steps in by one, and every title on a level starts at the same
 * place** whether its row has a chevron or not -- a leaf draws a spacer the
 * chevron's width, so a branch and a leaf that are siblings read as siblings.
 * A tree that indents only the rows with children is one where depth cannot be
 * read down the left edge.
 */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    const titleEdge = (name: string) =>
      canvas.getByRole('row', { name }).querySelector('span.flex-1')!
        .getBoundingClientRect().left

    await step('Each level steps in', async () => {
      const top = titleEdge('Endpoint')
      const second = titleEdge('EDR alerts')
      await expect(second).toBeGreaterThan(top)
    })

    await step('And a leaf lines up with the branch beside it', async () => {
      await expect(titleEdge('EDR alerts')).toBe(titleEdge('Process tree'))
    })
  },
  render: () => (
    <Tree aria-label="Evidence" defaultExpandedKeys={['endpoint']} className="w-72">
      <TreeItem id="endpoint" title="Endpoint">
        <TreeItem id="edr" title="EDR alerts" />
        <TreeItem id="proc" title="Process tree">
          <TreeItem id="proc-ps" title="powershell.exe" />
          <TreeItem id="proc-rundll" title="rundll32.exe" />
        </TreeItem>
      </TreeItem>
      <TreeItem id="identity" title="Identity">
        <TreeItem id="signin" title="Sign-in logs" />
      </TreeItem>
    </Tree>
  ),
}

/**
 * One row at a time.
 *
 * The `play` presses the chevron of a branch that is not selected and watches
 * the selection stay where it was: opening a branch to look inside is not
 * choosing it.
 *
 * **No checkboxes.** A box is a control for adding a row to a set and `single`
 * has no set to add to, so the row guards on the mode rather than on
 * `selectionBehavior` -- which defaults to `toggle` and would otherwise draw
 * four boxes of which one could ever be ticked. `GridListItem` guards the same
 * way.
 */
export const SingleSelection: Story = {
  play: async ({ canvas, step }) => {
    const identity = canvas.getByRole('row', { name: 'Identity' })

    await step('Nothing offers to add a row to a set', async () => {
      await expect(canvas.queryAllByRole('checkbox')).toHaveLength(0)
    })

    await step('The branch is shut, and something else is selected', async () => {
      await expect(identity).toHaveAttribute('aria-expanded', 'false')
      await expect(canvas.getByRole('row', { name: 'EDR alerts' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    await step('Pressing its chevron opens it and selects nothing', async () => {
      await userEvent.click(identity.querySelector('button')!)
      await waitFor(() => {
        void expect(identity).toHaveAttribute('aria-expanded', 'true')
      })
      await expect(identity).toHaveAttribute('aria-selected', 'false')
      await expect(canvas.getByRole('row', { name: 'EDR alerts' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
  },
  render: () => (
    <Tree
      aria-label="Evidence"
      selectionMode="single"
      defaultExpandedKeys={['endpoint']}
      defaultSelectedKeys={['edr']}
      className="w-72"
    >
      <TreeItem id="endpoint" title="Endpoint">
        <TreeItem id="edr" title="EDR alerts" />
        <TreeItem id="proc" title="Process tree" />
      </TreeItem>
      <TreeItem id="identity" title="Identity">
        <TreeItem id="signin" title="Sign-in logs" />
      </TreeItem>
    </Tree>
  ),
}

/**
 * `selectionBehavior="toggle"` puts a checkbox on every row, branches included.
 *
 * **A branch's checkbox is its own and carries nothing down.** Ticking a branch
 * does not tick what is under it, and a branch whose children are all ticked
 * does not tick itself -- there is no tri-state here, so a caller wanting the
 * subtree computes it from the keys.
 */
export const MultipleSelection: Story = {
  play: async ({ canvas, step }) => {
    const branch = canvas.getByRole('row', { name: 'Endpoint' })

    await step('Every row carries one, branch or leaf', async () => {
      await expect(canvas.getAllByRole('checkbox')).toHaveLength(5)
    })

    // Read the rows rather than the boxes: a checkbox that is wired to nothing
    // still ticks itself, so a box-only assertion passes for a tree whose
    // selection never moved.
    await step('And ticking the branch selects it, and only it', async () => {
      const selection = () =>
        canvas.getAllByRole('row').map((row) => row.getAttribute('aria-selected'))
      const before = selection()

      await userEvent.click(branch.querySelector('input[type="checkbox"]')!)

      const after = selection()
      await expect(after[0]).not.toBe(before[0])
      await expect(after.slice(1)).toEqual(before.slice(1))
    })
  },
  render: () => (
    <Tree
      aria-label="Evidence"
      selectionMode="multiple"
      selectionBehavior="toggle"
      defaultExpandedKeys={['endpoint', 'identity']}
      defaultSelectedKeys={['edr', 'signin']}
      className="w-72"
    >
      <TreeItem id="endpoint" title="Endpoint">
        <TreeItem id="edr" title="EDR alerts" />
        <TreeItem id="proc" title="Process tree" />
      </TreeItem>
      <TreeItem id="identity" title="Identity">
        <TreeItem id="signin" title="Sign-in logs" />
      </TreeItem>
    </Tree>
  ),
}

/**
 * `disabledKeys` on the tree.
 *
 * A disabled row is dimmed and refuses selection. **Whether its branch still
 * opens is what the `play` measures**, rather than what the prop name suggests:
 * the row takes no pointer at all, so its chevron cannot be pressed either.
 */
export const DisabledItems: Story = {
  play: async ({ canvas, step }) => {
    const refused = canvas.getByRole('row', { name: 'Process tree' })

    await step('It says it is disabled, and it is dimmed', async () => {
      await expect(refused).toHaveAttribute('aria-disabled', 'true')
      await expect(Number.parseFloat(getComputedStyle(refused).opacity)).toBeLessThan(1)
    })

    await step('And it takes no pointer, so nothing on the row can be pressed', async () => {
      await expect(getComputedStyle(refused).pointerEvents).toBe('none')
    })
  },
  render: () => (
    <Tree
      aria-label="Evidence"
      selectionMode="multiple"
      selectionBehavior="toggle"
      disabledKeys={['proc']}
      defaultExpandedKeys={['endpoint']}
      className="w-72"
    >
      <TreeItem id="endpoint" title="Endpoint">
        <TreeItem id="edr" title="EDR alerts" />
        <TreeItem id="proc" title="Process tree" />
      </TreeItem>
    </Tree>
  ),
}

/**
 * The chevron turns rather than swapping glyph, so the open and shut states are
 * one shape at two angles and a branch caught mid-turn still reads.
 *
 * It is `motion-reduce:transition-none`, so the turn is instant where the
 * viewer asked for that and the angle still says which way the branch stands.
 *
 * **The angle is on the `rotate` property, not on `transform`.** Tailwind v4
 * moved to the standalone properties, so an assertion reading `transform` gets
 * `none` from a chevron standing at ninety degrees -- and passes just as well
 * for one that never turns.
 */
export const ChevronTurns: Story = {
  render: () => (
    <Tree aria-label="Evidence" defaultExpandedKeys={['endpoint']} className="w-72">
      <TreeItem id="endpoint" title="Endpoint">
        <TreeItem id="edr" title="EDR alerts" />
      </TreeItem>
      <TreeItem id="identity" title="Identity">
        <TreeItem id="signin" title="Sign-in logs" />
      </TreeItem>
    </Tree>
  ),
  play: async ({ canvas, step }) => {
    const chevronOf = (name: string) =>
      getComputedStyle(canvas.getByRole('row', { name }).querySelector('button svg')!)

    await step('The open branch turns and the shut one does not', async () => {
      await expect(chevronOf('Endpoint').rotate).toBe('90deg')
      await expect(chevronOf('Identity').rotate).toBe('none')
    })

    await step('And the turn is animated rather than snapped', async () => {
      await expect(chevronOf('Endpoint').transitionProperty).toContain('rotate')
    })
  },
}
