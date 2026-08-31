import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { Key, Selection } from 'react-aria-components'

import { expect, userEvent } from 'storybook/test'

import { Tag, TagGroup } from './tag-group'

/**
 * A list of tags, navigable with the arrow keys and removable with `onRemove`.
 *
 * **A tag group is a list, not a set of buttons.** The whole group is one tab
 * stop and the arrows move between tags, so a case carrying nine tactics costs
 * one Tab rather than nine on the way past.
 *
 * A tag becomes pressable only when the group is given something to do --
 * `onRemove` grows a button on each one, `selectionMode` makes them selectable.
 * Without either they are text in a row, which is what most of them are.
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
 *
 * No `onRemove` and no `selectionMode`, so nothing here is pressable and the
 * tags are a reading rather than a control.
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
 *
 * Through `aria-describedby` on the group rather than as loose text, so a reader
 * entering the set is told where the tags came from at the moment it matters.
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
 *
 * The tone is the tag's own rather than the group's, so one finding can be
 * marked among several that are not.
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
 *
 * The cost of that is worth knowing: there is no one place to stand a set down,
 * so a caller holding a read-only case passes the flag to every tag it renders
 * and a tag added later without it is live.
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
 *
 * It is bound to the group the description would be, so the refusal is
 * announced with the set rather than read as a line of text beneath it.
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
 *
 * The group and its label stay, so an analyst reads *no tactic recorded yet*
 * rather than finding the row absent and wondering whether tags exist here at
 * all.
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
