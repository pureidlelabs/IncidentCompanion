import { applyPlatform } from './platform'
import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'

import { AppModule } from './app.module'
import { loadEnv } from './config/env'
import { tryOpenApiDocument } from './openapi'
import { OpenApiStore } from './openapi.controller'
import { InstallActivityService } from './install-activity/install-activity.service.js'
import { SetupController } from './auth/setup.controller'
import { bundlePath } from './spa/spa.module'

import { join } from 'node:path'

/**
 * Boot: build the application, apply the platform layer, then listen.
 *
 * Speaks plaintext and binds `0.0.0.0`. Neither is the exposure it looks
 * like - the service publishes no port, so the socket exists only on the
 * compose network, and nginx terminates TLS in front of it.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv()

  // `bodyParser: false` is required by the Better Auth integration, not a
  // preference: Better Auth's handler reads the raw request stream, and Nest's
  // parser having already consumed it leaves the handler with an empty body -
  // which surfaces as a sign-in that fails validation rather than as an error
  // naming the parser. The bridge re-adds parsing for everything else.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })

  // Shutdown hooks are opt-in, and DbModule closes the pool in one.
  app.enableShutdownHooks()

  /**
   * The platform layer the test harness applies too, so both run the same
   * application. -> `platform.ts`
   *
   * Two hops to `server/`, because swc compiles this to `dist/src/main.js`.
   */
  applyPlatform(app, {
    bundle: bundlePath(app.get(ConfigService)),
    vendor: join(__dirname, '..', '..', 'vendor', 'redoc'),
  })


  /**
   * **Built here because it needs the whole application**, and stored rather
   * than served from here: the route is a controller, so it is inside Nest's
   * router rather than behind the SPA catch-all. -> `openapi.controller.ts`
   */
  const document = tryOpenApiDocument(app, new Logger('OpenApi'))
  if (document) app.get(OpenApiStore).set(document)

  /**
   * Called here rather than from a lifecycle hook: the token must exist before
   * anything can reach `/api/setup`, and only the serving process may mint
   * one - every other process building this module runs a hook, the one-shot
   * `seed` entry included.
   */
  await app.get(SetupController).mintIfUnclaimed()

  await app.listen(env.PORT, '0.0.0.0')

  /**
   * The one line that means "bound", printed on every start. Nest's own
   * `successfully started` is logged at the end of `init`, before the socket
   * is listening and after the bootstrap hooks, so it cannot answer this.
   *
   * Prints the address it binds, never the one the analyst types: the browser
   * meets nginx on https, and this process cannot see the proxy in front of
   * it.
   */
  new Logger('Bootstrap').log(`Serving on http://0.0.0.0:${String(env.PORT)}/`)

  /**
   * **After `listen`, so it records a start that happened.** A line written
   * before the socket is bound describes an install that may still fail to
   * come up, and an audit recording intentions is one nobody can rely on.
   *
   * It bounds a gap: a quiet period in the log with a start at the end of it
   * is a restart, and one without is a question. -> 800-92's operational
   * actions.
   */
  await app.get(InstallActivityService).record({
    event: 'install_started',
    detail: { port: String(env.PORT) },
  })
}

void bootstrap()
