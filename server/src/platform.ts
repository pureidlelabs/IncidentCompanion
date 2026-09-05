/**
 * Everything the application needs that the module graph cannot express:
 * headers, compression, the SPA and vendored viewer mounts, the case socket.
 */
import type { NestExpressApplication } from '@nestjs/platform-express'

import { LiveGateway } from './live/live.gateway.js'
import compression from 'compression'

import { noStoreOnTheApi, securityHeaders } from './wire/headers.js'

/**
 * Applies the platform layer to a built application, before `init`.
 */
export function applyPlatform(
  app: NestExpressApplication,
  options: { bundle?: string; vendor?: string } = {},
): void {
  /**
   * Compression, registered before the static mounts so it also covers the SPA
   * bundle - the largest thing this server sends.
   */
  app.use(compression({ threshold: 1024 }))

  app.use(securityHeaders())
  app.use(noStoreOnTheApi())

  if (options.bundle) app.useStaticAssets(options.bundle, { index: false })
  if (options.vendor) {
    app.useStaticAssets(options.vendor, { prefix: '/api/docs/assets', index: false })
  }

  /**
   * **The socket is attached to the HTTP server, below Nest.**
   */
  app.get(LiveGateway).attach(app.getHttpServer())
}
