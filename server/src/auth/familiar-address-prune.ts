/**
 * Deletes the familiar addresses `familiarTo` no longer counts, daily and at
 * boot, and records each pass that removed any.
 */
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { sql } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { DATABASE } from '../db/db.module.js'
import { recordInstallActivity } from '../install-activity/record.js'
import { FAMILIAR_AT_MOST, FAMILIAR_FOR_DAYS } from './lockout.js'

@Injectable()
export class FamiliarAddressPrune implements OnApplicationBootstrap {
  private readonly log = new Logger(FamiliarAddressPrune.name)

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep()
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'familiar-address-prune' })
  async daily(): Promise<void> {
    await this.sweep()
  }

  /**
   * Deletes every address `familiarTo` would not count at `now`, and answers
   * how many went. Throws, deleting nothing, where the pass cannot be recorded.
   */
  async prune(now: Date = new Date()): Promise<number> {
    return this.db.transaction(async (tx) => {
      // The rank is counted against `held`'s own row, so an address renewed
      // while this waits on it is judged by its renewal.
      const { rows } = await tx.execute<{ user_id: string }>(sql`
        delete from familiar_address held
        where held.last_right_at <= ${now.toISOString()}::timestamptz - make_interval(days => ${FAMILIAR_FOR_DAYS})
          or (
            select count(*) from familiar_address newer
            where newer.user_id = held.user_id
              and (newer.last_right_at > held.last_right_at
                or (newer.last_right_at = held.last_right_at and newer.address < held.address))
          ) >= ${FAMILIAR_AT_MOST}
        returning held.user_id`)
      if (rows.length === 0) return 0
      const recorded = await recordInstallActivity(tx, {
        event: 'familiar_addresses_pruned',
        detail: {
          removed: String(rows.length),
          accounts: String(new Set(rows.map((row) => row.user_id)).size),
          days: String(FAMILIAR_FOR_DAYS),
          mostPerAccount: String(FAMILIAR_AT_MOST),
        },
      })
      if (!recorded) throw new Error('the pruning was not recorded, so it is not being made')
      return rows.length
    })
  }

  /** Never throws: it runs from a lifecycle hook, where an exception stops the application. */
  private async sweep(): Promise<void> {
    try {
      await this.prune()
    } catch (why) {
      this.log.error('familiar address prune failed', why instanceof Error ? why.stack : String(why))
    }
  }
}
