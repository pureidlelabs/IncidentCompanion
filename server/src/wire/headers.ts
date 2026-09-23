/**
 * The response headers every answer carries - this process serves the SPA as
 * well as the API, so the policy about what that page may load, whether it may
 * be framed and whether a response may be sniffed is set here.
 */
import helmet from 'helmet'
import type { RequestHandler } from 'express'

import { trustedOrigins } from '../auth/trusted-origins.js'

/**
 * **CSRF is not in here, and that is a measurement rather than an omission.**
 * The session cookie is issued `HttpOnly; Secure; SameSite=Lax`, so a browser
 * will not attach it to a cross-site `POST`, `PUT`, `PATCH` or `DELETE` - the
 * whole classic attack. A double-submit token would be defence in depth on top
 * of that, and it costs every client write a token to carry, so it is a
 * deliberate decision rather than a default. What `Lax` does *not* cover is a
 * state change behind a `GET`, which is why no route may write on one.
 */
export function securityHeaders(baseURL: string, importsFromSentinel: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        /** Bundled files only. No CDN, and nothing evaluated at run time. */
        scriptSrc: ["'self'"],
        /**
         * `'unsafe-inline'` for styles, and only for styles: both tiers set
         * inline `style` attributes for measured geometry, which no nonce
         * reaches.
         */
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        /**
         * **The case socket at each of the install's own origins**, because
         * `'self'` does not admit a WebSocket scheme in every browser.
         *
         * **The two Azure origins are the Sentinel importer's whole
         * transport**, named only where the operator turned it on. The
         * browser signs in to Azure itself and queries ARM directly, so no
         * credential and no outbound call ever reach this server. Exact
         * origins: `assertArmUrl` checks `URL.origin` for the same reason.
         */
        connectSrc: [
          "'self'",
          ...socketOrigins(baseURL),
          ...(importsFromSentinel ? SENTINEL_ORIGINS : []),
        ],
        /** Nothing here is embedded, and nothing embeds this. */
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        /**
         * `blob:` alone, so an embed may be pointed at an object URL and never
         * at a route. It is written for a PDF preview the client does not yet
         * draw; until it does, this admits nothing that exists. -> #372
         */
        objectSrc: ['blob:'],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    /** The edge's to state, from the host it was reached at. -> `transport/design.md` */
    strictTransportSecurity: false,
    /**
     * **`same-origin` rather than the default `no-referrer`.** The SPA's own
     * navigations are same-origin and benefit from carrying a referrer;
     * nothing leaves this origin, so nothing leaks.
     */
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
  })
}

const SENTINEL_ORIGINS = ['https://login.microsoftonline.com', 'https://management.azure.com']

/**
 * The socket spelling of each origin the install answers as its own.
 *
 * An IPv6 literal is left out: a content policy has no syntax for one, and a
 * browser discards the source with a warning.
 */
function socketOrigins(baseURL: string): string[] {
  return trustedOrigins(baseURL, 'production')
    .filter((origin) => !origin.includes('['))
    .map((origin) => origin.replace(/^http/, 'ws'))
}

/**
 * `Cache-Control: no-store` on `/api/`, so a case does not survive in a
 * browser cache.
 *
 * Middleware, so a route's own `@Header` still wins -- which is what keeps the
 * content-addressed avatar cacheable.
 */
export function noStoreOnTheApi(): RequestHandler {
  return (request, response, next) => {
    // **Lower-cased, because Express routes case-insensitively.** `/API/cases`
    // is served by the API and answered without this header otherwise, which
    // puts case data in whatever shared cache sits in front of the app.
    if (request.path.toLowerCase().startsWith('/api/')) {
      response.setHeader('Cache-Control', 'no-store')
    }
    next()
  }
}
