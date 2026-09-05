import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import {
  PICKER_CONNECTIONS,
  PICKER_FIGURES,
  PICKER_GAUGES,
  PICKER_SERVING,
  PICKER_TABLES,
  PICKER_UPTIME,
  REDIS_DOWN_NOTE,
} from './picker-rows'
import { HealthPane } from '@/components/blocks/health-pane'

/**
 * What this install is doing, and whether it is coping: what is serving,
 * this server's own gauges, and Postgres underneath it.
 */
const meta = {
  title: 'Blocks/System/Health',
  component: HealthPane,
  parameters: { layout: 'padded' },
  args: {
    uptime: PICKER_UPTIME,
    serving: PICKER_SERVING,
    gauges: PICKER_GAUGES,
    connections: PICKER_CONNECTIONS,
    figures: PICKER_FIGURES,
    tables: PICKER_TABLES,
  },
} satisfies Meta<typeof HealthPane>

export default meta
type Story = StoryObj<typeof meta>

/** Everything answering. The note about presence belongs to the story below. */
export const Serving: Story = {
  name: 'Everything answering',
  args: {
    serving: PICKER_SERVING.map((one) => ({ ...one, up: true, detail: 'reachable' })),
  },
  play: async ({ canvas, step }) => {
    await step('the pane names each dependency', async () => {
      await expect(canvas.getByText('Postgres', { selector: 'span' })).toBeVisible()
      await expect(canvas.getByText('Redis')).toBeVisible()
    })
    await step('and says nothing about presence, because nothing has gone', async () => {
      await expect(canvas.queryByText(REDIS_DOWN_NOTE)).toBeNull()
    })
  },
}

/**
 * Redis refusing connections, which is the one dependency loss a case survives.
 */
export const PresenceGone: Story = {
  name: 'Redis refusing connections',
  play: async ({ canvas, step }) => {
    await step('the row states the refusal', async () => {
      await expect(canvas.getByText('connection refused')).toBeVisible()
    })
    await step('and the pane says what an analyst loses', async () => {
      await expect(canvas.getByText(REDIS_DOWN_NOTE)).toBeVisible()
    })
  },
}

/**
 * A gauge past the ceiling it is drawn against.
 */
export const OverTheCeiling: Story = {
  name: 'A disk past its ceiling',
  args: {
    gauges: [
      { label: 'Heap', used: 214_958_080, total: 402_653_184, unit: 'bytes' },
      {
        label: 'Disk holding /app/evidence',
        used: 70_866_960_384,
        total: 68_719_476_736,
        unit: 'bytes',
      },
    ],
    figures: PICKER_FIGURES.map((figure) =>
      figure.label === 'Database'
        ? { ...figure, note: 'growing 4 MiB an hour', warn: true }
        : figure,
    ),
  },
  play: async ({ canvas, step }) => {
    await step('the figure reports the used side past the total', async () => {
      await expect(canvas.getByText('66 GiB / 64 GiB')).toBeVisible()
    })
    await step('and a figure that has to be acted on is drawn as a warning', async () => {
      await expect(canvas.getByText('growing 4 MiB an hour')).toBeVisible()
    })
  },
}

/**
 * A server that came up a minute ago: nothing served, nothing stored.
 */
export const FreshInstall: Story = {
  name: 'A server up for a minute',
  args: {
    uptime: 'up 47s',
    serving: [{ label: 'Server', up: true, detail: 'answering' }],
    gauges: [{ label: 'Heap', used: 31_457_280, total: 402_653_184, unit: 'bytes' }],
    connections: { label: 'Connections, all clients', used: 1, total: 100, unit: 'count' },
    figures: [
      { label: 'Cases', value: '0' },
      { label: 'Accounts', value: '1', note: '1 admin' },
    ],
    tables: [],
  },
  play: async ({ canvas, step }) => {
    await step('the cards are drawn with nothing in them', async () => {
      await expect(canvas.getByText('up 47s')).toBeVisible()
      await expect(canvas.getByRole('columnheader', { name: 'Table' })).toBeVisible()
    })
    await step('and a count of nothing is written rather than left out', async () => {
      await expect(canvas.getByText('Cases')).toBeVisible()
      await expect(canvas.getByText('0')).toBeVisible()
    })
  },
}

/**
 * A busy install: every table the schema has, and the uptime of a server nobody
 * has restarted since spring.
 */
export const TooMuch: Story = {
  name: 'Every table, and a long uptime',
  args: {
    uptime: 'up 214d 6h 41m',
    tables: [
      { name: 'timeline_entry', approximateRows: 4_811_204, bytes: 9_646_899_200 },
      { name: 'audit_event', approximateRows: 3_104_477, bytes: 4_194_304_000 },
      { name: 'timeline_entry_reference', approximateRows: 1_918_330, bytes: 2_097_152_000 },
      { name: 'case_compliance_assessment_note', approximateRows: 418_004, bytes: 838_860_800 },
      { name: 'network_indicator', approximateRows: 290_712, bytes: 524_288_000 },
      { name: 'malware_sample', approximateRows: 88_140, bytes: 268_435_456 },
      { name: 'account_of_interest', approximateRows: 41_009, bytes: 134_217_728 },
      { name: 'system_of_interest', approximateRows: 22_517, bytes: 67_108_864 },
      { name: 'report_section', approximateRows: 9_004, bytes: 33_554_432 },
      { name: 'account', approximateRows: 62, bytes: 32_768 },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('a million rows is grouped, so it can be read at a glance', async () => {
      await expect(canvas.getByText('4,811,204')).toBeVisible()
    })
    await step('and the longest table name is not truncated away', async () => {
      await expect(canvas.getByText('case_compliance_assessment_note')).toBeVisible()
    })
  },
}
