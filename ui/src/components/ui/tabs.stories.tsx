import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, userEvent, waitFor } from 'storybook/test'

import { Tab, TabList, TabPanel, Tabs } from './tabs'

/**
 * A tabbed pane, vertical or horizontal, holding the selected tab's `id`.
 *
 * **The second half is measured and the first is not.** Giving each tab its own
 * `layoutId` leaves exactly one bar standing, since only one tab ever draws one,
 * so a count says nothing about whether the bar travels or fades. What a count
 * does catch is a bar drawn on every tab, which is the failure that turns the
 * mark from a place into a decoration.
 */
const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The selected tab carries the bar, and the panel beside it is the only one
 * drawn.
 */
export const Default: Story = {
  render: () => (
    <Tabs className="w-96">
      <TabList aria-label="Case">
        <Tab id="timeline">Timeline</Tab>
        <Tab id="entities">Entities</Tab>
        <Tab id="report">Report</Tab>
      </TabList>
      <TabPanel id="timeline">Every event, in the order it happened.</TabPanel>
      <TabPanel id="entities">Hosts, accounts and files touched by the incident.</TabPanel>
      <TabPanel id="report">The written record, and what it will export as.</TabPanel>
    </Tabs>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const bars = () => canvasElement.querySelectorAll('[data-slot="tab-bar"]')

    await step('One bar, on the selected tab', async () => {
      await expect(bars()).toHaveLength(1)
      await expect(
        canvas.getByRole('tab', { name: 'Timeline' }).querySelector('[data-slot="tab-bar"]'),
      ).not.toBeNull()
    })

    await step('One panel, and it is that tab\u2019s', async () => {
      await expect(canvas.getAllByRole('tabpanel')).toHaveLength(1)
      await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
        'Every event, in the order it happened.',
      )
    })

    await step('Choosing another moves the one bar rather than lighting a second', async () => {
      await userEvent.click(canvas.getByRole('tab', { name: 'Report' }))
      await waitFor(() => {
        void expect(
          canvas.getByRole('tab', { name: 'Report' }).querySelector('[data-slot="tab-bar"]'),
        ).not.toBeNull()
      })
      await expect(bars()).toHaveLength(1)
      await expect(canvas.getAllByRole('tabpanel')).toHaveLength(1)
    })
  },
}

