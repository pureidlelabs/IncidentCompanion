/**
 * Prose an analyst wrote into a report is untouched by the case moving.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { CasesService } from '../cases/cases.service.js'
import { ProseService, reportDocument } from '../prose/prose.service.js'
import { ReportRenderService } from './render.service.js'
import { cases, reportBlocks, reports, timeline, user } from '../db/schema/index.js'
import { english } from './document/packs.js'
import { EvidenceStore } from '../evidence/store.js'
import { openTestPool } from '../../test/database.js'

const noFigures = (): EvidenceStore =>
  new EvidenceStore({ get: () => undefined } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

const englishOnly = {
  translatorFor: () => Promise.resolve(english()),
  coverageOf: () => Promise.resolve(1),
} as never

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ACTOR = 'assessment-analyst'
const ASSESSMENT = 'The intrusion was opportunistic, and the exposure is limited to one mailbox.'

let render: ReportRenderService
let prose: ProseService
let caseId = ''
let reportId = ''
let writtenId = ''

/** The whole rendered document as text, which is what a reader ends up with. */
const rendered = async () =>
  JSON.stringify((await render.render(caseId, reportId, 'en')).document_)

describe.skipIf(!db)('prose an analyst wrote into a report', () => {
  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ACTOR,
        name: 'Assessment Analyst',
        email: `${ACTOR}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    const row = await cases_.create({ title: 'A case with an assessment' }, ACTOR)
    caseId = row.id

    await seed!.insert(timeline).values({
      caseId,
      kind: 'event',
      time: new Date('2026-04-01T08:00:00.000Z'),
      description: 'The first thing that happened',
    })

    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label: 'With an assessment', language: 'en', createdBy: ACTOR })
      .returning()
    reportId = report!.id

    await seed!.insert(reportBlocks).values({
      caseId,
      reportId,
      kind: 'timeline',
      heading: '',
      position: 0,
      createdBy: ACTOR,
    })
    const [written] = await seed!
      .insert(reportBlocks)
      .values({
        caseId,
        reportId,
        kind: 'written',
        heading: 'Assessment',
        position: 1,
        createdBy: ACTOR,
      })
      .returning({ id: reportBlocks.id })
    writtenId = written!.id

    prose = new ProseService(db!)
    render = new ReportRenderService(db!, cases_, prose, englishOnly, noFigures())

    /**
     * **One paragraph per line, which is the node shape the editor expects** --
     * `seedNote` in `prose.service.ts` says a bare `Y.XmlText` at the top of a
     * fragment renders as nothing, and a fixture that produced nothing would
     * leave every assertion below true and empty.
     */
    const doc = await prose.open(caseId, reportDocument(reportId))
    const fragment = doc.getXmlFragment(writtenId)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(ASSESSMENT)])
    fragment.insert(0, [paragraph])
  }, 90_000)

  afterAll(async () => {
    await prose.release(caseId, reportDocument(reportId))
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
  })

  it('reaches the report at all, or nothing below is about prose', async () => {
    expect(
      await rendered(),
      'what the analyst wrote is not in the rendered document, so the fixture wrote nowhere',
    ).toContain(ASSESSMENT)
  })

  it('is still there word for word after the case moves, while the timeline is not', async () => {
    const before = await rendered()

    await seed!.insert(timeline).values({
      caseId,
      kind: 'event',
      time: new Date('2026-04-02T09:30:00.000Z'),
      description: 'Something that happened afterwards',
    })

    const after = await rendered()

    // The control: the case genuinely moved, and a case-drawn part shows it.
    expect(before).not.toContain('Something that happened afterwards')
    expect(
      after,
      'the timeline part did not pick up the new entry, so the case did not move under ' +
        'this report and the prose survived nothing',
    ).toContain('Something that happened afterwards')

    expect(
      after,
      'what the analyst wrote changed when the case did, so a written part is not written',
    ).toContain(ASSESSMENT)
  })
})
