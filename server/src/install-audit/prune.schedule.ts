/**
 * Runs the audit prune on a schedule, and at boot.
 *
 * **Both, because either alone has a hole.** A cron alone never fires on an
 * install that is restarted more often than it runs; a boot sweep alone never
 * fires on one that is never restarted - which is the shape a self-hosted
 * appliance actually takes. Together the window between prunes is bounded by
 * whichever comes first.
 *
 * **`@nestjs/schedule` rather than a `setInterval`.** It is first-party, it
 * survives shutdown properly, and a hand-rolled timer is one more thing that
 * has to be got right about clocks - which the standing rule about leaning on
 * libraries exists for.
 *
 * **In `install-audit` rather than beside the pruner, because the pruner's own
 * folder cannot reach a setting.** `preferences` imports `install-activity` -
 * switching a regime records an audit line - so an edge back is a cycle, which
 * the layering test refused before anybody argued. This folder already sits
 * above both, for the same reason the reader does.
 *
 * **It runs as `ic_app`, and that is the design rather than an oversight.**
 * The table's delete policy admits any role *for rows past the declared
 * window*, so the app role can prune and cannot do anything else - no fourth
 * role, no DDL credential on a timer. `prune.test.ts` proves both halves.
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
   * **After the application is up, not during module init.** A prune that runs
   * while the container is still wiring competes with the schema push and the
   * seeder for the same connections, and it is not urgent enough to.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.sweep('at boot')
  }

  /**
   * **Daily, at 03:00 in the host's zone.** The window is a year by default,
   * so the frequency decides how *stale* the tail is rather than how much is
   * kept - once a day makes the log at most a day past its window, which is
   * well inside anything a retention policy means.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async daily(): Promise<void> {
    await this.sweep('on schedule')
  }

  /**
   * **Never throws.** A failed prune is a log that is too long, which is a
   * different thing from an install that will not start - and this runs from a
   * lifecycle hook, where an exception takes the application with it.
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
