/**
 * The API reference page, and the one rule it exists to keep.
 *
 * **Core makes no outbound request and loads nothing from a CDN.** Every viewer
 * tried here breaks that by default - Scalar called five external hosts,
 * Swagger UI posts the spec to `validator.swagger.io` - so the page is only
 * safer than the library if something checks it. This is that check.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DOCS_ASSETS, appStylesheet, bootScript, docsPage } from './docs.controller.js'

const SHEET = '/assets/index-BmK5aacp.css'
const page = docsPage(SHEET)
const boot = bootScript()

describe('what the API reference page loads', () => {
  /**
   * The assertion is on the *absence of an origin*, not on a list of known
   * hosts: each viewer ships its own, and a rule written against one hostname
   * passes the day it moves.
   */
  it.each([
    ['the page', page],
    ['the boot script', boot],
  ])('%s carries no protocol-qualified URL', (_what, text) => {
    expect(text).not.toMatch(/https?:\/\//)
  })

  it('carries no protocol-relative URL either', () => {
    expect(page).not.toMatch(/(src|href)\s*=\s*"\/\//)
  })

  it('loads the viewer from this server', () => {
    expect(page).toContain(`src="${DOCS_ASSETS}/redoc.standalone.js"`)
  })

  it('points the reference at this server\u2019s own document', () => {
    expect(boot).toContain("'/api/openapi.json'")
  })

  it('names the document by a relative path, not by host and port', () => {
    expect(boot).not.toMatch(/'[^']*127\.0\.0\.1/)
  })

  it('is a complete HTML document rather than a fragment', () => {
    expect(page.trimStart().startsWith('<!doctype html>')).toBe(true)
    expect(page).toContain('</html>')
  })
})

describe('wearing the app\u2019s own colours', () => {
  it('links the built stylesheet, so the tokens are defined on this page', () => {
    expect(page).toContain(`<link rel="stylesheet" href="${SHEET}" />`)
  })

  /**
   * **Ordinary, not an error.** The API serves without a front end, and the
   * reference then uses the viewer's palette rather than refusing to draw.
   */
  it('draws without a stylesheet when there is no build', () => {
    const bare = docsPage(null)
    expect(bare).toContain('<div id="redoc">')
    expect(bare).not.toContain('rel="stylesheet"')
  })

  /**
   * **Read from the running page, never copied here.** Duplicating the token
   * values would be a second palette that drifts the first time one is tuned -
   * and reading them is what makes the reference follow light and dark without
   * knowing they exist.
   */
  it.each([
    ['--primary', '--primary'],
    ['--font-sans', '--font-sans'],
    ['--font-mono', '--font-mono'],
  ])('takes %s from the page rather than a literal', (_what, token) => {
    expect(boot).toContain(token)
  })

  /**
   * **The faces and the accent, and no surface.** Three rounds of repainting
   * Redoc's grounds from `tokens.css` each uncovered the next unreadable pair
   * - the panel, the sample box, the tab strip, the servers overlay - because
   * its palette is one coherent set of forty values chosen against each
   * other. Six of them replaced leaves the rest paired with grounds that no
   * longer exist.
   */
  it.each([
    ['the right panel', 'rightPanel'],
    ['the sidebar', 'sidebar'],
    ['code blocks', 'codeBlock'],
    ['the schema rows', 'schema'],
  ])('leaves %s to Redoc rather than repainting it', (_what, key) => {
    expect(boot).not.toContain(`${key}:`)
  })

  /**
   * **Through a canvas, because the tokens are `oklch()`** and Redoc's colour
   * library lightens and darkens what it is given without understanding that
   * function. Assigning to `fillStyle` makes the browser resolve any colour it
   * knows and hands back a hex string anything can parse.
   */
  it('resolves a token to a colour the viewer can manipulate', () => {
    expect(boot).toContain('fillStyle')
  })

  /** A token that is absent or unparseable must not paint the page black. */
  it('falls back rather than trusting whatever the canvas kept', () => {
    expect(boot).toContain('fallback')
  })
})

describe('finding the built stylesheet', () => {
  const shellWith = (html: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'ic-docs-'))
    writeFileSync(join(dir, 'index.html'), html)
    return dir
  }

  /**
   * **Read out of `index.html` rather than named.** Vite hashes the filename
   * on every build, so anything writing it down is wrong at the next build -
   * and wrong quietly: the page still renders, in the viewer's own colours.
   */
  it('reads the hashed name Vite emitted', () => {
    const dir = shellWith(
      '<!doctype html><html><head><link rel="stylesheet" crossorigin ' +
        'href="/assets/index-BmK5aacp.css"></head><body></body></html>',
    )
    expect(appStylesheet(dir)).toBe('/assets/index-BmK5aacp.css')
  })

  it('answers nothing when the shell has no stylesheet', () => {
    expect(appStylesheet(shellWith('<!doctype html><html><body></body></html>'))).toBeNull()
  })

  it('answers nothing when there is no build at all', () => {
    expect(appStylesheet('/nowhere/at/all/definitely-not-here')).toBeNull()
  })
})

/**
 * **The static page passing is not the same as the live page behaving.**
 * Measured in a browser: Scalar, with its bundle served locally and no external
 * URL in its HTML, still reached `api.scalar.com` and `fonts.scalar.com`. The
 * policy is what turns "we asked it not to" into "it cannot".
 */
describe('the content security policy', () => {
  const policy = /content="([^"]*default-src[^"]*)"/.exec(page)?.[1] ?? ''

  it.each([
    ['default-src', "default-src 'self'"],
    ['scripts, so no bundle can be pulled from a CDN', "script-src 'self'"],
    ['connections, which is what refuses a call home', "connect-src 'self'"],
    ['fonts, which is what refuses a hosted webfont', "font-src 'self' data:"],
  ])('confines %s', (_what, directive) => {
    expect(policy).toContain(directive)
  })

  /**
   * `'unsafe-inline'` is granted to styles because these bundles inject their
   * own, and to nothing else - which is precisely why the boot script is a
   * route rather than an inline `<script>`.
   */
  it('never grants unsafe-inline to scripts', () => {
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(/script-src [^;]*unsafe-inline/.test(policy)).toBe(false)
  })

  it('starts the viewer from a served file, not from an inline script', () => {
    expect(page).toContain('src="/api/docs/boot.js"')
    expect(page).not.toMatch(/<script\s*>[^<]/i)
  })
})
