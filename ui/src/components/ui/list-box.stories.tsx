import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import {
  ListBox,
  ListBoxItem,
  ListBoxItemDot,
  ListBoxItemPill,
  ListBoxSection,
} from './list-box'

/**
 * A list of rows, selectable and reachable by typeahead.
 *
 * The kit's own layer over `ListBox` is four things: the `variant` chrome, the
 * disc and pill a row may carry, the titled group, and a `textValue` derived
 * from a string child so typeahead keeps working when a row holds more than
 * text. Selection, the arrow keys and typeahead itself are the foundation's.
 *
 * **A row's `id` is the key the selection is reported by**, and it is what a
 * caller stores -- not the label, which is copy and may be translated.
 */
const meta = {
  title: 'Components/ListBox',
  component: ListBox,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ListBox<object>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * No `selectionMode`, so the list is read-only: the rows still take focus and
 * answer the arrow keys, and a press marks nothing.
 */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    const rows = canvas.getAllByRole('option')

    await step('A press on a read-only row marks nothing', async () => {
      await userEvent.click(rows[1]!)
      await expect(rows[1]).not.toHaveAttribute('aria-selected', 'true')
    })

    await step('The bordered chrome is the list\u2019s own', async () => {
      const border = getComputedStyle(canvas.getByRole('listbox')).borderTopWidth
      await expect(Number.parseFloat(border)).toBeGreaterThan(0)
    })
  },
  render: () => (
    <ListBox aria-label="Tactic" className="w-56">
      <ListBoxItem id="recon">Reconnaissance</ListBoxItem>
      <ListBoxItem id="access">Initial access</ListBoxItem>
      <ListBoxItem id="exfil">Exfiltration</ListBoxItem>
    </ListBox>
  ),
}

/**
 * One row at a time.
 *
 * The selected row takes the primary ground rather than a tint, so it reads as
 * chosen at a glance in a list long enough to scroll.
 */
export const SingleSelection: Story = {
  play: async ({ canvas, step }) => {
    const chosen = canvas.getByRole('option', { name: 'High' })
    const other = canvas.getByRole('option', { name: 'Low' })

    await step('Exactly one row is marked', async () => {
      await expect(chosen).toHaveAttribute('aria-selected', 'true')
      await expect(
        canvas.getAllByRole('option').filter((row) => row.ariaSelected === 'true'),
      ).toHaveLength(1)
    })

    await step('And it is filled, not tinted', async () => {
      const fill = getComputedStyle(chosen)
      const plain = getComputedStyle(other)
      await expect(fill.backgroundColor).not.toBe(plain.backgroundColor)
      await expect(fill.color).not.toBe(plain.color)
    })
  },
  render: () => (
    <ListBox aria-label="Severity" selectionMode="single" defaultSelectedKeys={['high']} className="w-56">
      <ListBoxItem id="critical">Critical</ListBoxItem>
      <ListBoxItem id="high">High</ListBoxItem>
      <ListBoxItem id="medium">Medium</ListBoxItem>
      <ListBoxItem id="low">Low</ListBoxItem>
    </ListBox>
  ),
}

/** Several rows. Ctrl-click and Shift-click both work. */
export const MultipleSelection: Story = {
  render: () => (
    <ListBox
      aria-label="Hosts"
      selectionMode="multiple"
      defaultSelectedKeys={['dc01', 'ws14']}
      className="w-56"
    >
      <ListBoxItem id="dc01">DC01</ListBoxItem>
      <ListBoxItem id="ws14">WS14</ListBoxItem>
      <ListBoxItem id="fs02">FS02</ListBoxItem>
    </ListBox>
  ),
}

/**
 * `disabledKeys` on the list, not a prop on the row -- the list owns the keys,
 * so a caller disables a row without reaching into the row that draws it.
 *
 * A disabled row is dimmed and takes no pointer, so it is visible as an option
 * that exists and cannot be had. The arrow keys skip it.
 */
