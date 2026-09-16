/**
 * The demo's whole world: one case document, held in memory.
 *
 * `GET /api/cases/{id}` already answers a case with every collection on it, so
 * the document the server sends is the store the demo writes into and nothing
 * has to be assembled from parts.
 *
 * **A written section's text is not on that document and never can be.** It is
 * a CRDT keyed by the block id, so the words come from the seed the capture was
 * taken from, and the loopback writes them into the report's document.
 * -> `catalogue/report-prose.json`
 */
import type * as Y from 'yjs'

import { writeProse } from '@contract/prose-authoring'

import prose from './catalogue/report-prose.json'

import type { Case } from '@/api/model'
import campaign from '@/fixtures/campaign.json'

export interface DemoState {
  kase: Case
}

/** A report's document, by the address `report-section.tsx` opens it at. */
const REPORT_FIELD = /^reports:([^:]+):document$/

/** The captured text of each written section of one case, by block id. */
function bodiesOf(kase: Case): Record<string, string> {
  const captured = (prose as Record<string, Record<string, string[]> | undefined>)[
    kase.reference ?? ''
  ]
  const found: Record<string, string> = {}
  for (const report of kase.reports) {
    const bodies = captured?.[report.label] ?? []
    for (const block of kase.reportBlocks) {
      const body = block.reportId === report.id ? bodies[block.position] : undefined
      if (body !== undefined && body !== '') found[block.id] = body
    }
  }
  return found
}

/**
 * One report's document, seeded with the sections the capture carries.
 *
 * Called for every field the loopback opens, so one that is not a report's is
 * left alone.
 */
export function seedReportProse(state: DemoState, doc: Y.Doc, field: string): void {
  const reportId = REPORT_FIELD.exec(field)?.[1]
  if (reportId === undefined) return
  const written = bodiesOf(state.kase)
  for (const block of state.kase.reportBlocks) {
    const body = block.reportId === reportId ? written[block.id] : undefined
    if (body !== undefined) writeProse(doc, block.id, body)
  }
}

/**
 * Mark every section the capture holds words for as written.
 *
 * **The server derives `hasProse` per read from the document**, and nothing
 * here reads the CRDT, so the capture is what answers it - a report whose
 * sections hold words counts itself `0 of 3 written` otherwise.
 *
 * **Run over a stored case as well as a fresh one**, since a case written to
 * IndexedDB by an earlier build carries no marks and nothing versions it.
 */
export function markWritten(kase: Case): void {
  const written = bodiesOf(kase)
  for (const block of kase.reportBlocks) {
    if (written[block.id] !== undefined) (block as { hasProse?: boolean }).hasProse = true
  }
}

/**
 * A store nothing has written to yet.
 *
 * Cloned, because the seed is a module-level JSON import shared by every caller
 * and a handler that mutated it would leave the next reset holding the edits.
 *
 * **Not a demo case, here.** The seed carries `isDemo`, and the picker's
 * default pane hides such a case, so a visitor opening the case list found an
 * install with no cases. In this browser the case is the visitor's own: their
 * writes are kept, and only they can reset it.
 */
export function freshState(): DemoState {
  const kase = structuredClone(campaign) as unknown as Case
  markWritten(kase)
  return { kase: { ...kase, isDemo: false } }
}
