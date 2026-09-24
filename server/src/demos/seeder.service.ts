/**
 * Writes the demo cases once, on an install nobody has claimed. Every seeded
 * row carries a null author.
 *
 * Driven by the `seed --demos` one-shot, never by a lifecycle hook: nothing a
 * serving process starts seeds.
 */
import { Injectable, Inject } from '@nestjs/common'
import { defaultCustomer } from '../customers/customers.service.js'
import { count, eq } from 'drizzle-orm'

import { DATABASE, SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withReach, type Executor } from '../db/scope.js'
import { cases, user } from '../db/schema/index.js'
import { DEMO_CASES, type DemoCase } from './catalogue.js'
import { caseCompliance } from '../db/schema/case-compliance.js'
import { DemoContentSeeder } from './content.seeder.js'

/**
 * Write each demo's regulatory record, in the transaction that made the cases.
 *
 * Resolves the declared minute offsets against the case's start. Upserts,
 * because a read through `compliance.service` raises a bare record on demand,
 * so a reseed can meet a row that already exists.
 */
async function fillCompliance(
  tx: Executor,
  ids: Map<string | null, string>,
  startedAt: (demo: DemoCase) => Date,
): Promise<void> {
  for (const demo of DEMO_CASES) {
    const caseId = ids.get(demo.reference)
    if (!caseId || !demo.compliance) continue

    const base = startedAt(demo).getTime()
    const at = (minutes: number | undefined): Date | undefined =>
      minutes === undefined ? undefined : new Date(base + minutes * 60_000)

    const values = {
      caseId,
      ...demo.compliance,
      ...(at(demo.complianceMinutes?.gdprAwareAt) && {
        gdprAwareAt: at(demo.complianceMinutes?.gdprAwareAt),
      }),
      ...(at(demo.complianceMinutes?.gdprAuthorityNotifiedAt) && {
        gdprAuthorityNotifiedAt: at(demo.complianceMinutes?.gdprAuthorityNotifiedAt),
      }),
      ...(at(demo.complianceMinutes?.gdprSubjectsNotifiedAt) && {
        gdprSubjectsNotifiedAt: at(demo.complianceMinutes?.gdprSubjectsNotifiedAt),
      }),
    }

    await tx
      .insert(caseCompliance)
      .values(values as never)
      .onConflictDoUpdate({ target: caseCompliance.caseId, set: values })
  }
}

@Injectable()
export class DemoSeederService {
  /**
   * **Two handles, because reading demo cases and writing them are not the
   * same privilege.** `seedOnce` writes across every case, which is the seed
   * role's job. `cards` only reads, and `cases` carries no
   * row-level security -- `CasesService.list` reads the same table through
   * `DATABASE` for `GET /api/cases`. Read it through the seed role and
   * `/api/demos` answers `[]` on any install whose seeding ran somewhere the
   * serving process cannot see, which a Job is.
   */
  constructor(
    @Inject(DATABASE) private readonly reads: Database,
    @Inject(SEED_DATABASE) private readonly db: Database | null,
    private readonly content: DemoContentSeeder,
  ) {}

  /**
   * The demo cards: each seeded case's id joined to the catalogue metadata -
   * `scenario`, `scale`, `glyph` - which describes the showcase entry and is
   * not stored on the case.
   */
  async cards(): Promise<(DemoCase & { id: string })[]> {
    const rows = await withReach(this.reads, (tx) =>
      tx
        .select({ id: cases.id, reference: cases.reference })
        .from(cases)
        .where(eq(cases.isDemo, true)),
    )

    const byReference = new Map(rows.map((row) => [row.reference, row.id]))
    return DEMO_CASES.flatMap((demo) => {
      const id = byReference.get(demo.reference)
      // A demo defined but not seeded is a bug, not a card to draw half of.
      return id ? [{ ...demo, id }] : []
    })
  }

  /**
   * Writes the catalogue when the install has no account and no demo case,
   * and nothing otherwise. Returns how many cases it wrote.
   */
  async seedOnce(): Promise<number> {
    if (!this.db) throw new Error(seedRoleMissing('the demo cases'))
    return this.db.transaction(async (tx) => {
      const [accounts] = await tx.select({ n: count() }).from(user)
      const [demos] = await tx.select({ n: count() }).from(cases).where(eq(cases.isDemo, true))
      if ((accounts?.n ?? 0) > 0 || (demos?.n ?? 0) > 0) return 0
      return writeCatalogue(tx, this.content)
    })
  }
}

/** Writes every demo case with its content and regulatory record, inside `tx`. */
export async function writeCatalogue(tx: Executor, content: DemoContentSeeder): Promise<number> {
  /**
   * **A demo case is opened under a customer like any other.** This writes
   * the row itself rather than going through `CasesService.create`, so
   * without this every demo lands carrying no customer -- in a group the
   * application treats as the default's but the index keys separately, and
   * a demo reference then collides with nothing and is collided with by
   * nothing.
   */
  const openedUnder = (await defaultCustomer(tx)).id
  const rows = await tx
    .insert(cases)
    .values(
      // **Mapped field by field, not spread.** A demo carries card
      // metadata that is not case data - `scenario`, `scale`, `glyph` -
      // and spreading it would either fail on an unknown column or, worse,
      // quietly define what a case is by what a demo happens to hold.
      DEMO_CASES.map((demo) => ({
        reference: demo.reference,
        customerId: openedUnder,
        customer: demo.customer,
        title: demo.title,
        summary: demo.summary,
        isDemo: true,
      })),
    )
    .returning({ id: cases.id, reference: cases.reference })

  const ids = new Map(rows.map((row) => [row.reference, row.id]))

  /**
   * **Each demo starts `startedDaysAgo` back, not at this instant.**
   * `content.ts` says a demo reads as an incident from this week, and a
   * case beginning now runs *forward*: its entries land in the future and
   * no statutory clock can ever have run out.
   */
  const startedAt = (demo: DemoCase): Date =>
    new Date(Date.now() - demo.startedDaysAgo * 24 * 60 * 60_000)

  // **Filled inside the same transaction as the cases.** A demo that existed
  // with no content, however briefly, is one an analyst could open and find
  // empty.
  const byReference = new Map(DEMO_CASES.map((demo) => [demo.reference, demo]))
  await content.fillAll(tx, ids, (reference) => {
    const demo = byReference.get(reference)
    return demo ? startedAt(demo) : new Date()
  })

  await fillCompliance(tx, ids, startedAt)
  return rows.length
}
