import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, Monitor, User } from 'lucide-react'

import { expect } from 'storybook/test'

import { Badge } from './badge'
import { Button } from './button'
import { IconTile } from './icon-tile'
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
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * A dense list row: media, a title and a description, and an action slot.
 *
 * **The row places its own slots.** Media leads, the content takes the slack, and
 * the actions hold the trailing edge -- so a list of rows lines up down both
 * edges whatever each one carries, and a row missing its media does not shift
 * its title.
 *
 * A row is not a control. `ItemGroup` announces the stack as a list and each row
 * as a list item; anything pressable inside a row is its own control in the
 * actions slot.
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
 *
 * The badge sits inside the title rather than beside it, so the kind reads as
 * part of the name and wraps with it instead of being pushed onto its own line.
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
 *
 * `default` draws nothing at all, for a row inside a surface that is already a
 * panel. `outline` is the standalone row and `muted` is the one in a stack that
 * wants banding without a border on every line.
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
 *
 * **Two rungs, and two names for them.** A third name resolving to the same
 * string as `default` lets a caller ask for a denser row, get the normal one,
 * and find out by measuring.
 *
 * `xs` is what a row inside a popover or a dense table cell takes.
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
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="item"]')]
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
 *
 * **None of the three draws a ground**, measured -- so these are three sizings
 * rather than three chromes, and the row's own variant is what carries any fill.
 *
 * `default` leaves a glyph at whatever size it came with. `icon` holds an
 * unsized one to 16px, so a row of mixed marks lines up instead of one lucide
 * default towering over the rest. `image` is a sized box that crops what is put
 * in it, and shrinks with the row.
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
    const media = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="item-media"]')]

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
      const edges = [...canvasElement.querySelectorAll('[data-part="item-title"]')].map((title) =>
        Math.round(title.getBoundingClientRect().left),
      )
      await expect(new Set(edges).size).toBe(3)
    })
  },
}

/**
 * A row inside a row takes the measurement it inherits.
 *
 * The row's size reaches its slots as a custom property, and a property
 * inherits -- so a default row nested inside an `xs` one is measured by the
 * `xs` one, which is what the old `group-data-[size=xs]/item:` variant did
 * too: it matched any ancestor. Only `xs` declares, so nothing resets it on
 * the way down. -> #897
 */
export const ANestedRowInheritsTheSize: Story = {
  render: () => (
    <ItemGroup className="max-w-lg">
      <Item role="listitem" size="xs">
        <ItemContent>
          {/* No `listitem` role: this row is content inside the row above,
              not a second entry in the same list. */}
          <Item data-testid="nested-default">
            <ItemMedia variant="image" data-testid="nested-media">
              <img alt="" src={PIXEL} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>chrome.exe</ItemTitle>
            </ItemContent>
          </Item>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('the row it sits in decides, not the one it is', async () => {
      const media = await canvas.findByTestId('nested-media')
      await expect(
        getComputedStyle(media).width,
        'a default row nested in an xs row stopped inheriting the xs measurement',
      ).toBe('24px')
    })
  },
}

/**
 * A caller's size beats the one the row's size implies.
 *
 * An `xs` row shrinks its media, and a caller asking for something else has to
 * be able to win -- a class that is silently ignored is worse than one that is
 * refused. jsdom cannot see it: what decides is the specificity two selectors
 * compile to. -> #897
 */
export const CallerOutranksTheRowSize: Story = {
  render: () => (
    <ItemGroup className="max-w-lg">
      <Item role="listitem" size="xs">
        <ItemMedia variant="image" data-testid="left-to-the-row">
          <img alt="" src={PIXEL} />
        </ItemMedia>
        <ItemMedia variant="image" className="size-8" data-testid="asked-for">
          <img alt="" src={PIXEL} />
        </ItemMedia>
        <ItemContent className="gap-3" data-testid="content">
          <ItemTitle>WKS-4417</ItemTitle>
          <ItemDescription>Windows workstation</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('the row decides for a slot that asks for nothing', async () => {
      const own = await canvas.findByTestId('left-to-the-row')
      await expect(getComputedStyle(own).width, 'an xs row stopped shrinking its media').toBe(
        '24px',
      )
    })

    await step('and the caller decides for one that asks', async () => {
      const asked = await canvas.findByTestId('asked-for')
      await expect(
        getComputedStyle(asked).width,
        'the row outranked the size the caller asked for, so the class did nothing',
      ).toBe('32px')

      const content = await canvas.findByTestId('content')
      await expect(
        getComputedStyle(content).rowGap,
        'the row outranked the gap the caller asked for',
      ).toBe('12px')
    })
  },
}

