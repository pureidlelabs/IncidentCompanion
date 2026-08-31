import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **The kit ships without this app's screens.**
 *
 * Imagine `components/ui/` published as a separate package: anything in it
 * reaching into `@/api`, `@/fixtures` or another app-tier module fails that
 * test, because none of that exists outside this repository. `AsyncBoundary`
 * used to decide whether an error was a refusal by checking `error instanceof
 * ApiError` -- a property of *this app's* HTTP client rather than of the
 * error -- which is exactly the shape this refuses.
 *
 * **A ratchet, not an audit.** It was green the day it was written: nothing
 * in the kit's source reached past it any more. It stops the next one.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** `@/blocks`, `@/features`, `@/screens` and the rest read the same way. */
const APP_TIER = /from\s*['"]@\/(api|fixtures|features|screens|blocks)(?:\/[^'"]*)?['"]/

describe('the kit publishes on its own', () => {
  // Stories are the kit's documentation pages, not shipped code, and the
  // established exemption in kit-owns-the-primitives.rule.test.ts already
  // lets them reach for a real fixture to render a real state. Tests
  // construct their own fixtures instead of reaching for the app's.
  const modules = readdirSync(HERE).filter(
    (name) => name.endsWith('.tsx') && !name.includes('.stories.') && !name.includes('.test.'),
  )

  it('finds kit modules to read', () => {
    expect(modules.length).toBeGreaterThan(50)
  })

  it('imports nothing app-specific', () => {
    const outside = modules
      .filter((name) => APP_TIER.test(readFileSync(join(HERE, name), 'utf8')))
      .sort()

    expect(
      outside,
      'a kit module reaching into an app-tier import. Give the kit an ' +
        'interface, a prop, or a small type it owns instead, and let the app ' +
        'supply the answer.',
    ).toEqual([])
  })
})
