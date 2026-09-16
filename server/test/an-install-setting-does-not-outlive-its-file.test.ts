/**
 * **An install setting a file changes does not reach the next file.**
 *
 * Every file in this tier shares one database, and `install_preferences` is
 * install-wide: nothing scopes a row to the file that wrote it. A setting left
 * where a test put it is one the next file inherits without knowing, and the
 * failure lands wherever the suite happens to be rather than on the file that
 * caused it. -> #122
 *
 * **Asserted across two harnesses rather than by reading `close`.** What is
 * owed is that the second boot sees what the first booted into; a case that
 * checked the restore ran would pass on a restore that put back the wrong thing.
 *
 * **The setting is left behind on purpose and never put back by hand**, which
 * is what makes this about the harness. A case that tidied up after itself
 * would pass with the harness doing nothing at all.
 *
 * **What this does not cover:** a setting leaking between cases *inside* one
 * file, which no harness can reach, and every other table the tier shares.
 */
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installPreferences } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, type Harness } from './app-harness.js'

const runnable = await bootable()

/**
 * The lockout threshold, because it is the one whose leak was reported: at 50
 * an account never shuts, and the file that reads as broken is the one about
 * lockout rather than the one that moved the number.
 */
const KEY = 'auth.lockoutAfterFailures'

/** Both inside the registry's bounds, so the route stores rather than refuses. */
const LEFT_BEHIND = 47
const ALREADY_SET = 40

async function set(harness: Harness, cookie: string, value: number): Promise<void> {
  const put = await fetch(`${harness.base}/api/install/policy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ key: KEY, value }),
  })
  if (!put.ok) throw new Error(`the route refused ${String(value)}: ${await put.text()}`)
}

async function stored(harness: Harness): Promise<unknown> {
  const db = harness.app.get<Database>(DATABASE)
  const [row] = await db
    .select({ value: installPreferences.value })
    .from(installPreferences)
    .where(eq(installPreferences.key, KEY))
    .limit(1)
  return row?.value
}

describe.skipIf(!runnable)('an install setting a test leaves behind', () => {
  it('is put back when the harness closes, without the test asking', async () => {
    const first = await boot()
    const admin = await sharedAdmin(first)
    const atBoot = await stored(first)

    await set(first, admin.cookie, LEFT_BEHIND)
    expect(
      await stored(first),
      'the route stored nothing, so there is no leak here to restore',
    ).toEqual(LEFT_BEHIND)

    // No restore, which is the case: the file ends holding a changed install.
    await first.close()

    const second = await boot()
    try {
      expect(
        await stored(second),
        'a setting one file changed reached the next one',
      ).toEqual(atBoot)
    } finally {
      await second.close()
    }
  }, 180_000)

  /**
   * **The other half of putting it back, and the one a delete would pass.** An
   * install that had already set this key is the ordinary case -- restoring by
   * clearing the table would answer "no row" where the install's own answer was
   * a number, which is a different install rather than the one that booted.
   *
   * Three harnesses because the value has to exist *before* the one under test
   * boots: `held` is what puts it there, `inner` is the file that changes it,
   * and `after` is the next file reading what was left.
   */
  it('puts a setting that was already stored back to the value it had', async () => {
    const held = await boot()
    const admin = await sharedAdmin(held)
    await set(held, admin.cookie, ALREADY_SET)

    const inner = await boot()
    await set(inner, (await sharedAdmin(inner)).cookie, LEFT_BEHIND)
    await inner.close()

    const after = await boot()
    try {
      expect(
        await stored(after),
        'the install came back without the setting it had, rather than with it',
      ).toEqual(ALREADY_SET)
    } finally {
      await after.close()
      // Last, and it is the one that saw an install with no row at all.
      await held.close()
    }
  }, 240_000)
})
