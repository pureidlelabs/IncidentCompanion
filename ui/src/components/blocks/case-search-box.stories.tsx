import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { campaignCase } from '@/fixtures/campaign'

import { CaseSearchBox } from './case-search-box'

/**
 * The header's command bar: a field, and the palette's grouped rows under it.
 *
 * The same three sources `Mod+K` opens over - the commands, the sections and
 * the case's own hits - so both surfaces answer a query the same way. The list
 * is non-modal, so the caret stays in the field while the arrow keys walk the
 * rows.
 */
const meta = {
  title: 'Blocks/App shell/Case search box',
  component: CaseSearchBox,
  parameters: { layout: 'padded' },
  args: { kase: campaignCase, query: '', onQueryChange: () => undefined },
} satisfies Meta<typeof CaseSearchBox>

export default meta
type Story = StoryObj<typeof meta>

/** Controlled from outside, the way the container drives it. */
function Typing({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial)
  return <CaseSearchBox kase={campaignCase} query={query} onQueryChange={setQuery} />
}

/** The box before anything is typed, which is all the header ever shows. */
export const Empty: Story = { name: 'Nothing typed' }

/** A hostname typed, which reaches the commands and the case's rows at once. */
export const Typed: Story = {
  name: 'A hostname typed',
  render: () => <Typing initial="dc-01" />,
}
