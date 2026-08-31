/**
 * The response headers every answer carries - this process serves the SPA as
 * well as the API, so the policy about what that page may load, whether it may
 * be framed and whether a response may be sniffed is set here.
 */
import helmet from 'helmet'
import type { RequestHandler } from 'express'

/**
 * **CSRF is not in here, and that is a measurement rather than an omission.**
 * The session cookie is issued `HttpOnly; Secure; SameSite=Lax`, so a browser
 * will not attach it to a cross-site `POST`, `PUT`, `PATCH` or `DELETE` - the
 * whole classic attack. A double-submit token would be defence in depth on top
 * of that, and it costs every client write a token to carry, so it is a
 * deliberate decision rather than a default. What `Lax` does *not* cover is a
 * state change behind a `GET`, which is why no route may write on one.
 */
export function securityHeaders(): RequestHandler {
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
         * **`wss:` because the case socket is the product.** Presence, claims
         * and the repaint all ride it, and `connect-src 'self'` alone does not
         * admit a WebSocket scheme in every browser.
         *
         * **The two Azure origins are the Sentinel importer's whole
         * transport.** The browser signs in to Azure itself and queries ARM
         * directly, so no credential and no outbound call ever reach this
         * server -- which is the point of that design and the reason these
         * belong here rather than in a server-side proxy. Core owns the
         * allowlist because there is no plugin framework left to declare an
         * origin, and the shipped wizard was refused by this app's own policy
         * until they were listed.
         *
         * Exact origins, never a wildcard: `assertArmUrl` checks `URL.origin`
         * for the same reason, and `https://management.azure.com.evil.test`
         * is a prefix match away from a hostile host.
         */
        connectSrc: [
          "'self'",
          'wss:',
          'https://login.microsoftonline.com',
          'https://management.azure.com',
        ],
        /** Nothing here is embedded, and nothing embeds this. */
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        /**
         * `blob:` alone, because the report's PDF preview is an `<object>`
         * pointed at an object URL, and nothing embeds a route directly.
         */
        objectSrc: ['blob:'],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    /**
     * **No HSTS.** The app binds loopback and mints its own certificate; an
     * HSTS header would pin a browser to https for `127.0.0.1` across every
     * other project on the machine, which is somebody else's problem to
     * discover.
     */
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

/**
 * `Cache-Control: no-store` on `/api/`, so a case does not survive in a
 * browser cache.
 *
 * Middleware, so a route's own `@Header` still wins -- which is what keeps the
 * content-addressed avatar cacheable.
 */
export function noStoreOnTheApi(): RequestHandler {
  return (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      response.setHeader('Cache-Control', 'no-store')
    }
    next()
  }
}
