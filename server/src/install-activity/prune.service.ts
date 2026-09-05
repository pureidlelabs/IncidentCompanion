/**
 * Deletes audit lines that have outlived the install's retention window.
 */
import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { recordInstallActivity } from './record.js'
import { OPERATIONAL_FLOOR_DAYS, RETENTION_FLOOR_DAYS, installActivity } from '../db/schema/install-activity.js'

/**
 * How long lines are kept when the install has said nothing.
 */
export const RETENTION_DEFAULT_DAYS = 365

/** The setting key, in the shape `InstallPreferencesService` stores. */
export const RETENTION_KEY = 'audit.retentionDays'
export const OPERATIONAL_RETENTION_KEY = 'audit.operationalRetentionDays'

/**
 * **Thirty days, and shorter than the audit's year on purpose.**
 */
export const OPERATIONAL_DEFAULT_DAYS = 30

/**
 * Why a proposed retention window was refused, or null when it is allowed.
 */
export function refuseRetention(days: number): string | null {
  if (!Number.isInteger(days)) return 'Give a whole number of days.'
  if (days < RETENTION_FLOOR_DAYS) {
    return (
      `The audit is kept for at least ${String(RETENTION_FLOOR_DAYS)} days. ` +
      'A shorter window would let somebody shorten the setting to drop the ' +
      'evidence of what they did last week.'
    )
  }
  return null
}

/**
 * The same, for the operational window.
 */
export function refuseOperationalRetention(days: number): string | null {
  if (!Number.isInteger(days)) return 'Give a whole number of days.'
  if (days < OPERATIONAL_FLOOR_DAYS) {
    return (
      `Operational lines are kept for at least ${String(OPERATIONAL_FLOOR_DAYS)} days. ` +
      'A shorter window would remove the context around an incident nobody ' +
      'has noticed yet.'
    )
  }
  return null
}

@Injectable()
export class InstallActivityPruneService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Delete every line older than `days`, and report how many went.
   */
  async prune(days: number, operationalDays: number = OPERATIONAL_DEFAULT_DAYS): Promise<number> {
    const refused = refuseRetention(days) ?? refuseOperationalRetention(operationalDays)
    if (refused) throw new Error(refused)

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.audit_retention', ${`${String(days)} days`}, true)`,
      )
      await tx.execute(
        sql`select set_config('app.operational_retention', ${`${String(operationalDays)} days`}, true)`,
      )
      /**
       * **The `where` duplicates the policy per class, and that is the point.**
       */
      const gone = await tx.delete(installActivity).where(sql`
        case retention_class
          when 'operational' then at < now() - make_interval(days => ${operationalDays})
          else at < now() - make_interval(days => ${days})
        end
      `)
      const count = gone.rowCount ?? 0
      if (count > 0) {
        /**
         * **The account goes in the audit, and in this transaction.**
         */
        const recorded = await recordInstallActivity(tx as unknown as Database, {
          event: 'audit_pruned',
          detail: {
            removed: String(count),
            auditDays: String(days),
            operationalDays: String(operationalDays),
          },
        })
        if (!recorded) {
          throw new Error('the prune was not recorded, so it is not being made')
        }
      }
      return count
    })
  }
}