/**
 * A stack inside a stack keeps its own spacing.
 *
 * `:has()` matches a descendant, so naming the part is not enough on its own:
 * a nested group of small rows, or a small row nested inside an ordinary one,
 * both sit under the outer group and answered for it. The direct child is
 * what ties the selector to the rows the group actually stacks. -> #951
 */
export const NestedGroupsKeepTheirOwnGap: Story = {
  render: () => (
    <ItemGroup className="max-w-lg" data-testid="outer">
      <Item role="listitem">
        <ItemContent>
          <ItemTitle>WKS-4417</ItemTitle>
        </ItemContent>
      </Item>
      <Item role="listitem">
        <ItemContent>
          <ItemGroup data-testid="inner">
            <Item role="listitem" variant="outline" size="xs">
              <ItemContent>
                <ItemTitle>chrome.exe</ItemTitle>
              </ItemContent>
            </Item>
            <Item role="listitem" variant="outline" size="xs">
              <ItemContent>
                <ItemTitle>powershell.exe</ItemTitle>
              </ItemContent>
            </Item>
          </ItemGroup>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('the outer stack answers to its own rows', async () => {
      const outer = await canvas.findByTestId('outer')
      await expect(
        getComputedStyle(outer).rowGap,
        'a nested stack of small rows pulled the stack around it tight',
      ).toBe('16px')
    })

    await step('the inner stack still tightens for its own', async () => {
      const inner = await canvas.findByTestId('inner')
      await expect(
        getComputedStyle(inner).rowGap,
        'the nested stack lost the tightening its own rows ask for',
      ).toBe('8px')
    })
  },
}

/**
 * A stack of small rows draws tight.
 *
 * The rows carry the size and the group reads it, so the spacing between them
 * answers to what they are rather than to a class the caller has to remember.
 */
export const GroupOfSmallRows: Story = {
  render: () => (
    <ItemGroup className="max-w-lg">
      <Item role="listitem" variant="outline" size="xs">
        <ItemContent>
          <ItemTitle>WKS-4417</ItemTitle>
        </ItemContent>
      </Item>
      <Item role="listitem" variant="outline" size="xs">
        <ItemContent>
          <ItemTitle>d.okoro</ItemTitle>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvasElement, step }) => {
    await step('the stack tightens for the rows it holds', async () => {
      const group = canvasElement.querySelector('[data-part="item-group"]')
      await expect(
        group === null ? '' : getComputedStyle(group).rowGap,
        'a stack of xs rows drew the roomy gap',
      ).toBe('8px')
    })
  },
}

/**
 * A tile nested in a row does not tighten the stack around it.
 *
 * `ItemGroup` tightens to `gap-2` for a stack of `xs` rows. The selector used
 * to key on the attribute alone, and `IconTile` writes the same one -- so a
 * tile dropped inside a row of ordinary size pulled the whole stack tight,
 * for a reason nobody writing that markup would look for. -> #951
 */
export const GroupIgnoresANestedSize: Story = {
  render: () => (
    <ItemGroup className="max-w-lg">
      <Item role="listitem">
        <ItemMedia variant="icon">
          <IconTile size="xs">
            <Monitor />
          </IconTile>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>WKS-4417</ItemTitle>
          <ItemDescription>Windows workstation</ItemDescription>
        </ItemContent>
      </Item>
      <Item role="listitem">
        <ItemContent>
          <ItemTitle>d.okoro</ItemTitle>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvasElement, step }) => {
    await step('the stack keeps the gap its own rows ask for', async () => {
      const group = canvasElement.querySelector('[data-part="item-group"]')
      await expect(group).not.toBeNull()
      // 16px is `gap-4`, which is what a stack of default rows is. The tight
      // 8px belongs to a stack whose own rows are `xs`.
      await expect(
        group === null ? '' : getComputedStyle(group).rowGap,
        'the stack did not draw the gap its own rows ask for',
      ).toBe('16px')
    })
  },
}

/**
 * `ItemGroup` stacks rows and announces the stack as a list.
 *
 * The `role` on each row is the caller's, because only the caller knows whether
 * the stack is a list of things or a set of controls -- and a row announced as a
 * list item inside something that is not a list is worse than one announced as
 * nothing.
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
        .map((row) => row.querySelector('[data-part="item-title"]')!.getBoundingClientRect().left)
      await expect(new Set(titles.map((left) => Math.round(left))).size).toBe(1)
    })
  },
}

/**
 * A title alone, which is the least a row can carry.
 *
 * No media and no actions, and the title still starts at the row's own padding
 * rather than at an indent left by a slot that is not there.
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
    const row = canvasElement.querySelector<HTMLElement>('[data-part="item"]')!
    const style = getComputedStyle(row)
    const inset =
      row.getBoundingClientRect().left +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.paddingLeft)

    await expect(
      row.querySelector('[data-part="item-title"]')!.getBoundingClientRect().left,
    ).toBeCloseTo(inset, 0)
  },
}
