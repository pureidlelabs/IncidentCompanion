/**
 * `GET /api/docs` - the API reference, served entirely from this machine and
 * painted in the app's own colours.
 */
import { Controller, Get, Header, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Public } from '@thallesp/nestjs-better-auth'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { bundlePath } from './spa/spa.module.js'
import type { Env } from './config/env.js'

/** Where `main.ts` mounts `server/vendor/redoc`. */
export const DOCS_ASSETS = '/api/docs/assets'

/** The route itself. Not under `/api`, so it is a page rather than an endpoint. */
export const DOCS_PATH = 'api/docs'

/**
 * What the page permits itself. This, and not the viewer's own configuration,
 * is what stops it calling home.
 */
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // No `frame-ancestors`: a browser ignores it in a `<meta>` policy and logs
  // an error on every load. It is a response-header decision if it ever
  // becomes one.
].join('; ')

/**
 * The app's built stylesheet, read out of `ui/dist/index.html` rather than
 * named - Vite hashes the filename on every build, and a written-down one is
 * wrong quietly: the page still renders, in Redoc's own colours.
 */
export function appStylesheet(bundle: string): string | null {
  try {
    const shell = readFileSync(join(bundle, 'index.html'), 'utf8')
    return /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/.exec(shell)?.[1] ?? null
  } catch {
    return null
  }
}

export function docsPage(stylesheet: string | null): string {
  const themed = stylesheet
    ? `\n    <link rel="stylesheet" href="${stylesheet}" />`
    : ''
  /**
   * `data-theme="light"` is pinned, so the accent the boot script reads off this
   * page resolves to the value chosen for a light ground.
   */
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${POLICY}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IncidentCompanion API</title>${themed}
    <!--
      The stylesheet above is linked for its tokens, not for its grounds: it
      defines the type faces and the accent the boot script reads, and it also
      paints the body from a background token that is dark under a dark theme
      - which would put a dark ground behind Redoc's light panels. Redoc keeps
      its own surfaces, so the page keeps the ground those were chosen
      against. Inline is allowed for styles and not for scripts; see the
      policy above.
    -->
    <style>
      html, body { margin: 0; background: #fff; color: #1f2430; }
    </style>
  </head>
  <body>
    <div id="redoc"></div>
    <script src="${DOCS_ASSETS}/redoc.standalone.js"></script>
    <script src="/${DOCS_PATH}/boot.js"></script>
  </body>
</html>
`
}

/**
 * What starts the viewer, served as a file because `script-src 'self'` forbids
 * an inline script.
 */
export function bootScript(): string {
  return `(function () {
  var root = getComputedStyle(document.documentElement)

  /**
   * A token as an sRGB hex Redoc can manipulate.
   */
  var canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  var pen = canvas.getContext('2d', { willReadFrequently: true })

  function colour(name, fallback) {
    var raw = root.getPropertyValue(name).trim()
    if (!raw) return fallback
    try {
      pen.clearRect(0, 0, 1, 1)
      pen.fillStyle = '#000000'
      pen.fillStyle = raw
      pen.fillRect(0, 0, 1, 1)
      var p = pen.getImageData(0, 0, 1, 1).data
      var hex = '#' + [p[0], p[1], p[2]].map(function (v) {
        return ('0' + v.toString(16)).slice(-2)
      }).join('')
      return /^#[0-9a-f]{6}$/.test(hex) ? hex : fallback
    } catch (whatever) {
      return fallback
    }
  }

  function font(name, fallback) {
    return root.getPropertyValue(name).trim() || fallback
  }

  /**
   * **Ink is derived from its ground, never taken from a second token.**
   */
  function light(hex) {
    var n = parseInt(hex.slice(1), 16)
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
  }
  function inkFor(ground) { return light(ground) > 0.4 ? '#101418' : '#f2f4f7' }
  function darker(a, b) { return light(a) <= light(b) ? a : b }

  /**
   * **Typeface and accent only.
   */
  var theme = {
    colors: { primary: { main: colour('--primary', '#3b5bdb') } },
    typography: {
      fontFamily: font('--font-sans', 'system-ui, sans-serif'),
      headings: { fontFamily: font('--font-sans', 'system-ui, sans-serif') },
      code: { fontFamily: font('--font-mono', 'ui-monospace, monospace') },
    },
  }

  var target = document.getElementById('redoc')

  /**
   * Falls back to Redoc's defaults if the theme throws: a reference in the
   * wrong colours is a complaint, one that does not render is an outage.
   */
  try {
    Redoc.init('/api/openapi.json', { theme: theme }, target)
  } catch (broken) {
    console.warn('the app palette could not be applied, using Redoc defaults', broken)
    Redoc.init('/api/openapi.json', {}, target)
  }
})()
`
}

@Controller()
export class DocsController {
  private readonly log = new Logger(DocsController.name)
  private readonly bundle: string

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    // The same folder the SPA is served from, resolved the one way there is to
    // resolve it - the stylesheet's hashed name lives in its `index.html`.
    this.bundle = bundlePath(config)
  }

  @Public()
  @Get(DOCS_PATH)
  @Header('content-type', 'text/html; charset=utf-8')
  page(): string {
    const sheet = appStylesheet(this.bundle)
    if (!sheet) this.log.warn('no built front end: the reference uses its own palette')
    return docsPage(sheet)
  }

  @Public()
  @Get(`${DOCS_PATH}/boot.js`)
  @Header('content-type', 'text/javascript; charset=utf-8')
  boot(): string {
    return bootScript()
  }
}
