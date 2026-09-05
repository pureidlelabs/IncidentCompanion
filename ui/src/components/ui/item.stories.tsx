import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, Monitor, User } from 'lucide-react'

import { expect } from 'storybook/test'

import { Badge } from './badge'
import { Button } from './button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from './item'

// A 1x1 transparent GIF, inline: a story may not reach the network.
const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * A dense list row: media, a title and a description, and an action slot.
 */
const meta = {
  title: 'Components/Item',
  component: Item,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Item>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every slot filled.
 */
export const Default: Story = {
  render: () => (
    <Item variant="outline" className="max-w-lg">
      <ItemMedia variant="icon">
        <Monitor />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          WKS-4417 <Badge size="xs">host</Badge>
        </ItemTitle>
        <ItemDescription>First seen 2 March, 04:09 UTC. Two entries reference it.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant="ghost" aria-label="Open WKS-4417">
          Open
        </Button>
      </ItemActions>
    </Item>
  ),
}

/**
 * Every variant.
 */
export const Variants: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <Item variant="default">
        <ItemMedia>
          <User />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Default</ItemTitle>
          <ItemDescription>No ground, no rule.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemMedia>
          <User />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Outline</ItemTitle>
          <ItemDescription>A card-like row.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemMedia>
          <User />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Muted</ItemTitle>
          <ItemDescription>A quieter ground.</ItemDescription>
        </ItemContent>
      </Item>
    </div>
  ),
}

/**
 * Both sizes.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <Item variant="outline" size="default">
        <ItemContent>
          <ItemTitle>Default</ItemTitle>
        </ItemContent>
      </Item>
      <Item variant="outline" size="xs">
        <ItemContent>
          <ItemTitle>Extra small</ItemTitle>
        </ItemContent>
      </Item>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="item"]')]
    const boxOf = (row: HTMLElement) => {
      const style = getComputedStyle(row)
      return `${style.paddingTop}/${style.paddingLeft}/${style.gap}`
    }

    await step('Two rows, and they are two sizes', async () => {
      await expect(rows).toHaveLength(2)
      await expect(boxOf(rows[0]!)).not.toBe(boxOf(rows[1]!))
    })

    await step('The tighter one is tighter', async () => {
      await expect(rows[1]!.getBoundingClientRect().height).toBeLessThan(
        rows[0]!.getBoundingClientRect().height,
      )
    })
  },
}

/**
 * The media slot's three shapes.
 */
export const Media: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <Item variant="outline">
        <ItemMedia variant="default">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Glyph at its own size</ItemTitle>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Glyph held to 16px</ItemTitle>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemMedia variant="image">
          <img src={PIXEL} alt="" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Picture</ItemTitle>
        </ItemContent>
      </Item>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const media = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="item-media"]')]

    await step('None of them draws a ground', async () => {
      for (const box of media) {
        await expect(getComputedStyle(box).backgroundColor).toMatch(
          /rgba\(0, 0, 0, 0\)|transparent/,
        )
      }
    })

    await step('And the held glyph is smaller than the one left alone', async () => {
      const glyph = (at: number) => media[at]!.querySelector('svg')!.getBoundingClientRect().width
      await expect(glyph(1)).toBeLessThan(glyph(0))
    })

    // Three widths, three title edges. Worth knowing before building a stack:
    // rows line up down the left only where they share a media variant, which
    // is what `Group` below does.
    await step('And each width puts the title somewhere else', async () => {
      const edges = [...canvasElement.querySelectorAll('[data-slot="item-title"]')].map((title) =>
        Math.round(title.getBoundingClientRect().left),
      )
      await expect(new Set(edges).size).toBe(3)
    })
  },
}

/**
 * `ItemGroup` stacks rows and announces the stack as a list.
 */
export const Group: Story = {
  render: () => (
    <ItemGroup className="max-w-lg">
      <Item role="listitem">
        <ItemMedia variant="icon">
          <Monitor />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>WKS-4417</ItemTitle>
          <ItemDescription>Windows workstation</ItemDescription>
        </ItemContent>
      </Item>
      <Item role="listitem">
        <ItemMedia variant="icon">
          <User />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>d.okoro</ItemTitle>
          <ItemDescription>Account, finance</ItemDescription>
        </ItemContent>
      </Item>
      <Item role="listitem">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>invoice-run.xlsx</ItemTitle>
          <ItemDescription>Attachment, 1.2 MB</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('The stack is a list of three', async () => {
      await expect(canvas.getByRole('list')).toBeInTheDocument()
      await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
    })

    await step('And every row lines up down both edges', async () => {
      const titles = canvas
        .getAllByRole('listitem')
        .map((row) => row.querySelector('[data-slot="item-title"]')!.getBoundingClientRect().left)
      await expect(new Set(titles.map((left) => Math.round(left))).size).toBe(1)
    })
  },
}

/**
 * A title alone, which is the least a row can carry.
 */
export const TitleOnly: Story = {
  render: () => (
    <Item variant="outline" size="xs" className="max-w-lg">
      <ItemContent>
        <ItemTitle>Nothing else is known about this entity yet</ItemTitle>
      </ItemContent>
    </Item>
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector<HTMLElement>('[data-slot="item"]')!
    const style = getComputedStyle(row)
    const inset =
      row.getBoundingClientRect().left +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.paddingLeft)

    await expect(
      row.querySelector('[data-slot="item-title"]')!.getBoundingClientRect().left,
    ).toBeCloseTo(inset, 0)
  },
}