export const DisabledItems: Story = {
  play: async ({ canvas, step }) => {
    const refused = canvas.getByRole('option', { name: 'PDF' })

    await step('It says it is disabled, and it is dimmed', async () => {
      await expect(refused).toHaveAttribute('aria-disabled', 'true')
      await expect(Number.parseFloat(getComputedStyle(refused).opacity)).toBeLessThan(1)
    })

    await step('The arrows cannot land on it', async () => {
      canvas.getByRole('option', { name: 'Word' }).focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect(refused).not.toHaveFocus()
    })
  },
  render: () => (
    <ListBox
      aria-label="Report format"
      selectionMode="single"
      disabledKeys={['pdf', 'html']}
      className="w-56"
    >
      <ListBoxItem id="docx">Word</ListBoxItem>
      <ListBoxItem id="pdf">PDF</ListBoxItem>
      <ListBoxItem id="html">HTML</ListBoxItem>
    </ListBox>
  ),
}

/**
 * Titled groups.
 *
 * The title is a `Header`, so it is not a row: it cannot be focused, selected
 * or counted, and the arrows cross the boundary as though the groups were one
 * list. The group carries the title as its own name, which is what a screen
 * reader reads on entering it.
 */
export const Sections: Story = {
  play: async ({ canvas, step }) => {
    await step('Four rows, not six', async () => {
      await expect(canvas.getAllByRole('option')).toHaveLength(4)
    })

    await step('And each group is named by its title', async () => {
      await expect(canvas.getByRole('group', { name: 'Endpoint' })).toBeInTheDocument()
      await expect(canvas.getByRole('group', { name: 'Identity' })).toBeInTheDocument()
    })

    await step('The arrows cross the boundary', async () => {
      canvas.getByRole('option', { name: 'Process tree' }).focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect(canvas.getByRole('option', { name: 'Sign-in logs' })).toHaveFocus()
    })
  },
  render: () => (
    <ListBox aria-label="Evidence" selectionMode="multiple" className="w-56">
      <ListBoxSection title="Endpoint">
        <ListBoxItem id="edr">EDR alerts</ListBoxItem>
        <ListBoxItem id="proc">Process tree</ListBoxItem>
      </ListBoxSection>
      <ListBoxSection title="Identity">
        <ListBoxItem id="signin">Sign-in logs</ListBoxItem>
        <ListBoxItem id="audit">Audit logs</ListBoxItem>
      </ListBoxSection>
    </ListBox>
  ),
}

/**
 * `plain` drops the border, for a list already inside a bordered surface.
 *
 * Two borders a pixel apart is the tell of a list dropped into a popover
 * without this, so the chrome is the surface's and the list draws none.
 */
export const Plain: Story = {
  play: async ({ canvas, step }) => {
    const list = canvas.getByRole('listbox')

    await step('The list draws no border', async () => {
      await expect(getComputedStyle(list).borderTopWidth).toBe('0px')
    })

    await step('The surface around it draws the only one', async () => {
      const surface = list.parentElement
      await expect(
        Number.parseFloat(getComputedStyle(surface!).borderTopWidth),
      ).toBeGreaterThan(0)
    })
  },
  render: () => (
    <div className="w-56 rounded-md border border-border bg-background p-1">
      <ListBox aria-label="Tactic" variant="plain" selectionMode="single">
        <ListBoxItem id="recon">Reconnaissance</ListBoxItem>
        <ListBoxItem id="access">Initial access</ListBoxItem>
      </ListBox>
    </div>
  ),
}

