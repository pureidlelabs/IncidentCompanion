import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { Section } from '@/components/blocks/section'
import { EmptyState } from '@/components/blocks/empty-state'
import { FormSection } from '@/components/blocks/form-section'
import { TablePager } from '@/components/ui/table-pager'
import { TableToolbar } from '@/components/blocks/table-toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/table'
import { TextField } from '@/components/ui/text-field'
import { campaignCase } from '@/fixtures/campaign'

const SYSTEMS = campaignCase.systems
const PAGE = 24

const LONG_TITLE =
  'Systems, servers and appliances the intrusion is known to have touched in this case'

/** The section head's controls, the same on every table screen. */
const addSystem = (
  <Button size="sm">
    <Plus aria-hidden />
    Add system
  </Button>
)

/** A page of the fixture's 30 systems, as a kit table. */
function SystemsTable({ rows }: { rows: typeof SYSTEMS }) {
  return (
    <Table aria-label="Systems">
      <TableHeader>
        <Column id="host" isRowHeader>
          Hostname
        </Column>
        <Column id="type">Type</Column>
        <Column id="zone">Zone</Column>
        <Column id="verdict">Verdict</Column>
        <Column id="analyst">Analyst</Column>
      </TableHeader>
      <TableBody items={rows}>
        {(row) => (
          <Row id={row.id}>
            <Cell>{row.hostname}</Cell>
            <Cell>{row.systemType}</Cell>
            <Cell>{row.zone}</Cell>
            <Cell>
              <Badge variant="soft" size="xs">
                {row.verdict}
              </Badge>
            </Cell>
            <Cell>{row.analyst}</Cell>
          </Row>
        )}
      </TableBody>
    </Table>
  )
}

/** The toolbar and the pager, both driving the same page of rows. */
function SystemsSection({ fills }: { fills: boolean }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const narrowed = query !== ''
  const matched = SYSTEMS.filter((row) =>
    row.hostname.toLowerCase().includes(query.toLowerCase()),
  )
  const rows = matched.slice((page - 1) * PAGE, page * PAGE)

  return (
    <Section
      title="Systems"
      meta={
        <Badge variant="soft" size="xs">
          {matched.length} of {SYSTEMS.length}
        </Badge>
      }
      blurb="Hosts, servers and appliances touched by this incident."
      actions={addSystem}
      fills={fills}
      toolbar={
        <TableToolbar
          searchColumn="Hostname"
          placeholder="Search hostnames&#x2026;"
          value={query}
          onValue={(next) => {
            setQuery(next)
            setPage(1)
          }}
          narrowed={narrowed}
          onClear={() => {
            setQuery('')
            setPage(1)
          }}
        />
      }
      footer={
        <TablePager
          pageNumber={page}
          firstRow={1}
          showing={rows.length}
          total={matched.length}
          hasPrevious={page > 1}
          hasNext={page * PAGE < matched.length}
          onPrevious={() => {
            setPage((was) => was - 1)
          }}
          onNext={() => {
            setPage((was) => was + 1)
          }}
        />
      }
    >
      <SystemsTable rows={rows} />
    </Section>
  )
}

/**
 * A case section inside the shell's pane: head, toolbar, body, footer.
 */
const meta = {
  title: 'Blocks/Layout/Section',
  component: Section,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // A scrollport with padding owes `--sticky-top` to whatever sticks to
      // it, exactly as the shell's pane does: without it a column head pins at
      // the padding edge and the rows scroll through the 20px above it.
      <div className="flex h-dvh flex-col overflow-y-auto bg-background px-6 py-5 [--sticky-top:-1.25rem] [scrollbar-gutter:stable]">
        <Story />
      </div>
    ),
  ],
  args: { title: 'Systems', children: null },
} satisfies Meta<typeof Section>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: the body grows and the pane scrolls it.
 */
export const Grows: Story = {
  name: 'The body grows, the pane scrolls',
  render: () => <SystemsSection fills={false} />,
  /**
   * The default gives the body no scroller of its own, and the section is
   * taller than the pane so the pane is what scrolls.
   */
  play: async ({ canvasElement }) => {
    const body = canvasElement.querySelector('[data-slot="section-body"]')!
    const section = canvasElement.querySelector('[data-slot="section"]')!
    const pane = canvasElement.firstElementChild!
    await expect(getComputedStyle(body).overflowY).toBe('visible')
    await expect(section.getBoundingClientRect().height).toBeGreaterThan(pane.clientHeight)
    await expect(pane.scrollHeight).toBeGreaterThan(pane.clientHeight)
  },
}

/**
 * `fills`: the section takes the pane's height, the table scrolls inside it and
 * the pager stays put.
 */
export const Fills: Story = {
  name: 'A scrolling body against a pinned footer',
  render: () => <SystemsSection fills />,
  /**
   * The scroller lands on the body, not on the section.
   */
  play: async ({ canvasElement }) => {
    const body = canvasElement.querySelector('[data-slot="section-body"]')!
    const section = canvasElement.querySelector('[data-slot="section"]')!
    const pane = canvasElement.firstElementChild!
    await expect(getComputedStyle(body).overflowY).toBe('auto')
    await expect(getComputedStyle(section).overflowY).toBe('visible')
    // The gutter is reserved, so paging to a short page does not jolt the
    // table sideways by the scrollbar's width.
    await expect(getComputedStyle(body).scrollbarGutter).toBe('stable')
    // The rows overflow the body, so the body is what has somewhere to scroll.
    await expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
    // And the section fits the pane, so neither it nor the pane scrolls.
    await expect(section.scrollHeight).toBe(section.clientHeight)
    await expect(pane.scrollHeight).toBe(pane.clientHeight)

    // The footer stays put while the rows move, which is the whole point.
    const footer = section.lastElementChild!
    const before = footer.getBoundingClientRect().top
    body.scrollTop = body.scrollHeight
    await expect(body.scrollTop).toBeGreaterThan(0)
    await expect(footer.getBoundingClientRect().top).toBe(before)
  },
}

