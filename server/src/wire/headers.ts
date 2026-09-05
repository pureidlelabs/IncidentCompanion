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
         * **`wss:` because the case socket is the product.**
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
     * **No HSTS.**
     */
    strictTransportSecurity: false,
    /**
     * **`same-origin` rather than the default `no-referrer`.**
     */
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
  })
}

/**
 * `Cache-Control: no-store` on `/api/`, so a case does not survive in a
 * browser cache.
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