/** `defaultSelectedKey` names the tab that opens first. */
export const Selection: Story = {
  render: () => (
    <Tabs defaultSelectedKey="entities" className="w-96">
      <TabList aria-label="Case">
        <Tab id="timeline">Timeline</Tab>
        <Tab id="entities">Entities</Tab>
        <Tab id="report">Report</Tab>
      </TabList>
      <TabPanel id="timeline">Every event, in the order it happened.</TabPanel>
      <TabPanel id="entities">Hosts, accounts and files touched by the incident.</TabPanel>
      <TabPanel id="report">The written record, and what it will export as.</TabPanel>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('tab', { name: 'Entities' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Hosts, accounts and files')
  },
}

/**
 * `isDisabled` on the tab, not on the tabs.
 */
export const DisabledTab: Story = {
  render: () => (
    <Tabs className="w-96">
      <TabList aria-label="Case">
        <Tab id="timeline">Timeline</Tab>
        <Tab id="entities">Entities</Tab>
        <Tab id="report" isDisabled>
          Report
        </Tab>
      </TabList>
      <TabPanel id="timeline">Every event, in the order it happened.</TabPanel>
      <TabPanel id="entities">Hosts, accounts and files touched by the incident.</TabPanel>
      <TabPanel id="report">Nothing to show while the tab is disabled.</TabPanel>
    </Tabs>
  ),
  play: async ({ canvas, step }) => {
    const refused = canvas.getByRole('tab', { name: 'Report' })

    await step('It says it is disabled', async () => {
      await expect(refused).toHaveAttribute('aria-disabled', 'true')
    })

    await step('And the arrows pass it by', async () => {
      canvas.getByRole('tab', { name: 'Entities' }).focus()
      await userEvent.keyboard('{ArrowRight}')
      await expect(refused).not.toHaveFocus()
    })
  },
}

/**
 * The two heights.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-6">
      <Tabs>
        <TabList aria-label="Case, small">
          <Tab id="timeline" size="sm">
            Timeline
          </Tab>
          <Tab id="entities" size="sm">
            Entities
          </Tab>
        </TabList>
        <TabPanel id="timeline">Small.</TabPanel>
        <TabPanel id="entities">Small.</TabPanel>
      </Tabs>
      <Tabs>
        <TabList aria-label="Case, default">
          <Tab id="timeline">Timeline</Tab>
          <Tab id="entities">Entities</Tab>
        </TabList>
        <TabPanel id="timeline">Default.</TabPanel>
        <TabPanel id="entities">Default.</TabPanel>
      </Tabs>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const [small, regular] = canvas.getAllByRole('tab', { name: 'Timeline' })

    await step('The smaller rung is shorter', async () => {
      await expect(small!.getBoundingClientRect().height).toBeLessThan(
        regular!.getBoundingClientRect().height,
      )
    })

    await step('And the type goes with it', async () => {
      await expect(Number.parseFloat(getComputedStyle(small!).fontSize)).toBeLessThan(
        Number.parseFloat(getComputedStyle(regular!).fontSize),
      )
    })
  },
}

/**
 * Vertical puts the list beside the panel and the border on its trailing edge.
 */
export const Vertical: Story = {
  render: () => (
    <Tabs orientation="vertical" className="w-96">
      <TabList aria-label="Case">
        <Tab id="timeline">Timeline</Tab>
        <Tab id="entities">Entities</Tab>
        <Tab id="report">Report</Tab>
      </TabList>
      <TabPanel id="timeline">Every event, in the order it happened.</TabPanel>
      <TabPanel id="entities">Hosts, accounts and files touched by the incident.</TabPanel>
      <TabPanel id="report">The written record, and what it will export as.</TabPanel>
    </Tabs>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const list = canvas.getByRole('tablist').getBoundingClientRect()
    const panel = canvas.getByRole('tabpanel').getBoundingClientRect()

    await step('The list is beside the panel, not above it', async () => {
      await expect(panel.left).toBeGreaterThanOrEqual(list.right - 1)
    })

    await step('And the bar stands on the tab\u2019s trailing edge', async () => {
      const bar = canvasElement
        .querySelector('[data-slot="tab-bar"]')!
        .getBoundingClientRect()
      await expect(bar.height).toBeGreaterThan(bar.width)
    })
  },
}

/**
 * **The panel's height, which is what the motion here is for.**
 */
export const PanelHeights: Story = {
  render: () => (
    <Tabs className="w-96">
      <TabList aria-label="Case">
        <Tab id="timeline">Timeline</Tab>
        <Tab id="entities">Entities</Tab>
        <Tab id="report">Report</Tab>
      </TabList>
      <TabPanel id="timeline">One line.</TabPanel>
      <TabPanel id="entities">
        <ul className="flex list-disc flex-col gap-1 ps-4">
          <li>DC01, a domain controller</li>
          <li>svc-backup, a service account</li>
          <li>invoice.xlsm, dropped from the mailbox rule</li>
          <li>update.ps1, staged under Temp</li>
          <li>185.220.101.34, the egress the archive left by</li>
        </ul>
      </TabPanel>
      <TabPanel id="report">
        Twelve mailboxes in the finance tenant, read in bulk through the Graph API between 02:14
        and 04:40 UTC. An inbox rule forwarded anything matching the invoice thread to an external
        address, and an archive was staged under Temp before the session was closed.
      </TabPanel>
    </Tabs>
  ),
  play: async ({ canvas, step }) => {
    const height = () => canvas.getByRole('tabpanel').getBoundingClientRect().height

    await step('The panels are the unequal lengths the story needs', async () => {
      const short = height()
      await userEvent.click(canvas.getByRole('tab', { name: 'Entities' }))
      await waitFor(() => {
        void expect(height()).toBeGreaterThan(short * 2)
      })
    })
  },
}
