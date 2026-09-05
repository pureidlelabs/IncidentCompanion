/**
 * The case's regulatory record: one row per case, read and written on its own.
 */
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { eq } from 'drizzle-orm'

import { CaseChannel } from '../live/case-channel.service.js'
import { InstallPreferencesService } from '../preferences/install.service.js'
import { complianceBreakdown, type Verdict } from './verdict.js'
import type { Policy } from '../domain/compliance-policy.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { updateVersioned, type WriteResult } from '../db/mutate.js'
import { withCase } from '../db/scope.js'
import { caseCompliance } from '../db/schema/case-compliance.js'
import { cases } from '../db/schema/case.js'
import { customers } from '../db/schema/customer.js'
import {
  ORGANISATION_FACTS,
  factsOf,
  factsThatMoved,
  sameAnswer,
} from '../customers/organisation-facts.js'

export type ComplianceRow = typeof caseCompliance.$inferSelect

/**
 * Whether a database error is "the row you referenced is not there" - Postgres
 * `23503`, matched on the code and looked for down the `cause` chain, since
 * Drizzle wraps the driver's error.
 */
function isMissingParent(error: unknown): boolean {
  for (let at = error, hops = 0; at && hops < 5; at = (at as { cause?: unknown }).cause, hops++) {
    if ((at as { code?: unknown }).code === '23503') return true
  }
  return false
}

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly settings: InstallPreferencesService,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  /**
   * The per-article determination for one case.
   */
  async verdict(caseId: string): Promise<Verdict[]> {
    const row = await this.read(caseId)
    const held = await this.settings.all()
    const master = held['compliance.enabled'] === true
    const enabled = Object.fromEntries(
      (['nis2', 'gdpr', 'dora'] as const).map((key) => [
        key,
        master && held[`compliance.regime.${key}`] === true,
      ]),
    )
    const policy: Policy = {
      authorityFloor: held['compliance.gdpr.authorityFloor'] as string,
      subjectsFloor: held['compliance.gdpr.subjectsFloor'] as string,
    }
    return complianceBreakdown(row, enabled, policy)
  }

  /**
   * The record, raised on first read if it is not there yet - a read that
   * writes, deliberately, and the row it inserts is entirely defaults.
   */
  async read(caseId: string): Promise<ComplianceRow> {
    const row = await this.load(caseId)
    if (row) return row

    try {
      // **The copy is taken here because this is where the row is raised.**
      // A case reads the customer's facts once, at this moment, and never
      // again: a report written months ago has to say what was true when it
      // was written. -> `customers/organisation-facts.ts`
      const copied = await this.customerFacts(caseId)
      await withCase(this.db, caseId, (tx) =>
        tx
          .insert(caseCompliance)
          .values({ caseId, ...copied })
          .onConflictDoNothing(),
      )
    } catch (error) {
      // A case that is not there fails at the insert, not at the read below:
      // `caseId` is a foreign key. Caught rather than pre-checked, which stays
      // correct when the case is deleted between the check and the insert.
      if (!isMissingParent(error)) throw error
      throw new NotFoundException(`No case ${caseId}.`)
    }

    const raised = await this.load(caseId)
    if (!raised) throw new NotFoundException(`No case ${caseId}.`)
    return raised
  }

  /**
   * The customer's organisation facts for this case, or nothing.
   *
   * **Not scoped by `withCase`**, and that is the point of it being separate:
   * `customers` is an install-level table with no `case_id`, so a case-scoped
   * transaction cannot see it. The case is still the only way in - the id is
   * read off the case row, never taken from a caller.
   */
  private async customerFacts(caseId: string): Promise<Record<string, unknown>> {
    const [row] = await this.db
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))
    if (!row?.customerId) return {}

    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, row.customerId))
    return customer ? factsOf(customer) : {}
  }

  /**
   * Which copied facts no longer match the customer they came from.
   */
  async moved(caseId: string): Promise<string[]> {
    const row = await this.read(caseId)
    const [self] = await this.db
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))
    if (!self?.customerId) return []

    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, self.customerId))
    if (!customer) return []

    return factsThatMoved(row, customer)
  }

  /**
   * The organisation facts this case answered itself rather than copied.
   */
  async ownFacts(caseId: string): Promise<string[]> {
    const row = (await this.read(caseId)) as unknown as { ownFacts?: string[] | null }
    return row.ownFacts ?? []
  }

  private async load(caseId: string): Promise<ComplianceRow | undefined> {
    const [row] = await withCase(this.db, caseId, (tx) =>
      tx.select().from(caseCompliance).where(eq(caseCompliance.caseId, caseId)),
    )
    return row
  }

  /**
   * **Announced under `case_compliance`, which is the entity the feed names.**
   */
  async patch(
    caseId: string,
    expectedVersion: number,
    values: Record<string, unknown>,
    actorId: string,
  ): Promise<WriteResult<ComplianceRow>> {
    /**
     * **An organisation fact this write *moves* is the case's own from now on.**
     */
    const before = (await this.read(caseId)) as unknown as Record<string, unknown>
    const answered = Object.keys(values)
      .filter((name) => ORGANISATION_FACTS.includes(name))
      .filter((name) => !sameAnswer(values[name], before[name]))
    const patch = { ...values }
    if (answered.length > 0) {
      const held = await this.ownFacts(caseId)
      patch['ownFacts'] = [...held, ...answered.filter((name) => !held.includes(name))]
    }

    const result = await updateVersioned<ComplianceRow>(this.db, {
      table: caseCompliance,
      entity: 'case_compliance',
      caseId,
      id: caseId,
      keyColumn: 'caseId',
      expectedVersion,
      actorId,
      patch,
    })
    if (result.ok) this.channel?.announce(caseId, ['case_compliance'], actorId)
    return result
  }
}
