import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { Key, Selection } from 'react-aria-components'

import { expect, userEvent } from 'storybook/test'

import { Tag, TagGroup } from './tag-group'

/**
 * A list of tags, navigable with the arrow keys and removable with `onRemove`.
 */
const meta = {
  title: 'Components/TagGroup',
  component: TagGroup,
  parameters: { layout: 'centered' },
  args: { label: 'Tactics' },
} satisfies Meta<typeof TagGroup>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A labelled set. The arrow keys move between tags.
 */
export const Default: Story = {
  render: () => (
    <TagGroup label="Tactics">
      <Tag id="initial-access">Initial access</Tag>
      <Tag id="persistence">Persistence</Tag>
      <Tag id="exfiltration">Exfiltration</Tag>
    </TagGroup>
  ),
  play: async ({ canvas, step }) => {
    const tags = canvas.getAllByRole('row')

    await step('Three tags, and none of them a button', async () => {
      await expect(tags).toHaveLength(3)
      await expect(canvas.queryAllByRole('button')).toHaveLength(0)
    })

    await step('And the arrows move between them', async () => {
      tags[0]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      await expect(tags[1]).toHaveFocus()
    })
  },
}

/**
 * One line under the tags, announced with the group.
 */
export const WithDescription: Story = {
  render: () => (
    <TagGroup label="Tactics" description="Drawn from the case timeline.">
      <Tag id="initial-access">Initial access</Tag>
      <Tag id="persistence">Persistence</Tag>
    </TagGroup>
  ),
  play: async ({ canvas, canvasElement }) => {
    const group = canvas.getByRole('grid')
    const described = (group.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => canvasElement.ownerDocument.getElementById(id)?.textContent ?? '')

    await expect(described.join(' ')).toContain('Drawn from the case timeline.')
  },
}

/**
 * Every variant.
 */
export const Variants: Story = {
  render: () => (
    <TagGroup label="Findings">
      <Tag id="a" variant="default">
        Default
      </Tag>
      <Tag id="b" variant="muted">
        Muted
      </Tag>
      <Tag id="c" variant="destructive">
        Destructive
      </Tag>
    </TagGroup>
  ),
  play: async ({ canvas }) => {
    const grounds = canvas
      .getAllByRole('row')
      .map((tag) => getComputedStyle(tag).backgroundColor)

    await expect(new Set(grounds).size).toBe(3)
  },
}

/** `onRemove` grows a button on each tag, and binds Backspace to it. */
export const Removable: Story = {
  args: { label: 'Tactics' },
  render: function Removable() {
    const [keys, setKeys] = useState<Key[]>(['initial-access', 'persistence', 'exfiltration'])
    const labels: Record<string, string> = {
      'initial-access': 'Initial access',
      persistence: 'Persistence',
      exfiltration: 'Exfiltration',
    }
    return (
      <TagGroup
        label="Tactics"
        onRemove={(removed) => {
          setKeys((current) => current.filter((key) => !removed.has(key)))
        }}
      >
        {keys.map((key) => (
          <Tag key={String(key)} id={key}>
            {labels[String(key)] ?? String(key)}
          </Tag>
        ))}
      </TagGroup>
    )
  },
}

/** `selectionMode` makes the set a filter rather than a display. */
export const Selectable: Story = {
  args: { label: 'Tactics' },
  render: function Selectable() {
    const [selected, setSelected] = useState<Selection>(new Set(['persistence']))
    return (
      <TagGroup
        label="Filter by tactic"
        selectionMode="multiple"
        selectedKeys={selected}
        onSelectionChange={setSelected}
      >
        <Tag id="initial-access">Initial access</Tag>
        <Tag id="persistence">Persistence</Tag>
        <Tag id="exfiltration">Exfiltration</Tag>
      </TagGroup>
    )
  },
}

/**
 * `isDisabled` is per tag. React Aria puts none on the group, so a whole set is
 * disabled by disabling its tags.
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <TagGroup label="Whole group">
        <Tag id="a" isDisabled>
          Initial access
        </Tag>
        <Tag id="b" isDisabled>
          Persistence
        </Tag>
      </TagGroup>
      <TagGroup label="One tag" selectionMode="multiple">
        <Tag id="a">Initial access</Tag>
        <Tag id="b" isDisabled>
          Persistence
        </Tag>
      </TagGroup>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const tags = canvas.getAllByRole('row')

    await step('Both tags of the first set are stood down', async () => {
      await expect(tags[0]).toHaveAttribute('aria-disabled', 'true')
      await expect(tags[1]).toHaveAttribute('aria-disabled', 'true')
    })

    await step('And the second set stands one down beside one that is live', async () => {
      await expect(tags[2]).not.toHaveAttribute('aria-disabled', 'true')
      await expect(tags[3]).toHaveAttribute('aria-disabled', 'true')
    })

    // The attribute and the dimming are separate things, and a tag that said it
    // was disabled while drawing like its neighbour would pass the step above.
    await step('The refused one is dimmed beside the live one', async () => {
      await expect(Number.parseFloat(getComputedStyle(tags[3]!).opacity)).toBeLessThan(
        Number.parseFloat(getComputedStyle(tags[2]!).opacity),
      )
    })
  },
}

/**
 * `errorMessage` renders under the tags in the destructive ink.
 */
export const Invalid: Story = {
  render: () => (
    <TagGroup label="Tactics" errorMessage="Name at least two tactics.">
      <Tag id="initial-access">Initial access</Tag>
    </TagGroup>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const message = canvas.getByText('Name at least two tactics.')

    await step('The refusal is bound to the group', async () => {
      const described = (canvas.getByRole('grid').getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => canvasElement.ownerDocument.getElementById(id)?.textContent ?? '')
      await expect(described.join(' ')).toContain('Name at least two tactics.')
    })

    await step('And drawn in the destructive ink', async () => {
      const probe = document.createElement('span')
      probe.className = 'text-destructive'
      message.parentElement!.append(probe)
      const alarmed = getComputedStyle(probe).color
      probe.remove()

      await expect(getComputedStyle(message).color).toBe(alarmed)
    })
  },
}

/**
 * `renderEmptyState` for a set with nothing in it.
 */
export const Empty: Story = {
  render: () => (
    <TagGroup
      label="Tactics"
      items={[]}
      renderEmptyState={() => (
        <span className="text-xs text-ink-muted">No tactic recorded yet.</span>
      )}
    >
      {() => <Tag>Never rendered</Tag>}
    </TagGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Tactics')).toBeInTheDocument()
    await expect(canvas.getByText('No tactic recorded yet.')).toBeInTheDocument()
    await expect(canvas.queryAllByRole('row')).toHaveLength(0)
  },
}
