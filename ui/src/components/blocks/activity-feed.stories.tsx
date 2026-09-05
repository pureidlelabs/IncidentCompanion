import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import type { ActivityEntry } from '@/api/activity'
import { ActivityFeed } from '@/components/blocks/activity-feed'

/** Fixed, so the relative stamps do not move between runs. */
const NOW = 1_756_000_000_000
const SECONDS = Math.floor(NOW / 1000)

const entry = (over: Partial<ActivityEntry> & Pick<ActivityEntry, 'seq'>): ActivityEntry => ({
  entity: 'systems',
  entityId: 'sys-1',
  op: 'update',
  version: 1,
  by: 'Nadia Okonjo',
  at: SECONDS - 90,
  fields: ['status'],
  ...over,
})

const NAMES: Record<string, string> = {
  systems: 'Systems',
  timeline: 'the timeline',
  accounts: 'Accounts',
}

/**
 * What has been written to a case, newest first.
 */
const meta = {
  title: 'Blocks/List/Activity feed',
  component: ActivityFeed,
  parameters: { layout: 'padded' },
  args: {
    now: NOW,
    nameFor: (key: string) => NAMES[key] ?? key,
    entries: [],
    className: 'max-w-md pl-10',
  },
} satisfies Meta<typeof ActivityFeed>

export default meta
type Story = StoryObj<typeof meta>

/**
 * An empty feed is one line of prose, not an empty timeline: a rail with no
 * entries on it reads as a feed that failed to load.
 */
export const Empty: Story = {
  name: 'Nothing written yet',
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing has been written to this case yet.')).toBeVisible()
  },
}

/**
 * Every sentence the feed can write, in one feed.
 */
export const EveryWording: Story = {
  name: 'Every sentence the feed can write',
  args: {
    entries: [
      entry({ seq: 12, at: SECONDS - 10, op: 'insert', entity: 'timeline', by: 'Tom Reyes' }),
      entry({ seq: 11, at: SECONDS - 300, op: 'insert', entity: 'timeline', by: 'Priya Raman' }),
      entry({ seq: 10, at: SECONDS - 320, op: 'insert', entity: 'timeline', by: 'Priya Raman' }),
      entry({ seq: 9, at: SECONDS - 900, op: 'delete', entity: 'accounts' }),
      entry({ seq: 8, at: SECONDS - 1200, op: 'delete', entity: 'accounts', by: 'Tom Reyes' }),
      entry({ seq: 7, at: SECONDS - 1220, op: 'delete', entity: 'accounts', by: 'Tom Reyes' }),
      entry({ seq: 6, at: SECONDS - 2000, fields: [] }),
      entry({ seq: 5, at: SECONDS - 3000, fields: ['status', 'owner', 'zone'] }),
      entry({
        seq: 4,
        at: SECONDS - 4000,
        fields: ['status', 'owner', 'zone', 'tier', 'site'],
        by: 'Priya Raman',
      }),
    ],
  },
  play: async ({ canvas }) => {
    for (const sentence of [
      'added to the timeline',
      'added 2 to the timeline',
      'removed from Accounts',
      'removed 2 from Accounts',
      'changed Systems',
      'changed status, owner, zone in Systems',
      'changed 5 fields in Systems',
    ]) {
      await expect(canvas.getByText(sentence, { exact: false })).toBeVisible()
    }
  },
}

/**
 * Four writes inside a minute become one entry, and the fields merge rather
 * than the last one winning.
 */
export const GroupedWrites: Story = {
  name: 'Four writes within a minute \u2014 one entry',
  args: {
    entries: [
      entry({ seq: 4, at: SECONDS - 30, fields: ['status'] }),
      entry({ seq: 3, at: SECONDS - 45, fields: ['owner'] }),
      entry({ seq: 2, at: SECONDS - 60, fields: ['zone'] }),
      entry({ seq: 1, at: SECONDS - 80, fields: ['status'] }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('changed status, owner, zone in Systems', { exact: false }),
    ).toBeVisible()
    // One entry, not four: the rail carries a single dot.
    await expect(canvas.getAllByText(/changed/)).toHaveLength(1)
  },
}

/**
 * The same analyst, the same field, too far apart to group.
 */
export const NotGrouped: Story = {
  name: 'The same fields, too far apart to group',
  args: {
    entries: [
      entry({ seq: 2, at: SECONDS - 30, fields: ['status'] }),
      entry({ seq: 1, at: SECONDS - 600, fields: ['status'] }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('changed status in Systems', { exact: false })).toHaveLength(2)
  },
}

/**
 * A feed as long as a busy case makes it.
 */
export const TooMuchData: Story = {
  name: 'Three hundred writes',
  args: {
    entries: Array.from({ length: 300 }, (_, i) =>
      entry({
        seq: 300 - i,
        // Far enough apart that nothing groups, so 300 writes are 300 entries.
        at: SECONDS - i * 3600,
        by: `Analyst ${String(i % 9)}`,
        fields: ['status'],
      }),
    ),
  },
  play: async ({ canvas }) => {
    const said = canvas.getAllByText(/changed status in Systems/)
    await expect(said.length).toBeGreaterThan(100)

    // The rows keep one height between them: the tenth and the hundredth sit
    // the same distance apart as the first and the second.
    const top = said.slice(0, 3).map((el) => el.getBoundingClientRect().top)
    const deep = said.slice(100, 103).map((el) => el.getBoundingClientRect().top)
    await expect(deep[1]! - deep[0]!).toBeCloseTo(top[1]! - top[0]!, 0)
  },
}
