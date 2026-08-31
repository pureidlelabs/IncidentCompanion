/**
 * An interactive shell with the application's own container: `npm run repl`.
 *
 * Reach case data through the services rather than `psql`: they apply the
 * row-level scope a request would, and an unscoped query answers zero rows
 * rather than erroring.
 *
 * ```
 * > await get(CasesService).list()
 * > methods(ComplianceController)
 * > await get(LibraryService).builtIns()
 * ```
 *
 * **No HTTP server.** `repl()` builds an application *context*, so nothing
 * binds a port and `LiveGateway` never receives a server to upgrade - anything
 * reached through a socket is unreachable from here.
 *
 * **It does not seed**, and neither does starting the server: that is the
 * `seed` one-shot's job. A seeder resolved from this container reseeds for
 * real, against whatever database the environment points at.
 */
import { repl } from '@nestjs/core'

import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  await repl(AppModule)
}

void bootstrap()
