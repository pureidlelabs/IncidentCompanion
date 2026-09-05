/**
 * Runs the audit prune on a schedule, and at boot.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { InstallPreferencesService } from '../preferences/install.service.js'
import { InstallActivityPruneService } from '../install-activity/prune.service.js'

@Injectable()
export class InstallActivityPruneSchedule implements OnApplicationBootstrap {
  private readonly log = new Logger(InstallActivityPruneSchedule.name)

  constructor(
    private readonly prune: InstallActivityPruneService,
    private readonly settings: InstallPreferencesService,
  ) {}

  /**
   * **After the application is up, not during module init.**
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.sweep('at boot')
  }

  /**
   * **Daily, at 03:00 in the host's zone.**
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async daily(): Promise<void> {
    await this.sweep('on schedule')
  }

  /**
   * **Never throws.**
   */
  private async sweep(when: string): Promise<void> {
    try {
      const held = await this.settings.all()
      const days = held['audit.retentionDays']
      if (typeof days !== 'number') return
      const gone = await this.prune.prune(days)
      if (gone > 0) {
        this.log.log(`pruned ${String(gone)} audit line(s) ${when}, keeping ${String(days)} days`)
      }
    } catch (why) {
      this.log.error(
        `audit prune failed ${when}`,
        why instanceof Error ? why.stack : String(why),
      )
    }
  }
}
