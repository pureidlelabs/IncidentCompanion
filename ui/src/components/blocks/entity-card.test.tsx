import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { SystemEntry } from '@/api/model'
import { keys } from '@/api/queryKeys'
import { ReferenceCell } from '@/components/blocks/data-cell'
import { DataTable } from '@/components/blocks/data-table'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { EntityLink, MISSING_REFERENCE } from '@/components/blocks/entity-link'
import { useEntityTable, type EntityColumn } from '@/components/blocks/entity-table'
import { specsFixture } from '@/fixtures/specs'

/**
 * The React Aria entity link, held to the scope it reads.
 *
 * **The twin's context is its own object, and nothing was checking which one
 * fed it.** `entity-card.tsx` and `entity-card.tsx` each call
 * `createContext`, so a provider from one tier is invisible to a consumer of
 * the other, and `CaseLayout` mounts only the legacy one. The failure is
 * silent and total: `useEntityCardScope` returns null, `path` is undefined,
 * and every entity name renders as a `<span>` -- no navigation, no card, no
 * `?highlight=`. Both halves typecheck, and both stories look right, because
 * `entity-card.stories.tsx` mounts its own provider.
 *
 * The legacy direction was covered and this one was not, so the tier read as
 * covered while half of it was untested. **Every assertion here mounts the
 * aria provider and asserts the anchor**, which is the half that turns into a
 * span the moment the two contexts disagree.
 *
 * **What this file cannot see: the card opening.** React Aria's
 * `PreviewTrigger` publishes its trigger props through the kit's own context,
 * and `entity-link.tsx` renders a react-router `<Link>`, which consumes
 * none of them -- measured, the anchor takes focus and no card follows, under
 * hover and under `Tab` alike. The kit's own `Link` does open one, which is
 * what the stories use. That gap is a product question rather than a harness
 * one, and moving the link onto the kit changes what navigation costs while no
 * React Aria `RouterProvider` is mounted, so it is not settled here.
 */

const CASE_ID = 'DEMO-CAMPAIGN'
const SECTION = `/cases/${CASE_ID}/assets`

const SYSTEMS: SystemEntry[] = [
  { id: 'sys-1', version: 1, hostname: 'WKS-FIN01', systemType: 'desktop', verdict: 'compromised', zone: 'internal', analyst: 'p.zero', analysisStatus: 'in progress', isolated: true, isolatedAt: null, source: 'manual', methodId: null, tags: '' },
]

/** Seeded rather than stubbed, so no refetch fires into a jsdom with no fetch. */
function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(keys.specs(), specsFixture)
  client.setQueryData(keys.collection(CASE_ID, 'systems'), SYSTEMS)
  client.setQueryData(keys.collection(CASE_ID, 'timeline'), [])
  return client
}

/** Where the router is, so a navigation is observable. */
function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname + location.search}</span>
}

function mount(children: ReactNode, { scoped = true }: { scoped?: boolean } = {}) {
  const inner = (
    <>
      {children}
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>
  )
  render(
    <QueryClientProvider client={seededClient()}>
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/timeline`]}>
        {scoped ? <EntityCardProvider caseId={CASE_ID}>{inner}</EntityCardProvider> : inner}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

interface Finding {
  id: string
  systemId: string
}

/** The aria reference cell, in the aria table, which is where a screen puts it. */
function FindingTable() {
  const columns: EntityColumn<Finding>[] = [
    {
      id: 'systemId',
      accessorKey: 'systemId',
      header: 'System',
      cell: ({ row, table }) => (
        <ReferenceCell
          row={row}
          table={table}
          field="systemId"
          label="System"
          target="system"
          options={new Map(SYSTEMS.map((system) => [system.id, system.hostname]))}
        />
      ),
    },
  ]
  const table = useEntityTable<Finding>({
    data: [{ id: 'f0', systemId: 'sys-1' }],
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })
  return <DataTable table={table} label="Findings" />
}

function entityLinkFor(id: string) {
  const link = document.querySelector(`[data-slot="entity-link"][data-entity-id="${id}"]`)
  expect(link).not.toBeNull()
  return link as HTMLElement
}

describe('the aria link reads the aria scope', () => {
  /**
   * The assertion the mismatched-context defect cannot survive. A consumer
   * bound to the other tier's context sees no scope, so `sectionPathFor` is
   * never reached and the anchor is a span.
   */
  it('renders the name as a link to the target s section, carrying the id', () => {
    mount(<EntityLink entity={{ id: 'sys-1', target: 'system', name: 'WKS-FIN01' }} />)
    const link = entityLinkFor('sys-1')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', `${SECTION}?highlight=sys-1`)
  })

  it('makes the reference cell s name a link on the same scope', () => {
    mount(<FindingTable />)
    const link = entityLinkFor('sys-1')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', `${SECTION}?highlight=sys-1`)
  })

  it('navigates to the section, carrying the id for the table to locate', async () => {
    mount(<EntityLink entity={{ id: 'sys-1', target: 'system', name: 'WKS-FIN01' }} />)
    await userEvent.click(entityLinkFor('sys-1'))
    expect(screen.getByTestId('where')).toHaveTextContent(`${SECTION}?highlight=sys-1`)
  })

  /** A deleted row still navigates: the section is where an analyst finds out. */
  it('still links a dangling id, under the missing name', () => {
    mount(<EntityLink entity={{ id: 'deleted-row', target: 'system', name: '' }} />)
    const link = entityLinkFor('deleted-row')
    expect(link.tagName).toBe('A')
    expect(link).toHaveTextContent(MISSING_REFERENCE)
    expect(link).toHaveAttribute('href', `${SECTION}?highlight=deleted-row`)
  })

  it('keeps the identity the graph cross-highlight attaches to', () => {
    mount(<EntityLink entity={{ id: 'sys-1', target: 'system', name: 'WKS-FIN01' }} />)
    expect(entityLinkFor('sys-1')).toHaveAttribute('data-entity-target', 'system')
  })
})

describe('with no aria provider above it', () => {
  it('renders the resolved name as plain text and reaches for nothing', () => {
    mount(<EntityLink entity={{ id: 'sys-1', target: 'system', name: 'WKS-FIN01' }} />, {
      scoped: false,
    })
    expect(screen.getByText('WKS-FIN01')).toBeInTheDocument()
    expect(entityLinkFor('sys-1').tagName).toBe('SPAN')
    expect(document.querySelector('[data-slot="entity-card"]')).toBeNull()
  })
})
