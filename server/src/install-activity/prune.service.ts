/**
 * Deletes audit lines that have outlived the install's retention window.
 *
 * **The only thing in the app that can delete from `install_activity` at
 * all**, and it can only do it inside a transaction that has declared the
 * window - `app.audit_retention`, read by the table's own delete policy. A
 * `DELETE` issued anywhere else matches zero rows, because the setting is
 * unset and every comparison against NULL is NULL.
 *
 * **So the window is enforced by the database, not by this file.** That is the
 * whole reason for the arrangement: a pruner holding an unbounded DELETE is
 * one bad interval away from erasing what it exists to retain, and the shape
 * of that mistake is a variable reading `0 days`. Here the statement is
 * refused rather than obeyed.
 */
import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { recordInstallActivity } from './record.js'
import { OPERATIONAL_FLOOR_DAYS, RETENTION_FLOOR_DAYS, installActivity } from '../db/schema/install-activity.js'

/**
 * How long lines are kept when the install has said nothing.
 *
 * **A year, and the default is "keep" rather than "prune".** An install that
 * has never opened the setting should not be quietly discarding evidence on a
 * schedule nobody chose.
 */
export const RETENTION_DEFAULT_DAYS = 365

/** The setting key, in the shape `InstallPreferencesService` stores. */
export const RETENTION_KEY = 'audit.retentionDays'
export const OPERATIONAL_RETENTION_KEY = 'audit.operationalRetentionDays'

/**
 * **Thirty days, and shorter than the audit's year on purpose.** These
 * lines answer a question about this week - what the importer did, which
 * socket connected - and on a working install they are most of the table.
 */
export const OPERATIONAL_DEFAULT_DAYS = 30

/**
 * Why a proposed retention window was refused, or null when it is allowed.
 *
 * **Exported so the route and the service refuse in the same words**, and
 * because the floor is the one rule an administrator meets rather than reads.
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
 *
 * **A separate floor, and a lower one.** These lines answer a question about
 * this week, so a month is generous and a week is the floor; the audit floor
 * would be a month of socket connections nobody reads. What both refuse is
 * zero - a window of nothing is a pruner erasing as fast as the app writes.
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
   *
   * **`set_config(..., true)` is transaction-local**, so the permission to
   * delete exists for the length of this statement and nowhere else - the same
   * property `caseScoped` relies on, and the reason a leaked connection cannot
   * carry the privilege into the next request.
   *
   * **Refuses below the floor here as well as in the policy.** Two checks
   * because the setting is reachable from anywhere the app can open a
   * transaction and only one of them is in the database; and because a refusal
   * with a sentence is better than a delete that silently matches nothing.
   *
   * **Two windows, one transaction, and each row judged by its own class.**
   * Both settings are declared together because the policy reads both: a
   * transaction that set only one would find every row of the other class
   * failing the floor check and matching nothing - a prune that silently did
   * half its job.
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
       * **The `where` duplicates the policy per class, and that is the
       * point.** Leaving it off makes the policy the statement's only bound,
       * so the day somebody loosens that policy this line becomes
       * `delete from install_activity` with nothing in front of it. Two
       * independent bounds, and `drizzle/enforce-delete-with-where` is the
       * linter saying exactly this.
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
         *
         * A `Logger` line is what stood here, and the shipped stack discards
         * it -- `compose.yaml` sets `logging: driver: "none"` on the app
         * service, deliberately, so the setup token never lands on disk. An
         * account of a deletion written to a log the deployment throws away is
         * written nowhere, and a gap in the audit then cannot be told apart
         * from a period in which nothing happened.
         *
         * **Written on `tx` rather than through the typed facade**, which
         * holds its own handle: a record outside this transaction is one a
         * crash between the two can lose, and this is the one act whose
         * account cannot be reconstructed afterwards -- the lines that would
         * have shown it are the lines it removed.
         *
         * **No actor, because nobody did this.** The schedule did, and an
         * actor invented here would be the attribution mistake the table
         * exists to prevent.
         *
         * **A failed record takes the prune with it.** Rolling back keeps the
         * lines instead of destroying them unaccounted for, which is the safe
         * direction of the two: an install that cannot write its audit should
         * stop deleting from it.
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