/**
 * A coloured disc per row. The word beside it carries the meaning; the disc
 * repeats it, and is `aria-hidden` so it is not read twice.
 *
 * **The ramp has to rank.** Six levels drawn in five colours is a list where two
 * severities look equal, and no arrangement of the rows fixes it -- so the discs
 * are measured against each other rather than described.
 *
 * The row still gets a `textValue`, because its children are elements rather
 * than a string. **That is for the screen reader and not for typeahead**, which
 * falls back to the row's rendered text and reaches these rows either way --
 * measured by dropping the wrapper's forwarding and watching the jump still
 * land. A `textValue` earns its place on the row whose rendered text is not its
 * label: an icon alone, a truncation, a word split across elements.
 */
export const Dots: Story = {
  play: async ({ canvas, step }) => {
    await step('Typing jumps to a row, disc and all', async () => {
      canvas.getByRole('option', { name: 'Critical' }).focus()
      await userEvent.keyboard('infor')
      await waitFor(() => {
        void expect(canvas.getByRole('option', { name: 'Informational' })).toHaveFocus()
      })
    })

    await step('And no two levels are drawn the same colour', async () => {
      const fills = canvas
        .getAllByRole('option')
        .map(
          (row) =>
            getComputedStyle(row.querySelector('[data-slot="list-box-item-dot"]')!)
              .backgroundColor,
        )
      await expect(new Set(fills).size).toBe(fills.length)
    })
  },
  render: () => (
    <ListBox aria-label="Severity" selectionMode="single" defaultSelectedKeys={['high']} className="w-56">
      <ListBoxItem id="critical" textValue="Critical">
        <ListBoxItemDot tone="critical" />
        Critical
      </ListBoxItem>
      <ListBoxItem id="high" textValue="High">
        <ListBoxItemDot tone="high" />
        High
      </ListBoxItem>
      <ListBoxItem id="medium" textValue="Medium">
        <ListBoxItemDot tone="medium" />
        Medium
      </ListBoxItem>
      <ListBoxItem id="low" textValue="Low">
        <ListBoxItemDot tone="low" />
        Low
      </ListBoxItem>
      <ListBoxItem id="info" textValue="Informational">
        <ListBoxItemDot tone="info" />
        Informational
      </ListBoxItem>
      <ListBoxItem id="none" textValue="Unset">
        <ListBoxItemDot tone="none" />
        Unset
      </ListBoxItem>
    </ListBox>
  ),
}

/**
 * The three response actions, as discs at the larger size.
 *
 * `md` is for a row at the loose end of the density ladder, where the small disc
 * reads as a bullet rather than a status.
 */
export const ActionDots: Story = {
  play: async ({ canvas }) => {
    const disc = canvas
      .getAllByRole('option')[0]!
      .querySelector('[data-slot="list-box-item-dot"]')!

    await expect(disc.getBoundingClientRect().width).toBeGreaterThan(8)
  },
  render: () => (
    <ListBox aria-label="Response" selectionMode="single" className="w-56">
      <ListBoxItem id="notify" textValue="Notify the customer">
        <ListBoxItemDot tone="notify" size="md" />
        Notify the customer
      </ListBoxItem>
      <ListBoxItem id="contain" textValue="Contain the host">
        <ListBoxItemDot tone="contain" size="md" />
        Contain the host
      </ListBoxItem>
      <ListBoxItem id="investigate" textValue="Investigate further">
        <ListBoxItemDot tone="investigate" size="md" />
        Investigate further
      </ListBoxItem>
    </ListBox>
  ),
}

/**
 * A filled pill, for when the colour needs a word with it.
 *
 * Trailing, and the label beside it takes the slack, so the pills hold one right
 * edge and a long finding truncates rather than pushing its own severity off the
 * row. Unlike the disc a pill reads, so the row needs no second copy of the
 * word.
 */
