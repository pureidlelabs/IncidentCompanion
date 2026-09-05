/**
 * The demo reports that declare a send actually get sent.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { DEMO_REPORTS } from '../demos/reports.js'
import { LibraryService } from '../library/library.service.js'
import { ProseService } from '../prose/prose.service.js'
import { cases } from '../db/schema/case.js'
import { reports } from '../db/schema/report.js'
import { openTestPool } from '../../test/database.js'

import { DemoReportSender } from './sender.service.js'
import { LanguageService } from '../report/language.service.js'
import { ReportLifecycleService } from '../report/lifecycle.service.js'
import { ReportRenderService } from '../report/render.service.js'
import { EvidenceStore } from '../evidence/store.js'

/**
 * A store no test here reads through.
 */
const noFigures = (): EvidenceStore =>
  new EvidenceStore({ get: () => undefined } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** Every demo report that says it was filed, as `{reference, label}`. */
const DECLARED = Object.entries(DEMO_REPORTS).flatMap(([reference, listed]) =>
  listed.filter((one) => one.sentAtMinute !== undefined).map((one) => ({ reference, label: one.label })),
)

describe.skipIf(!db)('filing the demo reports', () => {
  let sender: DemoReportSender

  beforeAll(async () => {
    const library = new LibraryService(db!, seed)
    await library.seedBuiltIns()

    const seeder = new DemoSeederService(seed!, seed, new DemoContentSeeder(seed))
    await seeder.reseed()

    const cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    const prose = new ProseService(db!)
    const languages = new LanguageService(db!, seed)
    const render = new ReportRenderService(db!, cases_, prose, languages, noFigures())
    sender = new DemoReportSender(seed, new ReportLifecycleService(db!, library, render, prose))

    await sender.fileDeclared()
  }, 180_000)

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it('has reports that declare a send, so this is not vacuous', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
  })

  it('files every one of them, rather than leaving it a draft', async () => {
    const unsent: string[] = []
    for (const { reference, label } of DECLARED) {
      const [row] = await seed!
        .select({ sentAt: reports.sentAt, frozen: reports.frozen })
        .from(reports)
        .innerJoin(cases, eq(cases.id, reports.caseId))
        .where(and(eq(cases.reference, reference), eq(reports.label, label)))
      if (!row?.sentAt) unsent.push(`${reference}/${label}`)
    }
    expect(unsent).toEqual([])
  }, 180_000)

  it('freezes a document, so the sent copy is a copy and not a promise', async () => {
    const first = DECLARED[0]!
    const [row] = await seed!
      .select({ frozen: reports.frozen, status: reports.status })
      .from(reports)
      .innerJoin(cases, eq(cases.id, reports.caseId))
      .where(and(eq(cases.reference, first.reference), eq(reports.label, first.label)))

    expect(row?.frozen).toBeTruthy()
    expect(row?.status).toBe('final')
  })

  it('stamps it when the demo says, not when the seeder ran', async () => {
    // `send` stamps now; a demo that says it filed within 72 hours has to have
    // filed then, or the clock strip reads a fiction the case contradicts.
    const first = DECLARED[0]!
    const [row] = await seed!
      .select({ sentAt: reports.sentAt, openedAt: cases.openedAt })
      .from(reports)
      .innerJoin(cases, eq(cases.id, reports.caseId))
      .where(and(eq(cases.reference, first.reference), eq(reports.label, first.label)))

    const declared = DEMO_REPORTS[first.reference]!.find((one) => one.label === first.label)!
    const expected = row!.openedAt.getTime() + declared.sentAtMinute! * 60_000
    expect(row!.sentAt!.getTime()).toBe(expected)
  })
})
