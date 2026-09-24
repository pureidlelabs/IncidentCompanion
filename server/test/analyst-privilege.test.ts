/**
 * **What an ordinary analyst is refused, recorded rather than assumed.**
 *
 * The `admin` role is deliberately narrow here: it gates managing accounts and
 * the install's own settings, and it is *not* a superuser over case data - an
 * analyst can do the investigation work. That makes the interesting assertion
 * two-sided, and only one side is obvious:
 *
 * - a route that should be privileged must refuse an analyst, and
 * - a route that should not be must **not** refuse one, or the role has quietly
 *   become a superuser and every analyst is locked out of their own work.
 *
 * The second is the one nobody writes by hand, and it is the one that fails
 * loudly if `@Roles` is ever attached to a controller instead of a handler.
 *
 * **Safe against the writes.** Roles are checked in a guard, so a refused
 * request never reaches a handler, and the ids name nothing any fixture made.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  operations,
  sharedAdmin,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'
import { MANAGEMENT_PLANE } from './management-plane.js'

const runnable = await bootable()

describe.skipIf(!runnable)('an analyst who is not an administrator', () => {
  let harness: Harness
  let analyst: Persona
  let administrator: Persona
  let measured: string[]

  beforeAll(async () => {
    harness = await boot()
    // The admin is arranged first so the analyst cannot land in the install's
    // first-account slot. Asserting both roles below is what stops this file
    // silently testing one administrator against another.
    administrator = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    expect(administrator.role).toBe('admin')

    measured = []
    for (const one of operations(harness.document)) {
      const response = await fetch(`${harness.base}${one.path}`, {
        method: one.method,
        headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
        body: ['GET', 'DELETE'].includes(one.method) ? undefined : '{}',
      })
      if (response.status === 403) measured.push(`${one.method} ${one.template}`)
    }
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('is signed in as an analyst rather than an administrator', () => {
    expect(analyst.role).toBe('analyst')
  })

  it('is refused exactly the routes that are privileged, and no others', () => {
    expect([...measured].sort()).toEqual([...MANAGEMENT_PLANE].sort())
  })

  /**
   * **The control for the list above.** A guard that refused everybody would
   * satisfy it perfectly: the analyst would be refused every route named, and
   * nothing here would notice that the administrator was too.
   *
   * Two routes rather than all of them, because the list above is a set
   * comparison and this is a direction check -- and these two are the ones
   * whose gate is newest.
   */
  it.each(['/api/health/activity', '/api/health/resources', '/api/settings'])(
    'answers an administrator at %s',
    async (path) => {
      const response = await fetch(`${harness.base}${path}`, {
        headers: { cookie: administrator.cookie },
      })

      expect(response.status, 'the gate refuses the people it is meant to admit').toBe(200)
    },
  )
})