export const Pills: Story = {
  play: async ({ canvas, step }) => {
    const pills = canvas
      .getAllByRole('option')
      .map((row) => row.querySelector('[data-slot="list-box-item-pill"]')!)

    await step('Every pill ends on one right edge', async () => {
      const edges = pills.map((pill) => Math.round(pill.getBoundingClientRect().right))
      await expect(new Set(edges).size).toBe(1)
    })

    // The first row's label is longer than the row, which is the case that
    // decides this: the label truncates and the pill keeps its full width,
    // rather than the pill collapsing to make room for text nobody can read.
    await step('And the overlong row squeezes its label, not its pill', async () => {
      const [wide] = pills
      await expect(wide!.getBoundingClientRect().width).toBeGreaterThan(40)
      const label = canvas.getAllByRole('option')[0]!.querySelector('span.flex-1')!
      await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
    })
  },
  render: () => (
    <ListBox aria-label="Findings" selectionMode="multiple" defaultSelectedKeys={['dump']} className="w-72">
      <ListBoxItem id="dump" textValue="Credential dumping on DC01, critical">
        <span className="flex-1 truncate">
          Credential dumping on DC01, and a finding title long enough to want the whole row
        </span>
        <ListBoxItemPill tone="critical">critical</ListBoxItemPill>
      </ListBoxItem>
      <ListBoxItem id="phish" textValue="Phishing mail delivered, high">
        <span className="flex-1 truncate">Phishing mail delivered</span>
        <ListBoxItemPill tone="high">high</ListBoxItemPill>
      </ListBoxItem>
      <ListBoxItem id="rule" textValue="Inbox rule created, medium">
        <span className="flex-1 truncate">Inbox rule created</span>
        <ListBoxItemPill tone="medium">medium</ListBoxItemPill>
      </ListBoxItem>
      <ListBoxItem id="signin" textValue="Sign-in from a new country, low">
        <span className="flex-1 truncate">Sign-in from a new country</span>
        <ListBoxItemPill tone="low">low</ListBoxItemPill>
      </ListBoxItem>
      <ListBoxItem id="scan" textValue="Port scan observed, informational">
        <span className="flex-1 truncate">Port scan observed</span>
        <ListBoxItemPill tone="info">info</ListBoxItemPill>
      </ListBoxItem>
    </ListBox>
  ),
}

/** Discs and pills inside titled groups, which is what a picker looks like. */
export const DotsInSections: Story = {
  render: () => (
    <ListBox aria-label="Hosts" selectionMode="single" className="w-72">
      <ListBoxSection title="Compromised">
        <ListBoxItem id="dc01" textValue="DC01, contain">
          <ListBoxItemDot tone="critical" />
          <span className="flex-1 truncate">DC01</span>
          <ListBoxItemPill tone="contain">contain</ListBoxItemPill>
        </ListBoxItem>
        <ListBoxItem id="ws14" textValue="WS14, investigate">
          <ListBoxItemDot tone="high" />
          <span className="flex-1 truncate">WS14</span>
          <ListBoxItemPill tone="investigate">investigate</ListBoxItemPill>
        </ListBoxItem>
      </ListBoxSection>
      <ListBoxSection title="Watched">
        <ListBoxItem id="fs02" textValue="FS02, notify">
          <ListBoxItemDot tone="low" />
          <span className="flex-1 truncate">FS02</span>
          <ListBoxItemPill tone="notify">notify</ListBoxItemPill>
        </ListBoxItem>
      </ListBoxSection>
    </ListBox>
  ),
}

/**
 * The list with nothing in it.
 *
 * `renderEmptyState` is the foundation's, and the kit's `isEmpty` chrome centres
 * whatever it returns and drops it to muted ink -- so an empty list reads as a
 * list that found nothing rather than as a component that failed to draw.
 */
export const Empty: Story = {
  render: () => (
    <ListBox aria-label="Tactic" className="w-56" renderEmptyState={() => 'No tactic matches'}>
      {[]}
    </ListBox>
  ),
  play: async ({ canvas }) => {
    const list = canvas.getByRole('listbox')

    await expect(list).toHaveTextContent('No tactic matches')
    await expect(getComputedStyle(list).justifyContent).toBe('center')
  },
}
