/**
 * Rebuilds the demo cases by deleting and re-inserting them in one
 * transaction. Every seeded row carries a null author.
 *
 * Driven by the `seed --demos` one-shot, never by a lifecycle hook: nothing a
 * serving process starts reseeds.
 */
import { Injectable, Logger, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'

import { DATABASE, SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { cases } from '../db/schema/index.js'
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
  tx: Database,
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
  private readonly log = new Logger(DemoSeederService.name)

  /**
   * **Two handles, because reading demo cases and rebuilding them are not the
   * same privilege.** `reseed` writes across every case and deletes rows, which
   * is the seed role's job. `cards` only reads, and `cases` carries no
   * row-level security -- `CasesService.list` reads the same table through
   * `DATABASE` for `GET /api/cases`. Reading it through the seed role made
   * `/api/demos` answer `[]` on an install whose seeding ran in a Job, which is
   * the shape this server is now deployed in.
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
    const rows = await this.reads
      .select({ id: cases.id, reference: cases.reference })
      .from(cases)
      .where(eq(cases.isDemo, true))

    const byReference = new Map(rows.map((row) => [row.reference, row.id]))
    return DEMO_CASES.flatMap((demo) => {
      const id = byReference.get(demo.reference)
      // A demo defined but not seeded is a bug, not a card to draw half of.
      return id ? [{ ...demo, id }] : []
    })
  }

  /**
   * The demo rebuild, called by `src/seed.ts` and by a "reset the demos"
   * action. **Destructive by design** -- every demo case is deleted before it
   * is written again, which is exactly why this may not run on boot in a
   * process that has replicas.
   */
  async reseed(): Promise<number> {
    if (!this.db) throw new Error(seedRoleMissing('the demo cases'))
    return this.db.transaction(async (tx) => {
      // The change feed's rows for a demo go with it: they describe writes to
      // a case that no longer exists, and a picker replaying them would show
      // activity on nothing.
      await tx.delete(cases).where(eq(cases.isDemo, true))
      const rows = await tx
        .insert(cases)
        .values(
          // **Mapped field by field, not spread.** A demo carries card
          // metadata that is not case data - `scenario`, `scale`, `glyph` -
          // and spreading it would either fail on an unknown column or, worse,
          // quietly define what a case is by what a demo happens to hold.
          DEMO_CASES.map((demo) => ({
            reference: demo.reference,
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

      // **Filled inside the same transaction as the delete.** A demo that
      // existed with no content, however briefly, is one an analyst could open
      // and find empty - and on two app servers the window is real.
      const byReference = new Map(DEMO_CASES.map((demo) => [demo.reference, demo]))
      await this.content.fillAll(tx as unknown as Database, ids, (reference) => {
        const demo = byReference.get(reference)
        return demo ? startedAt(demo) : new Date()
      })

      await fillCompliance(tx as unknown as Database, ids, startedAt)
      return rows.length
    })
  }
}
