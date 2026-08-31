import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, userEvent, within } from 'storybook/test'

import type { SystemEntry } from '@/api/model'
import { keys } from '@/api/queryKeys'
import { formSpec } from '@/api/specs'
import { ImportCsvControl } from '@/components/blocks/import-csv-control'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

const form = formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS')

/**
 * A route and a seeded collections answer, which the control reads its gate
 * from. `batchCreate` of `undefined` stands for the fetch still being in
 * flight.
 */
function Ground({ batchCreate, children }: { batchCreate?: boolean; children: ReactNode }) {
  const [client] = useState(() => {
    const made = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    if (batchCreate !== undefined) {
      made.setQueryData(keys.collections(), { systems: { fields: [], batchCreate } })
    }
    return made
  })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cases/demo']}>
        <Routes>
          <Route path="/cases/:caseId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/**
 * `ImportCsvControl` on the React Aria kit: the toolbar button, the dialog it
 * opens, and the two answers that draw nothing at all.
 */
const meta = {
  title: 'Blocks/Table/Import CSV control',
  component: ImportCsvControl,
  parameters: { layout: 'padded' },
  args: {
    collection: 'systems',
    form,
    entries: campaignCase.systems,
    caseId: campaignCase.id,
  },
} satisfies Meta<typeof ImportCsvControl<'systems', SystemEntry>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The door, drawn only where the collection will take a batch write.
 *
 * Whether it appears is the served schema's answer, not the screen's: a
 * control offering an import the server would refuse is worse than no control.
 */
export const Offered: Story = {
  name: 'The collection takes a batch write',
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Import CSV' }),
    ).toBeVisible()
  },
  render: (args) => (
    <Ground batchCreate>
      <ImportCsvControl {...args} />
    </Ground>
  ),
}

/**
 * The schema has not arrived, so nothing is drawn.
 *
 * **Identical on the page to the refusal below**, and the two differ only in
 * why: one has not been told yet and the other has been told no. Drawing the
 * door optimistically would offer an import that may be refused a moment
 * later.
 */
export const Pending: Story = {
  name: 'Collections still in flight \u2014 nothing drawn',
  render: (args) => (
    <Ground>
      <ImportCsvControl {...args} />
    </Ground>
  ),
  // Blank, and identical to the refusal below on the page. The two differ in
  // why nothing is drawn, which only an assertion can carry.
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Import CSV' })).toBeNull()
  },
}

/**
 * The collection takes no batch write, so there is no door at all.
 *
 * Not a disabled one: a control that can never work is not a control, and a
 * greyed import invites somebody to look for the permission that would open
 * it.
 */
export const NoBatchDoor: Story = {
  name: 'The collection refuses batch writes \u2014 nothing drawn',
  render: (args) => (
    <Ground batchCreate={false}>
      <ImportCsvControl {...args} />
    </Ground>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Import CSV' })).toBeNull()
  },
}

/**
 * Pressed, before a file is chosen: the dialog is the block's, raised from its
 * own control.
 *
 * The door and what it opens travel together, so a screen adding an import
 * gets both or neither.
 */
export const DialogOpen: Story = {
  name: 'Pressed \u2014 the import dialog, before a file is chosen',
  render: (args) => (
    <Ground batchCreate>
      <ImportCsvControl {...args} />
    </Ground>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Import CSV' }))
  },
}
