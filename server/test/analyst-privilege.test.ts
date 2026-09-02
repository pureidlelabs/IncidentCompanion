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

const runnable = await bootable()

/**
 * Every route an analyst is refused, as measured.
 *
 * **A list rather than a metadata read.** Reflecting `@Roles` off the handler
 * would make this test agree with whatever the code says, which is not a test -
 * it would pass just as happily on the day a route lost its marking. Changing
 * what an analyst may do should cost a line here and show up in a diff.
 */
const REFUSED_TO_AN_ANALYST: readonly string[] = [
  'GET /api/accounts',
  // **Which organisations the install holds is the management plane**, and
  // an analyst who could merge two customers would move every case from one
  // to the other. The list is refused with them: it names every organisation
  // the install works for, including those an analyst reaches no case of.
  'DELETE /api/customers/{id}',
  'GET /api/customers',
  'PATCH /api/customers/{id}',
  'POST /api/customers',
  'POST /api/customers/{id}/merge',
  // Making a group is the same decision one step earlier: an analyst who
  // could make one could then put themselves in it.
  'GET /api/groups',
  'POST /api/groups',
  // **Granting reach is managing the install, and this line is the decision.**
  // An analyst who could put themselves in a group would reach every
  // customer, which is the whole of the access model handed away in one call.
  'DELETE /api/groups/{groupId}/customers/{customerId}',
  'DELETE /api/groups/{groupId}/members/{userId}',
  'POST /api/groups/{groupId}/customers',
  'POST /api/groups/{groupId}/members',
  // Reading the audit is an administrator's, and this line is what says
  // so - the route being `@AdminOnly()` is the code, and this is the
  // decision showing up in a diff.
  'GET /api/install/activity',
  // Reading the retention window is an administrator's, and changing it is
  // the one setting whose change destroys evidence.
  'GET /api/install/audit/retention',
  'PUT /api/install/audit/retention',
  'GET /api/install/policy',
  'PUT /api/install/policy',
  'POST /api/accounts',
  'POST /api/accounts/{username}/reset',
  // The only door a role changes through: Better Auth's own admin routes
  // are in `disabledPaths`, because a guard outside the endpoint has to
  // guess the body shape and every path that acts.
  'POST /api/accounts/{username}/role',
  'POST /api/accounts/{username}/disable',
  'POST /api/accounts/{username}/enable',
  'POST /api/regimes/{name}',
  // A pack changes what every analyst's reports print, in a language most
  // reviewers cannot proofread -- so it is the install's decision. Reading the
  // list is deliberately *not* here: every report form needs it.
  'PUT /api/report/languages',
  'DELETE /api/report/languages/{code}',
  // Replacing a whole library kind can **disable a shipped built-in**, which
  // no per-entry route offers -- `canDelete` refuses a built-in outright. So
  // this is the one library door that grants authority a loop of the others
  // does not, and it changes what every analyst is offered install-wide.
  // The per-entry writes stay open to an analyst.
  'PUT /api/library/{slug}',
]

describe.skipIf(!runnable)('an analyst who is not an administrator', () => {
  let harness: Harness
  let analyst: Persona
  let measured: string[]

  beforeAll(async () => {
    harness = await boot()
    // The admin is arranged first so the analyst cannot land in the install's
    // first-account slot. Asserting both roles below is what stops this file
    // silently testing one administrator against another.
    const admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    expect(admin.role).toBe('admin')

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
    expect([...measured].sort()).toEqual([...REFUSED_TO_AN_ANALYST].sort())
  })
})
