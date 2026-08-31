/**
 * Everything the application needs that the module graph cannot express:
 * headers, compression, the SPA and vendored viewer mounts, the case socket.
 * `main.ts` and the test harness both call it, so both run the same
 * application.
 *
 * Anything needing a real listener stays out - the API reference is built
 * after `listen`, from the routes the adapter actually mounted.
 */
import type { NestExpressApplication } from '@nestjs/platform-express'

import { LiveGateway } from './live/live.gateway.js'
import compression from 'compression'

import { noStoreOnTheApi, securityHeaders } from './wire/headers.js'

/**
 * Applies the platform layer to a built application, before `init`.
 *
 * Registration order is load-bearing: headers go on ahead of the static
 * mounts, because the SPA is served by Express middleware that runs before
 * Nest's router and would otherwise get no policy.
 */
export function applyPlatform(
  app: NestExpressApplication,
  options: { bundle?: string; vendor?: string } = {},
): void {
  /**
   * Compression, registered before the static mounts so it also covers the SPA
   * bundle - the largest thing this server sends. It buys bytes, not
   * milliseconds; on loopback it is a net loss.
   */
  app.use(compression({ threshold: 1024 }))

  app.use(securityHeaders())
  app.use(noStoreOnTheApi())

  if (options.bundle) app.useStaticAssets(options.bundle, { index: false })
  if (options.vendor) {
    app.useStaticAssets(options.vendor, { prefix: '/api/docs/assets', index: false })
  }

  /**
   * **The socket is attached to the HTTP server, below Nest.** The upgrade for
   * `/api/cases/:id/live` never reaches a route, so there is nothing to hang a
   * controller on - and leaving it unhandled is worse than absent: an
   * unanswered upgrade holds a slot in the browser's connection pool until
   * nothing else loads.
   */
  app.get(LiveGateway).attach(app.getHttpServer())
}
