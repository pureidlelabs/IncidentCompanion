import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import type { Attribution } from '@/api/attribution'
import { campaignCase } from '@/fixtures/campaign'

import {
  AttributionProvider,
  DetailGrid,
  Fact,
} from '@/components/blocks/detail-grid'

/**
 * What an expanded row holds that its columns do not show.
 *
 * The facts wrap, so the pane's width decides how many share a line. The
 * `Edited` fact is drawn only where an `AttributionProvider` above the grid
 * holds a stamp for that row.
 */
const malware = campaignCase.malware[0]!
const system = campaignCase.systems[0]!

/** One row's last write, keyed as `stampFor` looks it up. */
const stamped: Attribution = new Map([
  [
    `malware:${malware.id}`,
    { by: 'R. Okonkwo', at: Date.now() / 1000 - 8 * 60, version: 4 },
  ],
])

/** The facts an expanded row holds that its own columns do not show. */
const meta = {
  title: 'Blocks/List/Detail grid',
  component: DetailGrid,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DetailGrid>

export default meta
type Story = StoryObj<typeof meta>

/** Two facts. The grid keeps its column width, so a short panel stays short. */
export const TwoFacts: Story = {
  name: 'A panel of two facts',
  args: {
    children: (
      <>
        <Fact label="Family">{malware.family}</Fact>
        <Fact label="Signature">{malware.signature}</Fact>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Family')).toBeVisible()
    await expect(canvas.getByText(malware.family)).toBeVisible()

    // No provider above this grid, so there is no stamp and no `Edited` fact.
    // A grid that drew it regardless would say "edited by nobody" about every
    // row in the case.
    await expect(canvas.queryByText('Edited')).toBeNull()
  },
}

/** Nine facts, one of them an identifier set in the mono face. */
export const NineFacts: Story = {
  name: 'A panel of nine facts',
  args: {
    children: (
      <>
        <Fact label="Filename">{malware.filename}</Fact>
        <Fact label="Verdict">{malware.verdict}</Fact>
        <Fact label="Family">{malware.family}</Fact>
        <Fact label="Signature">{malware.signature}</Fact>
        <Fact label="Source">{malware.source}</Fact>
        <Fact label="Tags">{malware.tags}</Fact>
        <Fact label="First seen">{malware.firstSeen}</Fact>
        <Fact label="Host">{system.hostname}</Fact>
        <Fact label="SHA-256" mono>
          {malware.hash}
        </Fact>
      </>
    ),
  },
  play: async ({ canvas }) => {
    // Nine, not the handful that fits one line: the grid is `auto-fit`, so
    // the count of columns is decided by the pane rather than by the caller,
    // and every fact has to survive that.
    await expect(canvas.getAllByRole('term')).toHaveLength(9)

    // An identifier is set in the mono face because it is compared character
    // by character, which a proportional face makes harder than it needs.
    const hash = canvas.getByText(malware.hash)
    await expect(getComputedStyle(hash).fontFamily).toMatch(/mono/i)
  },
}

/**
 * With a stamp for this row, the grid draws `Edited` last. Without a provider
 * the fact is absent rather than empty.
 */
export const Edited: Story = {
  name: 'A row somebody has written',
  args: {
    table: 'malware',
    entryId: malware.id,
    children: (
      <>
        <Fact label="Filename">{malware.filename}</Fact>
        <Fact label="Verdict">{malware.verdict}</Fact>
      </>
    ),
  },
  render: (args) => (
    <AttributionProvider value={stamped}>
      <DetailGrid {...args} />
    </AttributionProvider>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Edited')).toBeVisible()
    await expect(canvas.getByText(/R\. Okonkwo/)).toBeVisible()

    // Last, after the facts about the incident: this one is about the copy on
    // screen rather than about the malware, so it reads after the ones that
    // are. Three terms, and it is the third.
    const terms = canvas.getAllByRole('term')
    await expect(terms).toHaveLength(3)
    await expect(terms.at(-1)).toHaveTextContent('Edited')
  },
}

/** The same row under a provider that holds no stamp for it. */
export const NeverWritten: Story = {
  name: 'A row nobody has written',
  args: {
    table: 'systems',
    entryId: system.id,
    children: (
      <>
        <Fact label="Hostname">{system.hostname}</Fact>
        <Fact label="Zone">{system.zone}</Fact>
      </>
    ),
  },
  render: (args) => (
    <AttributionProvider value={stamped}>
      <DetailGrid {...args} />
    </AttributionProvider>
  ),
  play: async ({ canvas }) => {
    // The provider is above this grid and holds a stamp -- for another row.
    // A row nobody has touched is absent from the feed, so the fact is absent
    // rather than drawn with an empty value or a dash.
    await expect(canvas.queryByText('Edited')).toBeNull()
    await expect(canvas.getAllByRole('term')).toHaveLength(2)
  },
}

/** A long value wraps inside its own block rather than widening the column. */
export const ALongValue: Story = {
  name: 'A value longer than its column',
  args: {
    children: (
      <>
        <Fact label="Scopes">
          Mail.Read, Mail.ReadWrite, offline_access, User.Read, Files.ReadWrite.All
        </Fact>
        <Fact label="Consent">user</Fact>
      </>
    ),
  },
  // Held to a single `auto-fit` track. Given the whole pane the value fits on
  // one line and the story shows nothing its name claims.
  render: (args) => (
    <div className="w-[15rem]">
      <DetailGrid {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    // The value wraps inside its own block: taller than the short one beside
    // it, and no wider than the track it sits in. A value that sized its own
    // column instead would be one line high and push the grid past the pane.
    // Neither suite could see this -- a jsdom box is zero on every side.
    const [long, short] = canvas.getAllByRole('definition')
    const wide = long!.getBoundingClientRect()
    const narrow = short!.getBoundingClientRect()
    await expect(wide.height).toBeGreaterThan(narrow.height)
    // The `dl` is the dd's parent, and carries no role of its own to find it by.
    await expect(wide.width).toBeLessThanOrEqual(
      long!.parentElement!.getBoundingClientRect().width,
    )
  },
}
