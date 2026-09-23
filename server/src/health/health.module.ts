/**
 * The readiness probe and the two indicators behind it.
 *
 * **A module rather than three more entries in `AppModule`'s controller list**,
 * because the probe now has providers: `TerminusModule` supplies
 * `HealthIndicatorService`, and the probe holds a Redis connection of its own
 * whose shutdown hook has to be owned by something.
 *
 * `AboutController` and the install settings stay where they are - they have
 * no dependencies and answer from configuration alone.
 */
import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { HealthController } from './health.controller.js'
import { ActivityController } from './activity.controller.js'
import { ResourcesController } from './resources.controller.js'
import { PostgresHealth, RedisHealth } from './dependencies.health.js'
import { healthRedisProvider } from './health.redis.js'
import { ArtefactCensus, saysAtStart } from './artefact-census.service.js'
import { EvidenceStore } from '../evidence/store.js'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, ResourcesController, ActivityController],
  providers: [PostgresHealth, RedisHealth, healthRedisProvider, ArtefactCensus, EvidenceStore],
  // Exported for `InstallSettingsController`, which `AppModule` registers.
  exports: [ArtefactCensus],
})
export class HealthModule implements OnApplicationBootstrap {
  constructor(private readonly census: ArtefactCensus) {}

  /**
   * Remove what nothing names, then say what this install expects beside it
   * and cannot find.
   *
   * **Caught rather than propagated.** A sweep or a census that cannot be
   * taken is a missing directory or a database that is not up yet, and
   * neither is a reason to refuse an install that holds every case and every
   * record.
   */
  async onApplicationBootstrap(): Promise<void> {
    const log = new Logger('Evidence')
    try {
      const removed = await this.census.sweep()
      if (removed > 0) log.log(`Removed ${String(removed)} stored artefacts nothing names.`)
    } catch (why) {
      log.warn(`Could not remove the artefacts nothing names: ${String(why)}`)
    }
    let said
    try {
      said = saysAtStart(await this.census.take())
    } catch (why) {
      log.warn(`Could not count the artefacts this install expects: ${String(why)}`)
      return
    }
    if (said) log[said.level](said.message)
  }
}
