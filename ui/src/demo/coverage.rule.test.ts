/**
 * **Every path the client asks for is one the demo has an answer about.**
 *
 * An answer includes refusing: what this refuses is a path nobody has decided
 * about, because that is the one that reaches a visitor as a screen drawing
 * nothing. A route added to the client is either served by the demo or listed
 * below as deliberately absent, and the listing is what a reviewer reads.
 *
 * This is the whole of what keeps a published demo honest as the application
 * moves, so it fails loudly rather than skipping when it cannot find the client.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = join(HERE, '../api')

/**
 * The first path segment of every route `src/api` asks for.
 *
 * A segment rather than a whole path: the demo routes on the first one, and an
 * interpolated id makes the rest unreadable from source anyway.
 *
 * Two forms, because a narrower sweep missed `/report/languages` and
 * `/report-snippets` both: a literal in the call - where the type argument may
 * nest, as `request<Partial<X> | null>` does - and a module constant holding
 * the path. `client.ts` declares the base
 * and the beacon and calls nothing, so its own constants are not routes a
 * caller asked for.
 */
function askedFor(): ReadonlySet<string> {
  const found = new Set<string>()
  const files = globSync('**/*.{ts,tsx}', { cwd: API, absolute: true }).filter(
    (path) => !/\.(test|stories)\.tsx?$/.test(path),
  )
  expect(files.length, 'no client api source found; has src/api moved?').toBeGreaterThan(20)

  for (const file of files) {
    // **Comments stripped first.** Half of `src/api` documents its own route in
    // a docstring, and one of those names a route that does not exist - so a
    // sweep that reads prose demands a decision about a path nothing calls.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // **Only files that call the client.** `src/api/sentinel/` reaches Azure
    // directly and its URLs are not this application's routes, so sweeping
    // every literal here would demand a decision about `subscriptions`.
    if (!/\b(request|requestBody|requestRaw|requestBlob)\s*(?:<|\()/.test(source)) continue
    for (const match of source.matchAll(
      /\b(?:request|requestBody|requestRaw|requestBlob)\s*(?:<[^()]*>)?\s*\(\s*[`'"]\/([a-z][a-z0-9-]*)/g,
    )) {
      found.add(match[1] ?? '')
    }
    if (file.endsWith('client.ts')) continue
    // Any path literal in the file, not only one in the call. A constant is
    // written `const X = '/x'` or `export const X = '/x'`, sits in an object,
    // or is interpolated - and each spelling was a route the narrower sweep
    // did not see. `client.ts` is skipped: it declares the base every path is
    // joined to, and is not a caller.
    // `/api/...` appears where a caller builds a URL rather than a path - an
    // `<img src>` for an avatar - so the segment after the base is the route.
    for (const match of source.matchAll(
      /['"`]\/(?:api\/)?([a-z][a-z0-9-]{2,})(?=[/'"`?$])/g,
    )) {
      found.add(match[1] ?? '')
    }
  }
  return found
}

/**
 * What a case's own routes are called, swept separately.
 *
 * Checking first segments alone leaves everything under `/cases/{id}/` behind
 * one entry, and that is where the demo's defects were: a bulk edit read as a
 * row id, and four routes answering at any depth.
 */
function caseRoutes(source: string): readonly string[] {
  const found: string[] = []
  for (const match of source.matchAll(/\/cases\/\$\{[^}]*\}\/([a-z][a-z0-9-]*)/g)) {
    found.push(match[1] ?? '')
  }
  return found
}

/** A case route the demo answers, by the name the client asks for it under. */
const CASE_SERVED = new Set(['summary', 'timeline'])

/** A case route the demo refuses, each because the store is not here. */
const CASE_REFUSED = new Set([
  'activity',
  // Rendered as a file by the server.
  'archive',
  // The case socket. The evaluation build substitutes an inert `WebSocket`, so
  // nothing ever opens one.
  'live',
  'attribution',
  'bulk-delete',
  'compliance',
  'conflicts',
  'evidence',
  'imports',
  'reports',
])

/** What the demo answers. Kept beside the handler's own routing table. */
const SERVED = new Set([
  'cases',
  'health',
  'demos',
  'recent-cases',
  'specs',
  'collections',
  'about',
])

/**
 * Asked for by the client, deliberately not answered by the demo.
 *
 * Each of these refuses, which the analyst sees as the application's ordinary
 * refused-write card rather than as a blank screen. Deleting a name from here
 * without serving it is what this test exists to catch.
 */
const REFUSED = new Set([
  // Read the store, so they are not constants a build can capture.
  'regimes',
  'library',
  'report-block-kinds',
  'report-layouts',
  'report-snippets',
  'report',
  // Administration, which a single-visitor demo has no subject for.
  'accounts',
  'appearance',
  'change-password',
  'install',
  'setup',
  // Parsed or rendered server-side.
  'imports',
])

describe('the demo has decided about every route the client calls', () => {
  it('serves or refuses each of them, with none left undecided', () => {
    const undecided = [...askedFor()].filter((segment) => !SERVED.has(segment) && !REFUSED.has(segment))
    expect(
      undecided.sort().join(', '),
      'a client route the demo neither serves nor lists as refused: add it to SERVED once the ' +
        'handler answers it, or to REFUSED to publish the demo without it',
    ).toBe('')
  })

  it('has decided about every route under a case as well', () => {
    const files = globSync('**/*.{ts,tsx}', { cwd: API, absolute: true }).filter(
      (path) => !/\.(test|stories)\.tsx?$/.test(path),
    )
    const asked = new Set(files.flatMap((file) => caseRoutes(readFileSync(file, 'utf8'))))
    expect(asked.size, 'no case routes found; has the path shape changed?').toBeGreaterThan(3)

    const undecided = [...asked].filter(
      (segment) => !CASE_SERVED.has(segment) && !CASE_REFUSED.has(segment),
    )
    expect(
      undecided.sort().join(', '),
      'a route under a case the demo neither serves nor lists as refused',
    ).toBe('')
  })

  it('lists nothing it does not need to', () => {
    const asked = askedFor()
    const stale = [...SERVED, ...REFUSED].filter((segment) => !asked.has(segment))
    expect(stale.sort().join(', '), 'listed here but no longer called by the client').toBe('')
  })
})
