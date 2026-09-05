/**
 * That "is this section written in" survives row-level security.
 *
 * **The wrong answer is well-formed, which is why this needs a real database.**
 * The block rows are read inside the case scope and arrive; the reports they
 * belong to were read on the bare handle, where every row is refused. Zero
 * documents produces `hasProse: false` for every block -- indistinguishable
 * from a report nobody has typed into, and green under any fake.
 *
 * Measured against the running server before this file existed: 21 blocks, 0
 * documents, and a rail marking three sections empty with 1,417 characters of
 * their prose on screen beside it.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { cases } from '../db/schema/index.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { openTestPool } from '../../test/database.js'
import { withProseFlags } from './prose-flags.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('whether a block has prose', () => {
  let caseId = ''
  let reportId = ''
  let written = ''
  let untouched = ''

  beforeAll(async () => {
    const [row] = await seed!.insert(cases).values({ title: 'Prose flags' }).returning()
    caseId = row!.id

    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'Customer RCA' })
      .returning()

    const [one] = await seed!
      .insert(reportBlocks)
      .values({ caseId, reportId: report!.id, position: 0, kind: 'written' })
      .returning()
    const [two] = await seed!
      .insert(reportBlocks)
      .values({ caseId, reportId: report!.id, position: 1, kind: 'written' })
      .returning()
    reportId = report!.id
    written = one!.id
    untouched = two!.id

    // The prose is a CRDT keyed by block id, so it is written the way the
    // editor writes it rather than into a column.
    const doc = new Y.Doc({ gc: false })
    const fragment = doc.getXmlFragment(written)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('A macro-enabled phishing email.')])
    fragment.insert(0, [paragraph])

    await seed!
      .update(reports)
      .set({ document: Buffer.from(Y.encodeStateAsUpdate(doc)) })
      .where(eq(reports.id, report!.id))
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
    if (seedPool && seedPool !== pool) await seedPool.end()
  })

  it('is true for the section somebody wrote in', async () => {
    const rows = await withProseFlags(db!, caseId, [
      { id: written, reportId },
    ])
    expect(rows[0]?.['hasProse']).toBe(true)
  })

  it('is false for the section nobody has opened', async () => {
    const rows = await withProseFlags(db!, caseId, [
      { id: untouched, reportId },
    ])
    expect(rows[0]?.['hasProse']).toBe(false)
  })
})