/** `measure: 'form'` holds the body to a reading measure rather than the pane's width. */
export const FormMeasure: Story = {
  name: 'A form screen, held to a measure',
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('[data-slot="section"]')!
    // `--content-max: 72rem` in `styles/tokens.css`.
    await expect(getComputedStyle(section).maxWidth).toBe('1152px')
  },
  render: () => (
    <Section
      title="Overview"
      blurb="What this case is, and what it is being judged against."
      measure="form"
      footer={
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm">
            Discard
          </Button>
          <Button size="sm">Save</Button>
        </div>
      }
    >
      <FormSection title="Identification" layout="plain">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* `reference`, `customer` and the three classifications are
              `string | null` on `Case`, so the `??` on those is the type
              talking. `title`, `analyst` and `detectionSource` are plain
              strings and carry none. */}
          <TextField label="Reference" defaultValue={campaignCase.reference ?? ''} />
          <TextField label="Customer" defaultValue={campaignCase.customer ?? ''} />
          <TextField label="Title" defaultValue={campaignCase.title} />
          <TextField label="Analyst" defaultValue={campaignCase.analyst} />
        </div>
      </FormSection>
      <FormSection title="Classification" layout="plain">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Incident class" defaultValue={campaignCase.incidentClass ?? ''} />
          <TextField label="RSIT class" defaultValue={campaignCase.rsitClass ?? ''} />
          <TextField label="Severity" defaultValue={campaignCase.severity ?? ''} />
          <TextField label="Detection source" defaultValue={campaignCase.detectionSource} />
        </div>
      </FormSection>
    </Section>
  ),
}

/**
 * The same form at `measure: 'full'`, which is the default.
 */
export const FullMeasure: Story = {
  name: 'The same form, at the pane width',
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('[data-slot="section"]')!
    await expect(getComputedStyle(section).maxWidth).toBe('none')
  },
  render: () => (
    <Section
      title="Overview"
      blurb="What this case is, and what it is being judged against."
      measure="full"
      footer={
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm">
            Discard
          </Button>
          <Button size="sm">Save</Button>
        </div>
      }
    >
      <FormSection title="Identification" layout="plain">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Reference" defaultValue={campaignCase.reference ?? ''} />
          <TextField label="Customer" defaultValue={campaignCase.customer ?? ''} />
          <TextField label="Title" defaultValue={campaignCase.title} />
          <TextField label="Analyst" defaultValue={campaignCase.analyst} />
        </div>
      </FormSection>
      <FormSection title="Classification" layout="plain">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Incident class" defaultValue={campaignCase.incidentClass ?? ''} />
          <TextField label="RSIT class" defaultValue={campaignCase.rsitClass ?? ''} />
          <TextField label="Severity" defaultValue={campaignCase.severity ?? ''} />
          <TextField label="Detection source" defaultValue={campaignCase.detectionSource} />
        </div>
      </FormSection>
    </Section>
  ),
}

/** A title longer than the pane, against the controls it shares the row with. */

export const OverlongTitle: Story = {
  name: 'A title longer than the pane',
  render: () => (
    <Section
      title={LONG_TITLE}
      meta={
        <Badge variant="soft" size="xs">
          {SYSTEMS.length}
        </Badge>
      }
      blurb="The head wraps inside its own column, so the controls stay on the first line rather than being pushed off the row."
      actions={addSystem}
    >
      <SystemsTable rows={SYSTEMS.slice(0, 4)} />
    </Section>
  ),
}

/**
 * The case has not arrived yet.
 */
export const Reading: Story = {
  name: 'The read is still running',
  render: () => (
    <Section
      title="Evidence"
      blurb="What was collected, and where it is held."
      actions={addSystem}
      read={{ isPending: true, isError: false }}
    >
      <p>Never drawn: the boundary holds the body back.</p>
    </Section>
  ),
}

/**
 * The read failed, and the section says so where its rows would be.
 */
export const ReadRefused: Story = {
  name: 'The read failed',
  render: () => (
    <Section
      title="Evidence"
      blurb="What was collected, and where it is held."
      actions={addSystem}
      read={{
        isPending: false,
        isError: true,
        error: new Error('The case could not be read.'),
        refetch: () => undefined,
      }}
    >
      <p>Never drawn: the boundary holds the body back.</p>
    </Section>
  ),
}

/**
 * The read succeeded and the section holds nothing.
 */
export const Empty: Story = {
  name: 'An empty body',
  play: async ({ canvas, step }) => {
    await step('the empty state names what would fill the section', async () => {
      await expect(canvas.getByText('Nothing collected yet')).toBeVisible()
      await expect(canvas.getByRole('button', { name: 'Add evidence' })).toBeVisible()
    })
    await step('and the head keeps its own door', async () => {
      await expect(canvas.getByRole('button', { name: 'Add system' })).toBeVisible()
    })
  },
  render: () => (
    <Section
      title="Evidence"
      blurb="What was collected, and where it is held."
      actions={addSystem}
    >
      <EmptyState
        title="Nothing collected yet"
        detail="Evidence added here is what the report cites."
        offers={[
          { label: 'Add evidence', onSelect: () => undefined },
          { label: 'Import from CSV', hint: 'One row per artefact', onSelect: () => undefined },
        ]}
      />
    </Section>
  ),
}
