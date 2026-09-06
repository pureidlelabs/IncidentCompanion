/**
 * Send the demo reports that declare a send stamp, once the demos are seeded.
 * The seeder cannot: a send freezes a rendered document, and `demos` may not
 * reach `report`.
 *
 * **The freeze is real; only the stamp is fiction.** Each document is rendered
 * and stored exactly as an analyst's send would, then `sentAt`/`frozenAt` are
 * moved back to the offset the demo declares - on the demo rows only.
 *
 * **A failure is logged and never thrown**, so a report this build cannot draw
 * leaves a draft rather than taking the boot down with it.
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { cases } from '../db/schema/case.js'
import { reports } from '../db/schema/report.js'
import { DEMO_REPORTS } from '../demos/reports.js'

import { ReportLifecycleService } from '../report/lifecycle.service.js'

@Injectable()
export class DemoReportSender {
  private readonly log = new Logger(DemoReportSender.name)

  constructor(
    @Inject(SEED_DATABASE) private readonly db: Database | null,
    private readonly lifecycle: ReportLifecycleService,
  ) {}

  /**
   * Call after the demo cases are seeded - `seed.ts` declares that order. A
   * report whose case is not there yet is skipped silently, exactly as one
   * already sent is.
   */
  async fileDeclared(): Promise<void> {
    if (!this.db) throw new Error(seedRoleMissing('the demo reports'))
    let sent = 0
    for (const [reference, listed] of Object.entries(DEMO_REPORTS)) {
      for (const declared of listed) {
        if (declared.sentAtMinute === undefined) continue
        if (await this.send(reference, declared.label, declared.sentAtMinute)) sent += 1
      }
    }
    if (sent > 0) this.log.log(`Demo reports filed: ${String(sent)}`)
  }

  private async send(reference: string, label: string, atMinute: number): Promise<boolean> {
    if (!this.db) throw new Error(seedRoleMissing('the demo reports'))
    const [row] = await this.db
      .select({ id: reports.id, caseId: reports.caseId, openedAt: cases.openedAt })
      .from(reports)
      .innerJoin(cases, eq(cases.id, reports.caseId))
      .where(and(eq(cases.reference, reference), eq(reports.label, label), isNull(reports.sentAt)))

    // Absent is the ordinary case on a second boot: the report is already sent.
    if (!row) return false

    try {
      // **Unattributed.** A demo has no analyst, and an invented id in
      // `updated_by` violates its foreign key to `user` -- after the render
      // has already succeeded, so every report is left a draft.
      await this.lifecycle.send(row.caseId, row.id, null, undefined)
    } catch (error) {
      this.log.warn(`${reference}/${label}: left a draft, ${String(error)}`)
      return false
    }

    const stamp = new Date(row.openedAt.getTime() + atMinute * 60_000)
    await this.db
      .update(reports)
      .set({ sentAt: stamp, frozenAt: stamp })
      .where(eq(reports.id, row.id))
    return true
  }
}
